const { getCollectionPaymentStatus } = require('../services/camerpayPaymentService');

(async () => {
  try {
    const ref = 'sim-test-ref-123';
    console.log('check1', await getCollectionPaymentStatus(ref));
    console.log('check2', await getCollectionPaymentStatus(ref));
    console.log('check3', await getCollectionPaymentStatus(ref));
    process.exit(0);
  } catch (err) {
    console.error('status check error', err);
    process.exit(1);
  }
})();
