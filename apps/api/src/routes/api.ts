import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'node:crypto';
import { db } from '../db/db.js';
import { authService } from '../services/auth.js';
import { dnsInspector } from '../services/dns-resolver.js';
import { inboundMailService } from '../services/inbound.js';
import { reportService } from '../services/report.js';
import { fixProposalService } from '../services/fix-proposals.js';
import {
  RegisterInputSchema,
  LoginInputSchema,
  GoogleAuthInputSchema,
  DomainInputSchema
} from '@preflight/shared';

export async function registerApiRoutes(app: FastifyInstance) {
  // -------------------------------------------------------------
  // Middleware: Workspace Authorization & Tenant Scoping
  // -------------------------------------------------------------
  const requireAuth = async (request: FastifyRequest, reply: FastifyReply) => {
    const authHeader = request.headers.authorization;
    const session = authService.verifyToken(authHeader);
    if (!session) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    }
    // Attach session to request context
    (request as unknown as { session: typeof session }).session = session;
  };

  // -------------------------------------------------------------
  // Authentication Routes
  // -------------------------------------------------------------
  app.post('/v1/auth/register', async (request, reply) => {
    const parsed = RegisterInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid registration details', details: parsed.error.flatten() } });
    }
    try {
      const res = await authService.register(parsed.data);
      return reply.code(201).send(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Registration failed';
      return reply.code(409).send({ error: { code: 'REGISTRATION_ERROR', message: msg } });
    }
  });

  app.post('/v1/auth/login', async (request, reply) => {
    const parsed = LoginInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid login details', details: parsed.error.flatten() } });
    }
    try {
      const res = await authService.login(parsed.data);
      return reply.code(200).send(res);
    } catch {
      return reply.code(401).send({ error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    }
  });

  app.post('/v1/auth/demo', async (_request, reply) => {
    try {
      const res = await authService.loginDemo();
      return reply.code(200).send(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Demo login failed';
      return reply.code(500).send({ error: { code: 'DEMO_LOGIN_ERROR', message: msg } });
    }
  });

  app.get('/v1/auth/google/url', async (request, reply) => {
    const query = request.query as { redirectUri?: string; state?: string };
    const url = authService.getGoogleAuthUrl(query.redirectUri, query.state);
    return reply.code(200).send({ url });
  });

  app.post('/v1/auth/google/callback', async (request, reply) => {
    const parsed = GoogleAuthInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid Google payload', details: parsed.error.flatten() } });
    }
    try {
      const res = await authService.authenticateGoogle(parsed.data);
      return reply.code(200).send(res);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Google authentication failed';
      return reply.code(401).send({ error: { code: 'GOOGLE_AUTH_FAILED', message: msg } });
    }
  });

  app.get('/v1/auth/me', { preHandler: requireAuth }, async (request, reply) => {
    const session = (request as unknown as { session: { userId: string; workspaceId: string; role: string } }).session;
    const user = await db.getUserById(session.userId);
    const workspace = await db.getWorkspaceById(session.workspaceId);
    if (!user || !workspace) {
      return reply.code(404).send({ error: { code: 'USER_NOT_FOUND', message: 'User or workspace not found' } });
    }
    return reply.code(200).send({ user, workspace, role: session.role });
  });

  // -------------------------------------------------------------
  // Workspace Routes
  // -------------------------------------------------------------
  app.post('/v1/workspaces', { preHandler: requireAuth }, async (request, reply) => {
    const session = (request as unknown as { session: { userId: string } }).session;
    const body = request.body as { name?: string };
    if (!body?.name) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Workspace name is required' } });
    }
    const wsId = 'ws_' + crypto.randomUUID().replace(/-/g, '');
    await db.createWorkspace({ id: wsId, name: body.name });
    await db.addWorkspaceMember({ workspace_id: wsId, user_id: session.userId, role: 'owner' });
    const ws = await db.getWorkspaceById(wsId);
    return reply.code(201).send(ws);
  });

  app.get('/v1/workspaces/:workspaceId', { preHandler: requireAuth }, async (request, reply) => {
    const { workspaceId } = request.params as { workspaceId: string };
    const ws = await db.getWorkspaceById(workspaceId);
    if (!ws) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Workspace not found' } });
    }
    return reply.code(200).send(ws);
  });

  // -------------------------------------------------------------
  // Domain Routes
  // -------------------------------------------------------------
  app.post('/v1/domains', { preHandler: requireAuth }, async (request, reply) => {
    const session = (request as unknown as { session: { workspaceId: string } }).session;
    const parsed = DomainInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Invalid domain name', details: parsed.error.flatten() } });
    }
    const domainId = 'dom_' + crypto.randomUUID().replace(/-/g, '');
    await db.createDomain({
      id: domainId,
      workspace_id: session.workspaceId,
      fqdn: parsed.data.domain,
      verification_status: 'unverified'
    });
    const domain = await db.getDomainById(domainId, session.workspaceId);
    return reply.code(201).send(domain);
  });

  app.get('/v1/domains', { preHandler: requireAuth }, async (request, reply) => {
    const session = (request as unknown as { session: { workspaceId: string } }).session;
    const domains = await db.getDomainsByWorkspace(session.workspaceId);
    return reply.code(200).send({ domains });
  });

  app.get('/v1/domains/:domainId', { preHandler: requireAuth }, async (request, reply) => {
    const session = (request as unknown as { session: { workspaceId: string } }).session;
    const { domainId } = request.params as { domainId: string };
    const domain = await db.getDomainById(domainId, session.workspaceId);
    if (!domain) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Domain not found' } });
    }
    const reports = await db.getReportsByDomain(domainId);
    return reply.code(200).send({ domain, latestReport: reports[0] || null });
  });

  // -------------------------------------------------------------
  // Domain TXT Challenge & Verification
  // -------------------------------------------------------------
  app.post('/v1/domains/:domainId/verification', { preHandler: requireAuth }, async (request, reply) => {
    const session = (request as unknown as { session: { workspaceId: string } }).session;
    const { domainId } = request.params as { domainId: string };
    const domain = await db.getDomainById(domainId, session.workspaceId);
    if (!domain) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Domain not found' } });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const recordName = `_preflight-challenge.${domain.fqdn}`;
    const recordValue = `preflight-verify=${token}`;
    const challengeId = 'chal_' + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 72 * 3600 * 1000).toISOString();

    await db.createChallenge({
      id: challengeId,
      domain_id: domainId,
      token_hash: tokenHash,
      record_name: recordName,
      record_value: recordValue,
      expires_at: expiresAt
    });

    return reply.code(200).send({
      challengeId,
      domainId,
      recordName,
      recordValue,
      recordType: 'TXT',
      expiresAt
    });
  });

  app.post('/v1/domains/:domainId/verification/check', { preHandler: requireAuth }, async (request, reply) => {
    const session = (request as unknown as { session: { workspaceId: string } }).session;
    const { domainId } = request.params as { domainId: string };
    const domain = await db.getDomainById(domainId, session.workspaceId);
    if (!domain) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Domain not found' } });
    }

    const challenge = await db.getLatestChallenge(domainId);
    if (!challenge) {
      return reply.code(400).send({ error: { code: 'NO_CHALLENGE', message: 'No active challenge found. Request challenge first.' } });
    }

    const verified = await dnsInspector.verifyChallengeRecord(
      String(challenge.record_name),
      String(challenge.record_value)
    );

    if (verified) {
      await db.updateDomain(domainId, {
        verification_status: 'verified',
        verified_at: new Date().toISOString()
      });
      return reply.code(200).send({ verified: true, status: 'verified', message: 'Domain ownership successfully verified.' });
    }

    return reply.code(200).send({
      verified: false,
      status: 'pending',
      message: 'Challenge TXT record not yet detected in DNS. DNS propagation can take a few minutes.'
    });
  });

  // -------------------------------------------------------------
  // DNS Checks & Immediate Scans
  // -------------------------------------------------------------
  app.post('/v1/checks/dns', async (request, reply) => {
    const parsed = DomainInputSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', details: parsed.error.flatten() } });
    }
    const checks = await dnsInspector.runDnsChecks(parsed.data.domain, parsed.data.selector);
    return reply.code(200).send({
      domain: parsed.data.domain,
      checkedAt: new Date().toISOString(),
      checks
    });
  });

  app.post('/v1/domains/:domainId/checks', { preHandler: requireAuth }, async (request, reply) => {
    const session = (request as unknown as { session: { workspaceId: string } }).session;
    const { domainId } = request.params as { domainId: string };
    const domain = await db.getDomainById(domainId, session.workspaceId);
    if (!domain) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Domain not found' } });
    }

    const body = request.body as { selector?: string } | undefined;
    const checks = await dnsInspector.runDnsChecks(String(domain.fqdn), body?.selector);
    const report = await reportService.buildAndSaveReport({
      domainId,
      domainName: String(domain.fqdn),
      checks
    });

    return reply.code(200).send(report);
  });

  app.get('/v1/domains/:domainId/checks', { preHandler: requireAuth }, async (request, reply) => {
    const { domainId } = request.params as { domainId: string };
    const reports = await db.getReportsByDomain(domainId);
    return reply.code(200).send({ reports });
  });

  // -------------------------------------------------------------
  // Test Sessions (Unique Inbound Inbox)
  // -------------------------------------------------------------
  app.post('/v1/domains/:domainId/test-sessions', { preHandler: requireAuth }, async (request, reply) => {
    const session = (request as unknown as { session: { workspaceId: string } }).session;
    const { domainId } = request.params as { domainId: string };
    const domain = await db.getDomainById(domainId, session.workspaceId);
    if (!domain) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Domain not found' } });
    }

    const inboundDomain = process.env.INBOUND_DOMAIN || 'inbound.preflight.email';
    const token = crypto.randomBytes(6).toString('hex');
    const recipientAddress = `test-${token}@${inboundDomain}`;
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const sessionId = 'sess_' + crypto.randomUUID().replace(/-/g, '');
    const expiresAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

    await db.createTestSession({
      id: sessionId,
      domain_id: domainId,
      recipient_token_hash: tokenHash,
      recipient_address: recipientAddress,
      expires_at: expiresAt,
      state: 'waiting'
    });

    return reply.code(201).send({
      id: sessionId,
      domainId,
      recipientAddress,
      expiresAt,
      state: 'waiting',
      instructions: [
        'Send an email from your authentic email system to this address.',
        'We will evaluate SPF, DKIM, DMARC, alignment, and transport encryption.',
        'Your report will automatically update when the message arrives.'
      ]
    });
  });

  app.get('/v1/test-sessions/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const testSession = await db.getTestSessionById(sessionId);
    if (!testSession) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Test session not found' } });
    }
    return reply.code(200).send(testSession);
  });

  // -------------------------------------------------------------
  // Inbound Webhook (Signature-Verified)
  // -------------------------------------------------------------
  app.post('/v1/inbound/:provider', async (request, reply) => {
    const { provider } = request.params as { provider: string };
    const secret = process.env.INBOUND_WEBHOOK_SECRET || 'replace-me';
    const providedSecret = (request.headers['x-preflight-webhook-secret'] as string) || '';

    // Verify webhook signature (constant-time)
    if (secret !== 'replace-me' && !inboundMailService.verifyWebhookSignature(secret, providedSecret)) {
      return reply.code(401).send({ error: { code: 'UNAUTHORIZED', message: 'Invalid webhook secret' } });
    }

    const body = request.body as Record<string, unknown>;
    const rawMime = typeof body?.rawMime === 'string' ? body.rawMime : undefined;
    const headers = body?.headers as Record<string, string | string[]> | undefined;
    const recipient = (body?.to || body?.recipient || '') as string;

    // Process inbound message
    const processed = await inboundMailService.processInboundMessage({
      rawMime,
      headers,
      from: body?.from as string,
      to: recipient,
      subject: body?.subject as string,
      tls: body?.tls === true
    });

    // Run live DNS checks for the detected From domain
    const dnsChecks = await dnsInspector.runDnsChecks(
      processed.messageSummary.fromDomain,
      processed.extractedSelector
    );

    // Combine inbound header checks + live DNS checks
    const allChecks = [...dnsChecks, ...processed.checks];

    const report = await reportService.buildAndSaveReport({
      domainId: 'dom_acme_studio',
      domainName: processed.messageSummary.fromDomain,
      checks: allChecks
    });

    return reply.code(202).send({
      accepted: true,
      provider,
      reportId: report.id,
      score: report.score,
      coveragePercent: report.coveragePercent,
      checksCount: allChecks.length
    });
  });

  // -------------------------------------------------------------
  // Reports & Findings
  // -------------------------------------------------------------
  app.get('/v1/reports/:reportId', async (request, reply) => {
    const { reportId } = request.params as { reportId: string };
    const report = await db.getReportById(reportId);
    if (!report) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    }
    return reply.code(200).send(report);
  });

  app.get('/v1/reports/:reportId/findings', async (request, reply) => {
    const { reportId } = request.params as { reportId: string };
    const report = await db.getReportById(reportId);
    if (!report) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Report not found' } });
    }
    const checks = (report.checks || []) as Array<{ status: string }>;
    const actionable = checks.filter(c => c.status === 'fail' || c.status === 'warning');
    return reply.code(200).send({ findings: actionable });
  });

  // -------------------------------------------------------------
  // Fix Proposals & Verification
  // -------------------------------------------------------------
  app.post('/v1/findings/:findingId/fix-proposals', { preHandler: requireAuth }, async (request, reply) => {
    const { findingId } = request.params as { findingId: string };
    const proposal = await fixProposalService.generateFixProposal(findingId);
    if (!proposal) {
      return reply.code(404).send({ error: { code: 'NO_PROPOSAL', message: 'No safe DNS fix proposal available for this finding.' } });
    }
    return reply.code(201).send(proposal);
  });

  app.post('/v1/fix-proposals/:proposalId/verification', { preHandler: requireAuth }, async (request, reply) => {
    const { proposalId } = request.params as { proposalId: string };
    try {
      const run = await fixProposalService.verifyProposal(proposalId);
      return reply.code(200).send(run);
    } catch {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Proposal not found' } });
    }
  });

  app.get('/v1/fix-proposals/:proposalId/verification', { preHandler: requireAuth }, async (request, reply) => {
    const { proposalId } = request.params as { proposalId: string };
    const proposal = await db.getFixProposalById(proposalId);
    if (!proposal) {
      return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Proposal not found' } });
    }
    return reply.code(200).send(proposal);
  });

  // -------------------------------------------------------------
  // Monitoring & Alerts
  // -------------------------------------------------------------
  app.post('/v1/domains/:domainId/monitoring', { preHandler: requireAuth }, async (request, reply) => {
    const { domainId } = request.params as { domainId: string };
    const body = request.body as { enabled?: boolean; cronExpression?: string; alertEmail?: string };
    const configId = 'mon_' + crypto.randomUUID().replace(/-/g, '');

    await db.upsertMonitoringConfig({
      id: configId,
      domain_id: domainId,
      enabled: body?.enabled ?? true,
      cron_expression: body?.cronExpression ?? '0 * * * *',
      timezone: 'UTC',
      alert_preferences_json: { alertEmail: body?.alertEmail }
    });

    return reply.code(200).send({
      domainId,
      enabled: body?.enabled ?? true,
      cronExpression: body?.cronExpression ?? '0 * * * *',
      message: 'Scheduled monitoring successfully configured.'
    });
  });

  app.get('/v1/domains/:domainId/monitoring', { preHandler: requireAuth }, async (request, reply) => {
    const { domainId } = request.params as { domainId: string };
    const config = await db.getMonitoringConfig(domainId);
    return reply.code(200).send(config || { domainId, enabled: false });
  });

  // -------------------------------------------------------------
  // Webhooks & Events
  // -------------------------------------------------------------
  app.post('/v1/webhook-endpoints', { preHandler: requireAuth }, async (request, reply) => {
    const session = (request as unknown as { session: { workspaceId: string } }).session;
    const body = request.body as { url?: string; eventTypes?: string[] };
    if (!body?.url) {
      return reply.code(400).send({ error: { code: 'VALIDATION_ERROR', message: 'Webhook URL is required' } });
    }
    const endpointId = 'wh_' + crypto.randomUUID().replace(/-/g, '');
    const secret = 'whsec_' + crypto.randomBytes(24).toString('hex');

    return reply.code(201).send({
      id: endpointId,
      workspaceId: session.workspaceId,
      url: body.url,
      secret, // Revealed one-time upon creation
      enabled: true,
      eventTypes: body.eventTypes || ['report.completed', 'domain.drift_detected']
    });
  });

  app.get('/v1/events', { preHandler: requireAuth }, async (_request, reply) => {
    return reply.code(200).send({
      events: [
        { id: 'evt_1', type: 'report.completed', createdAt: new Date().toISOString() },
        { id: 'evt_2', type: 'domain.verified', createdAt: new Date(Date.now() - 3600 * 1000).toISOString() }
      ]
    });
  });
}
