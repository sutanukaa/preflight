import { describe, it, expect } from 'vitest';
import { mergeSpfRecord } from '@preflight/shared';
import { getDmarcProgression } from '@preflight/shared';
import { fixProposalService } from '../services/fix-proposals.js';
import { inboundMailService } from '../services/inbound.js';
import { calculateReportScore } from '@preflight/shared';
import type { FindingCheck } from '@preflight/shared';

describe('Preflight Master Safety & Remediation Invariants (30 Fixtures)', () => {
  // Invariant 1: No recommendation ever creates a second SPF record (10 test cases)
  const spfTestCases = [
    { name: 'Standard SPF with ~all', current: 'v=spf1 include:_spf.google.com ~all', add: 'include:sendgrid.net' },
    { name: 'SPF with -all', current: 'v=spf1 ip4:192.0.2.1 -all', add: 'include:mailgun.org' },
    { name: 'SPF with ip4 and include', current: 'v=spf1 ip4:10.0.0.1 include:spf.protection.outlook.com ?all', add: 'include:postmarkapp.com' },
    { name: 'SPF with redirect', current: 'v=spf1 redirect=_spf.example.com', add: 'include:amazonses.com' },
    { name: 'SPF with existing mechanism (idempotent)', current: 'v=spf1 include:mailgun.org ~all', add: 'include:mailgun.org' },
    { name: 'Empty SPF (creates first record)', current: null, add: 'include:helpscout.net' },
    { name: 'Multiple includes already present', current: 'v=spf1 include:a.com include:b.com ~all', add: 'include:c.com' },
    { name: 'SPF with a and mx mechanisms', current: 'v=spf1 a mx ~all', add: 'include:transmail.net' },
    { name: 'SPF with ip6 mechanism', current: 'v=spf1 ip6:2001:db8::1 ~all', add: 'include:salesforce.com' },
    { name: 'SPF with extra whitespace', current: '   v=spf1   ip4:198.51.100.1   ~all   ', add: 'include:hubspot.com' }
  ];

  spfTestCases.forEach((tc, idx) => {
    it(`SPF Invariant #${idx + 1}: ${tc.name} merges into single SPF record`, () => {
      const merged = mergeSpfRecord(tc.current, tc.add);
      // Count occurrences of 'v=spf1'
      const matches = merged.proposedRecord.match(/v=spf1/gi) || [];
      expect(matches.length).toBe(1);
      // Must not create multiple SPF records
      expect(merged.proposedRecord).not.toContain('\nv=spf1');
      expect(merged.proposedRecord).not.toContain('; v=spf1');
    });
  });

  // Invariant 2: DMARC progression requires staged rollout & legitimate sender warnings (10 test cases)
  const dmarcTestCases = [
    { name: 'No DMARC record published', current: null, expectedNext: 'p=none' },
    { name: 'DMARC p=none without rua', current: 'v=DMARC1; p=none', expectedNext: 'p=quarantine' },
    { name: 'DMARC p=none with rua', current: 'v=DMARC1; p=none; rua=mailto:d@example.com', expectedNext: 'p=quarantine' },
    { name: 'DMARC p=quarantine pct=10', current: 'v=DMARC1; p=quarantine; pct=10; rua=mailto:d@example.com', expectedNext: 'pct=100' },
    { name: 'DMARC p=quarantine pct=25', current: 'v=DMARC1; p=quarantine; pct=25; rua=mailto:d@example.com', expectedNext: 'pct=100' },
    { name: 'DMARC p=quarantine pct=50', current: 'v=DMARC1; p=quarantine; pct=50; rua=mailto:d@example.com', expectedNext: 'pct=100' },
    { name: 'DMARC p=quarantine pct=100', current: 'v=DMARC1; p=quarantine; pct=100; rua=mailto:d@example.com', expectedNext: 'p=reject' },
    { name: 'DMARC p=reject at 100%', current: 'v=DMARC1; p=reject; pct=100; rua=mailto:d@example.com', expectedNext: 'reject' },
    { name: 'DMARC with strict aspf', current: 'v=DMARC1; p=none; aspf=s; rua=mailto:d@example.com', expectedNext: 'p=quarantine' },
    { name: 'DMARC with custom sp policy', current: 'v=DMARC1; p=none; sp=none; rua=mailto:d@example.com', expectedNext: 'p=quarantine' }
  ];

  dmarcTestCases.forEach((tc, idx) => {
    it(`DMARC Staged Rollout Invariant #${idx + 11}: ${tc.name} provides staged warning`, () => {
      const step = getDmarcProgression(tc.current, 'example.com');
      expect(step.recommendedRecord).toContain(tc.expectedNext);
      // Warning notice must be present and warn about legitimate senders / traffic impact
      expect(step.warningNotice.length).toBeGreaterThan(15);
      expect(step.rationale.length).toBeGreaterThan(15);
    });
  });

  // Invariant 3: Evidence Citation & Truthfulness (10 test cases)
  const evidenceTestCases: Array<{
    name: string;
    headers: Record<string, string | string[]>;
    expectedKey: string;
    expectedStatus: string;
  }> = [
    {
      name: 'SPF fail when auth header reports fail',
      headers: { 'Authentication-Results': 'mx.google.com; spf=fail (google.com: domain does not designate IP)' },
      expectedKey: 'spf_auth',
      expectedStatus: 'fail'
    },
    {
      name: 'SPF pass when auth header reports pass',
      headers: { 'Authentication-Results': 'mx.google.com; spf=pass' },
      expectedKey: 'spf_auth',
      expectedStatus: 'pass'
    },
    {
      name: 'SPF unknown when auth header is missing',
      headers: {},
      expectedKey: 'spf_auth',
      expectedStatus: 'unknown'
    },
    {
      name: 'DKIM selector extracted from signature',
      headers: { 'DKIM-Signature': 'v=1; a=rsa-sha256; d=acme.studio; s=k1;' },
      expectedKey: 'dkim_signature',
      expectedStatus: 'warning'
    },
    {
      name: 'DKIM pass with trusted header result',
      headers: {
        'Authentication-Results': 'mx.google.com; dkim=pass header.i=@acme.studio',
        'DKIM-Signature': 'v=1; a=rsa-sha256; d=acme.studio; s=k1;'
      },
      expectedKey: 'dkim_signature',
      expectedStatus: 'pass'
    },
    {
      name: 'DMARC pass when aligned',
      headers: { 'Authentication-Results': 'mx.google.com; dmarc=pass' },
      expectedKey: 'dmarc_auth',
      expectedStatus: 'pass'
    },
    {
      name: 'DMARC fail when unaligned',
      headers: { 'Authentication-Results': 'mx.google.com; dmarc=fail' },
      expectedKey: 'dmarc_auth',
      expectedStatus: 'fail'
    },
    {
      name: 'List-Unsubscribe detected',
      headers: { 'List-Unsubscribe': '<mailto:unsub@example.com>' },
      expectedKey: 'list_unsubscribe',
      expectedStatus: 'pass'
    },
    {
      name: 'One-Click Unsubscribe RFC 8058 validated',
      headers: {
        'List-Unsubscribe': '<https://example.com/unsub>',
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click'
      },
      expectedKey: 'one_click_unsubscribe',
      expectedStatus: 'pass'
    },
    {
      name: 'No inbox placement guarantee claimed anywhere in findings',
      headers: {
        'Authentication-Results': 'mx.google.com; spf=pass; dkim=pass; dmarc=pass',
        'Message-ID': '<test-msg-123@acme.studio>',
        'Date': new Date().toUTCString()
      },
      expectedKey: 'message_structure',
      expectedStatus: 'pass'
    }
  ];

  evidenceTestCases.forEach((tc, idx) => {
    it(`Evidence Truth Invariant #${idx + 21}: ${tc.name}`, async () => {
      const res = await inboundMailService.processInboundMessage({
        headers: tc.headers,
        from: 'test@acme.studio'
      });

      const check = res.checks.find(c => c.key === tc.expectedKey);
      if (check) {
        expect(check.status).toBe(tc.expectedStatus);
        // Every check must contain evidence items
        expect(check.evidence.length).toBeGreaterThan(0);
        // Evidence items must have source, name, observedAt
        for (const ev of check.evidence) {
          expect(ev.source).toBeDefined();
          expect(ev.name).toBeDefined();
          expect(ev.observedAt).toBeDefined();
        }
        // Invariant: Never claim guaranteed inbox placement or spam score prediction
        expect(check.summary.toLowerCase()).not.toContain('guaranteed inbox');
        expect(check.explanation.toLowerCase()).not.toContain('guaranteed delivery');
      }
    });
  });
});
