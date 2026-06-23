/**
 * Reports Controller - view and download
 */
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

const REPORT_DIR = path.join(__dirname, '../uploads/reports');
const PREVIEW_CACHE_DIR = path.join(os.tmpdir(), 'hnd-preview', 'reports');
const PDF_DIR = path.join(PREVIEW_CACHE_DIR, 'pdfs');
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });

const LO_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'libreoffice',
  'soffice',
];
const COMMAND_CANDIDATES = LO_PATHS.filter((p) => p.includes('\\') ? fs.existsSync(p) : true);
const LIBREOFFICE_TIMEOUT_MS = 30000;

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
    console.error('[ViewReport] S3 stream error:', err.message);
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

  console.log('[ViewReport] Downloading remote file for preview conversion:', {
    key,
    destinationPath,
  });
  await fs.promises.mkdir(path.dirname(destinationPath), { recursive: true });
  const readStream = getS3ObjectStream(key);
  const writeStream = fs.createWriteStream(destinationPath);
  await pipeline(readStream, writeStream);
  console.log('[ViewReport] Remote file downloaded for preview conversion:', {
    destinationPath,
    exists: fs.existsSync(destinationPath),
  });
  return true;
};

const runLibreOfficeConvert = (command, sourcePath, outputDir) =>
  new Promise((resolve, reject) => {
    const args = ['--headless', '--convert-to', 'pdf', sourcePath, '--outdir', outputDir];
    console.log('[ViewReport] Starting LibreOffice conversion:', {
      command,
      sourcePath,
      outputDir,
      args,
    });
    const child = spawn(command, args, { windowsHide: true });
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      child.kill('SIGTERM');
      reject(new Error(`LibreOffice conversion timed out after ${LIBREOFFICE_TIMEOUT_MS}ms`));
    }, LIBREOFFICE_TIMEOUT_MS);

    let stderr = '';
    child.stderr.on('data', (buf) => {
      stderr += buf.toString();
    });

    child.on('error', (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.error('[ViewReport] LibreOffice spawn error:', {
        command,
        message: err.message,
      });
      reject(err);
    });
    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      console.log('[ViewReport] LibreOffice conversion finished:', {
        command,
        code,
        stderr,
      });
      if (code !== 0) return reject(new Error(stderr || `LibreOffice exited with code ${code}`));
      return resolve();
    });
  });

const convertToPdf = async (sourcePath, outputDir) => {
  const sourceExt = path.extname(String(sourcePath || '')).toLowerCase();
  if (sourceExt !== '.doc' && sourceExt !== '.docx') {
    throw new Error('Only DOC and DOCX files are supported for conversion');
  }

  return enqueueLibreOfficeJob(`report:${path.basename(sourcePath)}`, async () => {
    let lastError;
    for (const command of COMMAND_CANDIDATES) {
      try {
        await runLibreOfficeConvert(command, sourcePath, outputDir);
        console.log('[ViewReport] LibreOffice conversion succeeded:', {
          command,
          sourcePath,
          outputDir,
        });
        return;
      } catch (err) {
        lastError = err;
        console.error('[ViewReport] LibreOffice conversion attempt failed:', {
          command,
          message: err.message,
        });
      }
    }
    throw lastError || new Error('LibreOffice command not available');
  });
};

const canAccessReport = (report, deptId) => {
  if (!report) return false;
  const aud = String(report.audience || '').toUpperCase();
  if (aud === 'GENERAL') return true;
  if (!deptId) return false;
  const deptIds = (report.departments || []).map((d) => String(d));
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

const buildDownloadPaymentRequired = (report, access) => ({
  success: false,
  code: 'PAYMENT_REQUIRED',
  message: 'PAYGO download requires a separate payment for this report.',
  payment_requirement: {
    title: 'Unlock report download',
    message: `Pay ${access.payment_required.download.amount} ${access.payment_required.download.currency} to download this report for 1 hour.`,
    action: 'download',
    amount: access.payment_required.download.amount,
    currency: access.payment_required.download.currency,
    resource_type: 'report',
    resource_id: String(report._id),
    purpose_code: access.payment_required.download.purpose_code,
    access_minutes: access.payment_required.download.access_minutes,
  },
});

exports.getAll = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, Math.max(10, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    // Get department ID from JWT token
    const deptId = req.user?.dpt_id || null;
    const program = String(req.user?.program || 'HND').toUpperCase();
    const accessQuery = deptId
      ? { program, $or: [{ audience: 'GENERAL' }, { departments: deptId }] }
      : { program, audience: 'GENERAL' };

    const [reports, total] = await Promise.all([
      Report.find(accessQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('title writer_names writer_email upload_date keywords description location pages file_path program subscription_access departments material_price project_github_url')
        .populate('departments', 'department_name')
        .lean(),
      Report.countDocuments(accessQuery),
    ]);

    return res.json({
      reports: reports.map((r) => ({
        ...r,
        program: String(r.program || 'HND').toUpperCase(),
        report_id: r._id,
        upload_date: r.createdAt,
        subscription_access: r.subscription_access || null,
        material_price: r.material_price ?? null,
        project_github_url: r.project_github_url || null,
        departments: (Array.isArray(r.departments)
          ? r.departments.map((d) => ({
              dpt_id: d._id?.toString?.() || String(d),
              dpt_name: d.department_name || '',
            }))
          : []),
        department_ids: Array.isArray(r.departments)
          ? r.departments.map((d) => d._id?.toString?.() || String(d))
          : [],
      })),
      pagination: { page, limit, total },
    });
  } catch (err) {
    console.error('[ViewReport] Error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch reports' });
  }
};

exports.downloadFile = async (req, res) => {
  try {
    const requested = decodeURIComponent(req.params.filename || '');
    if (!requested) return res.status(400).json({ success: false, message: 'Invalid filename' });

    const program = String(req.user?.program || 'HND').toUpperCase();
    const report = await Report.findOne({ file_path: requested, program }).select('audience departments title subscription_access material_price').lean();
    if (!report) return res.status(404).json({ success: false, message: 'File not found' });

    const deptId = req.user?.dpt_id || null;
    if (!canAccessReport(report, deptId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this report' });
    }

    const candidate = await User.findOne({ cand_id: req.user?.cand_id }).select('cand_id subscription').lean();
    const access = await getMaterialAccessSummary({
      user: { cand_id: req.user?.cand_id, subscription: candidate?.subscription || null },
      materialType: 'report',
      resourceId: report._id,
      doc: report,
    });

    if (!access.allow_download) {
      if (access.plan === 'basic') {
        return res.status(403).json({
          success: false,
          code: 'PLAN_UPGRADE_REQUIRED',
          message: 'Basic plan cannot download reports. Upgrade to Pro to unlock downloads.',
        });
      }
      return res.status(402).json(buildDownloadPaymentRequired(report, access));
    }

    const logDownload = async () => {
      try {
        const userId = req.user?.cand_id;
        if (!userId) return;
        await History.create({
          user_id: String(userId),
          content_type: 'report',
          content_title: String(report.title || requested),
          action: 'download',
        });
      } catch (_) {}
    };

    if (/^https?:\/\//i.test(requested)) {
      await logDownload();
      const remoteName = sanitizeFilename(path.basename(requested)) || 'report';
      if (streamS3ToResponse(requested, res, 'attachment', remoteName)) return;
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const filename = sanitizeFilename(requested);
    const filePath = path.join(REPORT_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    await logDownload();
    return res.download(filePath, filename);
  } catch (err) {
    console.error('[ViewReport] Download error:', err);
    return res.status(500).json({ success: false, message: 'Failed to download report' });
  }
};

exports.previewFile = (req, res) => {
  (async () => {
    const requested = decodeURIComponent(req.params.filename || '');
    if (!requested) return res.status(400).json({ success: false, message: 'Invalid filename' });
    console.log('[ViewReport] Preview request received:', { requested });

    const program = String(req.user?.program || 'HND').toUpperCase();
    const report = await Report.findOne({ file_path: requested, program }).select('audience departments title subscription_access material_price').lean();
    if (!report) return res.status(404).json({ success: false, message: 'File not found' });

    const deptId = req.user?.dpt_id || null;
    if (!canAccessReport(report, deptId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this report' });
    }

    const candidate = await User.findOne({ cand_id: req.user?.cand_id }).select('cand_id subscription').lean();
    const access = await getMaterialAccessSummary({
      user: { cand_id: req.user?.cand_id, subscription: candidate?.subscription || null },
      materialType: 'report',
      resourceId: report._id,
      doc: report,
    });

    const filePath = requested;
    const isRemote = /^https?:\/\//i.test(filePath);
    const filename = isRemote ? filePath : sanitizeFilename(filePath);

    try {
      const userId = req.user?.cand_id;
      if (userId) {
        await History.create({
          user_id: String(userId),
          content_type: 'report',
          content_title: String(report.title || filename),
          action: 'preview',
        });
      }
    } catch (_) {}

    if (isRemote) {
      const ext = path.extname(filename).toLowerCase();
      console.log('[ViewReport] Remote preview requested:', { filename, ext });
      if (ext !== '.pdf' && ext !== '.doc' && ext !== '.docx') {
        return res.status(400).json({ success: false, message: 'Preview for remote report files only supports PDF, DOC, and DOCX' });
      }

      if (ext === '.pdf') {
        const key = getS3KeyFromValue(filename);
        if (!key) return res.status(404).json({ success: false, message: 'File not found' });
        const buffer = await streamToBuffer(getS3ObjectStream(key));
        return sendPdfResponse(res, buffer, access);
      }

      const remoteName = sanitizeFilename(path.basename(filename)) || `report${ext}`;
      const sourcePath = path.join(PDF_DIR, remoteName);
      const pdfName = remoteName.replace(/\.(doc|docx)$/i, '.pdf');
      const pdfPath = path.join(PDF_DIR, pdfName);
      console.log('[ViewReport] Remote preview conversion paths:', {
        remoteName,
        sourcePath,
        pdfPath,
        cachedPdfExists: fs.existsSync(pdfPath),
      });

      try {
        if (!fs.existsSync(pdfPath)) {
          const downloaded = await writeS3ObjectToFile(filename, sourcePath);
          if (!downloaded) return res.status(404).json({ success: false, message: 'File not found' });
          await convertToPdf(path.resolve(sourcePath), path.resolve(PDF_DIR));
        }

        console.log('[ViewReport] Checking converted PDF output:', {
          pdfPath,
          exists: fs.existsSync(pdfPath),
        });
        if (!fs.existsSync(pdfPath)) {
          return res.status(500).json({ success: false, message: 'PDF conversion failed' });
        }

        const buffer = await fs.promises.readFile(pdfPath);
        return sendPdfResponse(res, buffer, access);
      } catch (err) {
        console.error('[ViewReport] Remote preview conversion error:', err);
        return res.status(500).json({ success: false, message: 'Failed to convert report to PDF' });
      } finally {
        fs.promises.unlink(sourcePath).catch(() => {});
      }
    }

    const inputPath = path.join(REPORT_DIR, filename);
    const resolvedInputPath = path.resolve(inputPath);
    if (!resolvedInputPath.startsWith(path.resolve(REPORT_DIR))) {
      return res.status(400).json({ error: 'Invalid file path' });
    }
    if (!fs.existsSync(resolvedInputPath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const ext = path.extname(filename).toLowerCase();
    if (ext === '.pdf') {
      const buffer = await fs.promises.readFile(inputPath);
      return sendPdfResponse(res, buffer, access);
    }
    if (ext !== '.doc' && ext !== '.docx') {
      return res.status(400).json({ success: false, message: 'Unsupported file type for preview' });
    }

    const pdfName = filename.replace(/\.(doc|docx)$/i, '.pdf');
    const pdfPath = path.join(PDF_DIR, pdfName);

    if (fs.existsSync(pdfPath)) {
      const buffer = await fs.promises.readFile(pdfPath);
      return sendPdfResponse(res, buffer, access);
    }

    try {
      await convertToPdf(path.resolve(resolvedInputPath), path.resolve(PDF_DIR));
    } catch (err) {
      const status = err.code === 'QUEUE_FULL' ? 503 : 500;
      console.error('[ViewReport] Local preview conversion error:', err);
      return res.status(status).json({
        success: false,
        message: err.code === 'QUEUE_FULL'
          ? 'Preview service is currently busy. Please retry shortly.'
          : 'Failed to convert report to PDF',
      });
    }

    if (!fs.existsSync(pdfPath)) {
      return res.status(500).json({ success: false, message: 'PDF conversion failed' });
    }

    const buffer = await fs.promises.readFile(pdfPath);
    return sendPdfResponse(res, buffer, access);
  })().catch((err) => {
    console.error('[ViewReport] Preview error:', err);
    return res.status(500).json({ success: false, message: 'Failed to preview report' });
  });
};
