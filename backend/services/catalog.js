const { pool, withTransaction } = require('../db');
const { HttpError, isDuplicate } = require('../utils/errors');
const { canAccess } = require('./entitlements');
const points = require('./points');

const ACTIVITY_SELECT = `
  SELECT a.id, a.calendar_id, a.title, a.description, a.instructions, a.day_number, a.points, a.duration, a.icon,
         a.tier_required, a.status, c.title AS calendar_title, c.tier_required AS calendar_tier,
         c.status AS calendar_status
  FROM activities a JOIN calendars c ON c.id = a.calendar_id`;

// An activity needs Premium if either the activity or its calendar does.
const effectiveTier = (a) => (a.tier_required === 'premium' || a.calendar_tier === 'premium' ? 'premium' : 'free');

function isLocked(activity, user) {
  return !canAccess(user.subscription_tier, effectiveTier(activity));
}

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

// Locked doors never expose their instructions.
function shapeActivity(a, user, completion, { detail = false } = {}) {
  const locked = isLocked(a, user);
  const out = {
    id: a.id,
    calendar_id: a.calendar_id,
    calendar_title: a.calendar_title,
    day_number: a.day_number,
    title: a.title,
    points: a.points,
    duration: a.duration,
    icon: a.icon,
    tier_required: effectiveTier(a),
    locked,
    completed: !!completion,
    completed_at: completion ? completion.completed_at : null,
    points_awarded: completion ? completion.points_awarded : null,
  };
  if (!locked) {
    out.description = a.description;
    if (detail) out.instructions = a.instructions;
  }
  return out;
}

async function listCalendars(user) {
  const { rows } = await pool.query(
    `SELECT c.id, c.title, c.category, c.description, c.icon, c.tier_required, c.status,
            (SELECT COUNT(*) FROM activities a WHERE a.calendar_id = c.id AND a.status = 'active') AS total_activities,
            (SELECT COUNT(*) FROM activity_completions ac JOIN activities a ON a.id = ac.activity_id
              WHERE a.calendar_id = c.id AND ac.user_id = $1) AS completed_activities
     FROM calendars c WHERE c.status <> 'inactive' ORDER BY c.id`,
    [user.id],
  );
  return rows.map((c) => ({ ...c, locked: !canAccess(user.subscription_tier, c.tier_required) }));
}

async function getCalendar(id, user) {
  const calendars = await listCalendars(user);
  const calendar = calendars.find((c) => c.id === id);
  if (!calendar) throw new HttpError(404, 'NOT_FOUND', 'Calendar not found');
  return calendar;
}

async function listActivities(calendarId, user) {
  const calendar = await getCalendar(calendarId, user);
  if (calendar.locked) {
    throw new HttpError(403, 'PREMIUM_REQUIRED', 'This calendar requires a Premium subscription', { required_tier: calendar.tier_required });
  }
  if (calendar.status !== 'active') throw new HttpError(403, 'CALENDAR_UNAVAILABLE', 'This calendar is not open yet');

  const { rows } = await pool.query(`${ACTIVITY_SELECT} WHERE a.calendar_id = $1 AND a.status = 'active' ORDER BY a.day_number`, [calendarId]);
  const { rows: done } = await pool.query(
    `SELECT ac.activity_id, ac.completed_at, ac.points_awarded FROM activity_completions ac
     JOIN activities a ON a.id = ac.activity_id WHERE ac.user_id = $1 AND a.calendar_id = $2`,
    [user.id, calendarId],
  );
  const byActivity = new Map(done.map((d) => [d.activity_id, d]));
  return rows.map((a) => shapeActivity(a, user, byActivity.get(a.id)));
}

async function getActivity(id, user, db = pool) {
  const { rows } = await db.query(`${ACTIVITY_SELECT} WHERE a.id = $1`, [id]);
  const activity = rows[0];
  assertAvailable(activity);
  assertEntitled(activity, user);
  const { rows: done } = await db.query('SELECT completed_at, points_awarded FROM activity_completions WHERE user_id = $1 AND activity_id = $2', [user.id, id]);
  return shapeActivity(activity, user, done[0], { detail: true });
}

async function completeActivity(user, activityId) {
  return withTransaction(async (conn) => {
    // Serialise this user's point-affecting requests.
    await conn.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [user.id]);
    const { rows } = await conn.query(`${ACTIVITY_SELECT} WHERE a.id = $1`, [activityId]);
    const activity = rows[0];
    assertAvailable(activity);
    assertEntitled(activity, user);

    try {
      await conn.query(
        'INSERT INTO activity_completions (user_id, activity_id, points_awarded) VALUES ($1, $2, $3)',
        [user.id, activityId, activity.points],
      );
    } catch (err) {
      if (isDuplicate(err)) throw new HttpError(409, 'ALREADY_COMPLETED', 'You have already completed this activity');
      throw err;
    }
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
  listCalendars, getCalendar, listActivities, getActivity, completeActivity, effectiveTier, isLocked,
};
