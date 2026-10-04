/**
 * Payment Configuration
 * Centralized payment amounts for different material types
 * All amounts in XAF (Central African Franc)
 * CamerPay minimum accepted amount: 100 XAF
 */

/**
 * Material Types
 */
const MATERIAL_TYPES = {
  QUESTION_PAPER: 'questionPaper',
  REPORT: 'report',
  PRESENTATION: 'presentation',
};

/**
 * Access Types
 */
const ACCESS_TYPES = {
  PREVIEW: 'preview',
  DOWNLOAD: 'download',
};

/**
 * Material Access Duration (in hours)
 */
const MATERIAL_ACCESS_DURATION = {
  PREVIEW: 1, // 1 hour for preview
  DOWNLOAD: 1, // 1 hour for download (one-time access)
};

/**
 * Payment Status Enum
 */
const PAYMENT_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
};

/**
 * Payment Provider
 */
const PAYMENT_PROVIDER = {
  CAMPAY: 'campay',
  MOMO: 'momo',
};

/**
 * Get access duration in seconds
 */
function getAccessDurationSeconds(accessType) {
  const hours = MATERIAL_ACCESS_DURATION[accessType] || 1;
  return hours * 60 * 60;
}

/**
 * Validate payment amount
 */
function isValidPaymentAmount(amount) {
  const CAMPAY_MINIMUM = 100;
  return amount >= CAMPAY_MINIMUM;
}

module.exports = {
  MATERIAL_TYPES,
  ACCESS_TYPES,
  MATERIAL_ACCESS_DURATION,
  PAYMENT_STATUS,
  PAYMENT_PROVIDER,
  getAccessDurationSeconds,
  isValidPaymentAmount,
};
