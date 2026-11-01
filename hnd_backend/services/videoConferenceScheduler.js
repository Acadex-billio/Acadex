'use strict';

const LecturerBooking = require('../models/LecturerBooking');
const ChatVideoCall = require('../models/ChatVideoCall');
const { RoomServiceClient } = require('livekit-server-sdk');
const logger = require('../utils/logger');
const { getMeetingTimeline } = require('./videoConferencePolicy');
const { CHAT_VIDEO_CALL_MAX_DURATION_MS } = require('./chatVideoCallPolicy');

let timer = null;
let running = false;

function getRoomServiceClient() {
  const serverUrl = String(process.env.LIVEKIT_URL || process.env.LIVEKIT_WS_URL || '').trim();
  const apiKey = String(process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || '').trim();
  if (!serverUrl || !apiKey || !apiSecret) {
    throw new Error('LiveKit is not configured on the server.');
  }

  const serviceUrl = serverUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
  return new RoomServiceClient(serviceUrl, apiKey, apiSecret);
}

async function endExpiredVideoConferences(now = new Date()) {
  if (running) return { scanned: 0, ended: 0 };
  running = true;
  let scanned = 0;
  let ended = 0;

  try {
    const bookings = await LecturerBooking.find({
      session_mode: 'video',
      conference_room_code: { $type: 'string', $ne: '' },
      conference_ended_at: null,
      scheduled_for: { $lte: now },
      $expr: {
        $lte: [
          {
            $add: [
              '$scheduled_for',
              { $multiply: [{ $max: [15, { $ifNull: ['$duration_minutes', 60] }] }, 60000] },
            ],
          },
          now,
        ],
      },
    }).limit(200);
    scanned = bookings.length;
    const expiredCalls = await ChatVideoCall.find({
      cleanup_completed_at: null,
      $or: [
        { started_at: { $lte: new Date(now.getTime() - CHAT_VIDEO_CALL_MAX_DURATION_MS) } },
        { ended_at: { $ne: null } },
      ],
    }).limit(100);
    if (!bookings.length && !expiredCalls.length) return { scanned, ended };

    const roomService = getRoomServiceClient();
    for (const booking of bookings) {
      const timeline = getMeetingTimeline(booking, now);
      if (!timeline.hasEnded) continue;

      try {
        const roomsInService = await roomService.listRooms([booking.conference_room_code]);
        if (roomsInService.some((room) => room.name === booking.conference_room_code)) {
          await roomService.deleteRoom(booking.conference_room_code);
        }
        const result = await LecturerBooking.updateOne(
          { _id: booking._id, conference_ended_at: null },
          { $set: { conference_ended_at: timeline.end } }
        );
        if (result.modifiedCount) ended += 1;
      } catch (error) {
        logger.error('video_conference.auto_end_failed', {
          booking_id: String(booking._id),
          room_name: booking.conference_room_code,
          message: error?.message || error,
        });
      }
    }

    for (const call of expiredCalls) {
      try {
        const roomsInService = await roomService.listRooms([call.livekit_room_name]);
        if (roomsInService.some((room) => room.name === call.livekit_room_name)) {
          await roomService.deleteRoom(call.livekit_room_name);
        }
        const result = await ChatVideoCall.updateOne(
          { _id: call._id, cleanup_completed_at: null },
          {
            $set: {
              ended_at: call.ended_at || new Date(call.started_at.getTime() + CHAT_VIDEO_CALL_MAX_DURATION_MS),
              cleanup_completed_at: now,
            },
          }
        );
        if (result.modifiedCount) ended += 1;
      } catch (error) {
        logger.error('chat_video_call.auto_end_failed', {
          call_id: String(call._id),
          room_name: call.livekit_room_name,
          message: error?.message || error,
        });
      }
    }

    if (ended) logger.info('video_conference.auto_ended', { scanned, ended });
    return { scanned, ended };
  } catch (error) {
    logger.error('video_conference.scheduler_failed', {
      message: error?.message || error,
      stack: error?.stack,
    });
    return { scanned, ended };
  } finally {
    running = false;
  }
}

function startVideoConferenceScheduler() {
  if (timer) return;
  const intervalMs = Number.parseInt(process.env.VIDEO_CONFERENCE_END_INTERVAL_MS || '15000', 10);
  const safeIntervalMs = Number.isFinite(intervalMs) && intervalMs >= 5000 ? intervalMs : 15000;
  timer = setInterval(() => {
    endExpiredVideoConferences().catch((error) => {
      logger.error('video_conference.scheduler_unhandled_error', {
        message: error?.message || error,
      });
    });
  }, safeIntervalMs);
  endExpiredVideoConferences();
  logger.info('video_conference.scheduler_started', { interval_ms: safeIntervalMs });
}

module.exports = { endExpiredVideoConferences, startVideoConferenceScheduler };
