// Resets and fills the database with demo data (calendars, accounts, rewards, sessions).
const bcrypt = require('bcryptjs');
const config = require('../../backend/config');
const { pool } = require('../../backend/db');
const hiking = require('./data/hiking');
const football = require('./data/football');
const fitness = require('./data/fitness');

const DEMO_PASSWORD = 'Demo1234!';
const DAY = 24 * 60 * 60 * 1000;
const DEMO_START_OFFSET = 11;

const TABLES = [
  'revoked_tokens', 'group_session_members', 'group_sessions', 'redemptions', 'promo_codes', 'rewards',
  'randomizer_draws', 'activity_opens', 'user_calendars', 'points_ledger', 'activity_completions', 'activities', 'calendars', 'users',
];

const USERS = [
  { key: 'free', name: 'Free Demo', email: 'free@demo.saca.test', tier: 'free', points: 120 },
  { key: 'premium', name: 'Premium Demo', email: 'premium@demo.saca.test', tier: 'premium', points: 450 },
  { key: 'alex', name: 'Alex Rivera', email: 'alex@demo.saca.test', tier: 'free', points: 260 },
  { key: 'sam', name: 'Sam Chen', email: 'sam@demo.saca.test', tier: 'free', points: 40 },
  { key: 'jordan', name: 'Jordan Blake', email: 'jordan@demo.saca.test', tier: 'premium', points: 900 },
  { key: 'admin', name: 'Admin', email: 'admin@demo.saca.test', tier: 'premium', points: 0, role: 'admin' },
];

const REWARDS = [
  { partner: 'Bean & Leaf Cafe', title: 'Free Coffee', icon: 'ph-coffee', cost: 50, tier: 'free', description: 'One free regular coffee at any Bean & Leaf Cafe.', prefix: 'COFFEE', codes: 4 },
  { partner: 'FitFuel Store', title: '10% Off Sports Nutrition', icon: 'ph-barbell', cost: 100, tier: 'free', description: '10% off your next order of protein and snacks.', prefix: 'FUEL10', codes: 4 },
  { partner: 'Calm Corner Books', title: 'Free eBook', icon: 'ph-book-open-text', cost: 150, tier: 'free', description: 'Choose any wellbeing eBook for free.', prefix: 'BOOK', codes: 3 },
  { partner: 'Kick-Off Sports', title: '15% Off Football Gear', icon: 'ph-soccer-ball', cost: 250, tier: 'free', description: '15% off boots, balls and training kit.', prefix: 'KICK15', codes: 3 },
  { partner: 'Zen Studio', title: 'Free Yoga Class', icon: 'ph-flower-lotus', cost: 400, tier: 'premium', description: 'A free drop-in yoga class. Premium members only.', prefix: 'YOGA', codes: 3 },
  { partner: 'ProStadium Tickets', title: 'Match Day Experience', icon: 'ph-ticket', cost: 1500, tier: 'premium', description: 'Two tickets and a stadium tour. Premium members only.', prefix: 'STADIUM', codes: 2 },
];

function buildCalendars() {
  const hike = {
    title: 'Hiking Adventures', category: 'Hiking', icon: 'ph-mountains', tier: 'free', status: 'active',
    description: 'Twenty-four outdoor mini-adventures: discover local trails, viewpoints, forests and hidden green spaces at your own pace.',
    activities: hiking.map(([title, duration, icon, description, instructions, tier], i) => ({
      day: i + 1, title, description, instructions, duration, icon,
      points: (i + 1) % 6 === 0 ? 30 : 20, tier, randomizer: i % 2 === 0,
    })),
  };
  const fit = {
    title: 'Fitness Challenge', category: 'Fitness', icon: 'ph-barbell', tier: 'free', status: 'active',
    description: 'Exercises and movement challenges for every level. Advanced sessions are Premium.',
    activities: fitness.map(([title, duration, icon, description, instructions, tier], i) => ({
      day: i + 1, title, duration, icon, description, instructions, points: tier === 'premium' ? 40 : 20, tier, randomizer: tier === 'free' && i % 2 === 0,
    })),
  };
  const ball = {
    title: 'Football Skills Calendar', category: 'Football', icon: 'ph-soccer-ball', tier: 'premium', status: 'active',
    description: 'Drills, tactics and match-day practice to sharpen your football. Premium calendar.',
    activities: football.map(([title, duration, icon, description, instructions], i) => ({
      day: i + 1, title, duration, icon, description, instructions, points: 30, tier: 'premium', randomizer: false,
    })),
  };
  const soon = {
    title: 'Nutrition & Cooking', category: 'Nutrition', icon: 'ph-bowl-food', tier: 'free', status: 'coming_soon',
    description: 'Simple healthy recipes and habits. Coming soon.', activities: [],
  };
  return [hike, fit, ball, soon];
}

async function insertLedger(db, userId, type, amount, balanceAfter, refType, refId, key) {
  await db.query(
    `INSERT INTO points_ledger (user_id, transaction_type, amount, balance_after, reference_type, reference_id, idempotency_key)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [userId, type, amount, balanceAfter, refType, refId, key],
  );
}

// startOffsetDays: how many days ago the calendars opened (door N unlocks on day N).
async function seed({ startOffsetDays = DEMO_START_OFFSET } = {}) {
  const db = await pool.connect();
  try {
    await db.query('BEGIN');
    await db.query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);

    const hash = await bcrypt.hash(DEMO_PASSWORD, config.bcryptRounds);
    const users = {};
    for (const u of USERS) {
      const { rows: [r] } = await db.query(
        'INSERT INTO users (name, email, password_hash, subscription_tier, role, is_demo, points_balance) VALUES ($1, $2, $3, $4, $5, TRUE, $6) RETURNING id',
        [u.name, u.email, hash, u.tier, u.role || 'user', u.points],
      );
      users[u.key] = r.id;
      if (u.points > 0) await insertLedger(db, r.id, 'earn', u.points, u.points, 'seed', null, `seed:${r.id}`);
    }

    const activityIds = { hiking: [], fitness: [], football: [] };
    const keys = ['hiking', 'fitness', 'football', null];
    for (const [ci, c] of buildCalendars().entries()) {
      const { rows: [cal] } = await db.query(
        'INSERT INTO calendars (title, category, description, icon, tier_required, status, start_date) VALUES ($1, $2, $3, $4, $5, $6, CURRENT_DATE - $7::int) RETURNING id',
        [c.title, c.category, c.description, c.icon, c.tier, c.status, startOffsetDays],
      );
      for (const a of c.activities) {
        const { rows: [act] } = await db.query(
          `INSERT INTO activities (calendar_id, title, description, instructions, day_number, points, duration, icon, tier_required, randomizer_eligible)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [cal.id, a.title, a.description, a.instructions, a.day, a.points, a.duration, a.icon, a.tier, a.randomizer],
        );
        activityIds[keys[ci]].push(act.id);
      }
    }

    // A little history so profiles and ledgers are not empty (ledger balances stay consistent).
    for (const [who, count] of [['free', 2], ['premium', 3], ['alex', 1]]) {
      for (let i = 0; i < count; i += 1) {
        const activityId = activityIds.hiking[i];
        const { rows: [act] } = await db.query('SELECT points FROM activities WHERE id = $1', [activityId]);
        await db.query('INSERT INTO activity_completions (user_id, activity_id, points_awarded) VALUES ($1, $2, $3)', [users[who], activityId, act.points]);
        await db.query('INSERT INTO activity_opens (user_id, activity_id) VALUES ($1, $2)', [users[who], activityId]);
        await db.query('INSERT INTO user_calendars (user_id, calendar_id) SELECT $1, calendar_id FROM activities WHERE id = $2 ON CONFLICT DO NOTHING', [users[who], activityId]);
        const { rows: [u] } = await db.query('UPDATE users SET points_balance = points_balance + $1 WHERE id = $2 RETURNING points_balance', [act.points, users[who]]);
        await insertLedger(db, users[who], 'earn', act.points, u.points_balance, 'activity', activityId, `activity:${users[who]}:${activityId}`);
      }
    }

    for (const r of REWARDS) {
      const { rows: [reward] } = await db.query(
        'INSERT INTO rewards (partner_name, reward_title, description, points_cost, availability, icon) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
        [r.partner, r.title, r.description, r.cost, r.tier, r.icon],
      );
      for (let i = 1; i <= r.codes; i += 1) {
        await db.query('INSERT INTO promo_codes (reward_id, promo_code) VALUES ($1, $2)', [reward.id, `${r.prefix}-${reward.id * 1000 + i}`]);
      }
    }

    const now = Date.now();
    const sessions = [
      { host: 'alex', activity: activityIds.hiking[0], title: 'Weekend Trail Explorers', description: 'An easy local loop with a scenic stop and plenty of time to enjoy the outdoors.', date: now + 2 * DAY, capacity: 8, members: ['sam'] },
      { host: 'sam', activity: activityIds.fitness[1], title: 'Lunchtime Walk', description: 'A friendly 10-minute walk around the block.', date: now + 3 * DAY, capacity: 4, members: ['alex', 'free'] },
      { host: 'jordan', activity: activityIds.football[8], title: 'Weekend 5-a-side', description: 'Small-sided game for Premium members.', date: now + 4 * DAY, capacity: 2, members: ['premium'] },
    ];
    for (const s of sessions) {
      const members = [s.host, ...s.members];
      const { rows: [session] } = await db.query(
        'INSERT INTO group_sessions (creator_id, activity_id, title, description, session_date, capacity, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
        [users[s.host], s.activity, s.title, s.description, new Date(s.date), s.capacity, members.length >= s.capacity ? 'full' : 'open'],
      );
      for (const m of members) await db.query('INSERT INTO group_session_members (session_id, user_id) VALUES ($1, $2)', [session.id, users[m]]);
    }
    await db.query('COMMIT');
    return { users, demoPassword: DEMO_PASSWORD };
  } catch (err) {
    await db.query('ROLLBACK');
    throw err;
  } finally {
    db.release();
  }
}
module.exports = { seed, DEMO_PASSWORD, DEMO_START_OFFSET, USERS, REWARDS, buildCalendars };

if (require.main === module) {
  seed()
    .then(() => {
      console.log('Seeded demo data. Demo accounts (password: %s):', DEMO_PASSWORD);
      for (const u of USERS) console.log(`  ${u.email}  [${u.tier}]`);
    })
    .catch((err) => { console.error(err); process.exitCode = 1; })
    .finally(() => pool.end());
}
