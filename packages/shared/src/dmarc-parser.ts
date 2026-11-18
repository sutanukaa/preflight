/**
 * RFC 7489 DMARC record parser and staged rollout recommendation engine.
 */

export interface ParsedDmarcRecord {
  raw: string;
  version: string;
  policy: 'none' | 'quarantine' | 'reject' | 'unknown';
  subdomainPolicy?: 'none' | 'quarantine' | 'reject';
  percentage: number;
  rua: string[];
  ruf: string[];
  aspf: 'r' | 's'; // relaxed or strict
  adkim: 'r' | 's'; // relaxed or strict
  tags: Record<string, string>;
  warnings: string[];
  errors: string[];
}

export function parseDmarcRecord(raw: string): ParsedDmarcRecord {
  const trimmed = raw.trim();
  const tags: Record<string, string> = {};
  const warnings: string[] = [];
  const errors: string[] = [];

  // Split on semicolon
  const parts = trimmed.split(';').map(p => p.trim()).filter(Boolean);

  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq === -1) {
      warnings.push(`Malformed tag segment without '=': ${part}`);
      continue;
    }
    const key = part.slice(0, eq).trim().toLowerCase();
    const val = part.slice(eq + 1).trim();
    tags[key] = val;
  }

  const version = tags['v'] || '';
  if (!version.toLowerCase().startsWith('dmarc1')) {
    errors.push('DMARC record must start with v=DMARC1 tag.');
  }

  let policy: ParsedDmarcRecord['policy'] = 'unknown';
  const pVal = (tags['p'] || '').toLowerCase();
  if (['none', 'quarantine', 'reject'].includes(pVal)) {
    policy = pVal as ParsedDmarcRecord['policy'];
  } else {
    errors.push(`Invalid or missing required policy (p=) tag: '${tags['p'] ?? ''}'`);
  }

  let subdomainPolicy: ParsedDmarcRecord['subdomainPolicy'] | undefined;
  if (tags['sp']) {
    const spVal = tags['sp'].toLowerCase();
    if (['none', 'quarantine', 'reject'].includes(spVal)) {
      subdomainPolicy = spVal as ParsedDmarcRecord['subdomainPolicy'];
    } else {
      warnings.push(`Invalid subdomain policy sp=${tags['sp']}`);
    }
  }

  let percentage = 100;
  if (tags['pct']) {
    const parsedPct = parseInt(tags['pct'], 10);
    if (!isNaN(parsedPct) && parsedPct >= 0 && parsedPct <= 100) {
      percentage = parsedPct;
    } else {
      warnings.push(`Invalid pct tag value: ${tags['pct']}; default 100 assumed.`);
    }
  }

  const parseUris = (val?: string): string[] => {
    if (!val) return [];
    return val.split(',').map(u => u.trim()).filter(Boolean);
  };

  const rua = parseUris(tags['rua']);
  const ruf = parseUris(tags['ruf']);

  const aspf = (tags['aspf']?.toLowerCase() === 's') ? 's' : 'r';
  const adkim = (tags['adkim']?.toLowerCase() === 's') ? 's' : 'r';

  if (rua.length === 0) {
    warnings.push('No aggregate reporting URI (rua=) specified. You will not receive visibility reports.');
  }

  return {
    raw: trimmed,
    version,
    policy,
    subdomainPolicy,
    percentage,
    rua,
    ruf,
    aspf,
    adkim,
    tags,
    warnings,
    errors
  };
}

export interface DmarcNextStepProposal {
  currentPolicy: string;
  recommendedRecord: string;
  nextStepName: string;
  rationale: string;
  warningNotice: string;
}

/**
 * Returns safe next progression step for DMARC enforcement.
 * Principle: staged rollout (none -> quarantine with low pct -> quarantine 100% -> reject).
 */
export function getDmarcProgression(
  currentRecord: string | null,
  domain: string,
  ruaEmail?: string
): DmarcNextStepProposal {
  const defaultRua = ruaEmail ?? `dmarc-reports@${domain}`;

  if (!currentRecord) {
    return {
      currentPolicy: 'absent',
      recommendedRecord: `v=DMARC1; p=none; rua=mailto:${defaultRua}; pct=100`,
      nextStepName: 'Deploy DMARC Monitoring (p=none)',
      rationale: 'Publish an initial monitoring policy with aggregate reporting to discover all authentic sending sources before enforcement.',
      warningNotice: 'p=none does not instruct receivers to reject unauthenticated mail. It only gathers diagnostic evidence.'
    };
  }

  const parsed = parseDmarcRecord(currentRecord);

  if (parsed.policy === 'none') {
    return {
      currentPolicy: 'none',
      recommendedRecord: `v=DMARC1; p=quarantine; pct=25; rua=${parsed.rua.length ? parsed.rua.join(',') : `mailto:${defaultRua}`}; sp=none`,
      nextStepName: 'Step 2: Staged Quarantine (p=quarantine pct=25)',
      rationale: 'Once legitimate sources are aligned, begin quarantine enforcement at 25% to monitor delivery impact.',
      warningNotice: 'Ensure all transactional, marketing, and third-party senders (e.g. CRM, helpdesk) pass SPF/DKIM alignment first to prevent message loss.'
    };
  }

  if (parsed.policy === 'quarantine' && parsed.percentage < 100) {
    return {
      currentPolicy: `quarantine (pct=${parsed.percentage})`,
      recommendedRecord: `v=DMARC1; p=quarantine; pct=100; rua=${parsed.rua.join(',')}`,
      nextStepName: 'Step 3: Full Quarantine (p=quarantine pct=100)',
      rationale: 'Expand quarantine to 100% of unaligned messages before graduating to reject policy.',
      warningNotice: 'Any unaligned mail sent on behalf of your domain will be routed to spam folders.'
    };
  }

  if (parsed.policy === 'quarantine' && parsed.percentage === 100) {
    return {
      currentPolicy: 'quarantine (100%)',
      recommendedRecord: `v=DMARC1; p=reject; pct=100; rua=${parsed.rua.join(',')}`,
      nextStepName: 'Step 4: Full Rejection (p=reject)',
      rationale: 'Maximum protection against domain spoofing. Mail receivers will reject unauthenticated messages at the gateway.',
      warningNotice: 'Irreversible gateway rejection: thoroughly audit aggregate reports to verify zero false positives among legitimate senders.'
    };
  }

  return {
    currentPolicy: 'reject',
    recommendedRecord: currentRecord,
    nextStepName: 'Maintain & Monitor',
    rationale: 'Your domain has reached full DMARC enforcement (p=reject). Continue monitoring daily aggregate reports for drift or authentication errors.',
    warningNotice: 'Monitor rua aggregate reports regularly when onboarding new email tools.'
  };
}
