const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const catalogModulePath = require.resolve('../utils/subscriptionCatalog');
const couponModulePath = require.resolve('../services/couponService');
const subscriptionUtilsPath = require.resolve('../utils/subscriptionUtils');
let testMaterialPrices = { preview_price: 50, download_price: 80, preview_pages: 3, access_minutes: 60 };
require.cache[catalogModulePath] = {
  id: catalogModulePath,
  filename: catalogModulePath,
  loaded: true,
  exports: {
    getPlanDefinition: async () => ({ name: 'Basic' }),
    getMaterialDefaults: async (materialType) => ({
      basic_preview_pages: 3,
      paygo_preview_pages: testMaterialPrices.preview_pages,
      paygo_full_preview_price: testMaterialPrices.preview_price,
      paygo_download_price: testMaterialPrices.download_price,
      paygo_access_minutes: testMaterialPrices.access_minutes,
      plan_pricing: {
        basic: { preview_pages: 3, preview_price: 0, download_price: 0, access_minutes: 60, free_access: false },
        pro: { preview_pages: 999, preview_price: 0, download_price: 0, access_minutes: 60, free_access: true },
        paygo: { ...testMaterialPrices, free_access: false },
        'full-package': { preview_pages: 999, preview_price: 0, download_price: 0, access_minutes: 60, free_access: true },
      },
    }),
    getAiStudyModePricing: async () => ({ session_price: 125, currency: 'XAF' }),
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
const QuestionPaper = require('../models/QuestionPaper');
const PaymentTransaction = require('../models/PaymentTransaction');
const materialAccessService = require('../services/materialAccessService');
PaymentAccessGrant.findOne = async () => null;
User.findOne = async () => null;
User.findById = async () => null;
CandidatePurchase.findOne = async () => null;

const { checkMaterialAccess } = require('../middlewares/materialAccessMiddleware');

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
  assert.equal(accessBasic.preview_page_limit, 3);
  assert.equal(accessBasic.payment_required.preview, null);
  assert.equal(accessBasic.payment_required.download, null);
});

test('PAYGO gets configured limited previews and exact per-action prices', async () => {
  const access = await getMaterialAccessSummary({
    user: { cand_id: 'CAND123', subscription: { plan: 'paygo', status: 'active' } },
    materialType: 'presentation',
    resourceId: 'presentation-1',
    doc: {},
  });

  assert.equal(access.plan, 'paygo');
  assert.equal(access.preview_page_limit, 3);
  assert.equal(access.payment_required.preview.amount, 50);
  assert.equal(access.payment_required.download.amount, 80);
  assert.equal(access.payment_required.preview.access_minutes, 60);
});

test('PAYGO zero-priced actions do not produce zero-value payment requirements', async () => {
  const originalPrices = testMaterialPrices;
  testMaterialPrices = { preview_price: 0, download_price: 0, preview_pages: 4, access_minutes: 60 };
  try {
    const access = await getMaterialAccessSummary({
      user: { cand_id: 'CAND123', subscription: { plan: 'paygo', status: 'active' } },
      materialType: 'report',
      resourceId: 'report-free-1',
      doc: {},
    });
    assert.equal(access.preview_page_limit, null);
    assert.equal(access.allow_download, true);
    assert.equal(access.payment_required.preview, null);
    assert.equal(access.payment_required.download, null);
  } finally {
    testMaterialPrices = originalPrices;
  }
});

test('AI Study Mode uses the configured session price for PAYGO and preserves free plan access', async () => {
  const paygo = await getMaterialAccessSummary({
    user: { cand_id: 'CAND123', subscription: { plan: 'paygo', status: 'active' } },
    materialType: 'ai_mode',
    resourceId: 'study-material-1',
    doc: {},
  });
  assert.equal(paygo.payment_required.preview.amount, 125);
  assert.equal(paygo.payment_required.preview.purpose_code, 'ai_mode_preview');

  const pro = await getMaterialAccessSummary({
    user: { cand_id: 'CAND123', subscription: { plan: 'pro', status: 'active' } },
    materialType: 'ai_mode',
    resourceId: 'study-material-1',
    doc: {},
  });
  assert.equal(pro.payment_required, null);
  assert.equal(pro.allow_download, true);
});

test('AI Study Mode is a supported payment transaction resource', () => {
  assert.ok(PaymentTransaction.schema.path('resource_type').enumValues.includes('ai_mode'));
});

test('material route guard serves Basic previews and routes Basic downloads to upgrade', async () => {
  const originalUserFindOne = User.findOne;
  const originalQuestionPaperFindById = QuestionPaper.findById;
  const originalHasActiveAccess = materialAccessService.hasActiveAccess;
  let subscription = { plan: 'basic', status: 'active' };
  let material = { paper_type: 'hnd' };

  User.findOne = () => ({
    select() { return this; },
    lean: async () => ({ cand_id: 'CAND123', subscription }),
  });
  QuestionPaper.findById = () => ({ lean: async () => material });
  materialAccessService.hasActiveAccess = async () => false;

  const request = async (accessType) => {
    let reachedNext = false;
    const response = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(payload) { this.payload = payload; return this; },
    };
    const req = {
      params: { id: '507f1f77bcf86cd799439011' },
      body: {},
      user: { cand_id: 'CAND123', program: 'HND' },
    };

    await checkMaterialAccess('questionPaper', accessType)(req, response, () => {
      reachedNext = true;
    });
    return { reachedNext, response };
  };

  try {
    const basicPreview = await request('preview');
    assert.equal(basicPreview.reachedNext, true);

    const basicDownload = await request('download');
    assert.equal(basicDownload.response.statusCode, 403);
    assert.equal(basicDownload.response.payload.code, 'PLAN_UPGRADE_REQUIRED');

    material = { paper_type: 'mock' };
    const freeDownload = await request('download');
    assert.equal(freeDownload.reachedNext, true);

    material = { paper_type: 'hnd' };
    subscription = { plan: 'pro', status: 'active' };
    const proDownload = await request('download');
    assert.equal(proDownload.reachedNext, true);

    subscription = { plan: 'paygo', status: 'active' };
    const paygoDownload = await request('download');
    assert.equal(paygoDownload.response.statusCode, 402);
    assert.equal(paygoDownload.response.payload.code, 'PAYMENT_REQUIRED');
    assert.equal(paygoDownload.response.payload.payment_requirement.amount, 80);
    const paygoPreview = await request('preview');
    assert.equal(paygoPreview.reachedNext, true);
  } finally {
    User.findOne = originalUserFindOne;
    QuestionPaper.findById = originalQuestionPaperFindById;
    materialAccessService.hasActiveAccess = originalHasActiveAccess;
  }
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
