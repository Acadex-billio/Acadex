// Lightweight in-memory cache middleware for short-lived GET responses
// Not suitable for large-scale caching; intended for free-tier quick wins.
const cacheStore = new Map();

function cacheMiddleware(ttlMs = 60000) {
  return (req, res, next) => {
    if (req.method !== 'GET') return next();

    const key = req.originalUrl || req.url;
    const entry = cacheStore.get(key);
    const now = Date.now();
    if (entry && entry.expiresAt > now) {
      res.set(Object.assign({}, entry.headers, { 'X-Cache': 'HIT' }));
      return res.status(200).send(entry.body);
    }

    // Capture send to populate cache
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      try {
        const headers = {};
        // capture a couple of headers that might be useful
        ['content-type', 'cache-control'].forEach((h) => {
          const v = res.getHeader && res.getHeader(h);
          if (v) headers[h] = v;
        });
        cacheStore.set(key, { body, headers, expiresAt: Date.now() + ttlMs });
        res.set(Object.assign({}, headers, { 'X-Cache': 'MISS' }));
      } catch (e) {
        // ignore cache errors
      }
      return originalSend(body);
    };

    return next();
  };
}

module.exports = cacheMiddleware;
