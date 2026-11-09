# UAT checklist (SACA-40) and results log (SACA-41)

Fill in the **Result** and **Tester** columns while testing. They are intentionally blank: nothing here has been run by the team yet.
Demo accounts use the password `Demo1234!` (see README). Day 1 of each seeded calendar starts 11 days before it was seeded, so doors 1 to 12 are open and 13 to 24 are sealed until their dates.

| # | Scenario | Steps | Expected | Automated check | Result | Tester |
|---|---|---|---|---|---|---|
| 1 | Register and reach the dashboard | Register a new account | Dashboard shows 0 points, tier Free | Epic 1 tests | | |
| 2 | Explore and start a calendar | Open Calendars, open a calendar, press "Start this calendar" | Calendar marked started; progress shown | Calendar activation tests | | |
| 3 | Future door is refused | Click a sealed door | "Still sealed" with its date. Calling `POST /api/activities/{id}/open` for it returns 403 `DOOR_LOCKED` | Chronological door tests | | |
| 4 | Open an unlocked door | Click an "Open me" door | Door animates, title, why-it-helps and instructions appear | Door history tests | | |
| 5 | Complete and earn points | Press "Mark as complete" | Points added to the header balance and ledger | Epic 4 tests | | |
| 6 | No duplicate points | Complete the same door again (or double-click) | Refused. Balance unchanged | Epic 4 tests | | |
| 7 | Randomizer | Draw with and without filters | An activity matching the filters appears | Randomizer tests | | |
| 8 | Cooldown | Draw again immediately | Cooldown timer shown. Direct API call returns 429 | Epic 3 tests | | |
| 9 | Premium feature on Free tier | As Free, open Football | Locked notice; API returns 403 `PREMIUM_REQUIRED` | Epic 2 and 7 tests | | |
| 10 | Switch to Premium | Subscription, switch tier | Football and Premium rewards unlock immediately | Epic 7 tests | | |
| 11 | Redeem a reward | Rewards, redeem "Free Coffee" | A demo code is shown and listed under My redemptions | Epic 5 tests | | |
| 12 | Balance updated | Compare the balance before and after | Balance reduced by the reward cost; ledger has a spend row | Epic 5 tests | | |
| 13 | Timeline and redemption history | Open Timeline, month then week then day views | Opens, completions, points and the redemption appear on today's date | Timeline tests | | |
| 14 | Correct dates | Click days with events | Entries match what you did and when | Timeline tests | | |
| 15 | Project hub | Open Project hub, search "redeem" | Matches the Jira export (47 items); no status, sprint or assignee is shown | Project hub tests | | |

## Edge cases to record

| Case | Expected | Result |
|---|---|---|
| Two browser tabs redeem the same reward with exactly enough points | Only one redemption succeeds | |
| Two browser tabs press complete at once | Points awarded once | |
| Full or closed group session | Join refused with a clear message | |
| Premium-only reward on Free tier | Redeem button disabled; API returns 403 | |
| Token reused after logout | 401 | |
