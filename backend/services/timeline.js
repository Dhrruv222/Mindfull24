const { pool } = require('../db');
const { HttpError } = require('../utils/errors');
const { canAccess } = require('./entitlements');

// Only the seeded demo accounts carry pre-made history; self-registered users' records are real use.
const SEEDED_DEMO_EMAIL = /@demo\.saca\.test$/i;
const MAX_RANGE_DAYS = 100;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const LO = "($2::date::timestamp AT TIME ZONE 'UTC')";
const HI = "(($3::date + 1)::timestamp AT TIME ZONE 'UTC')";
const TODAY = "(now() AT TIME ZONE 'UTC')::date";

function parseDate(value, name) {
  if (typeof value !== 'string' || !DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new HttpError(400, 'VALIDATION_ERROR', `${name} must be a date in YYYY-MM-DD format`);
  }
  return value;
}

function resolveRange(query = {}) {
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const from = query.from ? parseDate(query.from, 'from') : monthStart;
  const to = query.to ? parseDate(query.to, 'to') : monthEnd;
  const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS;
  if (span < 0) throw new HttpError(400, 'VALIDATION_ERROR', 'from must not be after to');
  if (span > MAX_RANGE_DAYS) throw new HttpError(400, 'VALIDATION_ERROR', `The range may cover at most ${MAX_RANGE_DAYS} days`);
  return { from, to };
}

function doorStatus({ completed, opened, scheduled }) {
  if (completed) return 'completed';
  if (scheduled) return 'locked';
  return opened ? 'pending' : 'available';
}

async function getTimeline(user, query) {
  const { from, to } = resolveRange(query);
  const params = [user.id, from, to];

  const [available, opened, completed, ledger, redemptions, draws, sessions, today] = await Promise.all([
    pool.query(
      `SELECT a.id, a.day_number, a.title, a.points, c.title AS calendar_title, c.tier_required AS calendar_tier, a.tier_required,
              to_char(c.start_date + (a.day_number - 1), 'YYYY-MM-DD') AS unlock_date,
              (c.start_date + (a.day_number - 1) > ${TODAY}) AS scheduled,
              EXISTS (SELECT 1 FROM activity_opens o WHERE o.user_id = $1 AND o.activity_id = a.id) AS opened,
              EXISTS (SELECT 1 FROM activity_completions x WHERE x.user_id = $1 AND x.activity_id = a.id) AS completed
       FROM user_calendars uc JOIN calendars c ON c.id = uc.calendar_id AND c.status = 'active'
       JOIN activities a ON a.calendar_id = c.id AND a.status = 'active'
       WHERE uc.user_id = $1 AND c.start_date + (a.day_number - 1) BETWEEN $2::date AND $3::date
       ORDER BY c.start_date + (a.day_number - 1), c.id`,
      params,
    ),
    pool.query(
      `SELECT o.id, o.opened_at, a.title, a.day_number, c.title AS calendar_title,
              EXISTS (SELECT 1 FROM activity_completions x WHERE x.user_id = o.user_id AND x.activity_id = o.activity_id) AS completed
       FROM activity_opens o JOIN activities a ON a.id = o.activity_id JOIN calendars c ON c.id = a.calendar_id
       WHERE o.user_id = $1 AND o.opened_at >= ${LO} AND o.opened_at < ${HI} ORDER BY o.opened_at`,
      params,
    ),
    pool.query(
      `SELECT x.id, x.completed_at, x.points_awarded, a.title, a.day_number, c.title AS calendar_title
       FROM activity_completions x JOIN activities a ON a.id = x.activity_id JOIN calendars c ON c.id = a.calendar_id
       WHERE x.user_id = $1 AND x.completed_at >= ${LO} AND x.completed_at < ${HI} ORDER BY x.completed_at`,
      params,
    ),
    pool.query(
      `SELECT id, transaction_type, amount, balance_after, reference_type, created_at FROM points_ledger
       WHERE user_id = $1 AND created_at >= ${LO} AND created_at < ${HI} ORDER BY created_at, id`,
      params,
    ),
    pool.query(
      `SELECT d.id, d.created_at, d.points_spent, r.reward_title, r.partner_name FROM redemptions d JOIN rewards r ON r.id = d.reward_id
       WHERE d.user_id = $1 AND d.created_at >= ${LO} AND d.created_at < ${HI} ORDER BY d.created_at`,
      params,
    ),
    pool.query(
      `SELECT d.id, d.drawn_at, a.title, c.title AS calendar_title FROM randomizer_draws d
       JOIN activities a ON a.id = d.activity_id JOIN calendars c ON c.id = a.calendar_id
       WHERE d.user_id = $1 AND d.drawn_at >= ${LO} AND d.drawn_at < ${HI} ORDER BY d.drawn_at`,
      params,
    ),
    pool.query(
      `SELECT m.id, m.joined_at, s.title, s.session_date, s.creator_id FROM group_session_members m JOIN group_sessions s ON s.id = m.session_id
       WHERE m.user_id = $1 AND m.joined_at >= ${LO} AND m.joined_at < ${HI} ORDER BY m.joined_at`,
      params,
    ),
    pool.query(`SELECT to_char(${TODAY}, 'YYYY-MM-DD') AS today`),
  ]);

  const events = [];
  for (const r of available.rows) {
    if (!canAccess(user.subscription_tier, r.calendar_tier === 'premium' || r.tier_required === 'premium' ? 'premium' : 'free')) continue;
    events.push({
      id: `available:${r.id}`, type: 'door_available', all_day: true, date: r.unlock_date, at: null,
      title: r.scheduled ? `Door ${r.day_number} opens` : r.title,
      description: r.scheduled ? 'This door is still sealed.' : `Door ${r.day_number} became available (${r.points} points).`,
      calendar: r.calendar_title, status: doorStatus(r),
    });
  }
  for (const r of opened.rows) {
    events.push({
      id: `opened:${r.id}`, type: 'door_opened', all_day: false, date: null, at: r.opened_at, title: r.title,
      description: `You opened door ${r.day_number}.`, calendar: r.calendar_title, status: r.completed ? 'completed' : 'pending',
    });
  }
  for (const r of completed.rows) {
    events.push({
      id: `completed:${r.id}`, type: 'activity_completed', all_day: false, date: null, at: r.completed_at, title: r.title,
      description: `Completed door ${r.day_number} for ${r.points_awarded} points.`, calendar: r.calendar_title, status: 'completed', points: r.points_awarded,
    });
  }
  for (const r of ledger.rows) {
    const earn = r.transaction_type === 'earn';
    events.push({
      id: `points:${r.id}`, type: earn ? 'points_earned' : 'points_spent', all_day: false, date: null, at: r.created_at,
      title: `${earn ? '+' : '-'}${r.amount} points`,
      description: `${r.reference_type === 'seed' ? 'Starting demo balance' : r.reference_type === 'activity' ? 'Activity completed' : 'Reward redeemed'}. Balance ${r.balance_after}.`,
      calendar: null, status: 'completed', points: earn ? r.amount : -r.amount,
    });
  }
  for (const r of redemptions.rows) {
    events.push({
      id: `redeemed:${r.id}`, type: 'reward_redeemed', all_day: false, date: null, at: r.created_at, title: r.reward_title,
      description: `Redeemed from ${r.partner_name} for ${r.points_spent} points (demo reward).`, calendar: null, status: 'completed', points: -r.points_spent,
    });
  }
  for (const r of draws.rows) {
    events.push({
      id: `draw:${r.id}`, type: 'randomizer_draw', all_day: false, date: null, at: r.drawn_at, title: r.title,
      description: 'Drawn with the randomizer.', calendar: r.calendar_title, status: 'pending',
    });
  }
  for (const r of sessions.rows) {
    events.push({
      id: `session:${r.id}`, type: 'session_joined', all_day: false, date: null, at: r.joined_at, title: r.title,
      description: r.creator_id === user.id ? 'You created this group session.' : 'You joined this group session.', calendar: null, status: 'completed',
    });
  }

  const key = (e) => e.at ? new Date(e.at).getTime() : Date.parse(`${e.date}T00:00:00Z`);
  events.sort((a, b) => key(a) - key(b) || a.id.localeCompare(b.id));
  return {
    from,
    to,
    today: today.rows[0].today,
    user: { id: user.id, name: user.name },
    demo_data: SEEDED_DEMO_EMAIL.test(user.email),
    events,
  };
}

module.exports = { getTimeline, resolveRange };
