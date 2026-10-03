const test = require('node:test');
const assert = require('node:assert/strict');

const { csrfProtection } = require('../middlewares/csrfProtection');

const createResponse = () => ({
  headers: {},
  cookies: {},
  statusCode: null,
  payload: null,
  setHeader(name, value) {
    this.headers[name.toLowerCase()] = value;
  },
  cookie(name, value) {
    this.cookies[name] = value;
  },
  status(code) {
    this.statusCode = code;
    return this;
  },
  json(payload) {
    this.payload = payload;
    return this;
  },
});

const createRequest = ({ method = 'POST', cookie = '', authorization = '', csrfToken = '' } = {}) => ({
  method,
  path: '/admin/billing/subscriptions',
  headers: { cookie, authorization },
  get(name) {
    return name.toLowerCase() === 'x-csrf-token' ? csrfToken : '';
  },
});

test('Bearer-authenticated writes do not require a CSRF token', () => {
  const req = createRequest({ authorization: 'Bearer signed-token' });
  const res = createResponse();
  let passed = false;

  csrfProtection(req, res, () => { passed = true; });

  assert.equal(passed, true);
  assert.equal(res.headers['x-csrf-token'], res.cookies.csrf_token);
});

test('cookie-authenticated writes reject missing or mismatched CSRF tokens', () => {
  const req = createRequest({ cookie: 'access_token=session-token' });
  const res = createResponse();

  csrfProtection(req, res, () => assert.fail('request should be rejected'));

  assert.equal(res.statusCode, 403);
  assert.equal(res.payload.code, 'CSRF_TOKEN_INVALID');
  assert.equal(res.headers['x-csrf-token'], res.cookies.csrf_token);
});

test('cookie-authenticated writes accept a matching CSRF cookie and header', () => {
  const csrfToken = 'matching-csrf-token';
  const req = createRequest({
    cookie: `access_token=session-token; csrf_token=${csrfToken}`,
    csrfToken,
  });
  const res = createResponse();
  let passed = false;

  csrfProtection(req, res, () => { passed = true; });

  assert.equal(passed, true);
  assert.equal(res.headers['x-csrf-token'], csrfToken);
});