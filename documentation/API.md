# REST API

Base path `/api`. JSON in and out. Authenticated endpoints need `Authorization: Bearer <token>`.
Errors: `{ "error": { "code": "...", "message": "...", ...extra } }`.

| Status | Meaning |
|---|---|
| 400 | Validation error | 
| 401 | Missing, invalid, expired or revoked token |
| 403 | Premium required / forbidden |
| 404 | Not found |
| 409 | Conflict (duplicate, full, insufficient points, out of stock) |
| 429 | Randomizer cooldown or too many login attempts |

## Accounts and profile
| Method | Path | Notes |
|---|---|---|
| POST | /register | `{name, email, password}` (password 8-72 chars, letter + number). 201 `{token, user}`; 409 `EMAIL_TAKEN` |
| POST | /login | `{email, password}` -> `{token, user}`; 401 `INVALID_CREDENTIALS` |
| POST | /logout | Revokes the current token |
| GET | /profile | Own profile with stats |
| GET | /profile/history | Own completed activities |
| GET | /profile/points | Balance and recent ledger entries |

## Calendars and activities
| Method | Path | Notes |
|---|---|---|
| GET | /calendars | Catalogue with `tier_required`, `locked`, `start_date`, `unlocked_doors`, `completed_activities`, `opened_activities`, `joined`, `next_unlock_day/date` |
| GET | /calendars/{id} | Calendar metadata (also for locked ones) |
| POST | /calendars/{id}/join | Starts the calendar for the user (idempotent). 403 `PREMIUM_REQUIRED` / `CALENDAR_UNAVAILABLE` |
| GET | /calendars/{id}/activities | 24 doors, each with `state` (`available`, `opened`, `completed`, `scheduled`, `premium_locked`) and `unlock_date`. Door N opens on `start_date + N - 1` (UTC). Scheduled doors hide title, description, instructions and points; Premium-locked doors hide description/instructions. 403 `PREMIUM_REQUIRED` for locked calendars |
| GET | /activities/{id} | Full details incl. `instructions`; 403 `PREMIUM_REQUIRED` or 403 `DOOR_LOCKED` (with `unlock_date`) |
| POST | /activities/{id}/open | Reveals the door and records when (once). Same errors as GET; also starts the calendar |
| POST | /activities/{id}/complete | 201 `{points_awarded, balance}`; 409 `ALREADY_COMPLETED`; 403 `DOOR_LOCKED` before the door's date |

## Randomizer
| Method | Path | Notes |
|---|---|---|
| GET | /randomizer/status | `can_draw`, `next_available_at`, `retry_after_seconds`, `pool_size`, `filters` (available `categories` and `max_minutes`) |
| POST | /randomizer/draw | Optional body `{category?, max_minutes?}`. 201 `{draw, activity}`; 429 `RANDOMIZER_COOLDOWN` with `next_available_at`; 404 `EMPTY_POOL` when no activity matches (no cooldown is started); 400 for invalid filters. A drawn activity can be opened and completed even before its door date |

## Points
| Method | Path | Notes |
|---|---|---|
| GET | /points/balance | `balance`, `ledger_balance`, `total_earned`, `total_spent` |
| GET | /points/history | Ledger, newest first (`limit`, `offset`) |

## Rewards
| Method | Path | Notes |
|---|---|---|
| GET | /rewards | Offers with `affordable`, `locked`, `can_redeem`, `blocked_reason` (promo codes are never listed) |
| GET | /rewards/{id} | One offer |
| POST | /rewards/{id}/redeem | 201 `{promo_code, balance, ...}`; 409 `INSUFFICIENT_POINTS` / `OUT_OF_STOCK`; 403 `PREMIUM_REQUIRED`. Optional `Idempotency-Key` header |
| GET | /rewards/redemptions | Own redemptions with promo codes |

## Group sessions
| Method | Path | Notes |
|---|---|---|
| GET | /sessions | Upcoming sessions with host, activity, `member_count`, `capacity`, `status` |
| POST | /sessions | `{title, description?, activity_name (free text) or activity_id, session_date (future ISO), capacity (2-50)}`; creator joins automatically |
| GET | /sessions/{id} | Details with participant names |
| POST | /sessions/{id}/join | 409 `SESSION_FULL`, `SESSION_CLOSED`, `ALREADY_JOINED` |
| GET | /sessions/my-sessions | Sessions the user belongs to |
| POST | /sessions/{id}/close | Host only |

## Subscription
| Method | Path | Notes |
|---|---|---|
| GET | /subscription | Tier and whether the demo switcher is enabled |
| GET | /subscription/entitlements | Feature list for the current tier |
| POST | /demo/tier | `{tier: "free"\|"premium"}`; 403 `DEMO_ONLY` outside demo mode or for non-demo accounts |

## Timeline and project hub
| Method | Path | Notes |
|---|---|---|
| GET | /timeline?from=YYYY-MM-DD&to=YYYY-MM-DD | Own dated events (`door_available`, `door_opened`, `activity_completed`, `points_earned`/`points_spent`, `reward_redeemed`, `randomizer_draw`, `session_joined`) with `status` (`completed`, `pending`, `available`, `locked`). Defaults to the current month; max range 100 days; `demo_data` is true for the seeded demo accounts |
| GET | /project/backlog | Static import of the Jira export (epics, stories, tasks, acceptance criteria, contributors) with the implementation mapping. `live_sync` is always false |

`GET /health` returns `{status:"ok"}`. GET /health/db runs a trivial query and returns only an error code if it fails (no connection details).
