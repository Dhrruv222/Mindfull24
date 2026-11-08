const { pool } = require('../db');
const points = require('./points');
const { publicUser } = require('./auth');

async function getProfile(user) {
  const { rows: [stats] } = await pool.query(
    'SELECT COUNT(*) AS completed_activities FROM activity_completions WHERE user_id = $1',
    [user.id],
  );
  const { rows: [redeemed] } = await pool.query('SELECT COUNT(*) AS n FROM redemptions WHERE user_id = $1', [user.id]);
  const { rows: [sessions] } = await pool.query('SELECT COUNT(*) AS n FROM group_session_members WHERE user_id = $1', [user.id]);
  return {
    ...publicUser(user),
    stats: {
      completed_activities: stats.completed_activities,
      redemptions: redeemed.n,
      sessions_joined: sessions.n,
    },
  };
}

async function getHistory(user) {
  const { rows } = await pool.query(
    `SELECT ac.id, ac.activity_id, a.title AS activity_title, c.title AS calendar_title, a.day_number,
            ac.points_awarded, ac.completed_at
     FROM activity_completions ac
     JOIN activities a ON a.id = ac.activity_id JOIN calendars c ON c.id = a.calendar_id
     WHERE ac.user_id = $1 ORDER BY ac.completed_at DESC, ac.id DESC`,
    [user.id],
  );
  return rows;
}

async function getPoints(user) {
  return { ...(await points.getBalance(user.id)), recent: await points.getHistory(user.id, { limit: 10 }) };
}

module.exports = { getProfile, getHistory, getPoints };
