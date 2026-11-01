const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAccountRateLimit, createRateLimit } = require('../middlewares/inputValidation');

const withServer = async (middleware, run) => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.post('/login', middleware, (req, res) => {
    res.status(req.body.password === 'valid' ? 200 : 401).json({ success: req.body.password === 'valid' });
  });

  const server = app.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
  }
};

const postLogin = (url, email, password = 'invalid', ip = '198.51.100.10') => fetch(`${url}/login`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Forwarded-For': ip,
  },
  body: JSON.stringify({ email, password }),
});

test('login account limits isolate accounts sharing an IP and isolate the same account across IPs', async () => {
  const limiter = createAccountRateLimit({
    scope: 'test_login',
    windowMs: 60_000,
    max: 1,
    message: 'limited',
  });

  await withServer(limiter, async (url) => {
    assert.equal((await postLogin(url, 'first@example.com')).status, 401);
    assert.equal((await postLogin(url, 'second@example.com')).status, 401);
    assert.equal((await postLogin(url, 'FIRST@example.com')).status, 429);
    assert.equal((await postLogin(url, 'first@example.com', 'invalid', '198.51.100.11')).status, 401);
  });
});

test('successful logins are excluded from the failed-attempt account limit', async () => {
  const limiter = createAccountRateLimit({
    scope: 'test_login_success',
    windowMs: 60_000,
    max: 1,
    message: 'limited',
  });

  await withServer(limiter, async (url) => {
    assert.equal((await postLogin(url, 'user@example.com', 'valid')).status, 200);
    assert.equal((await postLogin(url, 'user@example.com')).status, 401);
  });
});

test('the per-IP failure ceiling remains active across accounts', async () => {
  const limiter = createRateLimit(60_000, 2, 'network limited', { skipSuccessfulRequests: true });

  await withServer(limiter, async (url) => {
    assert.equal((await postLogin(url, 'first@example.com')).status, 401);
    assert.equal((await postLogin(url, 'second@example.com')).status, 401);
    const limited = await postLogin(url, 'third@example.com');
    assert.equal(limited.status, 429);
    assert.equal((await limited.json()).message, 'network limited');
  });
});
