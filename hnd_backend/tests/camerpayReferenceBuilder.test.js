const test = require('node:test');
const assert = require('node:assert/strict');
const { buildCamerpayInvoiceReference } = require('../services/camerpayReferenceBuilder');

test('builds an Acadex reference for account subscriptions', () => {
  const ref = buildCamerpayInvoiceReference({ purposeType: 'subscription', purposeCode: 'account_subscription' });
  assert.equal(ref, '#acadex-account-subscription');
});

test('builds an Acadex reference for report downloads', () => {
  const ref = buildCamerpayInvoiceReference({ purposeType: 'material_access', resourceType: 'report', action: 'download' });
  assert.equal(ref, '#acadex-report-download');
});

test('builds an Acadex reference for presentation previews', () => {
  const ref = buildCamerpayInvoiceReference({ purposeType: 'material_access', resourceType: 'presentation', action: 'preview' });
  assert.equal(ref, '#acadex-presentation-preview');
});
