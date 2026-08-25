import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../utility/ToastNotification';

const DeveloperRoute = ({ children }) => {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f8f9fa'
      }}>
        <div style={{ fontSize: '18px', color: '#6c757d' }}>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    showToast('Authentication required', 'error');
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  const role = String(user?.role || '').toLowerCase();
  if (!['developer', 'superadmin'].includes(role)) {
    showToast('Developer access required', 'error');
    return <Navigate to="/admin" replace />;
  }

  return children;
};

export default DeveloperRoute;