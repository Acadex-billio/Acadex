'use strict';

const {
  getProgramsByVisibilityGroup,
  mapProgramToDepartmentTrack,
  normalizeProgramCode,
} = require('./programCatalogService');

const getCandidateMaterialProgramCodes = async (program) => (
  getProgramsByVisibilityGroup(normalizeProgramCode(program) || 'HND')
);

const getCandidateMaterialProgramFilter = (programCodes) => ({
  program: { $in: programCodes },
});

const isMaterialVisibleToCandidate = (material, programCodes) => (
  programCodes.includes(normalizeProgramCode(material?.program))
);

const getCandidateMaterialDepartmentTracks = async (program) => {
  const programCodes = await getCandidateMaterialProgramCodes(program);
  const tracks = await Promise.all(programCodes.map(mapProgramToDepartmentTrack));
  return [...new Set(tracks.filter(Boolean))];
};

module.exports = {
  getCandidateMaterialProgramCodes,
  getCandidateMaterialProgramFilter,
  isMaterialVisibleToCandidate,
  getCandidateMaterialDepartmentTracks,
};
