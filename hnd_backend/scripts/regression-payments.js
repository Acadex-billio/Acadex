'use strict';

const baseUrl = String(process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const timeoutMs = Number.parseInt(String(process.env.SMOKE_TIMEOUT_MS || '10000'), 10);
const startupRetries = Number.parseInt(String(process.env.SMOKE_STARTUP_RETRIES || '30'), 10);
const startupDelayMs = Number.parseInt(String(process.env.SMOKE_STARTUP_DELAY_MS || '1000'), 10);
const authToken = String(process.env.SMOKE_AUTH_TOKEN || '').trim();

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });

    const text = await response.text();
    let body = {};
    try {
      body = text ? JSON.parse(text) : {};
    } catch (_) {
      body = { raw: text };
    }

    return { response, body };
  } finally {
    clearTimeout(timer);
  }
};

const waitForHealth = async () => {
  for (let i = 1; i <= startupRetries; i += 1) {
    try {
      const { response } = await fetchJson(`${baseUrl}/api/health`);
      if (response.status === 200 || response.status === 503) return;
    } catch (_) {
      // Keep retrying while the server starts.
    }
    await sleep(startupDelayMs);
  }
  throw new Error('Server did not become healthy within retry window');
};

const assertStatusIn = (actual, expected, label, details = '') => {
  if (!expected.includes(actual)) {
    throw new Error(`${label} expected status in [${expected.join(', ')}] but got ${actual}${details ? ` | ${details}` : ''}`);
  }
};

const tests = [
  {
    name: 'candidate plan checkout',
    method: 'POST',
    path: '/api/candidate/subscription/checkout',
    body: { planCode: 'pro', phoneNumber: '+237612345678', paymentMethod: 'momo' },
    expectedNoAuth: [401],
    expectedWithAuth: [400, 403, 404, 422, 500, 502],
  },
  {
    name: 'candidate material checkout',
    method: 'POST',
    path: '/api/candidate/payments/materials/checkout',
    body: { resourceType: 'report', resourceId: '507f1f77bcf86cd799439011', action: 'preview', phoneNumber: '+237612345678' },
    expectedNoAuth: [401],
    expectedWithAuth: [400, 403, 404, 422, 500, 502],
  },
  {
    name: 'candidate center checkout',
    method: 'POST',
    path: '/api/candidate/payments/centers/checkout',
    body: { action: 'join', roomId: '507f1f77bcf86cd799439011', phoneNumber: '+237612345678' },
    expectedNoAuth: [401],
    expectedWithAuth: [400, 403, 404, 422, 500, 502],
  },
  {
    name: 'candidate payment status refresh',
    method: 'GET',
    path: '/api/candidate/payments/507f1f77bcf86cd799439011/status',
    expectedNoAuth: [401],
    expectedWithAuth: [400, 403, 404],
  },
  {
    name: 'lecturer booking pay',
    method: 'POST',
    path: '/api/lecturers/bookings/507f1f77bcf86cd799439011/pay',
    body: { phone_number: '+237612345678' },
    expectedNoAuth: [401],
    expectedWithAuth: [400, 403, 404, 422, 500, 502],
  },
  {
    name: 'lecturer booking pay status refresh',
    method: 'GET',
    path: '/api/lecturers/bookings/507f1f77bcf86cd799439011/pay/status',
    expectedNoAuth: [401],
    expectedWithAuth: [400, 403, 404],
  },
  {
    name: 'lecturer invite pay',
    method: 'POST',
    path: '/api/lecturers/bookings/507f1f77bcf86cd799439011/video/invites/pay',
    body: { phone_number: '+237612345678' },
    expectedNoAuth: [401],
    expectedWithAuth: [400, 403, 404, 422, 500, 502],
  },
  {
    name: 'lecturer invite pay status refresh',
    method: 'GET',
    path: '/api/lecturers/bookings/507f1f77bcf86cd799439011/video/invites/pay/status',
    expectedNoAuth: [401],
    expectedWithAuth: [400, 403, 404],
  },
];

const run = async () => {
  await waitForHealth();

  const mode = authToken ? 'authenticated regression' : 'unauthenticated regression';
  const results = [];

  for (const t of tests) {
    const url = `${baseUrl}${t.path}`;
    const payload = t.body ? JSON.stringify(t.body) : undefined;
    const { response, body } = await fetchJson(url, {
      method: t.method,
      ...(payload ? { body: payload } : {}),
    });

    const expected = authToken ? t.expectedWithAuth : t.expectedNoAuth;
    assertStatusIn(response.status, expected, t.name, body?.message ? `message=${body.message}` : '');

    results.push({
      test: t.name,
      method: t.method,
      path: t.path,
      status: response.status,
      message: body?.message || null,
    });
  }

  console.log('[Regression:Payments] Passed:', {
    mode,
    baseUrl,
    total: results.length,
    statuses: results.map((r) => ({ test: r.test, status: r.status })),
  });
};

run().catch((err) => {
  console.error('[Regression:Payments] Failed:', err.message);
  process.exit(1);
});
