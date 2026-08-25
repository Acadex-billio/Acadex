const User = require('../models/User');
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const QuestionPaper = require('../models/QuestionPaper');
const ChatRoom = require('../models/ChatRoom');
const CandidatePurchase = require('../models/CandidatePurchase');
const PaymentAccessGrant = require('../models/PaymentAccessGrant');
const PaymentTransaction = require('../models/PaymentTransaction');
const History = require('../models/History');
const { sendEmail } = require('../services/emailService');
const logger = require('../utils/logger');
const ConcoursAuditLog = require('../models/ConcoursAuditLog');

const PLAN_DURATION_MS = 90 * 24 * 60 * 60 * 1000;
const DEFAULT_ACCESS_MINUTES = 60;

function normalizePurchaseItemType(itemType) {
  const raw = String(itemType || '').trim().toLowerCase();
  if (raw === 'questionpaper' || raw === 'question_paper' || raw === 'paper') return 'paper';
  if (raw === 'report') return 'report';
  if (raw === 'presentation') return 'presentation';
  if (raw === 'chat_room' || raw === 'chatroom' || raw === 'center') return 'center';
  if (raw === 'ai_mode' || raw === 'ai-mode' || raw === 'ai') return 'ai_mode';
  if (raw === 'plan' || raw.startsWith('plan_')) return 'plan';
  return raw;
}

async function loadItemTitle(itemType, itemId) {
  if (!itemType || !itemId) return null;
  const normalized = normalizePurchaseItemType(itemType);
  const id = String(itemId || '').trim();
  if (!id) return null;

  try {
    if (normalized === 'paper') {
      const doc = await QuestionPaper.findById(id).select('course_title hnd_year').lean();
      if (!doc) return null;
      const courseTitle = String(doc.course_title || '').trim();
      const year = String(doc.hnd_year || '').trim();
      return courseTitle ? `${courseTitle}${year ? ` ${year}` : ''}` : null;
    }
    if (normalized === 'report') {
      const doc = await Report.findById(id).select('title writer_names').lean();
      if (!doc) return null;
      const title = String(doc.title || '').trim();
      const writer = String(doc.writer_names || '').trim();
      return title ? `${title}${writer ? ` by ${writer}` : ''}` : null;
    }
    if (normalized === 'presentation') {
      const doc = await Presentation.findById(id).select('title presenter_name').lean();
      if (!doc) return null;
      const title = String(doc.title || '').trim();
      const presenter = String(doc.presenter_name || '').trim();
      return title ? `${title}${presenter ? ` by ${presenter}` : ''}` : null;
    }
    if (normalized === 'center') {
      const doc = await ChatRoom.findById(id).select('name').lean();
      return doc ? String(doc.name || '').trim() : null;
    }
  } catch (_) {
    return null;
  }
  return null;
}

function getMaterialDisplayInfo(itemType, itemTitle, year, writerName) {
  const normalizedType = normalizePurchaseItemType(itemType);
  const title = String(itemTitle || '').trim();
  const materialType = normalizedType === 'paper'
    ? 'Question paper'
    : normalizedType === 'report'
    ? 'Report'
    : normalizedType === 'presentation'
    ? 'Presentation'
    : 'Material';
  const detailLabel = normalizedType === 'paper' ? 'Year' : normalizedType === 'report' ? 'Writer' : normalizedType === 'presentation' ? 'Presenter' : 'Detail';
  const detailValue = normalizedType === 'paper'
    ? String(year || '').trim()
    : normalizedType === 'report'
    ? String(writerName || '').trim()
    : normalizedType === 'presentation'
    ? String(writerName || '').trim()
    : '';
  return { materialType, title: title || 'the requested material', detailLabel, detailValue };
}

async function sendMaterialGrantEmail(user, itemType, itemTitle, itemYear, itemWriterName, accessAction) {
  if (!user?.email) return null;
  const { materialType, title, detailLabel, detailValue } = getMaterialDisplayInfo(itemType, itemTitle, itemYear, itemWriterName);
  const actionLabel = String(accessAction || '').trim().toLowerCase() === 'download' ? 'download' : 'preview';
  const subject = `${materialType} access granted`;
  const text = [
    `Hello ${String(user.name || 'there').trim() || 'there'},`,
    '',
    `Access to ${materialType.toLowerCase()} "${title}" has been granted for ${actionLabel}.`,
    `Type: ${materialType}`,
    `Title: ${title}`,
    detailLabel ? `${detailLabel}: ${detailValue || 'Not provided'}` : null,
    '',
    'You can now access it from your account.',
  ].filter(Boolean).join('\n');

  try {
    return await sendEmail({ to: user.email, subject, text });
  } catch (err) {
    console.error('sendMaterialGrantEmail error', err);
    return null;
  }
}

function buildCandidatePurchaseRecord(transaction, user, overrides = {}) {
  const now = transaction.completed_at ? new Date(transaction.completed_at) : new Date();
  const candidateName = String(user?.name || user?.candidate_name || '').trim() || null;
  const candidateEmail = String(user?.email || user?.candidate_email || '').trim() || null;
  const providerReference = String(transaction.provider_reference || transaction.external_reference || '').trim() || null;
  const mappedType = normalizePurchaseItemType(transaction.resource_type || overrides.item_type || 'plan');
  const itemId = overrides.item_id || String(transaction.resource_id || '').trim() || null;
  const itemTitle = overrides.item_title || null;
  const status = overrides.status || 'grant-success';
  const plan = overrides.plan || (transaction.purpose_type === 'subscription' ? String(transaction.purpose_code || '').replace(/^plan_/, '').trim() : null) || String(user?.subscription?.plan || '').trim() || null;
  const paidAt = now;
  const accessMinutes = Number(transaction.metadata?.access_minutes || DEFAULT_ACCESS_MINUTES) || DEFAULT_ACCESS_MINUTES;
  let expiresAt = overrides.expires_at || null;

  if (!expiresAt) {
    if (mappedType === 'plan') {
      expiresAt = new Date(now.getTime() + PLAN_DURATION_MS);
    } else if (mappedType === 'report' || mappedType === 'presentation' || mappedType === 'paper' || mappedType === 'ai_mode') {
      expiresAt = new Date(now.getTime() + accessMinutes * 60 * 1000);
    } else if (mappedType === 'center') {
      expiresAt = new Date(now.getTime() + PLAN_DURATION_MS);
    } else {
      expiresAt = new Date(now.getTime() + accessMinutes * 60 * 1000);
    }
  }

  return {
    candidate_id: user?._id || null,
    candidate_name: candidateName,
    candidate_email: candidateEmail,
    plan: plan || null,
    item_type: mappedType,
    item_id: itemId || null,
    item_title: itemTitle || null,
    year: overrides.year || null,
    amount: Number(transaction.amount || 0),
    currency: String(transaction.currency || 'XAF'),
    paid_at: paidAt,
    expires_at: expiresAt,
    status,
    provider_reference: providerReference,
    payment_transaction_id: transaction._id,
    meta: {
      purpose_type: transaction.purpose_type,
      purpose_code: transaction.purpose_code,
      description: transaction.description,
      ...(transaction.metadata || {}),
      ...(overrides.meta || {}),
    },
  };
}

async function upsertCandidatePurchase(transaction, user, overrides = {}) {
  if (!transaction || !user) return null;
  const record = buildCandidatePurchaseRecord(transaction, user, overrides);
  if (!record.candidate_id) return null;

  const query = { payment_transaction_id: transaction._id };
  const update = { $set: record };
  const options = { upsert: true, new: true, setDefaultsOnInsert: true };
  return CandidatePurchase.findOneAndUpdate(query, update, options).lean();
}

async function applySubscriptionToUser(transaction) {
  const nextPlan = String(transaction.purpose_code || '').replace(/^plan_/, '') || 'paygo';
  await User.updateOne(
    { cand_id: transaction.user_cand_id },
    {
      $set: {
        subscription: {
          plan: nextPlan,
          status: 'active',
          activated_at: new Date(),
          expires_at: new Date(Date.now() + PLAN_DURATION_MS),
          last_payment_at: new Date(),
          phone_number: transaction.phone_number,
          source_transaction_id: transaction._id,
        },
      },
    }
  );

  const user = await User.findOne({ cand_id: transaction.user_cand_id }).lean();
  if (user) {
    await upsertCandidatePurchase(transaction, user, {
      item_type: 'plan',
      item_id: String(nextPlan),
      item_title: `${String(nextPlan).toUpperCase()} subscription`,
      plan: nextPlan,
    });
  }
}

async function ensureMaterialAccessGrant(transaction) {
  const existingGrant = await PaymentAccessGrant.findOne({
    transaction_id: transaction._id,
    user_cand_id: transaction.user_cand_id,
    grant_code: String(transaction.purpose_code || '').trim(),
    resource_id: String(transaction.resource_id),
  }).lean();

  if (existingGrant) return existingGrant;

  const accessMinutes = Number(transaction.metadata?.access_minutes || DEFAULT_ACCESS_MINUTES) || DEFAULT_ACCESS_MINUTES;
  const expiresAt = new Date(Date.now() + accessMinutes * 60 * 1000);
  const grantCode = String(transaction.purpose_code || '').trim();

  return PaymentAccessGrant.findOneAndUpdate(
    {
      user_cand_id: transaction.user_cand_id,
      transaction_id: transaction._id,
      grant_code: grantCode,
      resource_id: String(transaction.resource_id),
    },
    {
      $setOnInsert: {
        user_cand_id: transaction.user_cand_id,
        grant_code: grantCode,
        resource_type: transaction.resource_type,
        resource_id: String(transaction.resource_id),
        transaction_id: transaction._id,
        amount: transaction.amount,
        currency: transaction.currency,
        status: 'active',
        granted_at: new Date(),
        expires_at: expiresAt,
        metadata: {
          description: transaction.description,
        },
      },
    },
    { upsert: true, new: true }
  );
}

async function applyMaterialAccessTransaction(transaction) {
  const user = await User.findOne({ cand_id: transaction.user_cand_id }).lean();
  if (!user) return null;
  await ensureMaterialAccessGrant(transaction);

  const itemType = normalizePurchaseItemType(transaction.resource_type || 'report');
  const itemTitle = await loadItemTitle(transaction.resource_type, transaction.resource_id);
  const year = null;
  await upsertCandidatePurchase(transaction, user, {
    item_type: itemType,
    item_id: String(transaction.resource_id || '').trim(),
    item_title: itemTitle || String(transaction.resource_id || '').trim(),
    year,
    meta: {
      access_type: transaction.metadata?.action || null,
    },
  });
  await sendMaterialGrantEmail(
    { name: user.name, email: user.email },
    itemType,
    itemTitle || String(transaction.resource_id || '').trim(),
    null,
    null,
    transaction.metadata?.action || 'preview'
  );
}

async function applyCenterAccessTransaction(transaction) {
  const user = await User.findOne({ cand_id: transaction.user_cand_id }).lean();
  if (!user) return null;
  await upsertCandidatePurchase(transaction, user, {
    item_type: 'center',
    item_id: String(transaction.resource_id || '').trim(),
    item_title: await loadItemTitle('chat_room', transaction.resource_id),
    meta: {
      access_type: transaction.metadata?.center_action || null,
    },
  });
}

async function applySuccessfulPayment(transaction) {
  if (!transaction) return transaction;

  const updated = await PaymentTransaction.findOneAndUpdate(
    { _id: transaction._id, status: { $ne: 'successful' } },
    { $set: { status: 'successful', completed_at: new Date() } },
    { new: true }
  );

  const finalTx = updated || transaction;

  if (String(finalTx.status || '').toLowerCase() !== 'successful') {
    return finalTx;
  }

  if (finalTx.purpose_type === 'concours_partnership') {
    const partner = await User.findOne({ cand_id: finalTx.user_cand_id, role: 'concour_partner' });
    if (partner && String(partner.partnership?.payment_transaction_id || '') !== String(finalTx._id)) {
      const now = new Date();
      const currentExpiry = partner.partnership?.expires_at && new Date(partner.partnership.expires_at) > now
        ? new Date(partner.partnership.expires_at)
        : now;
      const durationDays = Math.max(1, Number(finalTx.metadata?.duration_days || 365));
      partner.partnership.status = 'active';
      partner.partnership.start_at = partner.partnership.start_at || now;
      partner.partnership.expires_at = new Date(currentExpiry.getTime() + durationDays * 86400000);
      partner.partnership.amount_paid = finalTx.amount;
      partner.partnership.currency = finalTx.currency;
      partner.partnership.payment_transaction_id = finalTx._id;
      await partner.save();
      await ConcoursAuditLog.create({ event: 'partnership.payment.completed', actorId: 'payment-provider', partnerId: partner._id, transactionId: finalTx._id, metadata: { amount: finalTx.amount, currency: finalTx.currency } });
      logger.info('concours.partnership.activated', { partner_id: partner.cand_id, transaction_id: String(finalTx._id) });
    }
  }

  if (finalTx.purpose_type === 'subscription') {
    await applySubscriptionToUser(finalTx);
  }

  if (finalTx.purpose_type === 'material_access') {
    await applyMaterialAccessTransaction(finalTx);
  }

  if (finalTx.purpose_type === 'center_access') {
    await applyCenterAccessTransaction(finalTx);
  }

  try {
    await History.create({
      user_id: finalTx.user_cand_id,
      content_type: 'payment',
      content_title: finalTx.description,
      action: finalTx.purpose_code,
    });
  } catch (_) {
    // Non-blocking
  }

  try {
    const receiptUser = finalTx.user_cand_id ? await User.findOne({ cand_id: finalTx.user_cand_id }).select('email name allow_emails').lean() : null;
    if (receiptUser?.email && receiptUser.allow_emails !== false) {
      const planLabel = finalTx.purpose_type === 'subscription'
        ? String(finalTx.purpose_code || '').replace(/^plan_/, '').replace(/-/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()) + ' subscription'
        : finalTx.purpose_type.replace(/_/g, ' ');
      const emailSubject = `Acadex payment receipt — ${finalTx.description}`;
      const emailText = [
        `Hello ${receiptUser.name || 'Acadex learner'},`,
        '',
        'Your payment was successful.',
        `Transaction: ${finalTx._id}`,
        `Description: ${finalTx.description}`,
        `Type: ${planLabel}`,
        `Amount: ${finalTx.amount} ${finalTx.currency}`,
        `Status: Successful`,
        `Date: ${new Date(finalTx.completed_at).toLocaleString()}`,
        '',
        'Thank you for choosing Acadex. Your access has been updated and is available immediately.',
      ].join('\n');

      try {
        await sendEmail({ to: receiptUser.email, subject: emailSubject, text: emailText });
      } catch (emailErr) {
        // don't block finalization on email failures
      }
    }
  } catch (_) {
    // swallow non-critical email errors
  }

  return finalTx;
}

module.exports = {
  normalizePurchaseItemType,
  upsertCandidatePurchase,
  applySuccessfulPayment,
};