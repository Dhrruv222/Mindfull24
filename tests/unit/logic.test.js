const test = require('node:test');
const assert = require('node:assert/strict');

const { canAccess } = require('../../backend/services/entitlements');
const { computeBalance } = require('../../backend/services/points');
const { computeCooldownUntil, isCoolingDown, pickActivity } = require('../../backend/services/randomizer');
const { effectiveStatus, validateCapacity } = require('../../backend/services/sessions');
const { evaluateEligibility } = require('../../backend/services/rewards');
const { validateEmail, validatePassword, validateName } = require('../../backend/utils/validators');

test('entitlements: free users cannot access premium content', () => {
  assert.equal(canAccess('free', 'free'), true);
  assert.equal(canAccess('free', 'premium'), false);
  assert.equal(canAccess('premium', 'free'), true);
  assert.equal(canAccess('premium', 'premium'), true);
  assert.equal(canAccess('bogus', 'free'), false);
});

test('points: balance is the sum of earn minus spend', () => {
  const entries = [
    { transaction_type: 'earn', amount: 20 },
    { transaction_type: 'earn', amount: 30 },
    { transaction_type: 'spend', amount: 40 },
  ];
  assert.equal(computeBalance(entries), 10);
  assert.equal(computeBalance([]), 0);
});

test('randomizer: cooldown calculation and check', () => {
  const now = new Date('2026-11-03T10:00:00Z');
  const until = computeCooldownUntil(now, 60);
  assert.equal(until.toISOString(), '2026-11-03T11:00:00.000Z');
  assert.equal(isCoolingDown(until, new Date('2026-11-03T10:59:59Z')), true);
  assert.equal(isCoolingDown(until, new Date('2026-11-03T11:00:00Z')), false);
  assert.equal(isCoolingDown(null, now), false);
});

test('randomizer: prefers activities not completed yet', () => {
  assert.equal(pickActivity([1, 2, 3], [1, 2], () => 0), 3);
  assert.equal(pickActivity([1, 2], [1, 2], () => 1), 2);
  assert.equal(pickActivity([], [], () => 0), null);
});

test('sessions: effective status and capacity validation', () => {
  const future = new Date(Date.now() + 86400000);
  const past = new Date(Date.now() - 86400000);
  assert.equal(effectiveStatus({ status: 'open', session_date: future, capacity: 3, member_count: 2 }), 'open');
  assert.equal(effectiveStatus({ status: 'open', session_date: future, capacity: 3, member_count: 3 }), 'full');
  assert.equal(effectiveStatus({ status: 'closed', session_date: future, capacity: 3, member_count: 1 }), 'closed');
  assert.equal(effectiveStatus({ status: 'open', session_date: past, capacity: 3, member_count: 1 }), 'closed');
  assert.throws(() => validateCapacity(1));
  assert.throws(() => validateCapacity('abc'));
  assert.equal(validateCapacity('5'), 5);
});

test('rewards: eligibility rules', () => {
  const reward = { points_cost: 100, availability: 'free', codes_available: 2 };
  assert.deepEqual(evaluateEligibility({ subscription_tier: 'free' }, reward, 100), { eligible: true, reason: null });
  assert.equal(evaluateEligibility({ subscription_tier: 'free' }, reward, 99).reason, 'INSUFFICIENT_POINTS');
  assert.equal(evaluateEligibility({ subscription_tier: 'free' }, { ...reward, availability: 'premium' }, 500).reason, 'PREMIUM_REQUIRED');
  assert.equal(evaluateEligibility({ subscription_tier: 'free' }, { ...reward, codes_available: 0 }, 500).reason, 'OUT_OF_STOCK');
});

test('validators', () => {
  assert.equal(validateEmail('a@b.co'), true);
  assert.equal(validateEmail('nope'), false);
  assert.equal(validatePassword('abc12345'), true);
  assert.equal(validatePassword('short1'), false);
  assert.equal(validatePassword('onlyletters'), false);
  assert.equal(validateName('  '), false);
  assert.equal(validateName('Ann'), true);
});
