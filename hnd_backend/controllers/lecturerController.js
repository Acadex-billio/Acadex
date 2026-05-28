'use strict';

const crypto = require('crypto');
const multer = require('multer');
const User = require('../models/User');
const LecturerProfile = require('../models/LecturerProfile');
const { uploadFile, getS3ObjectStream } = require('../utils/s3Uploader');

exports.multerUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const LecturerBooking = require('../models/LecturerBooking');
const LecturerBookingMessage = require('../models/LecturerBookingMessage');
const PaymentTransaction = require('../models/PaymentTransaction');
const History = require('../models/History');
const { sendBulkPushNotification, isWebPushConfigured } = require('../utils/webPush');
const { sendEmail } = require('../services/emailService');
const {
  sanitizePhoneNumber,
} = require('../services/campayPaymentService');
const {
  normalizeCheckoutError,
  startCampayPayment,
  refreshCampayPaymentStatus,
} = require('../services/paymentOrchestrationService');
const {
  sanitizePromoCodeInput,
  applyCouponToAmount,
  createCouponTransaction,
} = require('../services/couponService');
const { AccessToken, TrackSource } = require('livekit-server-sdk');

const PLATFORM_SPLIT_RATIO = 0.5;
const BOOKING_PAYMENT_APPROVAL_TIMEOUT_MS = 2 * 60 * 1000;
const DOC_FIELD_MAP = {
  id_card_front: 'id_card_front_url',
  id_card_back: 'id_card_back_url',
  certificate_scan: 'certificate_scan_url',
};
const DOC_KEY_MAP = {
  id_card_front: 'id_card_front_key',
  id_card_back: 'id_card_back_key',
  certificate_scan: 'certificate_scan_key',
};
const DOC_TYPES = Object.keys(DOC_FIELD_MAP);

function defaultDocReviewState() {
  return {
    id_card_front: { status: 'pending', note: '', reviewed_by: null, reviewed_at: null },
    id_card_back: { status: 'pending', note: '', reviewed_by: null, reviewed_at: null },
    certificate_scan: { status: 'pending', note: '', reviewed_by: null, reviewed_at: null },
  };
}

function getSafeDocReview(profile) {
  const review = profile?.doc_review?.toObject
    ? profile.doc_review.toObject()
    : (profile?.doc_review || {});
  const defaults = defaultDocReviewState();
  const normalizeEntry = (entry) => {
    if (!entry) return {};
    return entry?.toObject ? entry.toObject() : entry;
  };
  return {
    id_card_front: { ...defaults.id_card_front, ...normalizeEntry(review.id_card_front) },
    id_card_back: { ...defaults.id_card_back, ...normalizeEntry(review.id_card_back) },
    certificate_scan: { ...defaults.certificate_scan, ...normalizeEntry(review.certificate_scan) },
  };
}

function areAllRequiredDocsUploaded(profileLike) {
  return DOC_TYPES.every((docType) => String(profileLike?.[DOC_FIELD_MAP[docType]] || '').trim());
}

function areAllRequiredDocsApproved(profileLike) {
  const review = getSafeDocReview(profileLike);
  return DOC_TYPES.every((docType) => review?.[docType]?.status === 'approved');
}

function normalizeDocUrlInput(value) {
  if (value && typeof value === 'object') {
    return String(value.url || value.href || value.location || '').trim();
  }
  const raw = String(value || '').trim();
  if (!raw || raw === '[object Object]') return '';
  return raw;
}

const getCurrentUserId = (req) => String(req.user?.cand_id || '').trim();
const getCurrentRole = (req) => String(req.user?.role || '').trim().toLowerCase();
const isDeveloperLike = (role) => ['developer', 'superadmin'].includes(role);

const buildPublicLecturer = (user, profile) => ({
  cand_id: user.cand_id,
  name: String(profile?.full_name || user.name || '').trim(),
  email: user.email,
  phone: user.phone,
  profile_picture: user.profile_picture || null,
  headline: profile?.headline || '',
  bio: profile?.bio || '',
  qualifications: Array.isArray(profile?.qualifications) ? profile.qualifications : [],
  highest_qualification: profile?.highest_qualification || '',
  years_experience: Number(profile?.years_experience || 0),
  specialization_tags: Array.isArray(profile?.specialization_tags) ? profile.specialization_tags : [],
  hourly_rate: Number(profile?.hourly_rate || 0),
  currency: String(profile?.currency || 'XAF').toUpperCase(),
  availability_notes: profile?.availability_notes || '',
  accepts_video_sessions: Boolean(profile?.accepts_video_sessions),
  accepts_chat_tutorship: Boolean(profile?.accepts_chat_tutorship),
  approval_status: String(profile?.approval_status || 'pending'),
  doc_review: getSafeDocReview(profile),
  profile_completed: Boolean(profile?.profile_completed),
});

async function ensureLecturer(req, res) {
  const userId = getCurrentUserId(req);
  const userRole = getCurrentRole(req);
  if (!userId || userRole !== 'lecturer') {
    res.status(403).json({ success: false, message: 'Lecturer access required.' });
    return null;
  }
  return userId;
}

async function ensureCandidate(req, res) {
  const userId = getCurrentUserId(req);
  const userRole = getCurrentRole(req);
  if (!userId || userRole !== 'candidate') {
    res.status(403).json({ success: false, message: 'Candidate access required.' });
    return null;
  }
  return userId;
}

function computeSplit(amount) {
  const total = Math.max(0, Number(amount || 0));
  const platformShare = Number((total * PLATFORM_SPLIT_RATIO).toFixed(2));
  const lecturerShare = Number((total - platformShare).toFixed(2));
  return { total, platformShare, lecturerShare };
}

function mapProviderStatusToBookingPaymentStatus(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'successful') return 'paid';
  if (['pending', 'unknown', 'processing', 'initiated'].includes(normalized)) return 'pending';
  return 'failed';
}

function getMeetingTimeline(bookingLike) {
  const start = new Date(bookingLike?.scheduled_for || 0);
  const duration = Math.max(15, Number(bookingLike?.duration_minutes || 60));
  const end = new Date(start.getTime() + (duration * 60 * 1000));
  const now = new Date();
  const hasStarted = now.getTime() >= start.getTime();
  const hasEnded = now.getTime() >= end.getTime();
  const elapsedMinutes = hasStarted
    ? Math.min(duration, Math.max(0, Math.floor((now.getTime() - start.getTime()) / 60000)))
    : 0;
  const remainingMinutes = hasStarted
    ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 60000))
    : duration;
  return {
    start,
    end,
    durationMinutes: duration,
    now,
    hasStarted,
    elapsedMinutes,
    remainingMinutes,
    hasEnded,
  };
}

function calculateInviteAccessAmount(bookingLike, remainingMinutesOverride) {
  const duration = Math.max(15, Number(bookingLike?.duration_minutes || 60));
  const totalAmount = Number(bookingLike?.amount_total || 0);
  if (duration <= 0 || totalAmount <= 0) return 0;

  const perMinute = totalAmount / duration;
  const timeline = getMeetingTimeline(bookingLike);
  const rawRemaining = Number(remainingMinutesOverride ?? timeline.remainingMinutes);
  const remainingMinutes = Number.isFinite(rawRemaining) ? rawRemaining : timeline.remainingMinutes;
  const billableMinutes = Math.min(duration, Math.max(0, remainingMinutes));
  return Number((perMinute * billableMinutes).toFixed(2));
}

function normalizeInvites(bookingLike) {
  return Array.isArray(bookingLike?.invited_candidates) ? bookingLike.invited_candidates : [];
}

function ensureRoomCode(booking) {
  if (String(booking.conference_room_code || '').trim()) return booking.conference_room_code;
  booking.conference_room_code = `hnd-${String(booking._id)}-${crypto.randomUUID().replace(/-/g, '')}`;
  return booking.conference_room_code;
}

function getLiveKitConfig() {
  const serverUrl = String(process.env.LIVEKIT_URL || process.env.LIVEKIT_WS_URL || '').trim();
  const apiKey = String(process.env.LIVEKIT_API_KEY || '').trim();
  const apiSecret = String(process.env.LIVEKIT_API_SECRET || '').trim();
  if (!serverUrl || !apiKey || !apiSecret) return null;
  return { serverUrl, apiKey, apiSecret };
}

function buildLiveKitGrant({ bookingLike, roomName, userId, role, accessSource }) {
  const normalizedUserId = String(userId || '').trim();
  const grant = {
    roomJoin: true,
    room: String(roomName || '').trim(),
    canSubscribe: true,
    canPublish: true,
    canPublishData: true,
    canUpdateOwnMetadata: true,
    hidden: false,
  };

  if (isDeveloperLike(role)) {
    grant.roomAdmin = true;
    return grant;
  }

  const isLecturerHost = String(bookingLike?.lecturer_cand_id || '').trim() === normalizedUserId;
  if (isLecturerHost) {
    grant.roomAdmin = true;
    return grant;
  }

  if (accessSource === 'invitee') {
    grant.roomAdmin = false;
    grant.canPublish = true;
    grant.canPublishSources = [TrackSource.CAMERA, TrackSource.MICROPHONE];
    grant.canPublishData = false;
    grant.canUpdateOwnMetadata = false;
    return grant;
  }

  grant.roomAdmin = false;
  return grant;
}

async function buildLiveKitToken({ bookingLike, roomName, userId, role, accessSource, name, email }) {
  const cfg = getLiveKitConfig();
  if (!cfg) {
    throw new Error('LiveKit is not configured on the server.');
  }

  const token = new AccessToken(cfg.apiKey, cfg.apiSecret, {
    identity: String(userId || '').trim(),
    name: String(name || userId || 'Guest').trim(),
    metadata: JSON.stringify({
      cand_id: String(userId || '').trim(),
      role: String(role || '').trim(),
      access_source: String(accessSource || '').trim(),
      email: String(email || '').trim(),
    }),
  });

  token.addGrant(buildLiveKitGrant({ bookingLike, roomName, userId, role, accessSource }));

  return {
    serverUrl: cfg.serverUrl,
    token: await token.toJwt(),
  };
}

function isBookingCoreParticipant(bookingLike, userId) {
  const id = String(userId || '').trim();
  if (!id) return false;
  return String(bookingLike?.candidate_cand_id || '') === id || String(bookingLike?.lecturer_cand_id || '') === id;
}

function getInviteForUser(bookingLike, userId) {
  const id = String(userId || '').trim();
  return normalizeInvites(bookingLike).find((x) => String(x?.invitee_cand_id || '').trim() === id) || null;
}

function canJoinConference(bookingLike, userId, role) {
  if (!bookingLike) return { allowed: false, reason: 'Booking not found.' };
  const isDeveloper = isDeveloperLike(role);
  if (isDeveloper) return { allowed: true, source: 'developer' };
  if (!bookingLike.contract_sealed) {
    return { allowed: false, reason: 'Contract must be sealed before joining this conference.' };
  }
  if (isBookingCoreParticipant(bookingLike, userId)) {
    return { allowed: true, source: 'core_participant' };
  }

  const invite = getInviteForUser(bookingLike, userId);
  if (!invite) {
    return { allowed: false, reason: 'Only booking participants and invited candidates can join.' };
  }
  if (String(invite.status || 'pending') !== 'accepted') {
    return { allowed: false, reason: 'You must accept the invitation before joining.' };
  }
  if (String(invite.payment_status || 'pending') !== 'paid') {
    return {
      allowed: false,
      reason: 'You must pay conference access before joining.',
      invite,
      requiresPayment: true,
    };
  }

  return { allowed: true, source: 'invitee', invite };
}

function mapBooking(booking, viewerCandId = '', viewerRole = '') {
  const timeline = getMeetingTimeline(booking);
  const viewerInvite = getInviteForUser(booking, viewerCandId);
  const isCoreParticipant = isBookingCoreParticipant(booking, viewerCandId);
  const invitees = normalizeInvites(booking);
  return {
    id: booking._id,
    candidate_cand_id: booking.candidate_cand_id,
    lecturer_cand_id: booking.lecturer_cand_id,
    topic: booking.topic,
    notes: booking.notes,
    booking_type: booking.booking_type || 'tutorship',
    session_mode: booking.session_mode,
    scheduled_for: booking.scheduled_for,
    duration_minutes: booking.duration_minutes,
    amount_total: booking.amount_total,
    platform_share: booking.platform_share,
    lecturer_share: booking.lecturer_share,
    currency: booking.currency,
    status: booking.status,
    payment_status: booking.payment_status,
    contract_sealed: Boolean(booking.contract_sealed),
    contract_sealed_at: booking.contract_sealed_at,
    meeting_link: booking.meeting_link,
    conference_room_code: booking.conference_room_code || null,
    conference_started_at: booking.conference_started_at || null,
    conference_ended_at: booking.conference_ended_at || null,
    conference_live: Boolean(booking.conference_started_at) && !timeline.hasEnded,
    conference_end_at: timeline.end,
    conference_minutes_left: timeline.remainingMinutes,
    invite_access_fee: calculateInviteAccessAmount(booking, timeline.remainingMinutes),
    viewer_role_in_booking: isCoreParticipant
      ? (String(booking.candidate_cand_id || '') === String(viewerCandId || '') ? 'candidate' : 'lecturer')
      : (viewerInvite ? 'invitee' : null),
    viewer_invite: viewerInvite ? {
      status: viewerInvite.status,
      payment_status: viewerInvite.payment_status,
      invited_at: viewerInvite.invited_at,
      joined_at: viewerInvite.joined_at,
    } : null,
    invited_candidates: isDeveloperLike(viewerRole) || String(booking.candidate_cand_id || '') === String(viewerCandId || '') || String(booking.lecturer_cand_id || '') === String(viewerCandId || '')
      ? invitees.map((inv) => ({
          invitee_cand_id: inv.invitee_cand_id,
          invited_by_cand_id: inv.invited_by_cand_id,
          status: inv.status,
          payment_status: inv.payment_status,
          invited_at: inv.invited_at,
          joined_at: inv.joined_at,
        }))
      : [],
    paid_out: booking.paid_out,
    paid_out_at: booking.paid_out_at,
    createdAt: booking.createdAt,
    updatedAt: booking.updatedAt,
  };
}

exports.listPublicLecturers = async (req, res) => {
  try {
    const users = await User.find({ role: 'lecturer', account_status: { $in: ['active', 'pending_approval'] } })
      .select('cand_id name email phone profile_picture')
      .sort({ name: 1 })
      .lean();

    const lecturerIds = users.map((u) => u.cand_id);
    const profiles = await LecturerProfile.find({ lecturer_cand_id: { $in: lecturerIds }, approval_status: 'approved' }).lean();
    const profileMap = new Map(profiles.map((p) => [p.lecturer_cand_id, p]));

    const rows = users
      .map((u) => buildPublicLecturer(u, profileMap.get(u.cand_id)))
      .filter((x) => x.approval_status === 'approved');

    return res.json({ success: true, lecturers: rows });
  } catch (error) {
    console.error('[Lecturer] listPublicLecturers error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load lecturers.' });
  }
};

exports.getPublicLecturer = async (req, res) => {
  try {
    const lecturerId = String(req.params.lecturerId || '').trim();
    const user = await User.findOne({ cand_id: lecturerId, role: 'lecturer', account_status: { $in: ['active', 'pending_approval'] } })
      .select('cand_id name email phone profile_picture')
      .lean();
    if (!user) return res.status(404).json({ success: false, message: 'Lecturer not found.' });

    const profile = await LecturerProfile.findOne({ lecturer_cand_id: lecturerId, approval_status: 'approved' }).lean();
    if (!profile) {
      return res.status(404).json({ success: false, message: 'Lecturer profile not available.' });
    }

    return res.json({ success: true, lecturer: buildPublicLecturer(user, profile) });
  } catch (error) {
    console.error('[Lecturer] getPublicLecturer error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load lecturer details.' });
  }
};

exports.getMyProfile = async (req, res) => {
  const lecturerId = await ensureLecturer(req, res);
  if (!lecturerId) return;

  try {
    const [profile, user] = await Promise.all([
      LecturerProfile.findOne({ lecturer_cand_id: lecturerId }).lean(),
      User.findOne({ cand_id: lecturerId, role: 'lecturer' }).select('name email phone profile_picture').lean(),
    ]);
    return res.json({
      success: true,
      profile: profile || {
        lecturer_cand_id: lecturerId,
        headline: '',
        bio: '',
        qualifications: [],
        years_experience: 0,
        specialization_tags: [],
        hourly_rate: 5000,
        currency: 'XAF',
        availability_notes: '',
        accepts_video_sessions: true,
        accepts_chat_tutorship: true,
        evidence_links: [],
        full_name: '',
        id_card_number: '',
        region: '',
        highest_qualification: '',
        id_card_front_url: '',
        id_card_back_url: '',
        certificate_scan_url: '',
        doc_review: defaultDocReviewState(),
        approval_status: 'pending',
        approval_note: '',
        profile_completed: false,
      },
      user: user || null,
    });
  } catch (error) {
    console.error('[Lecturer] getMyProfile error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load profile.' });
  }
};

exports.uploadMyProfilePicture = async (req, res) => {
  const lecturerId = await ensureLecturer(req, res);
  if (!lecturerId) return;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No profile picture uploaded.' });
    }

    const upload = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      'profile-pictures'
    );

    const updatedUser = await User.findOneAndUpdate(
      { cand_id: lecturerId, role: 'lecturer' },
      { $set: { profile_picture: upload.url } },
      { new: true }
    ).select('cand_id name email phone profile_picture').lean();

    if (!updatedUser) {
      return res.status(404).json({ success: false, message: 'Lecturer account not found.' });
    }

    return res.json({
      success: true,
      message: 'Profile picture updated successfully.',
      profile_picture: updatedUser.profile_picture,
      user: updatedUser,
    });
  } catch (error) {
    console.error('[Lecturer] uploadMyProfilePicture error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to upload profile picture.' });
  }
};

exports.updateMyProfile = async (req, res) => {
  const lecturerId = await ensureLecturer(req, res);
  if (!lecturerId) return;

  try {
    const body = req.body || {};
    const qualifications = Array.isArray(body.qualifications)
      ? body.qualifications.map((x) => String(x || '').trim()).filter(Boolean)
      : String(body.qualifications || '')
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean);

    const specializationTags = Array.isArray(body.specialization_tags)
      ? body.specialization_tags.map((x) => String(x || '').trim()).filter(Boolean)
      : String(body.specialization_tags || '')
          .split(',')
          .map((x) => x.trim())
          .filter(Boolean);

    const evidenceLinks = Array.isArray(body.evidence_links)
      ? body.evidence_links.map((x) => String(x || '').trim()).filter(Boolean)
      : String(body.evidence_links || '')
          .split('\n')
          .map((x) => x.trim())
          .filter(Boolean);

    const existingProfile = await LecturerProfile.findOne({ lecturer_cand_id: lecturerId }).lean();
    const currentDocReview = getSafeDocReview(existingProfile || {});

    const nextDocReview = {
      ...currentDocReview,
      id_card_front: {
        ...currentDocReview.id_card_front,
        status: String(body.id_card_front_url || existingProfile?.id_card_front_url || '').trim() ? 'pending' : currentDocReview.id_card_front.status,
        note: String(body.id_card_front_url || existingProfile?.id_card_front_url || '').trim() ? '' : currentDocReview.id_card_front.note,
      },
      id_card_back: {
        ...currentDocReview.id_card_back,
        status: String(body.id_card_back_url || existingProfile?.id_card_back_url || '').trim() ? 'pending' : currentDocReview.id_card_back.status,
        note: String(body.id_card_back_url || existingProfile?.id_card_back_url || '').trim() ? '' : currentDocReview.id_card_back.note,
      },
      certificate_scan: {
        ...currentDocReview.certificate_scan,
        status: String(body.certificate_scan_url || existingProfile?.certificate_scan_url || '').trim() ? 'pending' : currentDocReview.certificate_scan.status,
        note: String(body.certificate_scan_url || existingProfile?.certificate_scan_url || '').trim() ? '' : currentDocReview.certificate_scan.note,
      },
    };

    const update = {
      headline: String(body.headline || '').trim().slice(0, 180),
      bio: String(body.bio || '').trim().slice(0, 5000),
      qualifications,
      years_experience: Math.max(0, Number(body.years_experience || 0)),
      specialization_tags: specializationTags,
      hourly_rate: Math.max(0, Number(body.hourly_rate || 0)),
      currency: String(body.currency || 'XAF').trim().toUpperCase() || 'XAF',
      availability_notes: String(body.availability_notes || '').trim().slice(0, 2500),
      accepts_video_sessions: body.accepts_video_sessions !== false,
      accepts_chat_tutorship: body.accepts_chat_tutorship !== false,
      evidence_links: evidenceLinks,
      full_name: String(body.full_name || '').trim().slice(0, 200),
      id_card_number: String(body.id_card_number || '').trim().slice(0, 100),
      region: String(body.region || '').trim().slice(0, 100),
      highest_qualification: String(body.highest_qualification || '').trim().slice(0, 100),
      id_card_front_url: normalizeDocUrlInput(body.id_card_front_url).slice(0, 500),
      id_card_back_url: normalizeDocUrlInput(body.id_card_back_url).slice(0, 500),
      certificate_scan_url: normalizeDocUrlInput(body.certificate_scan_url).slice(0, 500),
      doc_review: nextDocReview,
      profile_completed: Boolean(
        String(body.headline || '').trim() &&
          String(body.bio || '').trim() &&
          qualifications.length &&
          String(body.full_name || '').trim() &&
          String(body.id_card_number || '').trim() &&
          String(body.id_card_front_url || '').trim() &&
          String(body.id_card_back_url || '').trim() &&
          String(body.certificate_scan_url || '').trim()
      ),
      approval_status: 'pending',
      approval_note: 'Documents submitted and under review.',
      approved_by: null,
      approved_at: null,
    };

    const profile = await LecturerProfile.findOneAndUpdate(
      { lecturer_cand_id: lecturerId },
      { $set: update },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();

    await User.updateOne(
      { cand_id: lecturerId },
      {
        $set: {
          account_status: 'pending_approval',
        },
      }
    );

    return res.json({ success: true, profile, message: 'Documents submitted and under review.' });
  } catch (error) {
    console.error('[Lecturer] updateMyProfile error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to save lecturer profile.' });
  }
};

exports.createBooking = async (req, res) => {
  const candidateId = await ensureCandidate(req, res);
  if (!candidateId) return;

  try {
    const lecturerId = String(req.params.lecturerId || '').trim();
    if (!lecturerId) return res.status(400).json({ success: false, message: 'Lecturer is required.' });

    const lecturerUser = await User.findOne({ cand_id: lecturerId, role: 'lecturer', account_status: 'active' }).lean();
    if (!lecturerUser) return res.status(404).json({ success: false, message: 'Lecturer not available.' });

    const profile = await LecturerProfile.findOne({ lecturer_cand_id: lecturerId, approval_status: 'approved', profile_completed: true }).lean();
    if (!profile) return res.status(404).json({ success: false, message: 'Lecturer profile not approved yet.' });

    const topic = String(req.body?.topic || '').trim();
    const notes = String(req.body?.notes || '').trim();
    const bookingType = String(req.body?.booking_type || 'tutorship').trim().toLowerCase() === 'video_conference'
      ? 'video_conference'
      : 'tutorship';
    const sessionMode = String(req.body?.session_mode || 'video').toLowerCase() === 'chat' ? 'chat' : 'video';
    const scheduledFor = new Date(req.body?.scheduled_for || '');
    const durationMinutes = Math.max(15, Number(req.body?.duration_minutes || 60));

    if (!topic) return res.status(400).json({ success: false, message: 'Topic is required.' });
    if (!Number.isFinite(scheduledFor.getTime())) {
      return res.status(400).json({ success: false, message: 'A valid schedule date is required.' });
    }

    const amount = Number(profile.hourly_rate || 0) * (durationMinutes / 60);
    const split = computeSplit(amount);

    const booking = await LecturerBooking.create({
      candidate_cand_id: candidateId,
      lecturer_cand_id: lecturerId,
      topic,
      notes,
      booking_type: bookingType,
      session_mode: sessionMode,
      scheduled_for: scheduledFor,
      duration_minutes: durationMinutes,
      amount_total: split.total,
      platform_share: split.platformShare,
      lecturer_share: split.lecturerShare,
      currency: String(profile.currency || 'XAF').toUpperCase(),
      status: 'requested',
      payment_status: 'pending',
      contract_sealed: false,
      contract_sealed_at: null,
    });

    try {
      await History.create({
        user_id: candidateId,
        content_type: 'lecturer_booking',
        content_title: `${bookingType === 'video_conference' ? 'Video conference' : 'Tutorship'} booking request with ${lecturerUser.name}`,
        action: 'lecturer_booking_requested',
      });
    } catch (_) {}

    return res.status(201).json({ success: true, booking: mapBooking(booking) });
  } catch (error) {
    console.error('[Lecturer] createBooking error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to create booking.' });
  }
};

exports.listCandidateBookings = async (req, res) => {
  const candidateId = await ensureCandidate(req, res);
  if (!candidateId) return;

  try {
    const bookings = await LecturerBooking.find({
      $or: [
        { candidate_cand_id: candidateId },
        { 'invited_candidates.invitee_cand_id': candidateId },
      ],
    }).sort({ createdAt: -1 }).lean();

    const visible = bookings.filter((booking) => {
      if (String(booking.candidate_cand_id || '') === candidateId) return true;
      const invite = getInviteForUser(booking, candidateId);
      return Boolean(invite);
    });

    return res.json({ success: true, bookings: visible.map((x) => mapBooking(x, candidateId, 'candidate')) });
  } catch (error) {
    console.error('[Lecturer] listCandidateBookings error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load bookings.' });
  }
};

exports.listMyBookings = async (req, res) => {
  const lecturerId = await ensureLecturer(req, res);
  if (!lecturerId) return;

  try {
    const bookings = await LecturerBooking.find({ lecturer_cand_id: lecturerId }).sort({ createdAt: -1 }).lean();
    return res.json({ success: true, bookings: bookings.map((x) => mapBooking(x, lecturerId, 'lecturer')) });
  } catch (error) {
    console.error('[Lecturer] listMyBookings error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load lecturer bookings.' });
  }
};

exports.updateMyBookingStatus = async (req, res) => {
  const lecturerId = await ensureLecturer(req, res);
  if (!lecturerId) return;

  try {
    const bookingId = String(req.params.bookingId || '').trim();
    const nextStatus = String(req.body?.status || '').trim().toLowerCase();
    const allowed = ['accepted', 'scheduled', 'completed', 'rejected', 'cancelled'];
    if (!allowed.includes(nextStatus)) {
      return res.status(400).json({ success: false, message: `Status must be one of: ${allowed.join(', ')}` });
    }

    const booking = await LecturerBooking.findOne({ _id: bookingId, lecturer_cand_id: lecturerId });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (booking.payment_status === 'paid' && ['rejected', 'cancelled'].includes(nextStatus)) {
      return res.status(400).json({ success: false, message: 'Cannot reject or cancel a paid and sealed contract.' });
    }

    booking.status = nextStatus;
    if (nextStatus === 'scheduled') {
      booking.meeting_link = String(req.body?.meeting_link || booking.meeting_link || '').trim();
    }
    if (nextStatus === 'accepted') {
      booking.contract_sealed = false;
      booking.contract_sealed_at = null;
    }

    await booking.save();
    return res.json({ success: true, booking: mapBooking(booking) });
  } catch (error) {
    console.error('[Lecturer] updateMyBookingStatus error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to update booking status.' });
  }
};

exports.startBookingPayment = async (req, res) => {
  const candidateId = await ensureCandidate(req, res);
  if (!candidateId) return;

  try {
    const bookingId = String(req.params.bookingId || '').trim();
    const candidate = await User.findOne({ cand_id: candidateId, role: 'candidate' }).select('phone').lean();
    const phoneNumber = String(req.body?.phone_number || req.body?.phoneNumber || candidate?.phone || '').trim();
    const promoCode = sanitizePromoCodeInput(req.body?.promoCode || req.body?.referralCode);
    const booking = await LecturerBooking.findOne({ _id: bookingId, candidate_cand_id: candidateId });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone number is required to initiate payment.' });
    }

    let sanitizedPhone;
    try {
      sanitizedPhone = sanitizePhoneNumber(phoneNumber);
    } catch (_) {
      return res.status(400).json({ success: false, message: 'Invalid phone number format.' });
    }

    if (!['accepted', 'scheduled'].includes(String(booking.status || '').toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'Payment is available only after the lecturer confirms the booking.',
      });
    }

    if (booking.payment_status === 'paid') {
      return res.json({ success: true, message: 'Booking already paid.', booking: mapBooking(booking, candidateId, 'candidate') });
    }

    const pricing = await applyCouponToAmount({
      promoCode,
      appliesTo: 'tutorship_booking',
      baseAmount: booking.amount_total,
    });

    let transaction;
    try {
      if (pricing.finalAmount <= 0 && pricing.promoCode) {
        transaction = await createCouponTransaction({
          candId: candidateId,
          purposeType: 'tutorship_booking',
          purposeCode: 'lecturer_booking_payment',
          resourceType: 'lecturer_booking',
          resourceId: String(booking._id),
          amount: 0,
          currency: booking.currency,
          description: `Tutorship booking payment: ${booking.topic}`,
          phoneNumber,
          coupon: pricing.coupon,
          metadata: {
            lecturer_cand_id: booking.lecturer_cand_id,
            booking_id: String(booking._id),
            split: {
              platform_share: booking.platform_share,
              lecturer_share: booking.lecturer_share,
            },
            original_amount: booking.amount_total,
            discount_amount: pricing.discountAmount,
            promo_code: pricing.promoCode,
            coupon_id: pricing.coupon?._id ? String(pricing.coupon._id) : null,
            coupon_expires_at: pricing.coupon?.expires_at || null,
          },
        });
      } else {
        transaction = await startCampayPayment({
          transactionPayload: {
            user_cand_id: candidateId,
            provider: 'campay',
            purpose_type: 'tutorship_booking',
            purpose_code: 'lecturer_booking_payment',
            resource_type: 'lecturer_booking',
            resource_id: String(booking._id),
            amount: pricing.finalAmount,
            currency: booking.currency,
            phone_number: sanitizedPhone,
            description: `Tutorship booking payment: ${booking.topic}`,
            external_reference: crypto.randomUUID(),
            external_id: `booking-${booking._id}`,
            metadata: {
              lecturer_cand_id: booking.lecturer_cand_id,
              booking_id: String(booking._id),
              split: {
                platform_share: booking.platform_share,
                lecturer_share: booking.lecturer_share,
              },
              original_amount: booking.amount_total,
              discount_amount: pricing.discountAmount,
              promo_code: pricing.promoCode,
              coupon_id: pricing.coupon?._id ? String(pricing.coupon._id) : null,
              coupon_expires_at: pricing.coupon?.expires_at || null,
            },
            expires_at: new Date(Date.now() + BOOKING_PAYMENT_APPROVAL_TIMEOUT_MS),
          },
          phoneNumber,
          payerMessage: `Tutorship ${booking.topic}`.slice(0, 60),
          payeeNote: `Lecturer booking ${booking._id}`.slice(0, 120),
        });
      }
    } catch (err) {
      const normalized = normalizeCheckoutError(err, 'Failed to initialize booking payment request.');
      return res.status(normalized.statusCode).json({ success: false, message: normalized.message });
    }

    booking.payment_transaction_id = transaction._id;
    if (transaction.status === 'successful') {
      booking.payment_status = 'paid';
      booking.status = 'scheduled';
      booking.contract_sealed = true;
      booking.contract_sealed_at = new Date();
    } else {
      booking.payment_status = mapProviderStatusToBookingPaymentStatus(transaction.status);
    }
    await booking.save();

    return res.json({
      success: true,
      payment: {
        transaction_id: transaction._id,
        status: transaction.status,
        provider_mode: transaction.provider_mode,
      },
      booking: mapBooking(booking, candidateId, 'candidate'),
    });
  } catch (error) {
    console.error('[Lecturer] startBookingPayment error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to start booking payment.' });
  }
};

exports.refreshBookingPaymentStatus = async (req, res) => {
  const candidateId = await ensureCandidate(req, res);
  if (!candidateId) return;

  try {
    const bookingId = String(req.params.bookingId || '').trim();
    const booking = await LecturerBooking.findOne({ _id: bookingId, candidate_cand_id: candidateId });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });
    if (!booking.payment_transaction_id) {
      return res.status(400).json({ success: false, message: 'No payment transaction found for this booking.' });
    }

    const tx = await PaymentTransaction.findById(booking.payment_transaction_id);
    if (!tx) return res.status(404).json({ success: false, message: 'Payment transaction not found.' });

    if (tx.status === 'pending' && tx.expires_at && Date.now() >= new Date(tx.expires_at).getTime()) {
      tx.status = 'failed';
      tx.completed_at = tx.completed_at || new Date();
      tx.provider_response = tx.provider_response || { message: 'Payment approval timeout exceeded 2 minutes.' };
      await tx.save();

      booking.payment_status = 'failed';
      await booking.save();

      return res.json({
        success: true,
        booking: mapBooking(booking, candidateId, 'candidate'),
        payment_status: tx.status,
        message: 'Payment approval timeout exceeded 2 minutes. Transaction marked as failed.',
      });
    }

    if (tx.status === 'pending') {
      await refreshCampayPaymentStatus(tx);
      if (tx.status === 'successful') {
        booking.payment_status = 'paid';
        booking.status = 'scheduled';
        booking.contract_sealed = true;
        booking.contract_sealed_at = new Date();
        await booking.save();
      } else {
        if (tx.status !== 'pending') {
          booking.payment_status = mapProviderStatusToBookingPaymentStatus(tx.status);
          await booking.save();
        }
      }
    }

    return res.json({ success: true, booking: mapBooking(booking, candidateId, 'candidate'), payment_status: tx.status });
  } catch (error) {
    console.error('[Lecturer] refreshBookingPaymentStatus error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to refresh payment status.' });
  }
};

exports.listBookingMessages = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const role = getCurrentRole(req);
    const bookingId = String(req.params.bookingId || '').trim();

    const booking = await LecturerBooking.findById(bookingId).lean();
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    const canRead =
      userId &&
      (booking.candidate_cand_id === userId || booking.lecturer_cand_id === userId || isDeveloperLike(role));

    if (!canRead) return res.status(403).json({ success: false, message: 'Forbidden.' });
    if (!booking.contract_sealed && !isDeveloperLike(role)) {
      return res.status(403).json({
        success: false,
        message: 'Chat opens only after payment confirms and contract is sealed.',
      });
    }

    const messages = await LecturerBookingMessage.find({ booking_id: booking._id }).sort({ createdAt: 1 }).lean();
    return res.json({ success: true, messages });
  } catch (error) {
    console.error('[Lecturer] listBookingMessages error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load conversation.' });
  }
};

exports.sendBookingMessage = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const role = getCurrentRole(req);
    const bookingId = String(req.params.bookingId || '').trim();
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'Message is required.' });

    const booking = await LecturerBooking.findById(bookingId).lean();
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    let senderRole = null;
    if (booking.candidate_cand_id === userId) senderRole = 'candidate';
    if (booking.lecturer_cand_id === userId) senderRole = 'lecturer';
    if (!senderRole && !isDeveloperLike(role)) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }
    if (!booking.contract_sealed && !isDeveloperLike(role)) {
      return res.status(403).json({
        success: false,
        message: 'Chat opens only after payment confirms and contract is sealed.',
      });
    }

    const saved = await LecturerBookingMessage.create({
      booking_id: booking._id,
      sender_cand_id: userId,
      sender_role: senderRole || 'lecturer',
      message: message.slice(0, 4000),
    });

    return res.status(201).json({ success: true, message: saved });
  } catch (error) {
    console.error('[Lecturer] sendBookingMessage error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to send message.' });
  }
};

exports.simulateBookingConversation = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const role = getCurrentRole(req);
    const bookingId = String(req.params.bookingId || '').trim();
    const booking = await LecturerBooking.findById(bookingId).lean();
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    const isParticipant = booking.candidate_cand_id === userId || booking.lecturer_cand_id === userId;
    if (!isParticipant && !isDeveloperLike(role)) {
      return res.status(403).json({ success: false, message: 'Forbidden.' });
    }

    if (!booking.contract_sealed) {
      return res.status(400).json({
        success: false,
        message: 'Contract must be sealed before simulating session chat.',
      });
    }

    const existingCount = await LecturerBookingMessage.countDocuments({ booking_id: booking._id });
    if (existingCount > 0) {
      return res.json({ success: true, message: 'Conversation already contains messages.' });
    }

    const seed = [
      {
        booking_id: booking._id,
        sender_cand_id: booking.candidate_cand_id,
        sender_role: 'candidate',
        message: `Hello lecturer, I am ready for our ${booking.booking_type === 'video_conference' ? 'video conference' : 'tutorship'} session on ${new Date(booking.scheduled_for).toLocaleString()}.`,
      },
      {
        booking_id: booking._id,
        sender_cand_id: booking.lecturer_cand_id,
        sender_role: 'lecturer',
        message: 'Great. Please share your key questions and we will go step by step.',
      },
      {
        booking_id: booking._id,
        sender_cand_id: booking.candidate_cand_id,
        sender_role: 'candidate',
        message: 'I need help with exam strategy and practical examples.',
      },
    ];

    await LecturerBookingMessage.insertMany(seed);
    const messages = await LecturerBookingMessage.find({ booking_id: booking._id }).sort({ createdAt: 1 }).lean();
    return res.json({ success: true, messages });
  } catch (error) {
    console.error('[Lecturer] simulateBookingConversation error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to simulate conversation.' });
  }
};

exports.searchConferenceInviteCandidates = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const role = getCurrentRole(req);
    const bookingId = String(req.params.bookingId || '').trim();
    const query = String(req.query?.q || '').trim();

    const booking = await LecturerBooking.findById(bookingId).lean();
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (!isBookingCoreParticipant(booking, userId) && !isDeveloperLike(role)) {
      return res.status(403).json({ success: false, message: 'Only booking participants can invite users.' });
    }

    const exclude = [
      String(booking.candidate_cand_id || ''),
      String(booking.lecturer_cand_id || ''),
      ...normalizeInvites(booking).map((x) => String(x.invitee_cand_id || '')),
    ].filter(Boolean);

    const filters = {
      role: 'candidate',
      account_status: 'active',
      cand_id: { $nin: exclude },
    };

    if (query) {
      const rx = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filters.$or = [{ name: rx }, { email: rx }, { cand_id: rx }];
    }

    const users = await User.find(filters).select('cand_id name email').sort({ name: 1 }).limit(25).lean();
    return res.json({ success: true, users });
  } catch (error) {
    console.error('[Lecturer] searchConferenceInviteCandidates error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to search users for invitation.' });
  }
};

exports.inviteConferenceParticipants = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const role = getCurrentRole(req);
    const bookingId = String(req.params.bookingId || '').trim();
    const invitees = Array.isArray(req.body?.invitee_cand_ids)
      ? req.body.invitee_cand_ids.map((x) => String(x || '').trim()).filter(Boolean)
      : [];

    if (!invitees.length) {
      return res.status(400).json({ success: false, message: 'At least one invitee is required.' });
    }

    const booking = await LecturerBooking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (!booking.contract_sealed && !isDeveloperLike(role)) {
      return res.status(400).json({ success: false, message: 'Contract must be sealed before inviting participants.' });
    }

    if (!isBookingCoreParticipant(booking, userId) && !isDeveloperLike(role)) {
      return res.status(403).json({ success: false, message: 'Only booking participants can invite users.' });
    }

    const blocked = new Set([
      String(booking.candidate_cand_id || ''),
      String(booking.lecturer_cand_id || ''),
    ]);
    const existing = new Set(normalizeInvites(booking).map((x) => String(x.invitee_cand_id || '')));

    const uniqueInvitees = [...new Set(invitees)].filter((candId) => !blocked.has(candId) && !existing.has(candId));
    if (!uniqueInvitees.length) {
      return res.status(400).json({ success: false, message: 'All selected users are already invited or are core participants.' });
    }

    const users = await User.find({ cand_id: { $in: uniqueInvitees }, role: 'candidate', account_status: 'active' })
      .select('cand_id name email push_subscription allow_push_notifications')
      .lean();
    if (!users.length) {
      return res.status(404).json({ success: false, message: 'No eligible candidate found for invitation.' });
    }

    const now = new Date();
    const appBase = String(process.env.APP_URL || 'https://hnd-platform.vercel.app').replace(/\/$/, '');
    const invitePath = '/candidate/tutorship-bookings';
    const inviteFee = calculateInviteAccessAmount(booking);
    const newInvites = users.map((u) => ({
      invitee_cand_id: u.cand_id,
      invited_by_cand_id: userId,
      status: 'pending',
      payment_status: 'pending',
      invited_at: now,
      responded_at: null,
      joined_at: null,
      metadata: {
        invite_fee: inviteFee,
        currency: booking.currency,
      },
    }));

    booking.invited_candidates = [...normalizeInvites(booking), ...newInvites];
    await booking.save();

    const pushUsers = users.filter((u) => u.allow_push_notifications && u.push_subscription);
    if (isWebPushConfigured && pushUsers.length) {
      await sendBulkPushNotification(
        pushUsers,
        'video_invite',
        'Video conference invitation',
        `You were invited to join "${booking.topic}". Accept and pay to join the session.`,
        invitePath,
        String(booking._id)
      );
    }

    await Promise.all(users.map(async (u) => {
      if (!u.email) return;
      try {
        await sendEmail({
          to: u.email,
          subject: `Invitation: ${booking.topic}`,
          text: `You have been invited to a tutorship video session on Acadex. Open ${appBase}${invitePath} to accept and pay ${inviteFee.toFixed(0)} ${booking.currency || 'XAF'} before joining.`,
        });
      } catch (_) {}
    }));

    return res.json({
      success: true,
      message: 'Invitations sent successfully.',
      booking: mapBooking(booking.toObject ? booking.toObject() : booking, userId, role),
    });
  } catch (error) {
    console.error('[Lecturer] inviteConferenceParticipants error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to send conference invitations.' });
  }
};

exports.respondConferenceInvite = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const role = getCurrentRole(req);
    const bookingId = String(req.params.bookingId || '').trim();
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    if (!['accepted', 'rejected'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Decision must be accepted or rejected.' });
    }

    const booking = await LecturerBooking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    const idx = normalizeInvites(booking).findIndex((x) => String(x?.invitee_cand_id || '') === userId);
    if (idx < 0 && !isDeveloperLike(role)) {
      return res.status(403).json({ success: false, message: 'Invite not found for your account.' });
    }

    if (idx >= 0) {
      booking.invited_candidates[idx].status = decision;
      booking.invited_candidates[idx].responded_at = new Date();
      if (decision === 'rejected') {
        booking.invited_candidates[idx].payment_status = 'failed';
      }
      await booking.save();
    }

    return res.json({
      success: true,
      message: `Invitation ${decision}.`,
      booking: mapBooking(booking.toObject ? booking.toObject() : booking, userId, role),
    });
  } catch (error) {
    console.error('[Lecturer] respondConferenceInvite error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to respond to conference invitation.' });
  }
};

exports.startInviteConferencePayment = async (req, res) => {
  try {
    const inviteeId = await ensureCandidate(req, res);
    if (!inviteeId) return;

    const bookingId = String(req.params.bookingId || '').trim();
    const booking = await LecturerBooking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    const inviteIndex = normalizeInvites(booking).findIndex((x) => String(x?.invitee_cand_id || '') === inviteeId);
    if (inviteIndex < 0) {
      return res.status(403).json({ success: false, message: 'You are not invited to this conference.' });
    }

    const invite = booking.invited_candidates[inviteIndex];
    if (String(invite.status || '') !== 'accepted') {
      return res.status(400).json({ success: false, message: 'Accept the invitation before paying.' });
    }
    if (String(invite.payment_status || '') === 'paid') {
      return res.json({ success: true, message: 'Conference access already paid.' });
    }

    const candidate = await User.findOne({ cand_id: inviteeId, role: 'candidate' }).select('phone').lean();
    const phoneNumber = String(req.body?.phone_number || req.body?.phoneNumber || candidate?.phone || '').trim();
    const promoCode = sanitizePromoCodeInput(req.body?.promoCode || req.body?.referralCode);
    if (!phoneNumber) {
      return res.status(400).json({ success: false, message: 'Phone number is required to initiate payment.' });
    }

    let sanitizedPhone;
    try {
      sanitizedPhone = sanitizePhoneNumber(phoneNumber);
    } catch (_) {
      return res.status(400).json({ success: false, message: 'Invalid phone number format.' });
    }

    const timeline = getMeetingTimeline(booking);
    if (timeline.hasEnded) {
      return res.status(400).json({ success: false, message: 'Conference has ended.' });
    }

    const amount = calculateInviteAccessAmount(booking, timeline.remainingMinutes);
    const pricing = await applyCouponToAmount({
      promoCode,
      appliesTo: 'invite_access',
      baseAmount: amount,
    });
    let transaction;
    try {
      if (pricing.finalAmount <= 0 && pricing.promoCode) {
        transaction = await createCouponTransaction({
          candId: inviteeId,
          purposeType: 'tutorship_booking',
          purposeCode: 'lecturer_booking_invite_access',
          resourceType: 'lecturer_booking',
          resourceId: String(booking._id),
          amount: 0,
          currency: booking.currency,
          description: `Conference access: ${booking.topic}`,
          phoneNumber,
          coupon: pricing.coupon,
          metadata: {
            lecturer_cand_id: booking.lecturer_cand_id,
            booking_id: String(booking._id),
            invited_user_cand_id: inviteeId,
            billed_minutes: timeline.remainingMinutes,
            original_amount: amount,
            discount_amount: pricing.discountAmount,
            promo_code: pricing.promoCode,
            coupon_id: pricing.coupon?._id ? String(pricing.coupon._id) : null,
            coupon_expires_at: pricing.coupon?.expires_at || null,
          },
        });
      } else {
        transaction = await startCampayPayment({
          transactionPayload: {
            user_cand_id: inviteeId,
            provider: 'campay',
            purpose_type: 'tutorship_booking',
            purpose_code: 'lecturer_booking_invite_access',
            resource_type: 'lecturer_booking',
            resource_id: String(booking._id),
            amount: pricing.finalAmount,
            currency: booking.currency,
            phone_number: sanitizedPhone,
            description: `Conference access: ${booking.topic}`,
            external_reference: crypto.randomUUID(),
            external_id: `booking-invite-${booking._id}-${inviteeId}`,
            metadata: {
              lecturer_cand_id: booking.lecturer_cand_id,
              booking_id: String(booking._id),
              invited_user_cand_id: inviteeId,
              billed_minutes: timeline.remainingMinutes,
              original_amount: amount,
              discount_amount: pricing.discountAmount,
              promo_code: pricing.promoCode,
              coupon_id: pricing.coupon?._id ? String(pricing.coupon._id) : null,
              coupon_expires_at: pricing.coupon?.expires_at || null,
            },
            expires_at: new Date(Date.now() + (30 * 60 * 1000)),
          },
          phoneNumber,
          payerMessage: `Conference access ${booking.topic}`.slice(0, 60),
          payeeNote: `Booking invite access ${booking._id}`.slice(0, 120),
        });
      }
    } catch (err) {
      const normalized = normalizeCheckoutError(err, 'Failed to initialize conference access payment request.');
      return res.status(normalized.statusCode).json({ success: false, message: normalized.message });
    }

    invite.payment_transaction_id = transaction._id;
    invite.payment_status = transaction.status === 'successful' ? 'paid' : mapProviderStatusToBookingPaymentStatus(transaction.status);
    booking.invited_candidates[inviteIndex] = invite;
    await booking.save();

    return res.json({
      success: true,
      payment: {
        transaction_id: transaction._id,
        status: transaction.status,
        provider_mode: transaction.provider_mode,
        amount: pricing.finalAmount,
        currency: booking.currency,
      },
      booking: mapBooking(booking.toObject ? booking.toObject() : booking, inviteeId, 'candidate'),
    });
  } catch (error) {
    console.error('[Lecturer] startInviteConferencePayment error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to start conference access payment.' });
  }
};

exports.refreshInviteConferencePayment = async (req, res) => {
  try {
    const inviteeId = await ensureCandidate(req, res);
    if (!inviteeId) return;

    const bookingId = String(req.params.bookingId || '').trim();
    const booking = await LecturerBooking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    const inviteIndex = normalizeInvites(booking).findIndex((x) => String(x?.invitee_cand_id || '') === inviteeId);
    if (inviteIndex < 0) return res.status(403).json({ success: false, message: 'Invite not found.' });
    const invite = booking.invited_candidates[inviteIndex];
    if (!invite.payment_transaction_id) {
      return res.status(400).json({ success: false, message: 'No invite payment transaction found.' });
    }

    const tx = await PaymentTransaction.findById(invite.payment_transaction_id);
    if (!tx) return res.status(404).json({ success: false, message: 'Payment transaction not found.' });

    if (tx.status === 'pending') {
      await refreshCampayPaymentStatus(tx);
      invite.payment_status = tx.status === 'successful' ? 'paid' : mapProviderStatusToBookingPaymentStatus(tx.status);
      booking.invited_candidates[inviteIndex] = invite;
      await booking.save();
    }

    return res.json({ success: true, payment_status: tx.status, booking: mapBooking(booking.toObject ? booking.toObject() : booking, inviteeId, 'candidate') });
  } catch (error) {
    console.error('[Lecturer] refreshInviteConferencePayment error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to refresh conference access payment status.' });
  }
};

exports.startBookingConference = async (req, res) => {
  try {
    const lecturerId = await ensureLecturer(req, res);
    if (!lecturerId) return;

    const bookingId = String(req.params.bookingId || '').trim();
    const booking = await LecturerBooking.findOne({ _id: bookingId, lecturer_cand_id: lecturerId });
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (!booking.contract_sealed) {
      return res.status(400).json({ success: false, message: 'Contract must be sealed before starting conference.' });
    }
    if (String(booking.session_mode || 'video') !== 'video') {
      return res.status(400).json({ success: false, message: 'This booking is not configured for video.' });
    }

    const timeline = getMeetingTimeline(booking);
    if (timeline.hasEnded) {
      return res.status(400).json({ success: false, message: 'Scheduled conference window has ended.' });
    }

    ensureRoomCode(booking);
    booking.conference_started_at = booking.conference_started_at || new Date();
    booking.conference_started_by = lecturerId;
    booking.conference_ended_at = null;
    await booking.save();

    const invitees = normalizeInvites(booking)
      .filter((x) => String(x.status || '') === 'accepted')
      .map((x) => String(x.invitee_cand_id || ''));
    const notifyCandIds = [...new Set([String(booking.candidate_cand_id || ''), ...invitees].filter(Boolean))];

    const users = await User.find({ cand_id: { $in: notifyCandIds } })
      .select('cand_id name email push_subscription allow_push_notifications')
      .lean();

    const pushUsers = users.filter((u) => u.allow_push_notifications && u.push_subscription);
    if (isWebPushConfigured && pushUsers.length) {
      await sendBulkPushNotification(
        pushUsers,
        'video_live',
        'Video conference is live',
        `${booking.topic} has started. Open your booking portal now.`,
        '/candidate/tutorship-bookings',
        String(booking._id)
      );
    }

    await Promise.all(users.map(async (u) => {
      if (!u.email) return;
      try {
        await sendEmail({
          to: u.email,
          subject: `Session started: ${booking.topic}`,
          text: `Your booked video conference is now live. Open your portal and join from Tutorship Bookings.`,
        });
      } catch (_) {}
    }));

    return res.json({
      success: true,
      message: 'Conference started and participants notified.',
      booking: mapBooking(booking.toObject ? booking.toObject() : booking, lecturerId, 'lecturer'),
    });
  } catch (error) {
    console.error('[Lecturer] startBookingConference error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to start conference.' });
  }
};

exports.getBookingConferenceAccess = async (req, res) => {
  try {
    const userId = getCurrentUserId(req);
    const role = getCurrentRole(req);
    const bookingId = String(req.params.bookingId || '').trim();
    const booking = await LecturerBooking.findById(bookingId);
    if (!booking) return res.status(404).json({ success: false, message: 'Booking not found.' });

    if (!String(booking.conference_room_code || '').trim()) {
      ensureRoomCode(booking);
      await booking.save();
    }

    const timeline = getMeetingTimeline(booking);
    if (timeline.hasEnded) {
      return res.status(400).json({ success: false, message: 'Conference has ended.' });
    }

    const access = canJoinConference(booking, userId, role);
    const inviteFee = calculateInviteAccessAmount(booking, timeline.remainingMinutes);
    const roomName = booking.conference_room_code;

    if (!access.allowed) {
      return res.status(403).json({
        success: false,
        message: access.reason,
        requires_payment: Boolean(access.requiresPayment),
        invite_fee: inviteFee,
        currency: booking.currency,
        minutes_left: timeline.remainingMinutes,
        conference_live: Boolean(booking.conference_started_at) && !timeline.hasEnded,
      });
    }

    if (access.source === 'invitee') {
      const idx = normalizeInvites(booking).findIndex((x) => String(x?.invitee_cand_id || '') === userId);
      if (idx >= 0 && !booking.invited_candidates[idx].joined_at) {
        booking.invited_candidates[idx].joined_at = new Date();
        await booking.save();
      }
    }

    let livekit;
    try {
      livekit = await buildLiveKitToken({
        bookingLike: booking,
        roomName,
        userId,
        role,
        accessSource: access.source,
        name: req.user?.name,
        email: req.user?.email,
      });
    } catch (err) {
      return res.status(503).json({ success: false, message: err.message || 'Video service is not configured.' });
    }

    return res.json({
      success: true,
      conference: {
        room_name: roomName,
        livekit_url: livekit.serverUrl,
        livekit_token: livekit.token,
        minutes_left: timeline.remainingMinutes,
        starts_at: booking.scheduled_for,
        ends_at: timeline.end,
        conference_live: Boolean(booking.conference_started_at) && !timeline.hasEnded,
        can_invite: String(booking.candidate_cand_id || '') === String(userId || ''),
        can_start: String(booking.lecturer_cand_id || '') === String(userId || ''),
        viewer_access_source: access.source,
      },
      booking: mapBooking(booking.toObject ? booking.toObject() : booking, userId, role),
    });
  } catch (error) {
    console.error('[Lecturer] getBookingConferenceAccess error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load conference access.' });
  }
};

exports.getMyDashboard = async (req, res) => {
  const lecturerId = await ensureLecturer(req, res);
  if (!lecturerId) return;

  try {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [pending, upcoming, paidMonthRows] = await Promise.all([
      LecturerBooking.countDocuments({ lecturer_cand_id: lecturerId, status: 'requested' }),
      LecturerBooking.countDocuments({ lecturer_cand_id: lecturerId, scheduled_for: { $gte: new Date() }, status: { $in: ['accepted', 'scheduled'] } }),
      LecturerBooking.find({
        lecturer_cand_id: lecturerId,
        payment_status: 'paid',
        createdAt: { $gte: monthStart },
      }).select('lecturer_share amount_total platform_share').lean(),
    ]);

    const earnings = paidMonthRows.reduce(
      (acc, row) => {
        acc.lecturer_share += Number(row.lecturer_share || 0);
        acc.platform_share += Number(row.platform_share || 0);
        acc.gross += Number(row.amount_total || 0);
        return acc;
      },
      { lecturer_share: 0, platform_share: 0, gross: 0 }
    );

    return res.json({
      success: true,
      dashboard: {
        pending_requests: pending,
        upcoming_sessions: upcoming,
        month_earnings: earnings,
      },
    });
  } catch (error) {
    console.error('[Lecturer] getMyDashboard error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load dashboard.' });
  }
};

exports.getMyEarnings = async (req, res) => {
  const lecturerId = await ensureLecturer(req, res);
  if (!lecturerId) return;

  try {
    const now = new Date();
    const year = Number(req.query?.year || now.getFullYear());
    const month = Number(req.query?.month || now.getMonth() + 1);
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 1);

    const rows = await LecturerBooking.find({
      lecturer_cand_id: lecturerId,
      payment_status: 'paid',
      createdAt: { $gte: from, $lt: to },
    }).sort({ createdAt: -1 }).lean();

    const totals = rows.reduce(
      (acc, row) => {
        acc.gross += Number(row.amount_total || 0);
        acc.lecturer_share += Number(row.lecturer_share || 0);
        acc.platform_share += Number(row.platform_share || 0);
        if (row.paid_out) acc.paid_out += Number(row.lecturer_share || 0);
        return acc;
      },
      { gross: 0, lecturer_share: 0, platform_share: 0, paid_out: 0 }
    );

    return res.json({
      success: true,
      period: { year, month },
      totals,
      bookings: rows.map(mapBooking),
    });
  } catch (error) {
    console.error('[Lecturer] getMyEarnings error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load earnings.' });
  }
};

exports.listPendingLecturerApprovals = async (req, res) => {
  try {
    const role = getCurrentRole(req);
    if (!isDeveloperLike(role)) return res.status(403).json({ success: false, message: 'Developer access required.' });

    const rows = await User.find({ role: 'lecturer' })
      .select('cand_id name email phone createdAt account_status')
      .sort({ createdAt: 1 })
      .lean();

    const profileMap = new Map((await LecturerProfile.find({ lecturer_cand_id: { $in: rows.map((r) => r.cand_id) } }).lean()).map((p) => [p.lecturer_cand_id, p]));

    const visibleRows = rows.filter((u) => {
      const profile = profileMap.get(u.cand_id);
      if (!profile) return false;
      const hasSubmission =
        Boolean(String(profile.full_name || '').trim()) ||
        Boolean(String(profile.id_card_number || '').trim()) ||
        Boolean(String(profile.id_card_front_url || '').trim()) ||
        Boolean(String(profile.id_card_back_url || '').trim()) ||
        Boolean(String(profile.certificate_scan_url || '').trim()) ||
        Boolean(profile.profile_completed);
      return hasSubmission;
    });

    return res.json({
      success: true,
      pending: visibleRows.map((u) => ({
        ...u,
        profile: {
          ...(profileMap.get(u.cand_id) || null),
          doc_review: getSafeDocReview(profileMap.get(u.cand_id) || {}),
        },
      })),
    });
  } catch (error) {
    console.error('[Lecturer] listPendingLecturerApprovals error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to load pending lecturer approvals.' });
  }
};

exports.setLecturerApproval = async (req, res) => {
  try {
    const role = getCurrentRole(req);
    if (!isDeveloperLike(role)) return res.status(403).json({ success: false, message: 'Developer access required.' });

    const lecturerId = String(req.params.lecturerId || '').trim();
    const approval = String(req.body?.approval || '').trim().toLowerCase();
    const note = String(req.body?.note || '').trim();

    if (!['approved', 'rejected'].includes(approval)) {
      return res.status(400).json({ success: false, message: 'Approval must be approved or rejected.' });
    }

    const user = await User.findOne({ cand_id: lecturerId, role: 'lecturer' });
    if (!user) return res.status(404).json({ success: false, message: 'Lecturer not found.' });

    const profile = await LecturerProfile.findOne({ lecturer_cand_id: lecturerId }).lean();
    if (!profile) {
      return res.status(400).json({ success: false, message: 'No lecturer profile found for review.' });
    }

    if (approval === 'approved') {
      if (!areAllRequiredDocsUploaded(profile)) {
        return res.status(400).json({ success: false, message: 'All required documents must be uploaded before approval.' });
      }
      if (!areAllRequiredDocsApproved(profile)) {
        return res.status(400).json({ success: false, message: 'All submitted documents must be approved individually before activating lecturer account.' });
      }
    }

    user.account_status = approval === 'approved' ? 'active' : 'pending_approval';
    if (approval === 'approved') {
      user.suspension = {
        start_at: null,
        end_at: null,
        reason: null,
        set_by: null,
        set_at: null,
      };
    }
    await user.save();

    await LecturerProfile.findOneAndUpdate(
      { lecturer_cand_id: lecturerId },
      {
        $set: {
          approval_status: approval,
          approval_note: note,
          approved_by: getCurrentUserId(req),
          approved_at: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ success: true, message: `Lecturer ${approval} successfully.` });
  } catch (error) {
    console.error('[Lecturer] setLecturerApproval error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to set lecturer approval.' });
  }
};

exports.deactivateLecturerAccount = async (req, res) => {
  try {
    const role = getCurrentRole(req);
    if (!isDeveloperLike(role)) return res.status(403).json({ success: false, message: 'Developer access required.' });

    const lecturerId = String(req.params.lecturerId || '').trim();
    const note = String(req.body?.note || '').trim();

    const user = await User.findOne({ cand_id: lecturerId, role: 'lecturer' });
    if (!user) return res.status(404).json({ success: false, message: 'Lecturer not found.' });

    user.account_status = 'suspended';
    user.suspension = {
      start_at: new Date(),
      end_at: null,
      reason: note || 'Lecturer account was deactivated by developer.',
      set_by: getCurrentUserId(req),
      set_at: new Date(),
    };
    await user.save();

    await LecturerProfile.findOneAndUpdate(
      { lecturer_cand_id: lecturerId },
      {
        $set: {
          approval_status: 'rejected',
          approval_note: note || 'Lecturer account was deactivated by developer.',
          approved_by: getCurrentUserId(req),
          approved_at: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.json({ success: true, message: 'Lecturer account deactivated successfully.' });
  } catch (error) {
    console.error('[Lecturer] deactivateLecturerAccount error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to deactivate lecturer account.' });
  }
};

exports.runMonthlyPayout = async (req, res) => {
  try {
    const role = getCurrentRole(req);
    if (!isDeveloperLike(role)) return res.status(403).json({ success: false, message: 'Developer access required.' });

    const year = Number(req.body?.year || new Date().getFullYear());
    const month = Number(req.body?.month || new Date().getMonth() + 1);
    const from = new Date(year, month - 1, 1);
    const to = new Date(year, month, 1);

    const toPayout = await LecturerBooking.find({
      payment_status: 'paid',
      paid_out: false,
      createdAt: { $gte: from, $lt: to },
    });

    let total = 0;
    for (const row of toPayout) {
      row.paid_out = true;
      row.paid_out_at = new Date();
      row.paid_out_by = getCurrentUserId(req);
      total += Number(row.lecturer_share || 0);
      await row.save();
    }

    return res.json({
      success: true,
      message: `Monthly payout processed for ${toPayout.length} booking(s).`,
      period: { year, month },
      paid_bookings: toPayout.length,
      total_paid_to_lecturers: Number(total.toFixed(2)),
    });
  } catch (error) {
    console.error('[Lecturer] runMonthlyPayout error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to run monthly payout.' });
  }
};

exports.setLecturerDocumentDecision = async (req, res) => {
  try {
    const role = getCurrentRole(req);
    if (!isDeveloperLike(role)) return res.status(403).json({ success: false, message: 'Developer access required.' });

    const lecturerId = String(req.params.lecturerId || '').trim();
    const docType = String(req.params.docType || '').trim();
    const decision = String(req.body?.decision || '').trim().toLowerCase();
    const note = String(req.body?.note || '').trim();

    if (!DOC_TYPES.includes(docType)) {
      return res.status(400).json({ success: false, message: `Invalid document type. Must be one of: ${DOC_TYPES.join(', ')}` });
    }
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ success: false, message: 'Decision must be approved or rejected.' });
    }

    const profile = await LecturerProfile.findOne({ lecturer_cand_id: lecturerId });
    if (!profile) return res.status(404).json({ success: false, message: 'Lecturer profile not found.' });

    const docUrlField = DOC_FIELD_MAP[docType];
    if (!String(profile[docUrlField] || '').trim()) {
      return res.status(400).json({ success: false, message: 'This document has not been uploaded yet.' });
    }

    const docReview = getSafeDocReview(profile);
    docReview[docType] = {
      status: decision,
      note: note.slice(0, 1000),
      reviewed_by: getCurrentUserId(req),
      reviewed_at: new Date(),
    };

    profile.doc_review = docReview;
    profile.markModified('doc_review');

    // Check if all required documents are now approved
    const allApproved = areAllRequiredDocsApproved(profile);

    if (allApproved) {
      profile.approval_status = 'approved';
      profile.approval_note = 'All documents approved. Account activated.';
      profile.approved_by = getCurrentUserId(req);
      profile.approved_at = new Date();
      await profile.save();
      await User.updateOne({ cand_id: lecturerId, role: 'lecturer' }, { $set: { account_status: 'active' } });
    } else {
      // Leave profile-level approval_status as pending regardless of individual rejections
      profile.approval_status = 'pending';
      profile.approval_note = decision === 'rejected'
        ? `Document ${docType} requires correction. Other documents are unaffected.`
        : 'Document reviewed. Waiting for remaining documents to be approved.';
      profile.approved_by = null;
      profile.approved_at = null;
      await profile.save();
      await User.updateOne({ cand_id: lecturerId, role: 'lecturer' }, { $set: { account_status: 'pending_approval' } });
    }

    return res.json({
      success: true,
      message: allApproved
        ? `${docType} approved. All documents approved — account has been activated.`
        : `${docType} ${decision} successfully.`,
      doc_review: getSafeDocReview(profile),
      account_activated: allApproved,
    });
  } catch (error) {
    console.error('[Lecturer] setLecturerDocumentDecision error:', error.message);
    return res.status(500).json({ success: false, message: 'Unable to update document decision.' });
  }
};

const ALLOWED_DOC_TYPES = ['id_card_front', 'id_card_back', 'certificate_scan'];
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];

exports.uploadDocument = async (req, res) => {
  const lecturerId = await ensureLecturer(req, res);
  if (!lecturerId) return;

  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file provided.' });
    }
    const docType = String(req.body.doc_type || '').trim();
    if (!ALLOWED_DOC_TYPES.includes(docType)) {
      return res.status(400).json({ success: false, message: 'Invalid doc_type. Must be one of: ' + ALLOWED_DOC_TYPES.join(', ') });
    }
    if (!ALLOWED_MIME.includes(req.file.mimetype)) {
      return res.status(400).json({ success: false, message: 'File must be JPEG, PNG, or WebP image.' });
    }

    const uploaded = await uploadFile(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      `lecturer-docs/${lecturerId}`
    );
    const url = normalizeDocUrlInput(uploaded?.url || uploaded);
    const s3Key = String(uploaded?.key || '').trim();

    const profile = await LecturerProfile.findOne({ lecturer_cand_id: lecturerId });
    const docField = DOC_FIELD_MAP[docType];
    const docKeyField = DOC_KEY_MAP[docType];
    const docReview = getSafeDocReview(profile || {});
    docReview[docType] = {
      status: 'pending',
      note: '',
      reviewed_by: null,
      reviewed_at: null,
    };

    await LecturerProfile.findOneAndUpdate(
      { lecturer_cand_id: lecturerId },
      {
        $set: {
          [docField]: url,
          [docKeyField]: s3Key,
          doc_review: docReview,
          approval_status: 'pending',
          approval_note: 'Documents submitted and under review.',
          approved_by: null,
          approved_at: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    await User.updateOne({ cand_id: lecturerId, role: 'lecturer' }, { $set: { account_status: 'pending_approval' } });

    return res.json({ success: true, url, key: s3Key, doc_type: docType });
  } catch (error) {
    console.error('[Lecturer] uploadDocument error:', error.message);
    return res.status(500).json({ success: false, message: 'File upload failed.' });
  }
};

// Stream a lecturer's document image from S3 — admin only
exports.streamAdminDoc = async (req, res) => {
  try {
    const role = getCurrentRole(req);
    if (!isDeveloperLike(role)) return res.status(403).json({ success: false, message: 'Developer access required.' });

    const { lecturerId, docType } = req.params;
    if (!ALLOWED_DOC_TYPES.includes(docType)) {
      return res.status(400).json({ success: false, message: 'Invalid doc_type.' });
    }

    const docKeyField = DOC_KEY_MAP[docType];
    const profile = await LecturerProfile.findOne({ lecturer_cand_id: lecturerId }).lean();
    if (!profile) return res.status(404).json({ success: false, message: 'Lecturer profile not found.' });

    const s3Key = String(profile[docKeyField] || '').trim();
    if (!s3Key) return res.status(404).json({ success: false, message: 'Document not available. The lecturer may need to re-upload.' });

    const stream = getS3ObjectStream(s3Key);
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=300');
    stream.on('error', (err) => {
      console.error('[Lecturer] streamAdminDoc S3 error:', err.message);
      if (!res.headersSent) res.status(500).json({ success: false, message: 'Failed to retrieve document from storage.' });
    });
    stream.pipe(res);
  } catch (error) {
    console.error('[Lecturer] streamAdminDoc error:', error.message);
    if (!res.headersSent) return res.status(500).json({ success: false, message: 'Failed to stream document.' });
  }
};

// Reset a doc to pending so the lecturer can re-upload — admin only
exports.resetAdminDoc = async (req, res) => {
  try {
    const role = getCurrentRole(req);
    if (!isDeveloperLike(role)) return res.status(403).json({ success: false, message: 'Developer access required.' });

    const { lecturerId, docType } = req.params;
    if (!ALLOWED_DOC_TYPES.includes(docType)) {
      return res.status(400).json({ success: false, message: 'Invalid doc_type.' });
    }

    const docField = DOC_FIELD_MAP[docType];
    const docKeyField = DOC_KEY_MAP[docType];
    const profile = await LecturerProfile.findOne({ lecturer_cand_id: lecturerId }).lean();
    if (!profile) return res.status(404).json({ success: false, message: 'Lecturer profile not found.' });

    const docReview = getSafeDocReview(profile);
    docReview[docType] = { status: 'pending', note: 'Admin requested re-upload.', reviewed_by: null, reviewed_at: null };

    await LecturerProfile.findOneAndUpdate(
      { lecturer_cand_id: lecturerId },
      { $set: { [docField]: '', [docKeyField]: '', doc_review: docReview } }
    );

    return res.json({ success: true, message: 'Document reset. Lecturer can re-upload.' });
  } catch (error) {
    console.error('[Lecturer] resetAdminDoc error:', error.message);
    return res.status(500).json({ success: false, message: 'Failed to reset document.' });
  }
};
