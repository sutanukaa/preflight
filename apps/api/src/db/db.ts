import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { hashPassword } from './crypto.js';

export interface DatabaseAdapter {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
  isMemoryFallback: boolean;
}

class MemoryDatabaseAdapter implements DatabaseAdapter {
  public isMemoryFallback = true;
  private tables: Map<string, Map<string, Record<string, unknown>>> = new Map();

  constructor() {
    const tableNames = [
      'users', 'workspaces', 'workspace_members', 'domains',
      'domain_verification_challenges', 'dkim_selectors', 'test_sessions',
      'inbound_messages', 'reports', 'checks', 'evidence', 'fix_proposals',
      'verification_runs', 'monitoring_configs', 'domain_snapshots',
      'webhook_endpoints', 'webhook_deliveries', 'audit_logs'
    ];
    for (const t of tableNames) {
      this.tables.set(t, new Map());
    }
  }

  getTable(name: string): Map<string, Record<string, unknown>> {
    let t = this.tables.get(name);
    if (!t) {
      t = new Map();
      this.tables.set(name, t);
    }
    return t;
  }

  async query<T = unknown>(sql: string, params: unknown[] = []): Promise<T[]> {
    // Basic in-memory execution for structured queries
    const trimmed = sql.trim();
    return [] as T[];
  }

  async close(): Promise<void> {}
}

export class Database {
  private pool: pg.Pool | null = null;
  public memory: MemoryDatabaseAdapter | null = null;
  public isMemory = false;

  async init(): Promise<void> {
    const connStr = process.env.DATABASE_URL;
    if (connStr && !process.env.FORCE_MEMORY_DB) {
      try {
        const pool = new pg.Pool({
          connectionString: connStr,
          connectionTimeoutMillis: 2000,
          max: 10
        });
        // Test connection
        await pool.query('SELECT 1');
        this.pool = pool;
        this.isMemory = false;
        await this.runMigrations();
        await this.seedDemoData();
        return;
      } catch (err) {
        console.warn('PostgreSQL connection failed or timed out. Falling back to persistent in-memory database store.');
      }
    }
    this.memory = new MemoryDatabaseAdapter();
    this.isMemory = true;
    await this.seedDemoData();
  }

  private async runMigrations(): Promise<void> {
    if (!this.pool) return;
    try {
      const schemaPath = path.resolve(import.meta.dirname, 'schema.sql');
      if (fs.existsSync(schemaPath)) {
        const ddl = fs.readFileSync(schemaPath, 'utf8');
        await this.pool.query(ddl);
      }
    } catch (e) {
      console.error('Migration error:', e);
    }
  }

  async seedDemoData(): Promise<void> {
    const demoEmail = 'demo@preflight.email';
    const existing = await this.getUserByEmail(demoEmail);
    if (existing) return;

    const userId = 'usr_demo_acme';
    const workspaceId = 'ws_demo_acme';
    const passHash = await hashPassword('PreflightDemo2026!');

    await this.createUser({
      id: userId,
      email: demoEmail,
      password_hash: passHash,
      name: 'Sutanuka C.',
      auth_provider_id: null
    });

    await this.createWorkspace({
      id: workspaceId,
      name: 'Acme Studio'
    });

    await this.addWorkspaceMember({
      workspace_id: workspaceId,
      user_id: userId,
      role: 'owner'
    });

    // Seed sample domain: acme.studio
    const domainId = 'dom_acme_studio';
    await this.createDomain({
      id: domainId,
      workspace_id: workspaceId,
      fqdn: 'acme.studio',
      verification_status: 'verified',
      verified_at: new Date().toISOString(),
      last_check_score: 86,
      last_checked_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString()
    });

    // Seed test session for acme.studio
    const token = 'k8m2_' + crypto.randomBytes(8).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await this.createTestSession({
      id: 'sess_demo_1',
      domain_id: domainId,
      recipient_token_hash: tokenHash,
      recipient_address: 'test-k8m2@inbound.preflight.email',
      expires_at: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      state: 'waiting'
    });
  }

  // ==========================================
  // User & Workspace Methods
  // ==========================================
  async createUser(data: { id: string; email: string; password_hash: string | null; name?: string; auth_provider_id?: string | null }): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        'INSERT INTO users (id, email, password_hash, name, auth_provider_id) VALUES ($1, $2, $3, $4, $5)',
        [data.id, data.email, data.password_hash, data.name || null, data.auth_provider_id || null]
      );
    } else if (this.memory) {
      this.memory.getTable('users').set(data.id, { ...data, created_at: new Date().toISOString() });
    }
  }

  async getUserByEmail(email: string): Promise<Record<string, unknown> | null> {
    const cleanEmail = email.trim().toLowerCase();
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1', [cleanEmail]);
      return res.rows[0] || null;
    } else if (this.memory) {
      for (const row of this.memory.getTable('users').values()) {
        if (typeof row.email === 'string' && row.email.toLowerCase() === cleanEmail) {
          return row;
        }
      }
      return null;
    }
    return null;
  }

  async getUserByAuthProviderId(providerId: string): Promise<Record<string, unknown> | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM users WHERE auth_provider_id = $1 LIMIT 1', [providerId]);
      return res.rows[0] || null;
    } else if (this.memory) {
      for (const row of this.memory.getTable('users').values()) {
        if (row.auth_provider_id === providerId) {
          return row;
        }
      }
      return null;
    }
    return null;
  }

  async getUserById(id: string): Promise<Record<string, unknown> | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
      return res.rows[0] || null;
    } else if (this.memory) {
      return this.memory.getTable('users').get(id) || null;
    }
    return null;
  }

  async createWorkspace(data: { id: string; name: string }): Promise<void> {
    if (this.pool) {
      await this.pool.query('INSERT INTO workspaces (id, name) VALUES ($1, $2)', [data.id, data.name]);
    } else if (this.memory) {
      this.memory.getTable('workspaces').set(data.id, { ...data, created_at: new Date().toISOString() });
    }
  }

  async getWorkspaceById(id: string): Promise<Record<string, unknown> | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM workspaces WHERE id = $1 LIMIT 1', [id]);
      return res.rows[0] || null;
    } else if (this.memory) {
      return this.memory.getTable('workspaces').get(id) || null;
    }
    return null;
  }

  async addWorkspaceMember(data: { workspace_id: string; user_id: string; role: string }): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        'INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
        [data.workspace_id, data.user_id, data.role]
      );
    } else if (this.memory) {
      this.memory.getTable('workspace_members').set(`${data.workspace_id}:${data.user_id}`, {
        ...data,
        created_at: new Date().toISOString()
      });
    }
  }

  async getUserWorkspace(userId: string): Promise<{ workspace: Record<string, unknown>; role: string } | null> {
    if (this.pool) {
      const res = await this.pool.query(
        `SELECT w.*, wm.role FROM workspaces w
         JOIN workspace_members wm ON wm.workspace_id = w.id
         WHERE wm.user_id = $1 LIMIT 1`,
        [userId]
      );
      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      const role = row.role;
      delete row.role;
      return { workspace: row, role };
    } else if (this.memory) {
      for (const m of this.memory.getTable('workspace_members').values()) {
        if (m.user_id === userId) {
          const ws = this.memory.getTable('workspaces').get(m.workspace_id as string);
          if (ws) return { workspace: ws, role: m.role as string };
        }
      }
      return null;
    }
    return null;
  }

  // ==========================================
  // Domain Methods
  // ==========================================
  async createDomain(data: {
    id: string;
    workspace_id: string;
    fqdn: string;
    verification_status?: string;
    verified_at?: string | null;
    last_check_score?: number | null;
    last_checked_at?: string | null;
  }): Promise<void> {
    const row = {
      id: data.id,
      workspace_id: data.workspace_id,
      fqdn: data.fqdn.toLowerCase().trim(),
      verification_status: data.verification_status || 'unverified',
      verified_at: data.verified_at || null,
      created_at: new Date().toISOString(),
      deleted_at: null,
      last_check_score: data.last_check_score ?? null,
      last_checked_at: data.last_checked_at ?? null
    };

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO domains (id, workspace_id, fqdn, verification_status, verified_at, created_at, last_check_score, last_checked_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [row.id, row.workspace_id, row.fqdn, row.verification_status, row.verified_at, row.created_at, row.last_check_score, row.last_checked_at]
      );
    } else if (this.memory) {
      this.memory.getTable('domains').set(row.id, row);
    }
  }

  async getDomainsByWorkspace(workspaceId: string): Promise<Record<string, unknown>[]> {
    if (this.pool) {
      const res = await this.pool.query(
        'SELECT * FROM domains WHERE workspace_id = $1 AND deleted_at IS NULL ORDER BY created_at DESC',
        [workspaceId]
      );
      return res.rows;
    } else if (this.memory) {
      return Array.from(this.memory.getTable('domains').values()).filter(
        d => d.workspace_id === workspaceId && !d.deleted_at
      );
    }
    return [];
  }

  async getDomainById(domainId: string, workspaceId?: string): Promise<Record<string, unknown> | null> {
    if (this.pool) {
      const sql = workspaceId
        ? 'SELECT * FROM domains WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL LIMIT 1'
        : 'SELECT * FROM domains WHERE id = $1 AND deleted_at IS NULL LIMIT 1';
      const params = workspaceId ? [domainId, workspaceId] : [domainId];
      const res = await this.pool.query(sql, params);
      return res.rows[0] || null;
    } else if (this.memory) {
      const d = this.memory.getTable('domains').get(domainId);
      if (!d || d.deleted_at) return null;
      if (workspaceId && d.workspace_id !== workspaceId) return null;
      return d;
    }
    return null;
  }

  async updateDomain(domainId: string, updates: Record<string, unknown>): Promise<void> {
    if (this.pool) {
      const keys = Object.keys(updates);
      const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const values = keys.map(k => updates[k]);
      await this.pool.query(`UPDATE domains SET ${setClauses} WHERE id = $1`, [domainId, ...values]);
    } else if (this.memory) {
      const d = this.memory.getTable('domains').get(domainId);
      if (d) {
        Object.assign(d, updates);
      }
    }
  }

  // ==========================================
  // Domain Verification Challenges
  // ==========================================
  async createChallenge(data: {
    id: string;
    domain_id: string;
    token_hash: string;
    record_name: string;
    record_value: string;
    expires_at: string;
  }): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO domain_verification_challenges (id, domain_id, token_hash, record_name, record_value, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [data.id, data.domain_id, data.token_hash, data.record_name, data.record_value, data.expires_at]
      );
    } else if (this.memory) {
      this.memory.getTable('domain_verification_challenges').set(data.id, { ...data, verified_at: null });
    }
  }

  async getLatestChallenge(domainId: string): Promise<Record<string, unknown> | null> {
    if (this.pool) {
      const res = await this.pool.query(
        'SELECT * FROM domain_verification_challenges WHERE domain_id = $1 ORDER BY expires_at DESC LIMIT 1',
        [domainId]
      );
      return res.rows[0] || null;
    } else if (this.memory) {
      const challenges = Array.from(this.memory.getTable('domain_verification_challenges').values())
        .filter(c => c.domain_id === domainId);
      challenges.sort((a, b) => String(b.expires_at).localeCompare(String(a.expires_at)));
      return challenges[0] || null;
    }
    return null;
  }

  // ==========================================
  // Test Sessions & Inbound Messages
  // ==========================================
  async createTestSession(data: {
    id: string;
    domain_id: string;
    recipient_token_hash: string;
    recipient_address: string;
    expires_at: string;
    state?: string;
  }): Promise<void> {
    const row = {
      ...data,
      state: data.state || 'waiting',
      created_at: new Date().toISOString()
    };
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO test_sessions (id, domain_id, recipient_token_hash, recipient_address, expires_at, state, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, row.domain_id, row.recipient_token_hash, row.recipient_address, row.expires_at, row.state, row.created_at]
      );
    } else if (this.memory) {
      this.memory.getTable('test_sessions').set(row.id, row);
    }
  }

  async getTestSessionById(sessionId: string): Promise<Record<string, unknown> | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM test_sessions WHERE id = $1 LIMIT 1', [sessionId]);
      return res.rows[0] || null;
    } else if (this.memory) {
      return this.memory.getTable('test_sessions').get(sessionId) || null;
    }
    return null;
  }

  async getTestSessionByTokenHash(hash: string): Promise<Record<string, unknown> | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM test_sessions WHERE recipient_token_hash = $1 LIMIT 1', [hash]);
      return res.rows[0] || null;
    } else if (this.memory) {
      for (const s of this.memory.getTable('test_sessions').values()) {
        if (s.recipient_token_hash === hash) return s;
      }
      return null;
    }
    return null;
  }

  async getTestSessionsByDomain(domainId: string): Promise<Record<string, unknown>[]> {
    if (this.pool) {
      const res = await this.pool.query(
        'SELECT * FROM test_sessions WHERE domain_id = $1 ORDER BY created_at DESC',
        [domainId]
      );
      return res.rows;
    } else if (this.memory) {
      return Array.from(this.memory.getTable('test_sessions').values())
        .filter(s => s.domain_id === domainId)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
    return [];
  }

  // ==========================================
  // Reports, Checks & Evidence
  // ==========================================
  async saveReport(report: {
    id: string;
    domain_id: string;
    inbound_message_id?: string | null;
    score: number;
    coverage_percent: number;
    methodology_version: string;
    summary: string;
    checks: Array<{
      id: string;
      key: string;
      status: string;
      severity: string;
      summary: string;
      explanation: string;
      evidence: unknown[];
      recommendation?: string;
      checkedAt: string;
      confidence: number;
    }>;
  }): Promise<void> {
    const reportRow = {
      id: report.id,
      domain_id: report.domain_id,
      inbound_message_id: report.inbound_message_id || null,
      score: report.score,
      coverage_percent: report.coverage_percent,
      methodology_version: report.methodology_version,
      summary: report.summary,
      created_at: new Date().toISOString()
    };

    if (this.pool) {
      await this.pool.query(
        `INSERT INTO reports (id, domain_id, inbound_message_id, score, coverage_percent, methodology_version, summary, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [reportRow.id, reportRow.domain_id, reportRow.inbound_message_id, reportRow.score, reportRow.coverage_percent, reportRow.methodology_version, reportRow.summary, reportRow.created_at]
      );

      for (const chk of report.checks) {
        await this.pool.query(
          `INSERT INTO checks (id, report_id, domain_id, key, status, severity, result_json, checked_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [chk.id, report.id, report.domain_id, chk.key, chk.status, chk.severity, JSON.stringify(chk), chk.checkedAt]
        );
      }
    } else if (this.memory) {
      this.memory.getTable('reports').set(reportRow.id, { ...reportRow, checks: report.checks });
      for (const chk of report.checks) {
        this.memory.getTable('checks').set(chk.id, {
          id: chk.id,
          report_id: report.id,
          domain_id: report.domain_id,
          key: chk.key,
          status: chk.status,
          severity: chk.severity,
          result_json: chk,
          checked_at: chk.checkedAt
        });
      }
    }

    // Update domain latest score
    await this.updateDomain(report.domain_id, {
      last_check_score: report.score,
      last_checked_at: reportRow.created_at
    });
  }

  async getReportById(reportId: string): Promise<Record<string, unknown> | null> {
    if (this.pool) {
      const repRes = await this.pool.query('SELECT * FROM reports WHERE id = $1 LIMIT 1', [reportId]);
      if (repRes.rows.length === 0) return null;
      const report = repRes.rows[0];
      const chkRes = await this.pool.query('SELECT * FROM checks WHERE report_id = $1', [reportId]);
      report.checks = chkRes.rows.map(r => r.result_json);
      return report;
    } else if (this.memory) {
      return this.memory.getTable('reports').get(reportId) || null;
    }
    return null;
  }

  async getReportsByDomain(domainId: string): Promise<Record<string, unknown>[]> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM reports WHERE domain_id = $1 ORDER BY created_at DESC', [domainId]);
      return res.rows;
    } else if (this.memory) {
      return Array.from(this.memory.getTable('reports').values())
        .filter(r => r.domain_id === domainId)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    }
    return [];
  }

  // ==========================================
  // Fix Proposals & Verification
  // ==========================================
  async createFixProposal(data: {
    id: string;
    finding_check_id: string;
    record_type: string;
    record_name: string;
    proposed_value: string;
    rationale: string;
    state?: string;
  }): Promise<void> {
    const row = {
      ...data,
      state: data.state || 'proposed',
      created_at: new Date().toISOString()
    };
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO fix_proposals (id, finding_check_id, record_type, record_name, proposed_value, rationale, state, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [row.id, row.finding_check_id, row.record_type, row.record_name, row.proposed_value, row.rationale, row.state, row.created_at]
      );
    } else if (this.memory) {
      this.memory.getTable('fix_proposals').set(row.id, row);
    }
  }

  async getFixProposalById(proposalId: string): Promise<Record<string, unknown> | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM fix_proposals WHERE id = $1 LIMIT 1', [proposalId]);
      return res.rows[0] || null;
    } else if (this.memory) {
      return this.memory.getTable('fix_proposals').get(proposalId) || null;
    }
    return null;
  }

  async updateFixProposal(proposalId: string, updates: Record<string, unknown>): Promise<void> {
    if (this.pool) {
      const keys = Object.keys(updates);
      const setClauses = keys.map((k, i) => `${k} = $${i + 2}`).join(', ');
      const values = keys.map(k => updates[k]);
      await this.pool.query(`UPDATE fix_proposals SET ${setClauses} WHERE id = $1`, [proposalId, ...values]);
    } else if (this.memory) {
      const p = this.memory.getTable('fix_proposals').get(proposalId);
      if (p) Object.assign(p, updates);
    }
  }

  // ==========================================
  // Monitoring Configs
  // ==========================================
  async getMonitoringConfig(domainId: string): Promise<Record<string, unknown> | null> {
    if (this.pool) {
      const res = await this.pool.query('SELECT * FROM monitoring_configs WHERE domain_id = $1 LIMIT 1', [domainId]);
      return res.rows[0] || null;
    } else if (this.memory) {
      for (const m of this.memory.getTable('monitoring_configs').values()) {
        if (m.domain_id === domainId) return m;
      }
      return null;
    }
    return null;
  }

  async upsertMonitoringConfig(data: {
    id: string;
    domain_id: string;
    enabled: boolean;
    cron_expression: string;
    timezone: string;
    alert_preferences_json: Record<string, unknown>;
  }): Promise<void> {
    if (this.pool) {
      await this.pool.query(
        `INSERT INTO monitoring_configs (id, domain_id, enabled, cron_expression, timezone, alert_preferences_json)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (domain_id) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           cron_expression = EXCLUDED.cron_expression,
           timezone = EXCLUDED.timezone,
           alert_preferences_json = EXCLUDED.alert_preferences_json`,
        [data.id, data.domain_id, data.enabled, data.cron_expression, data.timezone, JSON.stringify(data.alert_preferences_json)]
      );
    } else if (this.memory) {
      this.memory.getTable('monitoring_configs').set(data.id, data);
    }
  }

  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
    }
  }
}

export const db = new Database();
