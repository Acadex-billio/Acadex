const PlatformPricing = require('../models/PlatformPricing');

const DEFAULTS = {
  plans: {
    basic: {
      code: 'basic',
      name: 'Basic Plan',
      price: 0,
      currency: 'XAF',
      durationDays: 3650,
      description: 'Free preview access only. Every paid material action redirects to the upgrade flow.',
    },
    pro: {
      code: 'pro',
      name: 'Pro Plan',
      price: 0,
      currency: 'XAF',
      durationDays: 90,
      description: 'Unlimited access to all materials and platform features for the active validity period.',
    },
    paygo: {
      code: 'paygo',
      name: 'PAYGO Plan',
      price: 0,
      currency: 'XAF',
      durationDays: 90,
      description: 'Pay once for a validity window and then pay only for the material actions used inside it.',
    },
    'full-package': {
      code: 'full-package',
      name: 'Full Package Plan',
      price: 0,
      currency: 'XAF',
      durationDays: 90,
      description: 'Full access across every material and feature while the subscription remains valid.',
    },
  },
  center: {
    create: {
      basic: { amount: 0, currency: 'XAF' },
      pro: { amount: 0, currency: 'XAF' },
      paygo: { amount: 0, currency: 'XAF' },
      'full-package': { amount: 0, currency: 'XAF' },
    },
    join: {
      basic: { amount: 0, currency: 'XAF' },
      pro: { amount: 0, currency: 'XAF' },
      paygo: { amount: 0, currency: 'XAF' },
      'full-package': { amount: 0, currency: 'XAF' },
    },
  },
  materials: {
    report: {
      basic_preview_pages: 3,
      access_price: 0,
      access_minutes: 60,
      paygo_preview_pages: 3,
      basic_full_preview_price: 0,
      basic_download_price: 0,
      paygo_full_preview_price: 0,
      paygo_download_price: 0,
      paygo_access_minutes: 60,
      full_package_preview_limit: 10,
      full_package_download_limit: 5,
      plan_pricing: {
        basic: { preview_pages: 3, preview_price: 0, download_price: 0, access_minutes: 60, free_access: false },
        pro: { preview_pages: 3, preview_price: 0, download_price: 0, access_minutes: 60, free_access: false },
        paygo: { preview_pages: 3, preview_price: 0, download_price: 0, access_minutes: 60, free_access: false },
        'full-package': { preview_pages: 999, preview_price: 0, download_price: 0, access_minutes: 60, free_access: true },
      },
    },
    presentation: {
      basic_preview_pages: 3,
      access_price: 0,
      access_minutes: 60,
      paygo_preview_pages: 3,
      basic_full_preview_price: 0,
      basic_download_price: 0,
      paygo_full_preview_price: 0,
      paygo_download_price: 0,
      paygo_access_minutes: 60,
      full_package_preview_limit: 10,
      full_package_download_limit: 5,
      plan_pricing: {
        basic: { preview_pages: 3, preview_price: 0, download_price: 0, access_minutes: 60, free_access: false },
        pro: { preview_pages: 3, preview_price: 0, download_price: 0, access_minutes: 60, free_access: false },
        paygo: { preview_pages: 3, preview_price: 0, download_price: 0, access_minutes: 60, free_access: false },
        'full-package': { preview_pages: 999, preview_price: 0, download_price: 0, access_minutes: 60, free_access: true },
      },
    },
    question_paper: {
      basic_preview_pages: 3,
      access_price: 0,
      access_minutes: 60,
      paygo_preview_pages: 3,
      basic_full_preview_price: 0,
      basic_download_price: 0,
      paygo_full_preview_price: 0,
      paygo_download_price: 0,
      paygo_access_minutes: 60,
      full_package_preview_limit: 10,
      full_package_download_limit: 5,
      plan_pricing: {
        basic: { preview_pages: 3, preview_price: 0, download_price: 0, access_minutes: 60, free_access: false },
        pro: { preview_pages: 3, preview_price: 0, download_price: 0, access_minutes: 60, free_access: false },
        paygo: { preview_pages: 3, preview_price: 0, download_price: 0, access_minutes: 60, free_access: false },
        'full-package': { preview_pages: 999, preview_price: 0, download_price: 0, access_minutes: 60, free_access: true },
      },
    },
  },
  ai_study_mode: { session_price: 0, currency: 'XAF' },
  concours_partnership: { amount: 0, currency: 'XAF', durationDays: 365 },
  candidate_project_upload: { HND: 0, BACHELOR: 0, MASTERS: 0, LICENCE: 0, MASTER: 0, BTS: 0 },
};

const toNumber = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

async function getOrCreatePricingDocument() {
  let doc = await PlatformPricing.findOne({ singleton_key: 'global' });
  if (!doc) {
    doc = await PlatformPricing.create({ singleton_key: 'global' });
  }
  return doc;
}

function buildPlanDefinitions(doc) {
  const plans = doc?.plans || {};
  return {
    basic: {
      ...DEFAULTS.plans.basic,
      price: toNumber(plans?.basic?.price, DEFAULTS.plans.basic.price),
      currency: String(plans?.basic?.currency || DEFAULTS.plans.basic.currency),
      durationDays: Math.max(1, Number(plans?.basic?.duration_days || DEFAULTS.plans.basic.durationDays)),
      candidateRules: [
        'Preview is limited to the configured page count for each material.',
        'No full preview, no download, no AI access, and no center create or join access.',
        'Any paid material action sends the user to the upgrade flow.',
      ],
    },
    pro: {
      ...DEFAULTS.plans.pro,
      price: toNumber(plans?.pro?.price, DEFAULTS.plans.pro.price),
      currency: String(plans?.pro?.currency || DEFAULTS.plans.pro.currency),
      durationDays: Math.max(1, Number(plans?.pro?.duration_days || DEFAULTS.plans.pro.durationDays)),
      candidateRules: [
        'Full access to all materials and platform features for the active validity period.',
        'AI study mode, report access, and center actions are included.',
        'When the validity ends, the account falls back to the Basic preview plan.',
      ],
    },
    paygo: {
      ...DEFAULTS.plans.paygo,
      price: toNumber(plans?.paygo?.price, DEFAULTS.plans.paygo.price),
      currency: String(plans?.paygo?.currency || DEFAULTS.plans.paygo.currency),
      durationDays: Math.max(1, Number(plans?.paygo?.duration_days || DEFAULTS.plans.paygo.durationDays)),
      candidateRules: [
        'The user pays a chosen validity amount and then pays only for the material actions used inside it.',
        'Each material can have its own price and time window for access.',
        'When the validity window expires, the account falls back to Basic.',
      ],
    },
    'full-package': {
      ...DEFAULTS.plans['full-package'],
      price: toNumber(plans?.['full-package']?.price, DEFAULTS.plans['full-package'].price),
      currency: String(plans?.['full-package']?.currency || DEFAULTS.plans['full-package'].currency),
      durationDays: Math.max(1, Number(plans?.['full-package']?.duration_days || DEFAULTS.plans['full-package'].durationDays)),
      candidateRules: [
        'All material access stays active throughout the validity period.',
        'No additional material or center checkout is required while active.',
        'The plan reverts to Basic automatically when validity ends.',
      ],
    },
  };
}

function buildMaterialDefaults(doc) {
  const materials = doc?.materials || {};
  const normalizeMaterialPlanPricing = (source, fallback, legacy = {}) => {
    const plans = source || {};
    const result = {};
    ['basic', 'pro', 'paygo', 'full-package'].forEach((plan) => {
      const entry = plans[plan] || fallback[plan] || {};
      const isFullPackage = plan === 'full-package';
      const legacyValues = legacy[plan] || {};
      const defaultPlan = fallback[plan] || {};
      const resolveField = (field, defaultValue) => {
        const camelField = field.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
        const canonicalValue = entry[field] ?? entry[camelField];
        const legacyValue = legacyValues[field];
        if (
          legacyValue !== undefined &&
          Number(canonicalValue ?? defaultValue) === Number(defaultValue) &&
          Number(legacyValue) !== Number(defaultValue)
        ) {
          return legacyValue;
        }
        return canonicalValue ?? defaultValue;
      };
      result[plan] = {
        preview_pages: Math.max(isFullPackage ? 999 : 0, Number(resolveField('preview_pages', defaultPlan.preview_pages ?? (isFullPackage ? 999 : 3)))),
        preview_price: toNumber(resolveField('preview_price', defaultPlan.preview_price ?? 0)),
        download_price: toNumber(resolveField('download_price', defaultPlan.download_price ?? 0)),
        access_minutes: Math.max(1, Number(resolveField('access_minutes', defaultPlan.access_minutes ?? 60))),
        free_access: Boolean(entry.free_access ?? fallback[plan]?.free_access ?? isFullPackage),
      };
    });
    return result;
  };

  const legacyPlanAliases = (source, defaults) => ({
    basic: { preview_pages: source?.basic_preview_pages ?? defaults.basic.preview_pages },
    paygo: {
      preview_pages: source?.paygo_preview_pages ?? defaults.paygo.preview_pages,
      preview_price: source?.paygo_full_preview_price ?? defaults.paygo.preview_price,
      download_price: source?.paygo_download_price ?? defaults.paygo.download_price,
      access_minutes: source?.paygo_access_minutes ?? defaults.paygo.access_minutes,
    },
    'full-package': {
      preview_pages: source?.full_package_preview_limit ?? defaults['full-package'].preview_pages,
    },
  });

  const materialTemplates = {
    report: {
      ...DEFAULTS.materials.report,
      ...materials.report,
      access_price: toNumber(materials?.report?.access_price ?? materials?.report?.plan_pricing?.paygo?.preview_price, DEFAULTS.materials.report.access_price),
      access_minutes: Math.max(1, Number(materials?.report?.access_minutes ?? materials?.report?.plan_pricing?.paygo?.access_minutes ?? DEFAULTS.materials.report.access_minutes)),
      full_package_preview_limit: toNumber(materials?.report?.full_package_preview_limit, DEFAULTS.materials.report.full_package_preview_limit),
      full_package_download_limit: toNumber(materials?.report?.full_package_download_limit, DEFAULTS.materials.report.full_package_download_limit),
      basic_full_preview_price: toNumber(materials?.report?.basic_full_preview_price, 0),
      basic_download_price: toNumber(materials?.report?.basic_download_price, 0),
      paygo_full_preview_price: toNumber(materials?.report?.paygo_full_preview_price, 0),
      paygo_download_price: toNumber(materials?.report?.paygo_download_price, 0),
      plan_pricing: normalizeMaterialPlanPricing(materials?.report?.plan_pricing, DEFAULTS.materials.report.plan_pricing, legacyPlanAliases(materials?.report, DEFAULTS.materials.report.plan_pricing)),
    },
    presentation: {
      ...DEFAULTS.materials.presentation,
      ...materials.presentation,
      access_price: toNumber(materials?.presentation?.access_price ?? materials?.presentation?.plan_pricing?.paygo?.preview_price, DEFAULTS.materials.presentation.access_price),
      access_minutes: Math.max(1, Number(materials?.presentation?.access_minutes ?? materials?.presentation?.plan_pricing?.paygo?.access_minutes ?? DEFAULTS.materials.presentation.access_minutes)),
      full_package_preview_limit: toNumber(materials?.presentation?.full_package_preview_limit, DEFAULTS.materials.presentation.full_package_preview_limit),
      full_package_download_limit: toNumber(materials?.presentation?.full_package_download_limit, DEFAULTS.materials.presentation.full_package_download_limit),
      basic_full_preview_price: toNumber(materials?.presentation?.basic_full_preview_price, 0),
      basic_download_price: toNumber(materials?.presentation?.basic_download_price, 0),
      paygo_full_preview_price: toNumber(materials?.presentation?.paygo_full_preview_price, 0),
      paygo_download_price: toNumber(materials?.presentation?.paygo_download_price, 0),
      plan_pricing: normalizeMaterialPlanPricing(materials?.presentation?.plan_pricing, DEFAULTS.materials.presentation.plan_pricing, legacyPlanAliases(materials?.presentation, DEFAULTS.materials.presentation.plan_pricing)),
    },
    question_paper: {
      ...DEFAULTS.materials.question_paper,
      ...materials.question_paper,
      access_price: toNumber(materials?.question_paper?.access_price ?? materials?.question_paper?.plan_pricing?.paygo?.preview_price, DEFAULTS.materials.question_paper.access_price),
      access_minutes: Math.max(1, Number(materials?.question_paper?.access_minutes ?? materials?.question_paper?.plan_pricing?.paygo?.access_minutes ?? DEFAULTS.materials.question_paper.access_minutes)),
      full_package_preview_limit: toNumber(materials?.question_paper?.full_package_preview_limit, DEFAULTS.materials.question_paper.full_package_preview_limit),
      full_package_download_limit: toNumber(materials?.question_paper?.full_package_download_limit, DEFAULTS.materials.question_paper.full_package_download_limit),
      basic_full_preview_price: toNumber(materials?.question_paper?.basic_full_preview_price, 0),
      basic_download_price: toNumber(materials?.question_paper?.basic_download_price, 0),
      paygo_full_preview_price: toNumber(materials?.question_paper?.paygo_full_preview_price, 0),
      paygo_download_price: toNumber(materials?.question_paper?.paygo_download_price, 0),
      plan_pricing: normalizeMaterialPlanPricing(materials?.question_paper?.plan_pricing, DEFAULTS.materials.question_paper.plan_pricing, legacyPlanAliases(materials?.question_paper, DEFAULTS.materials.question_paper.plan_pricing)),
    },
  };

  return materialTemplates;
}

function buildCenterPricing(doc) {
  const center = doc?.center || {};
  const result = { create: {}, join: {} };

  ['create', 'join'].forEach((action) => {
    ['basic', 'pro', 'paygo', 'full-package'].forEach((plan) => {
      const entry = center?.[action]?.[plan] || center?.[action]?.pro || {};
      const fallback = DEFAULTS.center[action][plan] || DEFAULTS.center[action].pro;
      result[action][plan] = {
        amount: toNumber(entry.amount, fallback.amount),
        currency: String(entry.currency || fallback.currency),
        code: action === 'create' ? 'center_create' : 'center_join',
        description: action === 'create' ? `Create one center chat (${plan.toUpperCase()}).` : `Join one center chat (${plan.toUpperCase()}).`,
      };
    });
  });

  return result;
}

function buildCandidateProjectUploadPricing(doc) {
  const source = doc?.candidate_project_upload || {};
  return {
    HND: toNumber(source.HND, 0),
    BACHELOR: toNumber(source.BACHELOR, 0),
    MASTERS: toNumber(source.MASTERS, 0),
    LICENCE: toNumber(source.LICENCE, 0),
    MASTER: toNumber(source.MASTER, 0),
    BTS: toNumber(source.BTS, 0),
  };
}

async function getPricingSnapshot() {
  const doc = await getOrCreatePricingDocument();
  return {
    raw: doc,
    planDefinitions: buildPlanDefinitions(doc),
    materialDefaults: buildMaterialDefaults(doc),
    centerPricing: buildCenterPricing(doc),
    candidateProjectUploadPricing: buildCandidateProjectUploadPricing(doc),
    aiStudyMode: {
      session_price: toNumber(doc?.ai_study_mode?.session_price, DEFAULTS.ai_study_mode.session_price),
      currency: String(doc?.ai_study_mode?.currency || DEFAULTS.ai_study_mode.currency),
    },
    concoursPartnership: {
      amount: toNumber(doc?.concours_partnership?.amount, DEFAULTS.concours_partnership.amount),
      currency: String(doc?.concours_partnership?.currency || DEFAULTS.concours_partnership.currency),
      durationDays: Math.max(1, Number(doc?.concours_partnership?.duration_days || DEFAULTS.concours_partnership.durationDays)),
    },
  };
}

module.exports = {
  DEFAULTS,
  getOrCreatePricingDocument,
  getPricingSnapshot,
};
