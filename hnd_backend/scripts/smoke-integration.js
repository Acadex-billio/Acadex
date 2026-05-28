'use strict';

const baseUrl = String(process.env.SMOKE_BASE_URL || 'http://127.0.0.1:5000').replace(/\/$/, '');
const timeoutMs = Number.parseInt(String(process.env.SMOKE_TIMEOUT_MS || '10000'), 10);
const startupRetries = Number.parseInt(String(process.env.SMOKE_STARTUP_RETRIES || '30'), 10);
const startupDelayMs = Number.parseInt(String(process.env.SMOKE_STARTUP_DELAY_MS || '1000'), 10);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchJson = async (url, options = {}) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
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

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

const run = async () => {
  await waitForHealth();

  const root = await fetch(`${baseUrl}/`);
  assert(root.ok, 'GET / should return 200');

  const { response: healthRes, body: healthBody } = await fetchJson(`${baseUrl}/api/health`);
  assert([200, 503].includes(healthRes.status), '/api/health must return 200 or 503');
  assert(healthBody && typeof healthBody === 'object', '/api/health must return JSON object');
  assert(healthBody.readiness && typeof healthBody.readiness === 'object', '/api/health must include readiness object');

  const readinessKeys = ['storage', 'email', 'payment', 'ai'];
  for (const key of readinessKeys) {
    assert(typeof healthBody.readiness[key] === 'boolean', `readiness.${key} must be boolean`);
  }

  const { response: meRes } = await fetchJson(`${baseUrl}/api/auth/me`);
  assert(meRes.status === 401, '/api/auth/me without token must return 401');

  console.log('[Smoke:Integration] Passed:', {
    baseUrl,
    healthStatus: healthRes.status,
    readiness: healthBody.readiness,
  });
};

run().catch((err) => {
  console.error('[Smoke:Integration] Failed:', err.message);
  process.exit(1);
});
