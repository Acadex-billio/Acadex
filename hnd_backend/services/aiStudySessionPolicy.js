'use strict';

const MIN_STUDY_QUESTION_COUNT = 5;
const DEFAULT_STUDY_QUESTION_COUNT = MIN_STUDY_QUESTION_COUNT;

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
  return ['basic', 'paygo'].includes(plan)
    && questionCount === MIN_STUDY_QUESTION_COUNT
    && !hasAiAccess
    && !freeTrialUsed;
}

function selectStudyQuestionIds(questionIds, questionCount) {
  return Array.isArray(questionIds) ? questionIds.slice(0, questionCount) : [];
}

function hasUsedPaperTrial(trialMaterialIds, materialId) {
  return Array.isArray(trialMaterialIds)
    && trialMaterialIds.some((id) => String(id) === String(materialId));
}

module.exports = {
  MIN_STUDY_QUESTION_COUNT,
  DEFAULT_STUDY_QUESTION_COUNT,
  getStudyQuestionCount,
  canUseFreeStudyTrial,
  selectStudyQuestionIds,
  hasUsedPaperTrial,
};
