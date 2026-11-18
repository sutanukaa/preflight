import { resolveTxt, resolveMx } from 'node:dns/promises';

export type DnsCheck = { key: string; status: 'pass' | 'warning' | 'fail' | 'unknown'; observed: string | string[] | null; explanation: string };

export async function resolveDomain(domain: string, selector?: string): Promise<DnsCheck[]> {
  const checks: DnsCheck[] = [];
  const txt = async (name: string) => { try { return (await resolveTxt(name)).map(parts => parts.join('')); } catch { return []; } };
  const spf = (await txt(domain)).filter(value => value.toLowerCase().startsWith('v=spf1'));
  checks.push({ key: 'spf_record', status: spf.length === 1 ? 'pass' : spf.length > 1 ? 'fail' : 'fail', observed: spf, explanation: spf.length === 1 ? 'Exactly one SPF policy was found.' : spf.length > 1 ? 'Multiple SPF policies exist; publish one policy only.' : 'No SPF policy was found at the root domain.' });
  const dmarc = await txt(`_dmarc.${domain}`);
  const dmarcRecords = dmarc.filter(value => value.toLowerCase().startsWith('v=dmarc1'));
  checks.push({ key: 'dmarc_record', status: dmarcRecords.length === 1 ? 'pass' : 'fail', observed: dmarcRecords, explanation: dmarcRecords.length === 1 ? 'A DMARC policy was found.' : 'A single valid DMARC TXT record was not found.' });
  const mx = await resolveMx(domain).catch(() => []);
  checks.push({ key: 'mx_records', status: mx.length ? 'pass' : 'warning', observed: mx.map(x => `${x.exchange} (priority ${x.priority})`), explanation: mx.length ? 'MX records are published.' : 'No MX records were found; verify whether this domain is intended to receive mail.' });
  if (selector) {
    const dkim = await txt(`${selector}._domainkey.${domain}`);
    checks.push({ key: 'dkim_selector', status: dkim.some(v => v.includes('v=DKIM1') || v.includes('p=')) ? 'pass' : 'fail', observed: dkim, explanation: dkim.length ? 'A TXT value exists for the supplied selector; validate key syntax and signature alignment using a real message.' : 'No DKIM TXT value was found for the supplied selector.' });
  } else checks.push({ key: 'dkim_selector', status: 'unknown', observed: null, explanation: 'DKIM selectors cannot be reliably enumerated. Supply a selector or read it from a received DKIM-Signature header.' });
  return checks;
}
