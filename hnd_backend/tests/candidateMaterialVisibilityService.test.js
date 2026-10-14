'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getCandidateMaterialProgramFilter,
  isMaterialVisibleToCandidate,
} = require('../services/candidateMaterialVisibilityService');

test('candidate material program filter includes every program in the language group', () => {
  assert.deepEqual(
    getCandidateMaterialProgramFilter(['HND', 'BACHELOR', 'MASTERS']),
    { program: { $in: ['HND', 'BACHELOR', 'MASTERS'] } }
  );
});

test('candidate material visibility compares canonical program codes case-insensitively', () => {
  const englishPrograms = ['HND', 'BACHELOR', 'MASTERS'];
  const frenchPrograms = ['BTS', 'LICENCE', 'MASTER'];

  assert.equal(isMaterialVisibleToCandidate({ program: 'hnd' }, englishPrograms), true);
  assert.equal(isMaterialVisibleToCandidate({ program: 'Bachelor' }, englishPrograms), true);
  assert.equal(isMaterialVisibleToCandidate({ program: 'BTS' }, englishPrograms), false);
  assert.equal(isMaterialVisibleToCandidate({ program: 'MASTER' }, frenchPrograms), true);
  assert.equal(isMaterialVisibleToCandidate({ program: 'MASTERS' }, frenchPrograms), false);
});
