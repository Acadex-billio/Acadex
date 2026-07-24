const fs = require('fs');
const path = require('path');
const axios = require('axios');
const CloudConvert = require('cloudconvert');

const CLOUDCONVERT_API_KEY = String(process.env.CLOUDCONVERT_API_KEY || '').trim();
const CLOUDCONVERT_REGION = String(process.env.CLOUDCONVERT_REGION || '').trim();
const CLOUDCONVERT_SANDBOX = String(process.env.CLOUDCONVERT_SANDBOX || 'false').trim().toLowerCase() === 'true';

const cloudConvertClient = CLOUDCONVERT_API_KEY
  ? new CloudConvert(CLOUDCONVERT_API_KEY, CLOUDCONVERT_SANDBOX, CLOUDCONVERT_REGION || undefined)
  : null;

const isCloudConvertConfigured = () => Boolean(CLOUDCONVERT_API_KEY && cloudConvertClient);

const downloadUrlToBuffer = async (url) => {
  const response = await axios.get(url, {
    responseType: 'arraybuffer',
    timeout: 120000,
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });
  return Buffer.from(response.data);
};

const convertPresentationToPdf = async ({ sourcePath, sourceUrl, outputDir, outputName }) => {
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

  const job = await cloudConvertClient.jobs.create({
    tasks,
    tag: `presentation-convert-${Date.now()}`,
  });

  if (resolvedSourcePath) {
    const uploadTask = job.tasks.find((task) => task.name === 'import-file');
    if (!uploadTask) {
      throw new Error('CloudConvert import/upload task was not created');
    }

    const fileStream = fs.createReadStream(resolvedSourcePath);
    await cloudConvertClient.tasks.upload(uploadTask, fileStream, path.basename(resolvedSourcePath));
  }

  const finishedJob = await cloudConvertClient.jobs.wait(job.id);
  const exportTask = Array.isArray(finishedJob.tasks)
    ? finishedJob.tasks.find((task) => task.operation === 'export/url' && task.status === 'finished')
    : null;

  const fileUrl = exportTask?.result?.files?.[0]?.url;
  if (!fileUrl) {
    throw new Error('CloudConvert job finished without an export URL');
  }

  const buffer = await downloadUrlToBuffer(fileUrl);
  await fs.promises.writeFile(outputPath, buffer);
  return outputPath;
};

module.exports = {
  isCloudConvertConfigured,
  convertPresentationToPdf,
};
