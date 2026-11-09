# Demo script (SACA-46)

About 8 minutes. Use a desktop browser, a fresh private window and the demo accounts (password `Demo1234!`).
Run `npm run db:reset` or re-run `supabase/seed.sql` before presenting, so the door dates and balances are as described.

| Time | Do | Say |
|---|---|---|
| 0:00 | Log in as `free@demo.saca.test` | "SACA turns daily leisure into something to look forward to. We avoid streaks and guilt." |
| 0:45 | Calendars, then Mindfulness | "24 doors. Doors up to today are open. Later doors are sealed until their own date." |
| 1:30 | Click a sealed door | "The server enforces the date. Calling the API directly returns 403, not just a disabled button." |
| 2:15 | Open a door and complete it | "Opening records when you discovered it. Completion awards points once through a ledger." |
| 3:00 | Randomizer: pick a category and a time limit, draw twice | "On-demand activity. The cooldown is enforced on the server, so refreshing does not help." |
| 4:00 | Open Football | "Free users see an upgrade message. Backend rules match the interface." |
| 4:30 | Subscription: switch to Premium, return to Football | "This is the demo tier switcher, not real payments." |
| 5:15 | Rewards: redeem Free Coffee | "Simulated partners and codes. Redemption deducts points and issues one unique code atomically." |
| 6:00 | Timeline: month, week and day views | "A dated record built from stored records only." |
| 6:45 | Group sessions: create a session with your own activity text | "Hosts describe their own activity. Capacity and duplicate joins are enforced." |
| 7:15 | Project hub | "Planned work from our Jira export mapped to the code. It is a static import, with no live sync, and it shows no invented status." |
| 8:00 | Close | "Discover, anticipate, unlock, experience, complete, earn, redeem, discover again." |

Reset after the demo: the demo accounts share a password, so set `DEMO_MODE=false` in Vercel for any public launch.
