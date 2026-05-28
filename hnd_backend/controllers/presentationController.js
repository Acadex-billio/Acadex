/**
 * Presentations Controller
 */
const Presentation = require('../models/Presentation');
const Report = require('../models/Report');
const History = require('../models/History');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const { sanitizeFilename } = require('../middlewares/requestValidation');
const { getS3ObjectStream } = require('../utils/s3Uploader');
const { getMaterialAccessSummary } = require('../utils/subscriptionUtils');
const { streamToBuffer, subsetPdfBuffer } = require('../utils/pdfAccess');
const { enqueueLibreOfficeJob } = require('../services/libreOfficeQueue');

const PRESENTATION_DIR = path.join(__dirname, '../uploads/presentations');
const PREVIEW_CACHE_DIR = path.join(os.tmpdir(), 'hnd-preview', 'presentations');
const PDF_DIR = path.join(PREVIEW_CACHE_DIR, 'pdfs');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

const LO_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'libreoffice',
  'soffice',
];
const COMMAND_CANDIDATES = LO_PATHS.filter((p) => p.includes('\\') ? fs.existsSync(p) : true);

const S3_BASE_URL = String(process.env.AWS_S3_URL || '').replace(/\/$/, '');

const getS3KeyFromValue = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (!/^https?:\/\//i.test(raw)) return raw.replace(/^\/+/, '');
  if (S3_BASE_URL && raw.startsWith(`${S3_BASE_URL}/`)) {
    return raw.slice(S3_BASE_URL.length + 1);
  }
  try {
    const parsed = new URL(raw);
    return String(parsed.pathname || '').replace(/^\/+/, '');
  } catch (_) {
    return null;
  }
};

const streamS3ToResponse = (source, res, disposition = 'inline', downloadName = 'file', contentType = 'application/octet-stream') => {
  const key = getS3KeyFromValue(source);
  if (!key) return false;

  const stream = getS3ObjectStream(key);
  res.setHeader('Content-Type', contentType);
  if (disposition === 'attachment') {
    res.setHeader('Content-Disposition', `attachment; filename="${downloadName}"`);
  } else {
    res.setHeader('Content-Disposition', 'inline');
  }

  stream.on('error', (err) => {
    console.error('[Presentations] S3 stream error:', err.message);
    if (!res.headersSent) {
      res.status(404).json({ success: false, message: 'File not found' });
    }
  });

  stream.pipe(res);
  return true;
};

const writeS3ObjectToFile = async (source, destinationPath) => {
  const key = getS3KeyFromValue(source);
  if (!key) return false;

  console.log('[Presentations] Downloading remote file for preview conversion:', {
    key,
    destinationPath,
  });
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  const readStream = getS3ObjectStream(key);
  const writeStream = fs.createWriteStream(destinationPath);
  await pipeline(readStream, writeStream);
  console.log('[Presentations] Remote file downloaded for preview conversion:', {
    destinationPath,
    exists: fs.existsSync(destinationPath),
  });
  return true;
};

const runLibreOfficeConvert = (command, sourcePath, outputDir) =>
  new Promise((resolve, reject) => {
    const args = ['--headless', '--convert-to', 'pdf', sourcePath, '--outdir', outputDir];
    console.log('[Presentations] Starting LibreOffice conversion:', {
      command,
      sourcePath,
      outputDir,
      args,
    });
    const child = spawn(command, args, { windowsHide: true });

    let stderr = '';
    child.stderr.on('data', (buf) => {
      stderr += buf.toString();
    });

    child.on('error', (err) => {
      console.error('[Presentations] LibreOffice spawn error:', {
        command,
        message: err.message,
      });
      reject(err);
    });
    child.on('close', (code) => {
      console.log('[Presentations] LibreOffice conversion finished:', {
        command,
        code,
        stderr,
      });
      if (code !== 0) return reject(new Error(stderr || `LibreOffice exited with code ${code}`));
      return resolve();
    });
  });

const convertToPdf = async (sourcePath, outputDir) => {
  return enqueueLibreOfficeJob(`presentation:${path.basename(sourcePath)}`, async () => {
    let lastError;
    for (const command of COMMAND_CANDIDATES) {
      try {
        await runLibreOfficeConvert(command, sourcePath, outputDir);
        console.log('[Presentations] LibreOffice conversion succeeded:', {
          command,
          sourcePath,
          outputDir,
        });
        return;
      } catch (err) {
        lastError = err;
        console.error('[Presentations] LibreOffice conversion attempt failed:', {
          command,
          message: err.message,
        });
      }
    }
    throw lastError || new Error('LibreOffice command not available');
  });
};

const canAccessPresentation = (presentation, deptId) => {
  if (!presentation) return false;
  const aud = String(presentation.audience || '').toUpperCase();
  if (aud === 'GENERAL') return true;
  if (!deptId) return false;
  const deptIds = (presentation.departments || []).map((d) => String(d));
  return deptIds.includes(String(deptId));
};

const applyPreviewHeaders = (res, access) => {
  res.setHeader('X-Subscription-Plan', String(access?.plan || 'basic'));
  res.setHeader('X-Allow-Copy', access?.allow_copy ? 'true' : 'false');
  res.setHeader('X-Preview-Page-Limit', access?.preview_page_limit ? String(access.preview_page_limit) : 'full');
};

const sendPdfResponse = async (res, buffer, access) => {
  const output = access?.preview_page_limit ? await subsetPdfBuffer(buffer, access.preview_page_limit) : buffer;
  applyPreviewHeaders(res, access);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  return res.send(output);
};

exports.getAll = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(10, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    const deptId = req.user?.dpt_id || null;
    const program = String(req.user?.program || 'HND').toUpperCase();
    const accessQuery = deptId
      ? { program, $or: [{ audience: 'GENERAL' }, { departments: deptId }] }
      : { program, audience: 'GENERAL' };

    const [presentations, total] = await Promise.all([
      Presentation.find(accessQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('report_id', 'title')
        .lean(),
      Presentation.countDocuments(accessQuery),
    ]);

    const formatted = presentations.map((p) => ({
      presentation_id: p._id,
      presentation_title: p.title,
      presenter_name: p.presenter_name,
      presenter_email: p.presenter_email,
      file_path: p.file_path,
      upload_date: p.createdAt,
      program: String(p.program || 'HND').toUpperCase(),
      report_id: p.report_id?._id,
      report_title: p.report_id?.title || null,
      subscription_access: p.subscription_access || null,
    }));

    res.json({
      success: true,
      presentations: formatted,
      pagination: { page, limit, total },
    });
  } catch (err) {
    console.error('[Presentations] Error:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve presentations' });
  }
};

exports.downloadFile = async (req, res) => {
  const requested = decodeURIComponent(req.params.filename || '');
  if (!requested) return res.status(400).json({ success: false, message: 'Invalid filename' });

  const program = String(req.user?.program || 'HND').toUpperCase();
  const presentation = await Presentation.findOne({ file_path: requested, program })
    .select('audience departments title subscription_access')
    .lean();
  if (!presentation) return res.status(404).json({ success: false, message: 'File not found' });

  const deptId = req.user?.dpt_id || null;
  if (!canAccessPresentation(presentation, deptId)) {
    return res.status(403).json({ success: false, message: 'Not authorized to access this presentation' });
  }

  const candidate = await User.findOne({ cand_id: req.user?.cand_id }).select('cand_id subscription').lean();
  const access = await getMaterialAccessSummary({
    user: { cand_id: req.user?.cand_id, subscription: candidate?.subscription || null },
    materialType: 'presentation',
    resourceId: presentation._id,
    doc: presentation,
  });

  if (!access.allow_download) {
    if (access.plan === 'basic') {
      return res.status(403).json({
        success: false,
        code: 'PLAN_UPGRADE_REQUIRED',
        message: 'Basic plan cannot download presentations. Upgrade to Pro to unlock downloads.',
      });
    }
    return res.status(402).json({
      success: false,
      code: 'PAYMENT_REQUIRED',
      message: 'PAYGO download requires a separate payment for this presentation.',
      payment_requirement: {
        title: 'Unlock presentation download',
        message: `Pay ${access.payment_required.download.amount} ${access.payment_required.download.currency} to download this presentation for 1 hour.`,
        action: 'download',
        amount: access.payment_required.download.amount,
        currency: access.payment_required.download.currency,
        resource_type: 'presentation',
        resource_id: String(presentation._id),
        purpose_code: access.payment_required.download.purpose_code,
        access_minutes: access.payment_required.download.access_minutes,
      },
    });
  }

  try {
    const userId = req.user?.cand_id;
    if (userId) {
      await History.create({
        user_id: String(userId),
        content_type: 'presentation',
        content_title: String(presentation?.title || requested),
        action: 'download',
      });
    }
  } catch (_) {}

  if (/^https?:\/\//i.test(requested)) {
    const remoteName = sanitizeFilename(path.basename(requested)) || 'presentation';
    if (streamS3ToResponse(requested, res, 'attachment', remoteName)) return;
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  const filename = sanitizeFilename(requested);
  const filePath = path.join(PRESENTATION_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }
  res.download(filePath, filename);
};

exports.previewFile = async (req, res) => {
  const requested = decodeURIComponent(req.params.filename || '');
  if (!requested) return res.status(400).json({ success: false, message: 'Invalid filename' });
  console.log('[Presentations] Preview request received:', { requested });

  const program = String(req.user?.program || 'HND').toUpperCase();
  const presentation = await Presentation.findOne({ file_path: requested, program })
    .select('audience departments title subscription_access')
    .lean();
  if (!presentation) return res.status(404).json({ success: false, message: 'File not found' });

  const deptId = req.user?.dpt_id || null;
  if (!canAccessPresentation(presentation, deptId)) {
    return res.status(403).json({ success: false, message: 'Not authorized to access this presentation' });
  }

  const candidate = await User.findOne({ cand_id: req.user?.cand_id }).select('cand_id subscription').lean();
  const access = await getMaterialAccessSummary({
    user: { cand_id: req.user?.cand_id, subscription: candidate?.subscription || null },
    materialType: 'presentation',
    resourceId: presentation._id,
    doc: presentation,
  });

  try {
    const userId = req.user?.cand_id;
    if (userId) {
      await History.create({
        user_id: String(userId),
        content_type: 'presentation',
        content_title: String(presentation?.title || requested),
        action: 'preview',
      });
    }
  } catch (_) {}

  if (/^https?:\/\//i.test(requested)) {
    const ext = path.extname(requested).toLowerCase();
    console.log('[Presentations] Remote preview requested:', { requested, ext });
    if (ext !== '.pdf' && ext !== '.ppt' && ext !== '.pptx') {
      return res.status(400).json({ success: false, message: 'Preview for remote presentation files only supports PDF, PPT, and PPTX' });
    }

    if (ext === '.pdf') {
      const key = getS3KeyFromValue(requested);
      if (!key) return res.status(404).json({ success: false, message: 'File not found' });
      const buffer = await streamToBuffer(getS3ObjectStream(key));
      return sendPdfResponse(res, buffer, access);
    }

    const remoteName = sanitizeFilename(path.basename(requested)) || `presentation${ext}`;
    const sourcePath = path.join(PDF_DIR, remoteName);
    const pdfName = remoteName.replace(/\.(ppt|pptx)$/i, '.pdf');
    const pdfPath = path.join(PDF_DIR, pdfName);
    console.log('[Presentations] Remote preview conversion paths:', {
      remoteName,
      sourcePath,
      pdfPath,
      cachedPdfExists: fs.existsSync(pdfPath),
    });

    try {
      if (!fs.existsSync(pdfPath)) {
        const downloaded = await writeS3ObjectToFile(requested, sourcePath);
        if (!downloaded) return res.status(404).json({ success: false, message: 'File not found' });
        await convertToPdf(path.resolve(sourcePath), path.resolve(PDF_DIR));
      }

      console.log('[Presentations] Checking converted PDF output:', {
        pdfPath,
        exists: fs.existsSync(pdfPath),
      });
      if (!fs.existsSync(pdfPath)) {
        return res.status(500).json({ success: false, message: 'PDF conversion failed' });
      }

      const buffer = await fs.promises.readFile(pdfPath);
      return sendPdfResponse(res, buffer, access);
    } catch (err) {
      console.error('[Presentations] Remote preview conversion error:', err);
      return res.status(500).json({ success: false, message: 'Failed to convert presentation to PDF' });
    } finally {
      fs.promises.unlink(sourcePath).catch(() => {});
    }
  }

  const filename = sanitizeFilename(requested);
  const inputPath = path.join(PRESENTATION_DIR, filename);
  const resolvedInputPath = path.resolve(inputPath);
  if (!resolvedInputPath.startsWith(path.resolve(PRESENTATION_DIR))) {
    return res.status(400).json({ error: 'Invalid file path' });
  }
  if (!fs.existsSync(resolvedInputPath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  const ext = path.extname(filename).toLowerCase();
  if (ext !== '.ppt' && ext !== '.pptx' && ext !== '.pdf') {
    return res.status(400).json({ success: false, message: 'Unsupported file type for preview' });
  }

  if (ext === '.pdf') {
    const buffer = await fs.promises.readFile(inputPath);
    return sendPdfResponse(res, buffer, access);
  }

  const pdfName = filename.replace(/\.(ppt|pptx)$/i, '.pdf');
  const pdfPath = path.join(PDF_DIR, pdfName);

  if (fs.existsSync(pdfPath)) {
    const buffer = await fs.promises.readFile(pdfPath);
    return sendPdfResponse(res, buffer, access);
  }

  try {
    await convertToPdf(path.resolve(resolvedInputPath), path.resolve(PDF_DIR));
  } catch (err) {
    const status = err.code === 'QUEUE_FULL' ? 503 : 500;
    console.error('[Presentations] Local preview conversion error:', err);
    return res.status(status).json({
      success: false,
      message: err.code === 'QUEUE_FULL'
        ? 'Preview service is currently busy. Please retry shortly.'
        : 'Failed to convert presentation to PDF',
    });
  }

  if (!fs.existsSync(pdfPath)) {
    return res.status(500).json({ success: false, message: 'PDF conversion failed' });
  }

  const buffer = await fs.promises.readFile(pdfPath);
  return sendPdfResponse(res, buffer, access);
};
