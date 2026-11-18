import { resolveTxt, resolveMx } from 'node:dns/promises';
import { parseSpfRecord, parseDmarcRecord } from '@preflight/shared';

export interface DomainSnapshotData {
  domain: string;
  spfRecords: string[];
  spfDirectLookups: number;
  dmarcPolicy: string;
  dmarcPercentage: number;
  mxRecords: string[];
  observedAt: string;
}

export interface DriftDetectionResult {
  hasDrift: boolean;
  domain: string;
  changes: Array<{
    type: 'spf_policy_changed' | 'spf_budget_exceeded' | 'dmarc_downgraded' | 'mx_changed';
    description: string;
    previousValue: unknown;
    newValue: unknown;
    severity: 'critical' | 'high' | 'medium';
  }>;
}

/**
 * Resolves current authoritative DNS snapshot for a domain.
 */
export async function takeDomainSnapshot(domain: string): Promise<DomainSnapshotData> {
  let txtRecords: string[] = [];
  try {
    const rawTxt = await resolveTxt(domain);
    txtRecords = rawTxt.map(parts => parts.join(''));
  } catch {
    txtRecords = [];
  }

  const spfRecords = txtRecords
    .filter(r => r.toLowerCase().startsWith('v=spf1'))
    .sort();

  let spfDirectLookups = 0;
  if (spfRecords.length > 0) {
    const parsed = parseSpfRecord(spfRecords[0]);
    spfDirectLookups = parsed.directDnsLookups;
  }

  let dmarcTxt: string[] = [];
  try {
    const rawDmarc = await resolveTxt(`_dmarc.${domain}`);
    dmarcTxt = rawDmarc.map(parts => parts.join(''));
  } catch {
    dmarcTxt = [];
  }

  const validDmarc = dmarcTxt.find(r => r.toLowerCase().startsWith('v=dmarc1'));
  let dmarcPolicy = 'absent';
  let dmarcPercentage = 0;

  if (validDmarc) {
    const parsedDmarc = parseDmarcRecord(validDmarc);
    dmarcPolicy = parsedDmarc.policy;
    dmarcPercentage = parsedDmarc.percentage;
  }

  let mxRecords: string[] = [];
  try {
    const rawMx = await resolveMx(domain);
    mxRecords = rawMx.map(m => `${m.exchange}:${m.priority}`).sort();
  } catch {
    mxRecords = [];
  }

  return {
    domain,
    spfRecords,
    spfDirectLookups,
    dmarcPolicy,
    dmarcPercentage,
    mxRecords,
    observedAt: new Date().toISOString()
  };
}

/**
 * Compares two normalized snapshots to detect regression or drift.
 */
export function detectSnapshotDrift(
  prev: DomainSnapshotData | null,
  curr: DomainSnapshotData
): DriftDetectionResult {
  if (!prev) {
    return { hasDrift: false, domain: curr.domain, changes: [] };
  }

  const changes: DriftDetectionResult['changes'] = [];

  // 1. Check SPF Policy changes
  const prevSpf = prev.spfRecords.join(' | ');
  const currSpf = curr.spfRecords.join(' | ');
  if (prevSpf !== currSpf) {
    changes.push({
      type: 'spf_policy_changed',
      description: 'SPF policy record modified or removed.',
      previousValue: prevSpf,
      newValue: currSpf,
      severity: currSpf.length === 0 ? 'critical' : 'medium'
    });
  }

  // 2. Check SPF Lookup Budget
  if (curr.spfDirectLookups > 10 && prev.spfDirectLookups <= 10) {
    changes.push({
      type: 'spf_budget_exceeded',
      description: `SPF direct lookup count exceeded RFC 7208 limit (${curr.spfDirectLookups}/10).`,
      previousValue: prev.spfDirectLookups,
      newValue: curr.spfDirectLookups,
      severity: 'critical'
    });
  }

  // 3. Check DMARC Downgrade
  const policyRank: Record<string, number> = { reject: 3, quarantine: 2, none: 1, absent: 0, unknown: 0 };
  const prevRank = policyRank[prev.dmarcPolicy] ?? 0;
  const currRank = policyRank[curr.dmarcPolicy] ?? 0;

  if (currRank < prevRank) {
    changes.push({
      type: 'dmarc_downgraded',
      description: `DMARC enforcement downgraded from '${prev.dmarcPolicy}' to '${curr.dmarcPolicy}'.`,
      previousValue: prev.dmarcPolicy,
      newValue: curr.dmarcPolicy,
      severity: 'critical'
    });
  }

  // 4. Check MX record modifications
  const prevMx = prev.mxRecords.join(',');
  const currMx = curr.mxRecords.join(',');
  if (prevMx !== currMx) {
    changes.push({
      type: 'mx_changed',
      description: 'Mail exchanger (MX) configuration changed.',
      previousValue: prev.mxRecords,
      newValue: curr.mxRecords,
      severity: 'medium'
    });
  }

  return {
    hasDrift: changes.length > 0,
    domain: curr.domain,
    changes
  };
}
