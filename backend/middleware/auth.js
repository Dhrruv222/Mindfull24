const jwt = require('jsonwebtoken');
const config = require('../config');
const { pool } = require('../db');
const { HttpError } = require('../utils/errors');
const asyncHandler = require('../utils/asyncHandler');

const PUBLIC_FIELDS = 'id, name, email, subscription_tier, role, is_demo, points_balance, created_at';

// Verifies the bearer token, rejects revoked tokens and loads the CURRENT user row,
// so tier changes take effect immediately on the next request.
const authenticate = asyncHandler(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw new HttpError(401, 'UNAUTHENTICATED', 'Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw new HttpError(401, 'INVALID_TOKEN', 'Invalid or expired token');
  }

  const revoked = await pool.query('SELECT 1 FROM revoked_tokens WHERE jti = $1', [payload.jti]);
  if (revoked.rows.length) throw new HttpError(401, 'INVALID_TOKEN', 'Session has been logged out');

  const { rows } = await pool.query(`SELECT ${PUBLIC_FIELDS} FROM users WHERE id = $1`, [payload.sub]);
  if (!rows.length) throw new HttpError(401, 'INVALID_TOKEN', 'Account no longer exists');

  req.user = rows[0];
  req.token = payload;
  next();
});

const requireRole = (role) => (req, _res, next) => {
  if (req.user.role !== role) return next(new HttpError(403, 'FORBIDDEN', 'Insufficient permissions'));
  next();
};

module.exports = { authenticate, requireRole };
