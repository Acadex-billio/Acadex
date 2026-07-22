const axios = require('axios');
const path = require('path');

const CONVERTER_BASE_URL = String(process.env.CONVERTER_BASE_URL || '').trim().replace(/\/$/, '');
const CONVERTER_SECRET = String(process.env.CONVERTER_SECRET || '').trim();

const requestConverter = async ({ sourceUrl, sourcePath, format, outputName }) => {
  if (!CONVERTER_BASE_URL || !CONVERTER_SECRET) {
    throw new Error('Remote converter is not configured');
  }

  const endpoint = format === 'png' ? '/convert/png' : '/convert/pdf';
  const response = await axios.post(`${CONVERTER_BASE_URL}${endpoint}`, {
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

  return {
    buffer: Buffer.from(response.data),
    contentType: response.headers['content-type'] || (format === 'png' ? 'image/png' : 'application/pdf'),
  };
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
