# Deployment checklist

- Deploy `apps/api` and `apps/web` as Node.js services.
- Deploy a separate Node.js BullMQ worker process.
- Provision PostgreSQL and Redis with backups and TLS.
- Configure inbound provider on a dedicated subdomain and verify webhook signatures.
- Add DNS ownership verification and mail test recipient MX/webhook routing.
- Set strict CORS, trusted proxy settings, rate limits and body limits.
- Configure secrets via deployment secret manager, never commit `.env`.
- Enable structured logs with redaction, metrics, traces and alerting.
- Run migrations before new app version receives traffic.
- Verify retention/deletion jobs and backup restore procedure.
- Confirm whether chosen host supports port 25 before any self-hosted SMTP plan; provider webhook is recommended.
