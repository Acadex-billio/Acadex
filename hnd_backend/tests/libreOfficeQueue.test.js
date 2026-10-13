const test = require('node:test');
const assert = require('node:assert/strict');

process.env.LIBREOFFICE_QUEUE_CONCURRENCY = '1';
process.env.LIBREOFFICE_QUEUE_WAIT_TIMEOUT_MS = '1000';
process.env.LIBREOFFICE_JOB_EXECUTION_TIMEOUT_MS = '30';

const {
  enqueueLibreOfficeJob,
  getLibreOfficeQueueStats,
} = require('../services/libreOfficeQueue');

test('an execution timeout keeps its slot until the underlying work settles', async () => {
  let releaseFirst;
  let markFirstStarted;
  let markSecondStarted;
  const firstStarted = new Promise((resolve) => { markFirstStarted = resolve; });
  const secondStarted = new Promise((resolve) => { markSecondStarted = resolve; });
  const first = enqueueLibreOfficeJob('stuck', () => new Promise((resolve) => {
    releaseFirst = resolve;
    markFirstStarted();
  }));
  await firstStarted;

  const second = enqueueLibreOfficeJob('next', async () => {
    markSecondStarted();
    return 'converted';
  });

  await assert.rejects(first, { code: 'JOB_EXECUTION_TIMEOUT' });
  assert.deepEqual(
    { running: getLibreOfficeQueueStats().running, queued: getLibreOfficeQueueStats().queued },
    { running: 1, queued: 1 }
  );

  releaseFirst();
  assert.equal(await second, 'converted');
  await secondStarted;
  assert.equal(getLibreOfficeQueueStats().running, 0);
});
