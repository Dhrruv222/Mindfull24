const { HttpError, isDuplicate } = require('../utils/errors');
const { pool } = require('../db');

// Pure helper: the balance implied by a list of ledger rows.
function computeBalance(entries) {
  return entries.reduce((sum, e) => sum + (e.transaction_type === 'earn' ? e.amount : -e.amount), 0);
}

// Records one ledger row and moves the user balance. Must run inside a transaction `conn`.
// The user row is locked so concurrent spends cannot overdraw the balance.
async function applyTransaction(conn, { userId, type, amount, referenceType, referenceId = null, idempotencyKey }) {
  if (!['earn', 'spend'].includes(type) || !Number.isInteger(amount) || amount <= 0) {
    throw new HttpError(400, 'INVALID_TRANSACTION', 'Invalid points transaction');
  }
  const { rows: [user] } = await conn.query('SELECT points_balance FROM users WHERE id = $1 FOR UPDATE', [userId]);
  const newBalance = user.points_balance + (type === 'earn' ? amount : -amount);
  if (newBalance < 0) {
    throw new HttpError(409, 'INSUFFICIENT_POINTS', 'Not enough points', { balance: user.points_balance, required: amount });
  }
  try {
    await conn.query(
      `INSERT INTO points_ledger (user_id, transaction_type, amount, balance_after, reference_type, reference_id, idempotency_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, type, amount, newBalance, referenceType, referenceId, idempotencyKey],
    );
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, 'DUPLICATE_TRANSACTION', 'This transaction was already processed');
    throw err;
  }
  await conn.query('UPDATE users SET points_balance = $1 WHERE id = $2', [newBalance, userId]);
  return newBalance;
}

async function getBalance(userId) {
  const { rows: [row] } = await pool.query(
    `SELECT u.points_balance AS balance,
            COALESCE(SUM(CASE l.transaction_type WHEN 'earn' THEN l.amount ELSE -l.amount END), 0) AS ledger_balance,
            COALESCE(SUM(CASE WHEN l.transaction_type = 'earn' THEN l.amount END), 0) AS total_earned,
            COALESCE(SUM(CASE WHEN l.transaction_type = 'spend' THEN l.amount END), 0) AS total_spent
     FROM users u LEFT JOIN points_ledger l ON l.user_id = u.id
     WHERE u.id = $1 GROUP BY u.id`,
    [userId],
  );
  return {
    balance: row.balance,
    ledger_balance: Number(row.ledger_balance),
    total_earned: Number(row.total_earned),
    total_spent: Number(row.total_spent),
  };
}

async function getHistory(userId, { limit = 50, offset = 0 } = {}) {
  const { rows } = await pool.query(
    `SELECT id, transaction_type, amount, balance_after, reference_type, reference_id, created_at
     FROM points_ledger WHERE user_id = $1 ORDER BY id DESC LIMIT $2 OFFSET $3`,
    [userId, limit, offset],
  );
  return rows;
}

module.exports = { computeBalance, applyTransaction, getBalance, getHistory };
