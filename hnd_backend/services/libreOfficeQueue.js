'use strict';

const queueDebugEnabled = String(process.env.LIBREOFFICE_QUEUE_DEBUG || '').trim().toLowerCase() === 'true';

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
};

const CONCURRENCY = parsePositiveInt(process.env.LIBREOFFICE_QUEUE_CONCURRENCY, 2);
const MAX_QUEUE_SIZE = parsePositiveInt(process.env.LIBREOFFICE_QUEUE_MAX_SIZE, 200);
const QUEUE_WAIT_TIMEOUT_MS = parsePositiveInt(process.env.LIBREOFFICE_QUEUE_WAIT_TIMEOUT_MS, 120000);
const JOB_EXECUTION_TIMEOUT_MS = parsePositiveInt(process.env.LIBREOFFICE_JOB_EXECUTION_TIMEOUT_MS, 60000);

const state = {
  running: 0,
  queued: [],
  completed: 0,
  failed: 0,
};

const createQueueError = (code, message) => {
  const err = new Error(message);
  err.code = code;
  return err;
};

const removeQueuedJob = (job) => {
  const index = state.queued.indexOf(job);
  if (index < 0) return false;
  state.queued.splice(index, 1);
  return true;
};

const next = () => {
  while (state.running < CONCURRENCY && state.queued.length > 0) {
    const job = state.queued.shift();
    clearTimeout(job.waitTimer);
    job.waitTimer = null;
    job.state = 'running';
    state.running += 1;

    const controller = new AbortController();
    let callerSettled = false;
    const executionTimer = setTimeout(() => {
      const err = createQueueError('JOB_EXECUTION_TIMEOUT', 'LibreOffice job execution timed out');
      controller.abort(err);
      if (!callerSettled) {
        callerSettled = true;
        state.failed += 1;
        job.reject(err);
      }
    }, JOB_EXECUTION_TIMEOUT_MS);

    Promise.resolve()
      .then(() => job.work(controller.signal))
      .then((result) => {
        clearTimeout(executionTimer);
        state.running -= 1;
        if (!callerSettled) {
          callerSettled = true;
          state.completed += 1;
          job.resolve(result);
        }
        next();
      })
      .catch((err) => {
        clearTimeout(executionTimer);
        state.running -= 1;
        if (!callerSettled) {
          callerSettled = true;
          state.failed += 1;
          job.reject(err);
        }
        next();
      });
  }
};

const enqueueLibreOfficeJob = (name, work) => {
  if (typeof work !== 'function') {
    throw createQueueError('QUEUE_INVALID_JOB', 'Queue work must be a function');
  }

  const totalInSystem = state.running + state.queued.length;
  if (totalInSystem >= MAX_QUEUE_SIZE) {
    throw createQueueError('QUEUE_FULL', 'LibreOffice queue is full');
  }

  return new Promise((resolve, reject) => {
    const job = { name, work, resolve, reject, state: 'queued', waitTimer: null };
    job.waitTimer = setTimeout(() => {
      if (!removeQueuedJob(job)) return;
      job.state = 'timed_out';
      state.failed += 1;
      reject(createQueueError('QUEUE_WAIT_TIMEOUT', 'LibreOffice queue wait timeout exceeded'));
    }, QUEUE_WAIT_TIMEOUT_MS);

    state.queued.push(job);
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
