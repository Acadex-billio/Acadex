'use strict';

const { Transform, Writable } = require('stream');
const { pipeline } = require('stream/promises');

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const MAX_PREVIEW_FILE_BYTES = parsePositiveInt(process.env.PREVIEW_MAX_FILE_BYTES, 50 * 1024 * 1024);
const PREVIEW_TOTAL_TIMEOUT_MS = parsePositiveInt(process.env.PREVIEW_STREAM_TIMEOUT_MS, 120000);
const PREVIEW_IDLE_TIMEOUT_MS = parsePositiveInt(process.env.PREVIEW_STREAM_IDLE_TIMEOUT_MS, 20000);

const createStreamError = (code, message) => {
  const error = new Error(message);
  error.code = code;
  return error;
};

const pipelineWithLimits = async (
  source,
  destination,
  {
    maxBytes = MAX_PREVIEW_FILE_BYTES,
    totalTimeoutMs = PREVIEW_TOTAL_TIMEOUT_MS,
    idleTimeoutMs = PREVIEW_IDLE_TIMEOUT_MS,
  } = {}
) => {
  const controller = new AbortController();
  let bytes = 0;
  let idleTimer;
  const abort = (error) => {
    if (!controller.signal.aborted) controller.abort(error);
  };
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(
      () => abort(createStreamError('PREVIEW_STREAM_IDLE_TIMEOUT', 'Preview file stream stalled')),
      idleTimeoutMs
    );
  };
  const refreshIdleTimer = () => {
    resetIdleTimer();
  };
  const limiter = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        callback(createStreamError('PREVIEW_FILE_TOO_LARGE', 'Preview file exceeds the maximum allowed size'));
        return;
      }
      refreshIdleTimer();
      callback(null, chunk);
    },
  });
  const totalTimer = setTimeout(
    () => abort(createStreamError('PREVIEW_STREAM_TIMEOUT', 'Preview file stream timed out')),
    totalTimeoutMs
  );

  resetIdleTimer();
  try {
    await pipeline(source, limiter, destination, { signal: controller.signal });
    return bytes;
  } catch (error) {
    if (controller.signal.aborted && controller.signal.reason) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(totalTimer);
    clearTimeout(idleTimer);
  }
};

const streamToBuffer = async (source, options = {}) => {
  const chunks = [];
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk));
      callback();
    },
  });
  await pipelineWithLimits(source, destination, options);
  return Buffer.concat(chunks);
};

module.exports = {
  MAX_PREVIEW_FILE_BYTES,
  PREVIEW_TOTAL_TIMEOUT_MS,
  PREVIEW_IDLE_TIMEOUT_MS,
  pipelineWithLimits,
  streamToBuffer,
};
