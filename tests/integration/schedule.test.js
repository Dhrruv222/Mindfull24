const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, api, login, pool } = require('./helper');

test.before(start);
test.after(stop);

const tokens = {};
const getToken = async (key) => (tokens[key] ||= await login(key));
const todayUtc = () => new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
// Moves every calendar start relative to today (UTC), which changes which doors are open.
const setStart = (offsetDays) => pool.query("UPDATE calendars SET start_date = (now() AT TIME ZONE 'UTC')::date + $1::int", [offsetDays]);
const calendarOf = async (token, category) => (await api('GET', '/api/calendars', { token })).body.find((c) => c.category === category);
const balanceOf = async (token) => (await api('GET', '/api/points/balance', { token })).body.balance;

test('SACA-11 - doors open chronologically and the server enforces it', async (t) => {
  await setStart(0); // only door 1 is open today
  tokens.sched = (await api('POST', '/api/register', { body: { name: 'Schedule User', email: 'schedule@example.com', password: 'Secret123' } })).body.token;
  const token = tokens.sched;
  const mind = await calendarOf(token, 'Mindfulness/Self-Help');
  const doors = () => api('GET', `/api/calendars/${mind.id}/activities`, { token }).then((r) => r.body);
  let list = await doors();

  await t.test('future doors are listed as scheduled and reveal nothing', async () => {
    assert.equal(list.length, 24);
    assert.equal(list[0].state, 'available');
    assert.equal(list[1].state, 'scheduled');
    assert.equal(list[1].unlock_date, addDays(todayUtc(), 1));
    for (const field of ['title', 'description', 'instructions', 'points']) assert.equal(list[1][field], undefined, field);
  });

  await t.test('direct API calls to a future door are rejected and change nothing', async () => {
    const before = await balanceOf(token);
    for (const [method, path] of [['GET', `/api/activities/${list[1].id}`], ['POST', `/api/activities/${list[1].id}/open`], ['POST', `/api/activities/${list[1].id}/complete`]]) {
      const res = await api(method, path, { token });
      assert.equal(res.status, 403, path);
      assert.equal(res.body.error.code, 'DOOR_LOCKED');
      assert.equal(res.body.error.unlock_date, addDays(todayUtc(), 1));
    }
    assert.equal(await balanceOf(token), before);
    const { rows: [{ n }] } = await pool.query('SELECT COUNT(*) AS n FROM activity_opens o JOIN users u ON u.id = o.user_id WHERE o.activity_id = $1 AND u.email = $2', [list[1].id, 'schedule@example.com']);
    assert.equal(n, 0);
  });

  await t.test('opening an unlocked door records it once and activates the calendar', async () => {
    const first = await api('POST', `/api/activities/${list[0].id}/open`, { token });
    assert.equal(first.status, 200);
    assert.equal(first.body.state, 'opened');
    assert.ok(first.body.instructions);
    const again = await api('POST', `/api/activities/${list[0].id}/open`, { token });
    assert.equal(again.body.opened_at, first.body.opened_at);
    const cal = await calendarOf(token, 'Mindfulness/Self-Help');
    assert.equal(cal.joined, true);
    assert.equal(cal.opened_activities, 1);
    assert.equal(cal.unlocked_doors, 1);
    assert.equal(cal.next_unlock_day, 2);
    assert.equal(cal.next_unlock_date, addDays(todayUtc(), 1));
  });

  await t.test('a completed door stays accessible and cannot be completed twice', async () => {
    assert.equal((await api('POST', `/api/activities/${list[0].id}/complete`, { token })).status, 201);
    assert.equal((await api('POST', `/api/activities/${list[0].id}/complete`, { token })).status, 409);
    list = await doors();
    assert.equal(list[0].state, 'completed');
  });

  await t.test('the next day unlocks the next door', async () => {
    await setStart(-1);
    list = await doors();
    assert.equal(list[1].state, 'available');
    assert.equal((await api('POST', `/api/activities/${list[1].id}/open`, { token })).status, 200);
    assert.equal(list[2].state, 'scheduled');
  });

  await t.test('Premium locks still win over the date and use their own error', async () => {
    await setStart(-40);
    const res = await api('GET', `/api/activities/${(await pool.query("SELECT id FROM activities WHERE tier_required = 'premium' LIMIT 1")).rows[0].id}`, { token });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'PREMIUM_REQUIRED');
  });
});

test('SACA-12 - a randomizer draw gives on-demand access to that activity', async () => {
  await setStart(30); // every door is sealed
  const token = await getToken('premium');
  const mind = await calendarOf(token, 'Mindfulness/Self-Help');
  const sealed = (await api('GET', `/api/calendars/${mind.id}/activities`, { token })).body;
  assert.ok(sealed.every((d) => d.state === 'scheduled' || d.completed));

  const draw = await api('POST', '/api/randomizer/draw', { token });
  assert.equal(draw.status, 201);
  const id = draw.body.activity.id;
  assert.ok(draw.body.activity.instructions);
  assert.equal((await api('POST', `/api/activities/${id}/open`, { token })).status, 200);
  assert.equal((await api('POST', `/api/activities/${id}/complete`, { token })).status, 201);

  const other = (await pool.query('SELECT id FROM activities WHERE id <> $1 ORDER BY id LIMIT 1', [id])).rows[0].id;
  assert.equal((await api('POST', `/api/activities/${other}/complete`, { token })).body.error.code, 'DOOR_LOCKED');
  await setStart(-40);
});

test('Calendar activation follows entitlements', async (t) => {
  const token = await getToken('sam');
  const mind = await calendarOf(token, 'Mindfulness/Self-Help');
  const football = await calendarOf(token, 'Football');
  const soon = await calendarOf(token, 'Nutrition');

  await t.test('free users can start free calendars (repeatedly) but not Premium ones', async () => {
    assert.equal((await api('POST', `/api/calendars/${mind.id}/join`, { token })).body.joined, true);
    assert.equal((await api('POST', `/api/calendars/${mind.id}/join`, { token })).status, 200);
    const res = await api('POST', `/api/calendars/${football.id}/join`, { token });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'PREMIUM_REQUIRED');
    const { rows: [{ n }] } = await pool.query('SELECT COUNT(*) AS n FROM user_calendars WHERE calendar_id = $1', [football.id]);
    assert.equal(n, 0);
  });

  await t.test('unavailable, unknown and malformed targets are rejected', async () => {
    assert.equal((await api('POST', `/api/calendars/${soon.id}/join`, { token })).body.error.code, 'CALENDAR_UNAVAILABLE');
    assert.equal((await api('POST', '/api/calendars/99999/join', { token })).status, 404);
    assert.equal((await api('POST', '/api/calendars/abc/join', { token })).status, 400);
    assert.equal((await api('POST', `/api/calendars/${mind.id}/join`)).status, 401);
  });
});

test('SACA-12 - randomizer filters are validated and applied by the server', async (t) => {
  const token = await getToken('jordan');
  const reset = () => pool.query("UPDATE randomizer_draws SET cooldown_until = now() - interval '1 minute'");

  await t.test('status lists the filter options', async () => {
    const status = (await api('GET', '/api/randomizer/status', { token })).body;
    assert.ok(status.filters.categories.includes('Fitness'));
    assert.ok(status.filters.max_minutes.length > 0);
  });

  await t.test('category filter restricts the pool', async () => {
    for (let i = 0; i < 3; i += 1) {
      const res = await api('POST', '/api/randomizer/draw', { token, body: { category: 'Fitness' } });
      assert.equal(res.status, 201);
      assert.equal(res.body.activity.calendar_title, 'Fitness Challenge');
      await reset();
    }
  });

  await t.test('duration filter restricts the pool', async () => {
    const limit = Math.min(...(await api('GET', '/api/randomizer/status', { token })).body.filters.max_minutes);
    for (let i = 0; i < 3; i += 1) {
      const res = await api('POST', '/api/randomizer/draw', { token, body: { max_minutes: limit } });
      assert.equal(res.status, 201);
      assert.ok(parseInt(res.body.activity.duration, 10) <= limit);
      await reset();
    }
  });

  await t.test('invalid filters are rejected and a no-match draw does not start the cooldown', async () => {
    assert.equal((await api('POST', '/api/randomizer/draw', { token, body: { max_minutes: 0 } })).status, 400);
    assert.equal((await api('POST', '/api/randomizer/draw', { token, body: { max_minutes: 'soon' } })).status, 400);
    assert.equal((await api('POST', '/api/randomizer/draw', { token, body: { category: { $ne: 1 } } })).status, 400);
    const none = await api('POST', '/api/randomizer/draw', { token, body: { category: 'No Such Category' } });
    assert.equal(none.status, 404);
    assert.equal(none.body.error.code, 'EMPTY_POOL');
    assert.equal((await api('GET', '/api/randomizer/status', { token })).body.can_draw, true);
  });
});

test('Timeline - dated history built only from real records', async (t) => {
  tokens.tl = (await api('POST', '/api/register', { body: { name: 'Timeline User', email: 'timeline@example.com', password: 'Secret123' } })).body.token;
  tokens.other = (await api('POST', '/api/register', { body: { name: 'Other User', email: 'other@example.com', password: 'Secret123' } })).body.token;
  const token = tokens.tl;
  const mind = await calendarOf(token, 'Mindfulness/Self-Help');
  const doors = (await api('GET', `/api/calendars/${mind.id}/activities`, { token })).body;
  await api('POST', `/api/activities/${doors[3].id}/open`, { token });
  await api('POST', `/api/activities/${doors[3].id}/complete`, { token });
  await api('POST', `/api/activities/${doors[4].id}/open`, { token });
  const today = todayUtc();

  await t.test('opens, completions and points appear on the day they happened', async () => {
    const res = await api('GET', `/api/timeline?from=${today}&to=${today}`, { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.demo_data, false);
    const types = res.body.events.map((e) => e.type);
    for (const type of ['door_opened', 'activity_completed', 'points_earned']) assert.ok(types.includes(type), type);
    assert.equal(types.filter((x) => x === 'door_opened').length, 2);
    const completed = res.body.events.find((e) => e.type === 'activity_completed');
    assert.equal(completed.status, 'completed');
    assert.equal(completed.points, doors[3].points);
    assert.equal(res.body.events.find((e) => e.type === 'door_opened' && e.title === doors[4].title).status, 'pending');
  });

  await t.test('door availability dates come from the stored schedule', async () => {
    await setStart(-10);
    const res = await api('GET', `/api/timeline?from=${addDays(today, -10)}&to=${addDays(today, 13)}`, { token });
    const available = res.body.events.filter((e) => e.type === 'door_available');
    assert.equal(available.length, 24);
    assert.equal(available.find((e) => e.date === addDays(today, -10)).status, 'available');
    const future = available.filter((e) => e.date > today);
    assert.equal(future.length, 13);
    assert.ok(future.every((e) => e.status === 'locked' && /^Door \d+ opens$/.test(e.title)));
    await setStart(-40);
  });

  await t.test('other days and other users show nothing', async () => {
    assert.equal((await api('GET', `/api/timeline?from=${addDays(today, 20)}&to=${addDays(today, 25)}`, { token })).body.events.length, 0);
    assert.equal((await api('GET', `/api/timeline?from=${today}&to=${today}`, { token: tokens.other })).body.events.length, 0);
  });

  await t.test('demo accounts are labelled as demonstration data', async () => {
    const res = await api('GET', `/api/timeline?from=${addDays(today, -1)}&to=${today}`, { token: await getToken('free') });
    assert.equal(res.body.demo_data, true);
  });

  await t.test('invalid ranges and anonymous access are rejected', async () => {
    for (const q of ['from=nope', 'from=2026-02-30x', `from=${today}&to=${addDays(today, -1)}`, `from=${addDays(today, -200)}&to=${today}`]) {
      assert.equal((await api('GET', `/api/timeline?${q}`, { token })).status, 400, q);
    }
    assert.equal((await api('GET', '/api/timeline')).status, 401);
  });
});

test('SACA-44 - project hub serves only what the Jira export contains', async (t) => {
  const token = await getToken('free');
  const res = await api('GET', '/api/project/backlog', { token });

  await t.test('reports the exported backlog without claiming a live sync', () => {
    assert.equal(res.status, 200);
    assert.equal(res.body.live_sync, false);
    assert.deepEqual([res.body.summary.epics, res.body.summary.stories, res.body.summary.tasks], [8, 9, 30]);
    assert.equal(res.body.items.length, 47);
    assert.deepEqual(res.body.team, ['Dhrruv More', 'Nizar', 'Youssef']);
  });

  await t.test('never invents assignees, and marks parents that are not in Jira as inferred', () => {
    assert.ok(res.body.items.every((i) => i.assignee === null));
    assert.ok(res.body.items.filter((i) => i.parent).every((i) => i.parent_source === 'inferred'));
    assert.ok(res.body.not_in_export.includes('status'));
    const redeem = res.body.items.find((i) => i.key === 'SACA-14');
    assert.equal(redeem.acceptance_criteria.length, 3);
    assert.deepEqual(redeem.contributors.map((c) => c.name), ['Nizar', 'Youssef', 'Dhrruv']);
  });

  await t.test('requires authentication', async () => {
    assert.equal((await api('GET', '/api/project/backlog')).status, 401);
  });
});
