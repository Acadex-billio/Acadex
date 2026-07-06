/**
 * History Controller
 */
const History = require('../models/History');
const User = require('../models/User');

const ACTIVITY_ALLOWED_CONTENT_TYPES = new Set(['account', 'ai_chat', 'lecturer_booking', 'chat_center']);
const ACTIVITY_EXCLUDED_ACTIONS = new Set(['download', 'preview', 'save', 'view']);

const toDate = (value) => {
  if (!value) return null;
  const d = new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  return d;
};

exports.add = async (req, res) => {
  try {
    // Get user ID from JWT token
    const userId = req.user?.cand_id;
    const { user_id, user_name, content_type, content_title, action } = req.body;
    const effectiveUserId = userId || user_id;
    if (!effectiveUserId || !content_type || !content_title || !action) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    let effectiveUserName = String(req.user?.name || user_name || '').trim();
    if (!effectiveUserName) {
      const existingUser = await User.findOne({ cand_id: String(effectiveUserId) }).select('name').lean();
      effectiveUserName = String(existingUser?.name || '').trim() || null;
    }

    await History.create({
      user_id: String(effectiveUserId),
      user_name: effectiveUserName,
      content_type: String(content_type),
      content_title: String(content_title),
      action: String(action),
    });
    res.json({ success: true });
  } catch (err) {
    console.error('[History] Add error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};

function shouldIncludeInActivityView(entry, mode) {
  if (mode !== 'activity') return true;
  const contentType = String(entry?.content_type || '').trim().toLowerCase();
  const action = String(entry?.action || '').trim().toLowerCase();
  if (!ACTIVITY_ALLOWED_CONTENT_TYPES.has(contentType)) return false;
  if (ACTIVITY_EXCLUDED_ACTIONS.has(action)) return false;
  return true;
}

exports.getByUser = async (req, res) => {
  try {
    const { user_id } = req.params;
    const from = toDate(req.query?.from);
    const to = toDate(req.query?.to);
    const action = String(req.query?.action || '').trim();
    const mode = String(req.query?.mode || '').trim().toLowerCase();

    const query = { user_id: String(user_id) };
    if (from && to) {
      query.createdAt = { $gte: from, $lte: to };
    }
    if (action) {
      query.action = action;
    }

    const logs = await History.find(query)
      .sort({ createdAt: -1 })
      .select('user_name content_type content_title action createdAt')
      .lean();

    let fallbackUserName = null;
    if (logs.some((l) => !String(l.user_name || '').trim())) {
      const user = await User.findOne({ cand_id: String(user_id) }).select('name').lean();
      fallbackUserName = String(user?.name || '').trim() || null;
    }

    const formatted = logs
      .filter((l) => shouldIncludeInActivityView(l, mode))
      .map((l) => ({
        history_id: l._id,
        user_name: String(l.user_name || '').trim() || fallbackUserName,
        content_type: l.content_type,
        content_title: l.content_title,
        action: l.action,
        timestamp: l.createdAt,
      }));

    res.json({ success: true, logs: formatted });
  } catch (err) {
    console.error('[History] Fetch error:', err);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
};
