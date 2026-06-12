require('dotenv').config({ path: require('path').resolve(__dirname, '..', '.env') });
const jwt = require('jsonwebtoken');

const API = `http://localhost:${process.env.PORT || 5000}`;

const waitForHealth = async (timeoutMs = 60000) => {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${API}/api/health`);
      if (res.ok) return true;
    } catch (e) {}
    await new Promise(r => setTimeout(r, 1000));
  }
  throw new Error('Health check timeout');
};

const run = async () => {
  console.log('[ci] Waiting for backend health...');
  await waitForHealth();
  console.log('[ci] Backend healthy. Generating test token.');

  const payload = {
    cand_id: 'CI_TEST_USER',
    email: 'ci-test@example.com',
    name: 'CI Test',
    dpt_id: null,
    role: 'candidate',
    program: 'HND',
    preferred_language: 'en',
    account_status: 'active',
    token_type: 'access'
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET);

  console.log('[ci] Calling /api/ads/active as candidate...');
  const res = await fetch(`${API}/api/ads/active`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.text();
  console.log('[ci] /api/ads/active status:', res.status);
  console.log('[ci] Response body:', body);
};

run().catch((err) => { console.error('[ci] Error:', err.message); process.exit(1); });
