const express = require('express');
const router = express.Router();
const paymentWebhookController = require('../controllers/paymentWebhookController');
const { createAuditTrail } = require('../middlewares/auditTrail');

// Public webhook endpoints (no authentication required)
// CamerPay calls these when payments complete

router.post(
  '/camerpay/callback',
  createAuditTrail('webhook.camerpay.callback', {
    bodyFields: ['payment_id', 'transaction_uuid', 'merchant_invoice_id', 'external_id', 'reference', 'status'],
  }),
  paymentWebhookController.handleCamerpayCallback
);

// Webhook endpoint that CamerPay dashboard expects: /api/webhooks/campay
// Respond immediately with 200 to prevent timeout, process async
router.post(
  '/webhooks/campay',
  createAuditTrail('webhook.camerpay.async_callback', {
    bodyFields: ['payment_id', 'transaction_uuid', 'merchant_invoice_id', 'external_id', 'reference', 'status'],
  }),
  (req, res) => {
    // Return 200 immediately to acknowledge receipt and prevent CamerPay timeout
    res.status(200).json({ success: true, message: 'Webhook received' });
    // Process in background without blocking response
    setImmediate(() => {
      paymentWebhookController.handleCamerpayCallback(req, null).catch((err) => {
        const logger = require('../utils/logger');
        logger.error('Async webhook processing error', { error: err.message, stack: err.stack });
      });
    });
  }
);

module.exports = router;
