# Technical Handover

## Contents
- Source code: this repository (`backend/`, `frontend/`, `database/`, `tests/`)
- Architecture and schema: [ARCHITECTURE.md](ARCHITECTURE.md), `backend/migrations/001_init.sql`
- Seed data: `database/seeders/seed.js` and `database/seeders/data/`
- API reference: [API.md](API.md)
- Setup instructions: [README](../README.md)
- Testing evidence: [TESTING.md](TESTING.md); attach the latest `npm test` output and the Jira test records

## Deployment notes
- The app needs a long-running Node.js process and PostgreSQL (Supabase). It is no longer a static site, so the previous Vercel static setup was removed.
- Production: set `NODE_ENV=production`, a strong `JWT_SECRET` and `DEMO_MODE=false` (this disables the tier switcher), and use the Supabase database URL (`DATABASE_URL`) kept only in server environment variables. Serve over HTTPS.
- The Docker credentials in `docker-compose.yml` are for local development only.

## Known issues and limitations
- No real payment gateway: Premium is a demo tier switched through `POST /api/demo/tier`.
- Tailwind and icons load from CDNs; the UI needs internet access (or bundle them for offline use).
- The login rate limiter is in memory and per process; use a shared store when running several instances.
- Logout revokes one token; there is no password reset, email verification or admin UI (the `admin` role exists but has no endpoints yet).
- The frontend is plain JavaScript rather than React; there are no browser (end-to-end) tests, only API-level integration tests and manual UAT.
- Sessions have no leave/cancel feature and reminders are not sent.
- Cooldown, point values and tier rules are product decisions for the Product Owner to confirm.

## Future recommendations
Payment integration, email verification and password reset, admin tools for content and promo-code upload,
streaks and badges, notifications for sessions, a React or mobile client on the same API, and an end-to-end test suite.
