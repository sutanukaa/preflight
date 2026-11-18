/**
 * Public Suffix List aware organizational domain extractor.
 * Adheres to RFC 7489 (DMARC) Domain Alignment semantics.
 */

// Common two-level and three-level public suffixes
const COMMON_PUBLIC_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'gov.uk', 'ac.uk', 'net.uk', 'sch.uk',
  'com.au', 'net.au', 'org.au', 'edu.au', 'gov.au',
  'co.nz', 'net.nz', 'org.nz', 'govt.nz',
  'co.jp', 'ne.jp', 'or.jp', 'go.jp', 'ac.jp',
  'com.br', 'org.br', 'gov.br', 'edu.br',
  'co.in', 'net.in', 'org.in', 'gen.in', 'gov.in',
  'com.sg', 'edu.sg', 'gov.sg', 'net.sg',
  'com.mx', 'org.mx', 'gob.mx',
  'co.za', 'org.za', 'gov.za',
  'com.cn', 'net.cn', 'gov.cn', 'org.cn',
  'co.kr', 'ne.kr', 'or.kr', 'go.kr',
  'com.tw', 'org.tw', 'gov.tw',
  'com.hk', 'edu.hk', 'gov.hk',
  'com.tr', 'org.tr', 'gov.tr',
  'com.ar', 'org.ar', 'gov.ar',
  'com.co', 'org.co', 'gov.co',
  'co.il', 'org.il', 'gov.il'
]);

/**
 * Extracts the organizational domain (e.g. 'mail.sales.example.co.uk' -> 'example.co.uk')
 */
export function getOrganizationalDomain(hostname: string): string {
  if (!hostname) return '';
  const clean = hostname.trim().toLowerCase().replace(/\.+$/, '');
  const labels = clean.split('.');
  if (labels.length <= 2) {
    return clean;
  }

  // Check 3-level suffix (e.g. foo.bar.baz)
  if (labels.length >= 4) {
    const candidate3 = labels.slice(-3).join('.');
    if (COMMON_PUBLIC_SUFFIXES.has(candidate3)) {
      return labels.slice(-4).join('.');
    }
  }

  // Check 2-level suffix (e.g. co.uk, com.au)
  const candidate2 = labels.slice(-2).join('.');
  if (COMMON_PUBLIC_SUFFIXES.has(candidate2)) {
    return labels.slice(-3).join('.');
  }

  // Default standard 1-level TLD (.com, .org, .studio, .email, etc.)
  return labels.slice(-2).join('.');
}

export type DmarcAlignmentMode = 'r' | 's'; // relaxed (default) or strict

export interface AlignmentResult {
  aligned: boolean;
  mode: DmarcAlignmentMode;
  fromDomain: string;
  fromOrgDomain: string;
  targetDomain: string;
  targetOrgDomain: string;
  reason: string;
}

/**
 * Evaluates DMARC alignment between the RFC5322 From domain and an authenticated domain (SPF or DKIM).
 * Relaxed ('r'): organizational domains must match.
 * Strict ('s'): exact FQDN must match.
 */
export function evaluateAlignment(
  fromDomain: string,
  targetDomain: string,
  mode: DmarcAlignmentMode = 'r'
): AlignmentResult {
  const normFrom = fromDomain.trim().toLowerCase();
  const normTarget = targetDomain.trim().toLowerCase();
  const fromOrg = getOrganizationalDomain(normFrom);
  const targetOrg = getOrganizationalDomain(normTarget);

  if (mode === 's') {
    const aligned = normFrom === normTarget;
    return {
      aligned,
      mode: 's',
      fromDomain: normFrom,
      fromOrgDomain: fromOrg,
      targetDomain: normTarget,
      targetOrgDomain: targetOrg,
      reason: aligned
        ? `Strict alignment passed: From (${normFrom}) exactly matches authenticated domain (${normTarget}).`
        : `Strict alignment failed: From (${normFrom}) does not exactly match authenticated domain (${normTarget}).`
    };
  }

  const aligned = fromOrg === targetOrg && fromOrg.length > 0;
  return {
    aligned,
    mode: 'r',
    fromDomain: normFrom,
    fromOrgDomain: fromOrg,
    targetDomain: normTarget,
    targetOrgDomain: targetOrg,
    reason: aligned
      ? `Relaxed alignment passed: Organizational domain (${fromOrg}) matches authenticated domain (${targetOrg}).`
      : `Relaxed alignment failed: From organizational domain (${fromOrg}) does not match authenticated domain (${targetOrg}).`
  };
}
