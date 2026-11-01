const { isEnabled } = require('../services/featureFlagService');

const VALID_SAME_SITE_VALUES = new Set(['lax', 'strict', 'none']);

const getAuthCookieSameSite = () => {
  const configuredValue = String(process.env.AUTH_COOKIE_SAME_SITE || '').trim().toLowerCase();
  if (configuredValue) {
    if (!VALID_SAME_SITE_VALUES.has(configuredValue)) {
      throw new Error('AUTH_COOKIE_SAME_SITE must be one of: lax, strict, none');
    }
    return configuredValue;
  }

  if (String(process.env.NODE_ENV || '').toLowerCase() !== 'production') return 'lax';
  return isEnabled('FEATURE_STRICT_AUTH_COOKIES', false) ? 'strict' : 'none';
};

module.exports = { getAuthCookieSameSite };
