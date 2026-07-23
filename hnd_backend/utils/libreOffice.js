const fs = require('fs');
const { spawnSync } = require('child_process');

const KNOWN_LO_PATHS = [
  String(process.env.LIBREOFFICE_PATH || '').trim(),
  'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
  'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe',
  '/usr/bin/soffice',
  '/usr/bin/libreoffice',
  '/usr/lib/libreoffice/program/soffice',
  '/usr/lib/libreoffice/program/libreoffice',
  '/snap/bin/soffice',
  '/snap/bin/libreoffice',
  'libreoffice',
  'soffice',
].filter(Boolean);

const hasExecutable = (candidate) => {
  if (!candidate) return false;

  if (candidate.includes('\\') || candidate.startsWith('/')) {
    return fs.existsSync(candidate);
  }

  const result = spawnSync(process.platform === 'win32' ? 'where' : 'which', [candidate], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  return result.status === 0 && Boolean(String(result.stdout || '').trim());
};

const getLibreOfficeCommandCandidates = () => {
  const seen = new Set();
  const candidates = [];

  for (const candidate of KNOWN_LO_PATHS) {
    if (!candidate || seen.has(candidate)) continue;
    seen.add(candidate);
    if (hasExecutable(candidate)) {
      candidates.push(candidate);
    }
  }

  return candidates;
};

const resolveLibreOfficeCommand = () => getLibreOfficeCommandCandidates()[0] || null;

module.exports = {
  getLibreOfficeCommandCandidates,
  resolveLibreOfficeCommand,
  hasExecutable,
};
