const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '..', '.env') });
const reference = '1b956835-e261-4bfa-bd95-932816349572';
const urls = [
  `${process.env.CAMERPAY_API_BASE_URL || 'https://camerpay.biz'}/api/payment/${reference}/status`,
  `${process.env.CAMERPAY_API_BASE_URL || 'https://camerpay.biz'}/api/payment/${reference}`,
  `${process.env.CAMERPAY_API_BASE_URL || 'https://camerpay.biz'}/payment/${reference}`,
  `${process.env.CAMERPAY_API_BASE_URL || 'https://camerpay.biz'}/pay/${reference}`,
];

(async () => {
  for (const url of urls) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.CAMERPAY_TOKEN}`,
          'User-Agent': 'Acadex/1.0',
        },
      });
      const text = await res.text().catch(() => '');
      console.log(url);
      console.log(' status=', res.status);
      console.log(' content-type=', res.headers.get('content-type'));
      console.log(' body=', text.slice(0, 800).replace(/\n/g, ' '));
    } catch (err) {
      console.log(url, 'ERROR', err.message);
    }
    console.log('---');
  }
})();
