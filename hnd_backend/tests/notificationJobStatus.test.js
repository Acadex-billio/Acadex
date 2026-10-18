const assert = require('node:assert/strict');
const Module = require('node:module');
const test = require('node:test');

test('notification job status disables HTTP caching', async () => {
  const originalLoad = Module._load;
  const jobRecord = {
    _id: 'job_1',
    kind: 'email',
    status: 'sending',
    total: 86,
    processed: 49,
    accepted: 37,
    succeeded: 0,
    failed: 0,
    batchSize: 49,
    totalBatches: 2,
    batchesProcessed: 2,
    failedRecipients: [],
  };
  let query;

  Module._load = function mockDeveloperControllerDependencies(request, parent, isMain) {
    if (request === '../models/User') return {};
    if (request === '../services/emailService') return { sendBulkBcc: async () => ({}) };
    if (request === '../utils/webPush') return { sendBulkPushNotification: async () => ({}), isWebPushConfigured: true };
    if (request === '../models/NotificationJob') {
      return {
        findOne: (filter) => {
          query = filter;
          return { lean: async () => jobRecord };
        },
      };
    }
    if (request === '../models/NotificationJobRecipient') return {};
    if (request === '../services/notificationJobService') return { updateEmailJobCompletion: async () => {} };
    if (request === '../utils/logger') return { error() {}, info() {}, debug() {}, warn() {} };
    return originalLoad.call(this, request, parent, isMain);
  };

  const controllerPath = require.resolve('../controllers/developerController');
  delete require.cache[controllerPath];
  try {
    const controller = require('../controllers/developerController');
    const headers = {};
    const response = {
      set(values) {
        Object.assign(headers, values);
        return this;
      },
      json(body) {
        this.body = body;
        return this;
      },
    };

    await controller.getNotificationJob({
      params: { jobId: 'job_1' },
      user: { cand_id: 'CAND00003' },
    }, response);

    assert.equal(headers['Cache-Control'], 'no-store, no-cache, must-revalidate, proxy-revalidate');
    assert.equal(headers.Pragma, 'no-cache');
    assert.deepEqual(query, { _id: 'job_1', createdBy: 'CAND00003' });
    assert.equal(response.body.job.processed, 49);
    assert.equal(response.body.job.pending, 37);
  } finally {
    Module._load = originalLoad;
    delete require.cache[controllerPath];
  }
});
