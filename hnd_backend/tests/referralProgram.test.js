const test = require('node:test');
const assert = require('node:assert/strict');
const { registerSchema } = require('../validators/auth/authSchemas');
const { isEligiblePurchase, buildAwardIdempotencyKey, sortEligibleBenefits } = require('../services/referralService');

test('registration accepts a generated referral code and rejects malformed codes', () => {
  const candidate = {
    name: 'Referral Candidate',
    program: 'LECTURER',
    email: 'candidate@example.com',
    phone: '+237600000000',
    password: 'test-password',
    referralCode: '0123ABCDEF',
  };

  assert.equal(registerSchema.validate(candidate).error, undefined);
  assert.ok(registerSchema.validate({ ...candidate, referralCode: 'not-a-code' }).error);
});

test('only positive-amount successful transactions qualify for referral points', () => {
  assert.equal(isEligiblePurchase({ status: 'successful', amount: 2500 }), true);
  assert.equal(isEligiblePurchase({ status: 'pending', amount: 2500 }), false);
  assert.equal(isEligiblePurchase({ status: 'successful', amount: 0 }), false);
  assert.equal(isEligiblePurchase({ status: 'successful', amount: -1 }), false);
});

test('purchase reward idempotency keys do not change when an admin renames a rule', () => {
  const inputs = {
    referredUser: { _id: 'referred-id' },
    transaction: { _id: 'transaction-id', purpose_type: 'subscription' },
    rule: { trigger: 'each_purchase', code: 'old-rule-code' },
    recipient: { _id: 'recipient-id' },
  };

  const initialKey = buildAwardIdempotencyKey(inputs);
  const renamedRuleKey = buildAwardIdempotencyKey({
    ...inputs,
    rule: { ...inputs.rule, code: 'new-rule-code' },
  });
  assert.equal(initialKey, renamedRuleKey);
});

test('registration awards have distinct idempotency keys for the referrer and new candidate', () => {
  const common = {
    referredUser: { _id: 'referred-id' },
    transaction: null,
    rule: { trigger: 'registration', code: 'registration-rule' },
  };
  const referrerKey = buildAwardIdempotencyKey({
    ...common,
    recipient: { _id: 'referrer-id' },
  });
  const referredKey = buildAwardIdempotencyKey({
    ...common,
    recipient: { _id: 'referred-id' },
  });

  assert.equal(referrerKey, 'registration:referred-id:referrer-id');
  assert.equal(referredKey, 'registration:referred-id:referred-id');
  assert.notEqual(referrerKey, referredKey);
});

test('apparel rewards are sequenced by threshold with a stable t-shirt tie-breaker', () => {
  const sorted = sortEligibleBenefits([
    { code: 'gift-t-shirt', apparel_type: 't_shirt', points_required: 500 },
    { code: 'gift-shirt', apparel_type: 'shirt', points_required: 250 },
    { code: 'other', points_required: 100 },
    { code: 'gift-shirt-tie', apparel_type: 'shirt', points_required: 500 },
  ]);

  assert.deepEqual(sorted.map((benefit) => benefit.code), [
    'other',
    'gift-shirt',
    'gift-t-shirt',
    'gift-shirt-tie',
  ]);
});
