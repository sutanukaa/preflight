import { resolveTxt, resolveMx, resolve4 } from 'node:dns/promises';
import {
  parseSpfRecord,
  parseDmarcRecord,
  type FindingCheck,
  type EvidenceItem
} from '@preflight/shared';

export interface DnsResolverInterface {
  resolveTxt(name: string): Promise<string[]>;
  resolveMx(name: string): Promise<Array<{ exchange: string; priority: number }>>;
  resolveA(name: string): Promise<string[]>;
}

export class DefaultDnsResolver implements DnsResolverInterface {
  async resolveTxt(name: string): Promise<string[]> {
    try {
      const records = await resolveTxt(name);
      return records.map(parts => parts.join(''));
    } catch {
      return [];
    }
  }

  async resolveMx(name: string): Promise<Array<{ exchange: string; priority: number }>> {
    try {
      return await resolveMx(name);
    } catch {
      return [];
    }
  }

  async resolveA(name: string): Promise<string[]> {
    try {
      return await resolve4(name);
    } catch {
      return [];
    }
  }
}

export class DnsInspectionService {
  constructor(private resolver: DnsResolverInterface = new DefaultDnsResolver()) {}

  setResolver(resolver: DnsResolverInterface) {
    this.resolver = resolver;
  }

  /**
   * Evaluates recursive SPF lookup budget (RFC 7208 10-lookup limit).
   * Traverses includes, tracking loops, void lookups, and lookups consumed.
   */
  async calculateRecursiveSpfLookups(
    domain: string,
    visited: Set<string> = new Set()
  ): Promise<{
    lookups: number;
    voidLookups: number;
    hasLoop: boolean;
    recordsExamined: string[];
    errors: string[];
  }> {
    const cleanDomain = domain.toLowerCase().trim();
    if (visited.has(cleanDomain)) {
      return { lookups: 0, voidLookups: 0, hasLoop: true, recordsExamined: [], errors: [`SPF include loop detected at: ${cleanDomain}`] };
    }
    visited.add(cleanDomain);

    const txtRecords = await this.resolver.resolveTxt(cleanDomain);
    const spfRecords = txtRecords.filter(r => r.toLowerCase().startsWith('v=spf1'));

    if (spfRecords.length === 0) {
      return { lookups: 1, voidLookups: 1, hasLoop: false, recordsExamined: [], errors: [`Void SPF lookup: no SPF record found at ${cleanDomain}`] };
    }

    let lookups = 0;
    let voidLookups = 0;
    let hasLoop = false;
    const errors: string[] = [];
    const recordsExamined: string[] = [spfRecords[0]];

    const parsed = parseSpfRecord(spfRecords[0]);
    errors.push(...parsed.syntaxErrors);

    for (const mech of parsed.mechanisms) {
      if (mech.requiresDnsLookup) {
        lookups++;
        if (mech.type === 'include' && mech.value) {
          const sub = await this.calculateRecursiveSpfLookups(mech.value, new Set(visited));
          lookups += sub.lookups;
          voidLookups += sub.voidLookups;
          if (sub.hasLoop) hasLoop = true;
          recordsExamined.push(...sub.recordsExamined);
          errors.push(...sub.errors);
        } else if (mech.type === 'redirect' && mech.value) {
          const sub = await this.calculateRecursiveSpfLookups(mech.value, new Set(visited));
          lookups += sub.lookups;
          voidLookups += sub.voidLookups;
          if (sub.hasLoop) hasLoop = true;
          recordsExamined.push(...sub.recordsExamined);
          errors.push(...sub.errors);
        }
      }
    }

    return { lookups, voidLookups, hasLoop, recordsExamined, errors };
  }

  /**
   * Runs complete DNS inspection for a domain and optional DKIM selector.
   */
  async runDnsChecks(domain: string, selector?: string): Promise<FindingCheck[]> {
    const now = new Date().toISOString();
    const checks: FindingCheck[] = [];

    // 1. SPF Record & Policy
    const txtRecords = await this.resolver.resolveTxt(domain);
    const spfRecords = txtRecords.filter(r => r.toLowerCase().startsWith('v=spf1'));

    const spfEvidence: EvidenceItem[] = [
      {
        id: 'ev_spf_' + Math.random().toString(36).substring(2, 9),
        source: 'dns',
        name: `TXT ${domain}`,
        observedValue: spfRecords,
        expectedValue: 'Single v=spf1 policy',
        observedAt: now
      }
    ];

    if (spfRecords.length === 0) {
      checks.push({
        id: 'chk_spf_rec_' + Math.random().toString(36).substring(2, 9),
        key: 'spf_record',
        status: 'fail',
        severity: 'critical',
        summary: 'No SPF record published',
        explanation: `No TXT record starting with 'v=spf1' was found at ${domain}. Receiving mail servers cannot verify legitimate senders.`,
        evidence: spfEvidence,
        recommendation: `Publish a TXT record for ${domain} with: v=spf1 ~all`,
        checkedAt: now,
        confidence: 1
      });
    } else if (spfRecords.length > 1) {
      checks.push({
        id: 'chk_spf_rec_' + Math.random().toString(36).substring(2, 9),
        key: 'spf_record',
        status: 'fail',
        severity: 'critical',
        summary: 'Multiple SPF records published',
        explanation: `Found ${spfRecords.length} SPF records. RFC 7208 Section 3.2 explicitly states a domain must not publish multiple SPF records; mail servers evaluate this as PermError.`,
        evidence: spfEvidence,
        recommendation: 'Merge all SPF directives into a single TXT record and remove duplicate records.',
        checkedAt: now,
        confidence: 1
      });
    } else {
      const parsed = parseSpfRecord(spfRecords[0]);
      if (parsed.syntaxErrors.length > 0) {
        checks.push({
          id: 'chk_spf_rec_' + Math.random().toString(36).substring(2, 9),
          key: 'spf_record',
          status: 'warning',
          severity: 'high',
          summary: 'SPF record syntax warnings',
          explanation: `SPF record found but contains syntax warnings: ${parsed.syntaxErrors.join('; ')}`,
          evidence: spfEvidence,
          recommendation: 'Correct the SPF syntax to prevent receiver PermErrors.',
          checkedAt: now,
          confidence: 0.95
        });
      } else {
        checks.push({
          id: 'chk_spf_rec_' + Math.random().toString(36).substring(2, 9),
          key: 'spf_record',
          status: 'pass',
          severity: 'info',
          summary: 'SPF record published and valid',
          explanation: 'Exactly one syntactically valid SPF policy was found.',
          evidence: spfEvidence,
          checkedAt: now,
          confidence: 1
        });
      }
    }

    // 2. SPF Lookup Budget
    if (spfRecords.length === 1) {
      const budget = await this.calculateRecursiveSpfLookups(domain);
      const budgetEvidence: EvidenceItem[] = [
        {
          id: 'ev_spf_budget_' + Math.random().toString(36).substring(2, 9),
          source: 'derived',
          name: 'SPF DNS Mechanism Counter',
          observedValue: {
            totalLookups: budget.lookups,
            voidLookups: budget.voidLookups,
            hasLoop: budget.hasLoop,
            recordsExamined: budget.recordsExamined
          },
          expectedValue: 'Maximum 10 DNS lookups',
          observedAt: now
        }
      ];

      if (budget.hasLoop) {
        checks.push({
          id: 'chk_spf_loop_' + Math.random().toString(36).substring(2, 9),
          key: 'spf_lookup_budget',
          status: 'fail',
          severity: 'critical',
          summary: 'SPF infinite loop detected',
          explanation: 'SPF evaluation encountered an infinite loop across includes or redirects. Receivers evaluate this as PermError.',
          evidence: budgetEvidence,
          recommendation: 'Remove recursive or self-referential include directives in your SPF records.',
          checkedAt: now,
          confidence: 1
        });
      } else if (budget.lookups > 10) {
        checks.push({
          id: 'chk_spf_budget_' + Math.random().toString(36).substring(2, 9),
          key: 'spf_lookup_budget',
          status: 'fail',
          severity: 'critical',
          summary: `SPF lookup limit exceeded (${budget.lookups}/10)`,
          explanation: `Your SPF record requires ${budget.lookups} DNS lookups, exceeding the RFC 7208 limit of 10. Major mail providers will reject or flag your mail with PermError.`,
          evidence: budgetEvidence,
          recommendation: 'Flatten SPF records or remove unused third-party includes to bring total lookups under 10.',
          checkedAt: now,
          confidence: 1
        });
      } else {
        checks.push({
          id: 'chk_spf_budget_' + Math.random().toString(36).substring(2, 9),
          key: 'spf_lookup_budget',
          status: 'pass',
          severity: 'info',
          summary: `SPF lookup budget within limit (${budget.lookups}/10)`,
          explanation: `Your SPF record consumes ${budget.lookups} of the allowed 10 DNS lookups.`,
          evidence: budgetEvidence,
          checkedAt: now,
          confidence: 1
        });
      }
    }

    // 3. DMARC Record
    const dmarcRecords = await this.resolver.resolveTxt(`_dmarc.${domain}`);
    const validDmarc = dmarcRecords.filter(r => r.toLowerCase().startsWith('v=dmarc1'));

    const dmarcEvidence: EvidenceItem[] = [
      {
        id: 'ev_dmarc_' + Math.random().toString(36).substring(2, 9),
        source: 'dns',
        name: `TXT _dmarc.${domain}`,
        observedValue: validDmarc,
        expectedValue: 'v=DMARC1; p=... policy',
        observedAt: now
      }
    ];

    if (validDmarc.length === 0) {
      checks.push({
        id: 'chk_dmarc_rec_' + Math.random().toString(36).substring(2, 9),
        key: 'dmarc_record',
        status: 'fail',
        severity: 'critical',
        summary: 'No DMARC record found',
        explanation: `No TXT record found at _dmarc.${domain}. DMARC is required by major receivers (Google, Yahoo) for sender authentication.`,
        evidence: dmarcEvidence,
        recommendation: `Publish a DMARC policy at _dmarc.${domain} starting with: v=DMARC1; p=none; rua=mailto:dmarc-reports@${domain}`,
        checkedAt: now,
        confidence: 1
      });
    } else {
      const parsedDmarc = parseDmarcRecord(validDmarc[0]);
      if (parsedDmarc.policy === 'none') {
        checks.push({
          id: 'chk_dmarc_rec_' + Math.random().toString(36).substring(2, 9),
          key: 'dmarc_record',
          status: 'warning',
          severity: 'medium',
          summary: 'DMARC policy set to monitoring only (p=none)',
          explanation: 'Your DMARC record is published with p=none. This monitors traffic but does not protect your domain from spoofing.',
          evidence: dmarcEvidence,
          recommendation: 'After reviewing aggregate reports for alignment, graduate to p=quarantine or p=reject in staged increments.',
          checkedAt: now,
          confidence: 1
        });
      } else {
        checks.push({
          id: 'chk_dmarc_rec_' + Math.random().toString(36).substring(2, 9),
          key: 'dmarc_record',
          status: 'pass',
          severity: 'info',
          summary: `DMARC policy active (${parsedDmarc.policy}, pct=${parsedDmarc.percentage})`,
          explanation: `Your domain enforces DMARC policy '${parsedDmarc.policy}' on ${parsedDmarc.percentage}% of unaligned messages.`,
          evidence: dmarcEvidence,
          checkedAt: now,
          confidence: 1
        });
      }
    }

    // 4. DKIM Selector (if supplied or known)
    if (selector) {
      const dkimTxt = await this.resolver.resolveTxt(`${selector}._domainkey.${domain}`);
      const dkimEvidence: EvidenceItem[] = [
        {
          id: 'ev_dkim_' + Math.random().toString(36).substring(2, 9),
          source: 'dns',
          name: `TXT ${selector}._domainkey.${domain}`,
          observedValue: dkimTxt,
          expectedValue: 'v=DKIM1; p=... public key',
          observedAt: now
        }
      ];

      if (dkimTxt.length === 0) {
        checks.push({
          id: 'chk_dkim_sel_' + Math.random().toString(36).substring(2, 9),
          key: 'dkim_selector',
          status: 'fail',
          severity: 'high',
          summary: `DKIM record missing for selector '${selector}'`,
          explanation: `No TXT record found at ${selector}._domainkey.${domain}.`,
          evidence: dkimEvidence,
          recommendation: `Publish your DKIM public key provided by your email provider at ${selector}._domainkey.${domain}.`,
          checkedAt: now,
          confidence: 1
        });
      } else {
        checks.push({
          id: 'chk_dkim_sel_' + Math.random().toString(36).substring(2, 9),
          key: 'dkim_selector',
          status: 'pass',
          severity: 'info',
          summary: `DKIM record published for selector '${selector}'`,
          explanation: `Found valid DKIM TXT record at ${selector}._domainkey.${domain}.`,
          evidence: dkimEvidence,
          checkedAt: now,
          confidence: 1
        });
      }
    } else {
      checks.push({
        id: 'chk_dkim_sel_' + Math.random().toString(36).substring(2, 9),
        key: 'dkim_selector',
        status: 'unknown',
        severity: 'info',
        summary: 'DKIM selector not specified',
        explanation: 'DKIM selectors cannot be discovered via DNS enumeration. Send a test email to extract the selector from the DKIM-Signature header.',
        evidence: [],
        checkedAt: now,
        confidence: 0
      });
    }

    // 5. MX Records
    const mxRecords = await this.resolver.resolveMx(domain);
    const mxEvidence: EvidenceItem[] = [
      {
        id: 'ev_mx_' + Math.random().toString(36).substring(2, 9),
        source: 'dns',
        name: `MX ${domain}`,
        observedValue: mxRecords.map(m => `${m.exchange} (priority ${m.priority})`),
        expectedValue: 'At least one MX mail exchanger',
        observedAt: now
      }
    ];

    if (mxRecords.length === 0) {
      checks.push({
        id: 'chk_mx_' + Math.random().toString(36).substring(2, 9),
        key: 'mx_records',
        status: 'warning',
        severity: 'low',
        summary: 'No MX records found',
        explanation: `No mail exchanger (MX) records found for ${domain}. If this is a send-only domain, MX is not required; otherwise verify your inbound mail setup.`,
        evidence: mxEvidence,
        recommendation: 'If this domain receives email, configure MX records pointing to your mail provider.',
        checkedAt: now,
        confidence: 0.95
      });
    } else {
      checks.push({
        id: 'chk_mx_' + Math.random().toString(36).substring(2, 9),
        key: 'mx_records',
        status: 'pass',
        severity: 'info',
        summary: `MX records published (${mxRecords.length} found)`,
        explanation: 'Mail exchanger records are published for this domain.',
        evidence: mxEvidence,
        checkedAt: now,
        confidence: 1
      });
    }

    return checks;
  }

  /**
   * Verifies a domain TXT challenge record.
   */
  async verifyChallengeRecord(recordName: string, expectedValue: string): Promise<boolean> {
    const txtRecords = await this.resolver.resolveTxt(recordName);
    return txtRecords.some(r => r.trim() === expectedValue.trim());
  }
}

export const dnsInspector = new DnsInspectionService();
