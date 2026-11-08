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
| GET | /calendars | Catalogue with `tier_required`, `locked`, progress |
| GET | /calendars/{id} | Calendar metadata (also for locked ones) |
| GET | /calendars/{id}/activities | Doors; 403 `PREMIUM_REQUIRED` for locked calendars. Locked doors hide description/instructions |
| GET | /activities/{id} | Full details incl. `instructions`; 403 when locked |
| POST | /activities/{id}/complete | 201 `{points_awarded, balance}`; 409 `ALREADY_COMPLETED` |

## Randomizer
| Method | Path | Notes |
|---|---|---|
| GET | /randomizer/status | `can_draw`, `next_available_at`, `retry_after_seconds`, `pool_size` |
| POST | /randomizer/draw | 201 `{draw, activity}`; 429 `RANDOMIZER_COOLDOWN` with `next_available_at` |

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
| POST | /sessions | `{title, description?, activity_id, session_date (future ISO), capacity (2-50)}`; creator joins automatically |
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

`GET /health` returns `{status:"ok"}`.
