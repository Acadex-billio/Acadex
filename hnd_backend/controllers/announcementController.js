const Announcement = require('../models/Announcement');
const Department = require('../models/Department');
const User = require('../models/User');
const path = require('path');
const fs = require('fs');
const { uploadFile, getS3ObjectStream } = require('../utils/s3Uploader');
const { sendWebPushNotification, isWebPushConfigured } = require('../utils/webPush');

const S3_BASE_URL = String(process.env.AWS_S3_URL || '').replace(/\/$/, '');

const DAY_MS = 24 * 60 * 60 * 1000;

function parseIntSafe(v, fallback) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}

function coerceStringArray(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  try {
    const parsed = JSON.parse(String(v));
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch (_) {
    return String(v)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

function isActive(a, now = new Date()) {
  if (!a) return false;
  if (!a.expires_at) return false;
  return new Date(a.expires_at) > now;
}

function getS3KeyFromValue(value) {
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
}

async function notifyAudienceForAnnouncement(doc) {
  if (!isWebPushConfigured) return;

  const audienceType = String(doc?.audience_type || 'general');
  const program = String(doc?.program || 'HND').toUpperCase() === 'BTS' ? 'BTS' : 'HND';
  const candidateBase = {
    role: 'candidate',
    account_status: 'active',
    allow_push_notifications: true,
    push_subscription: { $ne: null },
    program,
  };

  const candidateQuery = { ...candidateBase };

  if (audienceType === 'departments') {
    candidateQuery.dpt_id = { $in: Array.isArray(doc.department_ids) ? doc.department_ids : [] };
  } else if (audienceType === 'faculty' && doc.faculty) {
    const deptRows = await Department.find({ faculty: doc.faculty }).select('_id').lean();
    const deptIds = deptRows.map((d) => d._id);
    candidateQuery.dpt_id = { $in: deptIds };
  }

  const users = await User.find(candidateQuery)
    .select('cand_id push_subscription allow_push_notifications')
    .lean();

  if (!users.length) return;

  const payload = {
    title: doc.title,
    body: doc.body,
    source: doc.source,
    announcementId: String(doc._id),
    url: '/candidate/announcements',
    tag: `announcement-${String(doc._id)}`,
  };

  await Promise.allSettled(
    users.map((u) => sendWebPushNotification(u.push_subscription, payload))
  );
}

exports.create = async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const source = String(req.body.source || '').trim();
    const body = String(req.body.body || '').trim();
    const program = String(req.body.program || 'HND').trim().toUpperCase() === 'BTS' ? 'BTS' : 'HND';

    const audienceType = String(req.body.audience_type || 'general').trim().toLowerCase();
    const departmentIdsRaw = coerceStringArray(req.body.department_ids);
    const faculty = req.body.faculty ? String(req.body.faculty).trim() : null;

    const durationDays = clamp(parseIntSafe(req.body.duration_days, 7), 1, 365);
    const expiresAt = new Date(Date.now() + durationDays * DAY_MS);

    if (!title || !source || !body) {
      return res.status(400).json({ success: false, message: 'Missing required fields.' });
    }

    if (!['general', 'departments', 'faculty'].includes(audienceType)) {
      return res.status(400).json({ success: false, message: 'Invalid audience_type.' });
    }

    if (audienceType === 'departments' && departmentIdsRaw.length === 0) {
      return res.status(400).json({ success: false, message: 'department_ids required for departments audience.' });
    }

    if (audienceType === 'faculty' && !faculty) {
      return res.status(400).json({ success: false, message: 'faculty is required for faculty audience.' });
    }

    const createdBy = req.user?.cand_id || req.user?.email || null;

    let attachment = null;
    if (req.file) {
      try {
        console.log('[Announcement] Uploading attachment to S3...');
        const upload = await uploadFile(
          req.file.buffer,
          req.file.originalname,
          req.file.mimetype,
          'announcements'
        );
        
        attachment = {
          filename: upload.key,
          originalname: req.file.originalname,
          mimetype: req.file.mimetype,
          size: req.file.size,
          url: upload.url,
        };

        console.log('[Announcement] S3 upload successful:', {
          key: upload.key,
          url: upload.url,
        });
      } catch (s3Err) {
        console.error('[Announcement] S3 upload failed:', {
          error: s3Err.message,
          stack: s3Err.stack,
        });
        return res.status(500).json({ success: false, message: 'Failed to upload announcement attachment to S3' });
      }
    }

    const doc = await Announcement.create({
      title,
      source,
      body,
      program,
      audience_type: audienceType,
      department_ids: audienceType === 'departments' ? departmentIdsRaw : [],
      faculty: audienceType === 'faculty' ? faculty : null,
      attachment,
      created_by: createdBy,
      expires_at: expiresAt,
    });

    notifyAudienceForAnnouncement(doc).catch((err) => {
      console.warn('[Announcement] Push dispatch failed:', err?.message || err);
    });

    return res.status(201).json({ success: true, announcement_id: doc._id });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to create announcement' });
  }
};

exports.listAdmin = async (req, res) => {
  try {
    const page = clamp(parseIntSafe(req.query.page, 1), 1, 1000000);
    const limit = clamp(parseIntSafe(req.query.limit, 20), 1, 100);
    const includeExpired = String(req.query.include_expired || 'true').toLowerCase() === 'true';
    const programFilter = String(req.query.program || '').trim().toUpperCase();

    const now = new Date();
    const query = includeExpired ? {} : { expires_at: { $gt: now } };
    if (programFilter === 'HND' || programFilter === 'BTS') {
      query.program = programFilter;
    }

    const [rows, total] = await Promise.all([
      Announcement.find(query).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      Announcement.countDocuments(query),
    ]);

    const formatted = rows.map((a) => ({
      announcement_id: a._id,
      title: a.title,
      source: a.source,
      body: a.body,
      program: String(a.program || 'HND').toUpperCase(),
      audience_type: a.audience_type,
      department_ids: a.department_ids || [],
      faculty: a.faculty || null,
      created_by: a.created_by || null,
      created_at: a.createdAt,
      expires_at: a.expires_at,
      is_active: isActive(a, now),
      attachment: a.attachment
        ? {
            filename: a.attachment.filename,
            originalname: a.attachment.originalname,
            mimetype: a.attachment.mimetype,
            size: a.attachment.size,
          }
        : null,
      reactions_count: Array.isArray(a.reactions) ? a.reactions.length : 0,
    }));

    return res.json({ success: true, announcements: formatted, pagination: { page, limit, total } });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load announcements' });
  }
};

exports.listActiveForCandidate = async (req, res) => {
  try {
    // Get user ID from JWT token
    const candId = req.user?.cand_id;
    const deptId = req.user?.dpt_id;
    if (!candId || !deptId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const dept = await Department.findById(deptId).select('faculty').lean();
    const faculty = dept?.faculty ? String(dept.faculty).trim() : null;
    const program = String(req.user?.program || 'HND').trim().toUpperCase() === 'BTS' ? 'BTS' : 'HND';

    const now = new Date();

    const query = {
      program,
      expires_at: { $gt: now },
      $or: [
        { audience_type: 'general' },
        { audience_type: 'departments', department_ids: deptId },
        ...(faculty ? [{ audience_type: 'faculty', faculty }] : []),
      ],
    };

    const rows = await Announcement.find(query).sort({ createdAt: -1 }).lean();

    const formatted = rows.map((a) => {
      const myReaction = Array.isArray(a.reactions)
        ? a.reactions.find((r) => String(r.cand_id) === String(candId))
        : null;

      return {
        announcement_id: a._id,
        title: a.title,
        source: a.source,
        body: a.body,
        program: String(a.program || 'HND').toUpperCase(),
        audience_type: a.audience_type,
        faculty: a.faculty || null,
        created_at: a.createdAt,
        expires_at: a.expires_at,
        attachment: a.attachment
          ? {
              filename: a.attachment.filename,
              originalname: a.attachment.originalname,
              mimetype: a.attachment.mimetype,
              size: a.attachment.size,
              url: `/api/announcements/${a._id}/attachment`,
            }
          : null,
        reactions_count: Array.isArray(a.reactions) ? a.reactions.length : 0,
        my_reaction: myReaction ? { emoji: myReaction.emoji, reacted_at: myReaction.reacted_at } : null,
      };
    });

    return res.json({ success: true, announcements: formatted });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load announcements' });
  }
};

exports.getActiveCountForCandidate = async (req, res) => {
  try {
    // Get user ID from JWT token
    const deptId = req.user?.dpt_id;
    if (!deptId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const dept = await Department.findById(deptId).select('faculty').lean();
    const faculty = dept?.faculty ? String(dept.faculty).trim() : null;
    const program = String(req.user?.program || 'HND').trim().toUpperCase() === 'BTS' ? 'BTS' : 'HND';

    const now = new Date();
    const query = {
      program,
      expires_at: { $gt: now },
      $or: [
        { audience_type: 'general' },
        { audience_type: 'departments', department_ids: deptId },
        ...(faculty ? [{ audience_type: 'faculty', faculty }] : []),
      ],
    };

    const count = await Announcement.countDocuments(query);
    return res.json({ success: true, count });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to load count' });
  }
};

exports.toggleReaction = async (req, res) => {
  try {
    // Get user ID from JWT token
    const candId = req.user?.cand_id;
    const deptId = req.user?.dpt_id;
    if (!candId || !deptId) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const emoji = String(req.body.emoji || '').trim();
    if (!emoji) {
      return res.status(400).json({ success: false, message: 'emoji is required' });
    }

    const { id } = req.params;
    const a = await Announcement.findById(id);
    if (!a) return res.status(404).json({ success: false, message: 'Announcement not found' });

    if (!isActive(a)) {
      return res.status(400).json({ success: false, message: 'Announcement expired' });
    }

    const idx = Array.isArray(a.reactions)
      ? a.reactions.findIndex((r) => String(r.cand_id) === String(candId))
      : -1;

    if (idx >= 0) {
      const existing = a.reactions[idx];
      if (String(existing.emoji) === emoji) {
        a.reactions.splice(idx, 1);
      } else {
        a.reactions[idx] = { cand_id: String(candId), emoji, reacted_at: new Date() };
      }
    } else {
      a.reactions.push({ cand_id: String(candId), emoji, reacted_at: new Date() });
    }

    await a.save();

    const my = a.reactions.find((r) => String(r.cand_id) === String(candId)) || null;
    return res.json({
      success: true,
      reactions_count: a.reactions.length,
      my_reaction: my ? { emoji: my.emoji, reacted_at: my.reacted_at } : null,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to react' });
  }
};

exports.downloadAttachment = async (req, res) => {
  try {
    // Get user ID from JWT token
    const candId = req.user?.cand_id;
    const role = String(req.user?.role || '').toLowerCase();
    const isAdmin = role === 'admin' || role === 'developer' || req.user?.is_admin === true;
    if (!candId && !isAdmin) {
      return res.status(401).json({ success: false, message: 'Not authenticated' });
    }

    const { id } = req.params;
    const a = await Announcement.findById(id).select('attachment expires_at').lean();
    if (!a) return res.status(404).json({ success: false, message: 'Announcement not found' });
    if (!a.attachment) return res.status(404).json({ success: false, message: 'No attachment' });

    // Stream S3 attachment through backend (keeps JWT auth path and avoids browser CORS issues)
    const s3Key = getS3KeyFromValue(a.attachment.filename || a.attachment.url);
    if (s3Key) {
      const stream = getS3ObjectStream(s3Key);
      res.setHeader('Content-Type', a.attachment.mimetype || 'application/octet-stream');
      res.setHeader('Content-Disposition', 'inline');
      stream.on('error', (err) => {
        console.error('[Announcement] S3 stream error:', err.message);
        if (!res.headersSent) {
          res.status(404).json({ success: false, message: 'File not found' });
        }
      });
      return stream.pipe(res);
    }

    // Fallback to local file serving
    const filePath = path.join(__dirname, '../uploads/announcements', a.attachment.filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ success: false, message: 'File not found' });
    }

    console.log('[Announcement] Serving local attachment:', filePath);
    return res.download(filePath, a.attachment.originalname);
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to download attachment' });
  }
};

exports.remove = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Announcement.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }
    return res.json({ success: true, message: 'Announcement deleted' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to delete announcement' });
  }
};

exports.republish = async (req, res) => {
  try {
    const { id } = req.params;
    const durationDays = clamp(parseIntSafe(req.body?.duration_days, 7), 1, 365);
    const nextExpiry = new Date(Date.now() + durationDays * DAY_MS);

    const updated = await Announcement.findByIdAndUpdate(
      id,
      { $set: { expires_at: nextExpiry } },
      { returnDocument: 'after' }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    notifyAudienceForAnnouncement(updated).catch((err) => {
      console.warn('[Announcement] Republish push dispatch failed:', err?.message || err);
    });

    return res.json({
      success: true,
      message: 'Announcement republished',
      announcement: {
        announcement_id: updated._id,
        expires_at: updated.expires_at,
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message || 'Failed to republish announcement' });
  }
};
