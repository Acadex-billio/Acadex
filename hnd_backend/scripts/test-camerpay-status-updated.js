const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const { getCollectionPaymentStatus } = require('../services/camerpayPaymentService');

(async () => {
  try {
    const result = await getCollectionPaymentStatus('d36a797b-dd0d-40d1-8c80-b97b942099e3');
    console.log('Status result:', JSON.stringify(result, null, 2));
  } catch (err) {
    console.error('Status check failed:', err.message);
    process.exit(1);
  }
})();
