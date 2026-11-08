const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const { pool } = require('../db');
const { HttpError, isDuplicate } = require('../utils/errors');
const { validateEmail, validatePassword, validateName } = require('../utils/validators');
const limiter = require('../middleware/rateLimit');

const LOCK_WINDOW_MS = 15 * 60 * 1000;

// Used to keep login timing similar whether or not the email exists.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password-1', config.bcryptRounds);

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  subscription_tier: u.subscription_tier,
  role: u.role,
  points_balance: u.points_balance,
  demo_switcher_enabled: config.demoMode && !!u.is_demo,
  created_at: u.created_at,
});

function issueToken(user) {
  return jwt.sign({ sub: user.id }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
    jwtid: crypto.randomUUID(),
  });
}

async function register({ name, email, password }) {
  if (!validateName(name)) throw new HttpError(400, 'VALIDATION_ERROR', 'Name must be 1-60 characters');
  if (!validateEmail(email)) throw new HttpError(400, 'VALIDATION_ERROR', 'A valid email address is required');
  if (!validatePassword(password)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Password must be 8-72 characters and include a letter and a number');
  }
  const hash = await bcrypt.hash(password, config.bcryptRounds);
  let user;
  try {
    const { rows } = await pool.query(
      'INSERT INTO users (name, email, password_hash, is_demo) VALUES ($1, $2, $3, $4) RETURNING *',
      [name.trim(), email.trim().toLowerCase(), hash, config.demoMode],
    );
    [user] = rows;
  } catch (err) {
    if (isDuplicate(err)) throw new HttpError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
    throw err;
  }
  return { token: issueToken(user), user: publicUser(user) };
}

async function login({ email, password }) {
  if (!validateEmail(email) || typeof password !== 'string') {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Email and password are required');
  }
  const normalized = email.trim().toLowerCase();
  const lockKey = `login-fail:${normalized}`;
  if ((await limiter.current(lockKey, LOCK_WINDOW_MS)) >= config.loginMaxFailures) {
    throw new HttpError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Please try again in a few minutes.');
  }
  const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [normalized]);
  const user = rows[0];
  const ok = await bcrypt.compare(password, user ? user.password_hash : DUMMY_HASH);
  if (!user || !ok) {
    await limiter.hit(lockKey, LOCK_WINDOW_MS);
    throw new HttpError(401, 'INVALID_CREDENTIALS', 'Incorrect email or password');
  }
  await limiter.reset(lockKey);
  return { token: issueToken(user), user: publicUser(user) };
}

async function logout(tokenPayload) {
  await pool.query('DELETE FROM revoked_tokens WHERE expires_at < now()');
  await pool.query('INSERT INTO revoked_tokens (jti, expires_at) VALUES ($1, $2) ON CONFLICT DO NOTHING', [
    tokenPayload.jti,
    new Date(tokenPayload.exp * 1000),
  ]);
}

module.exports = { register, login, logout, publicUser };
