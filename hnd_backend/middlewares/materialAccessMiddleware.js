const materialAccessService = require('../services/materialAccessService');

/**
 * Middleware to check if user has access to a material for preview or download
 * @param {String} materialType - Type of material (questionPaper, report, presentation)
 * @param {String} accessType - Type of access (preview, download) - optional, defaults to preview
 */
function checkMaterialAccess(materialType, accessType = 'preview') {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?._id;
      // Accept a variety of parameter names: id, filename, file, paperId, materialId
      const materialId = req.params.id || req.params.filename || req.params.file || req.params.paperId || req.body.materialId || null;

      if (!userId || !materialId) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters',
        });
      }

      // Check if user has active access
      const hasAccess = await materialAccessService.hasActiveAccess(
        userId,
        materialId,
        materialType,
        accessType
      );

      if (!hasAccess) {
        return res.status(403).json({
          success: false,
          message: `You don't have access to ${accessType} this ${materialType}. Please pay to ${accessType}.`,
          remainingTime: -1,
        });
      }

      // Get remaining time for reference
      const remainingTime = await materialAccessService.getRemainingAccessTime(
        userId,
        materialId,
        materialType
      );

      // Attach to request for use in route handler
      req.materialAccess = {
        hasAccess: true,
        remainingTime,
        expiresAt: new Date(Date.now() + remainingTime * 1000),
      };

      next();
    } catch (error) {
      console.error('Error checking material access:', error);
      return res.status(500).json({
        success: false,
        message: 'Error verifying access',
      });
    }
  };
}

/**
 * Middleware to check material access without requiring auth
 * Returns access info but doesn't block
 */
function getMaterialAccessInfo(materialType) {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?._id;
      const materialId = req.params.id || req.body.materialId;

      if (!userId || !materialId) {
        return next();
      }

      const accesses = await materialAccessService.getActiveAccessForMaterial(
        userId,
        materialId,
        materialType
      );

      req.materialAccessInfo = {
        hasAccess: !!accesses,
        remainingTime: accesses
          ? Math.ceil((accesses.expiresAt - new Date()) / 1000)
          : -1,
      };

      next();
    } catch (error) {
      console.error('Error fetching material access info:', error);
      req.materialAccessInfo = { hasAccess: false, remainingTime: -1 };
      next();
    }
  };
}

module.exports = {
  checkMaterialAccess,
  getMaterialAccessInfo,
};
