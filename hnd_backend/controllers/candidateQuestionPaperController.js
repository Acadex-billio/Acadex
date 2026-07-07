/**
 * Candidate Question Papers Controller
 */
const QuestionPaper = require('../models/QuestionPaper');
const Department = require('../models/Department');
const History = require('../models/History');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const { sanitizeFilename } = require('../middlewares/requestValidation');
const { getS3ObjectStream } = require('../utils/s3Uploader');
const materialAccessService = require('../services/materialAccessService');
const { getMaterialAccessSummary } = require('../utils/subscriptionUtils');
const { streamToBuffer, subsetPdfBuffer } = require('../utils/pdfAccess');

const PAPERS_DIR = path.join(__dirname, '../uploads/papers');

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
    console.error('[CandidateQuestionPaper] S3 stream error:', err.message);
    if (!res.headersSent) {
      res.status(404).json({ success: false, message: 'File not found' });
    }
  });

  stream.pipe(res);
  return true;
};

const canAccessPaper = (paper, deptObjectId) => {
  if (!paper) return false;
  const audience = String(paper.audience || '').toUpperCase();
  if (audience === 'GENERAL') return true;
  if (!deptObjectId) return false;
  const deptIds = (paper.departments || []).map((d) => String(d));
  return deptIds.includes(String(deptObjectId));
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

const parseStudyLinks = (text) => {
  if (!text) return [];
  if (Array.isArray(text)) return text.map((link) => String(link || '').trim()).filter(Boolean);
  const value = String(text).trim();
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((link) => String(link || '').trim()).filter(Boolean);
    }
  } catch (_err) {
    // ignore
  }

  return value
    .split(',')
    .map((link) => String(link || '').trim())
    .filter((link) => link);
};

exports.getDepartments = async (req, res) => {
  try {
    const program = String(req.user?.program || 'HND').toUpperCase();
    const rows = await Department.find({ program })
      .sort({ department_name: 1 })
      .select('_id department_name abbreviation')
      .lean();

    return res.json(
      rows.map((d) => ({
        dpt_id: d._id.toString(),
        department_name: d.department_name,
        abbreviation: d.abbreviation,
        program: String(d.program || program).toUpperCase(),
      }))
    );
  } catch (err) {
    console.error('[CandidateQuestionPaper] Departments error:', err);
    return res.status(500).json({ success: false, message: 'Failed to fetch departments' });
  }
};

exports.getQuestionPapers = async (req, res) => {
  try {
    const deptId = req.user?.dpt_id || null;
    const program = String(req.user?.program || 'HND').toUpperCase();

    const query = deptId
      ? { program, $or: [{ audience: 'GENERAL' }, { departments: deptId }] }
      : { program, audience: 'GENERAL' };

    const papers = await QuestionPaper.find(query)
      .sort({ createdAt: -1 })
      .populate('departments', 'department_name')
      .lean();

    const formatted = papers.map((p) => ({
      qp_id: p._id,
      paper_title: p.course_title,
      hnd_year: p.hnd_year,
      paper_file: p.paper_file,
      upload_date: p.createdAt,
      uploaded_by: p.uploaded_by,
      program: String(p.program || 'HND').toUpperCase(),
      audience: p.audience,
      more_info: p.more_info,
      study_links: parseStudyLinks(p.more_info),
      subscription_access: p.subscription_access || null,
      departments: (p.departments || []).map((d) => ({
        dpt_id: (d && d._id ? d._id : d)?.toString?.() ?? String(d),
        dpt_name: (typeof d === 'object' && d?.department_name) || '',
      })),
    }));

    return res.json({ success: true, papers: formatted });
  } catch (err) {
    console.error('[CandidateQuestionPaper] List error:', err);
    return res.status(500).json({ success: false, message: 'Failed to retrieve question papers' });
  }
};

exports.downloadPaper = async (req, res) => {
  try {
    const requested = decodeURIComponent(req.params.filename || '');
    if (!requested) {
      return res.status(400).json({ success: false, message: 'Invalid filename' });
    }

    const program = String(req.user?.program || 'HND').toUpperCase();
    const paper = await QuestionPaper.findOne({ paper_file: requested, program }).select('audience departments course_title subscription_access').lean();
    if (!paper) {
      return res.status(404).json({ success: false, message: 'Paper not found' });
    }

    const deptId = req.user?.dpt_id || null;
    if (!canAccessPaper(paper, deptId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this paper' });
    }

    const candidate = await User.findOne({ cand_id: req.user?.cand_id }).select('cand_id subscription').lean();
    const user = await User.findOne({ cand_id: req.user?.cand_id }).select('_id cand_id subscription').lean();
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    // Check if user has an active grant for download access to this material
    const hasGrantedAccess = await materialAccessService.hasActiveAccess(
      user._id,
      paper._id,
      'questionPaper',
      'download'
    );

    if (!hasGrantedAccess) {
      // No active grant, check subscription plan
      const access = await getMaterialAccessSummary({
        user: { cand_id: req.user?.cand_id, subscription: candidate?.subscription || null },
        materialType: 'question_paper',
        resourceId: paper._id,
        doc: paper,
      });

      if (!access.allow_download) {
        if (access.plan === 'basic') {
          return res.status(403).json({
            success: false,
            code: 'PLAN_UPGRADE_REQUIRED',
            message: 'Basic plan cannot download question papers. Upgrade to Pro to unlock downloads.',
          });
        }
        return res.status(402).json({
          success: false,
          code: 'PAYMENT_REQUIRED',
          message: 'PAYGO download requires a separate payment for this question paper.',
          payment_requirement: {
            title: 'Unlock question paper download',
            message: `Pay ${access.payment_required.download.amount} ${access.payment_required.download.currency} to download this question paper for 1 hour.`,
            action: 'download',
            amount: access.payment_required.download.amount,
            currency: access.payment_required.download.currency,
            resource_type: 'question_paper',
            resource_id: String(paper._id),
            purpose_code: access.payment_required.download.purpose_code,
            access_minutes: access.payment_required.download.access_minutes,
          },
        });
      }
    }
    const isRemote = /^https?:\/\//i.test(requested);
    const filename = isRemote ? requested : sanitizeFilename(requested);

    try {
      const userId = req.user?.cand_id;
      if (userId) {
        await History.create({
          user_id: String(userId),
          content_type: 'question_paper',
          content_title: String(paper.course_title || filename),
          action: 'download',
        });
      }
    } catch (_) {
    }

    const user = await User.findOne({ cand_id: req.user?.cand_id }).select('_id').lean();
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    try {
      await materialAccessService.grantMaterialAccess(user._id, paper._id, 'questionPaper', 'download', null);
    } catch (grantError) {
      console.error('[CandidateQuestionPaper] Grant creation failed:', grantError);
      // continue with download even if My Downloads save fails
    }

    if (isRemote) {
      const remoteName = sanitizeFilename(path.basename(requested)) || 'question-paper';
      if (streamS3ToResponse(requested, res, 'attachment', remoteName)) return;
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const filePath = path.join(PAPERS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    return res.download(filePath, filename);
  } catch (err) {
    console.error('[CandidateQuestionPaper] Download error:', err);
    return res.status(500).json({ success: false, message: 'Failed to download file' });
  }
};

exports.previewPaper = async (req, res) => {
  try {
    const requested = decodeURIComponent(req.params.filename || '');
    if (!requested) {
      return res.status(400).json({ success: false, message: 'Invalid filename' });
    }

    const program = String(req.user?.program || 'HND').toUpperCase();
    const paper = await QuestionPaper.findOne({ paper_file: requested, program }).select('audience departments course_title subscription_access').lean();
    if (!paper) {
      return res.status(404).json({ success: false, message: 'Paper not found' });
    }

    const deptId = req.user?.dpt_id || null;
    if (!canAccessPaper(paper, deptId)) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this paper' });
    }

    const candidate = await User.findOne({ cand_id: req.user?.cand_id }).select('cand_id subscription').lean();    const user = await User.findOne({ cand_id: req.user?.cand_id }).select('_id cand_id subscription').lean();
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });

    // Check if user has an active grant for preview access to this material
    const hasGrantedAccess = await materialAccessService.hasActiveAccess(
      user._id,
      paper._id,
      'questionPaper',
      'preview'
    );
    const access = await getMaterialAccessSummary({
      user: { cand_id: req.user?.cand_id, subscription: candidate?.subscription || null },
      materialType: 'question_paper',
      resourceId: paper._id,
      doc: paper,
    });

    const isRemote = /^https?:\/\//i.test(requested);
    const filename = isRemote ? requested : sanitizeFilename(requested);

    try {
      const userId = req.user?.cand_id;
      if (userId) {
        await History.create({
          user_id: String(userId),
          content_type: 'question_paper',
          content_title: String(paper.course_title || filename),
          action: 'preview',
        });
      }
    } catch (_) {
    }

    if (isRemote) {
      const ext = path.extname(filename).toLowerCase();
      if (ext === '.pdf') {
        const key = getS3KeyFromValue(requested);
        if (!key) return res.status(404).json({ success: false, message: 'File not found' });
        const buffer = await streamToBuffer(getS3ObjectStream(key));
        return sendPdfResponse(res, buffer, access);
      }
      return res.status(400).json({ success: false, message: 'Preview for remote files is only supported for PDF' });
    }

    const filePath = path.join(PAPERS_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    const buffer = await fs.promises.readFile(filePath);
    return sendPdfResponse(res, buffer, access);
  } catch (err) {
    console.error('[CandidateQuestionPaper] Preview error:', err);
    return res.status(500).json({ success: false, message: 'Failed to preview file' });
  }
};
