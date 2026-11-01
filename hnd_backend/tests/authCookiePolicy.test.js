const test = require('node:test');
const assert = require('node:assert/strict');
const { getAuthCookieSameSite } = require('../utils/authCookiePolicy');

const withEnvironment = (values, run) => {
  const originalValues = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]])
  );
  Object.assign(process.env, values);

  try {
    run();
  } finally {
    for (const [key, value] of Object.entries(originalValues)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
};

test('auth cookie policy defaults to lax in development and none in production', () => {
  withEnvironment({ NODE_ENV: 'development', AUTH_COOKIE_SAME_SITE: '', FEATURE_STRICT_AUTH_COOKIES: '' }, () => {
    assert.equal(getAuthCookieSameSite(), 'lax');
  });
  withEnvironment({ NODE_ENV: 'production', AUTH_COOKIE_SAME_SITE: '', FEATURE_STRICT_AUTH_COOKIES: '' }, () => {
    assert.equal(getAuthCookieSameSite(), 'none');
  });
});

test('auth cookie policy honors supported overrides and strict-cookie feature flag', () => {
  withEnvironment({ NODE_ENV: 'production', AUTH_COOKIE_SAME_SITE: 'lax', FEATURE_STRICT_AUTH_COOKIES: 'true' }, () => {
    assert.equal(getAuthCookieSameSite(), 'lax');
  });
  withEnvironment({ NODE_ENV: 'production', AUTH_COOKIE_SAME_SITE: '', FEATURE_STRICT_AUTH_COOKIES: 'true' }, () => {
    assert.equal(getAuthCookieSameSite(), 'strict');
  });
});

test('auth cookie policy rejects unsupported overrides', () => {
  withEnvironment({ AUTH_COOKIE_SAME_SITE: 'invalid' }, () => {
    assert.throws(getAuthCookieSameSite, /AUTH_COOKIE_SAME_SITE must be one of/);
  });
});
