const logger = require('./logger');
const { isEnabled } = require('../services/featureFlagService');

const toVersionedBasePath = (legacyBasePath) => {
  const normalized = String(legacyBasePath || '').trim();
  if (!normalized.startsWith('/api')) return normalized;
  if (normalized === '/api') return '/api/v1';
  return normalized.replace(/^\/api(?=\/|$)/, '/api/v1');
};

const mountVersionCompatibleRoute = (app, legacyBasePath, router) => {
  const legacyPath = String(legacyBasePath || '').trim();
  if (!legacyPath || typeof app?.use !== 'function') return;

  app.use(legacyPath, router);

  if (!isEnabled('FEATURE_API_V1_ENABLED', true)) {
    return;
  }

  const versionedPath = toVersionedBasePath(legacyPath);
  if (versionedPath && versionedPath !== legacyPath) {
    app.use(versionedPath, router);
    logger.info('api.version.compat.mount', {
      legacyPath,
      versionedPath,
    });
  }
};

module.exports = {
  mountVersionCompatibleRoute,
  toVersionedBasePath,
};
