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
  const fallback = 'https://your-railway-backend-url/api';
  const value = String(rawUrl || '').trim();
  if (!value) return fallback;

  const trimmed = value.replace(/\/+$/, '');
  return /\/api\/?$/i.test(trimmed)
    ? trimmed
    : `${trimmed}/api`;
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
