// Generates supabase/schema.sql and supabase/seed.sql for pasting into the Supabase SQL Editor.
const fs = require('fs');
const path = require('path');
const seed = require('./seed');

const root = path.join(__dirname, '..', '..');
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const uid = (email) => `(SELECT id FROM users WHERE email = ${q(email)})`;
const act = (cal, day) => `(SELECT a.id FROM activities a JOIN calendars c ON c.id = a.calendar_id WHERE c.title = ${q(cal)} AND a.day_number = ${day})`;

function schemaSql() {
  const dir = path.join(root, 'backend', 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const drops = ['rate_limits', 'group_session_members', 'group_sessions', 'redemptions', 'promo_codes', 'rewards', 'randomizer_draws',
    'points_ledger', 'activity_completions', 'activities', 'calendars', 'revoked_tokens', 'users', 'schema_migrations'];
  return [
    '-- Advent Calendar (SACA) schema for Supabase. Paste into SQL Editor > New query > Run.',
    '-- WARNING: drops and recreates the app tables below (other tables in your project are not touched).',
    `DROP TABLE IF EXISTS ${drops.join(', ')} CASCADE;`,
    '',
    ...files.map((f) => `-- ===== ${f} =====\n${fs.readFileSync(path.join(dir, f), 'utf8').trim()}\n`),
    "CREATE TABLE schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now());",
    `INSERT INTO schema_migrations (name) VALUES ${files.map((f) => `(${q(f)})`).join(', ')};`,
    '',
  ].join('\n');
}

function seedSql() {
  const out = [
    '-- Demo data for the Advent Calendar (SACA). Run AFTER schema.sql. Demo password for all accounts: ' + seed.DEMO_PASSWORD,
    '-- Re-running this file first clears the app data.',
    'CREATE EXTENSION IF NOT EXISTS pgcrypto;',
    'BEGIN;',
    'TRUNCATE TABLE rate_limits, revoked_tokens, group_session_members, group_sessions, redemptions, promo_codes, rewards, randomizer_draws, points_ledger, activity_completions, activities, calendars, users RESTART IDENTITY CASCADE;',
    '',
  ];
  const balances = {};
  for (const u of seed.USERS) {
    out.push(`INSERT INTO users (name, email, password_hash, subscription_tier, role, is_demo, points_balance) VALUES (${q(u.name)}, ${q(u.email)}, crypt(${q(seed.DEMO_PASSWORD)}, gen_salt('bf', 10)), ${q(u.tier)}, ${q(u.role || 'user')}, TRUE, ${u.points});`);
    balances[u.email] = u.points;
    if (u.points > 0) out.push(`INSERT INTO points_ledger (user_id, transaction_type, amount, balance_after, reference_type, idempotency_key) VALUES (${uid(u.email)}, 'earn', ${u.points}, ${u.points}, 'seed', ${q(`seed:${u.email}`)});`);
  }
  out.push('');
  const calendars = seed.buildCalendars();
  for (const c of calendars) {
    out.push(`INSERT INTO calendars (title, category, description, icon, tier_required, status) VALUES (${[c.title, c.category, c.description, c.icon, c.tier, c.status].map(q).join(', ')});`);
    for (const a of c.activities) {
      out.push(`INSERT INTO activities (calendar_id, title, description, instructions, day_number, points, duration, icon, tier_required, randomizer_eligible) VALUES ((SELECT id FROM calendars WHERE title = ${q(c.title)}), ${[a.title, a.description, a.instructions, a.day, a.points, a.duration, a.icon, a.tier, !!a.randomizer].map(q).join(', ')});`);
    }
  }
  out.push('');
  const mind = calendars[0];
  for (const [key, count] of [['free', 2], ['premium', 3], ['alex', 1]]) {
    const email = seed.USERS.find((u) => u.key === key).email;
    for (let i = 0; i < count; i += 1) {
      const a = mind.activities[i];
      balances[email] += a.points;
      out.push(`INSERT INTO activity_completions (user_id, activity_id, points_awarded) VALUES (${uid(email)}, ${act(mind.title, a.day)}, ${a.points});`);
      out.push(`INSERT INTO points_ledger (user_id, transaction_type, amount, balance_after, reference_type, reference_id, idempotency_key) VALUES (${uid(email)}, 'earn', ${a.points}, ${balances[email]}, 'activity', ${act(mind.title, a.day)}, ${q(`activity:${email}:${a.day}`)});`);
      out.push(`UPDATE users SET points_balance = ${balances[email]} WHERE email = ${q(email)};`);
    }
  }
  out.push('');
  for (const r of seed.REWARDS) {
    out.push(`INSERT INTO rewards (partner_name, reward_title, description, points_cost, availability) VALUES (${[r.partner, r.title, r.description, r.cost, r.tier].map(q).join(', ')});`);
    for (let i = 1; i <= r.codes; i += 1) {
      out.push(`INSERT INTO promo_codes (reward_id, promo_code) VALUES ((SELECT id FROM rewards WHERE reward_title = ${q(r.title)}), ${q(`${r.prefix}-${i}${String(Math.abs(hash(r.title + i))).slice(0, 4)}`)});`);
    }
  }
  out.push('');
  const email = (key) => seed.USERS.find((u) => u.key === key).email;
  const sessions = [
    ['alex', ['Mindfulness & Self-Help', 1], 'Morning Breathing Circle', 'Start the day with the 3-Breath Anchor together.', 2, 8, ['sam']],
    ['sam', ['Fitness Challenge', 2], 'Lunchtime Walk', 'A friendly 10-minute walk around the block.', 3, 4, ['alex', 'free']],
    ['jordan', ['Football Skills Calendar', 9], 'Weekend 5-a-side', 'Small-sided game for Premium members.', 4, 2, ['premium']],
  ];
  for (const [host, [cal, day], title, description, days, capacity, members] of sessions) {
    const all = [host, ...members];
    out.push(`INSERT INTO group_sessions (creator_id, activity_id, title, description, session_date, capacity, status) VALUES (${uid(email(host))}, ${act(cal, day)}, ${q(title)}, ${q(description)}, now() + interval '${days} days', ${capacity}, ${q(all.length >= capacity ? 'full' : 'open')});`);
    for (const m of all) out.push(`INSERT INTO group_session_members (session_id, user_id) VALUES ((SELECT id FROM group_sessions WHERE title = ${q(title)}), ${uid(email(m))});`);
  }
  out.push('', 'COMMIT;', '');
  return out.join('\n');
}

function hash(s) { let h = 7; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; }

fs.mkdirSync(path.join(root, 'supabase'), { recursive: true });
fs.writeFileSync(path.join(root, 'supabase', 'schema.sql'), schemaSql());
fs.writeFileSync(path.join(root, 'supabase', 'seed.sql'), seedSql());
console.log('Wrote supabase/schema.sql and supabase/seed.sql');
