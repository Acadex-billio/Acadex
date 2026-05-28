import React, { useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  FaBars,
  FaTimes,
  FaChalkboardTeacher,
  FaIdCard,
  FaCalendarCheck,
  FaHistory,
  FaComments,
  FaRobot,
  FaCog,
  FaSignOutAlt,
  FaLock,
  FaExclamationTriangle,
} from 'react-icons/fa';
import styles from '../../Astyles/DashboardShell.module.css';
import lecStyles from '../../Astyles/lecturerPortal.module.css';
import { useAuth } from '../../context/AuthContext';
import { useLoading } from '../../context/LoadingContext';
import api from '../../services/api';
import FloatingAIIcon from '../CandidateAI';
import AdDisplay from '../AdDisplay';

const LecturerShell = () => {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user } = useAuth();
  const { startLoading, stopLoading } = useLoading();

  const isPending = String(user?.account_status || 'active') !== 'active';

  const navItems = useMemo(
    () => [
      { to: '/lecturer', label: 'Dashboard', icon: FaChalkboardTeacher, locked: false, end: true },
      { to: '/lecturer/profile-verification', label: 'Profile & Verification', icon: FaIdCard, locked: false },
      { to: '/lecturer/history', label: 'History', icon: FaHistory, locked: false },
      { to: '/lecturer/chat', label: 'Chat', icon: FaComments, locked: true },
      { to: '/lecturer/bookings', label: 'Bookings', icon: FaCalendarCheck, locked: true },
    ],
    []
  );

  const bottomItems = useMemo(
    () => [
      { to: '/lecturer/ai-assistant', label: 'AI Assistant', icon: FaRobot },
      { to: '/lecturer/settings', label: 'Settings', icon: FaCog },
    ],
    []
  );

  const onNavClick = (locked) => {
    if (locked && isPending) return;
    startLoading();
    setTimeout(() => stopLoading(), 350);
    setSidebarOpen(false);
  };

  const onLogout = async () => {
    startLoading();
    try {
      await api.post('/auth/logout');
    } catch (_) {
      // no-op
    } finally {
      navigate('/login');
      setTimeout(() => stopLoading(), 350);
    }
  };

  const profileLabel = user?.name?.charAt(0)?.toUpperCase() || 'L';

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <button type="button" className={styles.iconBtn} onClick={() => setSidebarOpen(true)} title="Menu" aria-label="Open menu">
          <FaBars />
        </button>
        <div className={styles.brand}>Lecturer Portal</div>
        <div className={styles.headerInfo}>
          <div className={styles.headerAvatar}>{profileLabel}</div>
          <span>{user?.name || user?.email || 'Lecturer'}</span>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
          <div className={styles.sidebarTop}>
            <div className={styles.sidebarTitle}>Lecturer Portal</div>
            <button type="button" className={styles.iconBtn} onClick={() => setSidebarOpen(false)} title="Close" aria-label="Close menu">
              <FaTimes />
            </button>
          </div>

          {isPending && (
            <div className={lecStyles.shellPendingBanner}>
              <FaExclamationTriangle />
              <span>Account pending review</span>
            </div>
          )}

          <nav className={styles.nav}>
            {navItems.map(({ to, label, icon: Icon, locked, end }) => {
              const isLocked = locked && isPending;
              return isLocked ? (
                <div
                  key={to}
                  className={`${styles.navLink} ${lecStyles.navLocked}`}
                  title="Complete verification to unlock"
                >
                  <Icon className={styles.navIcon} />
                  <span>{label}</span>
                  <FaLock className={lecStyles.lockIcon} />
                </div>
              ) : (
                <NavLink
                  key={to}
                  to={to}
                  end={end}
                  className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                  onClick={() => onNavClick(false)}
                >
                  <Icon className={styles.navIcon} />
                  <span>{label}</span>
                </NavLink>
              );
            })}
          </nav>

          <div className={lecStyles.sidebarDivider} />

          <nav className={styles.nav}>
            {bottomItems.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                onClick={() => onNavClick(false)}
              >
                <Icon className={styles.navIcon} />
                <span>{label}</span>
              </NavLink>
            ))}
          </nav>

          <div className={styles.sidebarFooter}>
            <button type="button" className={styles.logoutBtn} onClick={onLogout}>
              <FaSignOutAlt className={styles.navIcon} />
              <span>Logout</span>
            </button>
          </div>
        </aside>

        {sidebarOpen ? <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} /> : null}
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>

      <FloatingAIIcon
        targetPath="/lecturer/ai-assistant"
        storageKey="lecturer_floating_ai_position_v1"
        ariaLabel="Open AI assistant"
        title="AI Assistant"
      />
      <AdDisplay />
    </div>
  );
};

export default LecturerShell;
