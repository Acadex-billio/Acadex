const test = require('node:test');
const assert = require('node:assert/strict');
const {
  normalizeText,
  normalizeSession,
  normalizeIds,
  hashBuffer,
  buildDuplicateKey,
} = require('../utils/materialDuplicate');

test('normalizes titles and authors consistently', () => {
  assert.equal(normalizeText('  Résumé:  Test '), 'resume test');
  assert.equal(normalizeSession('2025 / 2026'), '20252026');
  assert.equal(normalizeIds(['dept-b', 'dept-a', 'dept-a']), 'dept-a|dept-b');
});

test('hashes identical file content independently of filename', () => {
  assert.equal(hashBuffer(Buffer.from('same file')), hashBuffer(Buffer.from('same file')));
  assert.notEqual(hashBuffer(Buffer.from('same file')), hashBuffer(Buffer.from('other file')));
});

test('builds stable metadata identity keys', () => {
  assert.equal(
    buildDuplicateKey(['report', 'My Title', 'Author', 'HND', '2025/2026']),
    'report|my title|author|hnd|2025 2026'
  );
});