-- Preflight Master Database Schema (PostgreSQL 16+)
-- All timestamps are UTC. Tenant isolation enforced on workspace_id.

CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(64) PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT,
  name VARCHAR(255),
  auth_provider_id VARCHAR(255),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspaces (
  id VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id VARCHAR(64) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(32) NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS domains (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  fqdn VARCHAR(255) NOT NULL,
  verification_status VARCHAR(32) NOT NULL DEFAULT 'unverified',
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMPTZ,
  last_check_score INT,
  last_checked_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_domains_workspace ON domains(workspace_id);
CREATE INDEX IF NOT EXISTS idx_domains_fqdn ON domains(fqdn);

CREATE TABLE IF NOT EXISTS domain_verification_challenges (
  id VARCHAR(64) PRIMARY KEY,
  domain_id VARCHAR(64) NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  token_hash VARCHAR(128) NOT NULL,
  record_name VARCHAR(255) NOT NULL,
  record_value VARCHAR(255) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  verified_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_challenges_domain ON domain_verification_challenges(domain_id);

CREATE TABLE IF NOT EXISTS dkim_selectors (
  id VARCHAR(64) PRIMARY KEY,
  domain_id VARCHAR(64) NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  selector VARCHAR(63) NOT NULL,
  source VARCHAR(32) NOT NULL DEFAULT 'user',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dkim_domain ON dkim_selectors(domain_id);

CREATE TABLE IF NOT EXISTS test_sessions (
  id VARCHAR(64) PRIMARY KEY,
  domain_id VARCHAR(64) NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  recipient_token_hash VARCHAR(128) NOT NULL UNIQUE,
  recipient_address VARCHAR(255) NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'waiting',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_test_sessions_hash ON test_sessions(recipient_token_hash);
CREATE INDEX IF NOT EXISTS idx_test_sessions_domain ON test_sessions(domain_id);

CREATE TABLE IF NOT EXISTS inbound_messages (
  id VARCHAR(64) PRIMARY KEY,
  test_session_id VARCHAR(64) NOT NULL REFERENCES test_sessions(id) ON DELETE CASCADE,
  provider_message_id VARCHAR(255),
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  from_domain VARCHAR(255) NOT NULL,
  subject_redacted VARCHAR(255) NOT NULL,
  header_json_encrypted TEXT NOT NULL,
  body_discarded_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  parse_status VARCHAR(32) NOT NULL DEFAULT 'parsed',
  dedupe_key VARCHAR(128) UNIQUE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inbound_session ON inbound_messages(test_session_id);

CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(64) PRIMARY KEY,
  domain_id VARCHAR(64) NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  inbound_message_id VARCHAR(64) REFERENCES inbound_messages(id) ON DELETE SET NULL,
  score INT NOT NULL,
  coverage_percent INT NOT NULL,
  methodology_version VARCHAR(32) NOT NULL,
  summary TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reports_domain ON reports(domain_id);

CREATE TABLE IF NOT EXISTS checks (
  id VARCHAR(64) PRIMARY KEY,
  report_id VARCHAR(64) REFERENCES reports(id) ON DELETE CASCADE,
  domain_id VARCHAR(64) NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  key VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL,
  severity VARCHAR(32) NOT NULL,
  result_json JSONB NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_checks_report ON checks(report_id);
CREATE INDEX IF NOT EXISTS idx_checks_domain ON checks(domain_id);

CREATE TABLE IF NOT EXISTS evidence (
  id VARCHAR(64) PRIMARY KEY,
  check_id VARCHAR(64) NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  source VARCHAR(32) NOT NULL,
  name VARCHAR(255) NOT NULL,
  observed_value_redacted JSONB NOT NULL,
  expected_value JSONB,
  resolver VARCHAR(255),
  observed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_evidence_check ON evidence(check_id);

CREATE TABLE IF NOT EXISTS fix_proposals (
  id VARCHAR(64) PRIMARY KEY,
  finding_check_id VARCHAR(64) NOT NULL REFERENCES checks(id) ON DELETE CASCADE,
  record_type VARCHAR(16) NOT NULL,
  record_name VARCHAR(255) NOT NULL,
  proposed_value TEXT NOT NULL,
  rationale TEXT NOT NULL,
  state VARCHAR(32) NOT NULL DEFAULT 'proposed',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_fix_proposals_check ON fix_proposals(finding_check_id);

CREATE TABLE IF NOT EXISTS verification_runs (
  id VARCHAR(64) PRIMARY KEY,
  fix_proposal_id VARCHAR(64) NOT NULL REFERENCES fix_proposals(id) ON DELETE CASCADE,
  state VARCHAR(32) NOT NULL DEFAULT 'in_progress',
  attempts INT NOT NULL DEFAULT 0,
  last_observed_value TEXT,
  next_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_verification_proposal ON verification_runs(fix_proposal_id);

CREATE TABLE IF NOT EXISTS monitoring_configs (
  id VARCHAR(64) PRIMARY KEY,
  domain_id VARCHAR(64) NOT NULL REFERENCES domains(id) ON DELETE CASCADE UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT true,
  cron_expression VARCHAR(64) NOT NULL DEFAULT '0 * * * *',
  timezone VARCHAR(64) NOT NULL DEFAULT 'UTC',
  alert_preferences_json JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS domain_snapshots (
  id VARCHAR(64) PRIMARY KEY,
  domain_id VARCHAR(64) NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
  snapshot_json JSONB NOT NULL,
  score INT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_snapshots_domain ON domain_snapshots(domain_id);

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret_encrypted TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  event_types JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_webhooks_workspace ON webhook_endpoints(workspace_id);

CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id VARCHAR(64) PRIMARY KEY,
  endpoint_id VARCHAR(64) NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  event_id VARCHAR(64) NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  attempts INT NOT NULL DEFAULT 0,
  response_code INT,
  next_attempt_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id VARCHAR(64) PRIMARY KEY,
  workspace_id VARCHAR(64) NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  actor_id VARCHAR(64) NOT NULL,
  action VARCHAR(128) NOT NULL,
  resource_type VARCHAR(64) NOT NULL,
  resource_id VARCHAR(64) NOT NULL,
  metadata_redacted JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_workspace ON audit_logs(workspace_id);
