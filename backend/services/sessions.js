const { pool, withTransaction } = require('../db');
const { HttpError, isDuplicate } = require('../utils/errors');
const { requireString, MAX_ID } = require('../utils/validators');
const catalog = require('./catalog');

// Closed wins (manually closed or already started), then full, otherwise open.
function effectiveStatus({ status, session_date, capacity, member_count }, now = new Date()) {
  if (status === 'closed' || new Date(session_date).getTime() <= now.getTime()) return 'closed';
  if (member_count >= capacity) return 'full';
  return 'open';
}

function validateCapacity(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 2 || n > 50) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Capacity must be a whole number between 2 and 50');
  }
  return n;
}

const SESSION_SELECT = `
  SELECT s.id, s.creator_id, s.activity_id, s.title, s.description, s.session_date, s.capacity, s.status,
         u.name AS host_name, a.title AS activity_title, a.tier_required AS activity_tier,
         c.tier_required AS calendar_tier,
         (SELECT COUNT(*) FROM group_session_members m WHERE m.session_id = s.id) AS member_count,
         EXISTS (SELECT 1 FROM group_session_members m WHERE m.session_id = s.id AND m.user_id = $1) AS joined
  FROM group_sessions s
  JOIN users u ON u.id = s.creator_id
  JOIN activities a ON a.id = s.activity_id
  JOIN calendars c ON c.id = a.calendar_id`;

function shape(row, user) {
  const tier = catalog.effectiveTier({ tier_required: row.activity_tier, calendar_tier: row.calendar_tier });
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    session_date: row.session_date,
    capacity: row.capacity,
    member_count: row.member_count,
    spots_left: Math.max(0, row.capacity - row.member_count),
    status: effectiveStatus(row),
    host: { id: row.creator_id, name: row.host_name },
    activity: { id: row.activity_id, title: row.activity_title, tier_required: tier },
    joined: !!row.joined,
    is_host: row.creator_id === user.id,
    activity_locked: !(user.subscription_tier === 'premium' || tier === 'free'),
  };
}

async function list(user) {
  const { rows } = await pool.query(
    `${SESSION_SELECT} WHERE s.session_date >= now() - interval '1 day' ORDER BY s.session_date`,
    [user.id],
  );
  return rows.map((r) => shape(r, user));
}

async function listMine(user) {
  const { rows } = await pool.query(
    `${SESSION_SELECT} WHERE EXISTS (SELECT 1 FROM group_session_members m WHERE m.session_id = s.id AND m.user_id = $1)
     ORDER BY s.session_date`,
    [user.id],
  );
  return rows.map((r) => shape(r, user));
}

async function get(id, user) {
  const { rows } = await pool.query(`${SESSION_SELECT} WHERE s.id = $2`, [user.id, id]);
  if (!rows.length) throw new HttpError(404, 'NOT_FOUND', 'Session not found');
  const { rows: members } = await pool.query(
    `SELECT u.id, u.name, m.joined_at FROM group_session_members m JOIN users u ON u.id = m.user_id
     WHERE m.session_id = $1 ORDER BY m.id`,
    [id],
  );
  return { ...shape(rows[0], user), participants: members };
}

async function create(user, body) {
  const title = requireString(body.title, 'Title', { min: 3, max: 120 });
  const description = body.description == null || body.description === '' ? '' : requireString(body.description, 'Description', { min: 1, max: 1000 });
  const capacity = validateCapacity(body.capacity);
  const date = new Date(body.session_date);
  if (typeof body.session_date !== 'string' || Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'session_date must be a valid future date');
  }
  const activityId = Number(body.activity_id);
  if (!Number.isInteger(activityId) || activityId <= 0 || activityId > MAX_ID) throw new HttpError(400, 'VALIDATION_ERROR', 'activity_id is required');

  const id = await withTransaction(async (conn) => {
    await catalog.getActivity(activityId, user, conn); // 404/403 if missing or locked for the host
    const { rows: [created] } = await conn.query(
      'INSERT INTO group_sessions (creator_id, activity_id, title, description, session_date, capacity) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [user.id, activityId, title, description, date, capacity],
    );
    await conn.query('INSERT INTO group_session_members (session_id, user_id) VALUES ($1, $2)', [created.id, user.id]);
    return created.id;
  });
  return get(id, user);
}

async function join(user, sessionId) {
  await withTransaction(async (conn) => {
    // The session row lock serialises joins, so capacity cannot be exceeded.
    const { rows } = await conn.query('SELECT * FROM group_sessions WHERE id = $1 FOR UPDATE', [sessionId]);
    const session = rows[0];
    if (!session) throw new HttpError(404, 'NOT_FOUND', 'Session not found');

    const { rows: [{ n }] } = await conn.query('SELECT COUNT(*) AS n FROM group_session_members WHERE session_id = $1', [sessionId]);
    const state = effectiveStatus({ ...session, member_count: n });
    const { rows: mine } = await conn.query('SELECT 1 FROM group_session_members WHERE session_id = $1 AND user_id = $2', [sessionId, user.id]);
    if (mine.length) throw new HttpError(409, 'ALREADY_JOINED', 'You have already joined this session');
    if (state === 'closed') throw new HttpError(409, 'SESSION_CLOSED', 'This session is closed');
    if (state === 'full') throw new HttpError(409, 'SESSION_FULL', 'This session is full');

    await catalog.getActivity(session.activity_id, user, conn);
    try {
      await conn.query('INSERT INTO group_session_members (session_id, user_id) VALUES ($1, $2)', [sessionId, user.id]);
    } catch (err) {
      if (isDuplicate(err)) throw new HttpError(409, 'ALREADY_JOINED', 'You have already joined this session');
      throw err;
    }
    if (n + 1 >= session.capacity) await conn.query("UPDATE group_sessions SET status = 'full' WHERE id = $1", [sessionId]);
  });
  return get(sessionId, user);
}

async function close(user, sessionId) {
  const { rows } = await pool.query('SELECT creator_id FROM group_sessions WHERE id = $1', [sessionId]);
  if (!rows.length) throw new HttpError(404, 'NOT_FOUND', 'Session not found');
  if (rows[0].creator_id !== user.id) throw new HttpError(403, 'FORBIDDEN', 'Only the host can close a session');
  await pool.query("UPDATE group_sessions SET status = 'closed' WHERE id = $1", [sessionId]);
  return get(sessionId, user);
}

module.exports = { effectiveStatus, validateCapacity, list, listMine, get, create, join, close };
