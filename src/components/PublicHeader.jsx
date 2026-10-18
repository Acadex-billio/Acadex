import React from 'react';
import { Link } from 'react-router-dom';
import { FileText, House, SquaresFour, UserCircle, Users } from 'phosphor-react';
import { useAuth } from '../context/AuthContext';
import styles from '../Astyles/PublicPageChrome.module.css';

const getDashboardPath = (user) => {
  if (!user) return '/login';
  const role = String(user.role || '').toLowerCase();
  if (role === 'admin' || role === 'developer' || user.is_admin) return '/admin';
  if (role === 'lecturer') return '/lecturer';
  if (role === 'concour_partner') return '/partner';
  return '/candidate';
};

const PublicHeader = () => {
  const { user, isAuthenticated } = useAuth();

  return (
    <header className={styles.header}>
      <Link to="/" className={styles.brand} aria-label="Acadex home">
        <img src={`${process.env.PUBLIC_URL}/acadex-logo.png`} alt="" />
        <span>ACADEX</span>
      </Link>
      <nav className={styles.navigation} aria-label="Main navigation">
        <Link to="/"><House size={21} weight="regular" /><span>Home</span></Link>
        <Link to="/materials"><FileText size={21} weight="regular" /><span>Papers</span></Link>
        <Link to="/candidate/lecturers"><Users size={21} weight="regular" /><span>Lecturers</span></Link>
        <Link to={isAuthenticated ? '/candidate/profile' : '/login'}><UserCircle size={21} weight="regular" /><span>Profile</span></Link>
      </nav>
      <Link to={getDashboardPath(user)} className={styles.dashboardButton}>
        <SquaresFour size={17} />
        <span>{isAuthenticated ? 'Go to Dashboard' : 'Sign in'}</span>
      </Link>
    </header>
  );
};

export default PublicHeader;
