// Applies pending *.sql migrations in order. --fresh drops this app's tables first
// (only its own tables, so other tables in a shared Supabase project are left alone).
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const config = require('../config');

const APP_TABLES = [
  'rate_limits', 'group_session_members', 'group_sessions', 'redemptions', 'promo_codes', 'rewards', 'randomizer_draws',
  'points_ledger', 'activity_completions', 'activities', 'calendars', 'revoked_tokens', 'users', 'schema_migrations',
];

async function migrate({ fresh = false } = {}) {
  const client = new Client({ connectionString: config.db.url, ssl: config.db.ssl });
  await client.connect();
  try {
    if (fresh) await client.query(`DROP TABLE IF EXISTS ${APP_TABLES.join(', ')} CASCADE`);
    await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
    const { rows } = await client.query('SELECT name FROM schema_migrations');
    const applied = new Set(rows.map((r) => r.name));
    const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.sql')).sort();
    const ran = [];
    for (const file of files) {
      if (applied.has(file)) continue;
      await client.query('BEGIN');
      try {
        await client.query(fs.readFileSync(path.join(__dirname, file), 'utf8'));
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      }
      ran.push(file);
    }
    return ran;
  } finally {
    await client.end();
  }
}

module.exports = { migrate };

if (require.main === module) {
  migrate({ fresh: process.argv.includes('--fresh') })
    .then((ran) => console.log(ran.length ? `Applied: ${ran.join(', ')}` : 'Database is up to date'))
    .catch((err) => { console.error(err.message); process.exit(1); });
}
