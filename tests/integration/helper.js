// Integration tests wipe and reseed their database, so they never use DATABASE_URL (which may be Supabase).
// Point TEST_DATABASE_URL at a throwaway database; the default is saca_test from docker-compose.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://saca:saca_pw@127.0.0.1:5544/saca_test';
delete process.env.DB_SSL;
process.env.AUTH_RATE_LIMIT_MAX = '100000';
process.env.DEMO_MODE = 'true';
process.env.BCRYPT_ROUNDS = '4';
process.env.RANDOMIZER_COOLDOWN_MINUTES = '60';
process.env.RANDOMIZER_PREMIUM_COOLDOWN_MINUTES = '15';

const { createApp } = require('../../backend/app');
const { pool } = require('../../backend/db');
const { migrate } = require('../../backend/migrations/run');
const { seed, DEMO_PASSWORD } = require('../../database/seeders/seed');

let server;
let baseUrl;

async function start() {
  await migrate({ fresh: true });
  await seed({ startOffsetDays: 40 }); // every door open, so tests can use any activity
  await new Promise((resolve) => { server = createApp().listen(0, resolve); });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
}

async function stop() {
  await new Promise((resolve) => server.close(resolve));
  await pool.end();
}

async function api(method, path, { token, body, headers = {} } = {}) {
  const res = await fetch(baseUrl + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null };
}

async function login(key) {
  const res = await api('POST', '/api/login', { body: { email: `${key}@demo.saca.test`, password: DEMO_PASSWORD } });
  if (res.status !== 200) throw new Error(`login failed for ${key}: ${res.status}`);
  return res.body.token;
}

module.exports = { start, stop, api, login, pool, DEMO_PASSWORD };
