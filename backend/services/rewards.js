const { pool, withTransaction } = require('../db');
const { HttpError } = require('../utils/errors');
const { canAccess, assertAccess } = require('./entitlements');
const points = require('./points');

const REWARD_SELECT = `
  SELECT r.id, r.icon, r.partner_name, r.reward_title, r.description, r.points_cost, r.availability,
         (SELECT COUNT(*) FROM promo_codes p WHERE p.reward_id = r.id AND p.status = 'available') AS codes_available
  FROM rewards r`;

// Reports whether a user can redeem now, without touching the database.
function evaluateEligibility(user, reward, balance) {
  if (!canAccess(user.subscription_tier, reward.availability)) return { eligible: false, reason: 'PREMIUM_REQUIRED' };
  if (reward.codes_available <= 0) return { eligible: false, reason: 'OUT_OF_STOCK' };
  if (balance < reward.points_cost) return { eligible: false, reason: 'INSUFFICIENT_POINTS' };
  return { eligible: true, reason: null };
}

function shape(reward, user) {
  const { eligible, reason } = evaluateEligibility(user, reward, user.points_balance);
  return {
    id: reward.id,
    icon: reward.icon,
    partner_name: reward.partner_name,
    reward_title: reward.reward_title,
    description: reward.description,
    points_cost: reward.points_cost,
    tier_required: reward.availability,
    in_stock: reward.codes_available > 0,
    locked: !canAccess(user.subscription_tier, reward.availability),
    affordable: user.points_balance >= reward.points_cost,
    points_missing: Math.max(0, reward.points_cost - user.points_balance),
    can_redeem: eligible,
    blocked_reason: reason,
  };
}

async function list(user) {
  const { rows } = await pool.query(`${REWARD_SELECT} WHERE r.status = 'active' ORDER BY r.points_cost, r.id`);
  return rows.map((r) => shape(r, user));
}

async function get(id, user) {
  const { rows } = await pool.query(`${REWARD_SELECT} WHERE r.id = $1 AND r.status = 'active'`, [id]);
  if (!rows.length) throw new HttpError(404, 'NOT_FOUND', 'Reward not found');
  return shape(rows[0], user);
}

async function redeem(user, rewardId, clientKey) {
  return withTransaction(async (conn) => {
    // 1-3. Lock the account row: concurrent redemptions by this user queue up here.
    const { rows: [locked] } = await conn.query('SELECT points_balance FROM users WHERE id = $1 FOR UPDATE', [user.id]);

    const { rows: rewards } = await conn.query("SELECT * FROM rewards WHERE id = $1 AND status = 'active'", [rewardId]);
    const reward = rewards[0];
    if (!reward) throw new HttpError(404, 'NOT_FOUND', 'Reward not found');
    assertAccess(user, reward.availability, 'This reward');

    // 4. Sufficient points?
    if (locked.points_balance < reward.points_cost) {
      throw new HttpError(409, 'INSUFFICIENT_POINTS', 'Not enough points for this reward', {
        balance: locked.points_balance,
        required: reward.points_cost,
      });
    }

    // 5. Reserve one unused promo code (SKIP LOCKED lets other users take other codes in parallel).
    const { rows: codes } = await conn.query(
      "SELECT id, promo_code FROM promo_codes WHERE reward_id = $1 AND status = 'available' ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED",
      [rewardId],
    );
    if (!codes.length) throw new HttpError(409, 'OUT_OF_STOCK', 'No promo codes left for this reward');
    const code = codes[0];

    // 6-7. Redemption record, mark code issued, deduct points via the ledger.
    const { rows: [redemption] } = await conn.query(
      'INSERT INTO redemptions (user_id, reward_id, promo_code_id, points_spent) VALUES ($1, $2, $3, $4) RETURNING id',
      [user.id, rewardId, code.id, reward.points_cost],
    );
    await conn.query("UPDATE promo_codes SET status = 'issued', issued_to = $1, issued_at = $2 WHERE id = $3", [user.id, new Date(), code.id]);
    const balance = await points.applyTransaction(conn, {
      userId: user.id,
      type: 'spend',
      amount: reward.points_cost,
      referenceType: 'redemption',
      referenceId: redemption.id,
      idempotencyKey: clientKey ? `redeem-req:${user.id}:${clientKey}` : `redeem:${redemption.id}`,
    });

    // 8. Commit happens when this callback returns; any throw above rolls everything back.
    return {
      redemption_id: redemption.id,
      reward_title: reward.reward_title,
      icon: reward.icon,
    partner_name: reward.partner_name,
      promo_code: code.promo_code,
      points_spent: reward.points_cost,
      balance,
    };
  });
}

async function listRedemptions(user) {
  const { rows } = await pool.query(
    `SELECT d.id, d.points_spent, d.status, d.created_at, r.reward_title, r.partner_name, p.promo_code
     FROM redemptions d JOIN rewards r ON r.id = d.reward_id JOIN promo_codes p ON p.id = d.promo_code_id
     WHERE d.user_id = $1 ORDER BY d.id DESC`,
    [user.id],
  );
  return rows;
}

module.exports = { evaluateEligibility, list, get, redeem, listRedemptions };
