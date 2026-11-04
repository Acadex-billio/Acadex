const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

test('sendBulkPushNotification personalizes @ separately for each user', async () => {
  const payloads = [];
  const originalLoad = Module._load;
  const originalPublicKey = process.env.VAPID_PUBLIC_KEY;
  const originalPrivateKey = process.env.VAPID_PRIVATE_KEY;

  Module._load = function mockPushDependencies(request, parent, isMain) {
    if (request === 'web-push') {
      return {
        setVapidDetails() {},
        sendNotification: async (_subscription, payload) => payloads.push(JSON.parse(payload)),
      };
    }
    if (request === 'nodemailer') return {};
    return originalLoad.call(this, request, parent, isMain);
  };
  process.env.VAPID_PUBLIC_KEY = 'test-public-key';
  process.env.VAPID_PRIVATE_KEY = 'test-private-key';

  const utilityPath = require.resolve('../utils/webPush');
  delete require.cache[utilityPath];
  try {
    const { sendBulkPushNotification } = require('../utils/webPush');
    const users = [
      { name: 'Ari', push_subscription: { endpoint: 'endpoint-1' } },
      { name: 'Bea', push_subscription: { endpoint: 'endpoint-2' } },
    ];

    await sendBulkPushNotification(
      users,
      'custom_alert',
      'Weekend update',
      'Hello @, have a great weekend!',
      '/',
      undefined,
      null,
      { personalizeName: true }
    );

    assert.deepEqual(payloads.map((payload) => payload.body).sort(), [
      'Hello Ari, have a great weekend!',
      'Hello Bea, have a great weekend!',
    ]);
  } finally {
    Module._load = originalLoad;
    if (originalPublicKey === undefined) delete process.env.VAPID_PUBLIC_KEY;
    else process.env.VAPID_PUBLIC_KEY = originalPublicKey;
    if (originalPrivateKey === undefined) delete process.env.VAPID_PRIVATE_KEY;
    else process.env.VAPID_PRIVATE_KEY = originalPrivateKey;
    delete require.cache[utilityPath];
  }
});
