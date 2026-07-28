/**
 * Axios Configuration with JWT Interceptor
 * Automatically adds JWT token to all requests
 */

import axios from 'axios';
import authService from './authService';

const isVerboseLoggingEnabled =
  String(process.env.REACT_APP_DEBUG_LOGS || '').trim().toLowerCase() === 'true';
const logDebug = (...args) => {
  if (isVerboseLoggingEnabled) {
    console.log(...args);
  }
};

const normalizeApiError = (error) => {
  const status = error?.response?.status || 0;
  const payload = error?.response?.data || {};
  const message = payload?.message || payload?.error || error?.message || 'Request failed';
  return {
    status,
    message,
    code: payload?.code || null,
    details: payload?.details || payload?.provider_error || null,
    requestUrl: error?.config?.url || null,
  };
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

const isTimeoutError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return (
    error?.code === 'ECONNABORTED' ||
    message.includes('timeout') ||
    error?.response?.status === 408 ||
    error?.response?.status === 504
  );
};

const getLoginRedirectPath = () => {
  if (window.location.pathname.startsWith('/admin')) {
    return '/login?from=admin';
  }
  if (window.location.pathname.startsWith('/candidate')) {
    return '/login?from=candidate';
  }
  return '/login';
};

const logoutAndRedirect = (message) => {
  authService.removeToken();
  if (window.authDispatch) {
    window.authDispatch({ type: 'LOGOUT' });
  }
  if (typeof window.showToast === 'function') {
    window.showToast(message || 'Your session has expired. Please log in again.', 'error');
  }
  window.location.replace(getLoginRedirectPath());
};

// Base API configuration - prioritize localhost in development
const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
const API_BASE_URL = isLocalhost 
  ? 'http://localhost:5000/api' 
  : normalizeApiBaseUrl(process.env.REACT_APP_API_URL);

logDebug('[API] Using base URL:', API_BASE_URL);
logDebug('[API] Environment:', process.env.NODE_ENV || 'development');
logDebug('[API] Hostname:', window.location.hostname);
logDebug('[API] Is Localhost:', isLocalhost);

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Request interceptor - Add JWT token to all requests
api.interceptors.request.use(
  (config) => {
    const token = authService.getToken();
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
      logDebug('[API] Request:', {
        method: config.method?.toUpperCase(),
        url: config.url,
      });
    } else {
      logDebug('[API] Request without token:', {
        method: config.method?.toUpperCase(),
        url: config.url,
      });
    }
    return config;
  },
  (error) => {
    logDebug('[API] request error', normalizeApiError(error));
    return Promise.reject(error);
  }
);

// Dedicated API client for silent auth health checks (this client has no interceptors to avoid recursion)
const authCheckApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

let authCheckPromise = null;

const performAuthCheck = async () => {
  if (authCheckPromise) return authCheckPromise;
  const token = authService.getToken();
  if (!token) {
    authCheckPromise = Promise.reject(new Error('No token available'));
    authCheckPromise.finally(() => { authCheckPromise = null; });
    return authCheckPromise;
  }

  authCheckPromise = authCheckApi.get('/auth/me', {
    headers: { Authorization: `Bearer ${token}` }
  }).finally(() => {
    authCheckPromise = null;
  });

  return authCheckPromise;
};

// Response interceptor - Handle token expiry
api.interceptors.response.use(
  (response) => {
    logDebug('[API] Response:', {
      status: response.status,
      url: response.config.url,
    });
    return response;
  },
  async (error) => {
    const normalizedError = normalizeApiError(error);
    error.normalized = normalizedError;
    logDebug('[API] response error', normalizedError);

    // Handle 401 Unauthorized - token expired/invalid
    if (error.response?.status === 401) {
      logDebug('[API] 401 Unauthorized detected at', error.config?.url);

      const url = error.config?.url || '';
      // Never auto-clear token on login endpoint 401 (invalid credentials call)
      if (url.includes('/auth/login')) {
        return Promise.reject(error);
      }

      try {
        if (url.includes('/auth/me')) {
          // Avoid recursion and immediate re-check for /auth/me failures
          logoutAndRedirect('Your session has expired. Please log in again.');
          return Promise.reject(error);
        }

        // Verify token still valid with /auth/me before logout; no interceptors on authCheckApi
        const check = await performAuthCheck();

        if (check?.data?.authenticated) {
          logDebug('[API] Token valid via /auth/me; skipping logout');
          if (typeof window.showToast === 'function') {
            window.showToast('Access denied for this resource. Please contact the administrator.', 'warning');
          }
          return Promise.reject(error);
        }
      } catch (meError) {
        if (meError.response?.status === 401) {
          logDebug('[API] /auth/me returned 401, clearing auth state');
          logoutAndRedirect('Your session has expired. Please log in again.');
        } else if (meError.response?.status === 429) {
          logDebug('[API] /auth/me rate limited; leaving token intact');
          if (typeof window.showToast === 'function') {
            window.showToast('Too many auth checks too quickly; please wait a few seconds.', 'warning');
          }
        } else if (isTimeoutError(meError)) {
          logDebug('[API] /auth/me timed out, forcing login');
          logoutAndRedirect('Session validation timed out. Please log in again.');
        } else {
          logDebug('[API] /auth/me check failed without 401; leaving token intact');
        }
      }

      // do not auto-logout for single 401 until /auth/me confirms token invalid
      return Promise.reject(error);
    }

    if (isTimeoutError(error)) {
      logDebug('[API] Request timed out, forcing login redirect');
      logoutAndRedirect('Request timed out. Please log in again.');
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default api;

