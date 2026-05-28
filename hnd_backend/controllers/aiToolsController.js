const User = require('../models/User');
const Department = require('../models/Department');
const QuestionPaper = require('../models/QuestionPaper');
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const History = require('../models/History');
const Announcement = require('../models/Announcement');
const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');
const ChatMembership = require('../models/ChatMembership');

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIntSafe(v, fallback) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function parseRange(req) {
  const period = String(req.query.period || '').trim().toLowerCase();
  const now = new Date();

  const fromRaw = req.query.from ? new Date(String(req.query.from)) : null;
  const toRaw = req.query.to ? new Date(String(req.query.to)) : null;

  if (fromRaw && !Number.isNaN(fromRaw.getTime()) && toRaw && !Number.isNaN(toRaw.getTime())) {
    return { from: fromRaw, to: toRaw, label: 'custom' };
  }

  if (period === 'day') {
    return { from: new Date(now.getTime() - DAY_MS), to: now, label: 'day' };
  }

  if (period === 'week') {
    return { from: new Date(now.getTime() - 7 * DAY_MS), to: now, label: 'week' };
  }

  if (period === 'month') {
    return { from: new Date(now.getTime() - 30 * DAY_MS), to: now, label: 'month' };
  }

  return { from: new Date(now.getTime() - 7 * DAY_MS), to: now, label: 'week' };
}

exports.getPlatformHistory = async (req, res) => {
  try {
    const { from, to } = parseRange(req);
    const page = clamp(parseIntSafe(req.query.page, 1), 1, 1000000);
    const limit = clamp(parseIntSafe(req.query.limit, 25), 1, 200);
    const skip = (page - 1) * limit;

    const contentType = String(req.query.content_type || '').trim();
    const action = String(req.query.action || '').trim();
    const userId = String(req.query.user_id || '').trim();
    const candidateName = String(req.query.candidate_name || '').trim();

    const query = { createdAt: { $gte: from, $lte: to } };
    if (contentType) query.content_type = contentType;
    if (action) query.action = action;
    if (userId) query.user_id = userId;

    if (candidateName) {
      const escaped = candidateName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const users = await User.find({ name: { $regex: escaped, $options: 'i' } })
        .select('cand_id')
        .limit(500)
        .lean();
      const userIds = users.map((u) => String(u.cand_id)).filter(Boolean);
      if (userIds.length === 0) {
        return res.json({
          success: true,
          range: { from, to },
          logs: [],
          pagination: { page, limit, total: 0 },
        });
      }
      query.user_id = query.user_id
        ? { $in: userIds.filter((id) => id === String(userId)) }
        : { $in: userIds };
    }

    const [rows, total] = await Promise.all([
      History.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('user_id user_name content_type content_title action createdAt')
        .lean(),
      History.countDocuments(query),
    ]);

    const missingNameIds = Array.from(
      new Set(
        rows
          .filter((r) => !String(r.user_name || '').trim())
          .map((r) => String(r.user_id || '').trim())
          .filter(Boolean)
      )
    );

    let nameByUserId = new Map();
    if (missingNameIds.length) {
      const users = await User.find({ cand_id: { $in: missingNameIds } }).select('cand_id name').lean();
      nameByUserId = new Map(users.map((u) => [String(u.cand_id), String(u.name || '').trim()]));
    }

    return res.json({
      success: true,
      range: { from, to },
      logs: rows.map((l) => ({
        history_id: l._id,
        user_id: l.user_id,
        user_name: String(l.user_name || '').trim() || nameByUserId.get(String(l.user_id || '').trim()) || null,
        content_type: l.content_type,
        content_title: l.content_title,
        action: l.action,
        timestamp: l.createdAt,
      })),
      pagination: { page, limit, total },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load history' });
  }
};

exports.getRecentMaterials = async (req, res) => {
  try {
    const limit = clamp(parseIntSafe(req.query.limit, 10), 1, 50);

    const [papers, reports, presentations] = await Promise.all([
      QuestionPaper.find().sort({ createdAt: -1 }).limit(limit).select('course_title hnd_year paper_file createdAt').lean(),
      Report.find().sort({ createdAt: -1 }).limit(limit).select('title file_path createdAt').lean(),
      Presentation.find().sort({ createdAt: -1 }).limit(limit).select('title file_path createdAt').lean(),
    ]);

    return res.json({
      success: true,
      materials: {
        question_papers: papers.map((p) => ({
          id: p._id,
          title: p.course_title,
          hnd_year: p.hnd_year,
          file: p.paper_file,
          created_at: p.createdAt,
        })),
        reports: reports.map((r) => ({ id: r._id, title: r.title, file: r.file_path, created_at: r.createdAt })),
        presentations: presentations.map((p) => ({ id: p._id, title: p.title, file: p.file_path, created_at: p.createdAt })),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load recent materials' });
  }
};

exports.getAccountStatusStats = async (req, res) => {
  try {
    const now = new Date();
    const from = req.query.from ? new Date(String(req.query.from)) : null;
    const to = req.query.to ? new Date(String(req.query.to)) : null;
    const validCustom = from && !Number.isNaN(from.getTime()) && to && !Number.isNaN(to.getTime());
    const rangeFrom = validCustom ? from : new Date(now.getTime() - 365 * DAY_MS);
    const rangeTo = validCustom ? to : now;

    const [currentCounts, monthlySuspensions, monthlyBlocks] = await Promise.all([
      User.aggregate([
        { $match: { role: { $ne: 'admin' } } },
        { $group: { _id: '$account_status', count: { $sum: 1 } } },
      ]),
      User.aggregate([
        {
          $match: {
            role: { $ne: 'admin' },
            'suspension.set_at': { $gte: rangeFrom, $lte: rangeTo },
          },
        },
        {
          $group: {
            _id: { y: { $year: '$suspension.set_at' }, m: { $month: '$suspension.set_at' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
      ]),
      User.aggregate([
        {
          $match: {
            role: { $ne: 'admin' },
            'block.set_at': { $gte: rangeFrom, $lte: rangeTo },
          },
        },
        {
          $group: {
            _id: { y: { $year: '$block.set_at' }, m: { $month: '$block.set_at' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.y': 1, '_id.m': 1 } },
      ]),
    ]);

    const normalizeCounts = (rows) => {
      const map = new Map(rows.map((r) => [String(r._id), r.count]));
      return {
        active: map.get('active') || 0,
        suspended: map.get('suspended') || 0,
        blocked: map.get('blocked') || 0,
      };
    };

    const avg = (rows) => {
      if (!rows || rows.length === 0) return 0;
      const sum = rows.reduce((a, r) => a + (r.count || 0), 0);
      return sum / rows.length;
    };

    return res.json({
      success: true,
      range: { from: rangeFrom, to: rangeTo },
      current: normalizeCounts(currentCounts),
      per_month: {
        suspensions: monthlySuspensions.map((r) => ({ year: r._id.y, month: r._id.m, count: r.count })),
        blocks: monthlyBlocks.map((r) => ({ year: r._id.y, month: r._id.m, count: r.count })),
      },
      averages: {
        suspensions_per_month: avg(monthlySuspensions),
        blocks_per_month: avg(monthlyBlocks),
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load account stats' });
  }
};

exports.getRecentAnnouncements = async (req, res) => {
  try {
    const limit = clamp(parseIntSafe(req.query.limit, 10), 1, 50);
    const rows = await Announcement.find().sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({
      success: true,
      announcements: rows.map((a) => ({
        announcement_id: a._id,
        title: a.title,
        source: a.source,
        audience_type: a.audience_type,
        faculty: a.faculty || null,
        department_ids: a.department_ids || [],
        created_at: a.createdAt,
        expires_at: a.expires_at,
        reactions_count: Array.isArray(a.reactions) ? a.reactions.length : 0,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load announcements' });
  }
};

exports.getSummary = async (_req, res) => {
  try {
    const [
      totalUsers,
      totalCandidates,
      totalAdmins,
      totalDepartments,
      totalQuestionPapers,
      totalReports,
      totalPresentations,
      materialCounts,
    ] = await Promise.all([
      User.countDocuments(),
      User.countDocuments({ role: 'candidate' }),
      User.countDocuments({ role: { $in: ['admin', 'superadmin'] } }),
      Department.countDocuments(),
      QuestionPaper.countDocuments(),
      Report.countDocuments(),
      Presentation.countDocuments(),
      History.aggregate([
        {
          $match: {
            action: { $in: ['download', 'preview'] },
          },
        },
        {
          $group: {
            _id: {
              content_type: '$content_type',
              action: '$action',
            },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const {
      question_paper_downloads,
      question_paper_previews,
      report_downloads,
      report_previews,
      presentation_downloads,
      presentation_previews,
    } = materialCounts.reduce(
      (acc, row) => {
        const type = String(row._id.content_type || '').toLowerCase();
        const action = String(row._id.action || '').toLowerCase();

        if (type === 'question_paper') {
          if (action === 'download') acc.question_paper_downloads += row.count;
          if (action === 'preview') acc.question_paper_previews += row.count;
        }
        if (type === 'report') {
          if (action === 'download') acc.report_downloads += row.count;
          if (action === 'preview') acc.report_previews += row.count;
        }
        if (type === 'presentation') {
          if (action === 'download') acc.presentation_downloads += row.count;
          if (action === 'preview') acc.presentation_previews += row.count;
        }
        return acc;
      },
      {
        question_paper_downloads: 0,
        question_paper_previews: 0,
        report_downloads: 0,
        report_previews: 0,
        presentation_downloads: 0,
        presentation_previews: 0,
      }
    );

    return res.json({
      success: true,
      summary: {
        total_users: totalUsers,
        total_candidates: totalCandidates,
        total_admins: totalAdmins,
        total_departments: totalDepartments,
        total_question_papers: totalQuestionPapers,
        total_reports: totalReports,
        total_presentations: totalPresentations,
        question_paper_downloads,
        question_paper_previews,
        report_downloads,
        report_previews,
        presentation_downloads,
        presentation_previews,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load summary' });
  }
};

exports.getRecentRegistrations = async (req, res) => {
  try {
    const count = clamp(parseIntSafe(req.query.count, 10), 1, 200);

    const users = await User.find({ role: { $ne: 'admin' } })
      .sort({ createdAt: -1 })
      .limit(count)
      .select('cand_id name email dpt_id createdAt')
      .populate('dpt_id', 'department_name abbreviation')
      .lean();

    return res.json({
      success: true,
      registrations: users.map((u) => ({
        cand_id: u.cand_id,
        name: u.name,
        email: u.email,
        department_name: u.dpt_id?.department_name || null,
        department_abbreviation: u.dpt_id?.abbreviation || null,
        registered_at: u.createdAt,
      })),
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load registrations' });
  }
};

exports.getDepartmentStats = async (req, res) => {
  try {
    const limit = clamp(parseIntSafe(req.query.limit, 10), 1, 50);

    const rows = await User.aggregate([
      { $match: { role: { $ne: 'admin' }, dpt_id: { $ne: null } } },
      { $group: { _id: '$dpt_id', student_count: { $sum: 1 } } },
      { $sort: { student_count: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'departments',
          localField: '_id',
          foreignField: '_id',
          as: 'department',
        },
      },
      { $unwind: { path: '$department', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          dpt_id: '$_id',
          student_count: 1,
          department_name: '$department.department_name',
          abbreviation: '$department.abbreviation',
        },
      },
    ]);

    return res.json({ success: true, departments: rows });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load department stats' });
  }
};

exports.getChatroomActivity = async (req, res) => {
  try {
    const { from, to, label } = parseRange(req);

    const [
      totalRooms,
      totalMessages,
      totalMembers,
      messagesByRoom,
    ] = await Promise.all([
      ChatRoom.countDocuments(),
      ChatMessage.countDocuments({ createdAt: { $gte: from, $lte: to } }),
      ChatMembership.countDocuments({ left_at: null }),
      ChatMessage.aggregate([
        { $match: { createdAt: { $gte: from, $lte: to } } },
        { $group: { _id: '$room_id', message_count: { $sum: 1 } } },
        { $sort: { message_count: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'chatrooms',
            localField: '_id',
            foreignField: '_id',
            as: 'room',
          },
        },
        { $unwind: { path: '$room', preserveNullAndEmptyArrays: true } },
        {
          $project: {
            _id: 0,
            room_id: '$_id',
            message_count: 1,
            room_type: '$room.type',
            room_name: '$room.name',
          },
        },
      ]),
    ]);

    return res.json({
      success: true,
      range: { from, to, period: label },
      chat: {
        total_rooms: totalRooms,
        total_active_memberships: totalMembers,
        messages_in_range: totalMessages,
        top_rooms_by_messages: messagesByRoom,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load chat activity' });
  }
};

exports.getMaterialActivity = async (req, res) => {
  try {
    const { from, to, label } = parseRange(req);

    const contentType = String(req.query.content_type || '').trim();
    const action = String(req.query.action || '').trim();

    const match = { createdAt: { $gte: from, $lte: to } };
    if (contentType) match.content_type = contentType;
    if (action) match.action = action;

    const [total, byTypeAction, topTitles] = await Promise.all([
      History.countDocuments(match),
      History.aggregate([
        { $match: match },
        { $group: { _id: { content_type: '$content_type', action: '$action' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        {
          $project: {
            _id: 0,
            content_type: '$_id.content_type',
            action: '$_id.action',
            count: 1,
          },
        },
      ]),
      History.aggregate([
        { $match: match },
        { $group: { _id: { content_type: '$content_type', action: '$action', content_title: '$content_title' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
          $project: {
            _id: 0,
            content_type: '$_id.content_type',
            action: '$_id.action',
            content_title: '$_id.content_title',
            count: 1,
          },
        },
      ]),
    ]);

    return res.json({
      success: true,
      range: { from, to, period: label },
      total_events: total,
      breakdown: byTypeAction,
      top_titles: topTitles,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load material activity' });
  }
};
