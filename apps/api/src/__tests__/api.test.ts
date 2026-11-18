import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createServer } from '../server.js';
import { db } from '../db/db.js';

describe('Preflight API Endpoints & Auth Flow', () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.FORCE_MEMORY_DB = 'true';
    app = await createServer();
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await db.close();
  });

  it('GET /health returns healthy status and service info', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/health'
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.service).toBe('preflight-api');
  });

  it('POST /v1/auth/demo logs in as demo user and returns session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/demo'
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe('demo@preflight.email');
    expect(body.workspace.name).toBe('Acme Studio');
  });

  it('POST /v1/auth/register registers new user and creates workspace', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/register',
      payload: {
        email: 'alice@example.com',
        password: 'Password123!',
        name: 'Alice Designer',
        workspaceName: 'Alice Studio'
      }
    });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe('alice@example.com');
    expect(body.workspace.name).toBe('Alice Studio');
  });

  it('POST /v1/auth/login logs in registered user', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      payload: {
        email: 'alice@example.com',
        password: 'Password123!'
      }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe('alice@example.com');
  });

  it('GET /v1/auth/google/url returns OAuth consent URL', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/v1/auth/google/url?redirectUri=http://localhost:5173/auth/google/callback'
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.url).toContain('accounts.google.com');
    expect(body.url).toContain('client_id');
  });

  it('POST /v1/auth/google/callback provisions Google user session', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/google/callback',
      payload: {
        code: 'mock-google-auth-code'
      }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.token).toBeDefined();
    expect(body.user.email).toBe('google.user@example.com');
    expect(body.user.authProviderId).toContain('google:');
  });

  it('GET /v1/auth/me verifies Bearer token and returns user context', async () => {
    // 1. Get demo token
    const loginRes = await app.inject({
      method: 'POST',
      url: '/v1/auth/demo'
    });
    const token = loginRes.json().token;

    // 2. Access /v1/auth/me
    const meRes = await app.inject({
      method: 'GET',
      url: '/v1/auth/me',
      headers: {
        authorization: `Bearer ${token}`
      }
    });
    expect(meRes.statusCode).toBe(200);
    const meBody = meRes.json();
    expect(meBody.user.email).toBe('demo@preflight.email');
    expect(meBody.workspace.name).toBe('Acme Studio');
  });

  it('Domain and Challenge flow: add domain, issue TXT challenge', async () => {
    const loginRes = await app.inject({ method: 'POST', url: '/v1/auth/demo' });
    const token = loginRes.json().token;

    // Add domain
    const addRes = await app.inject({
      method: 'POST',
      url: '/v1/domains',
      headers: { authorization: `Bearer ${token}` },
      payload: { domain: 'newdomain.org' }
    });
    expect(addRes.statusCode).toBe(201);
    const domain = addRes.json();
    expect(domain.fqdn).toBe('newdomain.org');

    // Issue TXT challenge
    const chalRes = await app.inject({
      method: 'POST',
      url: `/v1/domains/${domain.id}/verification`,
      headers: { authorization: `Bearer ${token}` }
    });
    expect(chalRes.statusCode).toBe(200);
    const challenge = chalRes.json();
    expect(challenge.recordName).toBe('_preflight-challenge.newdomain.org');
    expect(challenge.recordValue).toContain('preflight-verify=');
  });

  it('POST /v1/inbound/:provider accepts email and generates scored report', async () => {
    const webhookRes = await app.inject({
      method: 'POST',
      url: '/v1/inbound/postmark',
      payload: {
        from: 'sender@acme.studio',
        to: 'test-k8m2@inbound.preflight.email',
        subject: 'Weekly Newsletter Test',
        headers: {
          'Authentication-Results': 'mx.google.com; spf=pass; dkim=pass header.i=@acme.studio; dmarc=pass',
          'DKIM-Signature': 'v=1; a=rsa-sha256; c=relaxed/relaxed; d=acme.studio; s=selector1;',
          'List-Unsubscribe': '<mailto:unsub@acme.studio>',
          'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
          'Message-ID': '<test-1234@acme.studio>',
          'Date': new Date().toUTCString()
        },
        tls: true
      }
    });

    expect(webhookRes.statusCode).toBe(202);
    const body = webhookRes.json();
    expect(body.accepted).toBe(true);
    expect(body.reportId).toBeDefined();
    expect(body.score).toBeGreaterThan(0);
    expect(body.coveragePercent).toBeGreaterThan(0);
  });
});
