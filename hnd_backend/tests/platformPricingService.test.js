const test = require('node:test');
const assert = require('node:assert/strict');

const PlatformPricing = require('../models/PlatformPricing');
const pricingDocument = {
  plans: {},
  materials: {
    report: {
      basic_preview_pages: 3,
      paygo_preview_pages: 5,
      paygo_full_preview_price: 260,
      paygo_download_price: 420,
      paygo_access_minutes: 45,
      plan_pricing: {
        basic: { preview_pages: 3, preview_price: 0, download_price: 0, access_minutes: 60, free_access: false },
        pro: { preview_pages: 999, preview_price: 0, download_price: 0, access_minutes: 60, free_access: true },
        paygo: { preview_pages: 3, preview_price: 0, download_price: 0, access_minutes: 60, free_access: false },
        'full-package': { preview_pages: 999, preview_price: 0, download_price: 0, access_minutes: 60, free_access: true },
      },
    },
  },
  center: {},
  ai_study_mode: { session_price: 125, currency: 'XAF' },
  concours_partnership: {},
  candidate_project_upload: {},
};

PlatformPricing.findOne = async () => pricingDocument;

const { getPricingSnapshot } = require('../services/platformPricingService');

test('legacy material price aliases populate canonical prices while canonical edits take precedence', async () => {
  const legacySnapshot = await getPricingSnapshot();
  assert.deepEqual(legacySnapshot.materialDefaults.report.plan_pricing.paygo, {
    preview_pages: 5,
    preview_price: 260,
    download_price: 420,
    access_minutes: 45,
    free_access: false,
  });

  pricingDocument.materials.report.plan_pricing.paygo = {
    preview_pages: 6,
    preview_price: 300,
    download_price: 500,
    access_minutes: 30,
    free_access: false,
  };
  const canonicalSnapshot = await getPricingSnapshot();
  assert.deepEqual(canonicalSnapshot.materialDefaults.report.plan_pricing.paygo, {
    preview_pages: 6,
    preview_price: 300,
    download_price: 500,
    access_minutes: 30,
    free_access: false,
  });
});