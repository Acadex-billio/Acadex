const { getOrCreatePricingDocument, getPricingSnapshot } = require('../services/platformPricingService');
const { listActiveProgramCodes } = require('../services/programCatalogService');
const { MIN_PAYMENT_AMOUNT } = require('../constants/paymentConstants');

exports.getPricing = async (_req, res) => {
  try {
    const snapshot = await getPricingSnapshot();
    return res.json({
      success: true,
      pricing: {
        plans: snapshot.planDefinitions,
        materials: snapshot.materialDefaults,
        center: snapshot.centerPricing,
        ai_study_mode: snapshot.aiStudyMode,
        candidate_project_upload: snapshot.candidateProjectUploadPricing,
        concours_partnership: snapshot.concoursPartnership,
      },
      published_at: snapshot.raw?.published_at || null,
      updated_at: snapshot.raw?.updatedAt || null,
    });
  } catch (err) {
    console.error('[PlatformPricing] getPricing error:', err);
    return res.status(500).json({ success: false, message: 'Failed to load platform pricing.' });
  }
};

exports.updatePricing = async (req, res) => {
  try {
    const doc = await getOrCreatePricingDocument();
    const next = req.body?.pricing || {};
    const allowedPrograms = await listActiveProgramCodes();
    const toNonNegativeNumber = (value, fallback) => {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : fallback;
    };
    const paidPriceError = (value, label) => {
      const amount = Number(value ?? 0);
      if (!Number.isFinite(amount) || amount < 0) return `${label} must be zero or greater.`;
      return amount > 0 && amount < MIN_PAYMENT_AMOUNT
        ? `${label} must be 0 (free) or at least ${MIN_PAYMENT_AMOUNT} XAF.`
        : null;
    };

    // Update plans - merge with existing values
    if (next.plans) {
      const current = doc.plans?.toObject?.() || doc.plans || {};
      const updated = { ...current };
      ['basic', 'pro', 'paygo', 'full-package'].forEach((plan) => {
        if (next.plans[plan]) {
          updated[plan] = {
            price: toNonNegativeNumber(next.plans[plan].price, toNonNegativeNumber(current[plan]?.price, 0)),
            currency: String(next.plans[plan].currency || current[plan]?.currency || 'XAF').trim().toUpperCase(),
            duration_days: Math.max(1, Number(next.plans[plan].duration_days || next.plans[plan].durationDays || current[plan]?.duration_days || 90)),
          };
        }
      });
      doc.set('plans', updated);
      doc.markModified('plans');
    }

    // Update materials - merge with existing values
    if (next.materials) {
      const current = doc.materials?.toObject?.() || doc.materials || {};
      const updated = { ...current };
      ['report', 'presentation', 'question_paper'].forEach((material) => {
        if (next.materials[material]) {
          const legacyPlanPricing = next.materials[material].plan_pricing || {};
          const currentPaygoPricing = current[material]?.plan_pricing?.paygo || {};
          const paygoPreviewPrice = legacyPlanPricing.paygo?.preview_price
            ?? next.materials[material].paygo_full_preview_price
            ?? currentPaygoPricing.preview_price
            ?? current[material]?.paygo_full_preview_price
            ?? 0;
          const paygoDownloadPrice = legacyPlanPricing.paygo?.download_price
            ?? next.materials[material].paygo_download_price
            ?? currentPaygoPricing.download_price
            ?? current[material]?.paygo_download_price
            ?? 0;
          const invalidMaterialPrice = paidPriceError(paygoPreviewPrice, `${material} full-preview price`)
            || paidPriceError(paygoDownloadPrice, `${material} download price`);
          if (invalidMaterialPrice) {
            return res.status(400).json({ success: false, message: invalidMaterialPrice });
          }
          const mergedPlanPricing = { ...((current[material]?.plan_pricing) || {}) };
          ['basic', 'pro', 'paygo', 'full-package'].forEach((plan) => {
            const source = legacyPlanPricing[plan] || {};
            const currentPlan = mergedPlanPricing[plan] || {};
            mergedPlanPricing[plan] = {
              preview_pages: Math.max(0, Number(source.preview_pages ?? currentPlan.preview_pages ?? (plan === 'full-package' ? 999 : 3))),
              preview_price: toNonNegativeNumber(source.preview_price, toNonNegativeNumber(currentPlan.preview_price, 0)),
              download_price: toNonNegativeNumber(source.download_price, toNonNegativeNumber(currentPlan.download_price, 0)),
              access_minutes: Math.max(1, Number(source.access_minutes ?? currentPlan.access_minutes ?? 60)),
              free_access: Boolean(source.free_access ?? currentPlan.free_access ?? (plan === 'full-package')),
            };
          });

          mergedPlanPricing.basic.preview_pages = Math.max(1, Number(legacyPlanPricing.basic?.preview_pages ?? next.materials[material].basic_preview_pages ?? mergedPlanPricing.basic.preview_pages));
          mergedPlanPricing.paygo.preview_pages = Math.max(1, Number(legacyPlanPricing.paygo?.preview_pages ?? next.materials[material].paygo_preview_pages ?? mergedPlanPricing.paygo.preview_pages));

          updated[material] = {
            basic_preview_pages: mergedPlanPricing.basic.preview_pages,
            paygo_preview_pages: mergedPlanPricing.paygo.preview_pages,
            full_package_preview_limit: toNonNegativeNumber(next.materials[material].full_package_preview_limit, toNonNegativeNumber(current[material]?.full_package_preview_limit, 10)),
            full_package_download_limit: toNonNegativeNumber(next.materials[material].full_package_download_limit, toNonNegativeNumber(current[material]?.full_package_download_limit, 5)),
            basic_full_preview_price: toNonNegativeNumber(next.materials[material].basic_full_preview_price, toNonNegativeNumber(current[material]?.basic_full_preview_price, 0)),
            basic_download_price: toNonNegativeNumber(next.materials[material].basic_download_price, toNonNegativeNumber(current[material]?.basic_download_price, 0)),
            paygo_full_preview_price: mergedPlanPricing.paygo.preview_price,
            paygo_download_price: mergedPlanPricing.paygo.download_price,
            paygo_access_minutes: mergedPlanPricing.paygo.access_minutes,
            plan_pricing: mergedPlanPricing,
          };
        }
      });
      doc.set('materials', updated);
      doc.markModified('materials');
    }

    // Update center pricing - merge with existing values
    if (next.center) {
      const current = doc.center?.toObject?.() || doc.center || {};
      const updated = { create: current.create || {}, join: current.join || {} };
      ['create', 'join'].forEach((action) => {
        if (next.center[action]) {
          updated[action] = { ...updated[action] };
          ['basic', 'pro', 'paygo', 'full-package'].forEach((plan) => {
            if (next.center[action][plan]) {
              updated[action][plan] = {
                amount: toNonNegativeNumber(next.center[action][plan].amount, toNonNegativeNumber(current[action]?.[plan]?.amount, 0)),
                currency: String(next.center[action][plan].currency || current[action]?.[plan]?.currency || 'XAF').trim().toUpperCase(),
              };
            }
          });
        }
      });
      doc.set('center', updated);
      doc.markModified('center');
    }

    // Update AI study mode
    if (next.ai_study_mode) {
      const current = doc.ai_study_mode?.toObject?.() || doc.ai_study_mode || {};
      const invalidSessionPrice = paidPriceError(next.ai_study_mode.session_price, 'AI Study Mode session price');
      if (invalidSessionPrice) {
        return res.status(400).json({ success: false, message: invalidSessionPrice });
      }
      const aiStudyMode = {
        session_price: toNonNegativeNumber(next.ai_study_mode.session_price, toNonNegativeNumber(current.session_price, 0)),
        currency: String(next.ai_study_mode.currency || current.currency || 'XAF').trim().toUpperCase(),
      };
      doc.set('ai_study_mode', aiStudyMode);
      doc.markModified('ai_study_mode');
    }

    // Update concours partnership
    if (next.concours_partnership) {
      const current = doc.concours_partnership?.toObject?.() || doc.concours_partnership || {};
      const concoursPartnership = {
        amount: toNonNegativeNumber(next.concours_partnership.amount, toNonNegativeNumber(current.amount, 0)),
        currency: String(next.concours_partnership.currency || current.currency || 'XAF').trim().toUpperCase(),
        duration_days: Math.max(1, Number(next.concours_partnership.duration_days || next.concours_partnership.durationDays || current.duration_days || 365)),
      };
      doc.set('concours_partnership', concoursPartnership);
      doc.markModified('concours_partnership');
    }

    // Update candidate project upload fees
    if (next.candidate_project_upload) {
      const current = doc.candidate_project_upload?.toObject?.() || doc.candidate_project_upload || {};
      const updated = { ...current };

      allowedPrograms.forEach((program) => {
        if (Object.prototype.hasOwnProperty.call(next.candidate_project_upload, program)) {
          updated[program] = toNonNegativeNumber(next.candidate_project_upload[program], toNonNegativeNumber(current[program], 0));
        }
      });

      doc.set('candidate_project_upload', updated);
      doc.markModified('candidate_project_upload');
    }

    doc.updated_by = String(req.user?.cand_id || 'developer');
    await doc.save();

    return res.json({ success: true, message: 'Pricing settings updated successfully.' });
  } catch (err) {
    console.error('[PlatformPricing] updatePricing error:', err);
    return res.status(500).json({ success: false, message: 'Failed to update pricing settings.' });
  }
};

exports.publishPricing = async (req, res) => {
  try {
    const doc = await getOrCreatePricingDocument();
    doc.published_at = new Date();
    doc.updated_by = String(req.user?.cand_id || 'developer');
    await doc.save();
    return res.json({ success: true, message: 'Pricing has been published.' });
  } catch (err) {
    console.error('[PlatformPricing] publishPricing error:', err);
    return res.status(500).json({ success: false, message: 'Failed to publish pricing settings.' });
  }
};
