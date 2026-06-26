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

    if (next.plans) doc.plans = { ...doc.plans.toObject?.() || doc.plans, ...next.plans };
    if (next.materials) doc.materials = { ...doc.materials.toObject?.() || doc.materials, ...next.materials };
    if (next.center) doc.center = { ...doc.center.toObject?.() || doc.center, ...next.center };
    if (next.ai_study_mode) doc.ai_study_mode = { ...doc.ai_study_mode.toObject?.() || doc.ai_study_mode, ...next.ai_study_mode };
    if (next.candidate_project_upload) {
      const current = doc.candidate_project_upload?.toObject?.() || doc.candidate_project_upload || {};
      const updated = { ...current };

      allowedPrograms.forEach((program) => {
        if (Object.prototype.hasOwnProperty.call(next.candidate_project_upload, program)) {
          updated[program] = toNonNegativeNumber(next.candidate_project_upload[program], toNonNegativeNumber(current[program], 0));
        }
      });

      doc.candidate_project_upload = updated;
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
