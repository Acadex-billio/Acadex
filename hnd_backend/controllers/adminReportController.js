/**
 * Admin Report Upload Controller
 */
const Report = require('../models/Report');
const User = require('../models/User');
const Department = require('../models/Department');
const path = require('path');
const fs = require('fs');
const { uploadFile } = require('../utils/s3Uploader');
const { sendBulkBcc } = require('../services/emailService');
const { sanitizeFilename } = require('../middlewares/requestValidation');
const { sendBulkPushNotification, isWebPushConfigured } = require('../utils/webPush');

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
      notify,
      program,
    } = req.body;
    const normalizedProgram = String(program || 'HND').trim().toUpperCase();
    if (!['HND', 'BTS'].includes(normalizedProgram)) {
      return res.status(400).json({ success: false, message: 'Program must be HND or BTS.' });
    }


    if (
      !req.file ||
      !title ||
      !writer_names ||
      !writer_email ||
      !description ||
      !location ||
      !keywords ||
      !pages ||
      !audience
    ) {
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
    } else if (audience !== 'GENERAL') {
      return res.status(400).json({ success: false, message: 'Invalid audience value.' });
    }

    if (targetDeptIds.length) {
      const matchedDepartments = await Department.countDocuments({ _id: { $in: targetDeptIds }, program: normalizedProgram });
      if (matchedDepartments !== targetDeptIds.length) {
        return res.status(400).json({ success: false, message: 'Selected departments must belong to the chosen program.' });
      }
    }

    let filePath = req.file.filename;
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

    const report = await Report.create({
      title: title.trim(),
      writer_names: writer_names.trim(),
      writer_email: writer_email.trim(),
      keywords: keywords.trim(),
      description: description.trim(),
      location: location.trim(),
      pages: String(pages).trim(),
      file_path: filePath,
      program: normalizedProgram,
      audience,
      notify_candidates: notify === 'true',
      departments: targetDeptIds,
    });

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
    const query = ['HND', 'BTS'].includes(program) ? { program } : {};
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
      program,
    } = req.body;
    const normalizedProgram = String(program || 'HND').trim().toUpperCase();
    if (!['HND', 'BTS'].includes(normalizedProgram)) {
      return res.status(400).json({ success: false, message: 'Program must be HND or BTS.' });
    }


    if (!title || !writer_names || !writer_email || !description || !location || !keywords || !pages || !audience) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
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
    } else if (audience !== 'GENERAL') {
      return res.status(400).json({ success: false, message: 'Invalid audience value.' });
    }

    if (targetDeptIds.length) {
      const matchedDepartments = await Department.countDocuments({ _id: { $in: targetDeptIds }, program: normalizedProgram });
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
