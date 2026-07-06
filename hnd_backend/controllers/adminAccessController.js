const CandidatePurchase = require('../models/CandidatePurchase');
const PaymentTransaction = require('../models/PaymentTransaction');
const User = require('../models/User');
const QuestionPaper = require('../models/QuestionPaper');
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const ChatRoom = require('../models/ChatRoom');
const { grantMaterialAccess } = require('../services/materialAccessService');
const { sendEmail } = require('../services/emailService');

function normalizeItemType(raw) {
  const type = String(raw || '').trim().toLowerCase();
  if (type === 'questionpaper' || type === 'question_paper' || type === 'paper') return 'paper';
  if (type === 'report') return 'report';
  if (type === 'presentation') return 'presentation';
  if (type === 'center' || type === 'chat_room' || type === 'chatroom') return 'center';
  if (type === 'ai_mode' || type === 'ai-mode' || type === 'ai') return 'ai_mode';
  return type;
}

async function lookupMaterialTitle(type, id) {
  const itemType = normalizeItemType(type);
  const itemId = String(id || '').trim();
  if (!itemType || !itemId) return null;

  try {
    if (itemType === 'paper') {
      const doc = await QuestionPaper.findById(itemId).select('course_title hnd_year').lean();
      if (!doc) return null;
      const title = String(doc.course_title || '').trim();
      const year = String(doc.hnd_year || '').trim();
      return title ? `${title}${year ? ` ${year}` : ''}` : null;
    }
    if (itemType === 'report') {
      const doc = await Report.findById(itemId).select('title writer_names').lean();
      if (!doc) return null;
      const title = String(doc.title || '').trim();
      const writer = String(doc.writer_names || '').trim();
      return title ? `${title}${writer ? ` by ${writer}` : ''}` : null;
    }
    if (itemType === 'presentation') {
      const doc = await Presentation.findById(itemId).select('title presenter_name').lean();
      if (!doc) return null;
      const title = String(doc.title || '').trim();
      const presenter = String(doc.presenter_name || '').trim();
      return title ? `${title}${presenter ? ` by ${presenter}` : ''}` : null;
    }
    if (itemType === 'center') {
      const doc = await ChatRoom.findById(itemId).select('name').lean();
      if (!doc) return null;
      return String(doc.name || '').trim() || null;
    }
  } catch (err) {
    return null;
  }
  return null;
}

async function normalizeTransactionStatus(status) {
  const raw = String(status || '').trim().toLowerCase();
  if (raw === 'successful') return 'successful';
  if (raw === 'pending') return 'pending';
  if (raw === 'failed') return 'failed';
  if (raw === 'cancelled') return 'cancelled';
  if (raw === 'expired') return 'expired';
  return raw || 'unknown';
}

function getMaterialDisplayInfo(itemType, itemTitle, year, writerName) {
  const normalizedType = normalizeItemType(itemType);
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

async function mapTransactionToRecord(transaction, usersByCandId) {
  const itemType = transaction.purpose_type === 'subscription'
    ? 'plan'
    : transaction.purpose_type === 'material_access'
    ? normalizeItemType(transaction.resource_type)
    : transaction.purpose_type === 'center_access'
    ? 'center'
    : normalizeItemType(transaction.resource_type || transaction.purpose_type);

  const itemId = String(transaction.resource_id || '').trim() || null;
  let title = String(transaction.description || '').trim() || null;
  if (!title && itemId && ['paper', 'report', 'presentation', 'center'].includes(itemType)) {
    title = await lookupMaterialTitle(itemType, itemId);
  }
  if (!title) {
    title = transaction.purpose_type === 'subscription'
      ? String(transaction.purpose_code || '').replace(/^plan_/, '').trim() || 'Subscription'
      : String(transaction.purpose_code || transaction.resource_type || transaction.purpose_type || itemId || transaction.provider_reference || transaction.external_reference || '').trim() || 'Payment';
  }

  const user = usersByCandId.get(String(transaction.user_cand_id || '').trim()) || {};

  return {
    _id: transaction._id,
    source: 'payment_transaction',
    candidate_name: user.name || null,
    candidate_email: user.email || null,
    plan: transaction.purpose_type === 'subscription' ? String(transaction.purpose_code || '').replace(/^plan_/, '').trim() : null,
    item_type: itemType || 'payment',
    item_id: itemId,
    item_title: title,
    amount: Number(transaction.amount || 0),
    currency: String(transaction.currency || 'XAF').trim(),
    status: normalizeTransactionStatus(transaction.status),
    provider_reference: String(transaction.provider_reference || transaction.external_reference || '').trim() || null,
    paid_at: transaction.completed_at || transaction.createdAt,
    createdAt: transaction.createdAt,
    meta: {
      purpose_type: transaction.purpose_type,
      purpose_code: transaction.purpose_code,
      ...((transaction.metadata || {})),
    },
  };
}

exports.listGrants = async (req, res) => {
  try {
    const grants = await CandidatePurchase.find().sort({ createdAt: -1 }).limit(200).lean();
    return res.json({ ok: true, data: grants });
  } catch (err) {
    console.error('listGrants error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
};

exports.listPurchaseHistory = async (req, res) => {
  try {
    const [grants, transactions] = await Promise.all([
      CandidatePurchase.find().sort({ createdAt: -1 }).lean(),
      PaymentTransaction.find().sort({ createdAt: -1 }).lean(),
    ]);

    const candidateIds = [...new Set(transactions.map((tx) => String(tx.user_cand_id || '').trim()).filter(Boolean))];
    const users = await User.find({ cand_id: { $in: candidateIds } }).select('cand_id name email').lean();
    const usersByCandId = new Map(users.map((user) => [String(user.cand_id), user]));

    const transactionRecords = await Promise.all(
      transactions.map((tx) => mapTransactionToRecord(tx, usersByCandId))
    );

    const allRecords = [...transactionRecords, ...grants].sort((a, b) => {
      const aDate = new Date(a.paid_at || a.createdAt || 0).getTime();
      const bDate = new Date(b.paid_at || b.createdAt || 0).getTime();
      return bDate - aDate;
    });

    return res.json({ ok: true, data: allRecords });
  } catch (err) {
    console.error('listPurchaseHistory error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
};

exports.findAndGrant = async (req, res) => {
  try {
    const { query, item_type, item_id, item_title, access_action, amount, currency, expires_in_hours, expires_in_days } = req.body;
    const normalizedItemType = normalizeItemType(item_type);
    if (!query || !normalizedItemType) {
      return res.status(400).json({ ok: false, error: 'Missing parameters' });
    }
    if (['paper', 'report', 'presentation'].includes(normalizedItemType) && !item_id) {
      return res.status(400).json({ ok: false, error: 'Item ID is required for material grants' });
    }

    const q = query.trim();
    const users = await User.find({ $or: [{ email: q }, { cand_id: q }, { name: new RegExp(q, 'i') }] }).limit(50).lean();

    let resolvedTitle = item_title ? String(item_title).trim() : null;
    if (!resolvedTitle && item_id && ['paper', 'report', 'presentation', 'center'].includes(normalizedItemType)) {
      resolvedTitle = await lookupMaterialTitle(normalizedItemType, item_id);
    }

    const expiresAt = expires_in_hours
      ? new Date(Date.now() + Number(expires_in_hours) * 3600 * 1000)
      : expires_in_days
      ? new Date(Date.now() + Number(expires_in_days) * 24 * 3600 * 1000)
      : null;

    const grants = [];
    for (const u of users) {
      const grant = new CandidatePurchase({
        candidate_id: u._id,
        candidate_name: u.name,
        candidate_email: u.email,
        plan: null,
        item_type: normalizedItemType,
        item_id: item_id ? String(item_id).trim() : null,
        item_title: resolvedTitle,
        amount: amount || 0,
        currency: currency || 'XAF',
        status: 'grant-success',
        provider_reference: `admin-grant-${Date.now()}`,
        expires_at: expiresAt,
        meta: {
          access_type: access_action ? String(access_action).trim() : null,
          source: 'admin_grant',
        },
      });
      if (!grant.item_title && grant.item_id) {
        grant.item_title = String(grant.item_id);
      }
      await grant.save();

      if (['paper', 'report', 'presentation'].includes(normalizedItemType) && grant.item_id) {
        const materialTypeMap = {
          paper: 'questionPaper',
          report: 'report',
          presentation: 'presentation',
        };
        const accessType = String(access_action || 'preview').trim().toLowerCase() === 'download' ? 'download' : 'preview';
        await grantMaterialAccess(
          u._id,
          grant.item_id,
          materialTypeMap[normalizedItemType] || normalizedItemType,
          accessType,
          null,
          expiresAt
        );
        await sendMaterialGrantEmail(
          { name: u.name, email: u.email },
          normalizedItemType,
          grant.item_title,
          null,
          null,
          access_action
        );
      } else if (['center', 'ai_mode'].includes(normalizedItemType)) {
        const accessType = String(access_action || 'preview').trim().toLowerCase() === 'download' ? 'download' : 'preview';
        await grantMaterialAccess(
          u._id,
          null,
          normalizedItemType === 'center' ? 'center' : 'ai_mode',
          accessType,
          null,
          expiresAt
        );
      }
      grants.push(grant);
    }

    return res.json({ ok: true, data: grants });
  } catch (err) {
    console.error('findAndGrant error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
};

exports.lookupMaterial = async (req, res) => {
  try {
    const itemType = normalizeItemType(req.query.type);
    const itemId = String(req.query.id || '').trim();
    if (!itemType || !itemId) {
      return res.status(400).json({ ok: false, error: 'Missing type or item ID' });
    }
    const title = await lookupMaterialTitle(itemType, itemId);
    if (!title) {
      return res.status(404).json({ ok: false, error: 'Material not found' });
    }
    return res.json({ ok: true, data: { item_type: itemType, item_id: itemId, item_title: title } });
  } catch (err) {
    console.error('lookupMaterial error', err);
    return res.status(500).json({ ok: false, error: 'Server error' });
  }
};
