const config = require('../config');
const { pool } = require('../db');
const { HttpError } = require('../utils/errors');
const entitlements = require('./entitlements');

function getSubscription(user) {
  return {
    tier: user.subscription_tier,
    payment_gateway: false,
    demo_switcher_enabled: config.demoMode && !!user.is_demo,
  };
}

async function setDemoTier(user, tier) {
  if (!config.demoMode || !user.is_demo) {
    throw new HttpError(403, 'DEMO_ONLY', 'The tier switcher is only available for demo accounts in the demo environment');
  }
  if (!Object.keys(entitlements.TIER_RANK).includes(tier)) {
    throw new HttpError(400, 'VALIDATION_ERROR', 'tier must be "free" or "premium"');
  }
  await pool.query('UPDATE users SET subscription_tier = $1 WHERE id = $2', [tier, user.id]);
  const updated = { ...user, subscription_tier: tier };
  return { ...getSubscription(updated), entitlements: entitlements.describe(updated) };
}

module.exports = { getSubscription, setDemoTier };
