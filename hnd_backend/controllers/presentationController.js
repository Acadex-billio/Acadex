/**
 * Presentations Controller
 */
const Presentation = require('../models/Presentation');
const Report = require('../models/Report');
const History = require('../models/History');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { pipeline } = require('stream/promises');
const { sanitizeFilename } = require('../middlewares/requestValidation');
const { getS3ObjectStream } = require('../utils/s3Uploader');
const { getMaterialAccessSummary } = require('../utils/subscriptionUtils');
const { streamToBuffer, subsetPdfBuffer, cropPdfFirstPageHalf } = require('../utils/pdfAccess');
const { enqueueLibreOfficeJob } = require('../services/libreOfficeQueue');
const { renderPdfFirstPageToPng } = require('../utils/pdfToImage');
const { requestConverter } = require('../utils/converterClient');

const PRESENTATION_DIR = path.join(__dirname, '../uploads/presentations');
const PRESENTATION_PDF_DIR = path.join(PRESENTATION_DIR, 'pdfs');
const THUMBNAIL_DIR = path.join(PRESENTATION_DIR, 'thumbnails');
// Use the same PDF directory as admin controller
const PDF_DIR = PRESENTATION_PDF_DIR;
if (!fs.existsSync(PDF_DIR)) fs.mkdirSync(PDF_DIR, { recursive: true });
if (!fs.existsSync(THUMBNAIL_DIR)) fs.mkdirSync(THUMBNAIL_DIR, { recursive: true });

const LO_PATHS = [
  String(process.env.LIBREOFFICE_PATH || '').trim(),
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/usr/lib/libreoffice/program/soffice',
  '/usr/lib/libreoffice/program/libreoffice',
  '/snap/bin/soffice',
  '/snap/bin/libreoffice',
  'libreoffice',
  'soffice',
].filter(Boolean);
const COMMAND_CANDIDATES = LO_PATHS.filter((p) => {
  if (!p) return false;
  if (p.includes('\\') || p.startsWith('/')) return fs.existsSync(p);
  return true;
});

const resolveLibreOfficeCommand = () => {
  if (COMMAND_CANDIDATES.length === 0) {
    return null;
  }

  return COMMAND_CANDIDATES[0];
};

// Program groups: English vs French
const PROGRAM_GROUPS = {
  ENGLISH: ['HND', 'BACHELOR', 'MASTERS'],
  FRENCH: ['BTS', 'LICENCE', 'MASTER'],
};

// Helper to get program group
const getProgramGroup = (program) => {
  const prog = String(program || 'HND').toUpperCase();
  if (PROGRAM_GROUPS.ENGLISH.includes(prog)) return 'ENGLISH';
  if (PROGRAM_GROUPS.FRENCH.includes(prog)) return 'FRENCH';
  return null;
};

// Helper to get all programs in the user's group
const getUserProgramsInGroup = (userProgram) => {
  const group = getProgramGroup(userProgram);
  return group === 'ENGLISH' ? PROGRAM_GROUPS.ENGLISH : PROGRAM_GROUPS.FRENCH;
};

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

const convertToPdf = async (sourcePath, outputDir, options = {}) => {
  const { sourceUrl, outputName } = options;
  const remoteConverterBaseUrl = String(process.env.CONVERTER_BASE_URL || '').trim().replace(/\/$/, '');
  const remoteConverterSecret = String(process.env.CONVERTER_SECRET || '').trim();
  const localCommand = resolveLibreOfficeCommand();

  if (localCommand) {
    console.log('[Presentations] Using local LibreOffice for PDF conversion:', {
      command: localCommand,
      sourcePath,
      outputDir,
      outputName,
    });

    return enqueueLibreOfficeJob(`presentation:${path.basename(sourcePath)}`, async () => {
      let lastError;
      for (const command of [localCommand, ...COMMAND_CANDIDATES.filter((candidate) => candidate !== localCommand)]) {
        try {
          await runLibreOfficeConvert(command, sourcePath, outputDir);
          console.log('[Presentations] LibreOffice conversion succeeded:', {
            command,
            sourcePath,
            outputDir,
          });
          return path.join(outputDir, path.basename(sourcePath).replace(/\.(ppt|pptx)$/i, '.pdf'));
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
  }

  if (remoteConverterBaseUrl && remoteConverterSecret && sourceUrl) {
    console.log('[Presentations] Using remote converter service for PDF conversion:', {
      sourceUrl,
      outputDir,
      outputName,
    });

    try {
      const result = await requestConverter({
        sourceUrl,
        format: 'pdf',
        outputName: outputName || path.basename(sourcePath),
      });

      const fileName = String(outputName || path.basename(sourcePath) || 'converted.pdf').replace(/\.[^.]+$/, '.pdf');
      const destinationPath = path.join(outputDir, fileName);
      await fs.promises.writeFile(destinationPath, result.buffer);
      console.log('[Presentations] Remote converter returned PDF:', {
        destinationPath,
        size: result.buffer.length,
      });
      return destinationPath;
    } catch (err) {
      console.error('[Presentations] Remote converter failed:', {
        message: err.message,
        status: err.response?.status,
        sourceUrl,
        outputName,
      });
    }
  }

  throw new Error('LibreOffice conversion is unavailable and no remote converter is configured');
};
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

const convertPdfToThumbnail = async (pdfPath, outputDir, options = {}) => {
  const thumbnailName = path.basename(pdfPath).replace(/\.pdf$/i, '_thumb.png');
  const outputPath = path.join(outputDir, thumbnailName);

  // Check if thumbnail already exists
  if (fs.existsSync(outputPath)) {
    return outputPath;
  }

  try {
    await renderPdfFirstPageToPng(pdfPath, outputPath, {
      scale: 1.5,
      maxWidth: 340,
      maxHeight: 160,
      ...options,
    });
    return outputPath;
  } catch (err) {
    console.error('[Presentations] Thumbnail generation failed:', {
      pdfPath,
      error: err.message,
    });
    throw err;
  }
};

const sendThumbnailFile = (res, thumbnailPath) => {
  try {
    const size = fs.statSync(thumbnailPath).size;
    console.log('[Presentations] Serving thumbnail file:', { thumbnailPath, size });
    
    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Content-Length', size);

    const fileStream = fs.createReadStream(thumbnailPath);
    fileStream.on('error', (err) => {
      console.error('[Presentations] Thumbnail stream error:', err.message);
      if (!res.headersSent) {
        res.status(500).send('Thumbnail unavailable');
      }
    });
    return fileStream.pipe(res);
  } catch (err) {
    console.error('[Presentations] sendThumbnailFile error:', { thumbnailPath, error: err.message });
    if (!res.headersSent) {
      res.status(500).send('Thumbnail unavailable');
    }
  }
};

const sendThumbnailPlaceholder = (res, message = 'Preview unavailable') => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  return res.send(
    `<svg width="340" height="160" xmlns="http://www.w3.org/2000/svg"><rect width="340" height="160" fill="#f0f8f5"/><text x="50%" y="50%" font-size="12" fill="#9ca3af" text-anchor="middle" dy=".3em">${message}</text></svg>`
  );
};

const canAccessPresentation = (presentation, userProgram, deptId) => {
  if (!presentation) return false;
  
  // Check if user is in the same program group
  const userProgramsInGroup = getUserProgramsInGroup(userProgram);
  if (!userProgramsInGroup.includes(String(presentation.program).toUpperCase())) {
    return false;
  }

  // Check audience access within the group
  const aud = String(presentation.audience || 'GENERAL').toUpperCase();
  if (aud === 'GENERAL') return true;
  if (!deptId) return false;
  const deptIds = (presentation.departments || []).map((d) => String(d._id || d));
  return deptIds.includes(String(deptId));
};

const applyPreviewHeaders = (res, access) => {
  res.setHeader('X-Subscription-Plan', String(access?.plan || 'basic'));
  res.setHeader('X-Allow-Copy', access?.allow_copy ? 'true' : 'false');
  res.setHeader('X-Preview-Page-Limit', access?.preview_page_limit ? String(access.preview_page_limit) : 'full');
};

const sendPdfResponse = async (res, buffer, access) => {
  let output = buffer;
  if (access?.preview_page_limit) {
    output = await subsetPdfBuffer(buffer, access.preview_page_limit);
    if (access.preview_page_limit === 1) {
      output = await cropPdfFirstPageHalf(output);
    }
  }
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
    const userProgram = String(req.user?.program || 'HND').toUpperCase();
    const userProgramGroup = getUserProgramsInGroup(userProgram);

    // Query presentations for all programs in the user's language group
    const accessQuery = deptId
      ? { program: { $in: userProgramGroup }, $or: [{ audience: 'GENERAL' }, { departments: deptId }] }
      : { program: { $in: userProgramGroup }, audience: 'GENERAL' };

    const [presentations, total] = await Promise.all([
      Presentation.find(accessQuery)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate({
          path: 'report_id',
          select: 'title departments pages',
          populate: { path: 'departments', select: 'department_name' },
        })
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
      audience: String(p.audience || 'GENERAL').toUpperCase(),
      material_price: p.material_price ?? null,
      project_github_url: p.project_github_url || null,
      report_id: p.report_id?._id,
      report_title: p.report_id?.title || null,
      report_pages: p.report_id?.pages || null,
      description: p.description || null,
      report_departments: (Array.isArray(p.report_id?.departments)
        ? p.report_id.departments.map((d) => ({
            dpt_id: d._id?.toString?.() || String(d),
            dpt_name: d.department_name || '',
          }))
        : []),
      department_ids: Array.isArray(p.report_id?.departments)
        ? p.report_id.departments.map((d) => d._id?.toString?.() || String(d))
        : [],
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

  const userProgram = String(req.user?.program || 'HND').toUpperCase();
  const userProgramGroup = getUserProgramsInGroup(userProgram);
  const presentation = await Presentation.findOne({ file_path: requested, program: { $in: userProgramGroup } })
    .select('audience departments title subscription_access material_price program')
    .lean();
  if (!presentation) return res.status(404).json({ success: false, message: 'File not found' });

  const deptId = req.user?.dpt_id || null;
  if (!canAccessPresentation(presentation, userProgram, deptId)) {
    return res.status(403).json({ success: false, message: 'Not authorized to access this presentation' });
  }

  const candidate = await User.findOne({ cand_id: req.user?.cand_id }).select('cand_id subscription').lean();
  const user = await User.findOne({ cand_id: req.user?.cand_id }).select('_id cand_id subscription').lean();
  if (!user) return res.status(401).json({ success: false, message: 'User not found' });

  // Check if user has an active grant for download access to this material
  const hasGrantedAccess = await materialAccessService.hasActiveAccess(
    user._id,
    presentation._id,
    'presentation',
    'download'
  );

  if (!hasGrantedAccess) {
    // No active grant, check subscription plan
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

  const userProgram = String(req.user?.program || 'HND').toUpperCase();
  const userProgramGroup = getUserProgramsInGroup(userProgram);
  const presentation = await Presentation.findOne({ file_path: requested, program: { $in: userProgramGroup } })
    .select('audience departments title subscription_access material_price program')
    .lean();
  if (!presentation) return res.status(404).json({ success: false, message: 'File not found' });

  const deptId = req.user?.dpt_id || null;
  if (!canAccessPresentation(presentation, userProgram, deptId)) {
    return res.status(403).json({ success: false, message: 'Not authorized to access this presentation' });
  }

  const candidate = await User.findOne({ cand_id: req.user?.cand_id }).select('cand_id subscription').lean();
  const user = await User.findOne({ cand_id: req.user?.cand_id }).select('_id cand_id subscription').lean();
  if (!user) return res.status(401).json({ success: false, message: 'User not found' });

  // Check if user has an active grant for preview access to this material
  const hasGrantedAccess = await materialAccessService.hasActiveAccess(
    user._id,
    presentation._id,
    'presentation',
    'preview'
  );

  let access;
  if (hasGrantedAccess) {
    access = {
      plan: 'grant',
      allow_preview: true,
      allow_download: true,
      allow_copy: false,
      preview_page_limit: null,
      payment_required: {},
    };
  } else {
    access = await getMaterialAccessSummary({
      user: { cand_id: req.user?.cand_id, subscription: candidate?.subscription || null },
      materialType: 'presentation',
      resourceId: presentation._id,
      doc: presentation,
    });
  }

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
      // Prefer a pre-generated preview PDF stored in S3.
      try {
        const remoteKey = getS3KeyFromValue(requested);
        if (remoteKey) {
          const remoteBase = path.basename(remoteKey, ext).replace(/\.[^.]+$/, '');
          const previewPdfS3Key = `presentations/previews/${remoteBase}.pdf`;
          console.log('[Presentations] Attempting to stream preview PDF from S3:', { previewPdfS3Key });
          const previewBuffer = await streamToBuffer(getS3ObjectStream(previewPdfS3Key));
          if (previewBuffer?.length) {
            console.log('[Presentations] Serving pre-generated preview PDF from S3:', { previewPdfS3Key });
            return sendPdfResponse(res, previewBuffer, access);
          }
        }
      } catch (_) {}

      if (!fs.existsSync(pdfPath)) {
        const downloaded = await writeS3ObjectToFile(requested, sourcePath);
        if (!downloaded) return res.status(404).json({ success: false, message: 'File not found' });
        await convertToPdf(path.resolve(sourcePath), path.resolve(PDF_DIR), {
          sourceUrl: requested,
          outputName: remoteName,
        });
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

exports.getThumbnail = async (req, res) => {
  const requested = decodeURIComponent(req.params.filename || '');
  if (!requested) return res.status(400).json({ success: false, message: 'Invalid filename' });

  try {
    const userProgram = String(req.user?.program || 'HND').toUpperCase();
    const userProgramGroup = getUserProgramsInGroup(userProgram);
    const presentation = await Presentation.findOne({ file_path: requested, program: { $in: userProgramGroup } })
      .select('audience departments title program')
      .lean();
    if (!presentation) return res.status(404).json({ success: false, message: 'File not found' });

    const deptId = req.user?.dpt_id || null;
    if (!canAccessPresentation(presentation, userProgram, deptId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this presentation' });
    }

    // For remote S3 files, generate thumbnail on-demand
    if (/^https?:\/\//i.test(requested)) {
      const remoteName = sanitizeFilename(path.basename(requested)) || 'presentation';
      const ext = path.extname(remoteName).toLowerCase();
      const baseName = path.basename(remoteName, ext);
      const pptxPath = path.join(PDF_DIR, `${baseName}_temp${ext}`);
      const pdfName = `${baseName}.pdf`;
      const pdfPath = path.join(PDF_DIR, pdfName);
      const thumbnailName = pdfName.replace(/\.pdf$/i, '_thumb.png');
      const thumbnailPath = path.join(THUMBNAIL_DIR, thumbnailName);

      // Skip S3 thumbnail lookup - go straight to local generation
      // S3 cache was unreliable; local generation is more robust

      // Serve cached thumbnail if available (local)
      if (fs.existsSync(thumbnailPath)) {
        return sendThumbnailFile(res, thumbnailPath);
      }

      try {
        // If PDF doesn't exist, download PPTX from S3 and convert it
        if (!fs.existsSync(pdfPath)) {
          // Download PPTX from S3 if needed
          if (!fs.existsSync(pptxPath)) {
            console.log('[Presentations] Downloading S3 file for thumbnail:', { requested, pptxPath });
            const downloaded = await writeS3ObjectToFile(requested, pptxPath);
            if (!downloaded) {
              throw new Error('Failed to download file from S3');
            }
          }

          // Convert PPTX to PDF
          if (fs.existsSync(pptxPath)) {
            console.log('[Presentations] Converting S3 PPTX to PDF for thumbnail:', { pptxPath, pdfPath });
            await convertToPdf(path.resolve(pptxPath), path.resolve(PDF_DIR), {
              sourceUrl: requested,
              outputName: `${baseName}.pdf`,
            });
            
            // Handle LibreOffice naming: if _temp.pptx creates _temp.pdf, rename it to the expected name
            const pdfTempPath = pdfPath.replace(/\.pdf$/i, '_temp.pdf');
            if (fs.existsSync(pdfTempPath) && !fs.existsSync(pdfPath)) {
              console.log('[Presentations] Renaming PDF from temp name:', { pdfTempPath, pdfPath });
              fs.renameSync(pdfTempPath, pdfPath);
            }
          }
        }

        // Generate thumbnail from PDF
        if (fs.existsSync(pdfPath)) {
          console.log('[Presentations] Generating thumbnail from PDF:', { pdfPath, thumbnailPath });
          await convertPdfToThumbnail(pdfPath, THUMBNAIL_DIR);
          
          // Serve the generated thumbnail
          if (fs.existsSync(thumbnailPath)) {
            return sendThumbnailFile(res, thumbnailPath);
          }
        }
      } catch (err) {
        console.error('[Presentations] S3 thumbnail generation failed:', {
          requested,
          error: err.message,
        });
      }

      // Return placeholder if generation failed
      return sendThumbnailPlaceholder(res, 'Preview unavailable');
    }

    // For local files, generate/serve thumbnail
    const filename = sanitizeFilename(requested);
    const pdfName = filename.replace(/\.(ppt|pptx)$/i, '.pdf');
    const pdfPath = path.join(PDF_DIR, pdfName);
    const thumbnailName = pdfName.replace(/\.pdf$/i, '_thumb.png');
    const thumbnailPath = path.join(THUMBNAIL_DIR, thumbnailName);

    // Generate thumbnail if it doesn't exist
    if (!fs.existsSync(thumbnailPath)) {
      const inputPath = path.join(PRESENTATION_DIR, filename);
      const ext = path.extname(filename).toLowerCase();

      // Convert to PDF first if needed
      if (!fs.existsSync(pdfPath) && (ext === '.ppt' || ext === '.pptx')) {
        try {
          console.log('[Presentations] Converting to PDF for thumbnail:', { inputPath, pdfPath });
          await convertToPdf(path.resolve(inputPath), path.resolve(PDF_DIR));
        } catch (err) {
          console.error('[Presentations] PDF conversion for thumbnail failed:', err.message);
          return sendThumbnailPlaceholder(res, 'Preview unavailable');
        }
      }

      // Generate thumbnail from PDF
      if (fs.existsSync(pdfPath)) {
        try {
          console.log('[Presentations] Generating thumbnail:', { pdfPath, thumbnailPath });
          await convertPdfToThumbnail(pdfPath, THUMBNAIL_DIR);
        } catch (err) {
          console.error('[Presentations] Thumbnail generation failed:', err.message);
          return sendThumbnailPlaceholder(res, 'Preview unavailable');
        }
      }
    }

    // Serve generated thumbnail
    if (fs.existsSync(thumbnailPath)) {
      return sendThumbnailFile(res, thumbnailPath);
    }

    // Fallback placeholder
    return res.setHeader('Content-Type', 'image/svg+xml').send(
      '<svg width="340" height="160" xmlns="http://www.w3.org/2000/svg"><rect width="340" height="160" fill="#f0f8f5"/><text x="50%" y="50%" font-size="12" fill="#9ca3af" text-anchor="middle" dy=".3em">No Preview</text></svg>'
    );
  } catch (err) {
    console.error('[Presentations] Thumbnail endpoint error:', err.message);
    res.setHeader('Content-Type', 'image/svg+xml').send(
      '<svg width="340" height="160" xmlns="http://www.w3.org/2000/svg"><rect width="340" height="160" fill="#e5e7eb"/><text x="50%" y="50%" font-size="12" fill="#9ca3af" text-anchor="middle" dy=".3em">Error</text></svg>'
    );
  }
};
