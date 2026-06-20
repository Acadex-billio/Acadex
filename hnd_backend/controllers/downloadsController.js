const QuestionPaper = require('../models/QuestionPaper');
const History = require('../models/History');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const { getMaterialAccessSummary } = require('../utils/subscriptionUtils');
const { sanitizeFilename } = require('../middlewares/requestValidation');

const PAPERS_DIR = path.join(__dirname, '../uploads/papers');

const canAccessPaper = (paper, deptObjectId) => {
  if (!paper) return false;
  const audience = String(paper.audience || '').toUpperCase();
  if (audience === 'GENERAL') return true;
  if (!deptObjectId) return false;
  const deptIds = (paper.departments || []).map((d) => String(d));
  return deptIds.includes(String(deptObjectId));
};

exports.saveDownload = async (req, res) => {
  try {
    const requested = decodeURIComponent(req.params.filename || '');
    if (!requested) return res.status(400).json({ success: false, message: 'Invalid filename' });

    const program = String(req.user?.program || 'HND').toUpperCase();
    const paper = await QuestionPaper.findOne({ paper_file: requested, program }).select('audience departments course_title').lean();
    if (!paper) return res.status(404).json({ success: false, message: 'Paper not found' });

    const deptId = req.user?.dpt_id || null;
    if (!canAccessPaper(paper, deptId)) return res.status(403).json({ success: false, message: 'Not authorized to access this paper' });

    const candidate = await User.findOne({ cand_id: req.user?.cand_id }).select('cand_id subscription').lean();
    const access = await getMaterialAccessSummary({ user: { cand_id: req.user?.cand_id, subscription: candidate?.subscription || null }, materialType: 'question_paper', resourceId: paper._id, doc: paper });

    if (!access.allow_download) {
      if (access.plan === 'basic') {
        return res.status(403).json({ success: false, code: 'PLAN_UPGRADE_REQUIRED', message: 'Basic plan cannot download question papers. Upgrade to Pro to unlock downloads.' });
      }
      return res.status(402).json({ success: false, code: 'PAYMENT_REQUIRED', message: 'PAYGO download requires a separate payment for this question paper.', payment_requirement: access.payment_required.download });
    }

    // record history with content_ref as the filename so frontend can list and preview
    try {
      await History.create({ user_id: String(req.user?.cand_id), content_ref: requested, content_type: 'question_paper', content_title: String(paper.course_title || requested), action: 'download' });
    } catch (err) {
      // ignore logging error
    }

    return res.json({ success: true, message: 'Paper saved to downloads' });
  } catch (err) {
    console.error('[Downloads] saveDownload error:', err);
    return res.status(500).json({ success: false, message: 'Failed to save download' });
  }
};

exports.listDownloads = async (req, res) => {
  try {
    const userId = req.user?.cand_id;
    if (!userId) return res.status(401).json({ success: false, message: 'Not authenticated' });

    const rows = await History.find({ user_id: String(userId), content_type: 'question_paper', action: 'download' })
      .sort({ createdAt: -1 })
      .select('content_title content_ref createdAt')
      .lean();

    const formatted = rows.map((r) => ({ title: r.content_title, file: r.content_ref || null, downloaded_at: r.createdAt }));
    return res.json({ success: true, downloads: formatted });
  } catch (err) {
    console.error('[Downloads] listDownloads error:', err);
    return res.status(500).json({ success: false, message: 'Failed to list downloads' });
  }
};
