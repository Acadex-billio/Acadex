const MaterialAccess = require('../models/MaterialAccess');

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
  paymentTransactionId
) {
  try {
    // Create new access grant
    const grantedAt = new Date();
    const expiresAt = new Date(grantedAt.getTime() + 60 * 60 * 1000); // 1 hour

    const materialAccess = new MaterialAccess({
      userId,
      materialId,
      materialType,
      accessType,
      grantedAt,
      expiresAt,
      paymentTransactionId,
    });

    await materialAccess.save();
    return materialAccess;
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
const { resolveSubscription, findActiveGrantIncludingAdmin } = require('../utils/subscriptionUtils');
const User = require('../models/User');

async function hasActiveAccess(userId, materialId, materialType, accessType) {
  try {
    // 1) direct MaterialAccess records (admin or payment grants stored in MaterialAccess)
    const direct = await MaterialAccess.findOne({
      userId,
      materialId,
      materialType,
      accessType,
      expiresAt: { $gt: new Date() },
    });
    if (direct) return true;

    // 2) consult user subscription and CandidatePurchase/PaymentAccessGrant via subscription utils
    const user = await User.findById(userId).select('cand_id subscription email').lean();
    if (!user) return false;

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
    const accesses = await MaterialAccess.find({
      userId,
      expiresAt: { $gt: new Date() },
    });

    return accesses;
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
    const access = await MaterialAccess.findOne({
      userId,
      materialId,
      materialType,
      expiresAt: { $gt: new Date() },
    });

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
    const access = await MaterialAccess.findOne({
      userId,
      materialId,
      materialType,
      expiresAt: { $gt: new Date() },
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
    const access = await MaterialAccess.findOneAndUpdate(
      { userId, materialId, materialType },
      { expiresAt: new Date(), isActive: false },
      { new: true }
    );

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
    const result = await MaterialAccess.deleteMany({
      expiresAt: { $lt: new Date() },
    });

    console.log(`Cleaned up ${result.deletedCount} expired material accesses`);
    return result;
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
