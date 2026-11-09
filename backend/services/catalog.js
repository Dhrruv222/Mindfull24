const { pool, withTransaction } = require('../db');
const { HttpError, isDuplicate } = require('../utils/errors');
const { canAccess } = require('./entitlements');
const points = require('./points');

// Door N of a calendar opens on start_date + (N - 1) days (UTC). The comparison runs in the database
// so the schedule is enforced server-side, never by the browser clock.
const ACTIVITY_SELECT = `
  SELECT a.id, a.calendar_id, a.title, a.description, a.instructions, a.day_number, a.points, a.duration, a.icon,
         a.tier_required, a.status, c.title AS calendar_title, c.tier_required AS calendar_tier,
         c.status AS calendar_status,
         to_char(c.start_date + (a.day_number - 1), 'YYYY-MM-DD') AS unlock_date,
         ((c.start_date + (a.day_number - 1)) <= (now() AT TIME ZONE 'UTC')::date) AS date_unlocked
  FROM activities a JOIN calendars c ON c.id = a.calendar_id`;

// An activity needs Premium if either the activity or its calendar does.
const effectiveTier = (a) => (a.tier_required === 'premium' || a.calendar_tier === 'premium' ? 'premium' : 'free');

function isLocked(activity, user) {
  return !canAccess(user.subscription_tier, effectiveTier(activity));
}

// A door can be used once its date has arrived, or when the randomizer handed it to the user on demand.
const isScheduled = (activity, drawn) => !activity.date_unlocked && !drawn;

function assertAvailable(activity) {
  if (!activity || activity.status !== 'active' || activity.calendar_status === 'inactive') {
    throw new HttpError(404, 'NOT_FOUND', 'Activity not found');
  }
  if (activity.calendar_status !== 'active') {
    throw new HttpError(403, 'CALENDAR_UNAVAILABLE', 'This calendar is not open yet');
  }
}

function assertEntitled(activity, user) {
  if (isLocked(activity, user)) {
    throw new HttpError(403, 'PREMIUM_REQUIRED', 'This activity requires a Premium subscription', { required_tier: 'premium' });
  }
}

function assertUnlocked(activity, drawn) {
  if (isScheduled(activity, drawn)) {
    throw new HttpError(403, 'DOOR_LOCKED', `This door opens on ${activity.unlock_date}`, { unlock_date: activity.unlock_date });
  }
}

async function wasDrawn(db, userId, activityId) {
  const { rows } = await db.query('SELECT 1 FROM randomizer_draws WHERE user_id = $1 AND activity_id = $2 LIMIT 1', [userId, activityId]);
  return rows.length > 0;
}

// Locked and scheduled doors never expose their content.
function shapeActivity(a, user, { completion, opened, drawn = false } = {}, { detail = false } = {}) {
  const premiumLocked = isLocked(a, user);
  const scheduled = !premiumLocked && isScheduled(a, drawn);
  let state = 'available';
  if (completion) state = 'completed';
  else if (premiumLocked) state = 'premium_locked';
  else if (scheduled) state = 'scheduled';
  else if (opened) state = 'opened';

  const out = {
    id: a.id,
    calendar_id: a.calendar_id,
    calendar_title: a.calendar_title,
    day_number: a.day_number,
    unlock_date: a.unlock_date,
    state,
    tier_required: effectiveTier(a),
    locked: premiumLocked,
    scheduled,
    completed: !!completion,
    completed_at: completion ? completion.completed_at : null,
    points_awarded: completion ? completion.points_awarded : null,
    opened: !!opened,
    opened_at: opened ? opened.opened_at : null,
    icon: a.icon,
  };
  if (!scheduled) {
    out.title = a.title;
    out.points = a.points;
    out.duration = a.duration;
  }
  if (!premiumLocked && !scheduled) {
    out.description = a.description;
    if (detail) out.instructions = a.instructions;
  }
  return out;
}

async function listCalendars(user) {
  const { rows } = await pool.query(
    `SELECT c.id, c.title, c.category, c.description, c.icon, c.tier_required, c.status,
            to_char(c.start_date, 'YYYY-MM-DD') AS start_date,
            (SELECT COUNT(*) FROM activities a WHERE a.calendar_id = c.id AND a.status = 'active') AS total_activities,
            (SELECT COUNT(*) FROM activities a WHERE a.calendar_id = c.id AND a.status = 'active'
               AND c.start_date + (a.day_number - 1) <= (now() AT TIME ZONE 'UTC')::date) AS unlocked_doors,
            (SELECT COUNT(*) FROM activity_completions ac JOIN activities a ON a.id = ac.activity_id
              WHERE a.calendar_id = c.id AND ac.user_id = $1) AS completed_activities,
            (SELECT COUNT(*) FROM activity_opens ao JOIN activities a ON a.id = ao.activity_id
              WHERE a.calendar_id = c.id AND ao.user_id = $1) AS opened_activities,
            (SELECT a.day_number FROM activities a WHERE a.calendar_id = c.id AND a.status = 'active'
               AND c.start_date + (a.day_number - 1) > (now() AT TIME ZONE 'UTC')::date ORDER BY a.day_number LIMIT 1) AS next_unlock_day,
            (SELECT to_char(c.start_date + (a.day_number - 1), 'YYYY-MM-DD') FROM activities a WHERE a.calendar_id = c.id AND a.status = 'active'
               AND c.start_date + (a.day_number - 1) > (now() AT TIME ZONE 'UTC')::date ORDER BY a.day_number LIMIT 1) AS next_unlock_date,
            uc.joined_at
     FROM calendars c LEFT JOIN user_calendars uc ON uc.calendar_id = c.id AND uc.user_id = $1
     WHERE c.status <> 'inactive' ORDER BY c.id`,
    [user.id],
  );
  return rows.map((c) => ({ ...c, joined: !!c.joined_at, locked: !canAccess(user.subscription_tier, c.tier_required) }));
}

async function getCalendar(id, user) {
  const calendars = await listCalendars(user);
  const calendar = calendars.find((c) => c.id === id);
  if (!calendar) throw new HttpError(404, 'NOT_FOUND', 'Calendar not found');
  return calendar;
}

function assertCalendarOpen(calendar) {
  if (calendar.locked) {
    throw new HttpError(403, 'PREMIUM_REQUIRED', 'This calendar requires a Premium subscription', { required_tier: calendar.tier_required });
  }
  if (calendar.status !== 'active') throw new HttpError(403, 'CALENDAR_UNAVAILABLE', 'This calendar is not open yet');
}

async function joinCalendar(user, calendarId, db = pool) {
  await db.query('INSERT INTO user_calendars (user_id, calendar_id) VALUES ($1, $2) ON CONFLICT (user_id, calendar_id) DO NOTHING', [user.id, calendarId]);
}

async function activateCalendar(user, calendarId) {
  assertCalendarOpen(await getCalendar(calendarId, user));
  await joinCalendar(user, calendarId);
  return getCalendar(calendarId, user);
}

async function listActivities(calendarId, user) {
  assertCalendarOpen(await getCalendar(calendarId, user));

  const { rows } = await pool.query(`${ACTIVITY_SELECT} WHERE a.calendar_id = $1 AND a.status = 'active' ORDER BY a.day_number`, [calendarId]);
  const { rows: done } = await pool.query(
    `SELECT ac.activity_id, ac.completed_at, ac.points_awarded FROM activity_completions ac
     JOIN activities a ON a.id = ac.activity_id WHERE ac.user_id = $1 AND a.calendar_id = $2`,
    [user.id, calendarId],
  );
  const { rows: opens } = await pool.query(
    `SELECT ao.activity_id, ao.opened_at FROM activity_opens ao
     JOIN activities a ON a.id = ao.activity_id WHERE ao.user_id = $1 AND a.calendar_id = $2`,
    [user.id, calendarId],
  );
  const { rows: draws } = await pool.query(
    `SELECT DISTINCT d.activity_id FROM randomizer_draws d
     JOIN activities a ON a.id = d.activity_id WHERE d.user_id = $1 AND a.calendar_id = $2`,
    [user.id, calendarId],
  );
  const completions = new Map(done.map((d) => [d.activity_id, d]));
  const opened = new Map(opens.map((o) => [o.activity_id, o]));
  const drawn = new Set(draws.map((d) => d.activity_id));
  return rows.map((a) => shapeActivity(a, user, { completion: completions.get(a.id), opened: opened.get(a.id), drawn: drawn.has(a.id) }));
}

// `skipSchedule` lets group sessions reference a door that has not opened yet.
async function getActivity(id, user, db = pool, { skipSchedule = false } = {}) {
  const { rows } = await db.query(`${ACTIVITY_SELECT} WHERE a.id = $1`, [id]);
  const activity = rows[0];
  assertAvailable(activity);
  assertEntitled(activity, user);
  const drawn = await wasDrawn(db, user.id, id);
  if (!skipSchedule) assertUnlocked(activity, drawn);
  const { rows: done } = await db.query('SELECT completed_at, points_awarded FROM activity_completions WHERE user_id = $1 AND activity_id = $2', [user.id, id]);
  const { rows: opens } = await db.query('SELECT opened_at FROM activity_opens WHERE user_id = $1 AND activity_id = $2', [user.id, id]);
  return shapeActivity(activity, user, { completion: done[0], opened: opens[0], drawn: drawn || skipSchedule }, { detail: true });
}

async function recordOpen(conn, userId, activityId) {
  await conn.query('INSERT INTO activity_opens (user_id, activity_id) VALUES ($1, $2) ON CONFLICT (user_id, activity_id) DO NOTHING', [userId, activityId]);
}

// Opening a door reveals it, records when, and activates its calendar for the user.
async function openActivity(user, activityId) {
  await withTransaction(async (conn) => {
    const activity = await getActivity(activityId, user, conn);
    await recordOpen(conn, user.id, activityId);
    await joinCalendar(user, activity.calendar_id, conn);
  });
  return getActivity(activityId, user);
}

async function completeActivity(user, activityId) {
  return withTransaction(async (conn) => {
    // Serialise this user's point-affecting requests.
    await conn.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id]);
    const { rows } = await conn.query(`${ACTIVITY_SELECT} WHERE a.id = $1`, [activityId]);
    const activity = rows[0];
    assertAvailable(activity);
    assertEntitled(activity, user);
    assertUnlocked(activity, await wasDrawn(conn, user.id, activityId));

    try {
      await conn.query(
        'INSERT INTO activity_completions (user_id, activity_id, points_awarded) VALUES ($1, $2, $3)',
        [user.id, activityId, activity.points],
      );
    } catch (err) {
      if (isDuplicate(err)) throw new HttpError(409, 'ALREADY_COMPLETED', 'You have already completed this activity');
      throw err;
    }
    await recordOpen(conn, user.id, activityId);
    await joinCalendar(user, activity.calendar_id, conn);
    const balance = await points.applyTransaction(conn, {
      userId: user.id,
      type: 'earn',
      amount: activity.points,
      referenceType: 'activity',
      referenceId: activityId,
      idempotencyKey: `activity:${user.id}:${activityId}`,
    });
    return { activity_id: activityId, points_awarded: activity.points, balance };
  });
}

module.exports = {
  listCalendars, getCalendar, activateCalendar, listActivities, getActivity, openActivity, completeActivity, effectiveTier, isLocked,
  ACTIVITY_SELECT,
};
