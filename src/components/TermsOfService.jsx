import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import styles from '../Astyles/LegalPage.module.css';

const TermsOfService = () => {
  return (
    <main className={styles.page}>
      <Helmet>
        <title>Terms of Service | Acadex</title>
        <meta
          name="description"
          content="Read the Terms of Service for Acadex, including permitted use, account responsibilities, and platform rules."
        />
        <meta name="robots" content="index,follow" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Acadex" />
        <meta property="og:title" content="Terms of Service | Acadex" />
        <meta
          property="og:description"
          content="Review permitted use, account responsibilities, and platform rules for using Acadex."
        />
        <meta property="og:url" content="https://hnd-platform.vercel.app/terms-of-service" />
        <meta property="og:image" content="https://hnd-platform.vercel.app/hnd-mark.svg" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Terms of Service | Acadex" />
        <meta
          name="twitter:description"
          content="Review permitted use, account responsibilities, and platform rules for using Acadex."
        />
        <meta name="twitter:image" content="https://hnd-platform.vercel.app/hnd-mark.svg" />
        <link rel="canonical" href="https://hnd-platform.vercel.app/terms-of-service" />
      </Helmet>

      <section className={styles.panel}>
        <h1>Terms of Service</h1>
        <p className={styles.updated}>Effective date: April 3, 2026</p>

        <h2>1. Eligibility and Access</h2>
        <p>
          Access to Acadex is restricted to verified and registered students, authorized academic staff,
          and approved administrators.
        </p>

        <h2>2. Acceptable Use</h2>
        <p>
          You agree to use the platform only for educational and academic purposes. Unauthorized redistribution,
          scraping, tampering, or misuse of materials is prohibited.
        </p>

        <h2>3. Account Security</h2>
        <p>
          You are responsible for all activity under your account. Keep your credentials private and report any
          unauthorized access immediately.
        </p>

        <h2>4. Academic Content</h2>
        <p>
          Materials are provided for learning and revision. Ownership and academic rights remain with original
          authors, departments, and institutions where applicable.
        </p>

        <h2>5. Service Availability</h2>
        <p>
          We strive for high availability but may perform maintenance, updates, or security actions that temporarily
          limit access.
        </p>

        <h2>6. Contact</h2>
        <p>
          For terms inquiries, contact BrightStack Innovations at brightstackinnovations@gmail.com or 678507737.
        </p>

        <div className={styles.actions}>
          <Link to="/privacy-policy">View Privacy Policy</Link>
          <Link to="/">Back to Home</Link>
        </div>
      </section>
    </main>
  );
};

export default TermsOfService;
