'use strict';

const Program = require('../models/Program');

const DEFAULT_PROGRAMS = [
  { code: 'HND', name: 'Higher National Diploma', abbreviation: 'HND', language: 'en', department_track: 'HND', visibility_group: 'ENGLISH', candidate_project_enabled: false, candidate_project_target_code: null, aliases: [], display_order: 10 },
  { code: 'BTS', name: 'Brevet de Technicien Superieur', abbreviation: 'BTS', language: 'fr', department_track: 'BTS', visibility_group: 'FRENCH', candidate_project_enabled: false, candidate_project_target_code: null, aliases: [], display_order: 20 },
  { code: 'BACHELOR', name: 'Bachelor', abbreviation: 'BACHELOR', language: 'en', department_track: 'HND', visibility_group: 'ENGLISH', candidate_project_enabled: true, candidate_project_target_code: 'HND', aliases: ['BACHELORS'], display_order: 30 },
  { code: 'MASTERS', name: 'Masters', abbreviation: 'MASTERS', language: 'en', department_track: 'HND', visibility_group: 'ENGLISH', candidate_project_enabled: true, candidate_project_target_code: 'BACHELOR', aliases: [], display_order: 40 },
  { code: 'LICENCE', name: 'Licence', abbreviation: 'LICENCE', language: 'fr', department_track: 'BTS', visibility_group: 'FRENCH', candidate_project_enabled: true, candidate_project_target_code: 'BTS', aliases: [], display_order: 50 },
  { code: 'MASTER', name: 'Master', abbreviation: 'MASTER', language: 'fr', department_track: 'BTS', visibility_group: 'FRENCH', candidate_project_enabled: true, candidate_project_target_code: 'LICENCE', aliases: [], display_order: 60 },
];

let seedPromise = null;

const normalizeProgramCode = (value) => String(value || '').trim().toUpperCase();

const ensureDefaultPrograms = async () => {
  if (!seedPromise) {
    seedPromise = Promise.all(DEFAULT_PROGRAMS.map((program) => Program.updateOne(
      { code: program.code },
      { $setOnInsert: program },
      { upsert: true }
    ))).catch((error) => {
      seedPromise = null;
      throw error;
    });
  }
  return seedPromise;
};

const findProgram = async (value, { includeInactive = false } = {}) => {
  await ensureDefaultPrograms();
  const code = normalizeProgramCode(value);
  if (!code) return null;
  const activeFilter = includeInactive ? {} : { is_active: true };
  return Program.findOne({ ...activeFilter, $or: [{ code }, { aliases: code }] }).lean();
};

const listPrograms = async ({ includeInactive = false } = {}) => {
  await ensureDefaultPrograms();
  const filter = includeInactive ? {} : { is_active: true };
  return Program.find(filter).sort({ display_order: 1, name: 1 }).lean();
};

const listActiveProgramCodes = async () => {
  const programs = await listPrograms();
  return programs.map((program) => normalizeProgramCode(program.code));
};

const resolveProgramCode = async (value, { includeInactive = false } = {}) => {
  const program = await findProgram(value, { includeInactive });
  return program?.code || normalizeProgramCode(value);
};

const mapProgramToDepartmentTrack = async (value) => {
  const program = await findProgram(value, { includeInactive: true });
  return program?.department_track || null;
};

const getProgramsByVisibilityGroup = async (value, { includeInactive = true } = {}) => {
  const program = await findProgram(value, { includeInactive: true });
  if (!program?.visibility_group) return program ? [program.code] : [];
  await ensureDefaultPrograms();
  const filter = { visibility_group: program.visibility_group };
  if (!includeInactive) filter.is_active = true;
  const group = await Program.find(filter).select('code').lean();
  return group.map((item) => item.code);
};

module.exports = {
  DEFAULT_PROGRAMS,
  normalizeProgramCode,
  ensureDefaultPrograms,
  findProgram,
  listPrograms,
  listActiveProgramCodes,
  resolveProgramCode,
  mapProgramToDepartmentTrack,
  getProgramsByVisibilityGroup,
};