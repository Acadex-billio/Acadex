export const maskCandidateId = (value) => {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const maskedLength = Math.min(5, raw.length);
  return `${'*'.repeat(maskedLength)}${raw.slice(maskedLength)}`;
};

export default maskCandidateId;
