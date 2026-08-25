import React, { useEffect, useMemo, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { FaBars, FaTimes, FaHome, FaFolderOpen, FaFileAlt, FaClipboardList, FaUpload, FaCog, FaUserCircle, FaUsers, FaRobot, FaHistory, FaBullhorn, FaCommentDots, FaComments, FaChartLine, FaSignOutAlt, FaCreditCard, FaLightbulb, FaChalkboardTeacher, FaChevronDown, FaAd, FaBell, FaDollarSign } from 'react-icons/fa';
import AdDisplay from '../AdDisplay';
import styles from '../../Astyles/DashboardShell.module.css';
import { useAuth } from '../../context/AuthContext';
import { useLoading } from '../../context/LoadingContext';
import { showToast } from '../../utility/ToastNotification';
import api from '../../services/api';
import { useTranslation } from 'react-i18next';
import FloatingAIIcon from '../CandidateAI';

const ICON_OPTIONS = ['👋', '🚀', '🎓', '😎'];
const STATUS_LABELS = ['Success', 'Graduate'];

const buildImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${window.location.origin}${url}`;
  return `${window.location.origin}/${url}`;
};

const AdminShell = () => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { startLoading, stopLoading } = useLoading();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { user, isAuthenticated } = useAuth();
  const userRole = String(user?.role || '').toLowerCase();
  const isDeveloper = userRole === 'developer';

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        if (cancelled) return;

        const userIsAdmin = user?.is_admin === true || userRole === 'admin' || userRole === 'developer';

        if (!isAuthenticated || !userIsAdmin) {
          navigate('/login', { replace: true });
          return;
        }

        const status = String(user?.account_status || 'active');
        if (status !== 'active') {
          showToast('toast.admin.accountStatus', 'error', { status });
          navigate('/login', { replace: true });
          return;
        }
      } catch (error) {
        if (!cancelled) {
          navigate('/login', { replace: true });
        }
      }
    };

    const timeoutId = setTimeout(check, 200);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [navigate, isAuthenticated, user, userRole]);

  const avatarLabel = user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'A';
  const pictureUrl = user?.profilePicture || user?.profile_picture || null;
  const avatarSrc = buildImageUrl(pictureUrl);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [announcementCount, setAnnouncementCount] = useState(0);
  const [chatCount, setChatCount] = useState(0);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [manageUsersOpen, setManageUsersOpen] = useState(false);
  const [reportsOpen, setReportsOpen] = useState(false);
  const accountMenuRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const loadComplaints = async () => {
      try {
        const res = await api.get('/admin/complaints');
        if (cancelled) return;
        const complaints = Array.isArray(res.data?.complaints) ? res.data.complaints : [];
        setFeedbackCount(complaints.filter((item) => String(item.status || 'pending') === 'pending').length);
      } catch (_) {
        if (!cancelled) setFeedbackCount(0);
      }
    };

    const loadAnnouncementCount = async () => {
      try {
        const res = await api.get('/announcements/active/count');
        if (cancelled) return;
        setAnnouncementCount(Number(res.data?.count || 0));
      } catch (_) {
        if (!cancelled) setAnnouncementCount(0);
      }
    };

    const loadChatCount = async () => {
      try {
        const res = await api.get('/chat/rooms');
        if (cancelled) return;
        const rooms = Array.isArray(res.data?.rooms) ? res.data.rooms : [];
        const total = rooms.reduce((sum, r) => sum + (Number(r.unread_count) || 0), 0);
        setChatCount(total);
      } catch (_) {
        if (!cancelled) setChatCount(0);
      }
    };

    loadComplaints();
    loadAnnouncementCount();
    loadChatCount();
    const interval = setInterval(() => {
      loadAnnouncementCount();
      loadChatCount();
    }, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!accountMenuRef.current?.contains(event.target)) setAccountMenuOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
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

  const location = useLocation();
  const navItems = useMemo(() => {
    const initial = [
      { to: '/admin', label: t('nav.dashboard'), icon: FaHome },
      { to: '/admin/departments', label: t('nav.departments'), icon: FaFolderOpen },
      { to: '/admin/presentations', label: t('nav.presentations'), icon: FaClipboardList },
      { to: '/admin/question-papers', label: t('nav.questionPapers'), icon: FaUpload },
      { to: '/admin/reports/publish-results', label: 'Publish Results', icon: FaFileAlt },
      { to: '/admin/faqs', label: 'FAQs', icon: FaCommentDots },
      { to: '/admin/internship-topics', label: t('nav.internshipTopics'), icon: FaLightbulb },
      { to: '/admin/ai-assistant', label: t('nav.aiAssistant'), icon: FaRobot },
      ...(isDeveloper ? [{ to: '/admin/custom-alert', label: 'Custom Alerts', icon: FaBell }] : []),
      ...(isDeveloper ? [{ to: '/admin/manage-billing', label: t('nav.manageBilling', 'Manage Billing'), icon: FaCreditCard }] : []),
      ...(isDeveloper ? [{ to: '/admin/pricing', label: 'PRICING', icon: FaDollarSign }] : []),
      ...(isDeveloper ? [{ to: '/admin/manage-users/concours-partners', label: 'Concours Partners', icon: FaUsers }] : []),
      ...(isDeveloper ? [{ to: '/admin/concours', label: 'Concours Management', icon: FaClipboardList }] : []),
      ...(isDeveloper ? [{ to: '/admin/lecturers', label: 'Lecturer Approvals', icon: FaChalkboardTeacher }] : []),
      ...(isDeveloper ? [{ to: '/admin/project-submissions', label: 'Project Submissions', icon: FaClipboardList }] : []),
      ...(isDeveloper ? [{ to: '/admin/study-mode-materials', label: 'Study Mode Materials', icon: FaClipboardList }] : []),
      ...(isDeveloper ? [{ to: '/admin/ads', label: 'Ads Manager', icon: FaAd }] : []),
    ];

    // Remove any routes that are surfaced in the footer to avoid duplication
    const footerPaths = isDeveloper
      ? ['/admin', '/admin/ads', '/admin/manage-billing', '/admin/profile']
      : ['/admin', '/admin/question-papers', '/admin/reports', '/admin/profile'];

    return initial.filter((item) => !footerPaths.includes(item.to));
  }, [isDeveloper, t]);

  const accountMenuItems = useMemo(
    () => [
      { to: '/admin/settings', label: t('nav.settings'), icon: FaCog },
      { to: '/admin/profile', label: t('nav.profile'), icon: FaUserCircle },
      { to: '/admin/history', label: t('nav.history'), icon: FaHistory },
      { to: '/admin/activity', label: t('nav.activity'), icon: FaChartLine },
      { to: '/admin/feedback', label: t('nav.feedback'), icon: FaCommentDots, badge: feedbackCount },
    ],
    [feedbackCount, t]
  );

  const closeSidebar = () => setSidebarOpen(false);

  const isReportsActive = location.pathname.startsWith('/admin/reports');

  useEffect(() => {
    if (isReportsActive) {
      setReportsOpen(true);
    }
  }, [isReportsActive]);

  const onAccountMenuNav = (to) => {
    setAccountMenuOpen(false);
    startLoading();
    navigate(to);
    setTimeout(() => stopLoading(), 450);
  };

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

  const adminLabel = user?.name || user?.email || t('nav.admin');
  const firstName = String(user?.name || user?.email || 'User').trim().split(/\s+/)[0];
  const [headerLabel, setHeaderLabel] = useState(firstName);
  const [headerIcon, setHeaderIcon] = useState(ICON_OPTIONS[Math.floor(Math.random() * ICON_OPTIONS.length)]);

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
        <div className={styles.brand}>{t('nav.adminPanel')}</div>
        <div className={styles.headerActions} ref={accountMenuRef}>
          {/* Chat icon */}
          <div className={styles.headerActionWrap}>
            <button
              type="button"
              className={styles.headerActionBtn}
              onClick={() => { startLoading(); navigate('/admin/chat'); setTimeout(() => stopLoading(), 450); }}
              aria-label="Chat"
              title="Chat"
            >
              <FaComments />
            </button>
            {chatCount > 0 && <span className={styles.headerActionBadge}>{chatCount > 99 ? '99+' : chatCount}</span>}
          </div>
          {/* Announcement icon */}
          <div className={styles.headerActionWrap}>
            <button
              type="button"
              className={styles.headerActionBtn}
              onClick={() => { startLoading(); navigate('/admin/announcements'); setTimeout(() => stopLoading(), 450); }}
              aria-label="Announcements"
              title="Announcements"
            >
              <FaBullhorn />
            </button>
            {announcementCount > 0 && <span className={styles.headerActionBadge}>{announcementCount > 99 ? '99+' : announcementCount}</span>}
          </div>
          {/* Account avatar */}
          <button
            type="button"
            className={styles.accountTriggerBtn}
            onClick={() => setAccountMenuOpen((prev) => !prev)}
            aria-label="Account menu"
            aria-expanded={accountMenuOpen}
            aria-controls="admin-account-menu"
            title={adminLabel}
          >
            <span className={styles.headerAvatar}>
              {avatarSrc ? (
                <img src={avatarSrc} alt={`${adminLabel} avatar`} className={styles.headerAvatarImage} />
              ) : (
                avatarLabel
              )}
            </span>
            <FaChevronDown className={`${styles.accountChevron} ${accountMenuOpen ? styles.accountChevronOpen : ''}`} />
          </button>
          {accountMenuOpen && (
            <div id="admin-account-menu" className={styles.accountMenu} role="menu" aria-label="Account">
              <div className={styles.accountMenuHeader}>{adminLabel}</div>
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
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
                <button type="button" className={styles.accountMenuItem} onClick={onLogout} role="menuitem">
                  <FaSignOutAlt className={styles.navIcon} />
                  <span className={styles.accountMenuLabel}>{t('nav.logout')}</span>
                </button>
              </div>
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
              className={styles.navLink}
              onClick={() => setManageUsersOpen((prev) => !prev)}
              aria-expanded={manageUsersOpen}
            >
              <FaUsers className={styles.navIcon} />
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%' }}>
                <span>Manage Users</span>
                <FaChevronDown className={`${styles.accountChevron} ${manageUsersOpen ? styles.accountChevronOpen : ''}`} />
              </span>
            </button>
            {manageUsersOpen ? (
              <div className={styles.navSubgroup}>
                <NavLink to="/admin/manage-users/candidates" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`} onClick={onNavClick}>
                  <FaUsers className={styles.navIcon} />
                  <span>Candidates</span>
                </NavLink>
                <NavLink to="/admin/manage-users/lecturers" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`} onClick={onNavClick}>
                  <FaChalkboardTeacher className={styles.navIcon} />
                  <span>Lecturers</span>
                </NavLink>
                {isDeveloper ? (
                  <NavLink to="/admin/manage-users/admins" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`} onClick={onNavClick}>
                    <FaUserCircle className={styles.navIcon} />
                    <span>Admin Management</span>
                  </NavLink>
                ) : null}
              </div>
            ) : null}

            <button
              type="button"
              className={`${styles.navLink} ${isReportsActive ? styles.active : ''}`}
              onClick={() => setReportsOpen((prev) => !prev)}
              aria-expanded={reportsOpen}
            >
              <FaFileAlt className={styles.navIcon} />
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%' }}>
                <span>Reports</span>
                <FaChevronDown className={`${styles.accountChevron} ${reportsOpen ? styles.accountChevronOpen : ''}`} />
              </span>
            </button>
            {reportsOpen ? (
              <div className={styles.navSubgroup}>
                <NavLink
                  to="/admin/reports"
                  className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                  onClick={onNavClick}
                >
                  <FaFileAlt className={styles.navIcon} />
                  <span>Verified Report</span>
                </NavLink>
                <NavLink
                  to="/admin/reports/writing-guide"
                  className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}
                  onClick={onNavClick}
                >
                  <FaFileAlt className={styles.navIcon} />
                  <span>Report Writing Guide</span>
                </NavLink>
              </div>
            ) : null}

            {navItems.map(({ to, label, icon: Icon, badge }) => (
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

      <footer className={styles.footer}>
        <NavLink to="/admin" end className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
          <FaHome />
          <span>Home</span>
        </NavLink>
        {isDeveloper ? (
          <>
            <NavLink to="/admin/ads" className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
              <FaAd />
              <span>Ads</span>
            </NavLink>
            <NavLink to="/admin/manage-billing" className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
              <FaCreditCard />
              <span>Subscription</span>
            </NavLink>
          </>
        ) : (
          <>
            <NavLink to="/admin/question-papers" className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
              <FaUpload />
              <span>Add-Paper</span>
            </NavLink>
            <NavLink to="/admin/reports" className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
              <FaFileAlt />
              <span>Add-Report</span>
            </NavLink>
            <NavLink to="/admin/reports/publish-results" className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
              <FaFileAlt />
              <span>Publish Results</span>
            </NavLink>
            <NavLink to="/admin/faqs" className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
              <FaCommentDots />
              <span>FAQs</span>
            </NavLink>
          </>
        )}
        <NavLink to="/admin/profile" className={({ isActive }) => isActive ? styles.footerLinkActive : ''}>
          <FaUserCircle />
          <span>Profile</span>
        </NavLink>
      </footer>

      <FloatingAIIcon
        targetPath="/admin/ai-assistant"
        storageKey="admin_floating_ai_position_v1"
        ariaLabel="Open AI assistant"
        title="AI Assistant"
      />
      <AdDisplay />
    </div>
  );
};

export default AdminShell;
