const axios = require('axios');
const fs = require('fs');
const path = require('path');

const CONVERTER_BASE_URL = String(process.env.CONVERTER_BASE_URL || '').trim().replace(/\/$/, '');
const CONVERTER_SECRETS = Array.from(new Set(
  [
    process.env.CONVERTER_SECRET,
    process.env.CONVERTER_SHARED_SECRET,
    process.env.CONVERTER_SECRET_FALLBACK,
    'TheBillions11',
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
));

const requestConverter = async ({ sourceUrl, sourcePath, format, outputName }) => {
  if (!CONVERTER_BASE_URL || CONVERTER_SECRETS.length === 0) {
    throw new Error('Remote converter is not configured');
  }

  const endpoint = format === 'png' ? '/convert/png' : '/convert/pdf';
  const url = `${CONVERTER_BASE_URL}${endpoint}`;

  const payload = {
    sourceUrl,
    outputName,
    sourceFilename: sourcePath ? path.basename(sourcePath) : undefined,
  };

  if (sourcePath && fs.existsSync(sourcePath)) {
    payload.sourceBase64 = fs.readFileSync(sourcePath).toString('base64');
  }

  console.log('[ConverterClient] Sending remote conversion request:', {
    url,
    format,
    outputName,
    sourceUrl,
    hasSourcePath: Boolean(sourcePath),
    hasSourceBase64: Boolean(payload.sourceBase64),
    secretCount: CONVERTER_SECRETS.length,
  });

  let lastError;

  for (const secret of CONVERTER_SECRETS) {
    try {
      const response = await axios.post(url, payload, {
        headers: {
          'x-converter-secret': secret,
          'content-type': 'application/json',
        },
        timeout: 120000,
        responseType: 'arraybuffer',
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      });

      console.log('[ConverterClient] Remote conversion response received:', {
        status: response.status,
        contentType: response.headers['content-type'],
        dataLength: response.data?.length || 0,
      });

      return {
        buffer: Buffer.from(response.data),
        contentType: response.headers['content-type'] || (format === 'png' ? 'image/png' : 'application/pdf'),
      };
    } catch (err) {
      lastError = err;
      const isAuthFailure = err.response?.status === 401;
      console.error('[ConverterClient] Remote conversion request failed:', {
        message: err.message,
        status: err.response?.status,
        statusText: err.response?.statusText,
        dataLength: err.response?.data?.length || 0,
        url,
        format,
        outputName,
        retryingWithFallbackSecret: isAuthFailure,
      });

      if (!isAuthFailure) {
        throw err;
      }
    }
  }

  throw lastError;
};

const convertRemotePdf = async ({ sourceUrl, sourcePath, outputDir, outputName }) => {
  const result = await requestConverter({
    sourceUrl,
    sourcePath,
    format: 'pdf',
    outputName,
  });

  const fileName = String(outputName || 'converted.pdf').replace(/\.[^.]+$/, '.pdf');
  const outputPath = path.join(outputDir, fileName);
  await require('fs').promises.writeFile(outputPath, result.buffer);
  return outputPath;
};

const convertRemotePng = async ({ sourceUrl, sourcePath, outputDir, outputName }) => {
  const result = await requestConverter({
    sourceUrl,
    sourcePath,
    format: 'png',
    outputName,
  });

  const fileName = String(outputName || 'converted.png').replace(/\.[^.]+$/, '.png');
  const outputPath = path.join(outputDir, fileName);
  await require('fs').promises.writeFile(outputPath, result.buffer);
  return outputPath;
};

module.exports = {
  requestConverter,
  convertRemotePdf,
  convertRemotePng,
};
