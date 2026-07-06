import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import styles from '../Astyles/PageNotFound.module.css';
import * as PhosphorIcons from 'phosphor-react';

const PageNotFound = () => {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const handleGoBack = () => {
    navigate(-1);
  };

  const handleGoHome = () => {
    navigate('/');
  };

  const handleBrowsePapers = () => {
    navigate('/candidate/question-papers');
  };

  const handleFindLecturers = () => {
    navigate('/candidate/lecturers');
  };

  const handleMyDashboard = () => {
    navigate(isAuthenticated ? '/candidate' : '/login');
  };

  const handleHelpCenter = () => {
    navigate('/documentation');
  };

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.headerContent}>
          <div>
            <span className={styles.errorLabel}>404 ERROR</span>
            <h1>Oops! Page not found</h1>
            <p className={styles.description}>
              The page you're looking for doesn't exist or has been moved.
            </p>
            <p className={styles.subDescription}>
              Don't worry, let's get you back on track.
            </p>
          </div>

          <div className={styles.illustration}>
            <svg
              viewBox="0 0 400 300"
              className={styles.svg}
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Book illustration */}
              <rect x="60" y="120" width="280" height="140" rx="8" fill="#E8F5E9" stroke="#4CAF50" strokeWidth="2" />
              <rect x="70" y="130" width="260" height="120" fill="#F1F8E9" />
              <path d="M 200 130 L 200 250" stroke="#4CAF50" strokeWidth="2" />
              <circle cx="200" cy="100" r="30" fill="#4CAF50" />
              <circle cx="200" cy="100" r="24" fill="none" stroke="#FFF" strokeWidth="2" />
              <text x="200" y="110" textAnchor="middle" fontSize="40" fontWeight="bold" fill="#FFF">
                404
              </text>

              {/* Clouds */}
              <ellipse cx="80" cy="40" rx="35" ry="25" fill="#C8E6C9" opacity="0.7" />
              <ellipse cx="100" cy="35" rx="25" ry="20" fill="#C8E6C9" opacity="0.7" />
              <ellipse cx="310" cy="60" rx="40" ry="28" fill="#C8E6C9" opacity="0.7" />
              <ellipse cx="335" cy="55" rx="28" ry="22" fill="#C8E6C9" opacity="0.7" />

              {/* Magnifying glass */}
              <circle cx="310" cy="85" r="20" fill="none" stroke="#4CAF50" strokeWidth="3" />
              <line x1="325" y1="100" x2="340" y2="115" stroke="#4CAF50" strokeWidth="3" />
            </svg>
          </div>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.primaryBtn} onClick={handleGoHome}>
            <PhosphorIcons.House size={20} weight="bold" />
            Go to Homepage
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={handleGoBack}>
            <PhosphorIcons.CaretLeft size={20} weight="bold" />
            Go Back
          </button>
        </div>
      </header>

      <section className={styles.linksSection}>
        <h2>Here are some helpful links</h2>
        
        <div className={styles.linksGrid}>
          <button type="button" className={styles.linkCard} onClick={handleBrowsePapers}>
            <div className={styles.linkIcon}>
              <PhosphorIcons.FileText size={32} weight="duotone" />
            </div>
            <h3>Browse Papers</h3>
            <p>Explore past questions and study materials.</p>
            <span className={styles.linkArrow}>
              <PhosphorIcons.CaretRight size={20} />
            </span>
          </button>

          <button type="button" className={styles.linkCard} onClick={handleFindLecturers}>
            <div className={styles.linkIcon}>
              <PhosphorIcons.Users size={32} weight="duotone" />
            </div>
            <h3>Find Lecturers</h3>
            <p>Connect with expert lecturers and tutors.</p>
            <span className={styles.linkArrow}>
              <PhosphorIcons.CaretRight size={20} />
            </span>
          </button>

          <button type="button" className={styles.linkCard} onClick={handleMyDashboard}>
            <div className={styles.linkIcon}>
              <PhosphorIcons.SquaresFour size={32} weight="duotone" />
            </div>
            <h3>My Dashboard</h3>
            <p>Access your dashboard and continue learning.</p>
            <span className={styles.linkArrow}>
              <PhosphorIcons.CaretRight size={20} />
            </span>
          </button>

          <button type="button" className={styles.linkCard} onClick={handleHelpCenter}>
            <div className={styles.linkIcon}>
              <PhosphorIcons.Headset size={32} weight="duotone" />
            </div>
            <h3>Help Center</h3>
            <p>Get support or report an issue.</p>
            <span className={styles.linkArrow}>
              <PhosphorIcons.CaretRight size={20} />
            </span>
          </button>
        </div>
      </section>

      <section className={styles.supportSection}>
        <div className={styles.supportContent}>
          <PhosphorIcons.Lightbulb size={40} weight="duotone" className={styles.supportIcon} />
          <div>
            <h3>Still can't find what you're looking for?</h3>
            <p>Our support team is always ready to help you out.</p>
          </div>
        </div>
        <button type="button" className={styles.contactBtn} onClick={handleHelpCenter}>
          Contact Support
        </button>
      </section>

      <footer className={styles.footer}>
        <p>© 2025 ACADEX. All rights reserved.</p>
        <p className={styles.tagline}>Empowering HND students to excel. <span className={styles.heart}>❤️</span></p>
      </footer>
    </div>
  );
};

export default PageNotFound;
