const express = require('express');
const router = express.Router();
const paymentWebhookController = require('../controllers/paymentWebhookController');

// Public webhook endpoints (no authentication required)
// CamerPay calls these when payments complete

router.post('/camerpay/callback', paymentWebhookController.handleCamerpayCallback);

module.exports = router;
