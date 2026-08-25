import React from 'react';
import { Helmet } from 'react-helmet';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import styles from '../Astyles/Home.module.css';
import { useLoading } from '../context/LoadingContext';
import { useAuth } from '../context/AuthContext';

const Home = () => {
    const navigate = useNavigate();
    const { startLoading, stopLoading } = useLoading();
    const { t, i18n } = useTranslation();
    const { isAuthenticated, user } = useAuth();

    const triggerLinkLoading = () => {
        startLoading();
        setTimeout(() => stopLoading(), 450);
    };

    const navigateWithLoader = (path) => {
        startLoading();
        navigate(path);
        setTimeout(() => stopLoading(), 450);
    };

    const handleGetStarted = () => {
        navigateWithLoader('/login');
    };

    const handleLearnMore = () => {
        navigateWithLoader('/documentation');
    };

    const getDashboardPath = () => {
        const role = String(user?.role || '').toLowerCase();
        const isAdmin = role ? (role === 'admin' || role === 'developer') : Boolean(user?.is_admin);
        const isLecturer = role === 'lecturer';
        if (isAdmin) return '/admin';
        if (isLecturer) return '/lecturer';
        const status = String(user?.account_status || 'active');
        return status === 'active' ? '/candidate' : '/candidate/restricted';
    };

    return (
        <div className={styles.page}>
            <Helmet>
                <title>{t('homePage.brand')} | Question Papers, Reports and Presentations</title>
                <meta name="description" content="Acadex helps HND, BTS, Bachelor, Licence, Masters, and researcher users access question papers, reports, presentations, internship topics, and academic collaboration tools from one portal." />
                <meta name="robots" content="index,follow" />
                <meta name="keywords" content="Acadex, academic resources, HND, BTS, Bachelor, Licence, Masters, researchers, question papers, reports, presentations, internship topics, academic collaboration" />
                <meta property="og:title" content="Acadex | Academic Resource Hub for HND, BTS, Bachelor, Licence, Masters, and Researchers" />
                <meta property="og:description" content="Explore verified academic resources for HND, BTS, Bachelor, Licence, Masters, lecturers, and researchers on Acadex." />
                <meta property="og:url" content="https://www.acadexe.com/" />
                <meta property="og:image" content="https://www.acadexe.com/logo192.png" />
                <meta name="twitter:card" content="summary_large_image" />
                <meta name="twitter:title" content="Acadex | Academic Resource Hub for HND, BTS, Bachelor, Licence, Masters, and Researchers" />
                <meta name="twitter:description" content="A secure portal for HND, BTS, Bachelor, Licence, Masters, lecturers, and researchers to access question papers, reports, presentations, and collaboration tools." />
                <meta name="twitter:image" content="https://www.acadexe.com/logo192.png" />
                <link rel="canonical" href="https://www.acadexe.com/" />
                <script type="application/ld+json">
                    {JSON.stringify({
                        '@context': 'https://schema.org',
                        '@type': 'EducationalOrganization',
                        name: 'Acadex',
                        url: 'https://www.acadexe.com/',
                        description: 'Access verified HND and BTS question papers, reports, presentations, internship topics, and academic collaboration tools in one platform.',
                        contactPoint: {
                            '@type': 'ContactPoint',
                            contactType: 'customer support',
                            telephone: '+237678507737',
                            email: 'brightstackinnovations@gmail.com',
                        },
                    })}
                </script>
            </Helmet>

            <div className={styles.heroCard}>
                <header className={styles.topBar}>
                    <div className={styles.brand}>
                        <img
                            src={process.env.PUBLIC_URL + '/acadex-logo.png'}
                            alt="Acadex logo"
                            className={styles.brandLogo}
                        />
                        <span className={styles.brandText}>{t('homePage.brand')}</span>
                    </div>

                    <nav className={styles.navLinks}>
                        <Link to="/" className={styles.navBtn} onClick={triggerLinkLoading}>{t('common.home')}</Link>
                        <Link to="/documentation" className={styles.navBtn} onClick={triggerLinkLoading}>{t('common.about')}</Link>
                        <Link to="/terms-of-service" className={styles.navBtn} onClick={triggerLinkLoading}>{t('common.terms')}</Link>
                        <Link to="/privacy-policy" className={styles.navBtn} onClick={triggerLinkLoading}>{t('common.privacy')}</Link>
                    </nav>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <select
                            value={i18n.language}
                            onChange={(e) => i18n.changeLanguage(e.target.value)}
                            aria-label={t('common.language')}
                            style={{ height: 38, borderRadius: 999, border: '1px solid rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.12)', color: '#fff', padding: '0 12px' }}
                        >
                            <option value="en" style={{ color: '#0f172a' }}>{t('common.english')}</option>
                            <option value="fr" style={{ color: '#0f172a' }}>{t('common.french')}</option>
                        </select>
                        {isAuthenticated ? (
                            <button type="button" className={styles.signInBtn} onClick={() => navigateWithLoader(getDashboardPath())}>Dashboard</button>
                        ) : (
                            <button type="button" className={styles.signInBtn} onClick={handleGetStarted}>{t('common.signIn')}</button>
                        )}
                    </div>
                </header>

                <section className={styles.heroBody}>
                    <h1 className={styles.title}>{t('homePage.title')}</h1>
                    <p className={styles.description}>{t('homePage.description')}</p>

                    <div className={styles.actions}>
                        <button className={styles.primaryBtn} onClick={isAuthenticated ? () => navigateWithLoader(getDashboardPath()) : handleGetStarted}>
                            {isAuthenticated ? 'Go to Dashboard' : t('homePage.accessButton')}
                        </button>
                        <p className={styles.accessNote}>{t('homePage.accessNote')}</p>
                        <button className={styles.secondaryBtn} onClick={handleLearnMore}>{t('homePage.learnMore')}</button>
                    </div>

                    <section className={styles.metrics} aria-label="Platform trust indicators">
                        <article className={styles.metricCard}>{t('homePage.metricsStudents')}</article>
                        <article className={styles.metricCard}>{t('homePage.metricsMaterials')}</article>
                        <article className={styles.metricCard}>{t('homePage.metricsTrusted')}</article>
                    </section>
                </section>

                <section className={styles.cardRow}>
                    <article className={styles.infoCard}>
                        <div className={styles.cardArt}>📄</div>
                        <h3>{t('homePage.pastPapers')}</h3>
                    </article>
                    <article className={styles.infoCard}>
                        <div className={styles.cardArt}>📊</div>
                        <h3>{t('homePage.reports')}</h3>
                    </article>
                    <article className={styles.infoCard}>
                        <div className={styles.cardArt}>💡</div>
                        <h3>{t('homePage.topics')}</h3>
                    </article>
                </section>

                <footer className={styles.siteFooter}>
                    <div className={styles.footerGrid}>
                        <Link to="/documentation" className={styles.footerLink} onClick={triggerLinkLoading}>{t('homePage.aboutPlatform')}</Link>
                        <a className={styles.footerLink} href="mailto:brightstackinnovations@gmail.com">Contact: brightstackinnovations@gmail.com</a>
                        <a className={styles.footerLink} href="tel:+237678507737">Phone: 678507737</a>
                        <Link to="/terms-of-service" className={styles.footerLink} onClick={triggerLinkLoading}>{t('common.terms')}</Link>
                        <Link to="/privacy-policy" className={styles.footerLink} onClick={triggerLinkLoading}>{t('common.privacy')}</Link>
                    </div>
                    <p className={styles.footerCopy}>© 2026 Acadex -- powered by BRIGHTSTACKINNOVATIONS -- www.brightsatinnovations.com Doula bonaberi</p>
                </footer>
            </div>
        </div>
    );
};

export default Home;