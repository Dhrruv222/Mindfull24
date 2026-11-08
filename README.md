# Advent Calendar (SACA)

Gamified activity advent-calendar platform. Users register, open daily doors in specialised calendars
(Mindfulness/Self-Help, Fitness, Football), complete activities to earn points, use a randomizer with a server-enforced
cooldown, redeem partner rewards for unique promo codes, join group sessions and try the Free/Premium tiers through a demo switcher.

> Project period 12 Oct - 12 Nov 2026. Final presentation and handover: 12 Nov 2026.

## Architecture

`Browser (HTML/JS + Tailwind) -> REST API (Node.js/Express) -> business logic (services) -> PostgreSQL (Supabase)`

```
backend/         Express app: routes/, services/ (business rules), middleware/, migrations/, utils/
frontend/        Single-page UI (ES modules): pages/, components/, services/, assets/
database/        seeders/ (demo data: calendars, accounts, rewards, sessions)
documentation/   Architecture, API reference, testing, handover
tests/           unit/ and integration/ (run against a separate local test database)
docker-compose.yml  local PostgreSQL 16 for development and tests (optional when using Supabase)
```

All important rules (points, cooldowns, tiers, redemption, capacity) live in the backend and run in database transactions.
The frontend only displays the results.

## Quick start

Requirements: Node.js >= 22.9, a Supabase project (or Docker for a local PostgreSQL). Tests always need the local Docker database.

```bash
npm install
cp .env.example .env        # Windows: copy .env.example .env
npm run db:up               # local PostgreSQL on port 5544 (creates `saca` and `saca_test`); skip if you only use Supabase
npm run db:reset            # runs migrations and seeds the demo data
npm start                   # http://localhost:3000
```

## Using Supabase

1. In the Supabase dashboard open **Project Settings > Database > Connection string** and copy the **Session pooler** URI
   (it works over IPv4; the direct `db.<ref>.supabase.co` host is IPv6 only).
2. Put it in `.env` as `DATABASE_URL=postgresql://postgres.<project-ref>:<your-password>@<pooler-host>:5432/postgres`.
   TLS is enabled automatically for non-local hosts.
3. Run `npm run db:reset` once to create the tables and demo data, then `npm start`.

Notes: `db:reset` drops and recreates only this app's tables, so other tables in the project are left alone but
the app's data is replaced. The anon/public API key is **not** used: all data access goes through this backend, and the
migration enables Row Level Security with no policies so the Supabase REST API cannot read or write these tables.
Never expose the database password or `service_role` key in the frontend.

## Deploying to Vercel (project `agile24`, connected to this GitHub repo)

The frontend is served statically from `frontend/` and the API runs as one serverless function (`api/index.js`).
Pushing to the Git branch triggers a deployment. In **Vercel > Project > Settings > Environment Variables** add:

| Name | Value |
|---|---|
| `DATABASE_URL` | Supabase **Transaction pooler** URI (port 6543, best for serverless), password filled in |
| `JWT_SECRET` | random string of 32+ characters: `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"` |
| `DEMO_MODE` | `true` to keep the Free/Premium demo switcher and demo accounts usable, `false` for a real launch |

Until `DATABASE_URL` and `JWT_SECRET` exist, the API answers `503 NOT_CONFIGURED` (see `/api/health`). Create the tables and demo data
once from your machine with the same `DATABASE_URL` in `.env`: `npm run db:reset`. Then redeploy.

## Login and data security

- Passwords are hashed with bcrypt and never returned; email addresses are unique (case-insensitive).
- Sessions are signed JWTs (12 h) that can be revoked on logout; every request re-reads the account from the database.
- Failed logins are throttled per IP (30 / 15 min) and per account (10 / 15 min), with counters stored in the database so
  the limits hold across serverless instances.
- Users can only read their own profile, points, history and redemptions.
- Supabase Row Level Security is enabled on every table with no policies, so the public anon/publishable key gives no data access.
- Keep the database password and `JWT_SECRET` only in `.env` (git-ignored) and Vercel environment variables.

## Demo accounts

All accounts use the password `Demo1234!`.

| Account | Tier | Purpose |
|---|---|---|
| free@demo.saca.test | Free | Free demo account |
| premium@demo.saca.test | Premium | Premium demo account |
| alex@demo.saca.test | Free | Social and redemption tests (260 points) |
| sam@demo.saca.test | Free | Low balance: cannot afford rewards (40 points) |
| jordan@demo.saca.test | Premium | High balance (900 points) |
| admin@demo.saca.test | Premium | Admin role |

Seed data includes three calendars plus a "coming soon" calendar, six partner rewards (one unaffordable for everyone but
high-balance users), a controlled set of promo codes, and sessions that are open, nearly full and full.

## Configuration (`.env`)

| Variable | Default | Description |
|---|---|---|
| `PORT` | 3000 | HTTP port |
| `DATABASE_URL` | local Docker database | PostgreSQL connection string; use your Supabase one (see below) |
| `JWT_SECRET` | dev value | **Required in production** (long random string) |
| `JWT_EXPIRES_IN` | 12h | Token lifetime |
| `DEMO_MODE` | true (false when `NODE_ENV=production`) | Enables the Demo Tier Switcher |
| `RANDOMIZER_COOLDOWN_MINUTES` | 60 | Free-tier cooldown |
| `RANDOMIZER_PREMIUM_COOLDOWN_MINUTES` | 15 | Premium cooldown |

## Scripts

| Command | Description |
|---|---|
| `npm start` | Start the server (serves the API and the frontend) |
| `npm run db:up` | Start the local PostgreSQL via Docker |
| `npm run db:migrate` | Apply pending migrations |
| `npm run db:seed` | Reset data and load the demo seed |
| `npm run db:reset` | Drop all tables, migrate and seed |
| `npm test` | Unit + integration tests (needs the local Docker database; never touches `DATABASE_URL`) |
| `npm run test:unit` | Unit tests only (no database) |

More detail: [architecture](documentation/ARCHITECTURE.md), [API](documentation/API.md),
[testing](documentation/TESTING.md), [handover](documentation/HANDOVER.md).
