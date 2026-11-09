const express = require('express');
const config = require('../config');
const { rateLimit } = require('../middleware/rateLimit');
const { authenticate } = require('../middleware/auth');
const asyncHandler = require('../utils/asyncHandler');
const { parseId } = require('../utils/validators');
const { HttpError } = require('../utils/errors');

const auth = require('../services/auth');
const profile = require('../services/profile');
const points = require('../services/points');
const catalog = require('../services/catalog');
const randomizer = require('../services/randomizer');
const timeline = require('../services/timeline');
const project = require('../services/project');
const rewards = require('../services/rewards');
const sessions = require('../services/sessions');
const subscription = require('../services/subscription');
const entitlements = require('../services/entitlements');

const router = express.Router();
// Getters so the limits are read from config on every request.
const authLimiter = rateLimit({
  name: 'auth',
  get windowMs() { return config.authRateLimit.windowMs; },
  get max() { return config.authRateLimit.max; },
});
const h = asyncHandler;

router.get('/health', (_req, res) => res.json({ status: config.missing.length ? 'misconfigured' : 'ok', missing: config.missing }));

router.get('/health/db', async (_req, res) => {
  try {
    const { pool } = require('../db');
    const r = await pool.query('SELECT count(*)::int AS users FROM users');
    res.json({ db: 'ok', users: r.rows[0].users });
  } catch (e) {
    res.status(500).json({ db: 'error', code: e.code || null, hint: String(e.message || '').replace(/postgres(ql)?:\/\/\S+/gi, '[hidden]').slice(0, 120) });
  }
});

// --- Epic 1: accounts & profiles
router.post('/register', authLimiter, h(async (req, res) => res.status(201).json(await auth.register(req.body || {}))));
router.post('/login', authLimiter, h(async (req, res) => res.json(await auth.login(req.body || {}))));
router.post('/logout', authenticate, h(async (req, res) => {
  await auth.logout(req.token);
  res.json({ message: 'Logged out' });
}));
router.get('/profile', authenticate, h(async (req, res) => res.json(await profile.getProfile(req.user))));
router.get('/profile/history', authenticate, h(async (req, res) => res.json(await profile.getHistory(req.user))));
router.get('/profile/points', authenticate, h(async (req, res) => res.json(await profile.getPoints(req.user))));

// --- Timeline and project hub
router.get('/timeline', authenticate, h(async (req, res) => res.json(await timeline.getTimeline(req.user, req.query))));
router.get('/project/backlog', authenticate, (_req, res) => res.json(project.getBacklog()));

// --- Epic 2: calendars & activities
router.get('/calendars', authenticate, h(async (req, res) => res.json(await catalog.listCalendars(req.user))));
router.get('/calendars/:id', authenticate, h(async (req, res) => res.json(await catalog.getCalendar(parseId(req.params.id), req.user))));
router.post('/calendars/:id/join', authenticate, h(async (req, res) => res.json(await catalog.activateCalendar(req.user, parseId(req.params.id)))));
router.get('/calendars/:id/activities', authenticate, h(async (req, res) => res.json(await catalog.listActivities(parseId(req.params.id), req.user))));
router.get('/activities/:id', authenticate, h(async (req, res) => res.json(await catalog.getActivity(parseId(req.params.id), req.user))));

// --- Epic 3: randomizer
router.get('/randomizer/status', authenticate, h(async (req, res) => res.json(await randomizer.status(req.user))));
router.post('/randomizer/draw', authenticate, h(async (req, res) => res.status(201).json(await randomizer.draw(req.user, req.body || {}))));

// --- Epic 4: points
router.post('/activities/:id/open', authenticate, h(async (req, res) => res.json(await catalog.openActivity(req.user, parseId(req.params.id)))));
router.post('/activities/:id/complete', authenticate, h(async (req, res) => res.status(201).json(await catalog.completeActivity(req.user, parseId(req.params.id)))));
router.get('/points/balance', authenticate, h(async (req, res) => res.json(await points.getBalance(req.user.id))));
router.get('/points/history', authenticate, h(async (req, res) => {
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 50, 1), 200);
  const offset = Math.max(Number.parseInt(req.query.offset, 10) || 0, 0);
  res.json(await points.getHistory(req.user.id, { limit, offset }));
}));

// --- Epic 5: rewards (static path before :id)
router.get('/rewards', authenticate, h(async (req, res) => res.json(await rewards.list(req.user))));
router.get('/rewards/redemptions', authenticate, h(async (req, res) => res.json(await rewards.listRedemptions(req.user))));
router.get('/rewards/:id', authenticate, h(async (req, res) => res.json(await rewards.get(parseId(req.params.id), req.user))));
router.post('/rewards/:id/redeem', authenticate, h(async (req, res) => {
  const key = req.get('Idempotency-Key');
  if (key !== undefined && !/^[A-Za-z0-9_-]{1,64}$/.test(key)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'Idempotency-Key must be 1-64 letters, digits, "-" or "_"');
  }
  res.status(201).json(await rewards.redeem(req.user, parseId(req.params.id), key));
}));

// --- Epic 6: social sessions (static paths before :id)
router.get('/sessions', authenticate, h(async (req, res) => res.json(await sessions.list(req.user))));
router.post('/sessions', authenticate, h(async (req, res) => res.status(201).json(await sessions.create(req.user, req.body || {}))));
router.get('/sessions/my-sessions', authenticate, h(async (req, res) => res.json(await sessions.listMine(req.user))));
router.get('/sessions/:id', authenticate, h(async (req, res) => res.json(await sessions.get(parseId(req.params.id), req.user))));
router.post('/sessions/:id/join', authenticate, h(async (req, res) => res.json(await sessions.join(req.user, parseId(req.params.id)))));
router.post('/sessions/:id/close', authenticate, h(async (req, res) => res.json(await sessions.close(req.user, parseId(req.params.id)))));

// --- Epic 7: subscription & demo tier switcher
router.get('/subscription', authenticate, (req, res) => res.json(subscription.getSubscription(req.user)));
router.get('/subscription/entitlements', authenticate, (req, res) => res.json(entitlements.describe(req.user)));
router.post('/demo/tier', authenticate, h(async (req, res) => res.json(await subscription.setDemoTier(req.user, (req.body || {}).tier))));

module.exports = router;
