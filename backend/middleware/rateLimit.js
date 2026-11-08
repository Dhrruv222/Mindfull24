const { pool } = require('../db');
const { HttpError } = require('../utils/errors');

// Fixed-window counter stored in the database, so the limit holds across serverless instances.
async function hit(key, windowMs) {
  const { rows: [row] } = await pool.query(
    `INSERT INTO rate_limits (key, count, window_start) VALUES ($1, 1, now())
     ON CONFLICT (key) DO UPDATE SET
       count = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN 1 ELSE rate_limits.count + 1 END,
       window_start = CASE WHEN rate_limits.window_start < now() - make_interval(secs => $2) THEN now() ELSE rate_limits.window_start END
     RETURNING count`,
    [key, windowMs / 1000],
  );
  if (Math.random() < 0.02) {
    pool.query("DELETE FROM rate_limits WHERE window_start < now() - interval '1 day'").catch(() => {});
  }
  return row.count;
}

async function current(key, windowMs) {
  const { rows } = await pool.query(
    'SELECT count FROM rate_limits WHERE key = $1 AND window_start >= now() - make_interval(secs => $2)',
    [key, windowMs / 1000],
  );
  return rows.length ? rows[0].count : 0;
}

const reset = (key) => pool.query('DELETE FROM rate_limits WHERE key = $1', [key]);

// Express middleware: limits requests per IP.
function rateLimit(options) {
  return async (req, _res, next) => {
    try {
      if ((await hit(`${options.name}:${req.ip}`, options.windowMs)) > options.max) {
        throw new HttpError(429, 'RATE_LIMITED', 'Too many attempts, please try again later');
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = { rateLimit, hit, current, reset };
