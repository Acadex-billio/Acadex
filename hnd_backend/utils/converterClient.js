const axios = require('axios');
const path = require('path');

const CONVERTER_BASE_URL = String(process.env.CONVERTER_BASE_URL || '').trim().replace(/\/$/, '');
const CONVERTER_SECRET = String(process.env.CONVERTER_SECRET || '').trim();

const requestConverter = async ({ sourceUrl, sourcePath, format, outputName }) => {
  if (!CONVERTER_BASE_URL || !CONVERTER_SECRET) {
    throw new Error('Remote converter is not configured');
  }

  const endpoint = format === 'png' ? '/convert/png' : '/convert/pdf';
  const url = `${CONVERTER_BASE_URL}${endpoint}`;

  console.log('[ConverterClient] Sending remote conversion request:', {
    url,
    format,
    outputName,
    sourceUrl,
    hasSourcePath: Boolean(sourcePath),
  });

  try {
    const response = await axios.post(url, {
      sourceUrl,
      sourcePath,
      outputName,
    }, {
      headers: {
        'x-converter-secret': CONVERTER_SECRET,
        'content-type': 'application/json',
      },
      timeout: 120000,
      responseType: 'arraybuffer',
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
    console.error('[ConverterClient] Remote conversion request failed:', {
      message: err.message,
      status: err.response?.status,
      statusText: err.response?.statusText,
      dataLength: err.response?.data?.length || 0,
      url,
      format,
      outputName,
    });
    throw err;
  }
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

module.exports = {
  requestConverter,
  convertRemotePdf,
};
