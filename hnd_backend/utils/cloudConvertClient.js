const fs = require('fs');
const path = require('path');
const axios = require('axios');
const CloudConvert = require('cloudconvert');

const CLOUDCONVERT_API_KEY = String(process.env.CLOUDCONVERT_API_KEY || '').trim();
const CLOUDCONVERT_REGION = String(process.env.CLOUDCONVERT_REGION || '').trim();
const CLOUDCONVERT_SANDBOX = String(process.env.CLOUDCONVERT_SANDBOX || 'false').trim().toLowerCase() === 'true';
const CLOUDCONVERT_TIMEOUT_MS = Math.max(1000, Number(process.env.CLOUDCONVERT_TIMEOUT_MS || 120000));
const CLOUDCONVERT_MAX_FILE_BYTES = Math.max(1, Number(process.env.CLOUDCONVERT_MAX_FILE_BYTES || 50 * 1024 * 1024));

const cloudConvertClient = CLOUDCONVERT_API_KEY
  ? new CloudConvert(CLOUDCONVERT_API_KEY, CLOUDCONVERT_SANDBOX, CLOUDCONVERT_REGION || undefined)
  : null;

const isCloudConvertConfigured = () => Boolean(CLOUDCONVERT_API_KEY && cloudConvertClient);

const abortError = (signal) => signal.reason instanceof Error
  ? signal.reason
  : Object.assign(new Error('CloudConvert operation was cancelled'), { code: 'CLOUDCONVERT_ABORTED' });

const waitWithSignal = (promise, signal) => {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    const finish = (callback, value) => {
      signal.removeEventListener('abort', onAbort);
      callback(signal.aborted ? abortError(signal) : value);
    };
    const onAbort = () => {
      // The SDK does not expose AbortSignal support; keep the queue slot until its
      // underlying fetch/upload settles rather than treating this wrapper as cancellation.
    };
    signal.addEventListener('abort', onAbort, { once: true });
    Promise.resolve(promise).then(
      (value) => finish(resolve, value),
      (error) => finish(reject, error)
    );
  });
};

const cancelJob = async (job) => {
  if (!job?.tasks || !cloudConvertClient) return;
  const pendingTasks = job.tasks.filter((task) => !['finished', 'error', 'canceled'].includes(task.status));
  await Promise.all(pendingTasks.map(async (task) => {
    if (!task.id) return;
    let timer;
    try {
      await Promise.race([
        cloudConvertClient.tasks.cancel(task.id),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Object.assign(new Error('CloudConvert task cancellation timed out'), { code: 'CLOUDCONVERT_CANCEL_TIMEOUT' })),
            5000
          );
        }),
      ]);
    } catch (error) {
      console.warn('[CloudConvert] Could not confirm task cancellation:', {
        taskId: task.id,
        message: error.message,
      });
    } finally {
      clearTimeout(timer);
    }
  }));
};

const downloadUrlToBuffer = async (url, signal) => {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: CLOUDCONVERT_TIMEOUT_MS,
    maxContentLength: CLOUDCONVERT_MAX_FILE_BYTES,
    maxBodyLength: CLOUDCONVERT_MAX_FILE_BYTES,
    signal,
  });
  return Buffer.from(response.data);
};

const convertPresentationToPdf = async ({ sourcePath, sourceUrl, outputDir, outputName, signal: externalSignal }) => {
  if (!isCloudConvertConfigured()) {
    throw new Error('CloudConvert is not configured');
  }

  if (!outputDir) {
    throw new Error('Missing CloudConvert output directory');
  }

  await fs.promises.mkdir(outputDir, { recursive: true });

  const resolvedSourcePath = sourcePath ? path.resolve(sourcePath) : null;
  const filenameBase = String(outputName || path.basename(resolvedSourcePath || sourceUrl || 'presentation')).replace(/\.[^.]+$/, '');
  const outputPath = path.join(outputDir, `${filenameBase}.pdf`);
  const sourceExtension = path.extname(resolvedSourcePath || sourceUrl || '').toLowerCase();
  const inputFormat = sourceExtension ? sourceExtension.replace(/^[.]/, '') : undefined;

  const tasks = {
    'import-file': {
      operation: resolvedSourcePath ? 'import/upload' : 'import/url',
      ...(resolvedSourcePath ? {} : { url: sourceUrl, filename: path.basename(sourceUrl || 'presentation') }),
    },
    'convert-file': {
      operation: 'convert',
      input: 'import-file',
      output_format: 'pdf',
      ...(inputFormat ? { input_format: inputFormat } : {}),
    },
    'export-file': {
      operation: 'export/url',
      input: 'convert-file',
    },
  };

  if (resolvedSourcePath) {
    const sourceStat = await fs.promises.stat(resolvedSourcePath);
    if (sourceStat.size > CLOUDCONVERT_MAX_FILE_BYTES) {
      throw Object.assign(new Error('CloudConvert source file exceeds the maximum allowed size'), {
        code: 'CLOUDCONVERT_FILE_TOO_LARGE',
      });
    }
  }

  const controller = new AbortController();
  const timeoutError = Object.assign(new Error('CloudConvert conversion timed out'), { code: 'CLOUDCONVERT_TIMEOUT' });
  const timeout = setTimeout(() => controller.abort(timeoutError), CLOUDCONVERT_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort(abortError(externalSignal));
  externalSignal?.addEventListener('abort', abortFromCaller, { once: true });
  let job;
  let fileStream;
  let cancellationPromise = Promise.resolve();
  const cancelOnAbort = () => {
    if (job) cancellationPromise = cancelJob(job);
  };
  controller.signal.addEventListener('abort', cancelOnAbort);

  try {
    if (externalSignal?.aborted) abortFromCaller();
    const signal = controller.signal;
    job = await waitWithSignal(cloudConvertClient.jobs.create({
      tasks,
      tag: `presentation-convert-${Date.now()}`,
    }), signal);
    if (signal.aborted) cancelOnAbort();

    if (resolvedSourcePath) {
      const uploadTask = job.tasks.find((task) => task.name === 'import-file');
      if (!uploadTask) {
        throw new Error('CloudConvert import/upload task was not created');
      }

      fileStream = fs.createReadStream(resolvedSourcePath);
      await waitWithSignal(
        cloudConvertClient.tasks.upload(uploadTask, fileStream, path.basename(resolvedSourcePath)),
        signal
      );
    }

    const finishedJob = await waitWithSignal(cloudConvertClient.jobs.wait(job.id), signal);
    job = finishedJob;
    if (signal.aborted) cancelOnAbort();
    const exportTask = Array.isArray(finishedJob.tasks)
      ? finishedJob.tasks.find((task) => task.operation === 'export/url' && task.status === 'finished')
      : null;

    const fileUrl = exportTask?.result?.files?.[0]?.url;
    if (!fileUrl) {
      throw new Error('CloudConvert job finished without an export URL');
    }

    const buffer = await downloadUrlToBuffer(fileUrl, signal);
    await fs.promises.writeFile(outputPath, buffer);
    return outputPath;
  } catch (error) {
    fileStream?.destroy();
    if (controller.signal.aborted) {
      cancelOnAbort();
      await cancellationPromise;
      throw abortError(controller.signal);
    }
    if (job) await cancelJob(job);
    throw error;
  } finally {
    clearTimeout(timeout);
    controller.signal.removeEventListener('abort', cancelOnAbort);
    externalSignal?.removeEventListener('abort', abortFromCaller);
  }
};

module.exports = {
  isCloudConvertConfigured,
  convertPresentationToPdf,
};
