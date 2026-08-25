import React, { useEffect, useState } from 'react';
import { NavLink, Outlet, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { FaBars, FaTimes, FaHome, FaClipboardList, FaUsers, FaSignOutAlt, FaUserCircle, FaChevronDown } from 'react-icons/fa';
import { useAuth } from '../../context/AuthContext';
import styles from '../../Astyles/DashboardShell.module.css';

export default function ConcoursPartnerShell() {
  const { user, isAuthenticated, logout } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const role = String(user?.role || '').toLowerCase();
  useEffect(() => setSidebarOpen(false), [location.pathname]);
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (role !== 'concour_partner') return <Navigate to={role === 'candidate' ? '/candidate' : '/admin'} replace />;
  const nav = (path) => { navigate(path); setSidebarOpen(false); };
  return <div className={styles.shell}>
    <div className={styles.sidebarHeader}><button type="button" className={styles.sidebarHomeLink} onClick={() => nav('/partner')}><strong>ACADEX</strong><span className={styles.sidebarHomeMeta}>Concours Partner</span></button></div>
    <header className={styles.header}><button type="button" className={styles.iconBtn} onClick={() => setSidebarOpen(true)} aria-label="Open menu"><FaBars /></button><div className={styles.brand}>Concours Partner Portal</div><div className={styles.headerActions}><button type="button" className={styles.accountTriggerBtn} onClick={() => nav('/partner/profile')} title={user?.name || 'Organization'}><span className={styles.headerAvatar}>{user?.name?.charAt(0).toUpperCase() || 'P'}</span><FaChevronDown className={styles.accountChevron} /></button></div></header>
    <div className={styles.body}><aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}><div className={styles.sidebarTop}><div className={styles.sidebarTitle}>Navigation</div><button type="button" className={styles.iconBtn} onClick={() => setSidebarOpen(false)} aria-label="Close menu"><FaTimes /></button></div><nav className={styles.nav}><NavLink to="/partner" end className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}><FaHome /> Overview</NavLink><NavLink to="/partner/concours/manage" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}><FaClipboardList /> My Concours</NavLink><NavLink to="/partner/applications" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}><FaUsers /> Applications</NavLink><NavLink to="/partner/profile" className={({ isActive }) => `${styles.navLink} ${isActive ? styles.active : ''}`}><FaUserCircle /> Organization</NavLink></nav><div className={styles.sidebarFooter}><button type="button" className={styles.logoutBtn} onClick={logout}><FaSignOutAlt /> Logout</button></div></aside>{sidebarOpen && <div className={styles.backdrop} onClick={() => setSidebarOpen(false)} />}<main className={styles.main}><Outlet /></main></div>
    <footer className={styles.footer}><NavLink to="/partner" end><FaHome /><span>Home</span></NavLink><NavLink to="/partner/concours/manage"><FaClipboardList /><span>Concours</span></NavLink><NavLink to="/partner/applications"><FaUsers /><span>Applications</span></NavLink><NavLink to="/partner/profile"><FaUserCircle /><span>Profile</span></NavLink></footer>
  </div>;
}
