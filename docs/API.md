# API implementation notes

The running Fastify app currently exposes:
- `GET /health`
- `POST /v1/checks/dns` with `{ "domain": "example.com", "selector": "selector1" }`
- `POST /v1/inbound/provider-webhook` placeholder protected by `x-preflight-webhook-secret`
- `/docs` OpenAPI UI

The complete target API contract is in `../AGENT_BUILD_SPEC.md`. Before production, add auth, tenant scoping, database persistence, provider-specific signature verification, request schemas for every route and webhook idempotency. Do not expose the placeholder webhook as a working inbound integration.
