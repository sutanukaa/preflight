import { describe, it, expect } from 'vitest';
import { parseSpfRecord, mergeSpfRecord, mechanismRequiresDns } from '../spf-parser.js';
import { parseDmarcRecord, getDmarcProgression } from '../dmarc-parser.js';
import { getOrganizationalDomain, evaluateAlignment } from '../domain-utils.js';
import { calculateReportScore } from '../scoring.js';
import type { FindingCheck } from '../types.js';

describe('SPF Parser and Merge', () => {
  it('parses valid SPF record and counts direct DNS lookups accurately', () => {
    const raw = 'v=spf1 include:_spf.google.com ip4:192.0.2.1 a mx ~all';
    const parsed = parseSpfRecord(raw);

    expect(parsed.version).toBe('v=spf1');
    expect(parsed.syntaxErrors.length).toBe(0);
    // include (1), a (1), mx (1) = 3 DNS lookups. ip4 and all do not require DNS.
    expect(parsed.directDnsLookups).toBe(3);
    expect(parsed.allMechanism?.qualifier).toBe('~');
  });

  it('detects syntax error when v=spf1 is missing', () => {
    const parsed = parseSpfRecord('ip4:192.0.2.1 -all');
    expect(parsed.syntaxErrors.length).toBeGreaterThan(0);
  });

  it('safely merges a new include into an existing SPF record without duplicating', () => {
    const current = 'v=spf1 ip4:192.0.2.1 ~all';
    const merged = mergeSpfRecord(current, 'include:mailgun.org');
    expect(merged.proposedRecord).toBe('v=spf1 ip4:192.0.2.1 include:mailgun.org ~all');

    // Attempting to merge again should be idempotent
    const idempotent = mergeSpfRecord(merged.proposedRecord, 'include:mailgun.org');
    expect(idempotent.proposedRecord).toBe(merged.proposedRecord);
  });
});

describe('DMARC Parser and Staged Progression', () => {
  it('parses DMARC policy tags correctly', () => {
    const raw = 'v=DMARC1; p=quarantine; pct=50; rua=mailto:dmarc@example.com; aspf=s';
    const parsed = parseDmarcRecord(raw);

    expect(parsed.policy).toBe('quarantine');
    expect(parsed.percentage).toBe(50);
    expect(parsed.aspf).toBe('s');
    expect(parsed.rua).toContain('mailto:dmarc@example.com');
  });

  it('proposes staged rollout progression', () => {
    const step1 = getDmarcProgression(null, 'example.com');
    expect(step1.recommendedRecord).toContain('p=none');

    const step2 = getDmarcProgression('v=DMARC1; p=none; rua=mailto:d@example.com', 'example.com');
    expect(step2.recommendedRecord).toContain('p=quarantine');
    expect(step2.recommendedRecord).toContain('pct=25');

    const step3 = getDmarcProgression('v=DMARC1; p=quarantine; pct=25; rua=mailto:d@example.com', 'example.com');
    expect(step3.recommendedRecord).toContain('pct=100');

    const step4 = getDmarcProgression('v=DMARC1; p=quarantine; pct=100; rua=mailto:d@example.com', 'example.com');
    expect(step4.recommendedRecord).toContain('p=reject');
  });
});

describe('Domain Utils and PSL Alignment', () => {
  it('extracts organizational domain across complex public suffixes', () => {
    expect(getOrganizationalDomain('sub.example.co.uk')).toBe('example.co.uk');
    expect(getOrganizationalDomain('mail.marketing.acme.com.au')).toBe('acme.com.au');
    expect(getOrganizationalDomain('app.acme.studio')).toBe('acme.studio');
  });

  it('evaluates relaxed alignment vs strict alignment', () => {
    // Relaxed alignment
    const relaxed = evaluateAlignment('marketing.acme.studio', 'bounces.acme.studio', 'r');
    expect(relaxed.aligned).toBe(true);

    // Strict alignment
    const strict = evaluateAlignment('marketing.acme.studio', 'bounces.acme.studio', 's');
    expect(strict.aligned).toBe(false);

    // Different organizational domains
    const unaligned = evaluateAlignment('acme.studio', 'evil.com', 'r');
    expect(unaligned.aligned).toBe(false);
  });
});

describe('Scoring Engine', () => {
  it('computes coverage and score, deducting for unknown checks', () => {
    const now = new Date().toISOString();
    const checks: FindingCheck[] = [
      {
        id: '1',
        key: 'spf_record',
        status: 'pass',
        severity: 'info',
        summary: 'SPF found',
        explanation: 'Valid SPF record',
        evidence: [],
        checkedAt: now,
        confidence: 1
      },
      {
        id: '2',
        key: 'dmarc_record',
        status: 'pass',
        severity: 'info',
        summary: 'DMARC found',
        explanation: 'Valid DMARC policy',
        evidence: [],
        checkedAt: now,
        confidence: 1
      },
      {
        id: '3',
        key: 'dkim_signature',
        status: 'unknown',
        severity: 'medium',
        summary: 'No message received',
        explanation: 'Awaiting test message',
        evidence: [],
        checkedAt: now,
        confidence: 0.5
      }
    ];

    const result = calculateReportScore(checks);
    expect(result.score).toBeGreaterThan(0);
    expect(result.coveragePercent).toBeLessThan(100);
    expect(result.unknownCount).toBe(1);
    expect(result.passedCount).toBe(2);
  });
});
