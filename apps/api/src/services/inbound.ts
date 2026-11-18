import { simpleParser, type ParsedMail } from 'mailparser';
import crypto from 'node:crypto';
import {
  evaluateAlignment,
  type FindingCheck,
  type EvidenceItem
} from '@preflight/shared';
import { encryptData } from '../db/crypto.js';

export interface InboundEmailPayload {
  rawMime?: string;
  headers?: Record<string, string | string[]>;
  from?: string;
  to?: string;
  subject?: string;
  messageId?: string;
  tls?: boolean;
}

export interface ProcessedInboundResult {
  messageSummary: {
    fromDomain: string;
    subjectRedacted: string;
    headerJsonEncrypted: string;
    dedupeKey: string;
  };
  checks: FindingCheck[];
  extractedSelector?: string;
}

export class InboundMailService {
  /**
   * Constant-time webhook signature verification.
   */
  verifyWebhookSignature(expectedSecret: string, providedSecret?: string): boolean {
    if (!expectedSecret || !providedSecret) return false;
    try {
      const a = Buffer.from(expectedSecret);
      const b = Buffer.from(providedSecret);
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }

  /**
   * Parses raw MIME or structured headers and runs forensics checks.
   */
  async processInboundMessage(payload: InboundEmailPayload): Promise<ProcessedInboundResult> {
    const now = new Date().toISOString();
    let parsed: ParsedMail | null = null;

    if (payload.rawMime) {
      parsed = await simpleParser(payload.rawMime);
    }

    // Extract headers
    const headerMap = new Map<string, string>();
    if (parsed) {
      for (const [key, val] of parsed.headers) {
        if (typeof val === 'string') {
          headerMap.set(key.toLowerCase(), val);
        } else if (Array.isArray(val)) {
          headerMap.set(key.toLowerCase(), val.map(String).join('\n'));
        } else if (val && typeof val === 'object' && 'value' in val) {
          headerMap.set(key.toLowerCase(), String(val.value));
        }
      }
    } else if (payload.headers) {
      for (const [key, val] of Object.entries(payload.headers)) {
        headerMap.set(key.toLowerCase(), Array.isArray(val) ? val.join('\n') : String(val));
      }
    }

    // Extract RFC5322 From
    const fromRaw = headerMap.get('from') || payload.from || '';
    const fromMatch = fromRaw.match(/@([a-zA-Z0-9.-]+)/);
    const fromDomain = fromMatch ? fromMatch[1].toLowerCase().trim() : 'unknown.domain';

    // Redacted Subject (keep length / placeholder, never leak sensitive info)
    const rawSubject = headerMap.get('subject') || payload.subject || '(no subject)';
    const subjectRedacted = rawSubject.length > 3 ? `${rawSubject.slice(0, 3)}*** [redacted ${rawSubject.length} chars]` : '[redacted]';

    // Encrypt raw headers
    const rawHeadersObj = Object.fromEntries(headerMap.entries());
    const headerJsonEncrypted = encryptData(JSON.stringify(rawHeadersObj));

    // Deduplication Key
    const msgId = headerMap.get('message-id') || payload.messageId || crypto.randomUUID();
    const dedupeKey = crypto.createHash('sha256').update(`${msgId}:${fromDomain}`).digest('hex');

    const checks: FindingCheck[] = [];

    // 1. Authentication-Results Parsing (SPF, DKIM, DMARC)
    const authResultsHeader = headerMap.get('authentication-results') || '';
    let extractedSelector: string | undefined;

    // SPF Authentication
    const spfPass = /spf=(pass)/i.test(authResultsHeader);
    const spfFail = /spf=(fail|softfail|permerror|temperror)/i.test(authResultsHeader);
    checks.push({
      id: 'chk_spf_auth_' + Math.random().toString(36).substring(2, 9),
      key: 'spf_auth',
      status: spfPass ? 'pass' : spfFail ? 'fail' : 'unknown',
      severity: spfPass ? 'info' : 'critical',
      summary: spfPass ? 'SPF authentication passed' : spfFail ? 'SPF authentication failed' : 'SPF authentication unknown',
      explanation: spfPass
        ? 'Trusted Authentication-Results header confirms SPF passed.'
        : spfFail
        ? 'Authentication-Results reported SPF failure.'
        : 'Authentication-Results header did not include trusted SPF result.',
      evidence: [
        {
          id: 'ev_auth_res_spf_' + Math.random().toString(36).substring(2, 9),
          source: 'header',
          name: 'Authentication-Results (spf)',
          observedValue: authResultsHeader || null,
          expectedValue: 'spf=pass',
          observedAt: now
        }
      ],
      checkedAt: now,
      confidence: authResultsHeader ? 1 : 0
    });

    // DKIM Signature & Auth
    const dkimSigHeader = headerMap.get('dkim-signature') || '';
    const dkimPass = /dkim=(pass)/i.test(authResultsHeader);
    const dkimFail = /dkim=(fail|permerror|temperror)/i.test(authResultsHeader);

    // Extract d= and s= from DKIM-Signature header
    let dkimDomain = '';
    if (dkimSigHeader) {
      const dMatch = dkimSigHeader.match(/\bd=([a-zA-Z0-9.-]+)/i);
      const sMatch = dkimSigHeader.match(/\bs=([a-zA-Z0-9.-]+)/i);
      if (dMatch) dkimDomain = dMatch[1].toLowerCase();
      if (sMatch) extractedSelector = sMatch[1].toLowerCase();
    }

    checks.push({
      id: 'chk_dkim_sig_' + Math.random().toString(36).substring(2, 9),
      key: 'dkim_signature',
      status: dkimPass ? 'pass' : dkimFail ? 'fail' : dkimSigHeader ? 'warning' : 'unknown',
      severity: dkimPass ? 'info' : 'high',
      summary: dkimPass ? 'DKIM signature verified' : dkimSigHeader ? 'DKIM signature present but unverified' : 'DKIM signature missing',
      explanation: dkimPass
        ? `DKIM signature verified successfully (selector: ${extractedSelector || 'discovered'}, domain: ${dkimDomain || fromDomain}).`
        : dkimSigHeader
        ? 'DKIM-Signature header observed on message; awaiting receiver verification pass.'
        : 'No DKIM-Signature header observed on received message.',
      evidence: [
        {
          id: 'ev_dkim_sig_' + Math.random().toString(36).substring(2, 9),
          source: 'header',
          name: 'DKIM-Signature',
          observedValue: dkimSigHeader || null,
          expectedValue: 'Valid DKIM-Signature with trusted receiver pass',
          observedAt: now
        }
      ],
      checkedAt: now,
      confidence: 1
    });

    // DMARC Auth
    const dmarcPass = /dmarc=(pass)/i.test(authResultsHeader);
    const dmarcFail = /dmarc=(fail)/i.test(authResultsHeader);
    checks.push({
      id: 'chk_dmarc_auth_' + Math.random().toString(36).substring(2, 9),
      key: 'dmarc_auth',
      status: dmarcPass ? 'pass' : dmarcFail ? 'fail' : 'unknown',
      severity: dmarcPass ? 'info' : 'critical',
      summary: dmarcPass ? 'DMARC alignment passed' : dmarcFail ? 'DMARC alignment failed' : 'DMARC authentication unknown',
      explanation: dmarcPass
        ? 'Message satisfied DMARC alignment and authenticated successfully.'
        : dmarcFail
        ? 'Message failed DMARC evaluation.'
        : 'Trusted DMARC result not present in receiving evidence.',
      evidence: [
        {
          id: 'ev_auth_res_dmarc_' + Math.random().toString(36).substring(2, 9),
          source: 'header',
          name: 'Authentication-Results (dmarc)',
          observedValue: authResultsHeader || null,
          expectedValue: 'dmarc=pass',
          observedAt: now
        }
      ],
      checkedAt: now,
      confidence: authResultsHeader ? 1 : 0
    });

    // 2. Alignment Check (RFC5322 From vs DKIM d=)
    if (dkimDomain) {
      const align = evaluateAlignment(fromDomain, dkimDomain, 'r');
      checks.push({
        id: 'chk_align_' + Math.random().toString(36).substring(2, 9),
        key: 'alignment',
        status: align.aligned ? 'pass' : 'fail',
        severity: align.aligned ? 'info' : 'high',
        summary: align.aligned ? 'DKIM domain aligned with From header' : 'DKIM domain unaligned with From header',
        explanation: align.reason,
        evidence: [
          {
            id: 'ev_align_' + Math.random().toString(36).substring(2, 9),
            source: 'derived',
            name: 'Domain Alignment Evaluation',
            observedValue: { fromDomain, dkimDomain, mode: align.mode },
            expectedValue: `Aligned organizational domain (${fromDomain})`,
            observedAt: now
          }
        ],
        checkedAt: now,
        confidence: 1
      });
    }

    // 3. TLS Transport Evidence
    const receivedHeader = headerMap.get('received') || '';
    const hasTlsEvidence = payload.tls === true || /TLSv1\.[23]|ECDHE|AES|using TLS/i.test(receivedHeader);
    checks.push({
      id: 'chk_tls_' + Math.random().toString(36).substring(2, 9),
      key: 'tls_evidence',
      status: hasTlsEvidence ? 'pass' : 'warning',
      severity: hasTlsEvidence ? 'info' : 'medium',
      summary: hasTlsEvidence ? 'In-transit TLS encryption observed' : 'TLS transport encryption not verified',
      explanation: hasTlsEvidence
        ? 'Received transport evidence indicates TLS encryption in transit.'
        : 'No verified TLS ciphersuite observed in receiving transport hop evidence.',
      evidence: [
        {
          id: 'ev_tls_' + Math.random().toString(36).substring(2, 9),
          source: 'header',
          name: 'Received Transport Hop',
          observedValue: receivedHeader ? receivedHeader.slice(0, 200) : null,
          expectedValue: 'Encrypted transport hop (TLS 1.2+)',
          observedAt: now
        }
      ],
      checkedAt: now,
      confidence: 0.9
    });

    // 4. List-Unsubscribe & One-Click
    const listUnsub = headerMap.get('list-unsubscribe');
    const listUnsubPost = headerMap.get('list-unsubscribe-post');
    const hasListUnsub = Boolean(listUnsub);
    const hasOneClick = listUnsubPost?.toLowerCase().includes('list-unsubscribe=one-click');

    checks.push({
      id: 'chk_unsub_' + Math.random().toString(36).substring(2, 9),
      key: 'list_unsubscribe',
      status: hasListUnsub ? 'pass' : 'warning',
      severity: 'low',
      summary: hasListUnsub ? 'List-Unsubscribe header present' : 'List-Unsubscribe header absent',
      explanation: hasListUnsub
        ? 'List-Unsubscribe header detected, meeting modern bulk sender standards.'
        : 'No List-Unsubscribe header found. Required for commercial/bulk marketing messages.',
      evidence: [
        {
          id: 'ev_unsub_' + Math.random().toString(36).substring(2, 9),
          source: 'header',
          name: 'List-Unsubscribe',
          observedValue: listUnsub || null,
          expectedValue: '<mailto:...> or <https://...>',
          observedAt: now
        }
      ],
      checkedAt: now,
      confidence: 1
    });

    if (hasListUnsub) {
      checks.push({
        id: 'chk_one_click_' + Math.random().toString(36).substring(2, 9),
        key: 'one_click_unsubscribe',
        status: hasOneClick ? 'pass' : 'warning',
        severity: 'low',
        summary: hasOneClick ? 'RFC 8058 One-Click Unsubscribe enabled' : 'One-Click Unsubscribe (RFC 8058) not detected',
        explanation: hasOneClick
          ? 'List-Unsubscribe-Post header specifies List-Unsubscribe=One-Click.'
          : 'List-Unsubscribe-Post: List-Unsubscribe=One-Click is missing.',
        evidence: [
          {
            id: 'ev_one_click_' + Math.random().toString(36).substring(2, 9),
            source: 'header',
            name: 'List-Unsubscribe-Post',
            observedValue: listUnsubPost || null,
            expectedValue: 'List-Unsubscribe=One-Click',
            observedAt: now
          }
        ],
        checkedAt: now,
        confidence: 1
      });
    }

    // 5. Message Structure Baseline
    const hasMsgId = Boolean(headerMap.get('message-id'));
    const hasDate = Boolean(headerMap.get('date'));
    const structureValid = hasMsgId && hasDate && fromDomain !== 'unknown.domain';

    checks.push({
      id: 'chk_struct_' + Math.random().toString(36).substring(2, 9),
      key: 'message_structure',
      status: structureValid ? 'pass' : 'warning',
      severity: 'low',
      summary: structureValid ? 'MIME baseline and core RFC5322 headers valid' : 'Missing standard RFC5322 headers',
      explanation: structureValid
        ? 'Standard From, Date, and Message-ID headers were found in valid structural format.'
        : 'One or more required RFC5322 baseline headers are missing or malformed.',
      evidence: [
        {
          id: 'ev_struct_' + Math.random().toString(36).substring(2, 9),
          source: 'header',
          name: 'RFC5322 Baseline Headers',
          observedValue: {
            hasMessageId: hasMsgId,
            hasDate: hasDate,
            fromDomain
          },
          expectedValue: 'Valid Message-ID, Date, From',
          observedAt: now
        }
      ],
      checkedAt: now,
      confidence: 1
    });

    return {
      messageSummary: {
        fromDomain,
        subjectRedacted,
        headerJsonEncrypted,
        dedupeKey
      },
      checks,
      extractedSelector
    };
  }
}

export const inboundMailService = new InboundMailService();
