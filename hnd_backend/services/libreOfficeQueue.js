'use strict';

const queueDebugEnabled = String(process.env.LIBREOFFICE_QUEUE_DEBUG || '').trim().toLowerCase() === 'true';

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const CONCURRENCY = parsePositiveInt(process.env.LIBREOFFICE_QUEUE_CONCURRENCY, 2);
const MAX_QUEUE_SIZE = parsePositiveInt(process.env.LIBREOFFICE_QUEUE_MAX_SIZE, 200);
const JOB_WAIT_TIMEOUT_MS = parsePositiveInt(process.env.LIBREOFFICE_QUEUE_WAIT_TIMEOUT_MS, 120000);

const state = {
  running: 0,
  queued: [],
  completed: 0,
  failed: 0,
};

const next = () => {
  while (state.running < CONCURRENCY && state.queued.length > 0) {
    const job = state.queued.shift();
    state.running += 1;

    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      state.running -= 1;
      state.failed += 1;
      const err = new Error('LibreOffice queue wait timeout exceeded');
      err.code = 'QUEUE_WAIT_TIMEOUT';
      job.reject(err);
      next();
    }, JOB_WAIT_TIMEOUT_MS);

    Promise.resolve()
      .then(() => job.work())
      .then((result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        state.running -= 1;
        state.completed += 1;
        job.resolve(result);
        next();
      })
      .catch((err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        state.running -= 1;
        state.failed += 1;
        job.reject(err);
        next();
      });
  }
};

const enqueueLibreOfficeJob = (name, work) => {
  if (typeof work !== 'function') {
    const err = new Error('Queue work must be a function');
    err.code = 'QUEUE_INVALID_JOB';
    throw err;
  }

  const totalInSystem = state.running + state.queued.length;
  if (totalInSystem >= MAX_QUEUE_SIZE) {
    const err = new Error('LibreOffice queue is full');
    err.code = 'QUEUE_FULL';
    throw err;
  }

  return new Promise((resolve, reject) => {
    state.queued.push({ name, work, resolve, reject });
    if (queueDebugEnabled) {
      console.log('[LibreOfficeQueue] Enqueued job:', {
        name,
        running: state.running,
        queued: state.queued.length,
        concurrency: CONCURRENCY,
      });
    }
    next();
  });
};

const getLibreOfficeQueueStats = () => ({
  concurrency: CONCURRENCY,
  maxQueueSize: MAX_QUEUE_SIZE,
  running: state.running,
  queued: state.queued.length,
  completed: state.completed,
  failed: state.failed,
});

module.exports = {
  enqueueLibreOfficeJob,
  getLibreOfficeQueueStats,
};
