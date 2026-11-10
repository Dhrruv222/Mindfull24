# Architecture and Database Design

## Layers

1. **Frontend** (`frontend/`): vanilla ES-module single-page app with hash routing, Tailwind CSS (CDN) and Phosphor icons.
   `services/api.js` wraps `fetch` and attaches the bearer token. `pages/` holds one module per screen, `components/` shared UI.
2. **Backend** (`backend/`): Express REST API. `routes/index.js` maps endpoints to `services/*`, which contain the business rules.
   `middleware/auth.js` verifies the JWT, rejects revoked tokens and loads the *current* user row, so tier changes apply immediately.
3. **Database**: PostgreSQL (hosted on Supabase; a local Docker Postgres is used for development and tests). Schema in `backend/migrations/001_init.sql`, demo data in `database/seeders/`.

## Key design decisions

| Rule | Implementation |
|---|---|
| Passwords hashed | bcrypt (`bcryptjs`), unique `users.email` |
| Auth | JWT with `jti`; logout stores the `jti` in `revoked_tokens` |
| One award per activity | `UNIQUE (user_id, activity_id)` on `activity_completions` + per-user row lock |
| Complete ledger | `points_ledger` row for every earn/spend, `UNIQUE idempotency_key`; `users.points_balance` changes only in the same transaction (`services/points.js`) |
| No overspending | `SELECT ... FOR UPDATE` on the user row, balance re-checked, `CHECK (points_balance >= 0)` |
| Atomic redemption | one transaction: lock user, check tier and points, reserve a code with `FOR UPDATE SKIP LOCKED`, create redemption, mark code issued, ledger spend; any error rolls back |
| Unique promo codes | `UNIQUE promo_code`, `UNIQUE redemptions.promo_code_id`, status `available -> issued` |
| Randomizer cooldown | last draw checked under the user row lock, so refreshes, direct API calls and parallel requests cannot bypass it |
| Session capacity | session row locked during join; `UNIQUE (session_id, user_id)` prevents duplicates; status derived from members/date |
| Tier access | single function `canAccess` in `services/entitlements.js`, applied to calendars, activities, randomizer pool, rewards and sessions |
| Chronological doors | `calendars.start_date`; door N opens on `start_date + N - 1` (UTC). The comparison runs in SQL (`services/catalog.js`), so open, read and complete all fail with 403 `DOOR_LOCKED` before the date. A randomizer draw grants on-demand access to that one activity |
| Door history | `activity_opens` (first time a user opened a door) and `activity_completions` hold the real timestamps; `user_calendars` records which calendars the user started |
| Timeline | `services/timeline.js` reads only stored rows (opens, completions, ledger, redemptions, draws, session joins). Door-availability dates are derived from the stored schedule, never invented |
| Project hub | `backend/data/backlog.json` is generated from the Jira CSV by `npm run backlog:import`. It contains no status, sprint or assignee data because the export has none |
| Demo switcher | `POST /api/demo/tier` updates `users.subscription_tier`; allowed only when `DEMO_MODE=true` **and** the account has `is_demo = 1` |

Premium doors keep their instructions hidden: locked activities return only title, points and the lock flag.

## Tables

`users`, `revoked_tokens`, `calendars`, `activities`, `activity_completions`, `points_ledger`, `randomizer_draws`,
`rewards`, `promo_codes`, `redemptions`, `group_sessions`, `group_session_members`, `user_calendars`, `activity_opens` (plus `schema_migrations`).

Additions beyond the suggested fields:
- `users.points_balance`, `users.is_demo` (synchronised balance, demo-switcher authorisation)
- `activities.duration/icon/randomizer_eligible` (UI data and the Free randomizer pool)
- `points_ledger.balance_after`
- `rewards.availability` is the tier allowed to redeem (`free`/`premium`); `rewards.status` is `active`/`inactive`
- `calendars.status`: `active`, `coming_soon`, `inactive`; `calendars.start_date` drives the door schedule
- `group_sessions.activity_name`: free-text activity (`activity_id` is optional)
- `rewards.icon`: illustration for the shop card

## Tier model

| Area | Free | Premium |
|---|---|---|
| Calendars | Hiking, Fitness (basic doors) | all, including Football and premium Fitness doors |
| Randomizer | free pool, 60 min cooldown | all accessible activities, 15 min cooldown |
| Rewards | free offers | all offers |
| Group sessions | sessions on free activities | all sessions |

## Frontend note

The spec lists React as a recommended option ("or HTML, CSS and JavaScript"). The UI is implemented in plain JavaScript modules
to keep the demo runnable without a build step; the REST contract is unchanged if a React frontend replaces it later.
