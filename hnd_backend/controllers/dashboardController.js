/**
 * Candidate Dashboard Controller
 */
const User = require('../models/User');
const QuestionPaper = require('../models/QuestionPaper');
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const Announcement = require('../models/Announcement');

exports.getDashboard = async (req, res) => {
  try {
    // Get user ID from JWT token
    const userId = req.user?.cand_id;
    if (!userId) {
      return res.status(400).json({ success: false, message: 'User ID not found in JWT token' });
    }

    const user = await User.findOne({ cand_id: userId })
      .populate('dpt_id', 'department_name abbreviation faculty')
      .select('cand_id name profile_picture dpt_id')
      .lean();

    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const dpt = user.dpt_id;
    const dptId = dpt?._id ?? user.dpt_id;

    const now = new Date();
    const faculty = dpt?.faculty ? String(dpt.faculty).trim() : null;

    const [questionPapers, reports, presentations, courseMates, latestAnnouncement] = await Promise.all([
      QuestionPaper.find().sort({ createdAt: -1 }).limit(5).select('course_title').lean(),
      Report.find(
        dptId ? { $or: [{ audience: 'GENERAL' }, { departments: dptId }] } : {}
      )
        .sort({ createdAt: -1 })
        .limit(5)
        .select('title')
        .lean(),
      Presentation.find().sort({ createdAt: -1 }).limit(5).select('title').lean(),
      User.find({ dpt_id: dptId, cand_id: { $ne: userId } })
        .limit(5)
        .select('cand_id name profile_picture')
        .lean(),
      Announcement.findOne({
        expires_at: { $gt: now },
        $or: [
          { audience_type: 'general' },
          { audience_type: 'departments', department_ids: dptId },
          ...(faculty ? [{ audience_type: 'faculty', faculty }] : []),
        ],
      })
        .sort({ createdAt: -1 })
        .select('title source')
        .lean(),
    ]);

    const formatPaper = (p) => ({ id: p._id, course_title: p.course_title });
    const formatReport = (r) => ({ id: r._id, title: r.title });
    const formatPres = (p) => ({ id: p._id, title: p.title });
    const formatMate = (u) => ({
      id: u.cand_id,
      name: u.name,
      profile_picture: u.profile_picture,
    });

    res.json({
      success: true,
      user: {
        id: user.cand_id,
        name: user.name,
        profilePicture: user.profile_picture || null,
        department: dpt?.department_name || '',
        departmentAbbr: dpt?.abbreviation || '',
        status: 'Active',
      },
      questionPapers: questionPapers.map(formatPaper),
      reports: reports.map(formatReport),
      presentations: presentations.map(formatPres),
      courseMates: courseMates.map(formatMate),
      currentAnnouncement: latestAnnouncement
        ? {
            title: latestAnnouncement.title,
            source: latestAnnouncement.source,
          }
        : null,
      downloads: 0,
    });
  } catch (err) {
    console.error('[Dashboard] Error:', err);
    res.status(500).json({ success: false, message: 'Server error', error: err.message });
  }
};
