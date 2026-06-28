/**
 * Candidate Profile Controller
 */
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const path = require('path');
const { URL } = require('url');
const { uploadFile, getS3ObjectStream } = require('../utils/s3Uploader');
const { buildSubscriptionResponse, resolveSubscription, syncUserSubscriptionIfExpired } = require('../utils/subscriptionUtils');
const nodemailer = require('nodemailer');

const getDefaultLanguageForProgram = (program) => {
  const normalized = String(program || '').trim().toUpperCase();
  return ['BTS', 'LICENCE', 'MASTER'].includes(normalized) ? 'fr' : 'en';
};

const parseBooleanLike = (value) => {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (value === 1) return true;
    if (value === 0) return false;
    return null;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
    if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  }
  return null;
};

const imageContentType = (key) => {
  const ext = path.extname(key || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.gif') return 'image/gif';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
};

exports.getProfile = async (req, res) => {
  try {
    const { cand_id } = req.params;
    const user = await User.findOne({ cand_id })
      .select('cand_id name email phone address profile_picture role dpt_id program preferred_language academic_year allow_emails allow_push_notifications allow_toast_sound createdAt subscription')
      .populate('dpt_id', 'department_name abbreviation')
      .lean();
    if (!user) return res.status(404).json({ message: 'Candidate not found' });
    const resolvedSubscription = resolveSubscription(user.subscription);
    if (resolvedSubscription.fallback_applied) {
      await syncUserSubscriptionIfExpired(cand_id, resolvedSubscription);
      user.subscription = {
        plan: 'basic',
        status: 'active',
        activated_at: new Date(),
        expires_at: null,
        last_payment_at: resolvedSubscription.last_payment_at || null,
        phone_number: resolvedSubscription.phone_number || null,
        source_transaction_id: resolvedSubscription.source_transaction_id || null,
      };
    }
    res.json({
      cand_id: user.cand_id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      address: user.address,
      profile_picture: user.profile_picture,
      role: user.role,
      program: String(user.program || 'HND').toUpperCase(),
      preferred_language: String(user.preferred_language || getDefaultLanguageForProgram(user.program || 'HND')).toLowerCase(),
      academic_year: user.academic_year,
      allow_emails: user.allow_emails,
      allow_push_notifications: Boolean(user.allow_push_notifications),
      allow_toast_sound: user.allow_toast_sound !== false,
      createdAt: user.createdAt,
      subscription: await buildSubscriptionResponse(user.subscription),
      department: user.dpt_id
        ? {
            dpt_id: user.dpt_id._id,
            department_name: user.dpt_id.department_name,
            abbreviation: user.dpt_id.abbreviation,
          }
        : null,
    });
  } catch (err) {
    res.status(500).json({ message: 'Database error' });
  }
};

exports.updateProfile = async (req, res) => {
  try {
    const { cand_id } = req.params;
    const { name, phone, address } = req.body;
    if (!name || !phone) return res.status(400).json({ message: 'Invalid profile data' });

    await User.findOneAndUpdate(
      { cand_id },
      { $set: { name: name.trim(), phone: phone.trim(), address: address?.trim() || null } }
    );
    res.json({ message: 'Profile updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Profile update failed' });
  }
};

exports.updatePassword = async (req, res) => {
  try {
    const { cand_id } = req.params;
    const { newPassword } = req.body;
    if (!newPassword) return res.status(400).json({ message: 'Password required' });

    const hash = await bcrypt.hash(newPassword, 12);
    await User.findOneAndUpdate({ cand_id }, { $set: { password: hash } });
    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    res.status(500).json({ message: 'Password update failed' });
  }
};

exports.uploadPicture = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });
    const { cand_id } = req.params;

    console.log('[Profile] Attempting picture upload:', {
      candId: cand_id,
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      fileSize: req.file.size || req.file.buffer.length,
    });

    let profile_picture;

    try {
      console.log('[Profile] Uploading profile picture to S3...');
      const upload = await uploadFile(
        req.file.buffer,
        req.file.originalname,
        req.file.mimetype,
        'profile-pictures'
      );
      profile_picture = upload.url;

      console.log('[Profile] S3 upload successful:', {
        candId: cand_id,
        s3Key: upload.key,
        s3Url: profile_picture,
      });
    } catch (s3Err) {
      console.error('[Profile] S3 upload failed:', {
        candId: cand_id,
        error: s3Err.message,
        code: s3Err.code,
        stack: s3Err.stack,
      });
      return res.status(500).json({ message: 'S3 profile picture upload failed', details: s3Err.message });
    }

    const updatedUser = await User.findOneAndUpdate(
      { cand_id },
      { $set: { profile_picture } },
      { returnDocument: 'after' }
    );

    if (!updatedUser) {
      return res.status(404).json({ message: 'Candidate not found' });
    }

    console.log('[Profile] Profile picture updated successfully:', {
      candId: cand_id,
      pictureUrl: profile_picture,
      updatedUserProfilePicture: updatedUser.profile_picture,
    });

    res.json({ message: 'Profile picture updated', profile_picture });
  } catch (err) {
    console.error('[Profile] Picture upload error:', {
      error: err.message,
      candId: req.params?.cand_id,
      stack: err.stack,
    });
    res.status(500).json({ message: 'Image update failed' });
  }
};

exports.serveProfilePicture = async (req, res) => {
  try {
    const { cand_id } = req.params;
    const user = await User.findOne({ cand_id }).select('profile_picture').lean();
    if (!user || !user.profile_picture) {
      return res.status(404).json({ message: 'Profile picture not found' });
    }

    const pictureUrl = user.profile_picture;
    res.set('Access-Control-Allow-Origin', '*');
    res.set('Access-Control-Allow-Headers', 'Content-Type');

    if (pictureUrl.startsWith('/uploads/')) {
      return res.redirect(pictureUrl);
    }

    if (/^https?:\/\//i.test(pictureUrl)) {
      return res.redirect(pictureUrl);
    }

    try {
      const objectKey = pictureUrl.replace(/^\//, '');
      const stream = getS3ObjectStream(objectKey);
      res.set('Content-Type', imageContentType(objectKey));
      res.set('Cache-Control', 'public, max-age=3600');
      stream.on('error', (err) => {
        console.error('[Profile] Profile picture stream error:', {
          candId: cand_id,
          pictureUrl,
          error: err.message,
        });
        if (!res.headersSent) {
          res.status(500).send('Failed to load profile picture');
        }
      });
      return stream.pipe(res);
    } catch (err) {
      console.warn('[Profile] Profile picture fallback redirect:', {
        candId: cand_id,
        pictureUrl,
        error: err.message,
      });
      return res.redirect(pictureUrl);
    }
  } catch (err) {
    console.error('[Profile] Serve profile picture error:', {
      candId: req.params?.cand_id,
      error: err.message,
    });
    return res.status(500).json({ message: 'Failed to serve profile picture' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { cand_id } = req.params;
    const {
      allow_emails,
      allow_push_notifications,
      allow_toast_sound,
      allowToastSound,
      preferred_language,
    } = req.body;
    const query = req.query || {};
    const next = {};

    const parsedAllowEmails = parseBooleanLike(
      allow_emails !== undefined ? allow_emails : query.allow_emails
    );
    if (parsedAllowEmails !== null) {
      next.allow_emails = parsedAllowEmails;
    }
    const parsedAllowPush = parseBooleanLike(
      allow_push_notifications !== undefined ? allow_push_notifications : query.allow_push_notifications
    );
    if (parsedAllowPush !== null) {
      next.allow_push_notifications = parsedAllowPush;
      if (!parsedAllowPush) {
        next.push_subscription = null;
      }
    }
    const hasSnakeToast = Object.prototype.hasOwnProperty.call(req.body || {}, 'allow_toast_sound')
      || Object.prototype.hasOwnProperty.call(query, 'allow_toast_sound');
    const hasCamelToast = Object.prototype.hasOwnProperty.call(req.body || {}, 'allowToastSound')
      || Object.prototype.hasOwnProperty.call(query, 'allowToastSound');
    const rawToastSound = hasSnakeToast
      ? (allow_toast_sound !== undefined ? allow_toast_sound : query.allow_toast_sound)
      : (allowToastSound !== undefined ? allowToastSound : query.allowToastSound);
    const parsedToastSound = parseBooleanLike(rawToastSound);
    if (parsedToastSound !== null) {
      next.allow_toast_sound = parsedToastSound;
    }
    if (typeof preferred_language === 'string') {
      const normalizedLanguage = String(preferred_language).trim().toLowerCase();
      if (!['en', 'fr'].includes(normalizedLanguage)) {
        return res.status(400).json({ message: 'preferred_language must be en or fr' });
      }
      next.preferred_language = normalizedLanguage;
    }

    if (!Object.keys(next).length) {
      return res.status(400).json({ message: 'Invalid settings data' });
    }

    await User.findOneAndUpdate({ cand_id }, { $set: next });
    return res.json({ message: 'Settings updated successfully', ...next });
  } catch (err) {
    return res.status(500).json({ message: 'Settings update failed' });
  }
};

exports.updatePushSubscription = async (req, res) => {
  try {
    const { cand_id } = req.params;
    const subscription = req.body?.subscription;

    const endpoint = String(subscription?.endpoint || '').trim();
    const p256dh = String(subscription?.keys?.p256dh || '').trim();
    const auth = String(subscription?.keys?.auth || '').trim();

    if (!endpoint || !p256dh || !auth) {
      return res.status(400).json({ message: 'Invalid push subscription payload' });
    }

    await User.findOneAndUpdate(
      { cand_id },
      {
        $set: {
          allow_push_notifications: true,
          push_subscription: {
            endpoint,
            expirationTime: subscription?.expirationTime || null,
            keys: { p256dh, auth },
          },
          push_subscription_updated_at: new Date(),
        },
      }
    );

    return res.json({ message: 'Push subscription saved' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to save push subscription' });
  }
};

exports.deletePushSubscription = async (req, res) => {
  try {
    const { cand_id } = req.params;
    await User.findOneAndUpdate(
      { cand_id },
      {
        $set: {
          push_subscription: null,
          allow_push_notifications: false,
          push_subscription_updated_at: new Date(),
        },
      }
    );
    return res.json({ message: 'Push subscription removed' });
  } catch (err) {
    return res.status(500).json({ message: 'Failed to remove push subscription' });
  }
};

exports.reportPushFailure = async (req, res) => {
  try {
    const { cand_id } = req.params;
    const { reason, stage, browser } = req.body || {};
    const user = await User.findOne({ cand_id }).select('cand_id name email role').lean();

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || process.env.EMAIL_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || process.env.EMAIL_PORT || '587', 10),
      secure: String(process.env.SMTP_SECURE || process.env.EMAIL_SECURE || 'false').toLowerCase() === 'true',
      auth: {
        user: process.env.SMTP_USER || process.env.EMAIL_USER,
        pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.EMAIL_USER || 'no-reply@acadex.local',
      to: process.env.DEVELOPER_ALERT_EMAIL || process.env.EMAIL_USER || 'developer@acadex.local',
      subject: 'Push Notification Failure Alert',
      html: `
        <div>
          <h3>Push notification setup failed</h3>
          <p><strong>User:</strong> ${user.name || user.cand_id}</p>
          <p><strong>Username:</strong> ${user.email || user.cand_id}</p>
          <p><strong>Role:</strong> ${user.role || 'candidate'}</p>
          <p><strong>Browser:</strong> ${browser || 'unknown'}</p>
          <p><strong>Stage:</strong> ${stage || 'unknown'}</p>
          <p><strong>Reason:</strong> ${reason || 'unknown'}</p>
          <p><strong>Time:</strong> ${new Date().toISOString()}</p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    return res.json({ message: 'Push failure report sent' });
  } catch (err) {
    console.error('[PushFailure] email failed', err?.message || err);
    return res.status(500).json({ message: 'Failed to report push failure' });
  }
};
