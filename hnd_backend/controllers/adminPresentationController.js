/**
 * Admin Presentation Upload Controller
 */
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const { sendBulkBcc } = require('../services/emailService');
const { sanitizeFilename } = require('../middlewares/requestValidation');
const { uploadFile } = require('../utils/s3Uploader');
const { sendBulkPushNotification, isWebPushConfigured } = require('../utils/webPush');

const PRESENTATION_DIR = path.join(__dirname, '../uploads/presentations');
const PRESENTATION_PDF_DIR = path.join(PRESENTATION_DIR, 'pdfs');

const safeUnlink = async (filePath) => {
  try {
    await fs.promises.unlink(filePath);
    return true;
  } catch (err) {
    if (err && err.code === 'ENOENT') return false;
    throw err;
  }
};

exports.getReports = async (req, res) => {
  try {
    const program = String(req.query?.program || '').trim().toUpperCase();
    const query = ['HND', 'BTS'].includes(program) ? { program } : {};
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
    const { report_id, title, presenter_name, presenter_email, notify, program } = req.body;
    const normalizedProgram = String(program || 'HND').trim().toUpperCase();
    if (!['HND', 'BTS'].includes(normalizedProgram)) {
      return res.status(400).json({ success: false, message: 'Program must be HND or BTS.' });
    }


    if (!title || !presenter_name || !presenter_email || !req.file) {
      return res.status(400).json({ success: false, message: 'Missing required fields or file.' });
    }

    if (report_id) {
      const linkedReport = await Report.findOne({ _id: report_id, program: normalizedProgram }).select('_id').lean();
      if (!linkedReport) {
        return res.status(400).json({ success: false, message: 'Linked report must belong to the chosen program.' });
      }
    }

    console.log('[Presentation] Attempting S3 upload:', {
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size || req.file.buffer.length,
      title: title,
      presenter: presenter_name,
    });

    let file_path = req.file.filename;
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

    const presentation = await Presentation.create({
      report_id: report_id || null,
      title: title.trim(),
      presenter_name: presenter_name.trim(),
      presenter_email: presenter_email.trim(),
      program: normalizedProgram,
      file_path: file_path,
    });

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
    const query = ['HND', 'BTS'].includes(program) ? { program } : {};
    const rows = await Presentation.find(query)
      .sort({ createdAt: -1 })
      .populate('report_id', 'title')
      .lean();

    const formatted = rows.map((p) => ({
      presentation_id: p._id,
      title: p.title,
      presenter_name: p.presenter_name,
      presenter_email: p.presenter_email,
      file_path: p.file_path,
      program: String(p.program || 'HND').toUpperCase(),
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
    const { report_id, title, presenter_name, presenter_email, program } = req.body;
    const normalizedProgram = String(program || 'HND').trim().toUpperCase();
    if (!['HND', 'BTS'].includes(normalizedProgram)) {
      return res.status(400).json({ success: false, message: 'Program must be HND or BTS.' });
    }


    if (!title || !presenter_name || !presenter_email) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
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
    pres.program = normalizedProgram;
    pres.report_id = report_id ? report_id : null;
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
