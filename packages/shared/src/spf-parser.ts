/**
 * RFC 7208 SPF record parser, evaluator, and safe merge generator.
 */

export interface SpfMechanism {
  qualifier: '+' | '-' | '~' | '?';
  type: 'include' | 'a' | 'mx' | 'ptr' | 'ip4' | 'ip6' | 'exists' | 'all' | 'redirect' | 'unknown';
  value: string;
  raw: string;
  requiresDnsLookup: boolean;
}

export interface ParsedSpfRecord {
  raw: string;
  version: string;
  mechanisms: SpfMechanism[];
  allMechanism?: SpfMechanism;
  redirectModifier?: string;
  syntaxErrors: string[];
  directDnsLookups: number;
}

/**
 * Checks whether a mechanism consumes from the 10-DNS-lookup budget under RFC 7208 section 4.6.4:
 * Mechanisms: include, a, mx, ptr, exists, and redirect modifier.
 * ip4, ip6, all do NOT count as DNS lookups.
 */
export function mechanismRequiresDns(type: SpfMechanism['type']): boolean {
  return ['include', 'a', 'mx', 'ptr', 'exists', 'redirect'].includes(type);
}

/**
 * Parses a single SPF record string.
 */
export function parseSpfRecord(raw: string): ParsedSpfRecord {
  const trimmed = raw.trim();
  const tokens = trimmed.split(/\s+/).filter(Boolean);
  const syntaxErrors: string[] = [];

  if (tokens.length === 0 || !tokens[0].toLowerCase().startsWith('v=spf1')) {
    return {
      raw: trimmed,
      version: '',
      mechanisms: [],
      syntaxErrors: ['Record must begin with v=spf1'],
      directDnsLookups: 0
    };
  }

  const version = tokens[0];
  const mechanisms: SpfMechanism[] = [];
  let allMechanism: SpfMechanism | undefined;
  let redirectModifier: string | undefined;
  let directDnsLookups = 0;

  for (let i = 1; i < tokens.length; i++) {
    const token = tokens[i];
    let qualifier: SpfMechanism['qualifier'] = '+';
    let cleanToken = token;

    if (['+', '-', '~', '?'].includes(token[0])) {
      qualifier = token[0] as SpfMechanism['qualifier'];
      cleanToken = token.slice(1);
    }

    const colonIdx = cleanToken.indexOf(':');
    const eqIdx = cleanToken.indexOf('=');

    let type: SpfMechanism['type'] = 'unknown';
    let value = '';

    if (cleanToken.toLowerCase() === 'all') {
      type = 'all';
      allMechanism = { qualifier, type, value: '', raw: token, requiresDnsLookup: false };
      mechanisms.push(allMechanism);
      continue;
    }

    if (eqIdx !== -1 && (colonIdx === -1 || eqIdx < colonIdx)) {
      // Modifier, e.g. redirect=example.com
      const modName = cleanToken.slice(0, eqIdx).toLowerCase();
      const modVal = cleanToken.slice(eqIdx + 1);
      if (modName === 'redirect') {
        type = 'redirect';
        value = modVal;
        redirectModifier = modVal;
        directDnsLookups++;
        mechanisms.push({ qualifier, type, value, raw: token, requiresDnsLookup: true });
        continue;
      } else {
        // Unknown or exp modifier
        mechanisms.push({ qualifier, type: 'unknown', value: modVal, raw: token, requiresDnsLookup: false });
        continue;
      }
    }

    if (colonIdx !== -1) {
      const mechName = cleanToken.slice(0, colonIdx).toLowerCase();
      value = cleanToken.slice(colonIdx + 1);
      if (['include', 'a', 'mx', 'ptr', 'ip4', 'ip6', 'exists'].includes(mechName)) {
        type = mechName as SpfMechanism['type'];
      }
    } else {
      // Standalone a or mx
      const lower = cleanToken.toLowerCase();
      if (lower === 'a' || lower === 'mx' || lower === 'ptr') {
        type = lower;
      }
    }

    if (type === 'unknown') {
      syntaxErrors.push(`Unrecognized or invalid mechanism: ${token}`);
    }

    const reqDns = mechanismRequiresDns(type);
    if (reqDns) directDnsLookups++;

    mechanisms.push({
      qualifier,
      type,
      value,
      raw: token,
      requiresDnsLookup: reqDns
    });
  }

  // Check for 'all' mechanism not placed at end
  if (allMechanism && mechanisms.indexOf(allMechanism) !== mechanisms.length - 1 && !redirectModifier) {
    syntaxErrors.push("The 'all' mechanism should be the final mechanism in the SPF record.");
  }

  return {
    raw: trimmed,
    version,
    mechanisms,
    allMechanism,
    redirectModifier,
    syntaxErrors,
    directDnsLookups
  };
}

/**
 * Safely merges a new include or mechanism into an existing SPF record without creating a duplicate record.
 */
export function mergeSpfRecord(currentRecord: string | null, mechanismToAdd: string): { proposedRecord: string; note: string } {
  const cleanToAdd = mechanismToAdd.trim();

  if (!currentRecord || !currentRecord.toLowerCase().startsWith('v=spf1')) {
    return {
      proposedRecord: `v=spf1 ${cleanToAdd} ~all`,
      note: 'Created initial SPF record with softfail (~all).'
    };
  }

  const parsed = parseSpfRecord(currentRecord);

  // Check if mechanism is already present
  const alreadyExists = parsed.mechanisms.some(m => m.raw.toLowerCase() === cleanToAdd.toLowerCase() || m.value.toLowerCase() === cleanToAdd.toLowerCase());
  if (alreadyExists) {
    return {
      proposedRecord: currentRecord,
      note: `Mechanism '${cleanToAdd}' is already included in current SPF record.`
    };
  }

  // Extract mechanisms except 'all' and 'redirect'
  const beforeAll = parsed.mechanisms.filter(m => m.type !== 'all' && m.type !== 'redirect').map(m => m.raw);
  const allTerm = parsed.allMechanism ? parsed.allMechanism.raw : '~all';
  const redirectTerm = parsed.redirectModifier ? `redirect=${parsed.redirectModifier}` : '';

  const mergedTokens = ['v=spf1', ...beforeAll, cleanToAdd];
  if (redirectTerm) {
    mergedTokens.push(redirectTerm);
  } else {
    mergedTokens.push(allTerm);
  }

  return {
    proposedRecord: mergedTokens.join(' '),
    note: `Safely merged '${cleanToAdd}' before final '${allTerm}'. Never publish multiple SPF records.`
  };
}
