import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FaBars, FaTimes, FaHome, FaFileAlt, FaBook, FaClipboardList, FaCog, FaCommentDots, FaComments, FaChartLine, FaSignOutAlt, FaUserCircle, FaHistory, FaBullhorn, FaCreditCard, FaLightbulb, FaUsers, FaChevronDown, FaChalkboardTeacher, FaDollarSign } from 'react-icons/fa';
import styles from '../../Astyles/DashboardShell.module.css';
import { useAuth } from '../../context/AuthContext';
import { useLoading } from '../../context/LoadingContext';
import api from '../../services/api';
import { useTranslation } from 'react-i18next';
import { showToast } from '../../utility/ToastNotification';
import FloatingAIIcon from '../CandidateAI';
import AdDisplay from '../AdDisplay';

const ICON_OPTIONS = ['👋', '🚀', '🎓', '😎'];
const STATUS_LABELS = ['Success', 'Graduate'];

const buildImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${window.location.origin}${url}`;
  return `${window.location.origin}/${url}`;
};

const CandidateShell = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const { startLoading, stopLoading } = useLoading();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [paperSubmenuOpen, setPaperSubmenuOpen] = useState(false);
  const [reportsSubmenuOpen, setReportsSubmenuOpen] = useState(false);
  const [announcementCount, setAnnouncementCount] = useState(0);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [bookingAlertCount, setBookingAlertCount] = useState(0);
  const [chatUnreadCount, setChatUnreadCount] = useState(0);
  const accountMenuRef = useRef(null);
  const { user, isAuthenticated } = useAuth();

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        // Use AuthContext state instead of API call to prevent race conditions
        if (cancelled) return;

        if (!isAuthenticated) {
          navigate('/login', { replace: true });
          return;
        }

        const status = String(user?.account_status || 'active');
        if (status !== 'active') {
          showToast('toast.candidate.accountStatus', 'warning', { status });
          navigate('/candidate/restricted', { replace: true });
        }
      } catch (_) {
        if (!cancelled) navigate('/login', { replace: true });
      }
    };
    
    // Add small delay to allow AuthContext to initialize
    const timeoutId = setTimeout(check, 200);
    
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [navigate, isAuthenticated, user]);

  useEffect(() => {
    let cancelled = false;
    let timer = null;

    const loadCount = async () => {
      try {
        const res = await api.get('/announcements/active/count');
        const data = res.data;
        if (cancelled) return;
        setAnnouncementCount(Number(data?.count || 0));
        return true;
      } catch (_) {
        if (!cancelled) setAnnouncementCount(0);
        return false;
      }
    };

    const loadFeedbackCount = async () => {
      try {
        const res = await api.get('/candidate/account/status');
        if (cancelled) return;
        const complaints = Array.isArray(res.data?.complaints) ? res.data.complaints : [];
        setFeedbackCount(complaints.filter((item) => String(item.status || 'pending') === 'pending').length);
        return true;
      } catch (_) {
        if (!cancelled) setFeedbackCount(0);
        return false;
      }
    };

    const loadBookingIndicators = async () => {
      try {
        const res = await api.get('/lecturers/candidate/bookings');
        if (cancelled) return;
        const rows = Array.isArray(res.data?.bookings) ? res.data.bookings : [];
        const count = rows.filter((b) => {
          if (b?.conference_live) return true;
          if (String(b?.viewer_role_in_booking || '') === 'invitee' && String(b?.viewer_invite?.status || '') === 'pending') return true;
          return false;
        }).length;
        setBookingAlertCount(count);
        return true;
      } catch (_) {
        if (!cancelled) setBookingAlertCount(0);
        return false;
      }
    };

    const loadChatCount = async () => {
      try {
        const res = await api.get('/chat/rooms');
        if (cancelled) return;
        const rooms = Array.isArray(res.data?.rooms) ? res.data.rooms : [];
        const total = rooms.reduce((sum, r) => sum + (Number(r.unread_count) || 0), 0);
        setChatUnreadCount(total);
        return true;
      } catch (_) {
        if (!cancelled) setChatUnreadCount(0);
        return false;
      }
    };

    const pollIndicators = async () => {
      if (cancelled) return;

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        timer = setTimeout(pollIndicators, 90000);
        return;
      }

      const [countOk, feedbackOk, bookingOk, chatOk] = await Promise.all([
        loadCount(),
        loadFeedbackCount(),
        loadBookingIndicators(),
        loadChatCount(),
      ]);

      const hasFailure = [countOk, feedbackOk, bookingOk, chatOk].some((ok) => ok === false);
      timer = setTimeout(pollIndicators, hasFailure ? 120000 : 30000);
    };

    pollIndicators();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        setAccountMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown, { passive: true });
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    setAccountMenuOpen(false);
    setSidebarOpen(false);
  }, [location.pathname]);

  const sidebarMainItems = useMemo(
    () => [
      { to: '/candidate/presentations', label: t('nav.presentations'), icon: FaBook },
      { to: '/candidate/announcements', label: t('nav.announcements'), icon: FaBullhorn, badge: announcementCount },
      { to: '/candidate/faqs', label: 'FAQs', icon: FaCommentDots },
      { to: '/candidate/earn-money', label: 'Earn Money', icon: FaDollarSign },
      { to: '/candidate/internship-topics', label: t('nav.internshipTopics'), icon: FaLightbulb },
      { to: '/candidate/tutorship-bookings', label: 'Tutorship Bookings', icon: FaComments, badge: bookingAlertCount },
    ],
    [announcementCount, bookingAlertCount, t]
  );

  const isPapersActive = location.pathname.startsWith('/candidate/question-papers');
  const isReportsActive = location.pathname.startsWith('/candidate/reports');

  useEffect(() => {
    if (isPapersActive) {
      setPaperSubmenuOpen(true);
    }
    if (isReportsActive) setReportsSubmenuOpen(true);
  }, [isPapersActive, isReportsActive]);

  const accountMenuItems = useMemo(
    () => [
      { to: '/candidate/settings', label: t('nav.settings'), icon: FaCog },
      { to: '/candidate/profile', label: t('nav.profile'), icon: FaUserCircle },
      { to: '/candidate/history', label: t('nav.downloads'), icon: FaHistory },
      { to: '/candidate/activity', label: t('nav.activity'), icon: FaChartLine },
      { to: '/candidate/feedback', label: t('nav.feedback'), icon: FaCommentDots, badge: feedbackCount },
      { to: '/candidate/subscription', label: t('nav.subscriptions'), icon: FaCreditCard },
    ],
    [feedbackCount, t]
  );

  const closeSidebar = () => setSidebarOpen(false);

  const onNavClick = () => {
    startLoading();
    setTimeout(() => {
      stopLoading();
    }, 450);
    closeSidebar();
  };

  const navigateHome = () => {
    startLoading();
    navigate('/');
    setTimeout(() => stopLoading(), 450);
  };

  const onAccountMenuNav = (to) => {
    setAccountMenuOpen(false);
    startLoading();
    navigate(to);
    setTimeout(() => stopLoading(), 450);
  };

  const onLogout = async () => {
    startLoading();
    try {
      await api.post('/auth/logout');
    } catch (_) {
    } finally {
      localStorage.removeItem('userId');
      localStorage.removeItem('userEmail');
      localStorage.removeItem('userName');
      localStorage.removeItem('isAdmin');
      navigate('/login');
      setTimeout(() => stopLoading(), 450);
    }
  };

  const profileLabel = user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0)?.toUpperCase() || 'C';
  const profileName = user?.name || user?.email || t('nav.candidate');
  const firstName = String(user?.name || user?.email || 'User').trim().split(/\s+/)[0];
  const [headerLabel, setHeaderLabel] = useState(firstName);
  const [headerIcon, setHeaderIcon] = useState(ICON_OPTIONS[Math.floor(Math.random() * ICON_OPTIONS.length)]);
  const pictureUrl = user?.profilePicture || user?.profile_picture || null;
  const avatarSrc = buildImageUrl(pictureUrl);

  useEffect(() => {
    const updateHeaderMeta = () => {
      const greetingOptions = [firstName, ...STATUS_LABELS];
      setHeaderLabel(greetingOptions[Math.floor(Math.random() * greetingOptions.length)]);
      setHeaderIcon(ICON_OPTIONS[Math.floor(Math.random() * ICON_OPTIONS.length)]);
    };
    updateHeaderMeta();
    const intervalId = setInterval(updateHeaderMeta, 60000);
    return () => clearInterval(intervalId);
  }, [firstName]);

  return (
    <div className={styles.shell}>
      <div className={styles.sidebarHeader}>
        <button type="button" className={styles.sidebarHomeLink} onClick={navigateHome} aria-label="Go to Acadex homepage">
          <img src={process.env.PUBLIC_URL + '/acadex-logo.png'} alt="Acadex logo" className={styles.sidebarLogoImage} />
          <span className={styles.sidebarHomeText}>Acadex</span>
          <span className={styles.sidebarHomeMeta}>Yoo {headerLabel}, {headerIcon}</span>
        </button>
      </div>
      <header className={styles.header}>
        <button
          type="button"
          className={styles.iconBtn}
          onClick={() => setSidebarOpen(true)}
          aria-label="Open menu"
          title="Menu"
        >
          <FaBars />
        </button>
        <div className={styles.brand}>{t('nav.candidateDashboard')}</div>
        <div className={styles.headerActions} ref={accountMenuRef}>
          <div className={styles.headerActionWrap}>
            <button
              type="button"
              className={styles.headerActionBtn}
              onClick={() => { startLoading(); navigate('/candidate/chat'); setTimeout(() => stopLoading(), 450); }}
              aria-label="Chat"
              title="Chat"
            >
              <FaComments />
            </button>
            {chatUnreadCount > 0 && <span className={styles.headerActionBadge}>{chatUnreadCount > 99 ? '99+' : chatUnreadCount}</span>}
          </div>

          <button
            type="button"
            className={styles.headerActionBtn}
            onClick={() => onAccountMenuNav('/candidate/lecturers')}
            aria-label="Lecturers"
            title="Lecturers"
          >
            <FaUsers />
          </button>

          <button
            type="button"
            className={styles.accountTriggerBtn}
            onClick={() => setAccountMenuOpen((prev) => !prev)}
            aria-label="Account menu"
            aria-expanded={accountMenuOpen}
            aria-controls="candidate-account-menu"
            title={profileName}
          >
            <span className={styles.headerAvatar}>
              {avatarSrc ? (
                <img src={avatarSrc} alt={`${profileName} avatar`} className={styles.headerAvatarImage} />
              ) : (
                profileLabel
              )}
            </span>
            <FaChevronDown className={`${styles.accountChevron} ${accountMenuOpen ? styles.accountChevronOpen : ''}`} />
          </button>

          {accountMenuOpen && (
            <div id="candidate-account-menu" className={styles.accountMenu} role="menu" aria-label="Account">
              <div className={styles.accountMenuHeader}>{profileName}</div>
              {accountMenuItems.map(({ to, label, icon: Icon, badge }) => (
                <button
                  key={to}
                  type="button"
                  className={styles.accountMenuItem}
                  onClick={() => onAccountMenuNav(to)}
                  role="menuitem"
                >
                  <Icon className={styles.navIcon} />
                  <span className={styles.accountMenuLabel}>{label}</span>
                  {badge > 0 ? <span className={styles.badgePill}>{badge}</span> : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <div className={styles.body}>
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
          <div className={styles.sidebarTop}>
            <div className={styles.sidebarTitle}>{t('nav.navigation')}</div>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => setSidebarOpen(false)}
              aria-label="Close menu"
              title="Close"
            >
              <FaTimes />
            </button>
          </div>

          <nav className={styles.nav}>
            <button
              type="button"
              className={`${styles.navLink} ${isPapersActive ? styles.active : ''}`}
              onClick={() => {
                setPaperSubmenuOpen((prev) => !prev);
                onNavClick();
                navigate('/candidate/question-papers/hnd');
              }}
            >
              <FaFileAlt className={styles.navIcon} />
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%' }}>
                <span>Question Papers</span>
                <FaChevronDown className={`${styles.accountChevron} ${paperSubmenuOpen ? styles.accountChevronOpen : ''}`} />
              </span>
            </button>
            {paperSubmenuOpen && (
              <div className={styles.navSubgroup}>
                <NavLink
                  to="/candidate/question-papers/hnd"
                  className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                  onClick={onNavClick}
                >
                  HND Papers
                </NavLink>
                <NavLink
                  to="/candidate/question-papers/ca"
                  className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                  onClick={onNavClick}
                >
                  CA Papers
                </NavLink>
                <NavLink
                  to="/candidate/question-papers/exam"
                  className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                  onClick={onNavClick}
                >
                  Exam Papers
                </NavLink>
                <NavLink
                  to="/candidate/question-papers/mock"
                  className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                  onClick={onNavClick}
                >
                  Mock Papers
                </NavLink>
              </div>
            )}
            <button
              type="button"
              className={`${styles.navLink} ${isReportsActive ? styles.active : ''}`}
              onClick={() => {
                setReportsSubmenuOpen((prev) => !prev);
                onNavClick();
                navigate('/candidate/reports');
              }}
            >
              <FaFileAlt className={styles.navIcon} />
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%' }}>
                <span>Academic Reports</span>
                <FaChevronDown className={`${styles.accountChevron} ${reportsSubmenuOpen ? styles.accountChevronOpen : ''}`} />
              </span>
            </button>
            {reportsSubmenuOpen && (
              <div className={styles.navSubgroup}>
                <NavLink
                  to="/candidate/reports"
                  className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                  onClick={onNavClick}
                >
                  Reports
                </NavLink>
                <NavLink
                  to="/candidate/reports/guides"
                  className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                  onClick={onNavClick}
                >
                  Report Guides
                </NavLink>
              </div>
            )}
            <NavLink
              to="/candidate/results"
              className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
              onClick={onNavClick}
            >
              <FaChartLine className={styles.navIcon} />
              <span>Results</span>
            </NavLink>
            {sidebarMainItems.map(({ to, label, icon: Icon, badge }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                onClick={onNavClick}
              >
                <Icon className={styles.navIcon} />
                <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%' }}>
                  <span>{label}</span>
                  {badge > 0 ? <span className={styles.badgePulse}>{badge}</span> : null}
                </span>
              </NavLink>
            ))}
          </nav>

          <div className={styles.sidebarFooter}>
            <button
              type="button"
              className={styles.logoutBtn}
              onClick={onLogout}
              aria-label="Logout"
              title="Logout"
            >
              <FaSignOutAlt className={styles.navIcon} />
              <span>{t('nav.logout')}</span>
            </button>
          </div>
        </aside>

        {sidebarOpen && <div className={styles.backdrop} onClick={closeSidebar} />}

        <main className={styles.main}>
          <Outlet />
        </main>
      </div>

      <FloatingAIIcon />
      <AdDisplay />

      <footer className={styles.footer}>
        <NavLink to="/candidate" end className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
          <FaHome />
          <span>Home</span>
        </NavLink>
        <NavLink to="/candidate/question-papers/hnd" className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
          <FaClipboardList />
          <span>Papers</span>
        </NavLink>
        <NavLink to="/candidate/lecturers" className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
          <FaChalkboardTeacher />
          <span>Lecturers</span>
        </NavLink>
        <NavLink to="/candidate/profile" className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
          <FaUserCircle />
          <span>Profile</span>
        </NavLink>
      </footer>
    </div>
  );
};

export default CandidateShell;
