import React from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import styles from '../Astyles/Documentation.module.css';
import { useLoading } from '../context/LoadingContext';

const docs = [
  {
    title: 'Question Papers',
    description: 'Browse and download previous HND examination question papers by department and level.'
  },
  {
    title: 'Reports',
    description: 'Access project and internship reports uploaded by admins for reference and review.'
  },
  {
    title: 'Presentations',
    description: 'Explore approved presentation materials and supporting slides in one place.'
  },
  {
    title: 'Announcements',
    description: 'Stay updated with important academic notices and platform updates.'
  }
];

const Documentation = () => {
  const navigate = useNavigate();
  const { startLoading, stopLoading } = useLoading();

  const navigateWithLoader = (path) => {
    startLoading();
    navigate(path);
    setTimeout(() => stopLoading(), 450);
  };

  return (
    <main className={styles.page}>
      <Helmet>
        <title>Documentation | Acadex</title>
        <meta
          name="description"
          content="Learn how Acadex helps students and admins share question papers, reports, presentations, and announcements."
        />
        <meta name="robots" content="index,follow" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Acadex" />
        <meta property="og:title" content="About Acadex | Documentation" />
        <meta
          property="og:description"
          content="Understand key Acadex features, including question papers, reports, presentations, and announcements."
        />
        <meta property="og:url" content="https://hnd-platform.vercel.app/documentation" />
        <meta property="og:image" content="https://hnd-platform.vercel.app/hnd-mark.svg" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="About Acadex | Documentation" />
        <meta
          name="twitter:description"
          content="A quick guide to the academic resources and tools available on Acadex."
        />
        <meta name="twitter:image" content="https://hnd-platform.vercel.app/hnd-mark.svg" />
        <link rel="canonical" href="https://hnd-platform.vercel.app/documentation" />
      </Helmet>

      <section className={styles.panel}>
        <p className={styles.kicker}>Platform Guide</p>
        <h1 className={styles.title}>Acadex Documentation</h1>
        <p className={styles.subtitle}>
          The platform centralizes academic resources for Higher National Diploma students.
          Use this page as a quick reference for what is available after sign in.
        </p>

        <div className={styles.grid}>
          {docs.map((item) => (
            <article key={item.title} className={styles.card}>
              <h2>{item.title}</h2>
              <p>{item.description}</p>
            </article>
          ))}
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.primaryBtn} onClick={() => navigateWithLoader('/login')}>
            Go to Login
          </button>
          <button type="button" className={styles.secondaryBtn} onClick={() => navigateWithLoader('/')}>
            Back to Home
          </button>
        </div>
      </section>
    </main>
  );
};

export default Documentation;
