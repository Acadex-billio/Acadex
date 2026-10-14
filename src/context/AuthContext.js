/**
 * JWT Authentication Context
 * Provides authentication state and methods to the entire app
 */

import React, { createContext, useContext, useReducer, useEffect, useRef } from 'react';
import authService from '../services/authService';
import api, { handleAuthSessionExpired, refreshAuthSession } from '../services/api';
import { triggerPushPrompt } from '../services/pushNotifications';

const TOKEN_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

const isVerboseLoggingEnabled =
  String(process.env.REACT_APP_DEBUG_LOGS || '').trim().toLowerCase() === 'true';
const logDebug = (...args) => {
  if (isVerboseLoggingEnabled) {
    console.log(...args);
  }
};

// Action types
const AUTH_ACTIONS = {
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILURE: 'LOGIN_FAILURE',
  LOGOUT: 'LOGOUT',
  SET_USER: 'SET_USER',
  CLEAR_ERROR: 'CLEAR_ERROR',
};

// Initial state
const initialState = {
  isAuthenticated: false,
  user: null,
  token: null,
  loading: true, // Start with loading: true
  error: null,
};

// Reducer
const authReducer = (state, action) => {
  let newState = state;
  
  switch (action.type) {
    case AUTH_ACTIONS.LOGIN_SUCCESS:
      newState = {
        ...state,
        isAuthenticated: true,
        user: action.payload.user,
        token: action.payload.token,
        loading: false,
        error: null,
      };
      return newState;
    
    case AUTH_ACTIONS.LOGIN_FAILURE:
      newState = {
        ...state,
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: action.payload,
      };
      return newState;
    
    case AUTH_ACTIONS.LOGOUT:
      newState = {
        ...state,
        isAuthenticated: false,
        user: null,
        token: null,
        loading: false,
        error: null,
      };
      return newState;
    
    case AUTH_ACTIONS.SET_USER:
      newState = {
        ...state,
        user: action.payload,
      };
      return newState;
    
    case AUTH_ACTIONS.CLEAR_ERROR:
      newState = {
        ...state,
        error: null,
      };
      return newState;
    
    default:
      return state;
  }
};

// Create context
const AuthContext = createContext();

// Auth provider component
export const AuthProvider = ({ children }) => {
  const [state, dispatch] = useReducer(authReducer, initialState);
  const lastAuthRefreshAt = useRef(0);

  // Expose dispatcher to API module for logout handling in interceptor
  useEffect(() => {
    window.authDispatch = dispatch;
    return () => {
      if (window.authDispatch === dispatch) {
        delete window.authDispatch;
      }
    };
  }, [dispatch]);

  // The HttpOnly cookie session is authoritative; bootstrap through the API.
  useEffect(() => {
    const initializeAuth = async () => {
      authService.removeToken();
      localStorage.removeItem('acadex_last_activity_at');
      try {
        const response = await api.get('/auth/me');
        if (response.data?.authenticated && response.data?.user) {
          lastAuthRefreshAt.current = Date.now() - TOKEN_REFRESH_INTERVAL_MS;
          dispatch({
            type: AUTH_ACTIONS.LOGIN_SUCCESS,
            payload: { token: null, user: response.data.user },
          });
          return;
        }
      } catch (error) {
        logDebug('[Auth Context] Cookie session bootstrap failed', {
          status: error?.response?.status || 0,
          message: error?.message,
        });
      }

      authService.removeToken();
      localStorage.removeItem('userId');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userName');
      localStorage.removeItem('isAdmin');
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
    };

    initializeAuth();
  }, []);

  // Login action
  const login = async (email, password) => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

    try {
      const response = await api.post('/auth/login', { email, password });

      const { user } = response.data;

      if (user) {
        authService.removeToken();
        lastAuthRefreshAt.current = Date.now();
        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: { token: null, user }
        });

        setTimeout(() => {
          try {
            triggerPushPrompt();
          } catch (_) {
            // Ignore prompt trigger errors.
          }
        }, 800);

        logDebug('[AuthContext] Login succeeded');
        return { success: true, user };
      }

      console.error('[AuthContext] Invalid login response format:', response.data);
      throw new Error('Invalid login response format');
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Login failed';
      const httpStatus = error.response?.status;

      console.error('[AuthContext] Login error:', { errorMessage, httpStatus });

      dispatch({
        type: AUTH_ACTIONS.LOGIN_FAILURE,
        payload: errorMessage
      });
      return { success: false, error: errorMessage, data: error.response?.data };
    }
  };

  // Logout action
  const logout = async () => {
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // Clear local state even when the server session is unavailable.
    } finally {
      authService.removeToken();
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
      localStorage.removeItem('userId');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userName');
      localStorage.removeItem('isAdmin');
    }
  };

  useEffect(() => {
    if (!state.isAuthenticated) return undefined;

    const refreshInBackground = async () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastAuthRefreshAt.current < TOKEN_REFRESH_INTERVAL_MS) return;

      try {
        await refreshAuthSession();
        lastAuthRefreshAt.current = Date.now();
      } catch (refreshError) {
        if (refreshError.response?.status !== 401) {
          logDebug('[Auth Context] Background refresh temporarily failed', {
            status: refreshError.response?.status || 0,
            message: refreshError.message,
          });
          return;
        }

        try {
          await api.get('/auth/me');
          lastAuthRefreshAt.current = Date.now();
        } catch (authError) {
          if (authError.response?.status === 401) {
            handleAuthSessionExpired('Your session has expired. Please log in again.');
          } else {
            logDebug('[Auth Context] Could not verify session after refresh failure', {
              status: authError.response?.status || 0,
              message: authError.message,
            });
          }
        }
      }
    };

    const intervalId = window.setInterval(refreshInBackground, TOKEN_REFRESH_INTERVAL_MS);
    const onResume = () => {
      if (document.visibilityState === 'visible') refreshInBackground();
    };
    window.addEventListener('focus', refreshInBackground);
    document.addEventListener('visibilitychange', onResume);

    refreshInBackground();
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refreshInBackground);
      document.removeEventListener('visibilitychange', onResume);
    };
  }, [state.isAuthenticated]);

  // Update user data
  const updateUser = (userData) => {
    dispatch({
      type: AUTH_ACTIONS.SET_USER,
      payload: userData
    });
  };

  const value = {
    ...state,
    login,
    logout,
    updateUser,
    isAuthenticated: state.isAuthenticated,
    user: state.user,
    token: state.token,
    loading: state.loading,
    error: state.error,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export default AuthContext;
