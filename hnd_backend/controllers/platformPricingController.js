const { getOrCreatePricingDocument, getPricingSnapshot } = require('../services/platformPricingService');

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
    const allowedPrograms = ['HND', 'BACHELOR', 'MASTERS', 'LICENCE', 'MASTER', 'BTS'];
    const toNonNegativeNumber = (value, fallback) => {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 ? n : fallback;
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
          updated[material] = {
            basic_preview_pages: Math.max(1, Number(next.materials[material].basic_preview_pages || current[material]?.basic_preview_pages || 1)),
            paygo_preview_pages: Math.max(1, Number(next.materials[material].paygo_preview_pages || current[material]?.paygo_preview_pages || 3)),
            full_package_preview_limit: toNonNegativeNumber(next.materials[material].full_package_preview_limit, toNonNegativeNumber(current[material]?.full_package_preview_limit, 10)),
            full_package_download_limit: toNonNegativeNumber(next.materials[material].full_package_download_limit, toNonNegativeNumber(current[material]?.full_package_download_limit, 5)),
            basic_full_preview_price: toNonNegativeNumber(next.materials[material].basic_full_preview_price, toNonNegativeNumber(current[material]?.basic_full_preview_price, 0)),
            basic_download_price: toNonNegativeNumber(next.materials[material].basic_download_price, toNonNegativeNumber(current[material]?.basic_download_price, 0)),
            paygo_full_preview_price: toNonNegativeNumber(next.materials[material].paygo_full_preview_price, toNonNegativeNumber(current[material]?.paygo_full_preview_price, 0)),
            paygo_download_price: toNonNegativeNumber(next.materials[material].paygo_download_price, toNonNegativeNumber(current[material]?.paygo_download_price, 0)),
            paygo_access_minutes: Math.max(1, Number(next.materials[material].paygo_access_minutes || current[material]?.paygo_access_minutes || 60)),
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
