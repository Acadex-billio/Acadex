'use strict';

const { spawnSync } = require('child_process');
const path = require('path');

const root = path.resolve(__dirname, '..');

const criticalFiles = [
  'server.js',
  'Routes/authRoutes.js',
  'Routes/adminRoutes.js',
  'Routes/candidateRoutes.js',
  'controllers/reportController.js',
  'controllers/presentationController.js',
  'middlewares/jwtAuth.js',
  'utils/securityConfig.js',
  'services/libreOfficeQueue.js',
];

const failures = [];

for (const relativeFile of criticalFiles) {
  const filePath = path.join(root, relativeFile);
  const checked = spawnSync(process.execPath, ['--check', filePath], { stdio: 'pipe' });
  if (checked.status !== 0) {
    failures.push({ file: relativeFile, stderr: String(checked.stderr || '').trim() });
  }
}

if (failures.length > 0) {
  console.error('[Smoke:Code] Syntax check failed for critical backend files.');
  for (const failure of failures) {
    console.error(`- ${failure.file}`);
    if (failure.stderr) console.error(failure.stderr);
  }
  process.exit(1);
}

console.log('[Smoke:Code] All critical backend files passed syntax check.');
