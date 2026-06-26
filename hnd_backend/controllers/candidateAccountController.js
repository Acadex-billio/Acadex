const fs = require('fs');
const path = require('path');

const User = require('../models/User');
const ChatMembership = require('../models/ChatMembership');
const ChatMessage = require('../models/ChatMessage');
const ChatInvite = require('../models/ChatInvite');
const ChatBlock = require('../models/ChatBlock');
const History = require('../models/History');
const { buildSubscriptionResponse } = require('../utils/subscriptionUtils');

function requireJWTUser(req) {
  const u = req.user;
  if (!u?.cand_id) {
    const err = new Error('Not authenticated');
    err.statusCode = 401;
    throw err;
  }
  return u;
}

const normalizeCandId = (v) => String(v || '').trim();

exports.getAccountStatus = async (req, res) => {
  try {
    const u = requireJWTUser(req);
    const candId = normalizeCandId(u.cand_id);

    const user = await User.findOne({ cand_id: candId })
      .select('cand_id name email allow_push_notifications account_status suspension block complaints subscription')
      .lean();

    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    return res.json({
      success: true,
      account_status: user.account_status || 'active',
      suspension: user.suspension || null,
      block: user.block || null,
      complaints: Array.isArray(user.complaints) ? user.complaints : [],
      user: {
        cand_id: user.cand_id,
        name: user.name,
        email: user.email,
        allow_push_notifications: Boolean(user.allow_push_notifications),
      },
      subscription: await buildSubscriptionResponse(user.subscription),
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to get status' });
  }
};

exports.listLeftGroups = async (req, res) => {
  try {
    const u = requireJWTUser(req);
    const candId = normalizeCandId(u.cand_id);

    const mems = await ChatMembership.find({ user_cand_id: candId, left_at: { $ne: null } })
      .populate('room_id', 'type name')
      .sort({ left_at: -1 })
      .lean();

    return res.json({
      success: true,
      left_groups: mems
        .filter((m) => m.room_id?._id)
        .map((m) => ({
          room_id: m.room_id._id,
          room_type: m.room_id.type,
          room_name: m.room_id.name,
          left_at: m.left_at,
        })),
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to list left groups' });
  }
};

exports.rejoinGroup = async (req, res) => {
  try {
    const u = requireJWTUser(req);
    const candId = normalizeCandId(u.cand_id);
    const roomId = String(req.params?.roomId || '').trim();
    if (!roomId) return res.status(400).json({ success: false, message: 'roomId is required' });

    const membership = await ChatMembership.findOne({ room_id: roomId, user_cand_id: candId }).lean();
    if (!membership) return res.status(404).json({ success: false, message: 'Membership not found' });

    await ChatMembership.updateOne({ room_id: roomId, user_cand_id: candId }, { $set: { left_at: null } });
    return res.json({ success: true });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to rejoin group' });
  }
};

exports.listBlockedUsers = async (req, res) => {
  try {
    const u = requireJWTUser(req);
    const candId = normalizeCandId(u.cand_id);

    const blocks = await ChatBlock.find({ blocker_cand_id: candId }).sort({ createdAt: -1 }).lean();
    const blockedIds = blocks.map((b) => String(b.blocked_cand_id)).filter(Boolean);
    const users = await User.find({ cand_id: { $in: blockedIds } }).select('cand_id name').lean();
    const userById = new Map(users.map((x) => [String(x.cand_id), x]));

    return res.json({
      success: true,
      blocked_users: blocks.map((b) => {
        const x = userById.get(String(b.blocked_cand_id));
        return {
          cand_id: b.blocked_cand_id,
          name: x?.name || null,
          blocked_at: b.createdAt,
        };
      }),
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to list blocked users' });
  }
};

exports.unblockUser = async (req, res) => {
  try {
    const u = requireJWTUser(req);
    const candId = normalizeCandId(u.cand_id);
    const other = normalizeCandId(req.params?.otherCandId);
    if (!other) return res.status(400).json({ success: false, message: 'otherCandId is required' });
    await ChatBlock.deleteOne({ blocker_cand_id: candId, blocked_cand_id: other });
    return res.json({ success: true });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to unblock' });
  }
};

exports.submitComplaint = async (req, res) => {
  try {
    const u = requireJWTUser(req);
    const candId = normalizeCandId(u.cand_id);
    const text = String(req.body?.text || '').trim();

    if (!text) return res.status(400).json({ success: false, message: 'Complaint text is required' });

    await User.updateOne(
      { cand_id: candId },
      {
        $push: {
          complaints: {
            text,
            status: 'pending',
            createdAt: new Date(),
            reviewedAt: null,
            reviewedBy: null,
          },
        },
      }
    );

    return res.json({ success: true });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to submit complaint' });
  }
};

exports.deleteMyAccount = async (req, res) => {
  try {
    const u = requireJWTUser(req);
    const candId = normalizeCandId(u.cand_id);

    const user = await User.findOne({ cand_id: candId }).select('cand_id profile_picture').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // Best-effort remove profile picture file (if stored locally)
    try {
      const pic = String(user.profile_picture || '');
      if (pic.startsWith('/uploads/')) {
        const absolute = path.join(__dirname, '..', pic.replace(/^\//, ''));
        if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
      }
    } catch (_) {
    }

    await Promise.all([
      User.deleteOne({ cand_id: candId }),
      ChatMembership.deleteMany({ user_cand_id: candId }),
      ChatMessage.deleteMany({ sender_cand_id: candId }),
      ChatInvite.deleteMany({ $or: [{ from_cand_id: candId }, { to_cand_id: candId }] }),
      ChatBlock.deleteMany({ $or: [{ blocker_cand_id: candId }, { blocked_cand_id: candId }] }),
      History.deleteMany({ user_id: candId }),
    ]);

    if (req.user) {
      req.user = null;
      return res.json({ success: true });
    } else {
      return res.json({ success: true });
    }
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to delete account' });
  }
};

exports.getPendingProgramUpdate = async (req, res) => {
  try {
    const u = requireJWTUser(req);
    const candId = normalizeCandId(u.cand_id);
    const user = await User.findOne({ cand_id: candId }).select('program_update_request program').lean();
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const request = user.program_update_request || null;
    const isPending = String(request?.status || 'none') === 'pending';

    return res.json({
      success: true,
      pending: isPending,
      request: isPending
        ? {
            source_program: request.source_program,
            target_program: request.target_program,
            message: request.message,
            requested_at: request.requested_at || null,
          }
        : null,
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to load pending program update request' });
  }
};

exports.respondProgramUpdate = async (req, res) => {
  try {
    const u = requireJWTUser(req);
    const candId = normalizeCandId(u.cand_id);
    const response = String(req.body?.response || '').trim().toLowerCase();
    if (!['accept', 'reject'].includes(response)) {
      return res.status(400).json({ success: false, message: 'response must be accept or reject' });
    }

    const user = await User.findOne({ cand_id: candId });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const request = user.program_update_request || null;
    if (String(request?.status || 'none') !== 'pending') {
      return res.status(400).json({ success: false, message: 'No pending program update request found.' });
    }

    if (response === 'accept') {
      user.program = String(request.target_program || user.program).toUpperCase();
      user.preferred_language = ['BTS', 'LICENCE', 'MASTER'].includes(user.program) ? 'fr' : 'en';
      user.program_update_request = {
        ...request,
        status: 'accepted',
        responded_at: new Date(),
      };
      await user.save();
      return res.json({ success: true, message: `Your program has been updated to ${user.program}.` });
    }

    user.program_update_request = {
      ...request,
      status: 'rejected',
      responded_at: new Date(),
    };
    await user.save();
    return res.json({ success: true, message: 'Program update request declined.' });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to submit program update response' });
  }
};
