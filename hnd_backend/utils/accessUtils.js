const CandidatePurchase = require('../models/CandidatePurchase');
const User = require('../models/User');
const { SUBSCRIPTION_PLANS } = require('../constants/userConstants');

/**
 * Check access for a candidate to a material or feature.
 * Returns { allowed: boolean, reason?: string, remaining?: number }
 */
const hasAccess = async (userId, itemType, itemId = null) => {
  // load user subscription
  const user = await User.findById(userId).select('subscription name email').lean();
  if (!user) return { allowed: false, reason: 'User not found' };

  const plan = user.subscription?.plan || SUBSCRIPTION_PLANS.BASIC;
  const now = new Date();

  // Helper: check a direct purchase for this item
  const hasDirectPurchase = async () => {
    if (!itemType || !itemId) return false;
    const p = await CandidatePurchase.findOne({
      candidate_id: userId,
      item_type: itemType,
      item_id: String(itemId),
      status: 'grant-success',
      expires_at: { $gt: now },
    }).lean();
    return !!p;
  };

  // Business rules
  if (plan === SUBSCRIPTION_PLANS.PRO) {
    // Pro: free access to question papers, centers, ai_mode. Reports/presentations require purchase.
    if (itemType === 'paper' || itemType === 'center' || itemType === 'ai_mode') return { allowed: true };
    // For reports/presentations, allow if directly purchased
    if (await hasDirectPurchase()) return { allowed: true };
    return { allowed: false, reason: 'Payment required' };
  }

  if (plan === SUBSCRIPTION_PLANS.FULL_PACKAGE) {
    // Full-package: papers, center, ai_mode free. Reports/presentations: limited previews and free downloads counters
    if (itemType === 'paper' || itemType === 'center' || itemType === 'ai_mode') return { allowed: true };
    if (itemType === 'report' || itemType === 'presentation') {
      // If directly purchased allow
      if (await hasDirectPurchase()) return { allowed: true };
      // Otherwise, allow preview under threshold: TODO - implement counters; for now allow preview and mark remaining undefined
      return { allowed: true, remaining: null };
    }
  }

  // Paygo and Basic: require purchase for all paid items
  if (plan === SUBSCRIPTION_PLANS.PAYGO || plan === SUBSCRIPTION_PLANS.BASIC) {
    if (itemType === 'paper' || itemType === 'report' || itemType === 'presentation' || itemType === 'center' || itemType === 'ai_mode') {
      if (await hasDirectPurchase()) return { allowed: true };
      return { allowed: false, reason: 'Payment required' };
    }
  }

  // Fallback deny
  return { allowed: false, reason: 'Policy denies access' };
};

module.exports = {
  hasAccess,
};
