require('dotenv').config({ path: require('path').resolve(__dirname, '..', '..', '.env') });

const urls = [
  `${process.env.CAMERPAY_API_BASE_URL || 'https://camerpay.biz'}/api/payment/status/test-ref`,
  `${process.env.CAMERPAY_API_BASE_URL || 'https://camerpay.biz'}/payment/status/test-ref`,
  `${process.env.CAMERPAY_API_BASE_URL || 'https://camerpay.biz'}/api/payment/collect/test-ref`,
  `${process.env.CAMERPAY_API_BASE_URL || 'https://camerpay.biz'}/api/payment/initiate`,
];

(async () => {
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'GET' });
      const text = await res.text().catch(() => '');
      console.log('URL:', url);
      console.log('  status=', res.status);
      console.log('  type=', res.headers.get('content-type'));
      console.log('  body=', text.slice(0, 400).replace(/\n/g, ' '));
    } catch (err) {
      console.log('URL:', url, 'ERR', err.message);
    }
  }
})();
