'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getStudyQuestionCount,
  canUseFreeStudyTrial,
  hasUsedPaperTrial,
  selectStudyQuestionIds,
} = require('../services/aiStudySessionPolicy');

test('study sessions default to the five free questions for older clients', () => {
  assert.equal(getStudyQuestionCount(undefined, 30), 5);
  assert.equal(getStudyQuestionCount(undefined, 5), 5);
});

test('study sessions accept only whole-number counts between 5 and the available question count', () => {
  assert.equal(getStudyQuestionCount(5, 5), 5);
  assert.equal(getStudyQuestionCount('10', 25), 10);
  assert.equal(getStudyQuestionCount(4, 25), null);
  assert.equal(getStudyQuestionCount(26, 25), null);
  assert.equal(getStudyQuestionCount(5.5, 25), null);
  assert.equal(getStudyQuestionCount(5, 4), null);
});

test('Basic and PAYGO candidates without access can use an unused five-question paper trial', () => {
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
  assert.equal(canUseFreeStudyTrial({ ...eligible, plan: 'paygo' }), true);
});

test('free question access is tracked separately for each paper', () => {
  assert.equal(hasUsedPaperTrial(['paper-a', 'paper-b'], 'paper-a'), true);
  assert.equal(hasUsedPaperTrial(['paper-a', 'paper-b'], 'paper-c'), false);
  assert.equal(hasUsedPaperTrial([], 'paper-a'), false);
});

test('paper sessions select the requested count from the fixed first questions', () => {
  assert.deepEqual(
    selectStudyQuestionIds(['q1', 'q2', 'q3', 'q4', 'q5', 'q6'], 5),
    ['q1', 'q2', 'q3', 'q4', 'q5']
  );
  assert.deepEqual(
    selectStudyQuestionIds(['q1', 'q2', 'q3', 'q4', 'q5', 'q6'], 6),
    ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']
  );
});
