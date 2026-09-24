import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isAdminUser, isLecturerUser } from '../utility/rolePolicy';

const LecturerRoute = ({ children }) => {
  const { isAuthenticated, user, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
        <div>Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!isLecturerUser(user)) {
    if (isAdminUser(user)) {
      return <Navigate to="/admin" replace />;
    }
    return <Navigate to="/candidate" replace />;
  }

  // Allow both active and pending_approval lecturers into the shell
  return children;
};

export default LecturerRoute;
