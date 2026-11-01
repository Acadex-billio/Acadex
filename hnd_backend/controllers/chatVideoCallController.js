'use strict';

const crypto = require('crypto');
const ChatBlock = require('../models/ChatBlock');
const ChatMembership = require('../models/ChatMembership');
const ChatRoom = require('../models/ChatRoom');
const ChatVideoCall = require('../models/ChatVideoCall');
const User = require('../models/User');
const { isWebPushConfigured, sendBulkPushNotification } = require('../utils/webPush');
const { AccessToken, RoomServiceClient } = require('livekit-server-sdk');
const { getChatVideoCallExpiry } = require('../services/chatVideoCallPolicy');

const getCurrentUserId = (req) => String(req.user?.cand_id || '').trim();

function getLiveKitConfig() {
  const serverUrl = String(process.env.LIVEKIT_URL || process.env.LIVEKIT_WS_URL || '').trim();
  const apiKey = String(process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || '').trim();
  if (!serverUrl || !apiKey || !apiSecret) return null;
  return { serverUrl, apiKey, apiSecret };
}

function getRoomServiceClient(config) {
  const serviceUrl = config.serverUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
  return new RoomServiceClient(serviceUrl, config.apiKey, config.apiSecret);
}

async function getRoomMembership(roomId, candId) {
  const [room, membership] = await Promise.all([
    ChatRoom.findById(roomId).select('_id type dm_key name').lean(),
    ChatMembership.findOne({ room_id: roomId, user_cand_id: candId, left_at: null }).lean(),
  ]);
  if (!room) return { error: { status: 404, message: 'Chat not found.' } };
  if (room.type === 'admin') return { error: { status: 403, message: 'Video calls are not available in admin chats.' } };
  if (!membership) return { error: { status: 403, message: 'You are no longer a member of this chat.' } };

  if (room.type === 'dm') {
    const [first, second] = String(room.dm_key || '').split('|');
    const otherCandId = first === candId ? second : second === candId ? first : '';
    if (!otherCandId) return { error: { status: 403, message: 'This personal chat is not available for calls.' } };
    const block = await ChatBlock.findOne({
      $or: [
        { blocker_cand_id: candId, blocked_cand_id: otherCandId },
        { blocker_cand_id: otherCandId, blocked_cand_id: candId },
      ],
    }).select('_id').lean();
    if (block) return { error: { status: 403, message: 'Video calls are unavailable while this chat is blocked.' } };
  }

  return { room, membership };
}

async function buildParticipantToken({ config, call, room, user, initiator = false }) {
  const expiry = getChatVideoCallExpiry(call);
  if (expiry.expired) throw new Error('This chat video call has expired.');
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    ttl: Math.max(1, Math.ceil((expiry.expiresAt.getTime() - Date.now()) / 1000)),
    identity: String(user.cand_id || '').trim(),
    name: String(user.name || user.cand_id || 'Chat participant').trim(),
    metadata: JSON.stringify({
      chat_room_id: String(room._id),
      chat_type: room.type,
      call_initiator: Boolean(initiator),
    }),
  });
  token.addGrant({
    roomJoin: true,
    room: call.livekit_room_name,
    canSubscribe: true,
    canPublish: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });
  return token.toJwt();
}

async function getActiveCall(roomId) {
  const call = await ChatVideoCall.findOne({ room_id: roomId, ended_at: null });
  if (!call) return null;
  const expiry = getChatVideoCallExpiry(call);
  if (expiry.expired) {
    const config = getLiveKitConfig();
    if (!config) throw new Error('LiveKit is not configured on the server.');
    const roomService = getRoomServiceClient(config);
    const rooms = await roomService.listRooms([call.livekit_room_name]);
    if (rooms.some((room) => room.name === call.livekit_room_name)) {
      await roomService.deleteRoom(call.livekit_room_name);
    }
    await ChatVideoCall.updateOne(
      { _id: call._id, ended_at: null },
      { $set: { ended_at: expiry.expiresAt, cleanup_completed_at: new Date() } }
    );
    return null;
  }
  return call;
}

async function notifyChatMembers({ room, call, callerId }) {
  if (!isWebPushConfigured) return;
  try {
    const memberships = await ChatMembership.find({
      room_id: room._id,
      user_cand_id: { $ne: callerId },
      left_at: null,
    }).select('user_cand_id').lean();
    const candidateIds = memberships.map((membership) => membership.user_cand_id).filter(Boolean);
    if (!candidateIds.length) return;

    const users = await User.find({
      cand_id: { $in: candidateIds },
      allow_push_notifications: { $ne: false },
      push_subscription: { $exists: true, $ne: null },
    }).select('cand_id name email role push_subscription').lean();
    const notificationsByPath = new Map();
    for (const user of users) {
      if (!user.push_subscription?.endpoint) continue;
      const role = String(user.role || '').toLowerCase();
      const path = role === 'lecturer' ? '/lecturer/chat' : role === 'admin' || role === 'developer' ? '/admin/chat' : '/candidate/chat';
      if (!notificationsByPath.has(path)) notificationsByPath.set(path, []);
      notificationsByPath.get(path).push(user);
    }

    await Promise.all(Array.from(notificationsByPath.entries()).map(([path, recipients]) => (
      sendBulkPushNotification(
        recipients,
        'chat_video_call',
        'Free video call',
        `${String(call.started_by_name || 'A chat member')} started a call in ${room.name}. Tap to join.`,
        `${path}?room=${encodeURIComponent(String(room._id))}`,
        String(room._id)
      )
    )));
  } catch (error) {
    console.error('[ChatVideoCall] notifyChatMembers error:', error.message);
  }
}

exports.getCallStatus = async (req, res) => {
  try {
    const candId = getCurrentUserId(req);
    const access = await getRoomMembership(req.params.roomId, candId);
    if (access.error) return res.status(access.error.status).json({ success: false, message: access.error.message });

    const call = await getActiveCall(access.room._id);
    if (!call) return res.json({ success: true, active_call: null });

    const starter = await User.findOne({ cand_id: call.started_by }).select('cand_id name').lean();
    return res.json({
      success: true,
      active_call: {
        call_id: String(call._id),
        started_by: call.started_by,
        started_by_name: starter?.name || call.started_by,
        started_at: call.started_at,
        expires_at: getChatVideoCallExpiry(call).expiresAt,
        is_initiator: call.started_by === candId,
      },
    });
  } catch (error) {
    console.error('[ChatVideoCall] getCallStatus error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load chat call status.' });
  }
};

exports.startCall = async (req, res) => {
  let call;
  let roomService;
  let roomCreated = false;
  try {
    const candId = getCurrentUserId(req);
    const access = await getRoomMembership(req.params.roomId, candId);
    if (access.error) return res.status(access.error.status).json({ success: false, message: access.error.message });

    const activeCall = await getActiveCall(access.room._id);
    if (activeCall) {
      return res.status(409).json({
        success: false,
        message: 'A video call is already active in this chat.',
        active_call: {
          call_id: String(activeCall._id),
          started_by: activeCall.started_by,
          started_at: activeCall.started_at,
        },
      });
    }

    const config = getLiveKitConfig();
    if (!config) {
      return res.status(503).json({ success: false, message: 'Free chat video calls are not configured yet. Contact support.' });
    }
    const user = await User.findOne({ cand_id: candId }).select('cand_id name').lean();
    if (!user) return res.status(401).json({ success: false, message: 'Authenticated user was not found.' });

    const roomName = `chat-${String(access.room._id)}-${crypto.randomUUID().replace(/-/g, '')}`;
    call = await ChatVideoCall.create({
      room_id: access.room._id,
      livekit_room_name: roomName,
      started_by: candId,
      started_at: new Date(),
    });

    roomService = getRoomServiceClient(config);
    await roomService.createRoom({ name: roomName, emptyTimeout: 300 });
    roomCreated = true;
    const livekitToken = await buildParticipantToken({
      config,
      call,
      room: access.room,
      user,
      initiator: true,
    });

    await notifyChatMembers({ room: access.room, call: { ...call.toObject(), started_by_name: user.name }, callerId: candId });

    return res.status(201).json({
      success: true,
      message: 'Free video call started.',
      call: {
        call_id: String(call._id),
        room_name: roomName,
        livekit_url: config.serverUrl,
        livekit_token: livekitToken,
        started_by: candId,
        started_by_name: user.name || candId,
        started_at: call.started_at,
        expires_at: getChatVideoCallExpiry(call).expiresAt,
        is_initiator: true,
      },
    });
  } catch (error) {
    if (call?._id) {
      await ChatVideoCall.deleteOne({ _id: call._id, ended_at: null }).catch((cleanupError) => {
        console.error('[ChatVideoCall] startCall database cleanup error:', cleanupError.message);
      });
    }
    if (roomCreated && roomService && call?.livekit_room_name) {
      await roomService.deleteRoom(call.livekit_room_name).catch((cleanupError) => {
        console.error('[ChatVideoCall] startCall LiveKit cleanup error:', cleanupError.message);
      });
    }
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: 'A video call is already active in this chat.' });
    }
    console.error('[ChatVideoCall] startCall error:', error.message);
    return res.status(503).json({ success: false, message: 'Unable to start a video call right now.' });
  }
};

exports.joinCall = async (req, res) => {
  try {
    const candId = getCurrentUserId(req);
    const access = await getRoomMembership(req.params.roomId, candId);
    if (access.error) return res.status(access.error.status).json({ success: false, message: access.error.message });

    const call = await getActiveCall(access.room._id);
    if (!call) return res.status(404).json({ success: false, message: 'There is no active video call in this chat.' });

    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: 'Free chat video calls are not configured yet. Contact support.' });
    const user = await User.findOne({ cand_id: candId }).select('cand_id name').lean();
    if (!user) return res.status(401).json({ success: false, message: 'Authenticated user was not found.' });

    const livekitToken = await buildParticipantToken({
      config,
      call,
      room: access.room,
      user,
      initiator: call.started_by === candId,
    });
    return res.json({
      success: true,
      call: {
        call_id: String(call._id),
        room_name: call.livekit_room_name,
        livekit_url: config.serverUrl,
        livekit_token: livekitToken,
        started_by: call.started_by,
        started_at: call.started_at,
        expires_at: getChatVideoCallExpiry(call).expiresAt,
        is_initiator: call.started_by === candId,
      },
    });
  } catch (error) {
    console.error('[ChatVideoCall] joinCall error:', error.message);
    return res.status(503).json({ success: false, message: error.message || 'Unable to join the video call.' });
  }
};

exports.endCall = async (req, res) => {
  let callMarkedEnded = false;
  try {
    const candId = getCurrentUserId(req);
    const access = await getRoomMembership(req.params.roomId, candId);
    if (access.error) return res.status(access.error.status).json({ success: false, message: access.error.message });

    const call = await ChatVideoCall.findOne({ room_id: access.room._id, ended_at: null });
    if (!call) return res.json({ success: true, message: 'There is no active video call.' });
    if (call.started_by !== candId) {
      return res.status(403).json({ success: false, message: 'Only the person who started the call can end it for everyone.' });
    }

    const config = getLiveKitConfig();
    if (!config) return res.status(503).json({ success: false, message: 'Live video service is not configured.' });
    const roomService = getRoomServiceClient(config);
    const endedAt = new Date();
    const update = await ChatVideoCall.updateOne(
      { _id: call._id, ended_at: null },
      { $set: { ended_at: endedAt, ended_by: candId } }
    );
    if (!update.modifiedCount) {
      return res.json({ success: true, message: 'Video call has already ended.' });
    }
    callMarkedEnded = true;

    const rooms = await roomService.listRooms([call.livekit_room_name]);
    if (rooms.some((room) => room.name === call.livekit_room_name)) {
      await roomService.deleteRoom(call.livekit_room_name);
    }
    await ChatVideoCall.updateOne(
      { _id: call._id, cleanup_completed_at: null },
      { $set: { cleanup_completed_at: new Date() } }
    );
    return res.json({ success: true, message: 'Video call ended for everyone.' });
  } catch (error) {
    console.error('[ChatVideoCall] endCall error:', error.message);
    if (callMarkedEnded) {
      return res.status(202).json({
        success: true,
        cleanup_pending: true,
        message: 'The call has ended. LiveKit is still disconnecting participants.',
      });
    }
    return res.status(503).json({ success: false, message: 'Unable to end the video call right now.' });
  }
};
