# Technical Handover

## Contents
- Source code: this repository (`backend/`, `frontend/`, `database/`, `tests/`)
- Architecture and schema: [ARCHITECTURE.md](ARCHITECTURE.md), `backend/migrations/` (001 to 004)
- Seed data: `database/seeders/seed.js` and `database/seeders/data/`
- API reference: [API.md](API.md)
- Setup instructions: [README](../README.md)
- Testing evidence: [TESTING.md](TESTING.md); attach the latest `npm test` output and the Jira test records
- Requirements: [REQUIREMENTS_COVERAGE.md](REQUIREMENTS_COVERAGE.md), [FINAL_REPORT.md](FINAL_REPORT.md), [UAT_CHECKLIST.md](UAT_CHECKLIST.md), [DEMO_SCRIPT.md](DEMO_SCRIPT.md)

## Deployment notes
- The app runs on Vercel (static `frontend/` plus the serverless function `api/index.js`) with Supabase PostgreSQL, or as a long-running Node.js process.
- Production: set `NODE_ENV=production`, a strong `JWT_SECRET` and `DEMO_MODE=false` (this disables the tier switcher), and use the Supabase pooler URL (`DATABASE_URL`) kept only in server environment variables. Serve over HTTPS.
- Calendar dates: each calendar has `start_date`; door N opens on `start_date + N - 1`. The demo seed starts calendars 11 days in the past. For a real December launch run `UPDATE calendars SET start_date = '2026-12-01';` (or the year you need).
- The Docker credentials in `docker-compose.yml` are for local development only.

## Known issues and limitations
- No real payment gateway: Premium is a demo tier switched through `POST /api/demo/tier`.
- Rewards, partners and promo codes are simulated; there are no partner integrations and no reward images (an icon tile is used).
- The Jira hub is a static import. The export has no status, sprint, assignee, dependency or parent data, and the Excel workbook was not available, so those are not shown.
- Tailwind and icons load from CDNs; the UI needs internet access (or bundle them for offline use).
- Rate limits and account lockout are stored in the database, so they work across serverless instances.
- Logout revokes one token; there is no password reset, email verification or admin UI (the `admin` role exists but has no endpoints yet).
- The frontend is plain JavaScript rather than React; there are no browser (end-to-end) tests, only API-level integration tests and manual UAT.
- Sessions have no leave/cancel feature and reminders are not sent.
- Door dates use UTC, so users in other time zones see doors open at their local time of UTC midnight.
- Cooldown, point values and tier rules are product decisions for the Product Owner to confirm.

## Future recommendations
Payment integration, email verification and password reset, admin tools for content and promo-code upload,
streaks and badges, notifications for sessions, a React or mobile client on the same API, and an end-to-end test suite.
