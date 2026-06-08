const logger = require('../utils/logger');
const PaymentTransaction = require('../models/PaymentTransaction');
const { verifyWebhookSignature } = require('../services/camerpayPaymentService');
const {
  resolveSubscription,
  syncUserSubscriptionIfExpired,
  buildSubscriptionResponse,
} = require('../utils/subscriptionUtils');
const User = require('../models/User');

const PLAN_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Handle CamerPay webhook callback when payment completes
 * CamerPay calls this endpoint with payment status
 */
exports.handleCamerpayCallback = async (req, res) => {
  try {
    const payload = req.body;
    const signature = req.headers['x-camerpay-signature'] || req.query.signature || '';

    logger.info('CamerPay webhook received', {
      payment_id: payload?.payment_id,
      transaction_uuid: payload?.transaction_uuid,
      status: payload?.status,
      merchant_invoice_id: payload?.merchant_invoice_id,
      signature_present: Boolean(signature),
    });

    // Verify webhook signature
    if (!verifyWebhookSignature(payload, signature)) {
      logger.warn('CamerPay webhook signature verification failed', {
        payment_id: payload?.payment_id,
        signature_provided: Boolean(signature),
      });
      return res.status(401).json({
        success: false,
        message: 'Webhook signature verification failed',
      });
    }

    // Find transaction by provider_reference (payment_id from CamerPay)
    const transaction = await PaymentTransaction.findOne({
      $or: [
        { provider_reference: payload?.payment_id },
        { provider_reference: payload?.transaction_uuid },
        { external_reference: payload?.merchant_invoice_id },
        { external_id: payload?.external_id || payload?.reference },
      ],
      provider: 'camerpay',
    });

    if (!transaction) {
      logger.warn('CamerPay webhook: Transaction not found', {
        payment_id: payload?.payment_id,
        merchant_invoice_id: payload?.merchant_invoice_id,
        external_id: payload?.external_id,
      });
      return res.status(404).json({
        success: false,
        message: 'Transaction not found',
      });
    }

    const paymentStatus = String(payload?.status || '').toLowerCase();
    const isSuccessful = paymentStatus === 'successful' || paymentStatus === 'success' || paymentStatus === 'completed';
    const isFailed = paymentStatus === 'failed' || paymentStatus === 'cancelled';

    if (!isSuccessful && !isFailed) {
      logger.info('CamerPay webhook: Payment still pending or unknown status', {
        transaction_id: transaction._id,
        payment_id: payload?.payment_id,
        status: paymentStatus,
      });
      transaction.provider_response = payload;
      await transaction.save();
      return res.json({
        success: true,
        message: 'Webhook received, payment status is pending',
      });
    }

    if (isFailed) {
      logger.info('CamerPay webhook: Payment failed', {
        transaction_id: transaction._id,
        payment_id: payload?.payment_id,
        status: paymentStatus,
      });
      transaction.status = 'failed';
      transaction.completed_at = new Date();
      transaction.provider_response = payload;
      await transaction.save();
      return res.json({
        success: true,
        message: 'Webhook processed: payment failed',
      });
    }

    // Payment successful
    logger.info('CamerPay webhook: Payment successful', {
      transaction_id: transaction._id,
      payment_id: payload?.payment_id,
      user_cand_id: transaction.user_cand_id,
    });

    transaction.status = 'successful';
    transaction.completed_at = new Date();
    transaction.provider_response = payload;

    // Apply subscription/access based on transaction type
    if (transaction.purpose_type === 'subscription') {
      const nextPlan = transaction.purpose_code === 'plan_pro' ? 'pro' : 'paygo';
      await User.updateOne(
        { cand_id: transaction.user_cand_id },
        {
          $set: {
            subscription: {
              plan: nextPlan,
              status: 'active',
              activated_at: new Date(),
              expires_at: new Date(Date.now() + PLAN_DURATION_MS),
              last_payment_at: new Date(),
              phone_number: transaction.phone_number,
              source_transaction_id: transaction._id,
            },
          },
        }
      );

      logger.info('Subscription activated via webhook', {
        transaction_id: transaction._id,
        user_cand_id: transaction.user_cand_id,
        plan: nextPlan,
      });
    }

    // For material access, grant temporary access
    if (transaction.purpose_type === 'material_access') {
      const PaymentAccessGrant = require('../models/PaymentAccessGrant');
      const expiresAt = new Date(Date.now() + (Number(transaction.metadata?.access_minutes || 60) * 60 * 1000));
      const grantCode = String(transaction.purpose_code || '').trim();
      await PaymentAccessGrant.create({
        user_cand_id: transaction.user_cand_id,
        grant_code: grantCode,
        resource_type: transaction.resource_type,
        resource_id: String(transaction.resource_id),
        transaction_id: transaction._id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: 'active',
        granted_at: new Date(),
        expires_at: expiresAt,
        metadata: {
          description: transaction.description,
        },
      });

      logger.info('Material access granted via webhook', {
        transaction_id: transaction._id,
        user_cand_id: transaction.user_cand_id,
        grant_code: grantCode,
      });
    }

    // Record payment history
    try {
      const History = require('../models/History');
      await History.create({
        user_id: transaction.user_cand_id,
        content_type: 'payment',
        content_title: transaction.description,
        action: transaction.purpose_code,
      });
    } catch (_) {}

    await transaction.save();

    return res.json({
      success: true,
      message: 'Webhook processed: payment successful',
      transaction_id: transaction._id,
    });
  } catch (err) {
    logger.error('CamerPay webhook error', {
      error: err.message,
      stack: err.stack,
      body: req.body,
    });
    return res.status(500).json({
      success: false,
      message: 'Webhook processing failed',
    });
  }
};
