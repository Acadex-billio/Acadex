'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getStudyQuestionCount,
  canUseFreeStudyTrial,
} = require('../services/aiStudySessionPolicy');

test('study sessions default to at most 20 available questions for older clients', () => {
  assert.equal(getStudyQuestionCount(undefined, 30), 20);
  assert.equal(getStudyQuestionCount(undefined, 12), 12);
});

test('study sessions accept only whole-number counts between 5 and the available question count', () => {
  assert.equal(getStudyQuestionCount(5, 5), 5);
  assert.equal(getStudyQuestionCount('10', 25), 10);
  assert.equal(getStudyQuestionCount(4, 25), null);
  assert.equal(getStudyQuestionCount(26, 25), null);
  assert.equal(getStudyQuestionCount(5.5, 25), null);
  assert.equal(getStudyQuestionCount(5, 4), null);
});

test('only a Basic candidate without access can use an unused five-question trial', () => {
  const eligible = {
    plan: 'basic',
    questionCount: 5,
    hasAiAccess: false,
    freeTrialUsed: false,
  };

  assert.equal(canUseFreeStudyTrial(eligible), true);
  assert.equal(canUseFreeStudyTrial({ ...eligible, questionCount: 10 }), false);
  assert.equal(canUseFreeStudyTrial({ ...eligible, freeTrialUsed: true }), false);
  assert.equal(canUseFreeStudyTrial({ ...eligible, hasAiAccess: true }), false);
  assert.equal(canUseFreeStudyTrial({ ...eligible, plan: 'pro' }), false);
});
