const logger = require('../utils/logger');
const PaymentTransaction = require('../models/PaymentTransaction');
const { sendEmail } = require('../services/emailService');
const { verifyWebhookSignature } = require('../services/camerpayPaymentService');
const {
  resolveSubscription,
  syncUserSubscriptionIfExpired,
  buildSubscriptionResponse,
} = require('../utils/subscriptionUtils');
const User = require('../models/User');
const PaymentAccessGrant = require('../models/PaymentAccessGrant');
const History = require('../models/History');
const paymentGrantService = require('../services/paymentGrantService');
const {
  normalizeWebhookPaymentStatus,
  validateTransactionReference,
  validateAccessMinutes,
} = require('../services/paymentValidationService');

const PLAN_DURATION_MS = 90 * 24 * 60 * 60 * 1000;

/**
 * Handle CamerPay webhook callback when payment completes
 * CamerPay calls this endpoint with payment status
 */
exports.handleCamerpayCallback = async (req, res) => {
  try {
    const payload = req.body;
    const rawBody = req.rawBody;
    const signature = req.headers['x-camerpay-signature'] || req.query.signature || '';
    const respond = res && typeof res.status === 'function' && typeof res.json === 'function';

    logger.info('CamerPay webhook received', {
      payment_id: payload?.payment_id,
      transaction_uuid: payload?.transaction_uuid,
      status: payload?.status,
      merchant_invoice_id: payload?.merchant_invoice_id,
      signature_present: Boolean(signature),
    });

    // Verify webhook signature
    if (!verifyWebhookSignature(payload, signature, rawBody, rawBody)) {
      logger.warn('CamerPay webhook signature verification failed', {
        payment_id: payload?.payment_id,
        signature_provided: Boolean(signature),
      });
      if (respond) {
        return res.status(401).json({
          success: false,
          message: 'Webhook signature verification failed',
        });
      }
      return;
    }

    validateTransactionReference(
      payload?.payment_id || payload?.transaction_uuid || payload?.merchant_invoice_id || payload?.reference,
      'provider transaction reference'
    );

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
      if (respond) {
        return res.status(404).json({
          success: false,
          message: 'Transaction not found',
        });
      }
      return;
    }

    const paymentStatus = normalizeWebhookPaymentStatus(payload?.status || '');
    const isSuccessful = paymentStatus === 'successful';
    const isFailed = paymentStatus === 'failed';

    if (!isSuccessful && !isFailed) {
      logger.info('CamerPay webhook: Payment still pending or unknown status', {
        transaction_id: transaction._id,
        payment_id: payload?.payment_id,
        status: paymentStatus,
      });
      transaction.provider_response = payload;
      await transaction.save();
      if (respond) {
        return res.json({
          success: true,
          message: 'Webhook received, payment status is pending',
        });
      }
      return;
    }

    if (isFailed) {
      if (transaction.status === 'successful') {
        logger.warn('CamerPay webhook: Ignoring failure notification after successful transaction', {
          transaction_id: transaction._id,
          payment_id: payload?.payment_id,
          current_status: transaction.status,
          webhook_status: paymentStatus,
        });
        if (respond) {
          return res.json({
            success: true,
            message: 'Webhook ignored: transaction already successful',
          });
        }
        return;
      }

      if (transaction.status !== 'pending') {
        logger.info('CamerPay webhook: Failure notification received for non-pending transaction', {
          transaction_id: transaction._id,
          payment_id: payload?.payment_id,
          current_status: transaction.status,
          webhook_status: paymentStatus,
        });
        transaction.provider_response = payload;
        await transaction.save();
        if (respond) {
          return res.json({
            success: true,
            message: 'Webhook received; transaction is already settled',
          });
        }
        return;
      }

      logger.info('CamerPay webhook: Payment failed', {
        transaction_id: transaction._id,
        payment_id: payload?.payment_id,
        status: paymentStatus,
      });
      transaction.status = 'failed';
      transaction.completed_at = new Date();
      transaction.provider_response = payload;
      await transaction.save();
      if (respond) {
        return res.json({
          success: true,
          message: 'Webhook processed: payment failed',
        });
      }
      return;
    }

    // Payment successful
    logger.info('CamerPay webhook: Payment successful', {
      transaction_id: transaction._id,
      payment_id: payload?.payment_id,
      user_cand_id: transaction.user_cand_id,
      resource_type: transaction.resource_type,
      resource_id: transaction.resource_id,
      access_minutes: Number(transaction.metadata?.access_minutes || 0) || null,
    });

    if (transaction.status === 'successful') {
      if (!transaction.completed_at) {
        transaction.completed_at = new Date();
      }
      transaction.provider_response = payload;
      await transaction.save();
      if (respond) {
        return res.json({
          success: true,
          message: 'Webhook already processed',
          transaction_id: transaction._id,
        });
      }
      return;
    }

    if (['failed', 'cancelled', 'expired'].includes(String(transaction.status || '').toLowerCase())) {
      logger.warn('CamerPay webhook: Successful notification received for a terminal non-successful transaction', {
        transaction_id: transaction._id,
        payment_id: payload?.payment_id,
        current_status: transaction.status,
        webhook_status: paymentStatus,
      });
      transaction.provider_response = payload;
      await transaction.save();
      if (respond) {
        return res.json({
          success: true,
          message: 'Webhook received; transaction has already reached a terminal state',
        });
      }
      return;
    }

    const receiptUser = transaction.user_cand_id
      ? await User.findOne({ cand_id: transaction.user_cand_id }).select('email name allow_emails').lean()
      : null;

    const finalizedTransaction = await PaymentTransaction.findOneAndUpdate(
      {
        _id: transaction._id,
        status: { $ne: 'successful' },
      },
      {
        $set: {
          status: 'successful',
          completed_at: new Date(),
          provider_response: payload,
        },
      },
      { new: true }
    );

    if (!finalizedTransaction) {
      if (respond) {
        return res.json({
          success: true,
          message: 'Webhook already processed',
          transaction_id: transaction._id,
        });
      }
      return;
    }

    // Centralize subscription/material access side-effects
    await paymentGrantService.applySuccessfulPayment(finalizedTransaction);

    if (receiptUser?.email && receiptUser.allow_emails !== false) {
      const planLabel = finalizedTransaction.purpose_type === 'subscription'
        ? String(finalizedTransaction.purpose_code || '').replace(/^plan_/, '').replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()) + ' subscription'
        : finalizedTransaction.purpose_type.replace(/_/g, ' ');
      const emailSubject = `Acadex payment receipt — ${finalizedTransaction.description}`;
      const emailText = [
        `Hello ${receiptUser.name || 'Acadex learner'},`,
        '',
        'Your payment was successful.',
        `Transaction: ${finalizedTransaction._id}`,
        `Description: ${finalizedTransaction.description}`,
        `Type: ${planLabel}`,
        `Amount: ${finalizedTransaction.amount} ${finalizedTransaction.currency}`,
        `Status: Successful`,
        `Date: ${new Date(finalizedTransaction.completed_at).toLocaleString()}`,
        '',
        'Thank you for choosing Acadex. Your access has been updated and is available immediately.',
      ].join('\n');

      try {
        await sendEmail({
          to: receiptUser.email,
          subject: emailSubject,
          text: emailText,
        });
      } catch (emailErr) {
        logger.error('Failed to send payment receipt email', {
          error: emailErr?.message || emailErr,
          email: receiptUser.email,
          transaction_id: finalizedTransaction._id,
        });
      }
    }

    if (respond) {
      return res.json({
        success: true,
        message: 'Webhook processed: payment successful',
        transaction_id: finalizedTransaction._id,
      });
    }
    return;
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
