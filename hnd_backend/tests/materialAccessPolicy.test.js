const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const catalogModulePath = require.resolve('../utils/subscriptionCatalog');
const couponModulePath = require.resolve('../services/couponService');
const subscriptionUtilsPath = require.resolve('../utils/subscriptionUtils');
require.cache[catalogModulePath] = {
  id: catalogModulePath,
  filename: catalogModulePath,
  loaded: true,
  exports: {
    getPlanDefinition: async () => ({ name: 'Basic' }),
    getMaterialDefaults: async (materialType) => ({
      basic_preview_pages: 3,
      paygo_preview_pages: 3,
      paygo_full_preview_price: 50,
      paygo_download_price: 80,
      paygo_access_minutes: 60,
      plan_pricing: {
        basic: { preview_pages: 3, preview_price: 0, download_price: 0, access_minutes: 60, free_access: false },
        pro: { preview_pages: 999, preview_price: 0, download_price: 0, access_minutes: 60, free_access: true },
        paygo: { preview_pages: 3, preview_price: 50, download_price: 80, access_minutes: 60, free_access: false },
        'full-package': { preview_pages: 999, preview_price: 0, download_price: 0, access_minutes: 60, free_access: true },
      },
    }),
  },
};
require.cache[couponModulePath] = {
  id: couponModulePath,
  filename: couponModulePath,
  loaded: true,
  exports: {
    isCouponActiveNow: () => true,
    ensureCouponBackedSubscriptionStillActive: async () => {},
  },
};
delete require.cache[subscriptionUtilsPath];

const { isFreeMaterialAccess, getMaterialAccessSummary } = require('../utils/subscriptionUtils');
const { resolveLocalSubmissionFilePath } = require('../controllers/candidateProjectController');

const PaymentAccessGrant = require('../models/PaymentAccessGrant');
const User = require('../models/User');
const CandidatePurchase = require('../models/CandidatePurchase');
PaymentAccessGrant.findOne = async () => null;
User.findOne = async () => null;
User.findById = async () => null;
CandidatePurchase.findOne = async () => null;

test('non-HND question papers are treated as free materials', async () => {
  assert.equal(await isFreeMaterialAccess('question_paper', { paper_type: 'ca' }), true);
  assert.equal(await isFreeMaterialAccess('question_paper', { paper_type: 'exam' }), true);
  assert.equal(await isFreeMaterialAccess('question_paper', { paper_type: 'mock' }), true);
  assert.equal(await isFreeMaterialAccess('question_paper', { paper_type: 'hnd' }), false);
});

test('report guides are treated as free materials', async () => {
  assert.equal(await isFreeMaterialAccess('report', { is_guide: true }), true);
  assert.equal(await isFreeMaterialAccess('report', { is_guide: false }), false);
});

test('paid material access is unrestricted for pro and full package plans, while basic stays preview only', async () => {
  const accessPro = await getMaterialAccessSummary({
    user: { cand_id: 'CAND123', subscription: { plan: 'pro', status: 'active' } },
    materialType: 'report',
    resourceId: 'report-1',
    doc: { is_guide: false },
  });

  assert.equal(accessPro.plan, 'pro');
  assert.equal(accessPro.preview_page_limit, null);
  assert.equal(accessPro.allow_download, true);
  assert.equal(accessPro.payment_required, null);

  const accessFull = await getMaterialAccessSummary({
    user: { cand_id: 'CAND123', subscription: { plan: 'full-package', status: 'active' } },
    materialType: 'question_paper',
    resourceId: 'paper-1',
    doc: { paper_type: 'hnd' },
  });

  assert.equal(accessFull.plan, 'full-package');
  assert.equal(accessFull.preview_page_limit, null);
  assert.equal(accessFull.allow_download, true);
  assert.equal(accessFull.payment_required, null);

  const accessBasic = await getMaterialAccessSummary({
    user: { cand_id: 'CAND123', subscription: { plan: 'basic', status: 'active' } },
    materialType: 'presentation',
    resourceId: 'pres-1',
    doc: { is_guide: false },
  });

  assert.equal(accessBasic.plan, 'basic');
  assert.equal(accessBasic.allow_download, false);
  assert.ok(accessBasic.preview_page_limit > 0);
  assert.ok(accessBasic.payment_required);
});

test('candidate project previews resolve files by basename when the stored path is missing', () => {
  const uploadsDir = path.join(__dirname, '..', 'uploads', 'candidate-projects');
  fs.mkdirSync(uploadsDir, { recursive: true });

  const tempName = `preview-test-${Date.now()}-${Math.random().toString(16).slice(2)}.docx`;
  const tempPath = path.join(uploadsDir, tempName);
  fs.writeFileSync(tempPath, 'mock-content');

  try {
    const resolved = resolveLocalSubmissionFilePath('/uploads/candidate-projects/does-not-exist.docx', tempName);
    assert.equal(resolved, tempPath);
  } finally {
    fs.rmSync(tempPath, { force: true });
  }
});
