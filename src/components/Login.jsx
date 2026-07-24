import React, { useState } from 'react';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import ResetPassword from './ResetPassword';
import AcademicHeroIllustration from './AcademicHeroIllustration';
import styles from '../Astyles/Login.module.css';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import { useLoading } from '../context/LoadingContext';

const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showReset, setShowReset] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const { login } = useAuth();
  const { startLoading, stopLoading } = useLoading();
  const { t, i18n } = useTranslation();

  const triggerLinkLoading = () => {
    startLoading();
    setTimeout(() => stopLoading(), 450);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    startLoading();
    try {
      const result = await login(email, password);
      
      if (result.success) {
        showToast('Login successful! Redirecting...', 'success');
        
        // Navigate based on user role
        const user = result.user;
        const role = String(user.role || '').toLowerCase();
        const isAdmin = role ? (role === 'admin' || role === 'superadmin' || role === 'developer') : Boolean(user.is_admin);
        const isLecturer = role === 'lecturer';

        if (isAdmin) {
          navigate('/admin');
        } else if (isLecturer) {
          navigate('/lecturer');
        } else {
          const status = String(user.account_status || 'active');
          navigate(status === 'active' ? '/candidate' : '/candidate/restricted');
        }
      } else {
        const msg = result?.data?.message || 'Login failed';
        showToast(msg, 'error');
      }
    } catch (error) {
      const msg = error?.response?.data?.message || getErrorMessage(error, 'Login failed. Please check your credentials.');
      showToast(msg, 'error');
    } finally {
      setSubmitting(false);
      stopLoading();
    }
  };

  return (
    <div className={styles.page}>
      <Helmet>
        <title>{t('loginPage.title')}</title>
        <meta
          name="description"
          content="Sign in to Acadex to access Higher National Diploma study resources, question papers, reports, and announcements."
        />
        <meta name="robots" content="index,follow" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Acadex" />
        <meta property="og:title" content="Acadex Login" />
        <meta
          property="og:description"
          content="Secure login for students and administrators to access HND academic resources and collaboration tools."
        />
        <meta property="og:url" content="https://www.acadexe.com/login" />
        <meta property="og:image" content="https://www.acadexe.com/logo192.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Acadex Login" />
        <meta
          name="twitter:description"
          content="Login to Acadex to access secure HND and BTS study resources, reports, presentations, and collaboration tools."
        />
        <meta name="twitter:image" content="https://www.acadexe.com/logo192.png" />
        <link rel="canonical" href="https://www.acadexe.com/login" />
        <meta name="keywords" content="Acadex login, HND portal, BTS student login, academic resource access" />
      </Helmet>

      <div className={styles.card}>
        {/* LEFT HERO ILLUSTRATION */}
        <div className={styles.imageSide}>
          <AcademicHeroIllustration />
        </div>

        {/* RIGHT FORM */}
        <div className={styles.formSide}>
          <div className={styles.topBar}>
            <Link to="/" className={styles.backHome} onClick={triggerLinkLoading}>{t('loginPage.backHome')}</Link>
            <select
              className={styles.languageSelect}
              value={i18n.language}
              onChange={(e) => i18n.changeLanguage(e.target.value)}
              aria-label={t('common.language')}
            >
              <option value="en">🇺🇸 {t('common.english')}</option>
              <option value="fr">🇫🇷 {t('common.french')}</option>
            </select>
          </div>

          <div className={styles.logoContainer}>
            <img src={process.env.PUBLIC_URL + '/acadex-logo.png'} alt="Acadex Logo" className={styles.logoImage} />
          </div>

          <h2>{t('loginPage.heading')}</h2>
          <p className={styles.subtitle}>
            {t('loginPage.subtitle')}
          </p>

          <form onSubmit={handleSubmit}>
            <label>{t('loginPage.email')}</label>
            <input
              type="email"
              placeholder={t('loginPage.emailPlaceholder')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />

            <label>{t('loginPage.password')}</label>
            <div className={styles.passwordWrapper}>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder={t('loginPage.passwordPlaceholder')}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <span onClick={() => setShowPassword(!showPassword)}>
                {showPassword ? <FaEyeSlash /> : <FaEye />}
              </span>
            </div>

            <button type="submit" disabled={submitting}>{t('loginPage.login')}</button>
          </form>

          <button
            className={styles.forgot}
            onClick={() => setShowReset(true)}
          >
            {t('loginPage.forgotPassword')}
          </button>

          <p className={styles.signup}>
            {t('loginPage.noAccount')} <Link to="/register" onClick={triggerLinkLoading}>{t('loginPage.signUpFree')}</Link>
          </p>
        </div>
      </div>

      {showReset && <ResetPassword onClose={() => setShowReset(false)} />}
    </div>
  );
};

export default Login;
