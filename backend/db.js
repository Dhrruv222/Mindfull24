const { Pool, types } = require('pg');
const config = require('./config');

// COUNT/SUM come back as bigint/numeric strings by default; our values are small.
types.setTypeParser(20, (v) => Number.parseInt(v, 10));
types.setTypeParser(1700, (v) => Number.parseFloat(v));

const pool = new Pool({
  connectionString: config.db.url,
  ssl: config.db.ssl,
  max: config.db.poolMax,
  idleTimeoutMillis: 10000,
  connectionTimeoutMillis: 10000,
});
pool.on('error', (err) => console.error('Unexpected database error', err.message));

// Runs fn inside one transaction; any thrown error rolls everything back.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, withTransaction };
