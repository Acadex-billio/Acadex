const History = require('../models/History');
const ChatMembership = require('../models/ChatMembership');
const ChatRoom = require('../models/ChatRoom');
const ChatMessage = require('../models/ChatMessage');

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

exports.getMyMaterialActivity = async (req, res) => {
  try {
    // Get user ID from JWT token
    const userId = req.user?.cand_id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { from, to, label } = parseRange(req);

    const contentType = String(req.query.content_type || '').trim();
    const action = String(req.query.action || '').trim();

    const match = { user_id: String(userId), createdAt: { $gte: from, $lte: to } };
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
        { $limit: clamp(parseIntSafe(req.query.limit, 10), 1, 50) },
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

exports.getMyChatStats = async (req, res) => {
  try {
    // Get user ID from JWT token
    const userId = req.user?.cand_id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { from, to, label } = parseRange(req);
    const limit = clamp(parseIntSafe(req.query.limit, 10), 1, 50);

    const sentCount = await ChatMessage.countDocuments({
      sender_cand_id: String(userId),
      createdAt: { $gte: from, $lte: to },
    });

    const days = Math.max(1, Math.ceil((to.getTime() - from.getTime()) / DAY_MS));
    const avgPerDay = sentCount / days;

    const recentRooms = await ChatMembership.aggregate([
      { $match: { user_cand_id: String(userId), left_at: null } },
      { $sort: { updatedAt: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'chatrooms',
          localField: 'room_id',
          foreignField: '_id',
          as: 'room',
        },
      },
      { $unwind: { path: '$room', preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: 'chatmessages',
          let: { rid: '$room_id' },
          pipeline: [
            { $match: { $expr: { $eq: ['$room_id', '$$rid'] } } },
            { $sort: { createdAt: -1 } },
            { $limit: 1 },
            { $project: { _id: 0, sender_cand_id: 1, text: 1, createdAt: 1 } },
          ],
          as: 'last_message',
        },
      },
      { $unwind: { path: '$last_message', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 0,
          room_id: '$room_id',
          room_type: '$room.type',
          room_name: '$room.name',
          last_read_at: 1,
          last_message: 1,
        },
      },
    ]);

    return res.json({
      success: true,
      range: { from, to, period: label },
      messages_sent: sentCount,
      avg_messages_per_day: avgPerDay,
      recent_rooms: recentRooms,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load chat stats' });
  }
};

exports.getMyMaterialSummary = async (req, res) => {
  try {
    // Get user ID from JWT token
    const userId = req.user?.cand_id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { from, to, label } = parseRange(req);

    const match = {
      user_id: String(userId),
      createdAt: { $gte: from, $lte: to },
      content_type: { $in: ['question_paper', 'report', 'presentation'] },
      action: { $in: ['download', 'preview'] },
    };

    const breakdown = await History.aggregate([
      { $match: match },
      { $group: { _id: { content_type: '$content_type', action: '$action' }, count: { $sum: 1 } } },
      {
        $project: {
          _id: 0,
          content_type: '$_id.content_type',
          action: '$_id.action',
          count: 1,
        },
      },
    ]);

    const totals = breakdown.reduce(
      (acc, row) => {
        acc.total += row.count;
        if (row.action === 'download') acc.downloads += row.count;
        if (row.action === 'preview') acc.previews += row.count;
        return acc;
      },
      { total: 0, downloads: 0, previews: 0 }
    );

    return res.json({
      success: true,
      range: { from, to, period: label },
      totals,
      breakdown,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load summary' });
  }
};
