const test = require('node:test');
const assert = require('node:assert/strict');
const { start, stop, api, login, pool } = require('./helper');

test.before(start);
test.after(stop);

const findBy = (list, key, value) => list.find((x) => x[key] === value);
const tokens = {};
const getToken = async (key) => (tokens[key] ||= await login(key));

test('Epic 1 - registration, login, logout and profile isolation', async (t) => {
  const email = 'new.user@example.com';
  await t.test('registers, hashes the password and enforces unique email', async () => {
    const res = await api('POST', '/api/register', { body: { name: 'New User', email, password: 'Secret123' } });
    assert.equal(res.status, 201);
    assert.ok(res.body.token);
    assert.equal(res.body.user.subscription_tier, 'free');
    assert.equal(res.body.user.password_hash, undefined);
    const { rows: [row] } = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);
    assert.notEqual(row.password_hash, 'Secret123');
    assert.match(row.password_hash, /^\$2[aby]\$/);

    const dup = await api('POST', '/api/register', { body: { name: 'Other', email: email.toUpperCase(), password: 'Secret123' } });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'EMAIL_TAKEN');
  });

  await t.test('rejects invalid input', async () => {
    assert.equal((await api('POST', '/api/register', { body: { name: 'A', email: 'bad', password: 'Secret123' } })).status, 400);
    assert.equal((await api('POST', '/api/register', { body: { name: 'A', email: 'a@b.co', password: 'short' } })).status, 400);
    assert.equal((await api('POST', '/api/login', { body: { email: email, password: 'wrong-pass1' } })).status, 401);
    assert.equal((await api('POST', '/api/login', { body: { email: 'nobody@example.com', password: 'Secret123' } })).status, 401);
  });

  await t.test('locks an email temporarily after repeated failed logins', async () => {
    const config = require('../../backend/config');
    config.loginMaxFailures = 3;
    try {
      const target = 'locked.user@example.com';
      await api('POST', '/api/register', { body: { name: 'Locked', email: target, password: 'Secret123' } });
      for (let i = 0; i < 3; i += 1) {
        assert.equal((await api('POST', '/api/login', { body: { email: target, password: 'wrong-pass1' } })).status, 401);
      }
      const locked = await api('POST', '/api/login', { body: { email: target, password: 'Secret123' } });
      assert.equal(locked.status, 429);
      assert.equal(locked.body.error.code, 'ACCOUNT_LOCKED');
      await pool.query('DELETE FROM rate_limits');
      assert.equal((await api('POST', '/api/login', { body: { email: target, password: 'Secret123' } })).status, 200);
    } finally {
      config.loginMaxFailures = 10;
    }
  });

  await t.test('per-IP throttling returns 429 once the limit is exceeded', async () => {
    const config = require('../../backend/config');
    const previous = config.authRateLimit.max;
    config.authRateLimit.max = 2;
    try {
      await pool.query('DELETE FROM rate_limits');
      const statuses = [];
      for (let i = 0; i < 4; i += 1) statuses.push((await api('POST', '/api/login', { body: { email: 'nobody@example.com', password: 'Secret123' } })).status);
      assert.deepEqual(statuses, [401, 401, 429, 429]);
    } finally {
      config.authRateLimit.max = previous;
      await pool.query('DELETE FROM rate_limits');
    }
  });
  await t.test('protects private endpoints', async () => {
    for (const path of ['/api/profile', '/api/profile/history', '/api/profile/points', '/api/points/balance', '/api/calendars', '/api/rewards', '/api/sessions']) {
      assert.equal((await api('GET', path)).status, 401, path);
    }
    assert.equal((await api('GET', '/api/profile', { token: 'garbage' })).status, 401);
  });

  await t.test('profile shows only the caller data', async () => {
    const free = await api('GET', '/api/profile', { token: await getToken('free') });
    const premium = await api('GET', '/api/profile', { token: await getToken('premium') });
    assert.equal(free.body.email, 'free@demo.saca.test');
    assert.equal(premium.body.email, 'premium@demo.saca.test');
    const history = await api('GET', '/api/profile/history', { token: await getToken('free') });
    assert.equal(history.body.length, 2);
    const points = await api('GET', '/api/profile/points', { token: await getToken('free') });
    assert.equal(points.body.balance, free.body.points_balance);
  });

  await t.test('logout revokes the token', async () => {
    const { body } = await api('POST', '/api/login', { body: { email, password: 'Secret123' } });
    assert.equal((await api('GET', '/api/profile', { token: body.token })).status, 200);
    assert.equal((await api('POST', '/api/logout', { token: body.token })).status, 200);
    assert.equal((await api('GET', '/api/profile', { token: body.token })).status, 401);
  });
});

test('Epic 2 & 7 - calendars and tier restrictions are enforced by the backend', async (t) => {
  const free = await getToken('free');
  const premium = await getToken('premium');
  let calendars;

  await t.test('catalogue shows tiers and locks', async () => {
    calendars = (await api('GET', '/api/calendars', { token: free })).body;
    assert.equal(calendars.length, 4);
    assert.equal(findBy(calendars, 'category', 'Football').locked, true);
    assert.equal(findBy(calendars, 'category', 'Football').tier_required, 'premium');
    assert.equal(findBy(calendars, 'category', 'Fitness').locked, false);
    const premiumView = (await api('GET', '/api/calendars', { token: premium })).body;
    assert.equal(findBy(premiumView, 'category', 'Football').locked, false);
  });

  await t.test('free user cannot read premium calendar activities or details by direct API call', async () => {
    const football = findBy(calendars, 'category', 'Football');
    assert.equal((await api('GET', `/api/calendars/${football.id}`, { token: free })).status, 200);
    const res = await api('GET', `/api/calendars/${football.id}/activities`, { token: free });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'PREMIUM_REQUIRED');
    const doors = (await api('GET', `/api/calendars/${football.id}/activities`, { token: premium })).body;
    assert.equal(doors.length, 12);
    assert.equal((await api('GET', `/api/activities/${doors[0].id}`, { token: free })).status, 403);
    assert.equal((await api('POST', `/api/activities/${doors[0].id}/complete`, { token: free })).status, 403);
    assert.ok((await api('GET', `/api/activities/${doors[0].id}`, { token: premium })).body.instructions);
  });

  await t.test('premium activities inside a free calendar are locked and hide instructions', async () => {
    const fitness = findBy(calendars, 'category', 'Fitness');
    const doors = (await api('GET', `/api/calendars/${fitness.id}/activities`, { token: free })).body;
    const locked = doors.find((d) => d.locked);
    assert.ok(locked);
    assert.equal(locked.instructions, undefined);
    assert.equal(locked.description, undefined);
    assert.equal((await api('GET', `/api/activities/${locked.id}`, { token: free })).status, 403);
    const open = doors.find((d) => !d.locked);
    const detail = await api('GET', `/api/activities/${open.id}`, { token: free });
    assert.equal(detail.status, 200);
    assert.ok(detail.body.instructions);
  });

  await t.test('coming-soon calendar has no doors and unknown ids return 404', async () => {
    const soon = findBy(calendars, 'status', 'coming_soon');
    assert.equal((await api('GET', `/api/calendars/${soon.id}/activities`, { token: free })).status, 403);
    assert.equal((await api('GET', '/api/calendars/9999', { token: free })).status, 404);
    assert.equal((await api('GET', '/api/activities/abc', { token: free })).status, 400);
    assert.equal((await api('GET', '/api/activities/99999999999', { token: free })).status, 400);
    const nul = await api('POST', '/api/sessions', { token: free, body: { title: 'bad\u0000title', capacity: 4, session_date: new Date(Date.now() + 86400000).toISOString(), activity_id: 1 } });
    assert.equal(nul.status, 400);
  });
});

test('Epic 4 - activity completion awards points exactly once', async (t) => {
  const token = await getToken('sam');
  const mind = findBy((await api('GET', '/api/calendars', { token })).body, 'category', 'Mindfulness/Self-Help');
  const doors = (await api('GET', `/api/calendars/${mind.id}/activities`, { token })).body;

  await t.test('first completion awards points and writes a ledger row', async () => {
    const before = (await api('GET', '/api/points/balance', { token })).body.balance;
    const res = await api('POST', `/api/activities/${doors[10].id}/complete`, { token });
    assert.equal(res.status, 201);
    assert.equal(res.body.points_awarded, doors[10].points);
    assert.equal(res.body.balance, before + doors[10].points);
    const history = (await api('GET', '/api/points/history', { token })).body;
    assert.equal(history[0].transaction_type, 'earn');
    assert.equal(history[0].reference_type, 'activity');
    assert.equal(history[0].reference_id, doors[10].id);
  });

  await t.test('duplicate completion is rejected and awards nothing', async () => {
    const before = (await api('GET', '/api/points/balance', { token })).body.balance;
    const res = await api('POST', `/api/activities/${doors[10].id}/complete`, { token });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'ALREADY_COMPLETED');
    assert.equal((await api('GET', '/api/points/balance', { token })).body.balance, before);
  });

  await t.test('parallel duplicate requests award points only once', async () => {
    const before = (await api('GET', '/api/points/balance', { token })).body.balance;
    const results = await Promise.all(Array.from({ length: 8 }, () => api('POST', `/api/activities/${doors[11].id}/complete`, { token })));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 7);
    const after = (await api('GET', '/api/points/balance', { token })).body;
    assert.equal(after.balance, before + doors[11].points);
    assert.equal(after.balance, after.ledger_balance);
  });

  await t.test('completed doors appear in profile history and calendar progress', async () => {
    const history = (await api('GET', '/api/profile/history', { token })).body;
    assert.equal(history.length, 2);
    const refreshed = (await api('GET', `/api/calendars/${mind.id}/activities`, { token })).body;
    assert.equal(refreshed.filter((d) => d.completed).length, 2);
  });
});

test('Epic 3 - randomizer cooldown is enforced server-side', async (t) => {
  const token = await getToken('free');
  let firstDraw;

  await t.test('first draw succeeds and returns a free, eligible activity', async () => {
    const status = (await api('GET', '/api/randomizer/status', { token })).body;
    assert.equal(status.can_draw, true);
    const res = await api('POST', '/api/randomizer/draw', { token });
    assert.equal(res.status, 201);
    firstDraw = res.body;
    assert.equal(firstDraw.activity.locked, false);
    assert.equal(firstDraw.activity.tier_required, 'free');
    assert.ok(firstDraw.activity.instructions);
    assert.ok(new Date(firstDraw.draw.cooldown_until) > new Date());
  });

  await t.test('second draw during cooldown is rejected, even when called repeatedly', async () => {
    for (let i = 0; i < 3; i += 1) {
      const res = await api('POST', '/api/randomizer/draw', { token });
      assert.equal(res.status, 429);
      assert.equal(res.body.error.code, 'RANDOMIZER_COOLDOWN');
      assert.ok(res.body.error.retry_after_seconds > 0);
    }
    const status = (await api('GET', '/api/randomizer/status', { token })).body;
    assert.equal(status.can_draw, false);
    assert.ok(status.next_available_at);
    const { rows: [{ n }] } = await pool.query('SELECT COUNT(*) AS n FROM randomizer_draws WHERE user_id = (SELECT id FROM users WHERE email = $1)', ['free@demo.saca.test']);
    assert.equal(n, 1);
  });

  await t.test('parallel draws cannot bypass the cooldown', async () => {
    const alex = await getToken('alex');
    const results = await Promise.all(Array.from({ length: 6 }, () => api('POST', '/api/randomizer/draw', { token: alex })));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 429).length, 5);
  });

  await t.test('cooldown expiry allows a new draw', async () => {
    await pool.query("UPDATE randomizer_draws SET cooldown_until = now() - interval '1 minute'");
    assert.equal((await api('POST', '/api/randomizer/draw', { token })).status, 201);
  });

  await t.test('free users only draw from the free pool, premium from everything accessible', async () => {
    await pool.query("UPDATE randomizer_draws SET cooldown_until = now() - interval '1 minute'");
    for (let i = 0; i < 6; i += 1) {
      const res = await api('POST', '/api/randomizer/draw', { token });
      assert.equal(res.body.activity.tier_required, 'free');
      await pool.query("UPDATE randomizer_draws SET cooldown_until = now() - interval '1 minute'");
    }
    const premium = await api('POST', '/api/randomizer/draw', { token: await getToken('premium') });
    assert.equal(premium.status, 201);
    assert.equal(premium.body.activity.locked, false);
  });
});

test('Epic 5 - rewards and atomic redemption', async (t) => {
  // A brand-new account has 0 points, independent of other tests.
  tokens.poor = (await api('POST', '/api/register', { body: { name: 'Poor User', email: 'poor@example.com', password: 'Secret123' } })).body.token;
  const rewardsFor = async (key) => (await api('GET', '/api/rewards', { token: await getToken(key) })).body;
  const ledgerMatches = async (userId) => {
    const { rows: [row] } = await pool.query(
      `SELECT u.points_balance, COALESCE(SUM(CASE l.transaction_type WHEN 'earn' THEN l.amount ELSE -l.amount END), 0) AS ledger
       FROM users u LEFT JOIN points_ledger l ON l.user_id = u.id WHERE u.id = $1 GROUP BY u.id`,
      [userId],
    );
    return Number(row.ledger) === row.points_balance;
  };

  await t.test('catalogue exposes affordability and tier locks but never promo codes', async () => {
    const list = await rewardsFor('poor');
    assert.ok(list.length >= 5);
    assert.equal(JSON.stringify(list).includes('COFFEE-'), false);
    assert.equal(findBy(list, 'reward_title', 'Free Coffee').affordable, false);
    assert.equal(findBy(list, 'reward_title', 'Free Yoga Class').locked, true);
    assert.equal((await rewardsFor('jordan')).find((r) => r.reward_title === 'Match Day Experience').affordable, false);
  });

  await t.test('insufficient points are rejected without side effects', async () => {
    const sam = await getToken('poor');
    const coffee = findBy(await rewardsFor('poor'), 'reward_title', 'Free Coffee');
    const before = (await api('GET', '/api/points/balance', { token: sam })).body.balance;
    const res = await api('POST', `/api/rewards/${coffee.id}/redeem`, { token: sam });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'INSUFFICIENT_POINTS');
    assert.equal((await api('GET', '/api/points/balance', { token: sam })).body.balance, before);
    const { rows: [{ n }] } = await pool.query("SELECT COUNT(*) AS n FROM promo_codes WHERE status = 'issued'");
    assert.equal(n, 0);
  });

  await t.test('free users cannot redeem premium rewards', async () => {
    const yoga = findBy(await rewardsFor('free'), 'reward_title', 'Free Yoga Class');
    const res = await api('POST', `/api/rewards/${yoga.id}/redeem`, { token: await getToken('free') });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'PREMIUM_REQUIRED');
  });

  await t.test('successful redemption issues a unique code, deducts points and records history', async () => {
    const token = await getToken('free');
    const profile = (await api('GET', '/api/profile', { token })).body;
    const coffee = findBy(await rewardsFor('free'), 'reward_title', 'Free Coffee');
    const res = await api('POST', `/api/rewards/${coffee.id}/redeem`, { token });
    assert.equal(res.status, 201);
    assert.match(res.body.promo_code, /^COFFEE-/);
    assert.equal(res.body.balance, profile.points_balance - coffee.points_cost);
    const second = await api('POST', `/api/rewards/${coffee.id}/redeem`, { token });
    assert.equal(second.status, 201);
    assert.notEqual(second.body.promo_code, res.body.promo_code);
    const redemptions = (await api('GET', '/api/rewards/redemptions', { token })).body;
    assert.equal(redemptions.length, 2);
    assert.equal((await api('GET', '/api/points/history', { token })).body[0].transaction_type, 'spend');
    assert.equal(await ledgerMatches(profile.id), true);
    assert.equal((await api('GET', '/api/rewards/redemptions', { token: await getToken('poor') })).body.length, 0);
  });

  await t.test('concurrent redemptions cannot spend the same points twice', async () => {
    const token = await getToken('alex');
    const alex = (await api('GET', '/api/profile', { token })).body;
    const kick = findBy(await rewardsFor('alex'), 'reward_title', '15% Off Football Gear');
    assert.ok(alex.points_balance >= kick.points_cost && alex.points_balance < kick.points_cost * 2);
    const results = await Promise.all(Array.from({ length: 6 }, () => api('POST', `/api/rewards/${kick.id}/redeem`, { token })));
    assert.equal(results.filter((r) => r.status === 201).length, 1);
    assert.equal(results.filter((r) => r.status === 409).length, 5);
    const after = (await api('GET', '/api/points/balance', { token })).body.balance;
    assert.equal(after, alex.points_balance - kick.points_cost);
    const { rows: [{ n }] } = await pool.query('SELECT COUNT(*) AS n FROM promo_codes WHERE reward_id = $1 AND issued_to = $2', [kick.id, alex.id]);
    assert.equal(n, 1);
    assert.equal(await ledgerMatches(alex.id), true);
  });

  await t.test('parallel redemptions by different users never share a promo code', async () => {
    const book = findBy(await rewardsFor('jordan'), 'reward_title', 'Free eBook');
    const names = ['jordan', 'premium', 'admin'];
    for (const n of names) await pool.query('UPDATE users SET points_balance = 1000 WHERE email = $1', [`${n}@demo.saca.test`]);
    await pool.query("DELETE FROM points_ledger WHERE user_id IN (SELECT id FROM users WHERE email IN ('jordan@demo.saca.test','premium@demo.saca.test','admin@demo.saca.test'))");
    await pool.query("INSERT INTO points_ledger (user_id, transaction_type, amount, balance_after, reference_type, idempotency_key) SELECT id, 'earn', 1000, 1000, 'seed', 'reset:' || id FROM users WHERE email IN ('jordan@demo.saca.test','premium@demo.saca.test','admin@demo.saca.test')");
    const results = await Promise.all(names.map(async (n) => api('POST', `/api/rewards/${book.id}/redeem`, { token: await getToken(n) })));
    assert.deepEqual(results.map((r) => r.status), [201, 201, 201]);
    assert.equal(new Set(results.map((r) => r.body.promo_code)).size, 3);
    const stadium = findBy(await rewardsFor('jordan'), 'reward_title', 'Free Yoga Class');
    assert.equal((await api('POST', `/api/rewards/${stadium.id}/redeem`, { token: await getToken('jordan'), headers: { 'Idempotency-Key': 'bad key!' } })).status, 400);
  });

  await t.test('out-of-stock rewards roll back completely', async () => {
    const token = await getToken('jordan');
    const book = findBy(await rewardsFor('jordan'), 'reward_title', 'Free eBook');
    await pool.query("UPDATE promo_codes SET status = 'issued' WHERE reward_id = $1", [book.id]);
    const before = (await api('GET', '/api/points/balance', { token })).body.balance;
    const res = await api('POST', `/api/rewards/${book.id}/redeem`, { token });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'OUT_OF_STOCK');
    assert.equal((await api('GET', '/api/points/balance', { token })).body.balance, before);
  });

  await t.test('unknown rewards return 404', async () => {
    assert.equal((await api('GET', '/api/rewards/9999', { token: await getToken('free') })).status, 404);
    assert.equal((await api('POST', '/api/rewards/9999/redeem', { token: await getToken('free') })).status, 404);
  });
});

test('Epic 6 - group sessions', async (t) => {
  const listFor = async (key) => (await api('GET', '/api/sessions', { token: await getToken(key) })).body;
  const mindActivity = async () => {
    const cal = findBy((await api('GET', '/api/calendars', { token: await getToken('free') })).body, 'category', 'Mindfulness/Self-Help');
    return (await api('GET', `/api/calendars/${cal.id}/activities`, { token: await getToken('free') })).body[0];
  };

  await t.test('discovery shows host, capacity, member count and status', async () => {
    const list = await listFor('sam');
    const states = Object.fromEntries(list.map((s) => [s.title, s.status]));
    assert.equal(states['Morning Breathing Circle'], 'open');
    assert.equal(states['Weekend 5-a-side'], 'full');
    const walk = findBy(list, 'title', 'Lunchtime Walk');
    assert.equal(walk.spots_left, 1);
    assert.equal(walk.is_host, true);
    assert.ok(walk.host.name);
  });

  await t.test('join, duplicate join and my-sessions', async () => {
    const token = await getToken('premium');
    const circle = findBy(await listFor('premium'), 'title', 'Morning Breathing Circle');
    const res = await api('POST', `/api/sessions/${circle.id}/join`, { token });
    assert.equal(res.status, 200);
    assert.equal(res.body.joined, true);
    assert.ok(res.body.participants.some((p) => p.name === 'Premium Demo'));
    assert.equal(JSON.stringify(res.body).includes('@demo.saca.test'), false);
    const dup = await api('POST', `/api/sessions/${circle.id}/join`, { token });
    assert.equal(dup.status, 409);
    assert.equal(dup.body.error.code, 'ALREADY_JOINED');
    const mine = (await api('GET', '/api/sessions/my-sessions', { token })).body;
    assert.ok(mine.some((s) => s.id === circle.id));
  });

  await t.test('full sessions reject joins; reaching capacity flips status to full', async () => {
    const full = findBy(await listFor('admin'), 'title', 'Weekend 5-a-side');
    const res = await api('POST', `/api/sessions/${full.id}/join`, { token: await getToken('admin') });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'SESSION_FULL');

    const walk = findBy(await listFor('admin'), 'title', 'Lunchtime Walk');
    assert.equal((await api('POST', `/api/sessions/${walk.id}/join`, { token: await getToken('jordan') })).body.status, 'full');
    assert.equal((await api('POST', `/api/sessions/${walk.id}/join`, { token: await getToken('admin') })).status, 409);
  });

  await t.test('parallel joins never exceed capacity', async () => {
    const activity = await mindActivity();
    const created = await api('POST', '/api/sessions', {
      token: await getToken('sam'),
      body: { title: 'Race Condition Circle', description: '', capacity: 2, session_date: new Date(Date.now() + 86400000).toISOString(), activity_id: activity.id },
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.member_count, 1);
    const results = await Promise.all(['alex', 'free', 'premium', 'jordan', 'admin'].map(async (k) => api('POST', `/api/sessions/${created.body.id}/join`, { token: await getToken(k) })));
    assert.equal(results.filter((r) => r.status === 200).length, 1);
    const { rows: [{ n }] } = await pool.query('SELECT COUNT(*) AS n FROM group_session_members WHERE session_id = $1', [created.body.id]);
    assert.equal(n, 2);
  });

  await t.test('creation validation, closing and tier rules', async () => {
    const token = await getToken('free');
    const activity = await mindActivity();
    const base = { title: 'Valid title', capacity: 4, session_date: new Date(Date.now() + 86400000).toISOString(), activity_id: activity.id };
    assert.equal((await api('POST', '/api/sessions', { token, body: { ...base, session_date: new Date(Date.now() - 1000).toISOString() } })).status, 400);
    assert.equal((await api('POST', '/api/sessions', { token, body: { ...base, capacity: 1 } })).status, 400);
    assert.equal((await api('POST', '/api/sessions', { token, body: { ...base, title: 'x' } })).status, 400);
    assert.equal((await api('POST', '/api/sessions', { token, body: { ...base, activity_id: 99999 } })).status, 404);

    const premiumActivity = (await api('GET', '/api/rewards', { token })).body && (await pool.query("SELECT id FROM activities WHERE tier_required = 'premium' LIMIT 1")).rows[0];
    assert.equal((await api('POST', '/api/sessions', { token, body: { ...base, activity_id: premiumActivity.id } })).status, 403);

    const ok = await api('POST', '/api/sessions', { token, body: base });
    assert.equal(ok.status, 201);
    assert.equal((await api('POST', `/api/sessions/${ok.body.id}/close`, { token: await getToken('sam') })).status, 403);
    assert.equal((await api('POST', `/api/sessions/${ok.body.id}/close`, { token })).body.status, 'closed');
    const join = await api('POST', `/api/sessions/${ok.body.id}/join`, { token: await getToken('sam') });
    assert.equal(join.body.error.code, 'SESSION_CLOSED');
    assert.equal((await api('GET', '/api/sessions/9999', { token })).status, 404);
  });
});

test('Epic 7 - subscription and demo tier switcher', async (t) => {
  const config = require('../../backend/config');

  await t.test('switching updates the backend account and its access immediately', async () => {
    const token = await getToken('sam');
    assert.equal((await api('GET', '/api/subscription', { token })).body.tier, 'free');
    const football = findBy((await api('GET', '/api/calendars', { token })).body, 'category', 'Football');
    assert.equal((await api('GET', `/api/calendars/${football.id}/activities`, { token })).status, 403);

    const up = await api('POST', '/api/demo/tier', { token, body: { tier: 'premium' } });
    assert.equal(up.status, 200);
    assert.equal(up.body.tier, 'premium');
    assert.equal(up.body.entitlements.features.premium_calendars, true);
    assert.equal((await api('GET', '/api/profile', { token })).body.subscription_tier, 'premium');
    assert.equal((await api('GET', `/api/calendars/${football.id}/activities`, { token })).status, 200);
    assert.equal((await api('GET', '/api/subscription/entitlements', { token })).body.features.randomizer_full_pool, true);

    assert.equal((await api('POST', '/api/demo/tier', { token, body: { tier: 'free' } })).body.tier, 'free');
    assert.equal((await api('GET', `/api/calendars/${football.id}/activities`, { token })).status, 403);
  });

  await t.test('invalid tiers and non-demo accounts are rejected', async () => {
    const token = await getToken('sam');
    assert.equal((await api('POST', '/api/demo/tier', { token, body: { tier: 'platinum' } })).status, 400);
    await pool.query("UPDATE users SET is_demo = FALSE WHERE email = 'sam@demo.saca.test'");
    const res = await api('POST', '/api/demo/tier', { token, body: { tier: 'premium' } });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'DEMO_ONLY');
    await pool.query("UPDATE users SET is_demo = TRUE WHERE email = 'sam@demo.saca.test'");
  });

  await t.test('switcher is disabled outside demo mode', async () => {
    const token = await getToken('sam');
    config.demoMode = false;
    try {
      const res = await api('POST', '/api/demo/tier', { token, body: { tier: 'premium' } });
      assert.equal(res.status, 403);
      assert.equal((await api('GET', '/api/subscription', { token })).body.demo_switcher_enabled, false);
    } finally {
      config.demoMode = true;
    }
  });

  await t.test('unauthenticated calls are rejected', async () => {
    assert.equal((await api('POST', '/api/demo/tier', { body: { tier: 'premium' } })).status, 401);
    assert.equal((await api('GET', '/api/subscription')).status, 401);
  });
});

test('Ledger integrity - every balance equals the sum of its ledger rows', async () => {
  const { rows } = await pool.query(
    `SELECT u.id, u.points_balance, COALESCE(SUM(CASE l.transaction_type WHEN 'earn' THEN l.amount ELSE -l.amount END), 0) AS ledger
     FROM users u LEFT JOIN points_ledger l ON l.user_id = u.id GROUP BY u.id`,
  );
  for (const r of rows) assert.equal(Number(r.ledger), r.points_balance, `user ${r.id}`);
});
