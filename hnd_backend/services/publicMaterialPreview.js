'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { randomUUID } = require('crypto');
const { PDFDocument } = require('pdf-lib');
const { getS3ObjectStream } = require('../utils/s3Uploader');
const { MAX_PREVIEW_FILE_BYTES, streamToBuffer, subsetPdfBuffer } = require('../utils/pdfAccess');
const { enqueueLibreOfficeJob } = require('./libreOfficeQueue');
const { runLibreOfficeConvert } = require('./libreOfficeRunner');
const { resolveLibreOfficeCommand } = require('../utils/libreOffice');
const { isCloudConvertConfigured, convertPresentationToPdf } = require('../utils/cloudConvertClient');

const MATERIAL_CONFIG = {
  papers: { directory: path.join(__dirname, '../uploads/papers'), field: 'paper_file' },
  reports: { directory: path.join(__dirname, '../uploads/reports'), field: 'file_path' },
  presentations: { directory: path.join(__dirname, '../uploads/presentations'), field: 'file_path' },
};

const getSourceName = (source) => {
  const raw = String(source || '').trim();
  if (/^https?:\/\//i.test(raw)) {
    try {
      return path.posix.basename(new URL(raw).pathname);
    } catch (_) {
      return '';
    }
  }
  return path.posix.basename(raw.replace(/\\/g, '/'));
};

const readMaterialSource = async (source, type) => {
  const config = MATERIAL_CONFIG[type];
  const sourceName = getSourceName(source);
  if (!sourceName || sourceName === '.' || sourceName === '..') {
    throw Object.assign(new Error('Material file is unavailable'), { code: 'MATERIAL_FILE_NOT_FOUND' });
  }

  if (/^https?:\/\//i.test(String(source || ''))) {
    const s3BaseUrl = String(process.env.AWS_S3_URL || '').replace(/\/$/, '');
    const raw = String(source).trim();
    let key;
    if (s3BaseUrl && raw.startsWith(`${s3BaseUrl}/`)) {
      key = raw.slice(s3BaseUrl.length + 1);
    } else {
      key = new URL(raw).pathname.replace(/^\/+/, '');
    }
    const stream = getS3ObjectStream(key);
    stream.once('missing', () => {
      stream.destroy(Object.assign(new Error('Material file is unavailable'), { code: 'MATERIAL_FILE_NOT_FOUND' }));
    });
    try {
      return await streamToBuffer(stream);
    } catch (error) {
      if (error.code === 'NoSuchKey' || error.code === 'MATERIAL_FILE_NOT_FOUND') {
        throw Object.assign(new Error('Material file is unavailable'), { code: 'MATERIAL_FILE_NOT_FOUND' });
      }
      throw error;
    }
  }

  const localPath = path.resolve(config.directory, sourceName);
  const resolvedDirectory = `${path.resolve(config.directory)}${path.sep}`;
  if (!localPath.startsWith(resolvedDirectory)) {
    throw Object.assign(new Error('Material file is unavailable'), { code: 'MATERIAL_FILE_NOT_FOUND' });
  }
  try {
    const stats = await fs.promises.stat(localPath);
    if (stats.size > MAX_PREVIEW_FILE_BYTES) {
      throw Object.assign(new Error('Preview file exceeds the maximum allowed size'), {
        code: 'PREVIEW_FILE_TOO_LARGE',
      });
    }
    return await fs.promises.readFile(localPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw Object.assign(new Error('Material file is unavailable'), { code: 'MATERIAL_FILE_NOT_FOUND' });
    }
    throw error;
  }
};

const convertToPdf = async (sourceBuffer, extension, type) => {
  const tempDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'acadex-public-preview-'));
  const sourceName = `material-${randomUUID()}${extension}`;
  const sourcePath = path.join(tempDirectory, sourceName);
  const pdfPath = path.join(tempDirectory, `${path.basename(sourceName, extension)}.pdf`);

  try {
    await fs.promises.writeFile(sourcePath, sourceBuffer);
    if (type === 'presentations' && isCloudConvertConfigured()) {
      try {
        const cloudPath = await enqueueLibreOfficeJob(`public-preview:${sourceName}`, (signal) =>
          convertPresentationToPdf({
            sourcePath,
            outputDir: tempDirectory,
            outputName: sourceName,
            signal,
          })
        );
        if (cloudPath && await fs.promises.access(cloudPath).then(() => true, () => false)) {
          return await fs.promises.readFile(cloudPath);
        }
      } catch (error) {
        if (['JOB_EXECUTION_TIMEOUT', 'CLOUDCONVERT_TIMEOUT'].includes(error.code)) throw error;
        console.warn('[PublicMaterialPreview] CloudConvert failed; falling back to LibreOffice:', error.message);
      }
    }

    const command = resolveLibreOfficeCommand();
    if (!command) {
      throw Object.assign(new Error('Office document preview conversion is unavailable'), {
        code: 'PREVIEW_CONVERSION_UNAVAILABLE',
      });
    }
    await enqueueLibreOfficeJob(`public-preview:${sourceName}`, (signal) =>
      runLibreOfficeConvert(command, sourcePath, tempDirectory, { signal })
    );
    return await fs.promises.readFile(pdfPath);
  } finally {
    await fs.promises.rm(tempDirectory, { recursive: true, force: true });
  }
};

const createFirstPagePreview = async (sourceBuffer, extension, type) => {
  const normalizedExtension = String(extension || '').toLowerCase();
  let pdfBuffer;
  if (normalizedExtension === '.pdf') {
    pdfBuffer = sourceBuffer;
  } else if (
    (type === 'reports' && ['.doc', '.docx'].includes(normalizedExtension)) ||
    (type === 'presentations' && ['.ppt', '.pptx'].includes(normalizedExtension))
  ) {
    pdfBuffer = await convertToPdf(sourceBuffer, normalizedExtension, type);
  } else {
    throw Object.assign(new Error('This material format cannot be previewed publicly'), {
      code: 'PREVIEW_FORMAT_UNSUPPORTED',
    });
  }

  let firstPage;
  let limitedDocument;
  try {
    firstPage = await subsetPdfBuffer(pdfBuffer, 1);
    limitedDocument = await PDFDocument.load(firstPage, { ignoreEncryption: true });
  } catch (error) {
    throw Object.assign(new Error('The material could not be converted to a valid PDF preview'), {
      code: 'PREVIEW_INVALID_PDF',
      cause: error,
    });
  }
  if (limitedDocument.getPageCount() !== 1) {
    throw Object.assign(new Error('The material does not contain a previewable page'), {
      code: 'PREVIEW_PAGE_UNAVAILABLE',
    });
  }
  return firstPage;
};

const getMaterialSource = (material, type) => material?.[MATERIAL_CONFIG[type]?.field];

module.exports = { createFirstPagePreview, getMaterialSource, readMaterialSource };
