const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const Module = require('node:module');
const test = require('node:test');

test('Resend delivery webhooks update each broadcast recipient only once', async () => {
  const originalLoad = Module._load;
  const originalSecret = process.env.RESEND_WEBHOOK_SECRET;
  const secretBytes = crypto.randomBytes(32);
  const secret = `whsec_${secretBytes.toString('base64')}`;
  process.env.RESEND_WEBHOOK_SECRET = secret;
  const state = {
    recipient: {
      _id: 'recipient_1',
      jobId: 'job_1',
      email: 'reader@example.com',
      emailNormalized: 'reader@example.com',
      emailId: 'email_1',
      status: 'accepted',
    },
    counters: { processed: 0, succeeded: 0, failed: 0 },
    completionChecks: 0,
  };

  Module._load = function mockWebhookDependencies(request, parent, isMain) {
    if (request === '../models/NotificationJob') {
      return {
        exists: async () => true,
        updateOne: async (_filter, update) => {
          Object.keys(state.counters).forEach((key) => {
            state.counters[key] += update.$inc[key] || 0;
          });
        },
      };
    }
    if (request === '../models/NotificationJobRecipient') {
      return {
        find: (query) => ({
          select: () => ({
            lean: async () => (
              state.recipient.status === 'accepted' &&
              state.recipient.emailId === query.emailId &&
              query.emailNormalized.$in.includes(state.recipient.emailNormalized)
                ? [{ ...state.recipient }]
                : []
            ),
          }),
        }),
        exists: async () => true,
        findOneAndUpdate: (filter, update) => ({
          select: () => ({
            lean: async () => {
              if (state.recipient._id !== filter._id || state.recipient.status !== filter.status) return null;
              const previous = { ...state.recipient };
              Object.assign(state.recipient, update.$set);
              return previous;
            },
          }),
        }),
      };
    }
    if (request === '../services/notificationJobService') {
      return {
        updateEmailJobCompletion: async () => {
          state.completionChecks += 1;
        },
      };
    }
    if (request === '../utils/logger') return { warn() {}, error() {} };
    return originalLoad.call(this, request, parent, isMain);
  };

  const controllerPath = require.resolve('../controllers/resendWebhookController');
  delete require.cache[controllerPath];
  try {
    const controller = require('../controllers/resendWebhookController');
    const event = {
      type: 'email.delivered',
      data: {
        email_id: 'email_1',
        to: ['reader@example.com'],
        tags: { category: 'acadex-broadcast', job_id: 'job_1' },
      },
    };
    const payload = JSON.stringify(event);
    const id = 'msg_1';
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = crypto.createHmac('sha256', secretBytes)
      .update(`${id}.${timestamp}.${payload}`)
      .digest('base64');
    const request = {
      rawBody: payload,
      get: (header) => ({
        'svix-id': id,
        'svix-timestamp': timestamp,
        'svix-signature': `v1,${signature}`,
      }[header]),
    };
    const response = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };

    await controller.handleEvent(request, response);
    assert.equal(response.statusCode, 200);
    assert.equal(state.recipient.status, 'delivered');
    assert.deepEqual(state.counters, { processed: 1, succeeded: 1, failed: 0 });
    assert.equal(state.completionChecks, 1);

    await controller.handleEvent(request, response);
    assert.deepEqual(state.counters, { processed: 1, succeeded: 1, failed: 0 });
    assert.equal(state.completionChecks, 1);
  } finally {
    Module._load = originalLoad;
    if (originalSecret === undefined) delete process.env.RESEND_WEBHOOK_SECRET;
    else process.env.RESEND_WEBHOOK_SECRET = originalSecret;
    delete require.cache[controllerPath];
  }
});
