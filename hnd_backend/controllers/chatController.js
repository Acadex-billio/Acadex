const crypto = require('crypto');

const ChatRoom = require('../models/ChatRoom');
const ChatMembership = require('../models/ChatMembership');
const ChatMessage = require('../models/ChatMessage');
const ChatInvite = require('../models/ChatInvite');
const ChatBlock = require('../models/ChatBlock');
const History = require('../models/History');
const Department = require('../models/Department');
const User = require('../models/User');
const { sendBulkPushNotification, isWebPushConfigured } = require('../utils/webPush');
const { uploadFile, getS3ObjectStream } = require('../utils/s3Uploader');
const { resolveSubscription } = require('../utils/subscriptionUtils');
const { getCenterPricing } = require('../utils/subscriptionCatalog');
const { consumeCenterAuthorization } = require('./subscriptionController');

const INVITE_LEN_BYTES = 9; // 12 chars base64url-ish after sanitize

const makeInviteCode = () => {
  return crypto
    .randomBytes(INVITE_LEN_BYTES)
    .toString('base64')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, 12);
};

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
    if (!res.headersSent) {
      res.status(404).json({ success: false, message: 'Attachment not found' });
    }
  });

  stream.pipe(res);
  return true;
};

exports.getRoomMembers = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const { roomId } = req.params;
    const q = String(req.query.q || '').trim();

    const membership = await ChatMembership.findOne({ room_id: roomId, user_cand_id: candId, left_at: null }).lean();
    if (!membership) return res.status(403).json({ success: false, message: 'Not a member of this room' });

    const mems = await ChatMembership.find({ room_id: roomId, left_at: null }).select('user_cand_id').lean();
    const candIds = mems.map((m) => String(m.user_cand_id)).filter(Boolean);

    const userQuery = { cand_id: { $in: candIds } };
    if (q) {
      const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      userQuery.$or = [{ cand_id: { $regex: escapedQ, $options: 'i' } }, { name: { $regex: escapedQ, $options: 'i' } }];
    }

    const users = await User.find(userQuery)
      .select('cand_id name dpt_id')
      .populate('dpt_id', 'department_name abbreviation')
      .limit(120)
      .lean();

    return res.json({
      success: true,
      members: users
        .map((x) => ({
          cand_id: x.cand_id,
          name: x.name,
          department_name: x.dpt_id?.department_name || null,
          department_abbreviation: x.dpt_id?.abbreviation || null,
        }))
        .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))),
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to list members' });
  }
};

exports.setBlock = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const other = normalizeCandId(req.params.otherCandId);
    const blocked = Boolean(req.body?.blocked);

    if (!other) return res.status(400).json({ success: false, message: 'Other user required' });
    if (other === candId) return res.status(400).json({ success: false, message: 'Cannot block yourself' });

    if (blocked) {
      await ChatBlock.updateOne(
        { blocker_cand_id: candId, blocked_cand_id: other },
        { $setOnInsert: { blocker_cand_id: candId, blocked_cand_id: other } },
        { upsert: true }
      );
    } else {
      await ChatBlock.deleteOne({ blocker_cand_id: candId, blocked_cand_id: other });
    }

    return res.json({ success: true, blocked });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to update block' });
  }
};

exports.getBlockStatus = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const other = normalizeCandId(req.params.otherCandId);
    if (!other) return res.status(400).json({ success: false, message: 'Other user required' });

    const blocks = await ChatBlock.find({
      $or: [
        { blocker_cand_id: candId, blocked_cand_id: other },
        { blocker_cand_id: other, blocked_cand_id: candId }
      ]
    }).lean();
    
    const blocked_by_me = blocks.some(b => b.blocker_cand_id === candId && b.blocked_cand_id === other);
    const blocked_me = blocks.some(b => b.blocker_cand_id === other && b.blocked_cand_id === candId);
    return res.json({ success: true, blocked_by_me, blocked_me });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to get block status' });
  }
};

function normalizeCandId(v) {
  return String(v || '').trim();
}

function isAdminUser(user) {
  const role = String(user?.role || '').toLowerCase();
  return Boolean(user?.is_admin) || role === 'admin' || role === 'superadmin' || role === 'developer';
}

function getUserProgram(user) {
  return String(user?.program || 'HND').toUpperCase();
}

function requireSessionUser(req) {
  const u = req.user;
  if (!u?.cand_id) {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    throw err;
  }
  return u;
}

module.exports.requireSessionUser = requireSessionUser;

async function getCandidateSubscriptionForChat(candId) {
  const user = await User.findOne({ cand_id: candId }).select('subscription').lean();
  return resolveSubscription(user?.subscription || null);
}

const buildGeneralDescription = (academicYear) => {
  const year = String(academicYear || '').trim() || String(new Date().getFullYear());
  return `A community space for all candidates in the academic year (${year}). Meet your peers, discuss exam topics, and keep the environment peaceful and conducive for everyone.`;
};

const buildDepartmentDescription = (dept) => {
  if (!dept) return null;
  const name = String(dept.department_name || '').trim();
  const abbr = String(dept.abbreviation || '').trim();
  const motto = String(dept.motto || '').trim();

  const parts = [];
  if (name && abbr) parts.push(`${name} (${abbr}) Department group`);
  else if (name) parts.push(`${name} Department group`);
  else if (abbr) parts.push(`${abbr} Department group`);
  else parts.push('Department group');

  if (motto) parts.push(`Motto: ${motto}`);
  parts.push('Connect with your coursemates, share resources, and stay updated on departmental announcements and exam tips.');
  return parts.join('. ');
};

const buildAdminDescription = () => {
  return 'Official admin-only communication channel for platform operations, moderation updates, and coordination.';
};

exports.clearChat = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const { roomId } = req.params;

    const membership = await ChatMembership.findOne({ room_id: roomId, user_cand_id: candId, left_at: null }).lean();
    if (!membership) return res.status(403).json({ success: false, message: 'Not a member of this room' });

    await ChatMessage.deleteMany({ room_id: roomId });
    return res.json({ success: true });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to clear chat' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const { roomId } = req.params;

    const membership = await ChatMembership.findOne({ room_id: roomId, user_cand_id: candId, left_at: null });
    if (!membership) return res.status(403).json({ success: false, message: 'Not a member of this room' });

    membership.last_read_at = new Date();
    membership.last_active_at = new Date();
    await membership.save();

    return res.json({ success: true });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to mark read' });
  }
};

exports.searchUsers = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const program = getUserProgram(u);
    const q = String(req.query.q || '').trim();
    if (!q) return res.json({ success: true, users: [] });

    const escapedQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await User.find({
      cand_id: { $ne: candId },
      program,
      $or: [
        { cand_id: { $regex: escapedQ, $options: 'i' } },
        { name: { $regex: escapedQ, $options: 'i' } },
        { email: { $regex: escapedQ, $options: 'i' } },
      ],
    })
      .select('cand_id name profile_picture dpt_id')
      .limit(12)
      .lean();

    return res.json({
      success: true,
      users: users.map((x) => ({
        cand_id: x.cand_id,
        name: x.name,
        profile_picture: x.profile_picture,
        dpt_id: x.dpt_id,
      })),
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to search users' });
  }
};

const ensureMembership = async (roomId, candId, role = 'member', opts = {}) => {
  const { revive = true } = opts;
  
  const updateData = { room_id: roomId, user_cand_id: candId, role };
  if (revive) {
    updateData.left_at = null; // Revive the membership by clearing left_at
  }
  
  try {
    await ChatMembership.findOneAndUpdate(
      { room_id: roomId, user_cand_id: candId },
      { $set: updateData },
      { upsert: true, returnDocument: 'after' }
    );
  } catch (err) {
    // If we get a duplicate key error, it means another thread just created it
    // In that case, just update it if revive is true
    if (err.code === 11000 && revive) {
      await ChatMembership.updateOne(
        { room_id: roomId, user_cand_id: candId },
        { $set: { left_at: null } }
      );
    } else {
      throw err;
    }
  }
};

exports.joinRoom = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const program = getUserProgram(u);
    const { roomId } = req.params;

    const room = await ChatRoom.findById(roomId).select('_id type program').lean();
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (room.type === 'admin' && !isAdminUser(u)) {
      return res.status(403).json({ success: false, message: 'Only admins can join this room' });
    }
    if (String(room.program || 'HND').toUpperCase() !== program) {
      return res.status(403).json({ success: false, message: 'Not authorized to access this room' });
    }

    await ensureMembership(roomId, candId, 'member', { revive: true });

    if (room.type === 'center') {
      try {
        await History.create({
          user_id: candId,
          user_name: String(u.name || '').trim() || null,
          content_type: 'chat_center',
          content_title: 'Joined a center room',
          action: 'center_join',
        });
      } catch (_) {
        // Non-blocking
      }
    }

    return res.json({ success: true });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to join room' });
  }
};

const getOrCreateGeneralRoom = async (program) => {
  const anyUser = await User.findOne({ program, academic_year: { $ne: null } }).select('academic_year').lean();
  const description = buildGeneralDescription(anyUser?.academic_year);
  
  const room = await ChatRoom.findOneAndUpdate(
    { type: 'general', program },
    { type: 'general', name: 'General Chat', description, program },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).lean();
  
  return room;
};

const getOrCreateDepartmentRoom = async (deptObjectId, program) => {
  if (!deptObjectId) return null;
  
  const dept = await Department.findOne({ _id: deptObjectId, program }).select('department_name abbreviation motto').lean();
  if (!dept) return null;
  const name = dept?.department_name ? `${dept.department_name} Department` : 'Department Chat';
  const description = buildDepartmentDescription(dept);
  
  const room = await ChatRoom.findOneAndUpdate(
    { type: 'department', dpt_id: deptObjectId, program },
    { type: 'department', name, description, dpt_id: deptObjectId, program },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).lean();
  
  return room;
};

const getOrCreateAdminRoom = async (program) => {
  const room = await ChatRoom.findOneAndUpdate(
    { type: 'admin', program },
    { type: 'admin', name: 'Admin Chat', description: buildAdminDescription(), program },
    { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
  ).lean();
  return room;
};

exports.bootstrap = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const program = getUserProgram(u);

    if (isAdminUser(u)) {
      const adminRoom = await getOrCreateAdminRoom(program);
      await ensureMembership(adminRoom._id, candId, 'member', { revive: false });
    } else {
      const general = await getOrCreateGeneralRoom(program);
      await ensureMembership(general._id, candId, 'member', { revive: false });

      const deptRoom = await getOrCreateDepartmentRoom(u.dpt_id, program);
      if (deptRoom) await ensureMembership(deptRoom._id, candId, 'member', { revive: false });
    }

    return res.json({ success: true });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Bootstrap failed' });
  }
};

exports.listRooms = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const program = getUserProgram(u);
    const candId = normalizeCandId(u.cand_id);

    await exports.bootstrap(req, { json: () => {} });

    const memberships = await ChatMembership.find({ user_cand_id: candId, left_at: null })
      .populate('room_id', 'type name description dpt_id invite_code created_by dm_key createdAt program')
      .lean();

    const roomIds = memberships.filter((m) => m.room_id?._id).map((m) => m.room_id._id);
    const lastReadByRoomId = new Map(memberships.map((m) => [String(m.room_id?._id), m.last_read_at || null]));

    const memberCounts = await ChatMembership.aggregate([
      { $match: { room_id: { $in: roomIds }, left_at: null } },
      { $group: { _id: '$room_id', member_count: { $sum: 1 } } },
    ]);
    const memberCountByRoomId = new Map(memberCounts.map((x) => [String(x._id), x.member_count]));

    const stats = await ChatMessage.aggregate([
      { $match: { room_id: { $in: roomIds } } },
      {
        $group: {
          _id: '$room_id',
          message_count: { $sum: 1 },
          last_message_at: { $max: '$createdAt' },
        },
      },
    ]);
    const statsByRoomId = new Map(stats.map((s) => [String(s._id), s]));

    const unreadCounts = await Promise.all(
      roomIds.map(async (rid) => {
        const lastRead = lastReadByRoomId.get(String(rid));
        const q = {
          room_id: rid,
          sender_cand_id: { $ne: candId },
        };
        if (lastRead) q.createdAt = { $gt: lastRead };
        const n = await ChatMessage.countDocuments(q);
        return [String(rid), n];
      })
    );
    const unreadByRoomId = new Map(unreadCounts);

    const dmOtherIds = [];
    for (const m of memberships) {
      const r = m.room_id;
      if (!r || r.type !== 'dm') continue;
      const key = String(r.dm_key || '');
      if (!key.includes('|')) continue;
      const [a, b] = key.split('|');
      const other = a === candId ? b : b === candId ? a : null;
      if (other) dmOtherIds.push(other);
    }

    const dmOtherUnique = Array.from(new Set(dmOtherIds));
    const blocks = dmOtherUnique.length
      ? await ChatBlock.find({
          $or: [
            { blocker_cand_id: candId, blocked_cand_id: { $in: dmOtherUnique } },
            { blocker_cand_id: { $in: dmOtherUnique }, blocked_cand_id: candId },
          ],
        })
          .select('blocker_cand_id blocked_cand_id')
          .lean()
      : [];
    const blockedByMe = new Set(
      blocks.filter((b) => String(b.blocker_cand_id) === candId).map((b) => String(b.blocked_cand_id))
    );
    const blockedMe = new Set(
      blocks.filter((b) => String(b.blocked_cand_id) === candId).map((b) => String(b.blocker_cand_id))
    );

    const dmOtherUsers = dmOtherUnique.length
      ? await User.find({ cand_id: { $in: dmOtherUnique } }).select('cand_id name').lean()
      : [];
    const dmOtherNameByCandId = new Map(dmOtherUsers.map((x) => [String(x.cand_id), x.name || x.cand_id]));

    const createdByIds = memberships
      .map((m) => String(m.room_id?.created_by || ''))
      .filter((x) => x);
    const createdByUsers = createdByIds.length
      ? await User.find({ cand_id: { $in: Array.from(new Set(createdByIds)) } }).select('cand_id name').lean()
      : [];
    const createdByNameByCandId = new Map(createdByUsers.map((x) => [String(x.cand_id), x.name || x.cand_id]));

    const rooms = memberships
      .filter((m) => m.room_id && String(m.room_id.program || 'HND').toUpperCase() === program)
      .map((m) => ({
        room_id: m.room_id._id,
        type: m.room_id.type,
        name: m.room_id.name,
        description: m.room_id.description || null,
        dpt_id: m.room_id.dpt_id || null,
        invite_code: m.room_id.invite_code || null,
        created_by: m.room_id.created_by || null,
        created_by_name: m.room_id.created_by ? createdByNameByCandId.get(String(m.room_id.created_by)) || m.room_id.created_by : null,
        dm_key: m.room_id.dm_key || null,
        muted: Boolean(m.muted),
        role: m.role || 'member',
        createdAt: m.room_id.createdAt,
        member_count: memberCountByRoomId.get(String(m.room_id._id)) || 0,
        message_count: statsByRoomId.get(String(m.room_id._id))?.message_count || 0,
        last_message_at: statsByRoomId.get(String(m.room_id._id))?.last_message_at || null,
        unread_count: unreadByRoomId.get(String(m.room_id._id)) || 0,
        dm_other_cand_id: (() => {
          if (m.room_id.type !== 'dm') return null;
          const key = String(m.room_id.dm_key || '');
          if (!key.includes('|')) return null;
          const [a, b] = key.split('|');
          return a === candId ? b : b === candId ? a : null;
        })(),
        dm_blocked_by_me: (() => {
          if (m.room_id.type !== 'dm') return false;
          const key = String(m.room_id.dm_key || '');
          if (!key.includes('|')) return false;
          const [a, b] = key.split('|');
          const other = a === candId ? b : b === candId ? a : null;
          if (!other) return false;
          return blockedByMe.has(String(other));
        })(),
        dm_blocked_me: (() => {
          if (m.room_id.type !== 'dm') return false;
          const key = String(m.room_id.dm_key || '');
          if (!key.includes('|')) return false;
          const [a, b] = key.split('|');
          const other = a === candId ? b : b === candId ? a : null;
          if (!other) return false;
          return blockedMe.has(String(other));
        })(),
        dm_other_name: (() => {
          if (m.room_id.type !== 'dm') return null;
          const key = String(m.room_id.dm_key || '');
          if (!key.includes('|')) return null;
          const [a, b] = key.split('|');
          const other = a === candId ? b : b === candId ? a : null;
          if (!other) return null;
          return dmOtherNameByCandId.get(String(other)) || other;
        })(),
      }))
      .sort((a, b) => {
        const ta = a.last_message_at ? new Date(a.last_message_at).getTime() : new Date(a.createdAt).getTime();
        const tb = b.last_message_at ? new Date(b.last_message_at).getTime() : new Date(b.createdAt).getTime();
        return tb - ta;
      });

    const visibleRooms = isAdminUser(u)
      ? rooms.filter((r) => r.type === 'admin')
      : rooms.filter((r) => r.type !== 'admin');

    return res.json({ success: true, rooms: visibleRooms });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to list rooms' });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const { roomId } = req.params;

    const membership = await ChatMembership.findOne({ room_id: roomId, user_cand_id: candId, left_at: null }).lean();
    if (!membership) return res.status(403).json({ success: false, message: 'Not a member of this room' });

    const room = await ChatRoom.findById(roomId).select('type').lean();
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (room.type === 'admin' && !isAdminUser(u)) {
      return res.status(403).json({ success: false, message: 'Not authorized for admin chat' });
    }

    const limit = Math.min(Number(req.query.limit || 60), 200);
    await ChatMembership.updateOne(
      { room_id: roomId, user_cand_id: candId, left_at: null },
      { $set: { last_active_at: new Date() } }
    );

    const messages = await ChatMessage.find({ room_id: roomId })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    const memberships = await ChatMembership.find({ room_id: roomId, left_at: null })
      .select('user_cand_id last_read_at last_active_at')
      .lean();

    const senderIds = Array.from(new Set(messages.map((m) => String(m.sender_cand_id))));
    const senders = senderIds.length
      ? await User.find({ cand_id: { $in: senderIds } }).select('cand_id name').lean()
      : [];
    const senderNameByCandId = new Map(senders.map((x) => [String(x.cand_id), x.name || x.cand_id]));

    const replyIds = Array.from(
      new Set(messages.map((m) => String(m.reply_to_message_id || '')).filter(Boolean))
    );
    const replyMessages = replyIds.length
      ? await ChatMessage.find({ _id: { $in: replyIds }, room_id: roomId })
          .select('_id sender_cand_id text attachment_name')
          .lean()
      : [];
    const replyMessageById = new Map(replyMessages.map((m) => [String(m._id), m]));

    return res.json({
      success: true,
      messages: messages
        .reverse()
        .map((m) => ({
          _id: m._id,
          room_id: m.room_id,
          sender_cand_id: m.sender_cand_id,
          sender_name: senderNameByCandId.get(String(m.sender_cand_id)) || m.sender_cand_id,
          text: m.text,
          attachment_url: m.attachment_url || null,
          attachment_name: m.attachment_name || null,
          attachment_mime: m.attachment_mime || null,
          attachment_size: m.attachment_size || null,
          reply_to_message_id: m.reply_to_message_id || null,
          reply_to: (() => {
            if (!m.reply_to_message_id) return null;
            const reply = replyMessageById.get(String(m.reply_to_message_id));
            if (!reply) return null;
            return {
              _id: reply._id,
              sender_cand_id: reply.sender_cand_id,
              sender_name: senderNameByCandId.get(String(reply.sender_cand_id)) || reply.sender_cand_id,
              text: reply.text || '',
              attachment_name: reply.attachment_name || null,
            };
          })(),
          reactions: m.reactions || [],
          deleted_at: m.deleted_at || null,
          status: (() => {
            const recipients = memberships.filter((x) => String(x.user_cand_id) !== String(m.sender_cand_id));
            const total = recipients.length;
            const delivered_count = recipients.filter((x) => x.last_active_at && new Date(x.last_active_at) >= new Date(m.createdAt)).length;
            const read_count = recipients.filter((x) => x.last_read_at && new Date(x.last_read_at) >= new Date(m.createdAt)).length;
            let state = 'sent';
            if (total > 0 && delivered_count >= total) state = 'delivered';
            if (total > 0 && read_count >= total) state = 'read';
            return { state, delivered_count, read_count, total_recipients: total };
          })(),
          createdAt: m.createdAt,
        })),
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to fetch messages' });
  }
};

exports.getMessageAttachment = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const { roomId, messageId } = req.params;

    const membership = await ChatMembership.findOne({ room_id: roomId, user_cand_id: candId, left_at: null }).lean();
    if (!membership) return res.status(403).json({ success: false, message: 'Not a member of this room' });

    const room = await ChatRoom.findById(roomId).select('type').lean();
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (room.type === 'admin' && !isAdminUser(u)) {
      return res.status(403).json({ success: false, message: 'Not authorized for admin chat' });
    }

    const message = await ChatMessage.findOne({ _id: messageId, room_id: roomId })
      .select('attachment_url attachment_name attachment_mime')
      .lean();
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });
    if (!message.attachment_url) return res.status(404).json({ success: false, message: 'No attachment on this message' });

    const mime = String(message.attachment_mime || 'application/octet-stream');
    const name = String(message.attachment_name || 'attachment');

    if (streamS3ToResponse(message.attachment_url, res, 'inline', name, mime)) return;
    return res.status(404).json({ success: false, message: 'Attachment not found' });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to fetch attachment' });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const { roomId } = req.params;
    const text = String(req.body?.text || '').trim();
    const attachment = req.file || null;
    const replyToMessageId = String(req.body?.reply_to_message_id || '').trim();

    if (!text && !attachment) return res.status(400).json({ success: false, message: 'Message or attachment is required' });

    const membership = await ChatMembership.findOne({ room_id: roomId, user_cand_id: candId, left_at: null }).lean();
    if (!membership) return res.status(403).json({ success: false, message: 'Not a member of this room' });

    const room = await ChatRoom.findById(roomId).select('type dm_key').lean();
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    if (room.type === 'admin' && !isAdminUser(u)) {
      return res.status(403).json({ success: false, message: 'Only admins can post in this room' });
    }

    let replyTo = null;
    if (replyToMessageId) {
      replyTo = await ChatMessage.findOne({ _id: replyToMessageId, room_id: roomId }).select('_id').lean();
      if (!replyTo) return res.status(400).json({ success: false, message: 'Reply target not found' });
    }

    if (room.type === 'dm') {
      const key = String(room.dm_key || '');
      if (key.includes('|')) {
        const [a, b] = key.split('|');
        const other = a === candId ? b : b === candId ? a : null;
        if (other) {
          const blocked = await ChatBlock.findOne({ blocker_cand_id: other, blocked_cand_id: candId }).lean();
          if (blocked) {
            return res.json({
              success: false,
              blocked: true,
              auto_message: {
                _id: `blocked-${Date.now()}`,
                room_id: roomId,
                sender_cand_id: 'system',
                sender_name: 'System',
                text: 'This candidate has blocked you',
                createdAt: new Date(),
              },
            });
          }
        }
      }
    }

    let attachmentData = null;
    if (attachment?.buffer && attachment?.originalname) {
      const uploaded = await uploadFile(
        attachment.buffer,
        attachment.originalname,
        attachment.mimetype,
        'chat-attachments'
      );
      attachmentData = {
        attachment_url: uploaded?.url || null,
        attachment_name: attachment.originalname || null,
        attachment_mime: attachment.mimetype || null,
        attachment_size: Number(attachment.size || 0),
      };
    }

    const msg = await ChatMessage.create({
      room_id: roomId,
      sender_cand_id: candId,
      text,
      reply_to_message_id: replyTo?._id || null,
      ...(attachmentData || {}),
    });

    await ChatMembership.updateOne(
      { room_id: roomId, user_cand_id: candId, left_at: null },
      { $set: { last_active_at: new Date() } }
    );

    const me = await User.findOne({ cand_id: candId }).select('name cand_id').lean();
    // Send push notifications to other room members
    if (isWebPushConfigured) {
      const memberships = await ChatMembership.find({ 
        room_id: roomId, 
        left_at: null, 
        user_cand_id: { $ne: candId } 
      }).select('user_cand_id').lean();

      if (memberships.length) {
        const recipientCandIds = memberships.map(m => String(m.user_cand_id));
        const recipients = await User.find({ 
          cand_id: { $in: recipientCandIds },
          allow_push_notifications: true,
          push_subscription: { $ne: null }
        }).select('cand_id push_subscription allow_push_notifications').lean();

        if (recipients.length) {
          const roomDetail = await ChatRoom.findById(roomId).select('name type').lean();
          const roomName = roomDetail?.name || 'Chat';
          const senderName = me?.name || candId;
          const previewText = text || (attachmentData ? 'Sent an attachment' : 'New message');

          await sendBulkPushNotification(
            recipients,
            'chat',
            `New message in ${roomName}`,
            `${senderName}: ${previewText.substring(0, 100)}${previewText.length > 100 ? '...' : ''}`,
            '/candidate/chat',
            String(roomId)
          );
        }
      }
    }

    return res.json({
      success: true,
      message: {
        _id: msg._id,
        room_id: msg.room_id,
        sender_cand_id: msg.sender_cand_id,
        sender_name: me?.name || candId,
        text: msg.text,
        attachment_url: msg.attachment_url || null,
        attachment_name: msg.attachment_name || null,
        attachment_mime: msg.attachment_mime || null,
        attachment_size: msg.attachment_size || null,
        reply_to_message_id: msg.reply_to_message_id || null,
        createdAt: msg.createdAt,
      },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to send message' });
  }
};

exports.setMute = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const { roomId } = req.params;
    const { muted } = req.body;

    if (typeof muted !== 'boolean') return res.status(400).json({ success: false, message: 'muted must be boolean' });

    const membership = await ChatMembership.findOne({ room_id: roomId, user_cand_id: candId, left_at: null });
    if (!membership) return res.status(403).json({ success: false, message: 'Not a member of this room' });

    membership.muted = muted;
    await membership.save();
    return res.json({ success: true, muted });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to update mute' });
  }
};

exports.leaveRoom = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const { roomId } = req.params;

    const room = await ChatRoom.findById(roomId).select('type').lean();
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (room.type === 'admin') return res.status(400).json({ success: false, message: 'Cannot leave the admin room' });

    await ChatMembership.updateOne(
      { room_id: roomId, user_cand_id: candId },
      { $set: { left_at: new Date() } }
    );

    return res.json({ success: true });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to leave room' });
  }
};

exports.createCenter = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    if (isAdminUser(u)) return res.status(403).json({ success: false, message: 'Admins cannot create center chats' });
    const candId = normalizeCandId(u.cand_id);
    const subscription = await getCandidateSubscriptionForChat(candId);
    const program = getUserProgram(u);
    const name = String(req.body?.name || '').trim();
    const description = String(req.body?.description || '').trim();
    const paymentTransactionId = String(req.body?.paymentTransactionId || '').trim();

    if (!name) return res.status(400).json({ success: false, message: 'Center name is required' });
    if (!description) return res.status(400).json({ success: false, message: 'Center description is required' });

    if (subscription.plan === 'basic') {
      return res.status(403).json({
        success: false,
        code: 'PLAN_UPGRADE_REQUIRED',
        message: 'Your account plan does not permit creating centers. Upgrade to Pro or use PAYGO to unlock this feature.',
      });
    }

    if (subscription.plan === 'paygo') {
      if (!paymentTransactionId) {
        const pricing = await getCenterPricing('create', subscription.plan || 'paygo');
        return res.status(402).json({
          success: false,
          code: 'PAYMENT_REQUIRED',
          message: 'Creating a center chat on PAYGO requires payment first.',
          payment_requirement: {
            title: 'Unlock center creation',
            message: `Pay ${pricing.amount} ${pricing.currency} to create this center chat.`,
            action: 'create',
            amount: pricing.amount,
            currency: pricing.currency,
            resource_type: 'chat_room',
            resource_id: 'new-center',
            purpose_code: pricing.code,
          },
        });
      }
      await consumeCenterAuthorization({ candId, transactionId: paymentTransactionId, action: 'create' });
    }

    let invite_code = makeInviteCode();
    for (let i = 0; i < 5; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      const exists = await ChatRoom.findOne({ invite_code }).lean();
      if (!exists) break;
      invite_code = makeInviteCode();
    }

    const room = await ChatRoom.create({
      type: 'center',
      program,
      name,
      description,
      created_by: candId,
      invite_code,
    });

    await ensureMembership(room._id, candId, 'owner');

    try {
      await History.create({
        user_id: candId,
        user_name: String(u.name || '').trim() || null,
        content_type: 'chat_center',
        content_title: String(room.name || 'Center chat created'),
        action: 'center_create',
      });
    } catch (_) {
      // Non-blocking
    }

    return res.json({
      success: true,
      room: { room_id: room._id, name: room.name, description: room.description || null, invite_code: room.invite_code },
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to create center' });
  }
};

exports.sendCenterInvite = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const program = getUserProgram(u);
    const { roomId } = req.params;
    const to_cand_id = normalizeCandId(req.body?.to_cand_id);

    if (!to_cand_id) return res.status(400).json({ success: false, message: 'to_cand_id is required' });
    if (to_cand_id === candId) return res.status(400).json({ success: false, message: 'Cannot invite yourself' });

    const room = await ChatRoom.findById(roomId).select('type program').lean();
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });
    if (room.type !== 'center') return res.status(400).json({ success: false, message: 'Invites are only supported for center chats' });
    if (String(room.program || 'HND').toUpperCase() !== program) {
      return res.status(403).json({ success: false, message: 'Not authorized for this room' });
    }

    const inviterMembership = await ChatMembership.findOne({ room_id: roomId, user_cand_id: candId, left_at: null }).lean();
    if (!inviterMembership) return res.status(403).json({ success: false, message: 'Not a member of this room' });

    const existingMember = await ChatMembership.findOne({ room_id: roomId, user_cand_id: to_cand_id, left_at: null }).lean();
    if (existingMember) return res.json({ success: true, already_member: true });

    const toUser = await User.findOne({ cand_id: to_cand_id, program }).select('cand_id').lean();
    if (!toUser) return res.status(404).json({ success: false, message: 'User not found' });

    await ChatInvite.updateOne(
      { room_id: roomId, to_cand_id, status: 'pending' },
      { $setOnInsert: { from_cand_id: candId, to_cand_id, status: 'pending', responded_at: null } },
      { upsert: true }
    );

    return res.json({ success: true });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to send invite' });
  }
};

exports.listMyInvites = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const program = getUserProgram(u);

    const invites = await ChatInvite.find({ to_cand_id: candId, status: 'pending' })
      .sort({ createdAt: -1 })
      .populate('room_id', 'type name description invite_code created_by createdAt program')
      .lean();

    const fromIds = Array.from(new Set(invites.map((x) => String(x.from_cand_id)))).filter((x) => x);
    const fromUsers = fromIds.length ? await User.find({ cand_id: { $in: fromIds } }).select('cand_id name').lean() : [];
    const fromNameByCandId = new Map(fromUsers.map((x) => [String(x.cand_id), x.name || x.cand_id]));

    return res.json({
      success: true,
      invites: invites
        .filter((i) => i.room_id && i.room_id.type === 'center' && String(i.room_id.program || 'HND').toUpperCase() === program)
        .map((i) => ({
          invite_id: i._id,
          room_id: i.room_id._id,
          room_name: i.room_id.name,
          room_description: i.room_id.description || null,
          from_cand_id: i.from_cand_id,
          from_name: fromNameByCandId.get(String(i.from_cand_id)) || i.from_cand_id,
          createdAt: i.createdAt,
        })),
    });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to list invites' });
  }
};

exports.respondToInvite = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const subscription = await getCandidateSubscriptionForChat(candId);
    const program = getUserProgram(u);
    const { inviteId } = req.params;
    const action = String(req.body?.action || '').trim();
    const paymentTransactionId = String(req.body?.paymentTransactionId || '').trim();

    if (!['accept', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'action must be accept or reject' });
    }

    const invite = await ChatInvite.findById(inviteId).lean();
    if (!invite) return res.status(404).json({ success: false, message: 'Invite not found' });
    if (String(invite.to_cand_id) !== candId) return res.status(403).json({ success: false, message: 'Not your invite' });
    if (invite.status !== 'pending') return res.json({ success: true });

    const status = action === 'accept' ? 'accepted' : 'rejected';
    await ChatInvite.updateOne({ _id: inviteId }, { $set: { status, responded_at: new Date() } });

    if (status === 'accepted') {
      const room = await ChatRoom.findById(invite.room_id).select('type program').lean();
      if (room && room.type === 'center' && String(room.program || 'HND').toUpperCase() === program) {
        if (subscription.plan === 'basic') {
          await ChatInvite.updateOne({ _id: inviteId }, { $set: { status: 'pending', responded_at: null } });
          return res.status(403).json({
            success: false,
            code: 'PLAN_UPGRADE_REQUIRED',
            message: 'Your account plan does not permit you to join centers. Upgrade your subscription to unlock this feature.',
          });
        }

        if (subscription.plan === 'paygo') {
          if (!paymentTransactionId) {
            const pricing = await getCenterPricing('join', subscription.plan || 'paygo');
            await ChatInvite.updateOne({ _id: inviteId }, { $set: { status: 'pending', responded_at: null } });
            return res.status(402).json({
              success: false,
              code: 'PAYMENT_REQUIRED',
              message: 'Joining a center chat on PAYGO requires payment first.',
              payment_requirement: {
                title: 'Unlock center invite acceptance',
                message: `Pay ${pricing.amount} ${pricing.currency} to accept this center invite.`,
                action: 'join',
                amount: pricing.amount,
                currency: pricing.currency,
                resource_type: 'chat_room',
                resource_id: String(invite.room_id),
                purpose_code: pricing.code,
              },
            });
          }
          await consumeCenterAuthorization({ candId, transactionId: paymentTransactionId, action: 'join', roomId: invite.room_id });
        }

        await ensureMembership(invite.room_id, candId, 'member', { revive: true });
        try {
          await History.create({
            user_id: candId,
            user_name: String(u.name || '').trim() || null,
            content_type: 'chat_center',
            content_title: 'Joined center via invite',
            action: 'center_join',
          });
        } catch (_) {
          // Non-blocking
        }
      }
    }

    return res.json({ success: true });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to respond to invite' });
  }
};

exports.joinByInvite = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    if (isAdminUser(u)) return res.status(403).json({ success: false, message: 'Admins cannot join center chats' });
    const candId = normalizeCandId(u.cand_id);
    const subscription = await getCandidateSubscriptionForChat(candId);
    const program = getUserProgram(u);
    const code = String(req.params.code || '').trim();
    const paymentTransactionId = String(req.body?.paymentTransactionId || '').trim();

    if (!code) return res.status(400).json({ success: false, message: 'Invite code required' });

    const room = await ChatRoom.findOne({ type: 'center', invite_code: code, program }).lean();
    if (!room) return res.status(404).json({ success: false, message: 'Invalid invite code' });

    if (subscription.plan === 'basic') {
      return res.status(403).json({
        success: false,
        code: 'PLAN_UPGRADE_REQUIRED',
        message: 'Your account plan does not permit you to join centers. Upgrade your subscription to unlock this feature.',
      });
    }

    if (subscription.plan === 'paygo') {
      if (!paymentTransactionId) {
        const pricing = await getCenterPricing('join', subscription.plan || 'paygo');
        return res.status(402).json({
          success: false,
          code: 'PAYMENT_REQUIRED',
          message: 'Joining a center chat on PAYGO requires payment first.',
          payment_requirement: {
            title: 'Unlock center join',
            message: `Pay ${pricing.amount} ${pricing.currency} to join this center chat.`,
            action: 'join',
            amount: pricing.amount,
            currency: pricing.currency,
            resource_type: 'chat_room',
            resource_id: String(room._id),
            purpose_code: pricing.code,
          },
        });
      }
      await consumeCenterAuthorization({ candId, transactionId: paymentTransactionId, action: 'join', roomId: room._id });
    }

    await ensureMembership(room._id, candId);

    try {
      await History.create({
        user_id: candId,
        user_name: String(u.name || '').trim() || null,
        content_type: 'chat_center',
        content_title: String(room.name || 'Joined by invite code'),
        action: 'center_join',
      });
    } catch (_) {
      // Non-blocking
    }

    return res.json({ success: true, room_id: room._id });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to join' });
  }
};

exports.getOrCreateDm = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    if (isAdminUser(u)) return res.status(403).json({ success: false, message: 'Admins use the all-admin room only' });
    const candId = normalizeCandId(u.cand_id);
    const program = getUserProgram(u);
    const other = normalizeCandId(req.params.otherCandId);

    if (!other) return res.status(400).json({ success: false, message: 'Other user required' });
    if (other === candId) return res.status(400).json({ success: false, message: 'Cannot DM yourself' });

    const otherUser = await User.findOne({ cand_id: other, program }).select('cand_id').lean();
    if (!otherUser) return res.status(404).json({ success: false, message: 'User not found in your program' });

    const dm_key = [candId, other].sort().join('|');

    const room = await ChatRoom.findOneAndUpdate(
      { type: 'dm', dm_key, program },
      { type: 'dm', name: 'Direct Message', dm_key, program, created_by: candId },
      { upsert: true, returnDocument: 'after', setDefaultsOnInsert: true }
    ).lean();

    await ensureMembership(room._id, candId);
    await ensureMembership(room._id, other);

    return res.json({ success: true, room_id: room._id });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to create DM' });
  }
};

exports.addReaction = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const { roomId, messageId } = req.params;
    const { emoji } = req.body;

    if (!emoji) return res.status(400).json({ success: false, message: 'Emoji is required' });

    const membership = await ChatMembership.findOne({ room_id: roomId, user_cand_id: candId, left_at: null }).lean();
    if (!membership) return res.status(403).json({ success: false, message: 'Not a member of this room' });

    const room = await ChatRoom.findById(roomId).select('type').lean();
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const message = await ChatMessage.findOne({ _id: messageId, room_id: roomId });
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    const reactionIndex = message.reactions.findIndex((r) => r.emoji === emoji);
    if (reactionIndex > -1) {
      const userIndex = message.reactions[reactionIndex].users.indexOf(candId);
      if (userIndex > -1) {
        message.reactions[reactionIndex].users.splice(userIndex, 1);
        if (message.reactions[reactionIndex].users.length === 0) {
          message.reactions.splice(reactionIndex, 1);
        }
      } else {
        message.reactions[reactionIndex].users.push(candId);
      }
    } else {
      message.reactions.push({ emoji, users: [candId] });
    }

    await message.save();
    return res.json({ success: true, reactions: message.reactions });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to add reaction' });
  }
};

exports.deleteMessage = async (req, res) => {
  try {
    const u = requireSessionUser(req);
    const candId = normalizeCandId(u.cand_id);
    const { roomId, messageId } = req.params;

    const membership = await ChatMembership.findOne({ room_id: roomId, user_cand_id: candId, left_at: null }).lean();
    if (!membership) return res.status(403).json({ success: false, message: 'Not a member of this room' });

    const room = await ChatRoom.findById(roomId).select('type').lean();
    if (!room) return res.status(404).json({ success: false, message: 'Room not found' });

    const message = await ChatMessage.findOne({ _id: messageId, room_id: roomId });
    if (!message) return res.status(404).json({ success: false, message: 'Message not found' });

    const isSender = String(message.sender_cand_id) === candId;
    const isAdmin = isAdminUser(u);
    const secondsOld = (Date.now() - new Date(message.createdAt).getTime()) / 1000;
    const canDelete = isAdmin || (isSender && secondsOld <= 60);

    if (!canDelete) {
      return res.status(403).json({ success: false, message: 'Cannot delete this message. Users can only delete their own messages within 1 minute.' });
    }

    message.deleted_at = new Date();
    await message.save();
    return res.json({ success: true });
  } catch (err) {
    const code = err.statusCode || 500;
    return res.status(code).json({ success: false, message: err.message || 'Failed to delete message' });
  }
};
