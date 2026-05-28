const https = require('https');
const crypto = require('crypto');

const GOOGLE_API_ENDPOINT = 'https://www.googleapis.com/customsearch/v1';

function fingerprintSecret(secret) {
  if (!secret) return '';
  try {
    return crypto.createHash('sha256').update(String(secret)).digest('hex').slice(0, 12);
  } catch (_) {
    return '';
  }
}

function redactUrlSecrets(rawUrl) {
  try {
    const u = new URL(String(rawUrl || ''));
    if (u.searchParams.has('key')) u.searchParams.set('key', '[REDACTED]');
    return u.toString();
  } catch (_) {
    return '';
  }
}

function extractGoogleErrorDetails(err) {
  const status = err?.status || 500;
  const body = err?.body;
  const message = err?.message || 'unknown error';
  const error = body?.error;
  const errors = Array.isArray(error?.errors) ? error.errors : [];
  const reason = errors?.[0]?.reason;
  const domain = errors?.[0]?.domain;
  const location = errors?.[0]?.location;
  const locationType = errors?.[0]?.locationType;

  return {
    status,
    reason,
    domain,
    location,
    locationType,
    message,
    googleError: error,
  };
}

function getDomain(u) {
  try {
    const url = new URL(u);
    return url.hostname;
  } catch (_) {
    return '';
  }
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data || '{}');
            if (res.statusCode && res.statusCode >= 400) {
              const err = new Error(parsed?.error?.message || 'Web search failed');
              err.status = res.statusCode;
              err.body = parsed;
              err.requestUrl = url;
              return reject(err);
            }
            resolve(parsed);
          } catch (e) {
            const err = new Error('Invalid response from web search');
            err.status = res.statusCode || 500;
            err.requestUrl = url;
            reject(err);
          }
        });
      })
      .on('error', (err) => reject(err));
  });
}

exports.search = async (req, res) => {
  try {
    const apiKey = String(process.env.GOOGLE_CSE_API_KEY || '').trim();
    const cx = String(process.env.GOOGLE_CSE_SEARCH_ENGINE_ID || '').trim();

    const configured = Boolean(apiKey && cx);

    if (!apiKey || !cx) {
      console.warn('[WebSearch] Not configured. Missing GOOGLE_CSE_API_KEY or GOOGLE_CSE_SEARCH_ENGINE_ID');
      return res.status(500).json({
        success: false,
        message: 'Web search is not configured. Set GOOGLE_CSE_API_KEY and GOOGLE_CSE_SEARCH_ENGINE_ID in the backend environment.',
      });
    }

    const q = String(req.query.q || '').trim();
    if (!q) return res.status(400).json({ success: false, message: 'Missing query' });

    const num = Math.max(1, Math.min(5, Number.parseInt(String(req.query.num || '5'), 10) || 5));

    const url = new URL(GOOGLE_API_ENDPOINT);
    url.searchParams.set('q', q);
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);
    url.searchParams.set('num', String(num));

    const keyFp = fingerprintSecret(apiKey);
    console.log(`[WebSearch] Request start | configured=${configured} | keyFp=${keyFp} | cx=${cx} | q="${q}" | num=${num}`);
    const json = await fetchJson(url.toString());
    const items = Array.isArray(json?.items) ? json.items : [];

    const results = items
      .map((it) => ({
        title: String(it?.title || '').trim(),
        snippet: String(it?.snippet || '').trim(),
        link: String(it?.link || '').trim(),
        domain: getDomain(it?.link),
      }))
      .filter((r) => r.link);

    return res.json({
      success: true,
      query: q,
      results,
    });
  } catch (err) {
    const details = extractGoogleErrorDetails(err);
    const status = details.status;
    const safeUrl = redactUrlSecrets(err?.requestUrl);
    console.warn(
      `[WebSearch] Request failed | status=${details.status} | reason=${details.reason || 'n/a'} | domain=${details.domain || 'n/a'} | location=${details.location || 'n/a'} | message=${details.message}`
    );
    if (safeUrl) console.warn(`[WebSearch] Request URL: ${safeUrl}`);
    if (err?.body) {
      try {
        console.warn('[WebSearch] Google error payload:', JSON.stringify(details.googleError || err.body, null, 2));
      } catch (_) {
        console.warn('[WebSearch] Google error payload: [unserializable]');
      }
    }
    return res.status(status).json({
      success: false,
      message: err?.message || 'Web search failed',
    });
  }
};

exports.health = async (req, res) => {
  try {
    const apiKey = String(process.env.GOOGLE_CSE_API_KEY || '').trim();
    const cx = String(process.env.GOOGLE_CSE_SEARCH_ENGINE_ID || '').trim();

    const configured = Boolean(apiKey && cx);
    const probe = String(req.query.probe || '').trim() === '1';

    const keyFp = fingerprintSecret(apiKey);
    console.log(`[WebSearch] Health check | configured=${configured} | keyFp=${keyFp} | cx=${cx} | probe=${probe}`);

    if (!configured) {
      return res.json({
        success: true,
        configured: false,
        connected: false,
        message: 'Missing GOOGLE_CSE_API_KEY or GOOGLE_CSE_SEARCH_ENGINE_ID',
      });
    }

    if (!probe) {
      return res.json({ success: true, configured: true, connected: null, message: 'Configured' });
    }

    const url = new URL(GOOGLE_API_ENDPOINT);
    url.searchParams.set('q', 'test');
    url.searchParams.set('key', apiKey);
    url.searchParams.set('cx', cx);
    url.searchParams.set('num', '1');

    const json = await fetchJson(url.toString());
    const ok = Array.isArray(json?.items);

    console.log(`[WebSearch] Health probe result | connected=${ok}`);

    return res.json({ success: true, configured: true, connected: ok, message: ok ? 'Connected' : 'No items returned' });
  } catch (err) {
    const details = extractGoogleErrorDetails(err);
    console.warn(
      `[WebSearch] Health probe failed | status=${details.status} | reason=${details.reason || 'n/a'} | domain=${details.domain || 'n/a'} | location=${details.location || 'n/a'} | message=${details.message}`
    );
    if (err?.body) {
      try {
        console.warn('[WebSearch] Health probe Google error payload:', JSON.stringify(details.googleError || err.body, null, 2));
      } catch (_) {
        console.warn('[WebSearch] Health probe Google error payload: [unserializable]');
      }
    }
    return res.json({
      success: true,
      configured: true,
      connected: false,
      message: err?.message || 'Probe failed',
    });
  }
};
