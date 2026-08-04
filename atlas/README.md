# Hawaiʻi Atlas Production Integration

This branch introduces the production foundation for the Hawaiʻi Universal Responsible-Technology Case Atlas without changing the existing NSAG lead-capture endpoints.

## Existing API preserved

The current `api/lead.js`, `api/admin.js`, `api/dru.js`, digest functions, Upstash data, Resend integration, Slack notifications, and HubSpot integration remain untouched during the Atlas migration.

## Target architecture

- **Supabase PostgreSQL** becomes the Atlas source of truth after migration reconciliation.
- **nsag-api** owns database migrations, protected APIs, monitoring jobs, validation, and exports.
- **nsag-admin** becomes the private Atlas operating interface.
- **nsag-site** receives approved public records only through publication-safe views.
- Existing `nsag-m1`–`nsag-m15` projects remain independent until a separate consolidation audit.

## Migration baseline

Frozen workbook: `Hawaii_Atlas_Migration_Baseline_2026-07-19.xlsx`

SHA-256:

`8aaee69c339c4b227c8485105c8be3310cd849c9b93be452b8a2bc9b6ac4c74f`

Baseline counts:

- 2,680 Atlas cases
- 877 program records
- 171 organization records
- 100 institution/facility records
- 30 canonical domains
- 20 program families

The workbook and private CSV exports are intentionally **not committed** to this repository. They contain internal, confidential, and restricted operational material and will be loaded through a controlled migration process.

## Required sequence

1. Review and apply the Supabase schema migrations.
2. Configure separate development, staging, and production projects.
3. Import public/canonical records into staging tables.
4. Reconcile every source row as imported, excluded, merged, held, or errored.
5. Conduct privacy review before importing contacts, outreach, interviews, or owner commitments.
6. Approve the canonical import.
7. Build the private Atlas interface in `nsag-admin`.
8. Publish only records satisfying both:
   - `publication_status = 'published'`
   - `sensitivity = 'public'`

## Security rules

- Private by default.
- No database service-role key in browser code.
- No admin key in query strings.
- No unrestricted CORS on administrative endpoints.
- Agents may propose updates but may not directly publish or overwrite canonical records.
- Every material canonical change must be auditable.
