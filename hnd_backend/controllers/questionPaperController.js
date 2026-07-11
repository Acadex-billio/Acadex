/**
 * Question Papers Controller (Admin)
 */
const QuestionPaper = require('../models/QuestionPaper');
const Department = require('../models/Department');
const User = require('../models/User');
const History = require('../models/History');
const path = require('path');
const fs = require('fs');
const { uploadFile } = require('../utils/s3Uploader');
const { sendBulkBcc } = require('../services/emailService');
const { sanitizeFilename } = require('../middlewares/requestValidation');
const { sendBulkPushNotification, isWebPushConfigured } = require('../utils/webPush');
const { USER_PROGRAMS } = require('../constants/userConstants');

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

const AUDIENCE = new Set(['GENERAL', 'SINGLE', 'MULTIPLE']);

const coerceMoreInfo = (body) => {
  const more_info = body.more_info;
  const study_links = body.study_links;
  if (typeof more_info === 'string' && more_info.trim()) return more_info.trim();
  if (typeof study_links === 'string') {
    try {
      const arr = JSON.parse(study_links);
      if (Array.isArray(arr)) {
        return arr.map((s) => (typeof s === 'string' ? s.trim() : '')).filter(Boolean).join(', ');
      }
    } catch (_) {}
  }
  return '';
};

const parseDptIds = (val) => {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  try {
    const parsed = JSON.parse(val);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (_) {
    return [];
  }
};

exports.getDepartments = async (req, res) => {
  try {
    const program = String(req.query?.program || '').trim().toUpperCase();
    const query = ALLOWED_PROGRAMS.includes(program) ? { program } : {};
    const rows = await Department.find(query)
      .sort({ department_name: 1 })
      .select('_id department_name program')
      .lean();
    res.json(rows.map((d) => ({ dpt_id: d._id.toString(), department_name: d.department_name, program: String(d.program || 'HND').toUpperCase() })));
  } catch (err) {
    console.error('[QuestionPaper] Departments:', err);
    res.status(500).json({ message: 'Failed to fetch departments' });
  }
};

exports.uploadPaper = async (req, res) => {
  try {
    const { audience, dpt_id, dpt_ids, paperTitle, hndYear, uploaded_by, notify, program } = req.body;
    const paper_type = String(req.body.paper_type || 'hnd').toLowerCase();
    const institution_name = String(req.body.institution_name || '').trim();
    const region = String(req.body.region || '').trim();
    const semester = String(req.body.semester || '').trim();
    const institution_url = String(req.body.institution_url || '').trim();
    const file = req.file;
    const normalizedProgram = String(program || 'HND').trim().toUpperCase();
    if (!ALLOWED_PROGRAMS.includes(normalizedProgram)) {
      return res.status(400).json({ success: false, message: 'Invalid program selected.' });
    }


    const aud = String(audience || '').toUpperCase();
    if (!AUDIENCE.has(aud)) {
      return res.status(400).json({ success: false, message: 'Invalid audience.' });
    }
    // Validate required fields based on paper type
    if (!paperTitle || !hndYear || !file) {
      return res.status(400).json({ success: false, message: 'Missing required fields or file.' });
    }
    if (paper_type === 'hnd') {
      if (!uploaded_by) return res.status(400).json({ success: false, message: 'Missing uploaded_by for HND paper.' });
    } else {
      // CA / Exam / Mock papers require institution details
      if (!institution_name || !region || !semester) {
        return res.status(400).json({ success: false, message: 'Missing institution, region, or semester for selected paper type.' });
      }
    }

    let targetDeptIds = [];
    if (aud === 'SINGLE') {
      if (!dpt_id) return res.status(400).json({ success: false, message: 'dpt_id required for SINGLE' });
      targetDeptIds = [dpt_id];
    } else if (aud === 'MULTIPLE') {
      const parsed = parseDptIds(dpt_ids);
      if (parsed.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'dpt_ids must contain at least one department for MULTIPLE',
        });
      }
      targetDeptIds = parsed;
    }

    if (targetDeptIds.length) {
      const departmentTrack = mapProgramToDepartmentTrack(normalizedProgram);
      const matchedDepartments = await Department.countDocuments({ _id: { $in: targetDeptIds }, program: departmentTrack || normalizedProgram });
      if (matchedDepartments !== targetDeptIds.length) {
        return res.status(400).json({ success: false, message: 'Selected departments must belong to the chosen program.' });
      }
    }

    const moreInfo = paper_type === 'hnd' ? coerceMoreInfo(req.body) : '';

    let paperFilePath = file.filename;
    try {
      console.log('[QuestionPaper] Attempting S3 upload:', {
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size || file.buffer.length,
        course: paperTitle,
        year: hndYear,
      });

      const upload = await uploadFile(file.buffer, file.originalname, file.mimetype, 'question-papers');
      paperFilePath = upload.url;

      console.log('[QuestionPaper] S3 upload successful:', {
        fileName: file.originalname,
        s3Key: upload.key,
        s3Url: paperFilePath,
        course: paperTitle,
      });
    } catch (uploadErr) {
      console.error('[QuestionPaper] S3 upload failed:', {
        error: uploadErr.message,
        fileName: file.originalname,
        course: paperTitle,
        stack: uploadErr.stack,
      });
      return res.status(500).json({ success: false, message: 'Failed to upload file to S3' });
    }

    const paper = await QuestionPaper.create({
      course_title: paperTitle.trim(),
      hnd_year: String(hndYear).trim(),
      paper_file: paperFilePath,
      uploaded_by: (uploaded_by || '').trim(),
      program: normalizedProgram,
      audience: aud,
      more_info: moreInfo,
      departments: targetDeptIds,
      paper_type: paper_type || 'hnd',
      institution_name: institution_name || '',
      region: region || '',
      semester: semester || '',
      institution_url: institution_url || '',
    });

    let emailReport = { attempted: 0, sent: 0, failed: 0 };
    const shouldNotify = String(notify || '').toLowerCase() === 'true';

    if (shouldNotify) {
      let users = [];
      if (aud === 'GENERAL') {
        users = await User.find({ program: normalizedProgram, email: { $exists: true, $ne: '' } })
          .select('name email push_subscription allow_push_notifications')
          .lean();
      } else if (targetDeptIds.length) {
        users = await User.find({
          program: normalizedProgram,
          dpt_id: { $in: targetDeptIds },
          email: { $exists: true, $ne: '' },
        })
          .select('name email push_subscription allow_push_notifications')
          .lean();
      }

      const subject = `New Question Paper: ${paperTitle}`;
      const text = `A new ${normalizedProgram} question paper titled "${paperTitle}" has been uploaded.\n\nYear: ${hndYear}\nUploaded by: ${uploaded_by}\n\nLog in to the platform to access and download it.\n\nBest regards,\nPlatform Team`;

      emailReport = await sendBulkBcc(users, subject, text);

      // Send push notifications
      if (isWebPushConfigured) {
        const pushUsers = users.filter(u => u.allow_push_notifications && u.push_subscription);
        if (pushUsers.length) {
          await sendBulkPushNotification(
            pushUsers,
            'question_paper',
            `New Question Paper: ${paperTitle}`,
            `A new ${normalizedProgram} question paper "${paperTitle}" (${hndYear}) has been uploaded.`,
            '/candidate/question-papers',
            String(paper._id)
          );
        }
      }
    }

    res.status(200).json({
      success: true,
      message: 'Question paper uploaded successfully.',
      qp_id: paper._id,
      emailReport,
    });
  } catch (err) {
    console.error('[QuestionPaper] Upload error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

exports.getQuestionPapers = async (req, res) => {
  try {
    const program = String(req.query?.program || '').trim().toUpperCase();
    const paper_type_q = String(req.query?.paper_type || '').trim().toLowerCase();
    const query = ALLOWED_PROGRAMS.includes(program) ? { program } : {};
    if (paper_type_q && ['hnd', 'ca', 'exam', 'mock'].includes(paper_type_q)) query.paper_type = paper_type_q;
    const papers = await QuestionPaper.find(query)
      .sort({ createdAt: -1 })
      .populate('departments', 'dpt_id department_name')
      .lean();

    const formatted = papers.map((p) => ({
      qp_id: p._id,
      paper_title: p.course_title,
      hnd_year: p.hnd_year,
      paper_file: p.paper_file,
      upload_date: p.createdAt,
      uploaded_by: p.uploaded_by,
      paper_type: p.paper_type || 'hnd',
      institution_name: p.institution_name || '',
      region: p.region || '',
      semester: p.semester || '',
      institution_url: p.institution_url || '',
      program: String(p.program || 'HND').toUpperCase(),
      audience: p.audience,
      more_info: p.more_info,
      departments: (p.departments || []).map((d) => ({
        dpt_id: (d && d._id ? d._id : d)?.toString?.() ?? String(d),
        dpt_name: (typeof d === 'object' && d?.department_name) || '',
      })),
    }));

    res.json({ papers: formatted });
  } catch (err) {
    console.error('[QuestionPaper] Get error:', err);
    res.status(500).json({ success: false, message: 'Failed to retrieve question papers' });
  }
};

exports.downloadPaper = async (req, res) => {
  const encoded = req.params.filename || '';
  const filename = decodeURIComponent(encoded);
  if (!filename) {
    return res.status(400).json({ success: false, message: 'Invalid filename' });
  }

  const paper = await QuestionPaper.findOne({ paper_file: filename }).select('course_title').lean();
  if (!paper) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  const recordHistory = async () => {
    try {
      const userId = req.user?.cand_id;
      if (!userId) return;
      await History.create({
        user_id: String(userId),
        content_type: 'question_paper',
        content_title: String(paper?.course_title || filename),
        action: 'download',
      });
    } catch (_) {}
  };

  if (/^https?:\/\//i.test(filename)) {
    await recordHistory();
    return res.redirect(filename);
  }

  const filePath = path.join(__dirname, '../uploads/papers', sanitizeFilename(filename));
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: 'File not found' });
  }

  await recordHistory();

  return res.download(filePath, path.basename(filePath), (err) => {
    if (err) {
      console.error('[QuestionPaper] Download error:', err);
      return res.status(500).json({ success: false, message: 'Failed to download file' });
    }
  });
};

exports.updatePaper = async (req, res) => {
  try {
    const { id } = req.params;
    const { audience, dpt_id, dpt_ids, paperTitle, hndYear, uploaded_by, more_info, study_links, program } = req.body;
    const paper_type = String(req.body.paper_type || 'hnd').toLowerCase();
    const institution_name = String(req.body.institution_name || '').trim();
    const region = String(req.body.region || '').trim();
    const semester = String(req.body.semester || '').trim();
    const institution_url = String(req.body.institution_url || '').trim();
    const normalizedProgram = String(program || 'HND').trim().toUpperCase();
    if (!['HND', 'BTS'].includes(normalizedProgram)) {
      return res.status(400).json({ success: false, message: 'Program must be HND or BTS.' });
    }

    const aud = String(audience || '').toUpperCase();
    if (!AUDIENCE.has(aud)) {
      return res.status(400).json({ success: false, message: 'Invalid audience.' });
    }
    if (!paperTitle || !hndYear) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }
    if (paper_type === 'hnd') {
      if (!uploaded_by) return res.status(400).json({ success: false, message: 'Missing uploaded_by for HND paper.' });
    } else {
      if (!institution_name || !region || !semester) {
        return res.status(400).json({ success: false, message: 'Missing institution, region, or semester for selected paper type.' });
      }
    }

    let targetDeptIds = [];
    if (aud === 'SINGLE') {
      if (!dpt_id) return res.status(400).json({ success: false, message: 'dpt_id required for SINGLE' });
      targetDeptIds = [dpt_id];
    } else if (aud === 'MULTIPLE') {
      const parsed = parseDptIds(dpt_ids);
      if (parsed.length === 0) {
        return res.status(400).json({ success: false, message: 'dpt_ids must contain at least one department for MULTIPLE' });
      }
      targetDeptIds = parsed;
    }

    if (targetDeptIds.length) {
      const matchedDepartments = await Department.countDocuments({ _id: { $in: targetDeptIds }, program: normalizedProgram });
      if (matchedDepartments !== targetDeptIds.length) {
        return res.status(400).json({ success: false, message: 'Selected departments must belong to the chosen program.' });
      }
    }

    const paper = await QuestionPaper.findById(id);
    if (!paper) return res.status(404).json({ success: false, message: 'Question paper not found.' });

    paper.course_title = String(paperTitle).trim();
    paper.hnd_year = String(hndYear).trim();
    paper.uploaded_by = (uploaded_by || '').trim();
    paper.program = normalizedProgram;
    paper.audience = aud;
    paper.more_info = paper_type === 'hnd' ? coerceMoreInfo({ more_info, study_links }) : '';
    paper.departments = targetDeptIds;
    paper.paper_type = paper_type || 'hnd';
    paper.institution_name = institution_name || '';
    paper.region = region || '';
    paper.semester = semester || '';
    paper.institution_url = institution_url || '';
    await paper.save();

    return res.json({ success: true, message: 'Question paper updated successfully' });
  } catch (err) {
    console.error('[QuestionPaper] Update error:', err);
    return res.status(500).json({ success: false, message: 'Update failed.' });
  }
};

exports.deletePaper = async (req, res) => {
  try {
    const { id } = req.params;

    const paper = await QuestionPaper.findById(id).lean();
    if (!paper) return res.status(404).json({ success: false, message: 'Question paper not found.' });

    const paperPath = String(paper.paper_file || '');
    const isRemotePaper = /^https?:\/\//i.test(paperPath);
    if (!isRemotePaper) {
      const filename = sanitizeFilename(paperPath);
      if (filename) {
        const filePath = path.join(__dirname, '../uploads/papers', filename);
        try {
          await fs.promises.unlink(filePath);
        } catch (err) {
          if (!(err && err.code === 'ENOENT')) throw err;
        }
      }
    }

    await QuestionPaper.deleteOne({ _id: id });
    return res.json({ success: true, message: 'Question paper deleted successfully' });
  } catch (err) {
    console.error('[QuestionPaper] Delete error:', err);
    return res.status(500).json({ success: false, message: 'Delete failed.' });
  }
};
