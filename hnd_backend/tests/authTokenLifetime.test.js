const test = require('node:test');
const assert = require('node:assert/strict');
const {
  REFRESH_TOKEN_DEFAULT_MAX_AGE,
  REFRESH_TOKEN_REMEMBER_ME_MAX_AGE,
  getRefreshTokenCookieMaxAge,
} = require('../constants/authConstants');

test('candidate refresh cookies use the 30-day remember-me lifetime automatically', () => {
  assert.equal(getRefreshTokenCookieMaxAge('candidate'), REFRESH_TOKEN_REMEMBER_ME_MAX_AGE);
  assert.equal(getRefreshTokenCookieMaxAge('student'), REFRESH_TOKEN_REMEMBER_ME_MAX_AGE);
});

test('non-candidate refresh cookies retain the shorter default unless remember-me is requested', () => {
  assert.equal(getRefreshTokenCookieMaxAge('lecturer'), REFRESH_TOKEN_DEFAULT_MAX_AGE);
  assert.equal(getRefreshTokenCookieMaxAge('admin', true), REFRESH_TOKEN_REMEMBER_ME_MAX_AGE);
});
