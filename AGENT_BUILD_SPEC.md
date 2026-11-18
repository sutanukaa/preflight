# PRELIGHT — MASTER BUILD SPEC FOR AI CODING AGENTS

This file is the canonical product and engineering instruction set. Read it fully, then inspect the repository before changing code. Implement in small vertical slices. Do not silently omit requirements or fake integrations.

## 0. Mission and operating rules

Build **Preflight**, an evidence-first email deliverability hygiene copilot. A user sends a real message to a unique per-test address; Preflight parses the message and independently resolves DNS; the product produces a scored report with evidence; an AI-assisted fix workflow proposes safe DNS changes and verifies them after the user applies them; scheduled checks detect drift and notify users.

**Mandatory technology:** Node.js + TypeScript for every server-side component, worker, CLI and test harness. Never introduce Python, PHP, Go, Ruby or a serverless function in another language. Frontend may use TypeScript/React. Prefer npm workspaces.

Core principles:
1. Evidence before explanation. Every technical claim must link to raw header or DNS evidence and a timestamp.
2. No invented pass states. Missing evidence is `unknown`, not `pass`.
3. AI is an explainer/planner, never the source of truth. Tool outputs determine findings.
4. DNS advice is advisory and requires explicit user approval; never edit DNS automatically in MVP.
5. Be honest about limits: hygiene is not inbox placement.
6. Privacy by design: minimise raw message retention, redact bodies, encrypt sensitive data, never log message content or credentials.
7. Production-grade UX: loading, empty, error, success, stale and permission states must be designed, not left blank.

## 1. Product scope and release priorities

### P0 — required MVP
- Workspace and user authentication; domain ownership verification (DNS TXT challenge).
- Add domain and optional DKIM selector. Explain selector discovery from a received `DKIM-Signature: s=...` header; do not claim selectors can be enumerated.
- Unique test address generated with cryptographically secure randomness and expiry/rate controls.
- Inbound email adapter (choose provider webhook first; support raw MIME where possible). Verify provider signature, parse message with `mailparser`, preserve a redacted header evidence record.
- Header checks: SPF result, DKIM result(s), DMARC result, SPF/DKIM alignment with visible From domain, TLS evidence when available, List-Unsubscribe and List-Unsubscribe-Post, Received chain, Return-Path, From, Message-ID, MIME structure, malformed/missing headers.
- Independent DNS checks: SPF, DMARC, supplied DKIM selector, MX, recursive SPF lookup count, SPF syntax/duplicate policy, DMARC tags and policy, DNS resolution errors.
- Deterministic scoring engine with per-check weights and transparent deductions. Score must be derived only from known checks; display coverage and unknown count beside score.
- Report page with verdict, evidence, severity, exact next action, source, checked time and limitations.
- Fix-it guide that generates proposed DNS records from deterministic templates and current evidence. Verify by polling DNS with bounded exponential backoff and a manual “Check again” action.
- Domain monitoring schedule via BullMQ + Redis; store snapshots and detect changes; email + generic webhook alerts. Slack integration can be added after generic webhook.
- OpenAPI spec, Zod validation, structured errors, rate limiting, audit log, tests and eval suite.

### P1 — next
- DMARC aggregate report mailbox ingestion and safe XML parsing (disable external entities; defend against XML bombs); source inventory and alignment dashboard.
- Workspaces / agency multi-tenant client domain management, roles and audit exports.
- API keys, usage limits, `report.completed` and `domain.drift_detected` signed webhooks.
- Slack notification channel.

### Explicit non-goals
- Spam-score prediction presented as fact.
- Guaranteed inbox placement.
- Sending campaigns or cold outreach.
- Automatic DNS mutation in first release.
- Enumerating DKIM selectors.
- Storing full email bodies indefinitely.

## 2. Required architecture

Use a TypeScript monorepo:
- `apps/web`: React + Vite + TypeScript; accessible responsive dashboard.
- `apps/api`: Fastify 5 Node.js REST API, OpenAPI, Zod, auth, DNS checks, inbound webhook.
- `apps/worker`: Node.js BullMQ workers for scheduled checks, propagation verification, webhook delivery and notification retry. Create this workspace when implementing.
- `packages/shared`: Zod schemas, types, score definitions and shared error contracts.
- PostgreSQL for durable data; Redis for BullMQ and short-lived jobs.
- `mailparser` for MIME parsing. `smtp-server` is optional only if self-hosting SMTP on a VPS; default to provider webhook.
- `node:dns/promises` for TXT/MX/A/AAAA resolution. Use a resolver adapter so tests can mock DNS and production can set resolvers/timeouts.
- AI provider behind an interface (`AIProvider`). AI calls must receive structured evidence only, never secrets or full body. Validate output with Zod. If AI unavailable, deterministic fix templates still work.

Use migrations (Prisma or Drizzle; choose one and apply consistently). Add tenant scoping to every query. All IDs should be UUIDs or opaque random IDs. Use UTC timestamps.

## 3. User journeys

### First-run onboarding
1. Create account/workspace.
2. Add sending domain.
3. Verify ownership using generated TXT record; poll and show DNS propagation states.
4. Show generated test inbox address and clear instructions to send a message from the actual sending platform.
5. Receive message, show processing state, then report.
6. Explain findings and propose one safe next step at a time.
7. Enable monitoring and choose alert destination.

### Test message journey
- Test inbox screen shows copyable address, expiry, allowed senders/domain, status and “Send a test email” instructions.
- On receipt: verify provider webhook signature; map opaque recipient token to workspace/domain/test session; enforce max message size; dedupe provider event; parse; extract relevant headers; run independent DNS checks; calculate score; persist report; enqueue `report.completed` event.
- Show received timestamp and sender, never expose full message body by default.

### Fix journey
- Finding explains: what was observed, why it matters, confidence, affected mail path, and safe change.
- Show DNS record editor with host/name, type, value, TTL, copy action, and warning if a change could break an existing record.
- SPF must be merged into the existing SPF record; never instruct users to publish a second SPF TXT record. Detect include expansion and 10-DNS-lookup limit. Do not blindly append includes.
- DMARC progression should be staged: `p=none` -> review aggregate reports -> `p=quarantine` with controlled pct -> `p=reject`. Warn about legitimate third-party senders and alignment before enforcement.
- DKIM: selector is obtained from message signature or supplied by user; show selector-specific record only when known. Do not invent provider key material.
- User clicks “I've published this record”; poll DNS and compare exact expected semantic values; show propagation state. Stop after bounded attempts and explain resolver/cache caveats.
- Save before/after snapshots and score delta. Never say fixed until resolver evidence confirms.

## 4. Technical checks and evidence model

Implement each check as a pure/testable function returning:
`{ key, status: pass|warning|fail|unknown, severity, summary, explanation, evidence[], recommendation?, checkedAt, confidence }`.

Evidence item shape: `{ source: header|dns|derived, name, observedValue, expectedValue?, resolver?, observedAt, rawReference? }`. Do not persist unnecessary secrets. Store redacted raw values or hashes where appropriate.

### Authentication
- SPF: use Authentication-Results header from trusted receiving infrastructure when available; do not trust arbitrary sender-supplied Authentication-Results. Cross-check DNS policy. Detect no record, multiple records, syntax error, `permerror`, `temperror`, and recursive DNS lookup count >10. Track void lookups and loops. Do not count mechanisms incorrectly; document RFC interpretation.
- DKIM: parse every DKIM-Signature; extract `d=` and `s=`; compare with trusted Authentication-Results `dkim=pass/fail`. DNS TXT lookup `<selector>._domainkey.<d-domain>`. Do not claim cryptographic signature verification unless actually implemented with a vetted library and canonicalization support.
- DMARC: trusted auth result plus DNS `_dmarc.<from-domain>`. Parse `p`, `sp`, `pct`, `rua`, `ruf`, `adkim`, `aspf`. Alignment is relaxed by default; strict alignment requires exact domain equality. Evaluate SPF/DKIM aligned pass according to DMARC semantics.
- Alignment: compare RFC5322 From organizational domain against SPF-authenticated MAIL FROM domain and DKIM `d=` domain; implement Public Suffix List aware organizational domain logic. Do not naïvely compare last two labels.

### Transport and message structure
- TLS: only report transport TLS when trusted provider/receiver evidence exists; Received headers alone may be incomplete or forged. State source and confidence.
- Received chain: parse in order, display hop, host, timestamp and TLS hints; flag malformed/untrusted segments, never infer guaranteed path authenticity.
- List-Unsubscribe: detect header; parse mailto and HTTPS URIs; detect `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Explain relevance for bulk senders and applicable provider requirements.
- Message structure: MIME type, multipart/alternative, text/plain and text/html presence, attachment count/types, malformed boundaries, header size. Avoid judging marketing copy as inbox-placement prediction.
- Return-Path, Message-ID, From and Date presence/shape; display evidence.

### DNS
- SPF TXT at domain; DMARC TXT at `_dmarc.domain`; DKIM TXT at supplied/signature selector; MX. Optionally A/AAAA for hostnames.
- Multiple SPF records is a hard fail; no SPF should be fail or warning depending on domain's sending intent, but explain.
- DNS timeout/SERVFAIL is unknown/temporary, not fail.
- Cache TTL and resolver metadata. DNS propagation check uses multiple public resolvers only if operationally available; report resolver-specific disagreement.

## 5. Score design

Use a transparent weighted score (initial weights are a product decision and must be documented):
- SPF policy + lookup budget: 20
- DKIM observed pass and selector DNS: 20
- DMARC policy + aligned authentication: 25
- SPF/DKIM alignment: 15
- Transport evidence: 8
- List-Unsubscribe where applicable: 5
- Message structure / baseline headers: 7
Total 100.

Unknown checks must reduce coverage, not automatically count as zero or full points. Show `score`, `coveragePercent`, `passed`, `warnings`, `failed`, `unknown`. For score comparison, compare same check-set/version; label methodology version. Avoid a single green badge that hides unknown checks.

## 6. API contract

Prefix `/v1`. Every endpoint requires auth except provider webhooks and health. Use cursor pagination, idempotency and consistent error envelope.

- `GET /health`
- `POST /v1/workspaces`
- `GET /v1/workspaces/:workspaceId`
- `POST /v1/domains` — `{ domain }`
- `GET /v1/domains`
- `GET /v1/domains/:domainId`
- `POST /v1/domains/:domainId/verification` — issue DNS TXT challenge
- `POST /v1/domains/:domainId/verification/check`
- `POST /v1/domains/:domainId/checks` — run immediate DNS check
- `GET /v1/domains/:domainId/checks`
- `POST /v1/domains/:domainId/test-sessions` — issue unique inbound recipient
- `GET /v1/test-sessions/:sessionId`
- `POST /v1/inbound/:provider` — signature-verified inbound webhook
- `GET /v1/reports/:reportId`
- `GET /v1/reports/:reportId/findings`
- `POST /v1/findings/:findingId/fix-proposals`
- `POST /v1/fix-proposals/:proposalId/verification` — start verify loop
- `GET /v1/fix-proposals/:proposalId/verification`
- `POST /v1/domains/:domainId/monitoring` — enable/configure schedule
- `GET /v1/domains/:domainId/monitoring`
- `POST /v1/webhook-endpoints`
- `POST /v1/webhook-endpoints/:id/test`
- `GET /v1/events`

Errors: `{ error: { code, message, requestId, details? } }`. Validation failures return 400 with field paths. Auth 401/403, missing 404, conflict 409, rate-limit 429, provider temporary failures 503. OpenAPI must be generated from route schemas and published at `/docs`.

## 7. Data model

Required tables (add indexes, foreign keys and tenant isolation):
- `users`: id, email, password_hash or auth_provider_id, created_at.
- `workspaces`: id, name, created_at.
- `workspace_members`: workspace_id, user_id, role, created_at.
- `domains`: id, workspace_id, fqdn, verification_status, verified_at, created_at, deleted_at.
- `domain_verification_challenges`: id, domain_id, token_hash, record_name, record_value, expires_at, verified_at.
- `dkim_selectors`: id, domain_id, selector, source (user|message), first_seen_at, last_seen_at.
- `test_sessions`: id, domain_id, recipient_token_hash, recipient_address, expires_at, state, created_at.
- `inbound_messages`: id, test_session_id, provider_message_id, received_at, from_domain, subject_redacted, header_json_encrypted, body_discarded_at, parse_status, dedupe_key.
- `reports`: id, domain_id, inbound_message_id nullable, score, coverage_percent, methodology_version, summary, created_at.
- `checks`: id, report_id nullable, domain_id, key, status, severity, result_json, checked_at.
- `evidence`: id, check_id, source, name, observed_value_redacted, expected_value, resolver, observed_at.
- `fix_proposals`: id, finding_check_id, record_type, record_name, proposed_value, rationale, state, created_at.
- `verification_runs`: id, fix_proposal_id, state, attempts, last_observed_value, next_attempt_at, completed_at.
- `monitoring_configs`: id, domain_id, enabled, cron_expression, timezone, alert_preferences_json.
- `domain_snapshots`: id, domain_id, snapshot_json, score, created_at.
- `webhook_endpoints`: id, workspace_id, url, secret_encrypted, enabled, event_types.
- `webhook_deliveries`: id, endpoint_id, event_id, status, attempts, response_code, next_attempt_at.
- `audit_logs`: id, workspace_id, actor_id, action, resource_type, resource_id, metadata_redacted, created_at.

Use retention jobs for inbound messages and audit policy. Never store raw passwords, DNS provider credentials, or API secrets in plaintext.

## 8. UI and interaction requirements

Read `BRAND_IDENTITY.md` before styling. Treat its design system as binding.

### Main information architecture
- Overview: health score + coverage, top actionable finding, test inbox, monitored domains, recent activity, next scheduled check.
- Domains: table/list with status, score, last checked, add domain flow, domain detail tabs (Overview, Authentication, DNS records, History, Settings).
- Test inbox: unique address, copy, expiry, send instructions, incoming message timeline, processing state.
- Report detail: summary, score breakdown, check list, evidence drawer, Received chain, message headers, recommendations.
- Fix workflow: before/after DNS record, copy value, instructions by DNS host, user confirmation, propagation timeline.
- Monitoring: schedule, last successful run, drift events, alert routing.
- API & webhooks: API keys (one-time reveal), webhook endpoints, event delivery logs, OpenAPI docs.
- Settings: workspace members, security, retention, notifications.

### Overview layout
- Fixed left rail 240–248px; top bar 64px; content max width 1360px.
- Heading + one primary action.
- First row: health score card, monitored domains metric, last check/next check.
- Second row: actionable findings and test inbox.
- Third row: domain health table and recent activity.
- Do not overload cards. Use hairline borders and restrained surfaces, not cards nested in cards.

### Report detail hierarchy
1. Verdict + score + coverage + check timestamp.
2. Critical blockers and warnings, ordered by impact.
3. Authentication matrix SPF / DKIM / DMARC and alignment.
4. Evidence accordion with exact observed values and source.
5. Transport / Received chain timeline.
6. Message structure and unsubscribe checks.
7. Fix next step with copyable DNS record.
8. Explicit “What this report cannot tell you” notice.

### Interaction quality
- All buttons must work; no dead CTAs.
- Copy actions show copied state and accessible label.
- Every asynchronous operation has loading, disabled, success and error states.
- Confirm destructive actions and DNS risk actions.
- Keyboard navigation, visible focus, semantic HTML, WCAG AA contrast, reduced-motion support.
- Responsive at 1440, 1024, 768 and 375px. Tables collapse to readable stacked rows on mobile.
- Use realistic sample data only in a clearly labelled demo workspace. Production views must be API-backed.
- Avoid fake live indicators, fake activity, fabricated testimonials, fake customer logos or invented metrics.

## 9. AI agent design and safety

Expose deterministic tools to the agent:
- `lookup_txt(name)`
- `lookup_mx(name)`
- `lookup_a(name)`
- `parse_received_message(messageId)`
- `get_check_evidence(checkId)`
- `calculate_spf_lookup_count(domain)`
- `create_fix_proposal(findingId)`
- `start_dns_verification(proposalId)`

Agent flow:
1. Fetch authoritative tool evidence.
2. Build a typed evidence bundle.
3. Ask model for a constrained explanation and action plan.
4. Validate output with Zod: referenced check IDs must exist; claims must cite evidence IDs; proposed DNS values must be consistent with deterministic templates; no claim may contradict a failed/unknown tool result.
5. Reject invalid output and fall back to deterministic copy.
6. Persist model, prompt version, evidence IDs, validation outcome and output for audit.

Agent must never:
- Invent a DKIM selector or public key.
- Tell user to add a second SPF record.
- Recommend `p=reject` without staged rollout and review of legitimate senders.
- Claim Gmail inbox placement or guarantee delivery.
- Claim TLS based only on an untrusted header.
- Treat sender-supplied Authentication-Results as trusted.
- Perform DNS mutations or send external notifications without user configuration/approval.

## 10. Monitoring and alert behaviour

BullMQ queues: `domain-checks`, `dns-verification`, `webhook-delivery`, `email-alerts`, `retention`.
- Use deterministic repeat schedules, timezone support and per-domain jitter.
- Prevent overlapping checks for same domain; use idempotency keys.
- Compare normalized snapshots, not raw ordering of DNS answers.
- Detect SPF policy change, lookup budget crossing, missing DKIM selector, DMARC downgrade, MX changes and authentication regression.
- Alert includes what changed, old/new evidence, when detected, impact, recommended next step, report link.
- Retry transient provider failures with exponential backoff + jitter; dead-letter after configured attempts; surface delivery status.
- Do not alert on every TTL reorder or insignificant TXT formatting difference.

## 11. Security and privacy checklist

- Validate domain names and prevent SSRF: no arbitrary URL fetches from DNS or webhook payloads; webhook target allowlist/private IP protections.
- Verify inbound provider signatures with constant-time comparison.
- Rate-limit test inbox creation, DNS checks and API requests.
- Use random high-entropy recipient tokens; store only hash for lookup.
- Prevent cross-tenant IDOR with workspace-scoped authorization in every handler.
- Encrypt secrets and sensitive header data at rest; redact logs.
- Limit MIME size, attachment count and parsing time; never execute attachments.
- XML parser hardened against XXE/entity expansion for DMARC reports.
- CSRF protection where cookie sessions are used; secure cookies; CSP; Helmet.
- Audit sensitive actions and webhook endpoint changes.
- Document data retention and deletion.

## 12. Test and evaluation plan

### Unit tests
- SPF parser: valid, absent, duplicate, syntax error, nested include, redirect, loop, >10 lookups, void lookup, DNS temperror.
- DMARC parser: missing, invalid, p=none/quarantine/reject, pct, strict/relaxed alignment tags, subdomain policy.
- DKIM selector extraction and selector DNS lookup; multiple signatures.
- Alignment with subdomains and public suffix edge cases.
- Received chain parsing, malformed headers, multiple hops.
- List-Unsubscribe variants and one-click post.
- Score unknown/coverage behaviour and methodology versioning.
- Zod invalid inputs and field-level errors.

### Integration tests
- Webhook signature valid/invalid; duplicate event idempotency; oversized MIME; malformed message; wrong recipient token; expired test session.
- DNS resolver timeout/SERVFAIL; stale cache; conflicting resolver answers.
- BullMQ retry, duplicate schedule, job lock and drift event.
- Tenant isolation and authorization matrix.

### AI evals (must be automated)
Create at least 30 fixtures of evidence bundles. Assert:
- Every technical claim cites evidence IDs.
- No claim says SPF pass when SPF tool says fail/unknown.
- No recommendation creates a second SPF TXT record.
- No invented DKIM selector/key.
- No unsupported TLS assertion.
- No inbox-placement guarantee.
- No DMARC enforcement escalation without staged-rollout warning.
- AI output parses against schema; otherwise deterministic fallback is used.

### Quality gates
`npm run typecheck`, `npm run build`, `npm test`, lint, dependency audit and API contract tests must pass. CI must block merge if eval assertions fail.

## 13. Definition of done

A demo user can add and verify a domain, generate a unique test recipient, send a real email through a configured inbound provider, receive a report built from parsed headers and live DNS, inspect evidence, receive a safe DNS fix proposal, publish it manually, trigger DNS re-verification, observe a before/after score with coverage, enable scheduled monitoring, and receive a real drift webhook/email alert. Every result is honest, reproducible, tenant-isolated and auditable. No sample value is presented as live.

## 14. Suggested implementation sequence

1. Review starter; make shared types and database migrations.
2. Authentication, workspace, domain CRUD and TXT verification.
3. DNS resolver adapter + unit tests + SPF/DMARC/DKIM checks.
4. Inbound provider adapter + MIME parsing + trusted header strategy.
5. Deterministic report/scoring + report UI backed by API.
6. Test inbox UX and end-to-end real-message demo.
7. Fix proposals + DNS verification loop.
8. BullMQ monitoring + snapshots + drift detection.
9. Notifications + signed webhooks + retries.
10. AI explanation with strict evidence validation and eval suite.
11. Security hardening, observability, docs, deployment runbook.

At each stage update README and tests. Do not replace functional code with mock screens. Keep the dashboard visual language consistent with `BRAND_IDENTITY.md`.
