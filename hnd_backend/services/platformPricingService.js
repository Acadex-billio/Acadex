const PlatformPricing = require('../models/PlatformPricing');

const DEFAULTS = {
  plans: {
    basic: { code: 'basic', name: 'Basic Plan', price: 0, currency: 'XAF', durationDays: 3650, description: 'Free access with limited features.' },
    pro: { code: 'pro', name: 'Pro Plan', price: 0, currency: 'XAF', durationDays: 90, description: 'Full access plan.' },
    paygo: { code: 'paygo', name: 'PAYGO Plan', price: 0, currency: 'XAF', durationDays: 90, description: 'Usage-based premium plan.' },
    'full-package': { code: 'full-package', name: 'Full Package Plan', price: 0, currency: 'XAF', durationDays: 90, description: 'Premium access with quota-based downloads and previews.' },
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
    report: { basic_preview_pages: 1, paygo_preview_pages: 3, paygo_full_preview_price: 0, paygo_download_price: 0, paygo_access_minutes: 60, full_package_preview_limit: 10, full_package_download_limit: 5 },
    presentation: { basic_preview_pages: 1, paygo_preview_pages: 3, paygo_full_preview_price: 0, paygo_download_price: 0, paygo_access_minutes: 60, full_package_preview_limit: 10, full_package_download_limit: 5 },
    question_paper: { basic_preview_pages: 1, paygo_preview_pages: 3, paygo_full_preview_price: 0, paygo_download_price: 0, paygo_access_minutes: 60, full_package_preview_limit: 10, full_package_download_limit: 5 },
  },
  ai_study_mode: { session_price: 0, currency: 'XAF' },
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
        'Preview only the first page of reports, presentations, and question papers.',
        'No downloading or copying from previews by default.',
      ],
    },
    pro: {
      ...DEFAULTS.plans.pro,
      price: toNumber(plans?.pro?.price, DEFAULTS.plans.pro.price),
      currency: String(plans?.pro?.currency || DEFAULTS.plans.pro.currency),
      durationDays: Math.max(1, Number(plans?.pro?.duration_days || DEFAULTS.plans.pro.durationDays)),
      candidateRules: [
        'Full previews and downloads when enabled by pricing rules.',
      ],
    },
    paygo: {
      ...DEFAULTS.plans.paygo,
      price: toNumber(plans?.paygo?.price, DEFAULTS.plans.paygo.price),
      currency: String(plans?.paygo?.currency || DEFAULTS.plans.paygo.currency),
      durationDays: Math.max(1, Number(plans?.paygo?.duration_days || DEFAULTS.plans.paygo.durationDays)),
      candidateRules: [
        'Usage-based charges follow paygo pricing settings.',
      ],
    },
    'full-package': {
      ...DEFAULTS.plans['full-package'],
      price: toNumber(plans?.['full-package']?.price, DEFAULTS.plans['full-package'].price),
      currency: String(plans?.['full-package']?.currency || DEFAULTS.plans['full-package'].currency),
      durationDays: Math.max(1, Number(plans?.['full-package']?.duration_days || DEFAULTS.plans['full-package'].durationDays)),
      candidateRules: [
        'Full-package subscribers receive premium access with managed preview and download allowances.',
      ],
    },
  };
}

function buildMaterialDefaults(doc) {
  const materials = doc?.materials || {};
  return {
    report: {
      ...DEFAULTS.materials.report,
      ...materials.report,
      full_package_preview_limit: toNumber(materials?.report?.full_package_preview_limit, DEFAULTS.materials.report.full_package_preview_limit),
      full_package_download_limit: toNumber(materials?.report?.full_package_download_limit, DEFAULTS.materials.report.full_package_download_limit),
      paygo_full_preview_price: toNumber(materials?.report?.paygo_full_preview_price, 0),
      paygo_download_price: toNumber(materials?.report?.paygo_download_price, 0),
    },
    presentation: {
      ...DEFAULTS.materials.presentation,
      ...materials.presentation,
      full_package_preview_limit: toNumber(materials?.presentation?.full_package_preview_limit, DEFAULTS.materials.presentation.full_package_preview_limit),
      full_package_download_limit: toNumber(materials?.presentation?.full_package_download_limit, DEFAULTS.materials.presentation.full_package_download_limit),
      paygo_full_preview_price: toNumber(materials?.presentation?.paygo_full_preview_price, 0),
      paygo_download_price: toNumber(materials?.presentation?.paygo_download_price, 0),
    },
    question_paper: {
      ...DEFAULTS.materials.question_paper,
      ...materials.question_paper,
      full_package_preview_limit: toNumber(materials?.question_paper?.full_package_preview_limit, DEFAULTS.materials.question_paper.full_package_preview_limit),
      full_package_download_limit: toNumber(materials?.question_paper?.full_package_download_limit, DEFAULTS.materials.question_paper.full_package_download_limit),
      paygo_full_preview_price: toNumber(materials?.question_paper?.paygo_full_preview_price, 0),
      paygo_download_price: toNumber(materials?.question_paper?.paygo_download_price, 0),
    },
  };
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
  };
}

module.exports = {
  DEFAULTS,
  getOrCreatePricingDocument,
  getPricingSnapshot,
};
