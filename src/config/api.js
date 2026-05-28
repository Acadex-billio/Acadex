/**
 * API configuration - use environment variable for base URL
 */
const inferBaseUrl = () => {
  try {
    const host = window.location.hostname;
    if (!host) return 'http://localhost:5000';
    return `http://${host}:5000`;
  } catch (_) {
    return 'http://localhost:5000';
  }
};

const normalizeApiBaseUrl = (rawUrl) => {
  const fallback = 'https://hnd-platform-backend.onrender.com/api';
  const value = String(rawUrl || '').trim();
  if (!value) return fallback;

  // Backward-compatibility: rewrite legacy host if still present in env.
  const normalizedHost = value.replace(
    /^https:\/\/hnd-platform\.onrender\.com(?=\/|$)/i,
    'https://hnd-platform-backend.onrender.com'
  );

  return /\/api\/?$/i.test(normalizedHost)
    ? normalizedHost.replace(/\/$/, '')
    : `${normalizedHost.replace(/\/$/, '')}/api`;
};

const isLocalhost =
  typeof window !== 'undefined' &&
  (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

export const API_BASE_URL = isLocalhost
  ? inferBaseUrl()
  : normalizeApiBaseUrl(process.env.REACT_APP_API_URL);

export const API_BASE_URL_NORMALIZED = /\/api\/?$/i.test(String(API_BASE_URL || ''))
  ? String(API_BASE_URL).replace(/\/$/, '')
  : `${String(API_BASE_URL).replace(/\/$/, '')}/api`;
