/**
 * Payment Configuration
 * Centralized payment amounts for different material types
 * All amounts in XAF (Central African Franc)
 * CamerPay minimum accepted amount: 100 XAF
 */

const PAYMENT_AMOUNTS = {
  // Question Paper Pricing
  QUESTION_PAPER: {
    PREVIEW: 100, // Was 50, updated to meet CamerPay minimum
    DOWNLOAD: 150, // Was 100, updated to meet CamerPay minimum
  },

  // Report Pricing
  REPORT: {
    PREVIEW: 100, // Was 50
    DOWNLOAD: 150, // Was 100
  },

  // Presentation Pricing
  PRESENTATION: {
    PREVIEW: 100, // Was 50
    DOWNLOAD: 150, // Was 100
  },

  // Subscription Pricing
  SUBSCRIPTION: {
    MONTHLY: 2000,
    QUARTERLY: 5000,
    YEARLY: 15000,
  },

  // Tutoring/Booking Pricing (per hour, example)
  TUTORING: {
    PER_HOUR: 5000,
  },
};

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
 * Get payment amount for a material type and access type
 */
function getPaymentAmount(materialType, accessType) {
  const amount = PAYMENT_AMOUNTS[materialType]?.[accessType];
  if (!amount) {
    throw new Error(
      `Payment amount not configured for ${materialType} - ${accessType}`
    );
  }
  return amount;
}

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
  PAYMENT_AMOUNTS,
  MATERIAL_TYPES,
  ACCESS_TYPES,
  MATERIAL_ACCESS_DURATION,
  PAYMENT_STATUS,
  PAYMENT_PROVIDER,
  getPaymentAmount,
  getAccessDurationSeconds,
  isValidPaymentAmount,
};
