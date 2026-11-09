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

const MINUTES_SQL = "NULLIF(substring(a.duration FROM '[0-9]+'), '')::int";

function parseFilters(raw = {}) {
  const filters = {};
  if (raw.category !== undefined && raw.category !== null && raw.category !== '') {
    if (typeof raw.category !== 'string' || raw.category.length > 60 || raw.category.includes('\u0000')) {
      throw new HttpError(400, 'VALIDATION_ERROR', 'category must be a short text value');
    }
    filters.category = raw.category;
  }
  if (raw.max_minutes !== undefined && raw.max_minutes !== null && raw.max_minutes !== '') {
    const n = Number(raw.max_minutes);
    if (!Number.isInteger(n) || n < 1 || n > 240) throw new HttpError(400, 'VALIDATION_ERROR', 'max_minutes must be a whole number between 1 and 240');
    filters.max_minutes = n;
  }
  return filters;
}

async function loadPool(db, tier, filters = {}) {
  const premium = tier === 'premium';
  const { rows } = await db.query(`
    SELECT a.id, c.category, ${MINUTES_SQL} AS minutes FROM activities a JOIN calendars c ON c.id = a.calendar_id
     WHERE a.status = 'active' AND c.status = 'active'
       AND ($1::boolean OR (a.randomizer_eligible AND a.tier_required = 'free' AND c.tier_required = 'free'))
       AND ($2::text IS NULL OR c.category = $2)
       AND ($3::int IS NULL OR ${MINUTES_SQL} <= $3)`,
    [premium, filters.category || null, filters.max_minutes || null],
  );
  return rows;
}

async function status(user) {
  const now = new Date();
  const { rows } = await pool.query('SELECT id, activity_id, drawn_at, cooldown_until FROM randomizer_draws WHERE user_id = $1 ORDER BY id DESC LIMIT 1', [user.id]);
  const last = rows[0];
  const cooling = last ? isCoolingDown(last.cooldown_until, now) : false;
  const everything = await loadPool(pool, user.subscription_tier);
  return {
    can_draw: !cooling,
    cooldown_minutes: randomizerCooldownMinutes(user.subscription_tier),
    next_available_at: cooling ? last.cooldown_until : null,
    retry_after_seconds: cooling ? Math.ceil((new Date(last.cooldown_until) - now) / 1000) : 0,
    pool_size: everything.length,
    filters: {
      categories: [...new Set(everything.map((r) => r.category))].sort(),
      max_minutes: [...new Set(everything.map((r) => r.minutes).filter(Boolean))].sort((a, b) => a - b),
    },
    last_draw: last || null,
  };
}

async function draw(user, rawFilters = {}) {
  const filters = parseFilters(rawFilters);
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

    const poolIds = (await loadPool(conn, user.subscription_tier, filters)).map((r) => r.id);
    const { rows: done } = await conn.query('SELECT activity_id FROM activity_completions WHERE user_id = $1', [user.id]);
    const activityId = pickActivity(poolIds, done.map((d) => d.activity_id));
    if (!activityId) throw new HttpError(404, 'EMPTY_POOL', 'No activities match right now. Try different filters.');

    const cooldownUntil = computeCooldownUntil(now, randomizerCooldownMinutes(user.subscription_tier));
    const { rows: [inserted] } = await conn.query(
      'INSERT INTO randomizer_draws (user_id, activity_id, drawn_at, cooldown_until) VALUES ($1, $2, $3, $4) RETURNING id',
      [user.id, activityId, now, cooldownUntil],
    );
    // The draw itself grants on-demand access to this activity, so it counts as opening it.
    await conn.query('INSERT INTO activity_opens (user_id, activity_id) VALUES ($1, $2) ON CONFLICT (user_id, activity_id) DO NOTHING', [user.id, activityId]);
    const activity = await catalog.getActivity(activityId, user, conn);
    return { draw: { id: inserted.id, drawn_at: now, cooldown_until: cooldownUntil }, activity };
  });
}
module.exports = { computeCooldownUntil, isCoolingDown, pickActivity, status, draw };
