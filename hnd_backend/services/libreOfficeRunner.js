'use strict';

const { spawn } = require('child_process');

const runLibreOfficeConvert = (command, sourcePath, outputDir, { signal, timeoutMs = 30000 } = {}) =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new Error('LibreOffice conversion was cancelled'));
      return;
    }

    const child = spawn(command, ['--headless', '--convert-to', 'pdf', sourcePath, '--outdir', outputDir], {
      windowsHide: true,
    });
    let settled = false;
    let timedOut = false;
    let stderr = '';
    let forceKillTimer = null;

    const cleanup = () => {
      clearTimeout(timeoutTimer);
      clearTimeout(forceKillTimer);
      signal?.removeEventListener('abort', abort);
    };

    const terminate = () => {
      if (settled || child.killed) return;
      child.kill('SIGTERM');
      forceKillTimer = setTimeout(() => {
        if (!settled) child.kill('SIGKILL');
      }, 5000);
    };

    const abort = () => terminate();
    const timeoutTimer = setTimeout(() => {
      timedOut = true;
      terminate();
    }, timeoutMs);

    signal?.addEventListener('abort', abort, { once: true });
    if (signal?.aborted) abort();
    child.stderr.on('data', (buffer) => {
      stderr += buffer.toString();
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(error);
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (timedOut) {
        const error = new Error(`LibreOffice conversion timed out after ${timeoutMs}ms`);
        error.code = 'LIBREOFFICE_EXECUTION_TIMEOUT';
        reject(error);
      } else if (signal?.aborted) {
        reject(signal.reason || new Error('LibreOffice conversion was cancelled'));
      } else if (code !== 0) {
        reject(new Error(stderr || `LibreOffice exited with code ${code}`));
      } else {
        resolve();
      }
    });
  });

module.exports = { runLibreOfficeConvert };
