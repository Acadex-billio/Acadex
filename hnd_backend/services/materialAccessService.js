const MaterialAccess = require('../models/MaterialAccess');
const PaymentAccessGrant = require('../models/PaymentAccessGrant');
const QuestionPaper = require('../models/QuestionPaper');
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');

const normalizeGrantType = (materialType) => {
  const value = String(materialType || '').trim().toLowerCase();
  if (value === 'questionpaper' || value === 'question_paper' || value === 'paper') return 'question_paper';
  if (value === 'chat_room' || value === 'chatroom') return 'center';
  return value;
};

const normalizeAccessType = (accessType) => String(accessType || 'preview').trim().toLowerCase() === 'download' ? 'download' : 'preview';

const resolveCandidateId = async (userId) => {
  const raw = String(userId || '').trim();
  if (!raw) return null;
  const user = mongoose.Types.ObjectId.isValid(raw)
    ? await User.findById(raw).select('cand_id').lean()
    : await User.findOne({ cand_id: raw }).select('cand_id').lean();
  return user?.cand_id || null;
};

const buildGrantCode = (materialType, accessType) => {
  const type = normalizeGrantType(materialType);
  return type === 'report' || type === 'presentation' || type === 'question_paper'
    ? `${type}_${normalizeAccessType(accessType) === 'download' ? 'download' : 'preview_full'}`
    : `${type}_${normalizeAccessType(accessType)}`;
};

/**
 * Grant material access to a user for preview or download
 * @param {String} userId - User ID
 * @param {String} materialId - Material ID
 * @param {String} materialType - Type of material (questionPaper, report, presentation)
 * @param {String} accessType - Type of access (preview, download)
 * @param {String} paymentTransactionId - Payment transaction ID
 * @returns {Promise<Object>} Created MaterialAccess document
 */
async function grantMaterialAccess(
  userId,
  materialId,
  materialType,
  accessType,
  paymentTransactionId,
  expiresAtOverride = null
) {
  try {
    const grantedAt = new Date();
    const expiresAt = expiresAtOverride || new Date(grantedAt.getTime() + 60 * 60 * 1000);
    const candidateId = await resolveCandidateId(userId);
    if (!candidateId) throw new Error('Candidate not found for access grant');

    const resourceType = normalizeGrantType(materialType);
    const resourceId = String(materialId || '').trim();
    const grant = await PaymentAccessGrant.findOneAndUpdate(
      {
        user_cand_id: candidateId,
        grant_code: buildGrantCode(resourceType, accessType),
        resource_id: resourceId,
        transaction_id: paymentTransactionId || null,
      },
      {
        $set: {
          user_cand_id: candidateId,
          grant_code: buildGrantCode(resourceType, accessType),
          resource_type: resourceType,
          resource_id: resourceId,
          transaction_id: paymentTransactionId || null,
          amount: 0,
          status: 'active',
          granted_at: grantedAt,
          expires_at: expiresAt,
          metadata: { source: paymentTransactionId ? 'payment' : 'admin_or_download' },
        },
        $setOnInsert: { currency: 'XAF' },
      },
      { upsert: true, new: true }
    ).lean();

    return {
      ...grant,
      materialId: resourceId,
      materialType: resourceType === 'question_paper' ? 'questionPaper' : resourceType,
      accessType: normalizeAccessType(accessType),
      paymentTransactionId: grant.transaction_id,
    };
  } catch (error) {
    console.error('Error granting material access:', error);
    throw error;
  }
}

/**
 * Check if user has active access to a material
 * @param {String} userId - User ID
 * @param {String} materialId - Material ID
 * @param {String} materialType - Type of material
 * @param {String} accessType - Type of access (preview, download)
 * @returns {Promise<Boolean>} True if user has active access
 */
const { resolveSubscription, findActiveGrantIncludingAdmin, isFreeMaterialAccess } = require('../utils/subscriptionUtils');
const mongoose = require('mongoose');
const User = require('../models/User');

async function resolveMaterialDocument(materialType, identifier) {
  const normalizedType = String(materialType || '').trim().toLowerCase();
  const normalizedIdentifier = String(identifier || '').trim();
  if (!normalizedIdentifier) return null;

  if (normalizedType === 'questionpaper' || normalizedType === 'question_paper') {
    if (mongoose.Types.ObjectId.isValid(normalizedIdentifier)) {
      return QuestionPaper.findById(normalizedIdentifier).select('paper_type is_guide').lean().catch(() => null);
    }
    return QuestionPaper.findOne({ paper_file: normalizedIdentifier }).select('paper_type is_guide').lean().catch(() => null);
  }

  if (normalizedType === 'report') {
    if (mongoose.Types.ObjectId.isValid(normalizedIdentifier)) {
      return Report.findById(normalizedIdentifier).select('is_guide paper_type').lean().catch(() => null);
    }
    return Report.findOne({ file_path: normalizedIdentifier }).select('is_guide paper_type').lean().catch(() => null);
  }

  if (normalizedType === 'presentation') {
    if (mongoose.Types.ObjectId.isValid(normalizedIdentifier)) {
      return Presentation.findById(normalizedIdentifier).select('is_guide paper_type').lean().catch(() => null);
    }
    return Presentation.findOne({ file_path: normalizedIdentifier }).select('is_guide paper_type').lean().catch(() => null);
  }

  return null;
}

async function hasActiveAccess(userId, materialId, materialType, accessType) {
  try {
    const candidateId = await resolveCandidateId(userId);
    const resourceType = normalizeGrantType(materialType);
    const resourceId = String(materialId || '').trim();
    if (candidateId) {
      const canonicalGrant = await PaymentAccessGrant.findOne({
        user_cand_id: candidateId,
        grant_code: buildGrantCode(resourceType, accessType),
        resource_id: resourceId,
        status: 'active',
        expires_at: { $gt: new Date() },
      }).lean();
      if (canonicalGrant) return true;
    }

    // Normalize userId: allow passing cand_id (e.g., "CAND00006") or ObjectId/_id.
    let resolvedUserId = userId;
    try {
      if (!mongoose.Types.ObjectId.isValid(String(userId || '')) ) {
        // treat as cand_id, attempt to lookup user
        const candidate = await User.findOne({ cand_id: String(userId || '') }).select('_id cand_id subscription').lean();
        if (candidate && candidate._id) {
          resolvedUserId = candidate._id;
        } else {
          // no matching user
          return false;
        }
      }
    } catch (e) {
      // fallback: continue with original userId
      resolvedUserId = userId;
    }
    // 1) direct MaterialAccess records (admin or payment grants stored in MaterialAccess)
    const normalizedMaterialId = String(materialId || '').trim();
    const possibleMaterialIds = [];
    if (normalizedMaterialId) {
      possibleMaterialIds.push(normalizedMaterialId);
      if (mongoose.Types.ObjectId.isValid(normalizedMaterialId)) {
        try {
          possibleMaterialIds.push(mongoose.Types.ObjectId(normalizedMaterialId));
        } catch (_) {}
      }
    }

    const direct = await MaterialAccess.findOne({
      userId: resolvedUserId,
      materialType,
      accessType,
      expiresAt: { $gt: new Date() },
      $or: [
        ...(possibleMaterialIds.length ? [{ materialId: { $in: possibleMaterialIds } }] : []),
        { materialId: null },
        { materialId: { $exists: false } },
      ],
    });
    if (direct) return true;

    // 2) consult user subscription and CandidatePurchase/PaymentAccessGrant via subscription utils
    const user = await User.findById(resolvedUserId).select('cand_id subscription email').lean();
    if (!user) return false;

    const normalizedMaterialType = String(materialType || '').trim();
    const normalizedMaterialTypeKey = normalizedMaterialType.toLowerCase();
    if (['ai_mode', 'center', 'chat_room'].includes(normalizedMaterialTypeKey)) {
      const nm = normalizedMaterialTypeKey === 'chat_room' ? 'center' : normalizedMaterialTypeKey;
      const normalizedId = String(materialId || '').trim();
      const possibleIds2 = [];
      if (normalizedId) {
        possibleIds2.push(normalizedId);
        if (mongoose.Types.ObjectId.isValid(normalizedId)) {
          try { possibleIds2.push(mongoose.Types.ObjectId(normalizedId)); } catch (_) {}
        }
      }
      const accessGrant = await MaterialAccess.findOne({
        userId,
        materialType: nm,
        accessType: 'preview',
        expiresAt: { $gt: new Date() },
        $or: [
          ...(possibleIds2.length ? [{ materialId: { $in: possibleIds2 } }] : []),
          { materialId: null },
          { materialId: { $exists: false } },
        ],
      });
      if (accessGrant) return true;
    }

    const materialDoc = await resolveMaterialDocument(normalizedMaterialType, normalizedMaterialId);

    if (await isFreeMaterialAccess(normalizedMaterialType, materialDoc)) {
      return true;
    }

    const resolved = resolveSubscription(user.subscription || {});
    const plan = resolved.plan;

    // normalize materialType into grant code prefix used by subscription utils
    const normType = (String(materialType || '').toLowerCase() === 'questionpaper' || String(materialType || '').toLowerCase() === 'question_paper') ? 'question_paper' : String(materialType || '').toLowerCase();

    if (plan === 'pro') {
      // Pro: free access to question papers, centers, ai_mode and downloads
      if (['question_paper', 'center', 'ai_mode'].includes(normType)) return true;
      // for reports/presentations, direct purchase required
      const grantCode = accessType === 'download' ? `${normType}_download` : `${normType}_preview_full`;
      const g = await findActiveGrantIncludingAdmin({ candId: user.cand_id, grantCode, resourceId: materialId }).catch(() => null);
      return !!g;
    }

    if (plan === 'full-package') {
      // full-package: generally allow download and preview
      if (['question_paper', 'center', 'ai_mode'].includes(normType)) return true;
      if (['report', 'presentation'].includes(normType)) return true;
      // fallback to checking grants
      const grantCode = accessType === 'download' ? `${normType}_download` : `${normType}_preview_full`;
      const g = await findActiveGrantIncludingAdmin({ candId: user.cand_id, grantCode, resourceId: materialId }).catch(() => null);
      return !!g;
    }

    // paygo/basic require explicit purchase or temporary grant
    const grantCode = accessType === 'download' ? `${normType}_download` : `${normType}_preview_full`;
    const g = await findActiveGrantIncludingAdmin({ candId: user.cand_id, grantCode, resourceId: materialId }).catch(() => null);
    return !!g;
  } catch (error) {
    console.error('Error checking material access:', error);
    return false;
  }
}

/**
 * Get all active accesses for a user
 * @param {String} userId - User ID
 * @returns {Promise<Array>} Array of active accesses
 */
async function getUserActiveAccesses(userId) {
  try {
    const candidateId = await resolveCandidateId(userId);
    const canonical = candidateId ? await PaymentAccessGrant.find({
      user_cand_id: candidateId,
      status: 'active',
      expires_at: { $gt: new Date() },
    }).lean() : [];
    const accesses = canonical.map((grant) => ({
      ...grant,
      materialId: grant.resource_id,
      materialType: grant.resource_type === 'question_paper' ? 'questionPaper' : grant.resource_type,
      accessType: grant.grant_code.endsWith('_download') ? 'download' : 'preview',
      expiresAt: grant.expires_at,
    }));
    const legacy = await MaterialAccess.find({
      userId,
      expiresAt: { $gt: new Date() },
    }).lean();

    return [...accesses, ...legacy];
  } catch (error) {
    console.error('Error fetching user accesses:', error);
    return [];
  }
}

/**
 * Get specific active access for a material
 * @param {String} userId - User ID
 * @param {String} materialId - Material ID
 * @param {String} materialType - Type of material
 * @returns {Promise<Object>} Active access object or null
 */
async function getActiveAccessForMaterial(userId, materialId, materialType) {
  try {
    const candidateId = await resolveCandidateId(userId);
    const resourceType = normalizeGrantType(materialType);
    const resourceId = String(materialId || '').trim();
    if (candidateId) {
      const canonical = await PaymentAccessGrant.findOne({
        user_cand_id: candidateId,
        resource_type: resourceType,
        resource_id: resourceId,
        status: 'active',
        expires_at: { $gt: new Date() },
      }).lean();
      if (canonical) {
        return {
          ...canonical,
          materialId: canonical.resource_id,
          materialType: resourceType === 'question_paper' ? 'questionPaper' : resourceType,
          accessType: canonical.grant_code.endsWith('_download') ? 'download' : 'preview',
          expiresAt: canonical.expires_at,
        };
      }
    }

    const normalizedMaterialId = String(materialId || '').trim();
    const possibleMaterialIds = [];
    if (normalizedMaterialId) {
      possibleMaterialIds.push(normalizedMaterialId);
      if (mongoose.Types.ObjectId.isValid(normalizedMaterialId)) {
        try { possibleMaterialIds.push(mongoose.Types.ObjectId(normalizedMaterialId)); } catch (_) {}
      }
    }

    const query = {
      userId,
      materialType,
      expiresAt: { $gt: new Date() },
      $or: [ ...(possibleMaterialIds.length ? [{ materialId: { $in: possibleMaterialIds } }] : []), { materialId: null }, { materialId: { $exists: false } } ],
    };

    const access = await MaterialAccess.findOne(query);

    return access;
  } catch (error) {
    console.error('Error fetching material access:', error);
    return null;
  }
}

/**
 * Get remaining time (in seconds) for an active access
 * @param {String} userId - User ID
 * @param {String} materialId - Material ID
 * @param {String} materialType - Type of material
 * @returns {Promise<Number>} Seconds remaining, or -1 if no active access
 */
async function getRemainingAccessTime(userId, materialId, materialType) {
  try {
    const canonical = await getActiveAccessForMaterial(userId, materialId, materialType);
    if (canonical?.expiresAt) return Math.max(Math.ceil((new Date(canonical.expiresAt) - new Date()) / 1000), 0);

    // Normalize userId: accept cand_id strings (like "CAND00006") or ObjectId
    let resolvedUserId = userId;
    try {
      if (!mongoose.Types.ObjectId.isValid(String(userId || '')) ) {
        const candidate = await User.findOne({ cand_id: String(userId || '') }).select('_id').lean();
        if (candidate && candidate._id) {
          resolvedUserId = candidate._id;
        }
      }
    } catch (e) {
      // fall back to original userId
      resolvedUserId = userId;
    }
    const normalizedMaterialId = String(materialId || '').trim();
    const possibleMaterialIds = [];
    if (normalizedMaterialId) {
      possibleMaterialIds.push(normalizedMaterialId);
      if (mongoose.Types.ObjectId.isValid(normalizedMaterialId)) {
        try { possibleMaterialIds.push(mongoose.Types.ObjectId(normalizedMaterialId)); } catch (_) {}
      }
    }

    const access = await MaterialAccess.findOne({
      userId: resolvedUserId,
      materialType,
      expiresAt: { $gt: new Date() },
      $or: [ ...(possibleMaterialIds.length ? [{ materialId: { $in: possibleMaterialIds } }] : []), { materialId: null }, { materialId: { $exists: false } } ],
    });

    if (!access) return -1;

    const remaining = Math.ceil((access.expiresAt - new Date()) / 1000);
    return Math.max(remaining, 0);
  } catch (error) {
    console.error('Error calculating remaining time:', error);
    return -1;
  }
}

/**
 * Revoke access (immediately expire)
 * @param {String} userId - User ID
 * @param {String} materialId - Material ID
 * @param {String} materialType - Type of material
 * @returns {Promise<Object>} Updated MaterialAccess document
 */
async function revokeMaterialAccess(userId, materialId, materialType) {
  try {
    const candidateId = await resolveCandidateId(userId);
    const resourceType = normalizeGrantType(materialType);
    const resourceId = String(materialId || '').trim();
    if (candidateId) {
      const canonical = await PaymentAccessGrant.findOneAndUpdate(
        { user_cand_id: candidateId, resource_type: resourceType, resource_id: resourceId, status: 'active' },
        { $set: { status: 'revoked', expires_at: new Date() } },
        { new: true }
      ).lean();
      if (canonical) return canonical;
    }

    const normalizedMaterialId = String(materialId || '').trim();
    const possibleMaterialIds = [];
    if (normalizedMaterialId) {
      possibleMaterialIds.push(normalizedMaterialId);
      if (mongoose.Types.ObjectId.isValid(normalizedMaterialId)) {
        try { possibleMaterialIds.push(mongoose.Types.ObjectId(normalizedMaterialId)); } catch (_) {}
      }
    }

    const query = {
      userId,
      materialType,
      $or: [ ...(possibleMaterialIds.length ? [{ materialId: { $in: possibleMaterialIds } }] : []), { materialId: null }, { materialId: { $exists: false } } ],
    };

    const access = await MaterialAccess.findOneAndUpdate(query, { expiresAt: new Date(), isActive: false }, { new: true });

    return access;
  } catch (error) {
    console.error('Error revoking material access:', error);
    throw error;
  }
}

/**
 * Clean up expired accesses (can be run as a periodic job)
 * @returns {Promise<Object>} Deletion result
 */
async function cleanupExpiredAccesses() {
  try {
    const canonicalResult = await PaymentAccessGrant.deleteMany({ expires_at: { $lt: new Date() } });
    const result = await MaterialAccess.deleteMany({
      expiresAt: { $lt: new Date() },
    });

    return { deletedCount: Number(canonicalResult.deletedCount || 0) + Number(result.deletedCount || 0) };
  } catch (error) {
    console.error('Error cleaning up expired accesses:', error);
    throw error;
  }
}

module.exports = {
  grantMaterialAccess,
  hasActiveAccess,
  getUserActiveAccesses,
  getActiveAccessForMaterial,
  getRemainingAccessTime,
  revokeMaterialAccess,
  cleanupExpiredAccesses,
};
