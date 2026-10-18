const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

test('sendBulkBcc reports Resend error responses as failed recipients', async () => {
  const calls = [];
  const responses = [
    { id: 'email_batch_1' },
    { statusCode: 422, message: 'Recipient domain is not verified' },
  ];
  const originalLoad = Module._load;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFromEmail = process.env.RESEND_FROM_EMAIL;
  const originalReplyTo = process.env.RESEND_REPLY_TO;

  Module._load = function mockResend(request, parent, isMain) {
    if (request === 'resend') {
      return {
        Resend: class MockResend {
          constructor() {
            this.emails = {
              send: async (options) => {
                calls.push(options);
                return responses.shift();
              },
            };
          }
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  process.env.RESEND_API_KEY = 'test-api-key';
  process.env.RESEND_FROM_EMAIL = 'Acadex <hndplatform@acadexe.com>';
  delete process.env.RESEND_REPLY_TO;
  delete require.cache[require.resolve('../services/emailService')];

  try {
    const { sendBulkBcc } = require('../services/emailService');
    const batches = [];
    const result = await sendBulkBcc(
      ['one@example.com', 'two@example.com', 'three@example.com'],
      'Test subject',
      'Test message',
      2,
      async (batch) => batches.push(batch)
    );

    assert.equal(calls.length, 2);
    assert.equal(calls[0].from, 'Acadex <hndplatform@acadexe.com>');
    assert.equal(calls[0].replyTo, 'acadexmail@gmail.com');
    assert.equal(calls[0].to, 'acadexmail@gmail.com');
    assert.deepEqual(calls[0].bcc, ['one@example.com', 'two@example.com']);
    assert.deepEqual(calls[1].bcc, ['three@example.com']);
    assert.equal(result.attempted, 3);
    assert.equal(result.sent, 2);
    assert.equal(result.failed, 1);
    assert.equal(batches[0].emailId, 'email_batch_1');
    assert.deepEqual(result.failedRecipients, [{
      email: 'three@example.com',
      reason: 'Recipient domain is not verified',
    }]);
    assert.equal(batches[1].accepted, false);
  } finally {
    Module._load = originalLoad;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFromEmail === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = originalFromEmail;
    if (originalReplyTo === undefined) delete process.env.RESEND_REPLY_TO;
    else process.env.RESEND_REPLY_TO = originalReplyTo;
    delete require.cache[require.resolve('../services/emailService')];
  }
});

test('sendBulkBcc sends broadcast recipients in chunks of at most 49', async () => {
  const calls = [];
  const originalLoad = Module._load;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFromEmail = process.env.RESEND_FROM_EMAIL;
  Module._load = function mockResend(request, parent, isMain) {
    if (request === 'resend') {
      return {
        Resend: class MockResend {
          constructor() {
            this.emails = {
              send: async (options) => {
                calls.push(options);
                return { data: { id: `email_batch_${calls.length}` } };
              },
            };
          }
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  process.env.RESEND_API_KEY = 'test-api-key';
  process.env.RESEND_FROM_EMAIL = 'Acadex <hndplatform@acadexe.com>';
  delete require.cache[require.resolve('../services/emailService')];

  try {
    const { sendBulkBcc } = require('../services/emailService');
    const batches = [];
    const recipients = Array.from({ length: 95 }, (_, index) => `user${index}@example.com`);
    const result = await sendBulkBcc(
      recipients,
      'Broadcast',
      'Message',
      49,
      async (batch) => batches.push(batch),
      { tags: [{ name: 'job_id', value: 'job_123' }] }
    );

    assert.deepEqual(calls.map((call) => call.bcc.length), [49, 46]);
    assert.deepEqual(calls.map((call) => call.from), [
      'Acadex <hndplatform@acadexe.com>',
      'Acadex <hndplatform@acadexe.com>',
    ]);
    assert.deepEqual(calls.map((call) => call.to), [
      'acadexmail@gmail.com',
      'acadexmail@gmail.com',
    ]);
    assert.deepEqual(calls.map((call) => call.tags), [
      [{ name: 'job_id', value: 'job_123' }],
      [{ name: 'job_id', value: 'job_123' }],
    ]);
    assert.deepEqual(batches.map((batch) => batch.emailId), ['email_batch_1', 'email_batch_2']);
    assert.equal(result.sent, 95);
    assert.equal(result.batchesAttempted, 2);
  } finally {
    Module._load = originalLoad;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFromEmail === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = originalFromEmail;
    delete require.cache[require.resolve('../services/emailService')];
  }
});

test('sendBulkBcc uses the configured reply-to inbox for internal delivery', async () => {
  const calls = [];
  const originalLoad = Module._load;
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalFromEmail = process.env.RESEND_FROM_EMAIL;
  const originalReplyTo = process.env.RESEND_REPLY_TO;
  Module._load = function mockResend(request, parent, isMain) {
    if (request === 'resend') {
      return {
        Resend: class MockResend {
          constructor() {
            this.emails = {
              send: async (options) => {
                calls.push(options);
                return { data: { id: 'email_custom_sender' } };
              },
            };
          }
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
  process.env.RESEND_API_KEY = 'test-api-key';
  process.env.RESEND_FROM_EMAIL = 'Acadex Updates <news@verified.example>';
  process.env.RESEND_REPLY_TO = 'replies@verified.example';
  delete require.cache[require.resolve('../services/emailService')];

  try {
    const { sendBulkBcc } = require('../services/emailService');
    await sendBulkBcc(['reader@example.net'], 'Broadcast', 'Message');

    assert.equal(calls[0].from, 'Acadex Updates <news@verified.example>');
    assert.equal(calls[0].replyTo, 'replies@verified.example');
    assert.equal(calls[0].to, 'replies@verified.example');
  } finally {
    Module._load = originalLoad;
    if (originalApiKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = originalApiKey;
    if (originalFromEmail === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = originalFromEmail;
    if (originalReplyTo === undefined) delete process.env.RESEND_REPLY_TO;
    else process.env.RESEND_REPLY_TO = originalReplyTo;
    delete require.cache[require.resolve('../services/emailService')];
  }
});
