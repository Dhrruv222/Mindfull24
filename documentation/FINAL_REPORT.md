# Final report: audit, implementation and coverage

Part A (requirement coverage) is [REQUIREMENTS_COVERAGE.md](REQUIREMENTS_COVERAGE.md), generated from the Jira export by `npm run backlog:import`.

## Sources and discrepancies

| Item | Finding | Decision |
|---|---|---|
| Excel requirements workbook | Not present in the repository or on the development machine | Not used. Entitlement rules follow the Jira acceptance criteria. Anything that depends on the workbook is flagged below |
| Jira board | Only the CSV export `documentation/jira/SACA_backlog_export.csv` (47 items) is available. It has no status, sprint, assignee, parent, dependency or blocker data | The hub shows exactly what the export contains. Parent links are marked *inferred* |
| Calendar themes | The brief lists Solo Urban Walks, Creative Home Projects and Mindful Cooking. The Jira stories (SACA-11, SACA-38) specify **Football, Fitness and Mindfulness/Self-Help** | The documented Jira scope was followed. Only a "Nutrition" calendar is shown as coming soon |
| 24 doors per calendar | Mindfulness had 24 doors. Fitness and Football had 12 | Both extended to 24 with new activities |
| Chronological unlocking | Not implemented. Doors were locked only by tier | Implemented server-side (see below) |
| Project period | The brief says 12 Oct to 12 Nov 2026. Backlog dates are 2 Nov to 12 Nov 2026 | Both are shown on the hub |

## B. Feature implementation report

| Module | Before this iteration | Now |
|---|---|---|
| Multi-calendar engine | Implemented (catalogue, tiers) | **Improved**: per-calendar colour identity, start date, doors open, discovered and completed counts, next unlock, "Start this calendar" activation |
| 24-door calendar | Partial (no dates, 12 doors in two calendars) | **Improved**: 24 doors each, date-based unlocking enforced in SQL, scheduled doors hide their content, opened and completed history, door-opening animation, five distinct door states |
| Randomizer | Implemented (cooldown, pool) | **Improved**: category and duration filters, draw grants on-demand access, a no-match draw does not use the cooldown |
| Points ledger | Implemented | Unchanged (verified by tests) |
| Rewards shop | Implemented (no images) | **Improved**: icon artwork, "demo reward" labelling. Real images remain outstanding |
| Free/Premium switcher | Implemented | Unchanged. Backend enforcement verified |
| Dashboard | Partial | **Improved**: waiting doors, coming up, recent activities, redemptions, tier badge |
| Activity timeline | Missing | **New**: month, week and day views, day inspector, navigation, statuses, demo-data label |
| Jira / Scrum hub | Missing | **New**: static import of the export, filters, acceptance criteria, contributors, implementation mapping |
| Group sessions | Implemented (fixed list) | **Improved**: free-text activity |
| Supabase / Vercel | Not available | Deployed. `supabase/*.sql` generated and verified on fresh and upgrade paths |

## D. Database and architecture report

See [ARCHITECTURE.md](ARCHITECTURE.md) and [API.md](API.md). New in this iteration: `calendars.start_date`, `user_calendars`, `activity_opens`, `group_sessions.activity_name`, `rewards.icon` (migrations 003 and 004). New services: `timeline.js`, `project.js`. Routes: `POST /calendars/{id}/join`, `POST /activities/{id}/open`, `GET /timeline`, `GET /project/backlog`.

## E. Calendar and timeline report

- **Unlocking.** Door N of a calendar opens on `start_date + (N - 1)` days, compared in SQL against the database clock (UTC). Listing, reading, opening and completing all go through the same check and return 403 `DOOR_LOCKED` with the unlock date. A scheduled door returns no title, description, instructions or points.
- **Past doors** stay accessible. A randomizer draw opens that one activity on demand, even before its date.
- **Logging.** The first open of a door is stored in `activity_opens`; completions in `activity_completions`; every point change in `points_ledger`; redemptions, draws and session joins in their tables. All carry timestamps from the database.
- **Retrieval.** `GET /timeline?from&to` (max 100 days) merges these sources for the signed-in user only. The only derived entries are "door available" dates, calculated from the stored schedule. Seeded demo accounts are labelled as demonstration data. Self-registered accounts are not.
- **Demo data.** The seed shifts calendar start dates so that 12 of 24 doors are open on the day it runs. Re-seed before a presentation. For a December launch run `UPDATE calendars SET start_date = '2026-12-01';`.

## F. Testing report

| Check | Result |
|---|---|
| Automated: unit and integration tests (`npm test`, PostgreSQL) | 79 of 79 pass |
| Covers scenarios 1 to 12 of the brief (registration, door restriction, completion, duplicates, randomizer, cooldown, tiers, redemption, balance), plus timeline (13, 14) and hub (15) at API level | Pass |
| Concurrency: parallel completions, draws, redemptions and joins | Pass |
| Browser walkthrough (headless Edge): login, dashboard, 24-door grid, sealed-door message, door open and complete, timeline month/week/day/previous month, hub search, rewards, sessions, subscription; no console errors; no horizontal overflow at 390 px width | Pass |
| SQL files `schema.sql`, `seed.sql`, `update-004-schedule-timeline.sql` on scratch databases (fresh install and upgrade with data) | Pass. Zero ledger mismatches; demo password verified |
| Human UAT ([UAT_CHECKLIST.md](UAT_CHECKLIST.md)) | **Not run** |

## G. Outstanding issues

1. The Excel workbook was not available, so nothing could be cross-checked against it.
2. The Jira export lacks status, sprint, assignee, dependency, blocker and parent data. The hub cannot show them and does not invent them. Providing a richer export would allow it.
3. SACA-41 (execute UAT), SACA-42 (motivation study), SACA-43 (sign-off), SACA-45 (presentation) and the formal handover package need the team. Nothing was fabricated for them.
4. Rewards have icon artwork instead of images. Partners and codes are simulated.
5. No browser end-to-end suite; browser checks were a scripted walkthrough.
6. Door dates use UTC. A time-zone setting per user is not implemented.
7. Cooldown lengths, point values and the Free/Premium split are the Product Owner's decisions to confirm.
8. Because the three seeded calendars are Football, Fitness and Mindfulness, the brief's example themes (urban walks, creative projects, cooking) are not included.
