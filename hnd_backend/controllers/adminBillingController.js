const logger = require('../utils/logger');
const PaymentTransaction = require('../models/PaymentTransaction');
const User = require('../models/User');

const { refreshCampayPaymentStatus } = require('../services/paymentOrchestrationService');
const { runPaymentReconciliation, getReconciliationSummary } = require('../services/paymentReconciliationScheduler');

const PaymentAccessGrant = require('../models/PaymentAccessGrant');
const paymentGrantService = require('../services/paymentGrantService');

const PLAN_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

exports.repairTransaction = async (req, res) => {
  try {
    const transactionId = String(req.params.transactionId || '').trim();
    const providerTransactionId = String(req.body?.provider_transaction_id || req.body?.provider_reference || '').trim();

    if (!transactionId) return res.status(400).json({ success: false, message: 'transactionId is required' });
    if (!providerTransactionId) return res.status(400).json({ success: false, message: 'provider_transaction_id is required' });

    const transaction = await PaymentTransaction.findById(transactionId);
    if (!transaction) return res.status(404).json({ success: false, message: 'Transaction not found' });

    // Update provider reference and attempt refresh
    transaction.provider_reference = providerTransactionId;
    await transaction.save();

    const refreshed = await refreshCampayPaymentStatus(transaction, paymentGrantService.applySuccessfulPayment);

    // If successful, apply centralized payment side-effects
    if (refreshed.status === 'successful') {
      await paymentGrantService.applySuccessfulPayment(refreshed);
    }

    return res.json({ success: true, message: 'Repair attempted', transaction: refreshed });
  } catch (err) {
    logger.error('Admin repair transaction failed', { error: err.message, stack: err.stack });
    return res.status(1000).json({ success: false, message: 'Repair attempt failed' });
  }
};

exports.getReconciliationStatus = async (req, res) => {
  try {
    const summary = await getReconciliationSummary();
    return res.json({ success: true, reconciliation: summary });
  } catch (err) {
    logger.error('Admin reconciliation status failed', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Unable to retrieve reconciliation status' });
  }
};

exports.runReconciliationNow = async (req, res) => {
  try {
    const summary = await getReconciliationSummary();
    if (!summary.enabled) {
      return res.status(403).json({ success: false, message: 'Payment reconciliation is disabled.' });
    }

    await runPaymentReconciliation();
    const afterSummary = await getReconciliationSummary();
    return res.json({ success: true, message: 'Reconciliation run completed', reconciliation: afterSummary });
  } catch (err) {
    logger.error('Admin reconciliation run failed', { error: err.message, stack: err.stack });
    return res.status(500).json({ success: false, message: 'Reconciliation run failed' });
  }
};
