const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
process.env.CAMERPAY_API_BASE_URL = 'https://camerpay.biz';
const { initiateCollectionPayment } = require('../services/camerpayPaymentService');

(async () => {
  try {
    console.log('Using:', {
      CAMERPAY_API_BASE_URL: process.env.CAMERPAY_API_BASE_URL,
      CAMERPAY_CALLBACK_URL: process.env.CAMERPAY_CALLBACK_URL,
      CAMERPAY_RETURN_URL: process.env.CAMERPAY_RETURN_URL,
      CAMERPAY_TOKEN: process.env.CAMERPAY_TOKEN ? '[REDACTED]' : null,
      CAMERPAY_WEBHOOK_KEY: process.env.CAMERPAY_WEBHOOK_KEY,
    });

    const result = await initiateCollectionPayment({
      amount: 100,
      currency: 'XAF',
      externalReference: `test-${Date.now()}`,
      externalId: `test-${Date.now()}`,
      phoneNumber: '678000000',
      payerMessage: 'Test payment',
      payeeNote: 'Testing CamerPay integration',
      redirectUrl: process.env.CAMERPAY_RETURN_URL,
      paymentMethod: 'mtn_momo',
    });
    console.log('Payment initiation result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Payment initiation failed:', err.message);
    if (err.responseBody) {
      console.error('Response body:', JSON.stringify(err.responseBody, null, 2));
    }
    process.exit(1);
  }
})();