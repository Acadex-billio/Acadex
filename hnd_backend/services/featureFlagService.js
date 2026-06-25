const normalizeFlagValue = (value) => String(value || '').trim().toLowerCase();

const isEnabled = (flagName, fallback = false) => {
  const raw = process.env[flagName];
  if (raw == null || String(raw).trim() === '') return Boolean(fallback);
  const value = normalizeFlagValue(raw);
  return value === '1' || value === 'true' || value === 'yes' || value === 'on';
};

const getAllFlags = () => ({
  featureAuditLoggingEnabled: isEnabled('FEATURE_AUDIT_LOGGING_ENABLED', false),
  featureApiV1Enabled: isEnabled('FEATURE_API_V1_ENABLED', true),
  featureUserRateLimitEnabled: isEnabled('FEATURE_USER_RATE_LIMIT_ENABLED', false),
  featureStrictAuthCookies: isEnabled('FEATURE_STRICT_AUTH_COOKIES', false),
  featurePaymentReconciliationEnabled: isEnabled('FEATURE_PAYMENT_RECONCILIATION_ENABLED', false),
  featureSwaggerEnabled: isEnabled('FEATURE_SWAGGER_ENABLED', false),
  featureRedisCacheEnabled: isEnabled('FEATURE_REDIS_CACHE_ENABLED', false),
});

module.exports = {
  isEnabled,
  getAllFlags,
};
