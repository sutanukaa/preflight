# Preflight

**Email health, verified.** Preflight is a Node.js-first deliverability hygiene copilot. It receives a real test message, evaluates authentication and transport evidence, guides DNS remediation, then monitors the domain for regressions.

> Important: this repository is a starter scaffold, not a production-ready deliverability service. The dashboard currently contains representative workspace data. DNS endpoints are real Node.js lookups; inbound email parsing, persistence, authentication, AI remediation and scheduled monitoring are intentionally marked as implementation tasks in `AGENT_BUILD_SPEC.md`. Never represent sample dashboard values as live results.

## Mandatory runtime
- Node.js 22.12+ (Node.js is mandatory; no Python backend)
- npm 10+
- PostgreSQL 16+
- Redis 7+

## Quick start
1. Install Node.js 22.12 or newer.
2. Copy `.env.example` to `.env` and configure secrets.
3. From this directory run `npm install`.
4. Start PostgreSQL and Redis (see `infra/docker-compose.yml`).
5. Run `npm run dev`.
6. Open the Vite app at `http://localhost:5173`; API health is at `http://localhost:4000/health`; OpenAPI UI is at `http://localhost:4000/docs`.

The UI includes a functional DNS-check action against the local API. The unique test inbox is a visual placeholder until an inbound provider adapter is configured. Use a provider such as Postmark, Mailgun or Cloudflare Email Routing to forward inbound messages to a webhook; this avoids relying on port 25 on typical app hosts.

## Workspace map
- `AGENT_BUILD_SPEC.md` — canonical implementation brief for an autonomous coding agent.
- `BRAND_IDENTITY.md` — visual identity, UI system, typography, colour, and anti-slop rules.
- `apps/api` — Fastify / TypeScript Node.js API, DNS resolver and OpenAPI.
- `apps/web` — React / Vite dashboard and custom UI styling.
- `packages/shared` — Zod contracts shared across apps.
- `docs/` — data model, checks, API and evaluation plans.
- `infra/` — local PostgreSQL + Redis services.

## Commands
```bash
npm install
npm run dev
npm run typecheck
npm run build
npm test
```

## Deployment shape
Deploy the web app and API as Node.js services. For inbound email, configure a dedicated subdomain and an inbound email provider that posts raw MIME or parsed headers to the API. Verify webhook signatures, enforce idempotency, limit payload size, and encrypt sensitive stored message data. Run BullMQ workers separately from the API process. Keep SMTP receiving infrastructure separate if operating your own MTA; port 25 availability must be confirmed with the host.

## Product promise
Preflight tests email authentication and sending-domain hygiene. It does **not** predict Gmail/Outlook inbox placement, guarantee inbox delivery, or replace reputation and content testing. Explain this distinction in onboarding, reports and marketing.
