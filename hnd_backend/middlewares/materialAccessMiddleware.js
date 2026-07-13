const mongoose = require('mongoose');
const path = require('path');
const materialAccessService = require('../services/materialAccessService');
const Report = require('../models/Report');
const Presentation = require('../models/Presentation');
const QuestionPaper = require('../models/QuestionPaper');

function getRouteMaterialIdentifier(req) {
  if (req.params.id) return req.params.id;
  if (req.params.filename) return req.params.filename;
  if (req.body.materialId) return req.body.materialId;
  if (req.body.resourceId) return req.body.resourceId;
  return null;
}

function normalizeMaterialIdentifier(identifier) {
  if (!identifier) return '';
  let value = String(identifier || '').trim();
  try {
    value = decodeURIComponent(value);
  } catch (_) {}
  return value.split('?')[0].trim();
}

async function resolveMaterialId(materialType, identifier, req) {
  if (!identifier) return null;
  if (mongoose.Types.ObjectId.isValid(identifier)) {
    return identifier;
  }

  const decoded = normalizeMaterialIdentifier(identifier);
  if (!decoded) return null;

  const program = String(req.user?.program || 'HND').toUpperCase();
  let model;
  let query;
  let fallbackQuery;
  let suffixField;

  if (materialType === 'report') {
    model = Report;
    query = { file_path: decoded, program };
    fallbackQuery = { file_path: decoded };
    suffixField = 'file_path';
  } else if (materialType === 'presentation') {
    model = Presentation;
    query = { file_path: decoded, program };
    fallbackQuery = { file_path: decoded };
    suffixField = 'file_path';
  } else if (materialType === 'questionPaper') {
    model = QuestionPaper;
    query = { paper_file: decoded, program };
    fallbackQuery = { paper_file: decoded };
    suffixField = 'paper_file';
  }

  if (!model || !query) return null;

  const tryFind = async (candidateQuery) => {
    try {
      const doc = await model.findOne(candidateQuery).select('_id').lean();
      return doc && doc._id ? doc._id : null;
    } catch (_) {
      return null;
    }
  };

  const direct = await tryFind(query);
  if (direct) return direct;

  const fallback = await tryFind(fallbackQuery);
  if (fallback) return fallback;

  try {
    const filename = path.basename(decoded);
    if (filename) {
      const bySuffix = await model.findOne({ [suffixField]: { $regex: `${filename}$` } }).select('_id').lean();
      if (bySuffix && bySuffix._id) return bySuffix._id;
    }
  } catch (_) {}

  return null;
}

/**
 * Middleware to check if user has access to a material for preview or download
 * @param {String} materialType - Type of material (questionPaper, report, presentation)
 * @param {String} accessType - Type of access (preview, download) - optional, defaults to preview
 */
function checkMaterialAccess(materialType, accessType = 'preview') {
  return async (req, res, next) => {
    try {
      const userId = req.user?.id || req.user?._id || req.user?.cand_id;
      const routeIdentifier = getRouteMaterialIdentifier(req);

      if (!userId || !routeIdentifier) {
        return res.status(400).json({
          success: false,
          message: 'Missing required parameters',
        });
      }

      const materialId = await resolveMaterialId(materialType, routeIdentifier, req);
      if (!materialId) {
        return res.status(404).json({
          success: false,
          message: 'Material not found',
        });
      }

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

      const remainingTime = await materialAccessService.getRemainingAccessTime(
        userId,
        materialId,
        materialType
      );

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
      const userId = req.user?.id || req.user?._id || req.user?.cand_id;
      const routeIdentifier = getRouteMaterialIdentifier(req);

      if (!userId || !routeIdentifier) {
        return next();
      }

      const materialId = await resolveMaterialId(materialType, routeIdentifier, req);
      if (!materialId) {
        req.materialAccessInfo = { hasAccess: false, remainingTime: -1 };
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
