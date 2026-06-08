const PLAN_DEFINITIONS = {
  basic: {
    code: 'basic',
    name: 'Basic Plan',
    price: 0,
    currency: 'XAF',
    durationDays: null,
    description: 'Free forever with limited access.',
    candidateRules: [
      'Preview only the first page of reports, presentations, and question papers.',
      'No downloading or copying from previews.',
      'Cannot create or join center chats.',
    ],
  },
  pro: {
    code: 'pro',
    name: 'Pro Plan',
    price: 1000,
    currency: 'XAF',
    durationDays: 90,
    description: 'Full access for 3 months, then automatically falls back to Basic.',
    candidateRules: [
      'Full previews for all materials.',
      'Download all materials.',
      'Copy from material previews.',
      'Create and join center chats.',
    ],
  },
  paygo: {
    code: 'paygo',
    name: 'PAYGO Plan',
    price: 100,
    currency: 'XAF',
    durationDays: 90,
    description: 'Low upfront fee for 3 months, then pay only for specific premium actions.',
    candidateRules: [
      'Preview the first 3 pages of any material for free.',
      'Pay per material for full preview or download.',
      'Pay per center to create or join center chats.',
      'No copy support from previews.',
    ],
  },
};

const MATERIAL_DEFAULTS = {
  report: {
    basic_preview_pages: 1,
    paygo_preview_pages: 3,
    paygo_full_preview_price: 100,
    paygo_download_price: 200,
    paygo_access_minutes: 60,
  },
  presentation: {
    basic_preview_pages: 1,
    paygo_preview_pages: 3,
    paygo_full_preview_price: 50,
    paygo_download_price: 100,
    paygo_access_minutes: 60,
  },
  question_paper: {
    basic_preview_pages: 1,
    paygo_preview_pages: 3,
    paygo_full_preview_price: 50,
    paygo_download_price: 100,
    paygo_access_minutes: 60,
  },
};

const CENTER_PRICING = {
  create: { amount: 200, currency: 'XAF', code: 'center_create', description: 'Create one center chat.' },
  join: { amount: 200, currency: 'XAF', code: 'center_join', description: 'Accept or join one center chat.' },
};

function getPlanDefinition(planCode) {
  return PLAN_DEFINITIONS[String(planCode || 'basic').toLowerCase()] || PLAN_DEFINITIONS.basic;
}

function getMaterialDefaults(materialType) {
  return MATERIAL_DEFAULTS[String(materialType || '').toLowerCase()] || null;
}

function getCenterPricing(action) {
  return CENTER_PRICING[String(action || '').toLowerCase()] || null;
}

module.exports = {
  PLAN_DEFINITIONS,
  MATERIAL_DEFAULTS,
  CENTER_PRICING,
  getPlanDefinition,
  getMaterialDefaults,
  getCenterPricing,
};