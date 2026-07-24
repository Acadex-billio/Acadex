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
        <meta property="og:url" content="https://www.acadexe.com/privacy-policy" />
        <meta property="og:image" content="https://www.acadexe.com/logo192.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@AcadexOfficial" />
        <meta name="twitter:creator" content="@AcadexOfficial" />
        <meta name="twitter:title" content="Privacy Policy | Acadex" />
        <meta
          name="twitter:description"
          content="Understand how Acadex collects, uses, and protects user data for secure educational access."
        />
        <meta name="twitter:image" content="https://www.acadexe.com/logo192.png" />
        <meta name="twitter:image:alt" content="Acadex privacy policy" />
        <link rel="canonical" href="https://www.acadexe.com/privacy-policy" />
        <meta name="keywords" content="Acadex privacy policy, data protection, HND student privacy, BTS platform security" />
      </Helmet>

      <section className={styles.panel}>
        <h1>Privacy Policy</h1>
        <p className={styles.updated}>Effective date: April 3, 2026</p>

        <h2>1. Information We Collect</h2>
        <p>
          Acadex collects information required to create and verify user accounts, including name, email, student ID,
          department affiliation, role, and security preferences. We may also store usage data to improve the platform.
        </p>

        <h2>2. How We Use Data</h2>
        <p>
          Data is used to authenticate HND/BTS candidates, lecturers, and administrators, personalize academic access,
          deliver notifications, process payments, and preserve service integrity.
        </p>

        <h2>3. Data Protection</h2>
        <p>
          We protect user data with role-based access controls, JWT authentication, secure cookie handling, and
          encrypted transport. Access is limited to authorized users and platform administrators.
        </p>

        <h2>4. Data Sharing</h2>
        <p>
          Acadex does not sell personal information. Personal data may only be shared with authorized service providers
          that support the platform’s operation, such as payment processors and cloud infrastructure partners.
        </p>

        <h2>5. Your Rights</h2>
        <p>
          You may request correction of inaccurate profile information, ask for account access details, or raise privacy
          concerns with platform support. Acadex will review and respond to reasonable requests in a timely manner.
        </p>

        <h2>6. Cookies and Local Storage</h2>
        <p>
          Acadex uses cookies and local storage for session handling, language preferences, and performance improvements.
          Sensitive authentication tokens are protected and not exposed to third-party scripts.
        </p>

        <h2>7. Email and Notification Delivery</h2>
        <p>
          We send important account and academic notifications by email, and in-app toast notifications may appear for
          updates such as report uploads, announcements, and chat messages.
        </p>

        <h2>8. Support and Complaints</h2>
        <p>
          For privacy requests or complaints, contact BrightStack Innovations at
          <a href="mailto:brightstackinnovations@gmail.com">brightstackinnovations@gmail.com</a> or
          <a href="https://wa.me/237678507737" target="_blank" rel="noreferrer">WhatsApp +237 678 507 737</a>.
          You can also submit concerns through the platform feedback portal.
        </p>

        <h2>9. Changes to This Policy</h2>
        <p>
          Acadex may update this Privacy Policy as the platform evolves. Continued use of the site after updates
          means you accept the revised policy.
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
