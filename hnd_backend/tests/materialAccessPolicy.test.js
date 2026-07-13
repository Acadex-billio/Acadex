const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { isFreeMaterialAccess } = require('../utils/subscriptionUtils');
const { resolveLocalSubmissionFilePath } = require('../controllers/candidateProjectController');

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
