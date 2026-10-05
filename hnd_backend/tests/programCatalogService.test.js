'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const Program = require('../models/Program');
const {
  DEFAULT_PROGRAMS,
  normalizeProgramCode,
  resolveProgramCode,
  mapProgramToDepartmentTrack,
  getProgramsByVisibilityGroup,
} = require('../services/programCatalogService');

const originalUpdateOne = Program.updateOne;
const originalFindOne = Program.findOne;
const originalFind = Program.find;

const mockPrograms = DEFAULT_PROGRAMS.map((program) => ({
  ...program,
  is_active: true,
}));

const helperFindOne = (filter) => ({
  lean: async () => {
    const codeEntry = filter?.$or?.find((expression) => Object.prototype.hasOwnProperty.call(expression, 'code'));
    const aliasEntry = filter?.$or?.find((expression) => Object.prototype.hasOwnProperty.call(expression, 'aliases'));
    const targetCode = codeEntry?.code || aliasEntry?.aliases;

    const matched = mockPrograms.find((program) => program.code === targetCode || program.aliases.includes(targetCode));
    return matched ? { ...matched } : null;
  },
});

const helperFind = (filter) => ({
  select: () => ({
    lean: async () => {
      if (filter?.visibility_group) {
        return mockPrograms.filter((program) => program.visibility_group === filter.visibility_group);
      }
      return mockPrograms;
    },
  }),
});

test.beforeEach(() => {
  Program.updateOne = async () => ({ acknowledged: true });
  Program.findOne = helperFindOne;
  Program.find = helperFind;
});

test.afterEach(() => {
  Program.updateOne = originalUpdateOne;
  Program.findOne = originalFindOne;
  Program.find = originalFind;
});

test('normalizeProgramCode canonicalizes and uppercases values', () => {
  assert.equal(normalizeProgramCode(' bachelors '), 'BACHELORS');
  assert.equal(normalizeProgramCode('master'), 'MASTER');
});

test('resolveProgramCode maps aliases to the canonical program code', async () => {
  assert.equal(await resolveProgramCode('bachelors'), 'BACHELOR');
  assert.equal(await resolveProgramCode('master'), 'MASTER');
  assert.equal(await resolveProgramCode('bts'), 'BTS');
});

test('mapProgramToDepartmentTrack resolves the department track for all supported program values', async () => {
  assert.equal(await mapProgramToDepartmentTrack('HND'), 'HND');
  assert.equal(await mapProgramToDepartmentTrack('BACHELORS'), 'HND');
  assert.equal(await mapProgramToDepartmentTrack('MASTER'), 'BTS');
  assert.equal(await mapProgramToDepartmentTrack('LICENCE'), 'BTS');
});

test('getProgramsByVisibilityGroup returns the canonical program list for the same visibility bucket', async () => {
  const englishPrograms = await getProgramsByVisibilityGroup('HND');
  const frenchPrograms = await getProgramsByVisibilityGroup('BTS');

  assert.deepEqual(englishPrograms, ['HND', 'BACHELOR', 'MASTERS']);
  assert.deepEqual(frenchPrograms, ['BTS', 'LICENCE', 'MASTER']);
});
