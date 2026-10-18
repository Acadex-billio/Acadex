import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  BookOpen,
  CaretLeft,
  CaretRight,
  FileText,
  GraduationCap,
  Headset,
  House,
  Lightbulb,
  Users,
} from 'phosphor-react';
import PublicHeader from './PublicHeader';
import PublicFooter from './PublicFooter';
import styles from '../Astyles/PageNotFound.module.css';

const PageNotFound = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuth();
  const dashboardPath = isAuthenticated
    ? user?.role === 'lecturer'
      ? '/lecturer'
      : user?.role === 'admin' || user?.role === 'developer' || user?.is_admin
        ? '/admin'
        : user?.role === 'concour_partner'
          ? '/partner'
          : '/candidate'
    : '/login';

  const helpfulLinks = [
    {
      title: 'Browse Papers',
      description: 'Explore past questions and study materials.',
      icon: FileText,
      href: '/materials',
    },
    {
      title: 'Find Lecturers',
      description: 'Connect with expert lecturers and tutors.',
      icon: Users,
      href: '/candidate/lecturers',
    },
    {
      title: 'My Dashboard',
      description: 'Access your dashboard and continue learning.',
      icon: GraduationCap,
      href: dashboardPath,
    },
    {
      title: 'Help Center',
      description: 'Get support or report an issue.',
      icon: Headset,
      href: '/documentation',
    },
  ];

  return (
    <div className={styles.page}>
      <PublicHeader />
      <main className={styles.main}>
        <section className={styles.hero} aria-labelledby="not-found-title">
          <div className={styles.heroCopy}>
            <span className={styles.errorLabel}><span aria-hidden="true">●</span> 404 ERROR</span>
            <h1 id="not-found-title">Oops! <span>Page not found</span></h1>
            <p>The page you’re looking for doesn’t exist or has been moved.</p>
            <p className={styles.subDescription}>Don’t worry, let’s get you back on track.</p>
            <div className={styles.actions}>
              <Link to="/" className={styles.primaryButton}><House size={18} /> Go to Homepage</Link>
              <button type="button" className={styles.secondaryButton} onClick={() => navigate(-1)}>
                <CaretLeft size={18} /> Go Back
              </button>
            </div>
          </div>

          <div className={styles.illustration} aria-hidden="true">
            <svg viewBox="0 0 620 330" role="presentation">
              <ellipse cx="315" cy="294" rx="270" ry="20" fill="#e6f0eb" />
              <path d="M95 95c0-15 13-27 29-27 7-19 34-21 46-5 21-5 37 9 36 27H95Z" fill="#dcefe3" />
              <path d="M470 89c0-12 10-22 23-22 6-15 28-17 38-4 17-4 29 7 29 22h-90Z" fill="#dcefe3" />
              <path d="m388 42 44 2-27 20-3-13-14-9Z" fill="#20a34f" />
              <text x="309" y="231" textAnchor="middle" fill="#159a49" fontFamily="Arial, sans-serif" fontSize="184" fontWeight="800" letterSpacing="-12">404</text>
              <path d="M106 261c61-31 122-29 183 1v29c-62-28-121-30-183-1v-29Z" fill="#fff" stroke="#d9e6de" strokeWidth="3" />
              <path d="M289 262c61-30 122-32 184-1v29c-62-29-121-27-184 1v-29Z" fill="#fff" stroke="#d9e6de" strokeWidth="3" />
              <path d="M289 264v28c-11-10-21-10-32 0v-29c11-9 21-9 32 1Z" fill="#a7d8b4" />
              <path d="M102 291c62-29 123-27 187 2 61-29 122-31 187-2" fill="none" stroke="#169a49" strokeWidth="7" strokeLinecap="round" />
              <path d="M119 253v-27m0 18c-14-12-21-19-24-32 13 4 22 13 24 32Zm1-4c9-17 17-25 30-29-1 14-11 25-30 29Zm-1 11c-5-17-5-31 2-43 8 12 8 26-2 43Z" fill="#26a454" />
              <path d="M105 255h28l-4 27h-20l-4-27Z" fill="#253443" />
              <circle cx="455" cy="151" r="37" fill="none" stroke="#273847" strokeWidth="6" />
              <path d="m482 178 35 31" stroke="#273847" strokeWidth="10" strokeLinecap="round" />
              <path d="M63 277h39m-35-10h35m-31-10h31" stroke="#278e4a" strokeWidth="7" strokeLinecap="round" />
              <path d="M518 264h47v27h-47z" fill="#f4f8f5" stroke="#d6e3db" strokeWidth="2" />
              <path d="M518 267h47" stroke="#198f45" strokeWidth="5" />
              <path d="m540 275 5-5 5 5v7h-10v-7Zm2 0v-3h6v3" fill="none" stroke="#168b43" strokeWidth="2" />
              <path d="M79 125h9m-4-4v9m430 4h8m-4-4v8m-367 18h8m-4-4v8" stroke="#b4dbc0" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        </section>

        <section className={styles.helpful} aria-labelledby="helpful-links-title">
          <div className={styles.sectionTitle}>
            <span />
            <h2 id="helpful-links-title">Here are some helpful links</h2>
            <span />
          </div>
          <div className={styles.linksGrid}>
            {helpfulLinks.map(({ title, description, icon: Icon, href }) => (
              <Link key={title} to={href} className={styles.linkCard}>
                <span className={styles.linkIcon}><Icon size={27} weight="regular" /></span>
                <span className={styles.linkCopy}>
                  <strong>{title}</strong>
                  <span>{description}</span>
                </span>
                <CaretRight className={styles.linkArrow} size={19} />
              </Link>
            ))}
          </div>
        </section>

        <section className={styles.support}>
          <div className={styles.supportCopy}>
            <Lightbulb size={34} weight="duotone" />
            <div>
              <h2>Still can’t find what you’re looking for?</h2>
              <p>Our support team is always ready to help you out.</p>
            </div>
          </div>
          <a className={styles.supportButton} href="https://wa.link/qt7d0t" target="_blank" rel="noopener noreferrer">
            <BookOpen size={17} /> Contact Support
          </a>
        </section>
      </main>
      <PublicFooter />
    </div>
  );
};

export default PageNotFound;
