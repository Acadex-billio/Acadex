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
        <p className={styles.updated}>Effective date: July 25, 2026</p>

        <p>
          Acadex is committed to protecting the privacy of students, lecturers, administrators, and visitors. This policy
          explains what information we collect, how we use it, how we protect it, and the choices you have when using the
          platform.
        </p>

        <h2>1. Information We Collect</h2>
        <p>
          We collect account and profile information such as your name, email address, phone number, role, institution,
          department, student or lecturer details, and authentication information needed to secure your access. We also
          process information related to your academic activity, including uploads, downloads, reports viewed, tutoring
          bookings, payments, announcements read, and chat participation where applicable.
        </p>

        <h2>2. How We Use Your Information</h2>
        <p>
          Your information is used to create and manage your account, verify your role, personalize academic access,
          deliver notifications, support payments, provide tutoring and chat services, improve platform reliability, monitor
          abuse, and maintain the integrity of the academic environment. We may also use data to improve features such as
          question-paper access, report visibility, presentation libraries, AI study assistance, and admin controls.
        </p>

        <h2>3. Academic Content and User-Generated Data</h2>
        <p>
          Reports, presentations, question papers, internship topics, chat messages, and other content uploaded by users may be
          stored and processed on our systems so they can be searched, viewed, shared within the approved scope of the platform,
          or moderated by administrators. Content may be used to support study, academic reference, and platform operations.
        </p>
        <p>
          Users are responsible for ensuring that any content they upload is lawful, accurate, and authorized for sharing.
          We may remove or restrict content where it violates academic integrity standards, copyright expectations, or
          our community rules.
        </p>

        <h2>4. Data Protection and Security</h2>
        <p>
          Acadex uses role-based access controls, secure authentication mechanisms, protected browser sessions, and other
          reasonable safeguards to help protect your information. Access to sensitive data is limited to authorized personnel,
          and we take steps to reduce the risk of unauthorized access, misuse, or disclosure.
        </p>

        <h2>5. Sharing of Information</h2>
        <p>
          Acadex does not sell personal information. We may share information with trusted service providers that help us
          operate payment processing, hosting, analytics, email delivery, support tools, or other technical functions.
          These partners are expected to handle data responsibly and only for approved operational purposes.
        </p>

        <h2>6. Cookies, Local Storage, and Device Data</h2>
        <p>
          Acadex uses cookies and browser storage to keep users signed in, remember preferences, improve performance,
          manage sessions, and support platform features such as language selection and notifications. We do not expose
          sensitive authentication tokens to third-party scripts.
        </p>

        <h2>7. Your Rights and Choices</h2>
        <p>
          You may request access to, correction of, or clarification about your personal information where applicable. You may
          also raise concerns about privacy practices or request the review of data handling issues through our support system.
          Where required by applicable law, we will respond fairly and within a reasonable timeframe.
        </p>

        <h2>8. Chat Messages, Moderation, and Monitoring</h2>
        <p>
          Messages, group chats, tutoring communication, and other user-generated interactions may be reviewed for moderation,
          safety, and compliance with platform rules. We may retain or inspect such data where necessary to prevent abuse,
          enforce the rules, protect the academic environment, or investigate misconduct.
        </p>

        <h2>9. Retention and Deletion</h2>
        <p>
          We retain personal and account-related data for as long as needed to provide the service, meet legal or operational
          requirements, and support account security. If your account is closed, some information may be retained where required
          by law or necessary to protect the platform and other users.
        </p>

        <h2>10. Contact and Complaints</h2>
        <p>
          For privacy concerns, account questions, or requests, contact BrightStack Innovations at
          <a href="mailto:brightstackinnovations@gmail.com">brightstackinnovations@gmail.com</a> or
          <a href="https://wa.me/237678507737" target="_blank" rel="noreferrer">WhatsApp +237 678 507 737</a>.
        </p>

        <h2>11. Changes to This Policy</h2>
        <p>
          Acadex may update this Privacy Policy as the platform grows. Continued use of the service after changes means you
          accept the revised policy.
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
