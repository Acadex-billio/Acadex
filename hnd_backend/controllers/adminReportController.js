/**
 * Admin Report Upload Controller
 */
const Report = require('../models/Report');
const User = require('../models/User');
const Department = require('../models/Department');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const { uploadFile } = require('../utils/s3Uploader');
const { sendBulkBcc } = require('../services/emailService');
const { sanitizeFilename } = require('../middlewares/requestValidation');
const { sendBulkPushNotification, isWebPushConfigured } = require('../utils/webPush');
const { USER_PROGRAMS } = require('../constants/userConstants');
const CandidateProjectSubmission = require('../models/CandidateProjectSubmission');

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

const REPORT_DIR = path.join(__dirname, '../uploads/reports');
const REPORT_PDF_DIR = path.join(REPORT_DIR, 'pdfs');

const safeUnlink = async (filePath) => {
  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
};

const parseDptIds = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  try {
    const parsed = JSON.parse(val || '[]');
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (_) {
    return [];
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

exports.uploadReport = async (req, res) => {
  try {
    const {
      audience,
      dpt_id,
      dpt_ids,
      title,
      writer_names,
      writer_email,
      description,
      location,
      keywords,
      pages,
      material_price,
      project_github_url,
      from_submission_id,
      notify,
      program,
    } = req.body;
    const normalizedProgram = String(program || 'HND').trim().toUpperCase();
    if (!ALLOWED_PROGRAMS.includes(normalizedProgram)) {
      return res.status(400).json({ success: false, message: 'Invalid program selected.' });
    }


    const normalizedFromSubmissionId = String(from_submission_id || '').trim();
    const importFromSubmission = Boolean(normalizedFromSubmissionId);
    const normalizedLocation = String(location || '').trim();
    const normalizedPages = String(pages || '').trim();

    if (
      (!req.file && !importFromSubmission) ||
      !title ||
      !writer_names ||
      !writer_email ||
      !description ||
      !normalizedLocation ||
      !keywords ||
      !normalizedPages ||
      !audience
    ) {
      return res.status(400).json({ success: false, message: 'Missing required fields or file.' });
    }

    const parsedMaterialPrice = parseOptionalPrice(material_price);
    if (Number.isNaN(parsedMaterialPrice)) {
      return res.status(400).json({ success: false, message: 'Material price must be a number greater than or equal to 0.' });
    }

    const parsedProjectGitHubUrl = parseGitHubUrl(project_github_url);

    let targetDeptIds = [];
    if (audience === 'SINGLE') {
      if (!dpt_id) return res.status(400).json({ success: false, message: 'Missing dpt_id for SINGLE.' });
      targetDeptIds = [dpt_id];
    } else if (audience === 'MULTIPLE') {
      const parsed = parseDptIds(dpt_ids);
      if (!parsed.length) {
        return res.status(400).json({ success: false, message: 'Missing dpt_ids for MULTIPLE.' });
      }
      targetDeptIds = parsed;
    } else if (audience !== 'GENERAL') {
      return res.status(400).json({ success: false, message: 'Invalid audience value.' });
    }

    if (targetDeptIds.length) {
      const departmentTrack = mapProgramToDepartmentTrack(normalizedProgram);
      const matchedDepartments = await Department.countDocuments({ _id: { $in: targetDeptIds }, program: departmentTrack || normalizedProgram });
      if (matchedDepartments !== targetDeptIds.length) {
        return res.status(400).json({ success: false, message: 'Selected departments must belong to the chosen program.' });
      }
    }

    let filePath = '';
    let linkedSubmission = null;

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
      if (linkedSubmission.submission_type !== 'report') {
        return res.status(400).json({ success: false, message: 'Selected project submission is not a report.' });
      }

      filePath = String(linkedSubmission.file_path || '').trim();
      if (!filePath) {
        return res.status(400).json({ success: false, message: 'Project submission has no file to publish.' });
      }
    } else {
      filePath = req.file.filename;
      try {
        console.log('[AdminReport] Attempting S3 upload:', {
          fileName: req.file.originalname,
          mimeType: req.file.mimetype,
          fileSize: req.file.size || req.file.buffer.length,
          title: title,
          writer: writer_names,
        });

        const upload = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, 'reports');
        filePath = upload.url;

        console.log('[AdminReport] S3 upload successful:', {
          fileName: req.file.originalname,
          s3Key: upload.key,
          s3Url: filePath,
          title: title,
        });
      } catch (uploadErr) {
        console.error('[AdminReport] S3 upload failed:', {
          error: uploadErr.message,
          fileName: req.file.originalname,
          title: title,
          stack: uploadErr.stack,
        });
        return res.status(500).json({ success: false, message: 'Failed to upload report to S3' });
      }
    }

    const finalLocation = normalizedLocation || String(linkedSubmission?.location || '').trim();
    const finalPages = normalizedPages || String(linkedSubmission?.pages || '').trim();

    const report = await Report.create({
      title: title.trim(),
      writer_names: writer_names.trim(),
      writer_email: writer_email.trim(),
      keywords: keywords.trim(),
      description: description.trim(),
      location: finalLocation.trim(),
      pages: String(finalPages).trim(),
      file_path: filePath,
      program: normalizedProgram,
      audience,
      notify_candidates: notify === 'true',
      departments: targetDeptIds,
      material_price: parsedMaterialPrice,
      project_github_url: parsedProjectGitHubUrl,
    });

    if (linkedSubmission) {
      await CandidateProjectSubmission.deleteOne({ _id: linkedSubmission._id });
    }

    if (notify === 'true') {
      let users = [];
      if (audience === 'GENERAL') {
        users = await User.find({ program: normalizedProgram, email: { $exists: true, $ne: '' } }).select('name email push_subscription allow_push_notifications').lean();
      } else {
        users = await User.find({
          program: normalizedProgram,
          dpt_id: { $in: targetDeptIds },
          email: { $exists: true, $ne: '' },
        })
          .select('name email push_subscription allow_push_notifications')
          .lean();
      }
      const subject = 'New Report Uploaded';
      const text = `A new ${normalizedProgram} report titled "${title}" has been uploaded to the platform.\n\nAudience: ${audience}\n\n— Platform Team`;
      await sendBulkBcc(users, subject, text);

      // Send push notifications
      if (isWebPushConfigured) {
        const pushUsers = users.filter(u => u.allow_push_notifications && u.push_subscription);
        if (pushUsers.length) {
          await sendBulkPushNotification(
            pushUsers,
            'report',
            `New Report: ${title}`,
            `A new ${normalizedProgram} report "${title}" by ${writer_names} has been uploaded.`,
            '/candidate/reports',
            String(report._id)
          );
        }
      }
    }

    res.json({ success: true, report_id: report._id });
  } catch (err) {
    console.error('[ReportUpload] Error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.listReports = async (req, res) => {
  try {
    const program = String(req.query?.program || '').trim().toUpperCase();
    const query = ALLOWED_PROGRAMS.includes(program) ? { program } : {};
    const rows = await Report.find(query)
      .sort({ createdAt: -1 })
      .populate('departments', 'department_name abbreviation')
      .lean();

    const formatted = rows.map((r) => ({
      report_id: r._id,
      title: r.title,
      writer_names: r.writer_names,
      writer_email: r.writer_email,
      keywords: r.keywords,
      description: r.description,
      location: r.location,
      pages: r.pages,
      file_path: r.file_path,
      program: String(r.program || 'HND').toUpperCase(),
      audience: r.audience,
      notify_candidates: r.notify_candidates,
      material_price: r.material_price ?? null,
      project_github_url: r.project_github_url || null,
      departments: (r.departments || []).map((d) => ({
        dpt_id: (d && d._id ? d._id : d)?.toString?.() ?? String(d),
        department_name: (typeof d === 'object' && d?.department_name) || '',
        abbreviation: (typeof d === 'object' && d?.abbreviation) || '',
      })),
      upload_date: r.createdAt,
    }));

    return res.json({ success: true, reports: formatted });
  } catch (err) {
    console.error('[AdminReport] List error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch reports' });
  }
};

/**
 * List only report guides (is_guide = true)
 */
exports.listGuides = async (req, res) => {
  try {
    const program = String(req.query?.program || '').trim().toUpperCase();
    const query = { is_guide: true };
    if (ALLOWED_PROGRAMS.includes(program)) query.program = program;
    const rows = await Report.find(query)
      .sort({ createdAt: -1 })
      .populate('departments', 'department_name abbreviation')
      .lean();

    const formatted = rows.map((r) => ({
      report_id: r._id,
      title: r.title,
      writer_names: r.writer_names,
      writer_email: r.writer_email,
      keywords: r.keywords,
      description: r.description,
      location: r.location,
      pages: r.pages,
      file_path: r.file_path,
      program: String(r.program || 'HND').toUpperCase(),
      audience: r.audience,
      notify_candidates: r.notify_candidates,
      material_price: r.material_price ?? null,
      project_github_url: r.project_github_url || null,
      departments: (r.departments || []).map((d) => ({
        dpt_id: (d && d._id ? d._id : d)?.toString?.() ?? String(d),
        department_name: (typeof d === 'object' && d?.department_name) || '',
        abbreviation: (typeof d === 'object' && d?.abbreviation) || '',
      })),
      upload_date: r.createdAt,
    }));

    return res.json({ success: true, reports: formatted });
  } catch (err) {
    console.error('[AdminReport] List guides error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch report guides' });
  }
};

/**
 * Upload a report guide - similar to uploadReport but marks is_guide = true
 */
exports.uploadGuide = async (req, res) => {
  try {
    const {
      audience,
      dpt_id,
      dpt_ids,
      title,
      writer_names,
      writer_email,
      description,
      location,
      keywords,
      pages,
      program,
    } = req.body;
    const normalizedProgram = String(program || 'HND').trim().toUpperCase();
    if (!ALLOWED_PROGRAMS.includes(normalizedProgram)) {
      return res.status(400).json({ success: false, message: 'Invalid program selected.' });
    }

    if (!req.file || !title || !writer_names || !writer_email || !description || !location || !keywords || !pages || !audience) {
      return res.status(400).json({ success: false, message: 'Missing required fields or file.' });
    }

    let targetDeptIds = [];
    if (audience === 'SINGLE') {
      if (!dpt_id) return res.status(400).json({ success: false, message: 'Missing dpt_id for SINGLE.' });
      targetDeptIds = [dpt_id];
    } else if (audience === 'MULTIPLE') {
      const parsed = parseDptIds(dpt_ids);
      if (!parsed.length) {
        return res.status(400).json({ success: false, message: 'Missing dpt_ids for MULTIPLE.' });
      }
      targetDeptIds = parsed;
    }

    // Upload file to S3
    let filePath = '';
    try {
      const upload = await uploadFile(req.file.buffer, req.file.originalname, req.file.mimetype, 'reports');
      filePath = upload.url;
    } catch (uploadErr) {
      console.error('[AdminReport] Guide S3 upload failed:', uploadErr);
      return res.status(500).json({ success: false, message: 'Failed to upload guide to S3' });
    }

    const guide = await Report.create({
      title: title.trim(),
      writer_names: writer_names.trim(),
      writer_email: writer_email.trim(),
      keywords: keywords.trim(),
      description: description.trim(),
      location: String(location || '').trim(),
      pages: String(pages).trim(),
      file_path: filePath,
      program: normalizedProgram,
      audience,
      departments: targetDeptIds,
      is_guide: true,
    });

    return res.json({ success: true, report_id: guide._id });
  } catch (err) {
    console.error('[AdminReport] uploadGuide Error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.updateReport = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      audience,
      dpt_id,
      dpt_ids,
      title,
      writer_names,
      writer_email,
      description,
      location,
      keywords,
      pages,
      material_price,
      project_github_url,
      program,
    } = req.body;
    const normalizedProgram = String(program || 'HND').trim().toUpperCase();
    if (!ALLOWED_PROGRAMS.includes(normalizedProgram)) {
      return res.status(400).json({ success: false, message: 'Invalid program selected.' });
    }


    if (!title || !writer_names || !writer_email || !description || !location || !keywords || !pages || !audience) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    const parsedMaterialPrice = parseOptionalPrice(material_price);
    if (Number.isNaN(parsedMaterialPrice)) {
      return res.status(400).json({ success: false, message: 'Material price must be a number greater than or equal to 0.' });
    }

    const parsedProjectGitHubUrl = parseGitHubUrl(project_github_url);

    let targetDeptIds = [];
    if (audience === 'SINGLE') {
      if (!dpt_id) return res.status(400).json({ success: false, message: 'Missing dpt_id for SINGLE.' });
      targetDeptIds = [dpt_id];
    } else if (audience === 'MULTIPLE') {
      const parsed = parseDptIds(dpt_ids);
      if (!parsed.length) {
        return res.status(400).json({ success: false, message: 'Missing dpt_ids for MULTIPLE.' });
      }
      targetDeptIds = parsed;
    } else if (audience !== 'GENERAL') {
      return res.status(400).json({ success: false, message: 'Invalid audience value.' });
    }

    if (targetDeptIds.length) {
      const departmentTrack = mapProgramToDepartmentTrack(normalizedProgram);
      const matchedDepartments = await Department.countDocuments({ _id: { $in: targetDeptIds }, program: departmentTrack || normalizedProgram });
      if (matchedDepartments !== targetDeptIds.length) {
        return res.status(400).json({ success: false, message: 'Selected departments must belong to the chosen program.' });
      }
    }

    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found.' });

    report.title = String(title).trim();
    report.writer_names = String(writer_names).trim();
    report.writer_email = String(writer_email).trim();
    report.description = String(description).trim();
    report.location = String(location).trim();
    report.keywords = String(keywords).trim();
    report.pages = String(pages).trim();
    report.program = normalizedProgram;
    report.audience = String(audience).trim().toUpperCase();
    report.departments = targetDeptIds;
    report.material_price = parsedMaterialPrice;
    report.project_github_url = parsedProjectGitHubUrl;
    await report.save();

    return res.json({ success: true, message: 'Report updated successfully' });
  } catch (err) {
    console.error('[AdminReport] Update error:', err);
    return res.status(500).json({ success: false, message: 'Update failed.' });
  }
};

exports.deleteReport = async (req, res) => {
  try {
    const { id } = req.params;

    const report = await Report.findById(id).lean();
    if (!report) return res.status(404).json({ success: false, message: 'Report not found.' });

    const reportPath = String(report.file_path || '');
    const isRemoteReport = /^https?:\/\//i.test(reportPath);
    if (!isRemoteReport) {
      const filename = sanitizeFilename(reportPath);
      if (filename) {
        const filePath = path.join(REPORT_DIR, filename);
        await safeUnlink(filePath);

        const pdfName = filename.replace(/\.(doc|docx)$/i, '.pdf');
        if (pdfName !== filename) {
          const pdfPath = path.join(REPORT_PDF_DIR, pdfName);
          await safeUnlink(pdfPath);
        }
      }
    }

    await Report.deleteOne({ _id: id });
    return res.json({ success: true, message: 'Report deleted successfully' });
  } catch (err) {
    console.error('[AdminReport] Delete error:', err);
    return res.status(500).json({ success: false, message: 'Delete failed.' });
  }
};
