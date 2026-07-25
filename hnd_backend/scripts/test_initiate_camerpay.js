const { initiateCollectionPayment } = require('../services/camerpayPaymentService');

(async () => {
  try {
    const result = await initiateCollectionPayment({
      amount: 150,
      currency: 'XAF',
      externalReference: `test-${Date.now()}`,
      externalId: `test-${Date.now()}`,
      phoneNumber: '672000000',
      payerMessage: 'Test payment',
      payeeNote: 'Test from dev',
      redirectUrl: 'https://example.com/return',
      paymentMethod: 'momo',
    });
    console.log('Initiation result:', JSON.stringify(result, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('Initiation error:', err.message, err.responseBody || 'no responseBody');
    process.exit(1);
  }
})();
