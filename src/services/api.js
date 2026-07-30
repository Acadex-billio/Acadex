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
    window.showToast('Your Session has Expire, Please Login Again to Get Authenticated', 'error');
    return;
  }

  if (status === 400) {
    window.showToast(message || 'Please review the highlighted fields and try again.', 'warning');
    return;
  }

  if (status === 403) {
    window.showToast('You Don\'t have the permission to perform this action', 'warning');
    return;
  }

  if (status === 404) {
    window.showToast('The requested page was not found.', 'warning');
    return;
  }

  if (status === 500) {
    window.showToast('Something Went Wrong On Our Server, Please try again in a moment', 'error');
    return;
  }

  if (isTimeoutError(error)) {
    window.showToast('Connection Timed out. Please check Your internet connection and try again', 'warning');
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
      if (url.includes('/auth/login')) {
        return Promise.reject(error);
      }

      try {
        if (url.includes('/auth/me')) {
          logoutAndRedirect('Your Session has Expire, Please Login Again to Get Authenticated');
          return Promise.reject(error);
        }

        const check = await performAuthCheck();

        if (check?.data?.authenticated) {
          logDebug('[API] Token valid via /auth/me; skipping logout');
          showApiErrorToast(error, 'Access denied for this resource. Please contact the administrator.');
          return Promise.reject(error);
        }
      } catch (meError) {
        if (meError.response?.status === 401) {
          logDebug('[API] /auth/me returned 401, clearing auth state');
          logoutAndRedirect('Your Session has Expire, Please Login Again to Get Authenticated');
        } else if (meError.response?.status === 429) {
          logDebug('[API] /auth/me rate limited; leaving token intact');
          showApiErrorToast(error, 'Too many auth checks too quickly; please wait a few seconds.');
        } else if (isTimeoutError(meError)) {
          logDebug('[API] /auth/me timed out; showing retryable network guidance');
          showApiErrorToast(error, 'Connection Timed out. Please check Your internet connection and try again');
        } else {
          logDebug('[API] /auth/me check failed without 401; leaving token intact');
        }
      }

      return Promise.reject(error);
    }

    if (error.response?.status === 400) {
      emitValidationEvent(error);
      showApiErrorToast(error, 'Please review the highlighted fields and try again.');
      return Promise.reject(error);
    }

    if (error.response?.status === 403) {
      showApiErrorToast(error);
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
      showApiErrorToast(error, 'Connection Timed out. Please check Your internet connection and try again');
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default api;

