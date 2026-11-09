# Testing

Run `npm run db:up` once, then `npm test`. Integration tests use the separate local `saca_test` database
(`TEST_DATABASE_URL`, never `DATABASE_URL`), which is recreated (migrate + seed) at the start of each run,
so your development or Supabase data is never touched.

## Automated coverage

| Area | Tests |
|---|---|
| Unit | tier access, ledger balance, cooldown calculation, random selection, session status/capacity, reward eligibility, validators |
| Registration/login | unique email (case-insensitive), password hashing, validation, wrong credentials, logout revocation |
| Authorisation | unauthenticated calls to every private area return 401; profile data is per user |
| Calendars/tiers | Free user blocked from Premium calendars and doors by direct API calls; locked doors hide instructions |
| Activity completion | single award, duplicate rejection, 8 parallel requests award once, ledger entry written |
| Randomizer | cooldown rejection on repeated and parallel calls, expiry, free pool vs premium pool |
| Rewards | insufficient points, premium-only reward, unique codes, concurrent redemption of the same points, out-of-stock rollback |
| Group sessions | full/closed/duplicate joins, 5 parallel joins on capacity 2, creation validation, tier rule |
| Subscription | switcher updates the backend, non-demo and non-demo-mode rejection, invalid tier |
| Input handling | out-of-range ids and invalid text return 400 instead of 500 |
| Integrity | every `points_balance` equals the sum of its ledger rows |
| Chronological doors | future doors are listed as sealed, and open/read/complete are all refused with `DOOR_LOCKED`; nothing is written; the next day unlocks the next door; Premium lock wins over the date |
| Door history and calendars | opening is recorded once and starts the calendar; join respects entitlements, unavailable and unknown calendars |
| Randomizer filters | category and duration filters, invalid filters rejected, no-match draw does not start the cooldown, a draw grants on-demand access |
| Timeline | opens, completions and points land on the right day; availability dates come from the schedule; other users see nothing; range validation; demo-data label |
| Project hub | backlog counts (8 epics, 9 stories, 30 tasks), no invented assignees, inferred parents marked, authentication required |

## Manual acceptance checklist (UAT)

The full 15-scenario checklist, with a blank result column for the team, is in [UAT_CHECKLIST.md](./UAT_CHECKLIST.md).
A short smoke version:

Record results and Product Owner feedback in Jira.

1. Register a new account, log in, check profile and points.
2. As `free@demo.saca.test`, open Mindfulness, complete a door, see points and history update.
3. Try to open the Football calendar and a locked Fitness door (Premium lock shown).
4. Use the randomizer twice: the second draw shows the cooldown timer.
5. Redeem "Free Coffee" and verify the code appears in My redemptions; try a reward you cannot afford (`sam@demo.saca.test`).
6. Join the open session, try the full session, create a new session.
7. In Subscription, switch to Premium and verify Football and premium rewards unlock; switch back.

## Product experience evaluation

Compare the advent-calendar experience with a plain self-help activity list. Collect, on a 1-5 scale plus comments:
motivation to complete activities, interest in returning, value of points and rewards, interest in group participation, usability.
A small demonstration sample does not establish general user behaviour; treat results as qualitative feedback only.

## Regression

After every fix run `npm test` in full; all tests must pass before a feature is marked done.
