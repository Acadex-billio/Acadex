const reference = '1b956835-e261-4bfa-bd95-932816349572';
const urls = [
  `https://camerpay.biz/api/payment/${reference}/status`,
  `https://camerpay.biz/api/payment/${reference}`,
  `https://camerpay.biz/payment/${reference}`,
  `https://camerpay.biz/pay/${reference}`,
  `https://camerpay.biz/pay/${reference}/status`,
  `https://camerpay.biz/api/payment/${reference}/collect`,
];
(async () => {
  for (const url of urls) {
    try {
      const res = await fetch(url, { method: 'GET' });
      const text = await res.text().catch(() => '');
      console.log(url);
      console.log(' status=', res.status);
      console.log(' content-type=', res.headers.get('content-type'));
      console.log(' body=', text.slice(0, 400).replace(/\n/g, ' '));
    } catch (err) {
      console.log(url, 'ERROR', err.message);
    }
    console.log('---');
  }
})();
