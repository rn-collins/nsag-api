# NSAG Estate Audit — Atlas Integration

Date: 2026-07-19

## Repository findings

### `nsag-admin`

- Private repository; default branch `main`.
- Extremely small static application rather than a framework-based admin system.
- Current interface is a single `index.html` lead-intelligence dashboard.
- It asks for an admin key in the browser and transmits that key in the URL query string to `nsag-api`.
- It calls a hard-coded production API URL and refreshes lead data every sixty seconds.
- It is suitable as a disposable prototype, not as the long-term Atlas administration application.

### `nsag-api`

- Private repository; default branch `main`.
- Vercel serverless JavaScript endpoints rather than a framework application.
- Current responsibilities include lead capture, Upstash Redis storage, Resend email, Slack alerts, HubSpot synchronization, administrative lead retrieval, research/digest functions and Vercel cron.
- Latest production deployments are successful.
- Existing endpoints must remain operational while the Atlas database layer is added.

### `nsag-site`

- Private repository connected to a public Vercel deployment.
- Static public site centered in `public/index.html`.
- Latest GitHub-triggered deployment is blocked, while prior production deployments are ready.
- It must not contain private Atlas workbooks, unrestricted CSVs, service-role credentials, outreach data or internal research hypotheses.

## Security findings requiring remediation

1. `nsag-admin` places `NSAG_ADMIN_KEY` in a query string.
2. `nsag-api/api/admin.js` compares a shared secret supplied through `req.query.key`.
3. Administrative endpoints allow `Access-Control-Allow-Origin: *`.
4. The admin frontend is not using authenticated user sessions or role-based authorization.
5. The API returns all collected lead records to anyone possessing the shared key.
6. Lead capture accepts broad browser requests and does not currently show rate limiting, CAPTCHA, origin allowlisting or explicit consent/version fields.
7. Some integrations are attempted without first checking that all optional environment variables exist.
8. The current Upstash list/set model does not provide relational integrity, record versioning, granular permissions or a durable evidence model.

These findings do not mean the existing prototype must be shut down immediately. They mean the Atlas must not inherit this authentication or storage pattern.

## Integration decision

- Preserve all existing endpoints during the first Atlas migration.
- Add Supabase migrations in `nsag-api` through a separate branch and pull request.
- Do not commit the frozen workbook or private CSV package to GitHub.
- Build the new admin application in `nsag-admin` only after database provisioning and reconciliation.
- Replace query-string administrative authentication with Supabase Auth and row-level security.
- Expose public Atlas records through publication-safe database views only.
- Audit `nsag-m1`–`nsag-m15` separately before consolidation or archival.

## Immediate gates

1. Review SQL schema and RLS policies.
2. Provision a Supabase development project.
3. apply migrations only in development.
4. Run staging import and reconciliation.
5. Complete privacy review.
6. Approve the database as authoritative.
7. Rebuild `nsag-admin` around authenticated database access.
