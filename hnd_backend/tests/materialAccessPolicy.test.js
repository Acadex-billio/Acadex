const test = require('node:test');
const assert = require('node:assert/strict');
const { isFreeMaterialAccess } = require('../utils/subscriptionUtils');

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
