/**
 * Admin Route Component
 * Prevents non-admin users from accessing admin pages
 * Admin status is verified from JWT token (req.user.is_admin)
 */

import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../utility/ToastNotification';

const AdminRoute = ({ children }) => {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f8f9fa'
      }}>
        <div style={{
          fontSize: '18px',
          color: '#6c757d'
        }}>
          Loading...
        </div>
      </div>
    );
  }

  // CRITICAL: Redirect to login if not authenticated
  if (!isAuthenticated) {
    showToast('Authentication required', 'error');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // CRITICAL: Redirect to candidate dashboard if not admin/developer
  const userRole = String(user?.role || '').toLowerCase();
  const isAdminRole = user?.is_admin === true || userRole === 'admin' || userRole === 'developer';

  if (!isAdminRole) {
    showToast('Admin access required', 'error');
    return <Navigate to="/candidate" replace />;
  }

  // Check account status (same as CandidateShell)
  const status = String(user?.account_status || 'active');
  if (status !== 'active') {
    showToast(`Admin account is ${status}`, 'error');
    return <Navigate to="/login" replace />;
  }

  // Render children if authenticated AND admin
  return children;
};

export default AdminRoute;
