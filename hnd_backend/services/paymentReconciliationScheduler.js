const PaymentTransaction = require('../models/PaymentTransaction');
const History = require('../models/History');
const logger = require('../utils/logger');
const { isEnabled } = require('./featureFlagService');

let timer = null;
let running = false;

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const runPaymentReconciliation = async () => {
  if (running) return;
  running = true;
  try {
    const now = new Date();
    const stalePendingFilter = {
      status: 'pending',
      expires_at: { $ne: null, $lte: now },
    };

    const stalePendingCount = await PaymentTransaction.countDocuments(stalePendingFilter);
    if (!stalePendingCount) return;

    const result = await PaymentTransaction.updateMany(
      stalePendingFilter,
      {
        $set: {
          status: 'expired',
          completed_at: now,
        },
      }
    );

    const expiredCount = result?.modifiedCount || 0;
    logger.info('payment.reconciliation.expired_pending', {
      stale_pending_found: stalePendingCount,
      matched_count: result?.matchedCount || 0,
      modified_count: expiredCount,
    });

    if (expiredCount > 0) {
      await History.create({
        user_id: 'system',
        user_name: 'System Reconciliation',
        content_type: 'payment_reconciliation',
        content_title: `Expired ${expiredCount} stale pending payment transaction(s)`,
        action: 'expired_pending',
      });
    }
  } catch (err) {
    logger.error('payment.reconciliation.error', {
      message: err?.message || err,
      stack: err?.stack,
    });
  } finally {
    running = false;
  }
};

const getReconciliationSummary = async () => {
  const now = new Date();
  const stalePendingFilter = {
    status: 'pending',
    expires_at: { $ne: null, $lte: now },
  };

  const [stalePendingCount, totalPendingCount] = await Promise.all([
    PaymentTransaction.countDocuments(stalePendingFilter),
    PaymentTransaction.countDocuments({ status: 'pending' }),
  ]);

  return {
    enabled: isEnabled('FEATURE_PAYMENT_RECONCILIATION_ENABLED', false),
    interval_ms: parsePositiveInt(process.env.PAYMENT_RECONCILIATION_INTERVAL_MS, 120000),
    stale_pending_count: stalePendingCount,
    total_pending_count: totalPendingCount,
    as_of: now.toISOString(),
  };
};

const startPaymentReconciliationScheduler = () => {
  if (!isEnabled('FEATURE_PAYMENT_RECONCILIATION_ENABLED', false)) {
    logger.info('payment.reconciliation.disabled');
    return;
  }

  if (timer) return;

  const intervalMs = parsePositiveInt(process.env.PAYMENT_RECONCILIATION_INTERVAL_MS, 120000);
  logger.info('payment.reconciliation.started', { intervalMs });

  timer = setInterval(() => {
    runPaymentReconciliation();
  }, intervalMs);

  runPaymentReconciliation();
};

module.exports = {
  startPaymentReconciliationScheduler,
  runPaymentReconciliation,
  getReconciliationSummary,
};
