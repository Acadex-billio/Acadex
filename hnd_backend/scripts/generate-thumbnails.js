/**
 * generate-thumbnails.js
 * One-time script to generate thumbnails for existing presentations and upload to S3.
 * Usage: node generate-thumbnails.js
 */

const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pipeline } = require('stream/promises');
const { spawn } = require('child_process');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Presentation = require('../models/Presentation');
const { uploadFile, getS3ObjectStream } = require('../utils/s3Uploader');
const { renderPdfFirstPageToPng } = require('../utils/pdfToImage');

const PRESENTATION_DIR = path.join(__dirname, '../uploads/presentations');
const PREVIEW_CACHE_DIR = path.join(os.tmpdir(), 'hnd-preview', 'presentations');
const PDF_DIR = path.join(PREVIEW_CACHE_DIR, 'pdfs');
const THUMBNAIL_DIR = path.join(PREVIEW_CACHE_DIR, 'thumbnails');

const LO_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'libreoffice',
  'soffice',
];

const COMMAND_CANDIDATES = LO_PATHS.filter((p) => (p.includes('\\') ? fs.existsSync(p) : true));

if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });
if (!fs.existsSync(THUMBNAIL_DIR)) fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });

const FORCE_OVERWRITE = String(process.env.FORCE_OVERWRITE || '').toLowerCase() === 'true';

const runLibreOfficeConvert = (command, sourcePath, outputDir) =>
  new Promise((resolve, reject) => {
    const args = ['--headless', '--convert-to', 'pdf', sourcePath, '--outdir', outputDir];
    console.log('[LibreOffice] Starting conversion:', { command, sourcePath });
    const child = spawn(command, args, { windowsHide: true });

    let stderr = '';
    child.stderr.on('data', (buf) => {
      stderr += buf.toString();
    });

    child.on('error', (err) => {
      console.error('[LibreOffice] Spawn error:', err.message);
      reject(err);
    });

    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || `LibreOffice exited with code ${code}`));
      console.log('[LibreOffice] Conversion finished:', { sourcePath });
      resolve();
    });
  });

const convertToPdf = async (sourcePath) => {
  let lastError;
  for (const command of COMMAND_CANDIDATES) {
    try {
      await runLibreOfficeConvert(command, sourcePath, PDF_DIR);
      return;
    } catch (err) {
      lastError = err;
      console.error('[LibreOffice] Conversion attempt failed:', { command, message: err.message });
    }
  }
  throw lastError || new Error('LibreOffice command not available');
};

const getS3KeyFromUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return String(parsed.pathname || '').replace(/^\/+/, '');
  } catch (_) {
    return null;
  }
};

const downloadS3ToFile = async (fileUrl, destPath) => {
  const key = getS3KeyFromUrl(fileUrl) || fileUrl;
  if (!key) return false;
  await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
  const stream = getS3ObjectStream(key);
  const writeStream = fs.createWriteStream(destPath);
  await pipeline(stream, writeStream);
  return true;
};

const processPresentation = async (presentation) => {
  const filePath = String(presentation.file_path || '').trim();
  if (!filePath) return { skipped: true, reason: 'no path' };

  const ext = path.extname(filePath).toLowerCase();
  const baseName = path.basename(filePath, ext);
  const tempSource = path.join(PREVIEW_CACHE_DIR, `${baseName}_temp${ext}`);
  const pdfName = `${baseName}.pdf`;
  const pdfPath = path.join(PDF_DIR, pdfName);
  const thumbnailLocalPath = path.join(THUMBNAIL_DIR, `${baseName}_thumb.png`);
  const thumbnailS3Folder = 'presentations/thumbnails';
  const thumbnailOriginalName = `${baseName}_thumb.png`;

  // If thumbnail already on S3, skip (unless FORCE_OVERWRITE is true)
  if (!FORCE_OVERWRITE) {
    try {
      const thumbnailKey = `${thumbnailS3Folder}/${thumbnailOriginalName}`;
      // Try to get stream; if succeeds, assume exists and skip
      try {
        const s = getS3ObjectStream(thumbnailKey);
        // If we get a stream without immediate error, we won't wait for content; assume exists
        console.log('[Skip] Thumbnail already on S3:', { thumbnailKey });
        return { skipped: true, reason: 'already_on_s3', thumbnailKey };
      } catch (_) {}
    } catch (_) {}
  }

  // Ensure source file is available locally
  let sourceLocalPath = tempSource;
  if (/^https?:\/\//i.test(filePath)) {
    console.log('[Download] Remote presentation:', { filePath, tempSource });
    try {
      await downloadS3ToFile(filePath, tempSource);
    } catch (err) {
      console.error('[Error] Failed to download remote file:', err.message);
      return { skipped: true, reason: 'download_failed' };
    }
  } else {
    // local file relative to uploads presentations
    sourceLocalPath = path.join(PRESENTATION_DIR, path.basename(filePath));
    if (!fs.existsSync(sourceLocalPath)) {
      console.log('[Skip] Source not found:', { sourceLocalPath });
      return { skipped: true, reason: 'source_missing' };
    }
  }

  // Convert to PDF
  try {
    if (!fs.existsSync(pdfPath)) {
      await convertToPdf(sourceLocalPath);
      // LibreOffice may name output as base_temp.pdf; try rename
      const altPdf = path.join(PDF_DIR, `${baseName}_temp.pdf`);
      if (fs.existsSync(altPdf) && !fs.existsSync(pdfPath)) {
        fs.renameSync(altPdf, pdfPath);
      }
    }
  } catch (err) {
    console.error('[Error] PDF conversion failed:', err.message);
    return { skipped: true, reason: 'conversion_failed' };
  }

  // Generate thumbnail from PDF
  try {
    await renderPdfFirstPageToPng(pdfPath, thumbnailLocalPath, { scale: 1.5, maxWidth: 340, maxHeight: 160 });
  } catch (err) {
    console.error('[Error] Thumbnail generation failed:', err.message);
    return { skipped: true, reason: 'thumbnail_failed' };
  }

  // Upload thumbnail to S3
  try {
    const buffer = fs.readFileSync(thumbnailLocalPath);
    const uploaded = await uploadFile(buffer, thumbnailOriginalName, 'image/png', thumbnailS3Folder);
    console.log('[Uploaded] Thumbnail:', uploaded.url || uploaded.key);
    return { success: true, thumbnail: uploaded };
  } catch (err) {
    console.error('[Error] Thumbnail upload failed:', err.message);
    return { skipped: true, reason: 'upload_failed' };
  }
};

const main = async () => {
  try {
    console.log('[Start] Generate Thumbnails Script');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('[Mongo] Connected');

    const presentations = await Presentation.find().lean();
    console.log('[Found] Presentations:', presentations.length);

    for (let i = 0; i < presentations.length; i++) {
      console.log(`\n[Progress] ${i + 1}/${presentations.length}`);
      const res = await processPresentation(presentations[i]);
      console.log('[Result]', res);
    }

    console.log('[Done] Thumbnail generation completed');
  } catch (err) {
    console.error('[Fatal] ', err.message);
  } finally {
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(0);
  }
};

main();
