const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough, Readable } = require('node:stream');
const { streamToBuffer } = require('../utils/streamLimits');

test('streamToBuffer returns a bounded stream unchanged', async () => {
  const result = await streamToBuffer(Readable.from([Buffer.from('preview')]), {
    maxBytes: 7,
    totalTimeoutMs: 100,
    idleTimeoutMs: 100,
  });

  assert.equal(result.toString(), 'preview');
});

test('streamToBuffer rejects streams that exceed the byte limit', async () => {
  await assert.rejects(
    streamToBuffer(Readable.from([Buffer.alloc(6)]), {
      maxBytes: 5,
      totalTimeoutMs: 100,
      idleTimeoutMs: 100,
    }),
    { code: 'PREVIEW_FILE_TOO_LARGE' }
  );
});

test('streamToBuffer aborts a stalled stream', async () => {
  const source = new PassThrough();
  await assert.rejects(
    streamToBuffer(source, {
      maxBytes: 10,
      totalTimeoutMs: 100,
      idleTimeoutMs: 20,
    }),
    { code: 'PREVIEW_STREAM_IDLE_TIMEOUT' }
  );
});
