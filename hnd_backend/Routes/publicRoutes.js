const express = require('express');
const router = express.Router();
const paymentWebhookController = require('../controllers/paymentWebhookController');

// Public webhook endpoints (no authentication required)
// CamerPay calls these when payments complete

router.post('/camerpay/callback', paymentWebhookController.handleCamerpayCallback);

// Webhook endpoint that CamerPay dashboard expects: /api/webhooks/campay
// Respond immediately with 200 to prevent timeout, process async
router.post('/webhooks/campay', (req, res) => {
  // Return 200 immediately to acknowledge receipt and prevent CamerPay timeout
  res.status(200).json({ success: true, message: 'Webhook received' });
  // Process in background without blocking response
  setImmediate(() => {
    paymentWebhookController.handleCamerpayCallback(req, res).catch((err) => {
      const logger = require('../utils/logger');
      logger.error('Async webhook processing error', { error: err.message });
    });
  });
});

module.exports = router;
