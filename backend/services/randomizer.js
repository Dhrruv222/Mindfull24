const crypto = require('crypto');
const { pool, withTransaction } = require('../db');
const { HttpError } = require('../utils/errors');
const { randomizerCooldownMinutes } = require('./entitlements');
const catalog = require('./catalog');

function computeCooldownUntil(now, minutes) {
  return new Date(now.getTime() + minutes * 60 * 1000);
}

function isCoolingDown(cooldownUntil, now) {
  return !!cooldownUntil && new Date(cooldownUntil).getTime() > now.getTime();
}

// Prefer activities the user has not completed yet; fall back to the whole pool.
function pickActivity(poolIds, completedIds, rng = (n) => crypto.randomInt(n)) {
  const done = new Set(completedIds);
  const fresh = poolIds.filter((id) => !done.has(id));
  const candidates = fresh.length ? fresh : poolIds;
  return candidates.length ? candidates[rng(candidates.length)] : null;
}

async function loadPool(db, tier) {
  const premium = tier === 'premium';
  const { rows } = await db.query(`
    SELECT a.id FROM activities a JOIN calendars c ON c.id = a.calendar_id
     WHERE a.status = 'active' AND c.status = 'active'
       AND ($1::boolean OR (a.randomizer_eligible AND a.tier_required = 'free' AND c.tier_required = 'free'))`,
    [premium],
  );
  return rows.map((r) => r.id);
}

async function status(user) {
  const now = new Date();
  const { rows } = await pool.query('SELECT id, activity_id, drawn_at, cooldown_until FROM randomizer_draws WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [user.id]);
  const last = rows[0];
  const cooling = last ? isCoolingDown(last.cooldown_until, now) : false;
  const poolIds = await loadPool(pool, user.subscription_tier);
  return {
    can_draw: !cooling,
    cooldown_minutes: randomizerCooldownMinutes(user.subscription_tier),
    next_available_at: cooling ? last.cooldown_until : null,
    retry_after_seconds: cooling ? Math.ceil((new Date(last.cooldown_until) - now) / 1000) : 0,
    pool_size: poolIds.length,
    last_draw: last || null,
  };
}

async function draw(user) {
  return withTransaction(async (conn) => {
    // Locking the user row makes check-then-insert atomic, so parallel requests cannot bypass the cooldown.
    await conn.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id]);
    const now = new Date();
    const { rows } = await conn.query('SELECT cooldown_until FROM randomizer_draws WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [user.id]);
    if (rows[0] && isCoolingDown(rows[0].cooldown_until, now)) {
      throw new HttpError(429, 'RANDOMIZER_COOLDOWN', 'Randomizer is cooling down', {
        next_available_at: rows[0].cooldown_until,
        retry_after_seconds: Math.ceil((new Date(rows[0].cooldown_until) - now) / 1000),
      });
    }

    const poolIds = await loadPool(conn, user.subscription_tier);
    const { rows: done } = await conn.query('SELECT activity_id FROM activity_completions WHERE user_id = $1', [user.id]);
    const activityId = pickActivity(poolIds, done.map((d) => d.activity_id));
    if (!activityId) throw new HttpError(404, 'EMPTY_POOL', 'No activities are available to draw right now');

    const cooldownUntil = computeCooldownUntil(now, randomizerCooldownMinutes(user.subscription_tier));
    const { rows: [inserted] } = await conn.query(
      'INSERT INTO randomizer_draws (user_id, activity_id, drawn_at, cooldown_until) VALUES ($1, $2, $3, $4) RETURNING id',
      [user.id, activityId, now, cooldownUntil],
    );
    const activity = await catalog.getActivity(activityId, user, conn);
    return { draw: { id: inserted.id, drawn_at: now, cooldown_until: cooldownUntil }, activity };
  });
}

module.exports = { computeCooldownUntil, isCoolingDown, pickActivity, status, draw };
