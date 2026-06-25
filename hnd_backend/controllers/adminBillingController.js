const logger = require('../utils/logger');
const PaymentTransaction = require('../models/PaymentTransaction');
const User = require('../models/User');

const { refreshCampayPaymentStatus } = require('../services/paymentOrchestrationService');
const { runPaymentReconciliation, getReconciliationSummary } = require('../services/paymentReconciliationScheduler');

const PaymentAccessGrant = require('../models/PaymentAccessGrant');

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

    const refreshed = await refreshCampayPaymentStatus(transaction);

    // If successful, apply subscription or material access side-effects
    if (refreshed.status === 'successful') {
      refreshed.completed_at = refreshed.completed_at || new Date();

      if (refreshed.purpose_type === 'subscription') {
        const nextPlan = refreshed.purpose_code === 'plan_pro' ? 'pro' : 'paygo';
        await User.updateOne(
          { cand_id: refreshed.user_cand_id },
          {
            $set: {
              subscription: {
                plan: nextPlan,
                status: 'active',
                activated_at: new Date(),
                expires_at: new Date(Date.now() + PLAN_DURATION_MS),
                last_payment_at: new Date(),
                phone_number: refreshed.phone_number,
                source_transaction_id: refreshed._id,
              },
            },
          }
        );
      }

      if (refreshed.purpose_type === 'material_access') {
        const expiresAt = new Date(Date.now() + (Number(refreshed.metadata?.access_minutes || 60) * 60 * 1000));
        const grantCode = String(refreshed.purpose_code || '').trim();
        await PaymentAccessGrant.create({
          user_cand_id: refreshed.user_cand_id,
          grant_code: grantCode,
          resource_type: refreshed.resource_type,
          resource_id: String(refreshed.resource_id),
          transaction_id: refreshed._id,
          amount: refreshed.amount,
          currency: refreshed.currency,
          status: 'active',
          granted_at: new Date(),
          expires_at: expiresAt,
          metadata: { description: refreshed.description },
        });
      }

      try {
        const History = require('../models/History');
        await History.create({
          user_id: refreshed.user_cand_id,
          content_type: 'payment',
          content_title: refreshed.description,
          action: refreshed.purpose_code,
        });
      } catch (_) {}

      await refreshed.save();
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
