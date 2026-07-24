/**
 * Admin Presentation Upload Controller
 */
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const User = require('../models/User');
const Department = require('../models/Department');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { sendBulkBcc } = require('../services/emailService');
const { sanitizeFilename } = require('../middlewares/requestValidation');
const { uploadFile } = require('../utils/s3Uploader');
const { sendBulkPushNotification, isWebPushConfigured } = require('../utils/webPush');
const { USER_PROGRAMS } = require('../constants/userConstants');
const CandidateProjectSubmission = require('../models/CandidateProjectSubmission');
const { enqueueLibreOfficeJob } = require('../services/libreOfficeQueue');
const { isCloudConvertConfigured, convertPresentationToPdf } = require('../utils/cloudConvertClient');

const ALLOWED_PROGRAMS = [
  USER_PROGRAMS.HND,
  USER_PROGRAMS.BTS,
  USER_PROGRAMS.LICENCE,
  USER_PROGRAMS.BACHELOR,
  USER_PROGRAMS.MASTERS,
  USER_PROGRAMS.MASTER,
];

const mapProgramToDepartmentTrack = (program) => {
  const normalized = String(program || '').trim().toUpperCase();
  if (['HND', 'BACHELOR', 'MASTERS'].includes(normalized)) return 'HND';
  if (['BTS', 'LICENCE', 'MASTER'].includes(normalized)) return 'BTS';
  return null;
};

const PRESENTATION_DIR = path.join(__dirname, '../uploads/presentations');
const PRESENTATION_PDF_DIR = path.join(PRESENTATION_DIR, 'pdfs');

const LO_PATHS = [
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  'libreoffice',
  'soffice',
];

const COMMAND_CANDIDATES = LO_PATHS.filter((p) => p.includes('\\') ? fs.existsSync(p) : true);

const safeUnlink = async (filePath) => {
  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
};

const parseOptionalPrice = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return Number.NaN;
  return parsed;
};

const parseGitHubUrl = (value) => {
  const raw = String(value ?? '').trim();
  return raw || null;
};

// PDF Conversion Functions
const runLibreOfficeConvert = (command, sourcePath, outputDir) =>
  new Promise((resolve, reject) => {
    const args = ['--headless', '--convert-to', 'pdf', sourcePath, '--outdir', outputDir];
    const child = spawn(command, args, { windowsHide: true });

    let stderr = '';
    child.stderr.on('data', (buf) => {
      stderr += buf.toString();
    });

    child.on('error', (err) => {
      reject(err);
    });

    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(stderr || `LibreOffice exited with code ${code}`));
      return resolve();
    });
  });

const convertToPdf = async (sourcePath, outputDir) => {
  return enqueueLibreOfficeJob(`presentation:${path.basename(sourcePath)}`, async () => {
    const ext = path.extname(sourcePath).toLowerCase();
    if (isCloudConvertConfigured() && ['.ppt', '.pptx'].includes(ext)) {
      try {
        return await convertPresentationToPdf({
          sourcePath: path.resolve(sourcePath),
          outputDir,
          outputName: path.basename(sourcePath),
        });
      } catch (err) {
        console.error('[AdminPresentation] CloudConvert conversion failed, falling back to LibreOffice:', err.message);
      }
    }

    let lastError;
    for (const command of COMMAND_CANDIDATES) {
      try {
        await runLibreOfficeConvert(command, sourcePath, outputDir);
        return;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error('LibreOffice command not available');
  });
};

// Background conversion job
const scheduleBackgroundConversion = (presentation, filePath) => {
  // Don't await - run in background
  setImmediate(async () => {
    try {
      const ext = path.extname(filePath).toLowerCase();
      
      // Only convert if it's a PPTX/PPT file
      if (ext !== '.ppt' && ext !== '.pptx') {
        console.log(`[Background] Skipping conversion for ${presentation._id}: not a PPTX/PPT file`);
        return;
      }

      // Check if file is local or remote
      if (/^https?:\/\//i.test(filePath)) {
        console.log(`[Background] Skipping conversion for ${presentation._id}: remote file (S3)`);
        return;
      }

      const filename = sanitizeFilename(path.basename(filePath));
      const sourcePath = path.join(PRESENTATION_DIR, filename);
      
      if (!fs.existsSync(sourcePath)) {
        console.log(`[Background] Cannot convert ${presentation._id}: source file not found`);
        return;
      }

      const pdfName = filename.replace(/\.(ppt|pptx)$/i, '.pdf');
      const pdfPath = path.join(PRESENTATION_PDF_DIR, pdfName);

      // Check if PDF already exists
      if (fs.existsSync(pdfPath)) {
        console.log(`[Background] PDF already exists for ${presentation._id}, skipping`);
        return;
      }

      // Ensure PDF directory exists
      if (!fs.existsSync(PRESENTATION_PDF_DIR)) {
        fs.mkdirSync(PRESENTATION_PDF_DIR, { recursive: true });
      }

      console.log(`[Background] Starting PDF conversion for presentation ${presentation._id} (${presentation.title})`);
      
      await convertToPdf(path.resolve(sourcePath), path.resolve(PRESENTATION_PDF_DIR));
      
      console.log(`[Background] PDF conversion completed successfully for ${presentation._id}`);
    } catch (err) {
      console.error(`[Background] PDF conversion failed for presentation ${presentation._id}: ${err.message}`);
    }
  });
};

exports.getReports = async (req, res) => {
  try {
    const program = String(req.query?.program || '').trim().toUpperCase();
    const query = ALLOWED_PROGRAMS.includes(program) ? { program } : {};
    const reports = await Report.find(query)
      .sort({ createdAt: -1 })
      .populate('departments', 'department_name')
      .select('title writer_names writer_email createdAt departments program')
      .lean();

    const formatted = reports.map((r) => ({
      report_id: r._id,
      title: r.title,
      writer_names: r.writer_names,
      writer_email: r.writer_email,
      program: String(r.program || 'HND').toUpperCase(),
      upload_date: r.createdAt,
      departments: (r.departments || []).map((d) => d.department_name).join(', '),
    }));

    res.json(formatted);
  } catch (err) {
    console.error('[Presentation] Get reports:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch reports' });
  }
};

exports.uploadPresentation = async (req, res) => {
  try {
    const { report_id, title, presenter_name, presenter_email, material_price, project_github_url, from_submission_id, notify, program, audience, dpt_id, dpt_ids, location, pages, description } = req.body;
    const normalizedProgram = String(program || 'HND').trim().toUpperCase();
    if (!ALLOWED_PROGRAMS.includes(normalizedProgram)) {
      return res.status(400).json({ success: false, message: 'Invalid program selected.' });
    }

    const normalizedAudience = String(audience || 'GENERAL').trim().toUpperCase();
    if (!['GENERAL', 'SINGLE', 'MULTIPLE'].includes(normalizedAudience)) {
      return res.status(400).json({ success: false, message: 'Audience must be GENERAL, SINGLE, or MULTIPLE.' });
    }

    const normalizedFromSubmissionId = String(from_submission_id || '').trim();
    const importFromSubmission = Boolean(normalizedFromSubmissionId);

    if (!title || !presenter_name || !presenter_email || (!req.file && !importFromSubmission)) {
      return res.status(400).json({ success: false, message: 'Missing required fields or file.' });
    }

    const parsedMaterialPrice = parseOptionalPrice(material_price);
    const finalDescription = String(description || '').trim() || null;
    if (Number.isNaN(parsedMaterialPrice)) {
      return res.status(400).json({ success: false, message: 'Material price must be a number greater than or equal to 0.' });
    }

    const parsedProjectGitHubUrl = parseGitHubUrl(project_github_url);

    let departmentIds = [];
    if (normalizedAudience === 'SINGLE' && dpt_id) {
      departmentIds = [String(dpt_id)];
    } else if (normalizedAudience === 'MULTIPLE' && dpt_ids) {
      try {
        departmentIds = typeof dpt_ids === 'string' ? JSON.parse(dpt_ids) : (Array.isArray(dpt_ids) ? dpt_ids : []);
      } catch (_) {
        departmentIds = [];
      }
    }

    if (normalizedAudience !== 'GENERAL' && departmentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Audience requires at least one department.' });
    }

    if (departmentIds.length) {
      const departmentTrack = mapProgramToDepartmentTrack(normalizedProgram);
      const matchedDepartments = await Department.countDocuments({ _id: { $in: departmentIds }, program: departmentTrack || normalizedProgram });
      if (matchedDepartments !== departmentIds.length) {
        return res.status(400).json({ success: false, message: 'Selected departments must belong to the chosen program track.' });
      }
    }

    if (report_id) {
      const linkedReport = await Report.findOne({ _id: report_id, program: normalizedProgram }).select('_id').lean();
      if (!linkedReport) {
        return res.status(400).json({ success: false, message: 'Linked report must belong to the chosen program.' });
      }
    }

    let linkedSubmission = null;
    let file_path = '';
    let finalLocation = String(location || '').trim();
    let finalPages = String(pages || '').trim();

    if (importFromSubmission) {
      if (!mongoose.Types.ObjectId.isValid(normalizedFromSubmissionId)) {
        return res.status(400).json({ success: false, message: 'Invalid project submission id.' });
      }

      linkedSubmission = await CandidateProjectSubmission.findById(normalizedFromSubmissionId);
      if (!linkedSubmission) {
        return res.status(404).json({ success: false, message: 'Project submission not found.' });
      }
      if (linkedSubmission.status !== 'approved') {
        return res.status(400).json({ success: false, message: 'Only approved project submissions can be converted.' });
      }
      if (linkedSubmission.submission_type !== 'presentation') {
        return res.status(400).json({ success: false, message: 'Selected project submission is not a presentation.' });
      }

      file_path = String(linkedSubmission.file_path || '').trim();
      finalLocation = finalLocation || String(linkedSubmission.location || '').trim();
      finalPages = finalPages || String(linkedSubmission.pages || '').trim();
      if (!file_path) {
        return res.status(400).json({ success: false, message: 'Project submission has no file to publish.' });
      }
    } else {
      console.log('[Presentation] Attempting S3 upload:', {
        fileName: req.file.originalname,
        mimeType: req.file.mimetype,
        fileSize: req.file.size || req.file.buffer.length,
        title: title,
        presenter: presenter_name,
      });

      file_path = req.file.filename;
      try {
        const upload = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, 'presentations');
        file_path = upload.url;

        console.log('[Presentation] S3 upload successful:', {
          fileName: req.file.originalname,
          s3Key: upload.key,
          s3Url: file_path,
          title: title,
        });
      } catch (uploadErr) {
        console.error('[Presentation] S3 upload failed:', {
          error: uploadErr.message,
          fileName: req.file.originalname,
          title: title,
          stack: uploadErr.stack,
        });
        return res.status(500).json({ success: false, message: 'Failed to upload presentation to S3' });
      }
    }

    const presentation = await Presentation.create({
      report_id: report_id || null,
      title: title.trim(),
      presenter_name: presenter_name.trim(),
      presenter_email: presenter_email.trim(),
      description: finalDescription,
      program: normalizedProgram,
      audience: normalizedAudience,
      departments: departmentIds,
      file_path: file_path,
      location: finalLocation || null,
      pages: finalPages || null,
      material_price: parsedMaterialPrice,
      project_github_url: parsedProjectGitHubUrl,
    });

    // Schedule background PDF conversion
    scheduleBackgroundConversion(presentation, file_path);

    if (linkedSubmission) {
      await CandidateProjectSubmission.deleteOne({ _id: linkedSubmission._id });
    }

    if (notify === 'true') {
      const users = await User.find({ program: normalizedProgram, email: { $exists: true, $ne: '' } })
        .select('email name push_subscription allow_push_notifications')
        .lean();
      const subject = `New Presentation Uploaded: ${title}`;
      const text = `A new ${normalizedProgram} presentation titled "${title}" has been uploaded.\n\nPresenter: ${presenter_name}\nEmail: ${presenter_email}\n\nAccess the platform to view/download.`;
      await sendBulkBcc(users, subject, text);

      // Send push notifications
      if (isWebPushConfigured) {
        const pushUsers = users.filter(u => u.allow_push_notifications && u.push_subscription);
        if (pushUsers.length) {
          await sendBulkPushNotification(
            pushUsers,
            'presentation',
            `New Presentation: ${title}`,
            `A new ${normalizedProgram} presentation "${title}" by ${presenter_name} has been uploaded.`,
            '/candidate/presentations',
            String(presentation._id)
          );
        }
      }
    }

    console.log('[Presentation] Upload completed successfully:', {
      presentationId: presentation._id,
      title: title,
      s3Url: file_path,
    });

    res.status(200).json({
      success: true,
      message: 'Presentation uploaded successfully',
      presentation_id: presentation._id,
    });
  } catch (err) {
    console.error('[Presentation] Upload error:', {
      error: err.message,
      title: req.body?.title,
      stack: err.stack,
    });
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.listPresentations = async (req, res) => {
  try {
    const program = String(req.query?.program || '').trim().toUpperCase();
    const query = ALLOWED_PROGRAMS.includes(program) ? { program } : {};
    const rows = await Presentation.find(query)
      .sort({ createdAt: -1 })
      .populate('report_id', 'title')
      .populate('departments', 'department_name')
      .lean();

    const formatted = rows.map((p) => ({
      presentation_id: p._id,
      title: p.title,
      description: p.description || null,
      presenter_name: p.presenter_name,
      presenter_email: p.presenter_email,
      file_path: p.file_path,
      program: String(p.program || 'HND').toUpperCase(),
      audience: p.audience || 'GENERAL',
      material_price: p.material_price ?? null,
      project_github_url: p.project_github_url || null,
      location: p.location || null,
      pages: p.pages || null,
      departments: (Array.isArray(p.departments) ? p.departments.map(d => ({ dpt_id: d._id, dpt_name: d.department_name })) : []),
      report_id: p.report_id?._id || null,
      report_title: p.report_id?.title || null,
      upload_date: p.createdAt,
    }));

    return res.json({ success: true, presentations: formatted });
  } catch (err) {
    console.error('[AdminPresentation] List error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch presentations' });
  }
};

exports.updatePresentation = async (req, res) => {
  try {
    const { id } = req.params;
    const { report_id, title, presenter_name, presenter_email, material_price, project_github_url, program, audience, dpt_id, dpt_ids, location, pages, description } = req.body;
    const normalizedProgram = String(program || 'HND').trim().toUpperCase();
    if (!ALLOWED_PROGRAMS.includes(normalizedProgram)) {
      return res.status(400).json({ success: false, message: 'Invalid program selected.' });
    }

    const normalizedAudience = String(audience || 'GENERAL').trim().toUpperCase();
    if (!['GENERAL', 'SINGLE', 'MULTIPLE'].includes(normalizedAudience)) {
      return res.status(400).json({ success: false, message: 'Audience must be GENERAL, SINGLE, or MULTIPLE.' });
    }

    if (!title || !presenter_name || !presenter_email) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    const parsedMaterialPrice = parseOptionalPrice(material_price);
    const finalDescription = String(description || '').trim() || null;
    if (Number.isNaN(parsedMaterialPrice)) {
      return res.status(400).json({ success: false, message: 'Material price must be a number greater than or equal to 0.' });
    }

    const parsedProjectGitHubUrl = parseGitHubUrl(project_github_url);

    let departmentIds = [];
    if (normalizedAudience === 'SINGLE' && dpt_id) {
      departmentIds = [String(dpt_id)];
    } else if (normalizedAudience === 'MULTIPLE' && dpt_ids) {
      try {
        departmentIds = typeof dpt_ids === 'string' ? JSON.parse(dpt_ids) : (Array.isArray(dpt_ids) ? dpt_ids : []);
      } catch (_) {
        departmentIds = [];
      }
    }

    if (normalizedAudience !== 'GENERAL' && departmentIds.length === 0) {
      return res.status(400).json({ success: false, message: 'Audience requires at least one department.' });
    }

    if (departmentIds.length) {
      const departmentTrack = mapProgramToDepartmentTrack(normalizedProgram);
      const matchedDepartments = await Department.countDocuments({ _id: { $in: departmentIds }, program: departmentTrack || normalizedProgram });
      if (matchedDepartments !== departmentIds.length) {
        return res.status(400).json({ success: false, message: 'Selected departments must belong to the chosen program track.' });
      }
    }

    if (report_id) {
      const linkedReport = await Report.findOne({ _id: report_id, program: normalizedProgram }).select('_id').lean();
      if (!linkedReport) {
        return res.status(400).json({ success: false, message: 'Linked report must belong to the chosen program.' });
      }
    }

    const pres = await Presentation.findById(id);
    if (!pres) return res.status(404).json({ success: false, message: 'Presentation not found.' });

    pres.title = String(title).trim();
    pres.presenter_name = String(presenter_name).trim();
    pres.presenter_email = String(presenter_email).trim();
    pres.description = finalDescription;
    pres.program = normalizedProgram;
    pres.audience = normalizedAudience;
    pres.departments = departmentIds;
    pres.report_id = report_id ? report_id : null;
    pres.material_price = parsedMaterialPrice;
    pres.project_github_url = parsedProjectGitHubUrl;
    pres.location = String(location || '').trim() || null;
    pres.pages = String(pages || '').trim() || null;
    await pres.save();

    return res.json({ success: true, message: 'Presentation updated successfully' });
  } catch (err) {
    console.error('[AdminPresentation] Update error:', err);
    return res.status(500).json({ success: false, message: 'Update failed.' });
  }
};

exports.deletePresentation = async (req, res) => {
  try {
    const { id } = req.params;

    const pres = await Presentation.findById(id).lean();
    if (!pres) return res.status(404).json({ success: false, message: 'Presentation not found.' });

    const presentationPath = String(pres.file_path || '');
    const isRemotePresentation = /^https?:\/\//i.test(presentationPath);
    if (!isRemotePresentation) {
      const filename = sanitizeFilename(presentationPath);
      if (filename) {
        const filePath = path.join(PRESENTATION_DIR, filename);
        await safeUnlink(filePath);

        const pdfName = filename.replace(/\.(ppt|pptx)$/i, '.pdf');
        if (pdfName !== filename) {
          const pdfPath = path.join(PRESENTATION_PDF_DIR, pdfName);
          await safeUnlink(pdfPath);
        }
      }
    }

    await Presentation.deleteOne({ _id: id });
    return res.json({ success: true, message: 'Presentation deleted successfully' });
  } catch (err) {
    console.error('[AdminPresentation] Delete error:', err);
    return res.status(500).json({ success: false, message: 'Delete failed.' });
  }
};

// Batch conversion endpoint - converts all presentations without PDFs
exports.batchConvertPresentations = async (req, res) => {
  try {
    // Ensure directories exist
    if (!fs.existsSync(PRESENTATION_PDF_DIR)) {
      fs.mkdirSync(PRESENTATION_PDF_DIR, { recursive: true });
    }

    const presentations = await Presentation.find({}).select('_id title file_path').lean();
    console.log(`[Batch] Starting conversion for ${presentations.length} presentations`);

    let converted = 0;
    let skipped = 0;
    let failed = 0;
    const results = [];

    // Process presentations sequentially to avoid overwhelming LibreOffice
    for (const p of presentations) {
      try {
        const filePath = p.file_path;
        const isS3 = /^https?:\/\//i.test(filePath);
        const filename = sanitizeFilename(path.basename(filePath));
        const pdfName = filename.replace(/\.(ppt|pptx)$/i, '.pdf');
        const pdfPath = path.join(PRESENTATION_PDF_DIR, pdfName);

        // Skip if PDF already exists
        if (fs.existsSync(pdfPath)) {
          skipped++;
          results.push({ id: p._id, title: p.title, status: 'skipped', reason: 'PDF already exists' });
          continue;
        }

        let sourcePath;

        if (isS3) {
          // For S3 files, the thumbnail endpoint will handle conversion on-demand
          // So we can skip batch conversion for S3 files
          skipped++;
          results.push({ id: p._id, title: p.title, status: 'skipped', reason: 'S3 file (on-demand conversion)' });
          continue;
        } else {
          // Use local file
          sourcePath = path.join(PRESENTATION_DIR, filename);
          if (!fs.existsSync(sourcePath)) {
            failed++;
            results.push({ id: p._id, title: p.title, status: 'failed', reason: 'Local file not found' });
            continue;
          }
        }

        // Convert to PDF
        await convertToPdf(path.resolve(sourcePath), path.resolve(PRESENTATION_PDF_DIR));
        converted++;
        results.push({ id: p._id, title: p.title, status: 'converted' });
        console.log(`[Batch] ✅ Converted: ${p.title}`);
      } catch (err) {
        failed++;
        results.push({ id: p._id, title: p.title, status: 'error', reason: err.message });
        console.error(`[Batch] ❌ Failed: ${p.title} - ${err.message}`);
      }
    }

    console.log(`[Batch] Complete: ${converted} converted, ${skipped} skipped, ${failed} failed`);
    
    return res.json({
      success: true,
      message: 'Batch conversion completed',
      summary: {
        total: presentations.length,
        converted,
        skipped,
        failed,
      },
      results,
    });
  } catch (err) {
    console.error('[Batch] Fatal error:', err);
    return res.status(500).json({ success: false, message: 'Batch conversion failed', error: err.message });
  }
};
