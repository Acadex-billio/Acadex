import React, { useMemo, useState, useEffect } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  FaBars,
  FaTimes,
  FaChalkboardTeacher,
  FaCalendarCheck,
  FaHistory,
  FaComments,
  FaRobot,
  FaCog,
  FaSignOutAlt,
  FaLock,
  FaExclamationTriangle,
  FaUserCircle,
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
  const [chatUnreadCount, setChatUnreadCount] = useState(0);

  const isPending = String(user?.account_status || 'active') !== 'active';

  const navItems = useMemo(
    () => [
      // Footer contains Home/Bookings/History/Profile - avoid duplicating those here
      // Keep primary non-footer items here (chat shown in header/footer is separate)
      { to: '/lecturer/chat', label: 'Chat', icon: FaComments, locked: true },
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

  const navigateHome = () => {
    startLoading();
    navigate('/');
    setTimeout(() => stopLoading(), 350);
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

  useEffect(() => {
    let cancelled = false;

    const loadChatCount = async () => {
      try {
        const res = await api.get('/chat/rooms');
        if (cancelled) return;
        const rooms = Array.isArray(res.data?.rooms) ? res.data.rooms : [];
        const total = rooms.reduce((sum, r) => sum + (Number(r.unread_count) || 0), 0);
        setChatUnreadCount(total);
      } catch (_) {
        if (!cancelled) setChatUnreadCount(0);
      }
    };

    loadChatCount();
    const interval = setInterval(loadChatCount, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  const profileLabel = user?.name?.charAt(0)?.toUpperCase() || 'L';

  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <button type="button" className={styles.iconBtn} onClick={() => setSidebarOpen(true)} title="Menu" aria-label="Open menu">
          <FaBars />
        </button>
        <div className={styles.brand}>Lecturer Portal</div>
        <div className={styles.headerActions}>
          <div className={styles.headerActionWrap}>
            <button
              type="button"
              className={styles.headerActionBtn}
              onClick={() => { startLoading(); navigate('/lecturer/chat'); setTimeout(() => stopLoading(), 350); }}
              aria-label="Chat"
              title="Chat"
            >
              <FaComments />
            </button>
            {chatUnreadCount > 0 && <span className={styles.headerActionBadge}>{chatUnreadCount > 99 ? '99+' : chatUnreadCount}</span>}
          </div>
          <div className={styles.headerInfo}>
            <div className={styles.headerAvatar}>{profileLabel}</div>
            <span>{user?.name || user?.email || 'Lecturer'}</span>
          </div>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
          <div className={styles.sidebarHeader}>
            <button type="button" className={styles.sidebarHomeLink} onClick={navigateHome} aria-label="Go to Acadex homepage">
              <img src={process.env.PUBLIC_URL + '/acadex-logo.png'} alt="Acadex logo" className={styles.sidebarLogoImage} />
              <span className={styles.sidebarHomeText}>Acadex</span>
              <span className={styles.sidebarHomeMeta}>Lecturer</span>
            </button>
          </div>

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
      <footer className={styles.footer}>
        <NavLink to="/lecturer" end className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
          <FaChalkboardTeacher />
          <span>Home</span>
        </NavLink>
        <NavLink to="/lecturer/bookings" className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
          <FaCalendarCheck />
          <span>Bookings</span>
        </NavLink>
        <NavLink to="/lecturer/history" className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
          <FaHistory />
          <span>History</span>
        </NavLink>
        <NavLink to="/lecturer/profile-verification" className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
          <FaUserCircle />
          <span>Profile</span>
        </NavLink>
      </footer>    </div>
  );
};

export default LecturerShell;
