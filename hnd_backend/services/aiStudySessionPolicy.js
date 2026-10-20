'use strict';

const MIN_STUDY_QUESTION_COUNT = 5;
const DEFAULT_STUDY_QUESTION_COUNT = 20;

function getStudyQuestionCount(requestedCount, availableCount) {
  const available = Number(availableCount);
  const requested = requestedCount === undefined
    ? Math.min(DEFAULT_STUDY_QUESTION_COUNT, available)
    : Number(requestedCount);

  if (
    !Number.isInteger(available)
    || !Number.isInteger(requested)
    || requested < MIN_STUDY_QUESTION_COUNT
    || requested > available
  ) {
    return null;
  }

  return requested;
}

function canUseFreeStudyTrial({ plan, questionCount, hasAiAccess, freeTrialUsed }) {
  return plan === 'basic'
    && questionCount === MIN_STUDY_QUESTION_COUNT
    && !hasAiAccess
    && !freeTrialUsed;
}

module.exports = {
  MIN_STUDY_QUESTION_COUNT,
  DEFAULT_STUDY_QUESTION_COUNT,
  getStudyQuestionCount,
  canUseFreeStudyTrial,
};
