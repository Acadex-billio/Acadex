/**
 * JWT Authentication Context
 * Provides authentication state and methods to the entire app
 */

import React, { createContext, useContext, useReducer, useEffect } from 'react';
import authService from '../services/authService';
import api from '../services/api';

const ACTIVITY_STORAGE_KEY = 'acadex_last_activity_at';
const INACTIVITY_WINDOW_MS = 24 * 60 * 60 * 1000;

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

  // Expose dispatcher to API module for logout handling in interceptor
  useEffect(() => {
    window.authDispatch = dispatch;
    return () => {
      if (window.authDispatch === dispatch) {
        delete window.authDispatch;
      }
    };
  }, [dispatch]);

  // Check for existing token on app start
  useEffect(() => {
    const initializeAuth = () => {
      const token = authService.getToken();
      const user = authService.getCurrentUser();
      
      logDebug('[Auth Context] Initializing auth:', {
        hasToken: !!token, 
        hasUser: !!user,
        tokenExpired: token ? authService.isTokenExpired() : null
      });
      
      if (token && user && !authService.isTokenExpired()) {
        const lastActivityRaw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
        const lastActivityAt = Number(lastActivityRaw || 0);
        const now = Date.now();
        const hasValidActivity = Number.isFinite(lastActivityAt) && lastActivityAt > 0;
        const isInactiveTooLong = hasValidActivity && now - lastActivityAt > INACTIVITY_WINDOW_MS;

        if (isInactiveTooLong) {
          authService.removeToken();
          localStorage.removeItem(ACTIVITY_STORAGE_KEY);
          localStorage.removeItem('userId');
          localStorage.removeItem('userEmail');
          localStorage.removeItem('userName');
          localStorage.removeItem('isAdmin');
          if (typeof window.showToast === 'function') {
            window.showToast('You were logged out after 24 hours of inactivity. Please log in again.', 'warning');
          }
          dispatch({
            type: AUTH_ACTIONS.LOGOUT
          });
          return;
        }

        localStorage.setItem(ACTIVITY_STORAGE_KEY, String(now));
        logDebug('[Auth Context] Found valid token');
        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: { token, user }
        });
      } else {
        logDebug('[Auth Context] No valid token found, clearing auth state');
        // Clear all auth data
        authService.removeToken();
        dispatch({
          type: AUTH_ACTIONS.LOGOUT
        });
        // Clear localStorage compatibility data
        localStorage.removeItem('userId');
        localStorage.removeItem('userEmail');
        localStorage.removeItem('userName');
      }
    };

    // Initialize immediately without delay
    initializeAuth();
  }, []);

  // Login action
  const login = async (email, password) => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

    try {
      const response = await api.post('/auth/login', { email, password });
      
      const { token, user } = response.data;
      
      if (token && user) {
        authService.setToken(token);
        
        dispatch({
          type: AUTH_ACTIONS.LOGIN_SUCCESS,
          payload: { token, user }
        });

        localStorage.setItem(ACTIVITY_STORAGE_KEY, String(Date.now()));
        
        // SECURITY: Do NOT persist PII in localStorage. Use JWT payload only.
        // localStorage.setItem('userId', user.cand_id);
        // localStorage.setItem('userEmail', user.email);
        // localStorage.setItem('userName', user.name);
        logDebug('[AuthContext] Login succeeded');
        
        return { success: true, user };
      } else {
        console.error('[AuthContext] Invalid login response format:', response.data);
        throw new Error('Invalid login response format');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.message || error.message || 'Login failed';
      const httpStatus = error.response?.status;
      
      console.error('[AuthContext] ❌ Login error:', {
        errorMessage,
        httpStatus,
      });
      
      dispatch({
        type: AUTH_ACTIONS.LOGIN_FAILURE,
        payload: errorMessage
      });
      return { success: false, error: errorMessage, data: error.response?.data };
    }
  };

  // Logout action
  const logout = () => {
    authService.removeToken();
    dispatch({
      type: AUTH_ACTIONS.LOGOUT
    });
    
    // Clear localStorage
    localStorage.removeItem('userId');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    localStorage.removeItem('isAdmin');
    localStorage.removeItem(ACTIVITY_STORAGE_KEY);
  };

  useEffect(() => {
    if (!state.isAuthenticated) return;

    let lastWriteAt = 0;
    const writeActivity = () => {
      const now = Date.now();
      if (now - lastWriteAt < 15000) return;
      lastWriteAt = now;
      localStorage.setItem(ACTIVITY_STORAGE_KEY, String(now));
    };

    const checkInactivity = () => {
      const lastActivityRaw = localStorage.getItem(ACTIVITY_STORAGE_KEY);
      const lastActivityAt = Number(lastActivityRaw || 0);
      const now = Date.now();
      if (!Number.isFinite(lastActivityAt) || lastActivityAt <= 0) {
        localStorage.setItem(ACTIVITY_STORAGE_KEY, String(now));
        return;
      }
      if (now - lastActivityAt > INACTIVITY_WINDOW_MS) {
        logout();
        if (typeof window.showToast === 'function') {
          window.showToast('You were logged out after 24 hours of inactivity. Please log in again.', 'warning');
        }
      }
    };

    const onActivity = () => writeActivity();
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        writeActivity();
        checkInactivity();
      }
    };

    const activityEvents = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    activityEvents.forEach((eventName) => {
      window.addEventListener(eventName, onActivity, { passive: true });
    });
    window.addEventListener('focus', onActivity);
    document.addEventListener('visibilitychange', onVisibility);

    checkInactivity();
    const intervalId = window.setInterval(checkInactivity, 60000);

    return () => {
      activityEvents.forEach((eventName) => {
        window.removeEventListener(eventName, onActivity);
      });
      window.removeEventListener('focus', onActivity);
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearInterval(intervalId);
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
