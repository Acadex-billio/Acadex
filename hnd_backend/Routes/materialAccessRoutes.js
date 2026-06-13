const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middlewares/authMiddleware');
const materialAccessService = require('../services/materialAccessService');
const paymentCallbackService = require('../services/paymentCallbackService');
const { getMaterialAccessInfo } = require('../middlewares/materialAccessMiddleware');

/**
 * GET /api/material-access/check
 * Check if user has access to a material
 */
router.get('/check', requireAuth, async (req, res) => {
  try {
    const { materialId, materialType, accessType = 'preview' } = req.query;
    const userId = req.user.id || req.user._id;

    if (!materialId || !materialType) {
      return res.status(400).json({
        success: false,
        message: 'materialId and materialType are required',
      });
    }

    const hasAccess = await materialAccessService.hasActiveAccess(
      userId,
      materialId,
      materialType,
      accessType
    );

    let remainingTime = -1;
    if (hasAccess) {
      remainingTime = await materialAccessService.getRemainingAccessTime(
        userId,
        materialId,
        materialType
      );
    }

    return res.json({
      success: true,
      hasAccess,
      materialId,
      materialType,
      accessType,
      remainingTime: remainingTime > 0 ? remainingTime : -1,
      message: hasAccess
        ? `Access valid for ${remainingTime} more seconds`
        : `No active access for ${materialType}`,
    });
  } catch (error) {
    console.error('Error checking material access:', error);
    return res.status(500).json({
      success: false,
      message: 'Error checking access',
      error: error.message,
    });
  }
});

/**
 * GET /api/material-access/my-accesses
 * Get all active accesses for current user
 */
router.get('/my-accesses', requireAuth, async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;

    const accesses = await materialAccessService.getUserActiveAccesses(userId);

    const accessesWithRemaining = accesses.map((access) => ({
      id: access._id,
      materialId: access.materialId,
      materialType: access.materialType,
      accessType: access.accessType,
      grantedAt: access.grantedAt,
      expiresAt: access.expiresAt,
      remainingTime: Math.ceil((access.expiresAt - new Date()) / 1000),
    }));

    return res.json({
      success: true,
      count: accessesWithRemaining.length,
      accesses: accessesWithRemaining,
    });
  } catch (error) {
    console.error('Error fetching user accesses:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching accesses',
      error: error.message,
    });
  }
});

/**
 * POST /api/material-access/grant
 * Admin endpoint to manually grant material access
 * Body: { userId, materialId, materialType, accessType, durationHours }
 */
router.post('/grant', requireAuth, async (req, res) => {
  try {
    // Only allow admins and developers
    if (!['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can grant material access',
      });
    }

    const {
      userId,
      materialId,
      materialType,
      accessType = 'preview',
      durationHours = 1,
    } = req.body;

    if (!userId || !materialId || !materialType) {
      return res.status(400).json({
        success: false,
        message: 'userId, materialId, and materialType are required',
      });
    }

    // Create access with custom duration
    const grantedAt = new Date();
    const expiresAt = new Date(grantedAt.getTime() + durationHours * 60 * 60 * 1000);

    const MaterialAccess = require('../models/MaterialAccess');
    const access = await MaterialAccess.create({
      userId,
      materialId,
      materialType,
      accessType,
      grantedAt,
      expiresAt,
    });

    return res.json({
      success: true,
      message: `Material access granted for ${durationHours} hour(s)`,
      access: {
        id: access._id,
        userId,
        materialId,
        materialType,
        accessType,
        expiresAt,
      },
    });
  } catch (error) {
    console.error('Error granting material access:', error);
    return res.status(500).json({
      success: false,
      message: 'Error granting access',
      error: error.message,
    });
  }
});

/**
 * POST /api/material-access/revoke
 * Admin endpoint to revoke material access
 * Body: { userId, materialId, materialType }
 */
router.post('/revoke', requireAuth, async (req, res) => {
  try {
    // Only allow admins and developers
    if (!['admin', 'developer'].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Only admins can revoke material access',
      });
    }

    const { userId, materialId, materialType } = req.body;

    if (!userId || !materialId || !materialType) {
      return res.status(400).json({
        success: false,
        message: 'userId, materialId, and materialType are required',
      });
    }

    const access = await materialAccessService.revokeMaterialAccess(
      userId,
      materialId,
      materialType
    );

    return res.json({
      success: true,
      message: 'Material access revoked',
      access,
    });
  } catch (error) {
    console.error('Error revoking material access:', error);
    return res.status(500).json({
      success: false,
      message: 'Error revoking access',
      error: error.message,
    });
  }
});

/**
 * POST /api/material-access/payment-callback
 * Handle payment success and grant access
 * Body: { transactionId, userId, materialId, materialType, accessType, amount, reference }
 */
router.post('/payment-callback', async (req, res) => {
  try {
    const paymentData = req.body;

    const result = await paymentCallbackService.handlePaymentSuccess(
      paymentData
    );

    return res.json(result);
  } catch (error) {
    console.error('Error in payment callback:', error);
    return res.status(500).json({
      success: false,
      message: 'Error processing payment callback',
      error: error.message,
    });
  }
});

/**
 * GET /api/material-access/payment-status/:transactionId
 * Get payment and access status
 */
router.get('/payment-status/:transactionId', requireAuth, async (req, res) => {
  try {
    const { transactionId } = req.params;

    const status = await paymentCallbackService.getPaymentStatus(transactionId);

    return res.json(status);
  } catch (error) {
    console.error('Error fetching payment status:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching payment status',
      error: error.message,
    });
  }
});

module.exports = router;
