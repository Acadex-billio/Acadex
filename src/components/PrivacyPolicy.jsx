import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import styles from '../Astyles/LegalPage.module.css';

const PrivacyPolicy = () => {
  return (
    <main className={styles.page}>
      <Helmet>
        <title>Privacy Policy | Acadex</title>
        <meta
          name="description"
          content="Read how Acadex collects, stores, and protects user data for secure educational access."
        />
        <meta name="robots" content="index,follow" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Acadex" />
        <meta property="og:title" content="Privacy Policy | Acadex" />
        <meta
          property="og:description"
          content="Understand how Acadex collects, uses, and protects user data for secure educational access."
        />
        <meta property="og:url" content="https://hnd-platform.vercel.app/privacy-policy" />
        <meta property="og:image" content="https://hnd-platform.vercel.app/hnd-mark.svg" />
        <meta name="twitter:card" content="summary" />
        <meta name="twitter:title" content="Privacy Policy | Acadex" />
        <meta
          name="twitter:description"
          content="Understand how Acadex collects, uses, and protects user data for secure educational access."
        />
        <meta name="twitter:image" content="https://hnd-platform.vercel.app/hnd-mark.svg" />
        <link rel="canonical" href="https://hnd-platform.vercel.app/privacy-policy" />
      </Helmet>

      <section className={styles.panel}>
        <h1>Privacy Policy</h1>
        <p className={styles.updated}>Effective date: April 3, 2026</p>

        <h2>1. Information We Collect</h2>
        <p>
          We collect account details needed for platform access, including identity, department affiliation,
          and security preferences.
        </p>

        <h2>2. How We Use Data</h2>
        <p>
          Data is used to authenticate users, personalize access to academic resources, deliver notifications,
          and maintain service integrity.
        </p>

        <h2>3. Data Protection</h2>
        <p>
          We apply role-based access controls, token-based authentication, and infrastructure safeguards to reduce
          unauthorized access risk.
        </p>

        <h2>4. Data Sharing</h2>
        <p>
          We do not sell personal information. Data may only be shared with authorized service providers required
          to operate the platform infrastructure.
        </p>

        <h2>5. Your Rights</h2>
        <p>
          You may request correction of inaccurate profile details and can contact platform support for account-related
          privacy concerns.
        </p>

        <h2>6. Contact</h2>
        <p>
          For privacy requests, contact BrightStack Innovations at brightstackinnovations@gmail.com or 678507737.
        </p>

        <div className={styles.actions}>
          <Link to="/terms-of-service">View Terms of Service</Link>
          <Link to="/">Back to Home</Link>
        </div>
      </section>
    </main>
  );
};

export default PrivacyPolicy;
