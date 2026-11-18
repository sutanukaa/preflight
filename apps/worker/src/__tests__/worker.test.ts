import { describe, it, expect } from 'vitest';
import { detectSnapshotDrift, type DomainSnapshotData } from '../processors/domain-check.js';
import { signWebhookPayload } from '../processors/webhook-delivery.js';

describe('Worker: Domain Snapshot Drift Detection', () => {
  it('detects DMARC policy downgrade as critical drift', () => {
    const prev: DomainSnapshotData = {
      domain: 'acme.studio',
      spfRecords: ['v=spf1 include:_spf.google.com ~all'],
      spfDirectLookups: 1,
      dmarcPolicy: 'reject',
      dmarcPercentage: 100,
      mxRecords: ['aspmx.l.google.com:1'],
      observedAt: '2026-11-18T10:00:00Z'
    };

    const curr: DomainSnapshotData = {
      ...prev,
      dmarcPolicy: 'none',
      observedAt: '2026-11-19T10:00:00Z'
    };

    const result = detectSnapshotDrift(prev, curr);
    expect(result.hasDrift).toBe(true);
    expect(result.changes.length).toBe(1);
    expect(result.changes[0].type).toBe('dmarc_downgraded');
    expect(result.changes[0].severity).toBe('critical');
  });

  it('detects SPF lookup budget violation (>10 mechanisms)', () => {
    const prev: DomainSnapshotData = {
      domain: 'acme.studio',
      spfRecords: ['v=spf1 include:_spf.google.com ~all'],
      spfDirectLookups: 3,
      dmarcPolicy: 'quarantine',
      dmarcPercentage: 100,
      mxRecords: ['aspmx.l.google.com:1'],
      observedAt: '2026-11-18T10:00:00Z'
    };

    const curr: DomainSnapshotData = {
      ...prev,
      spfDirectLookups: 12,
      observedAt: '2026-11-19T10:00:00Z'
    };

    const result = detectSnapshotDrift(prev, curr);
    expect(result.hasDrift).toBe(true);
    expect(result.changes.some(c => c.type === 'spf_budget_exceeded')).toBe(true);
  });

  it('reports zero drift when normalized snapshots match', () => {
    const prev: DomainSnapshotData = {
      domain: 'acme.studio',
      spfRecords: ['v=spf1 include:_spf.google.com ~all'],
      spfDirectLookups: 1,
      dmarcPolicy: 'reject',
      dmarcPercentage: 100,
      mxRecords: ['aspmx.l.google.com:1'],
      observedAt: '2026-11-18T10:00:00Z'
    };

    const curr: DomainSnapshotData = {
      ...prev,
      observedAt: '2026-11-19T10:00:00Z'
    };

    const result = detectSnapshotDrift(prev, curr);
    expect(result.hasDrift).toBe(false);
    expect(result.changes.length).toBe(0);
  });
});

describe('Worker: Signed Webhook Delivery', () => {
  it('generates HMAC-SHA256 signature with timestamp', () => {
    const payload = {
      eventId: 'evt_123',
      eventType: 'domain.drift_detected' as const,
      timestamp: new Date().toISOString(),
      data: { domain: 'acme.studio', drift: true }
    };

    const signed = signWebhookPayload('whsec_secret_key', payload);
    expect(signed.header).toContain('t=');
    expect(signed.header).toContain('v1=');
    expect(signed.timestamp).toBeGreaterThan(0);
  });
});
