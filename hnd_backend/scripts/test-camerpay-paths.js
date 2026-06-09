const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });

const payload = {
  payment_method: 'mtn_momo',
  amount: '100',
  currency: 'XAF',
  customer_phone: '678000000',
  merchant_invoice_id: `test-${Date.now()}`,
  source: 'api',
  merchant_callback_url: process.env.CAMERPAY_CALLBACK_URL,
  merchant_return_url: process.env.CAMERPAY_RETURN_URL,
  payer_message: 'Test payment',
  payee_note: 'Testing CamerPay integration',
};

const urls = [
  'https://camerpay.biz/payment/collect',
  'https://camerpay.biz/api/payment/initiate',
  'https://demo.campay.net/payment/collect',
  'https://demo.campay.net/api/payment/initiate',
];

(async () => {
  for (const url of urls) {
    try {
      console.log('POST', url);
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.CAMERPAY_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Acadex/1.0',
        },
        body: JSON.stringify(payload),
      });
      const text = await res.text();
      console.log('status', res.status);
      console.log('body', text.slice(0, 1200));
    } catch (err) {
      console.error('ERROR', url, err.message);
    }
    console.log('---');
  }
})();