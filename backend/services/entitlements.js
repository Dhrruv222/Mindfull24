const config = require('../config');
const { HttpError } = require('../utils/errors');

const TIER_RANK = { free: 0, premium: 1 };

// Central access rule used by every calendar, activity, reward and session check.
function canAccess(userTier, requiredTier) {
  return (TIER_RANK[userTier] ?? -1) >= (TIER_RANK[requiredTier] ?? Infinity);
}

function assertAccess(user, requiredTier, what = 'This content') {
  if (!canAccess(user.subscription_tier, requiredTier)) {
    throw new HttpError(403, 'PREMIUM_REQUIRED', `${what} requires a Premium subscription`, { required_tier: requiredTier });
  }
}

function randomizerCooldownMinutes(tier) {
  return tier === 'premium' ? config.randomizer.premiumCooldownMinutes : config.randomizer.freeCooldownMinutes;
}

function describe(user) {
  const premium = user.subscription_tier === 'premium';
  return {
    tier: user.subscription_tier,
    features: {
      free_calendars: true,
      premium_calendars: premium,
      premium_activities: premium,
      premium_rewards: premium,
      randomizer: true,
      randomizer_full_pool: premium,
      randomizer_cooldown_minutes: randomizerCooldownMinutes(user.subscription_tier),
      group_sessions: true,
    },
  };
}

module.exports = { TIER_RANK, canAccess, assertAccess, randomizerCooldownMinutes, describe };
