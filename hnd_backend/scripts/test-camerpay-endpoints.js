require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });
const urls = [
  `${process.env.CAMERPAY_API_BASE_URL || 'https://camerpay.biz'}/payment/collect`,
  `${process.env.CAMERPAY_API_BASE_URL || 'https://camerpay.biz'}/api/payment/initiate`,
  `${process.env.CAMERPAY_API_BASE_URL || 'https://camerpay.biz'}/api/payment/collect`,
  `${process.env.CAMERPAY_API_BASE_URL || 'https://camerpay.biz'}/payment/status/test-ref`,
  `${process.env.CAMERPAY_API_BASE_URL || 'https://camerpay.biz'}/api/payment/status/test-ref`,
  `${process.env.CAMERPAY_API_BASE_URL || 'https://camerpay.biz'}/api/payment/collect/test-ref`,
  'https://demo.campay.net/payment/collect',
  'https://demo.campay.net/api/payment/initiate',
];

(async () => {
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'HEAD' });
      console.log(url, res.status, res.headers.get('content-type'));
    } catch (err) {
      console.log(url, 'ERR', err.message);
    }
  }
})();