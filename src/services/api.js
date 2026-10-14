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

export const getCookieValue = (name) => {
  if (typeof document === 'undefined') return '';
  const prefix = `${name}=`;
  const cookie = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : '';
};

let csrfTokenFromResponse = '';

export const getCsrfToken = () => csrfTokenFromResponse || getCookieValue('csrf_token');
export const cacheCsrfToken = (token) => {
  const normalizedToken = String(token || '').trim();
  if (normalizedToken) csrfTokenFromResponse = normalizedToken;
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
    error?.code === 'ERR_NETWORK' ||
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

const logoutAndRedirect = (message, { redirect = true } = {}) => {
  const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
  authService.removeToken();
  if (window.authDispatch) {
    window.authDispatch({ type: 'LOGOUT' });
  }
  if (!redirect || currentPath.startsWith('/login')) return;
  if (typeof window.showToast === 'function') {
    window.showToast(message || 'Your session has expired. Please log in again.', 'error');
  }
  window.location.replace(getLoginRedirectPath());
};

export const handleAuthSessionExpired = (message, options) => logoutAndRedirect(message, options);

const emitValidationEvent = (error) => {
  if (typeof window === 'undefined' || !window.dispatchEvent) return;
  const payload = error?.response?.data || error?.normalized || {};
  window.dispatchEvent(new CustomEvent('api-validation-error', {
    detail: {
      status: error?.response?.status || 400,
      message: payload?.message || 'Please review the highlighted fields and try again.',
      errors: payload?.errors || payload?.details || null,
    },
  }));
};

const showApiErrorToast = (error, fallbackMessage = 'Something went wrong. Please try again.') => {
  if (typeof window.showToast !== 'function') return;
  const status = error?.response?.status || error?.statusCode || 0;
  const payload = error?.response?.data || {};
  const message = payload?.message || error?.message || fallbackMessage;

  if (status === 401) {
    window.showToast(message || 'Authentication is required to continue. Please sign in.', 'error');
    return;
  }

  if (status === 400) {
    window.showToast(message || 'Please review the highlighted fields and try again.', 'warning');
    return;
  }

  if (status === 403) {
    window.showToast('You do not have permission to perform this action.', 'warning');
    return;
  }

  if (status === 404) {
    window.showToast('The requested page was not found.', 'warning');
    return;
  }

  if (status === 500) {
    window.showToast('Something went wrong on the server. Please try again in a moment.', 'error');
    return;
  }

  if (isTimeoutError(error)) {
    window.showToast('The connection timed out. Check your internet connection and try again.', 'warning');
    return;
  }

  window.showToast(message || fallbackMessage, 'error');
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
  withCredentials: true,
});

const authCheckApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
});

// Authenticated API calls use HttpOnly cookies; CSRF headers protect mutations.
api.interceptors.request.use(
  (config) => {
    const method = String(config.method || 'get').toUpperCase();
    const csrfToken = getCsrfToken();
    if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
      config.headers['X-CSRF-Token'] = csrfToken;
    }
    logDebug('[API] Cookie-authenticated request:', {
      method: config.method?.toUpperCase(),
      url: config.url,
    });
    return config;
  },
  (error) => {
    logDebug('[API] request error', normalizeApiError(error));
    return Promise.reject(error);
  }
);

// Keep auth refresh/check requests separate to prevent interceptor recursion.
const authRefreshApi = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  withCredentials: true,
});

authRefreshApi.interceptors.request.use((config) => {
  const method = String(config.method || 'get').toUpperCase();
  const csrfToken = getCsrfToken();
  if (csrfToken && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    config.headers['X-CSRF-Token'] = csrfToken;
  }
  return config;
});

authRefreshApi.interceptors.response.use(
  (response) => {
    const responseCsrfToken = String(response.headers?.['x-csrf-token'] || '').trim();
    if (responseCsrfToken) cacheCsrfToken(responseCsrfToken);
    return response;
  },
  async (error) => {
    const responseCsrfToken = String(error.response?.headers?.['x-csrf-token'] || '').trim();
    if (
      error.response?.status === 403 &&
      error.response?.data?.code === 'CSRF_TOKEN_INVALID' &&
      responseCsrfToken &&
      !error.config?._csrfRetry
    ) {
      cacheCsrfToken(responseCsrfToken);
      error.config._csrfRetry = true;
      error.config.headers = error.config.headers || {};
      error.config.headers['X-CSRF-Token'] = responseCsrfToken;
      return authRefreshApi.request(error.config);
    }
    return Promise.reject(error);
  }
);

let authRefreshPromise = null;
let authCheckPromise = null;

export const refreshAuthSession = async () => {
  if (authRefreshPromise) return authRefreshPromise;
  authRefreshPromise = authRefreshApi.post('/auth/refresh').finally(() => {
    authRefreshPromise = null;
  });
  return authRefreshPromise;
};

export const checkCookieAuthSession = async () => {
  if (authCheckPromise) return authCheckPromise;
  authCheckPromise = authCheckApi.get('/auth/me').finally(() => {
    authCheckPromise = null;
  });
  return authCheckPromise;
};

// Response interceptor - Handle token expiry
api.interceptors.response.use(
  (response) => {
    const responseCsrfToken = String(response.headers?.['x-csrf-token'] || '').trim();
    if (responseCsrfToken) cacheCsrfToken(responseCsrfToken);
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

    if (
      error.response?.status === 403 &&
      error.response?.data?.code === 'CSRF_TOKEN_INVALID' &&
      !error.config?._csrfRetry
    ) {
      const responseCsrfToken = String(error.response.headers?.['x-csrf-token'] || '').trim();
      if (responseCsrfToken) {
        cacheCsrfToken(responseCsrfToken);
        error.config._csrfRetry = true;
        error.config.headers = error.config.headers || {};
        error.config.headers['X-CSRF-Token'] = responseCsrfToken;
        return api.request(error.config);
      }
    }

    // Renew cookie sessions before treating an API 401 as a signed-out state.
    if (error.response?.status === 401) {
      logDebug('[API] 401 Unauthorized detected at', error.config?.url);

      const url = error.config?.url || '';
      if (url.includes('/auth/login') || url.includes('/auth/refresh')) {
        return Promise.reject(error);
      }

      if (error.config?._authRefreshRetried) {
        if (url.includes('/auth/me')) {
          logoutAndRedirect(null, { redirect: false });
        } else {
          try {
            const sessionCheck = await checkCookieAuthSession();
            if (sessionCheck.data?.authenticated) {
              showApiErrorToast(error, 'You are not authorized to perform this action.');
            } else {
              logoutAndRedirect('Your session has expired. Please log in again.');
            }
          } catch (sessionError) {
            if (sessionError.response?.status === 401) {
              logoutAndRedirect('Your session has expired. Please log in again.');
            } else {
              showApiErrorToast(sessionError, 'Could not verify your session. Check your connection and try again.');
            }
          }
        }
        return Promise.reject(error);
      }

      try {
        await refreshAuthSession();
        error.config._authRefreshRetried = true;
        return api.request(error.config);
      } catch (refreshError) {
        if (refreshError.response?.status === 401) {
          if (url.includes('/auth/me')) {
            logoutAndRedirect(null, { redirect: false });
          } else {
            try {
              const sessionCheck = await checkCookieAuthSession();
              if (sessionCheck.data?.authenticated) {
                showApiErrorToast(error, 'You are not authorized to perform this action.');
              } else {
                logoutAndRedirect('Your session has expired. Please log in again.');
              }
            } catch (sessionError) {
              if (sessionError.response?.status === 401) {
                logoutAndRedirect('Your session has expired. Please log in again.');
              } else {
                showApiErrorToast(sessionError, 'Could not verify your session. Check your connection and try again.');
              }
            }
          }
        } else {
          logDebug('[API] Refresh failed without invalidating the session', normalizeApiError(refreshError));
          showApiErrorToast(refreshError, 'Could not refresh your session. Check your connection and try again.');
        }
        return Promise.reject(refreshError);
      }
    }

    if (error.response?.status === 400) {
      emitValidationEvent(error);
      showApiErrorToast(error, 'Please review the highlighted fields and try again.');
      return Promise.reject(error);
    }

    if (error.response?.status === 403) {
      if (!error.config?.suppressGlobalForbiddenToast) {
        showApiErrorToast(error);
      }
      return Promise.reject(error);
    }

    if (error.response?.status === 404) {
      showApiErrorToast(error, 'The requested page was not found.');
      if (typeof window.location !== 'undefined' && typeof window.location.assign === 'function') {
        window.location.assign('/404');
      }
      return Promise.reject(error);
    }

    if (error.response?.status === 500) {
      showApiErrorToast(error);
      return Promise.reject(error);
    }

    if (isTimeoutError(error)) {
      logDebug('[API] Request timed out; showing network guidance without redirect');
      showApiErrorToast(error, 'The connection timed out. Check your internet connection and try again.');
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default api;
