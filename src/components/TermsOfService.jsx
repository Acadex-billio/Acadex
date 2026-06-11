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
        <meta property="og:url" content="https://www.acadexe.com/terms-of-service" />
        <meta property="og:image" content="https://www.acadexe.com/hnd-mark.svg" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@AcadexOfficial" />
        <meta name="twitter:creator" content="@AcadexOfficial" />
        <meta name="twitter:title" content="Terms of Service | Acadex" />
        <meta
          name="twitter:description"
          content="Review permitted use, account responsibilities, and platform rules for using Acadex."
        />
        <meta name="twitter:image" content="https://www.acadexe.com/hnd-mark.svg" />
        <meta name="twitter:image:alt" content="Acadex Terms of Service" />
        <link rel="canonical" href="https://www.acadexe.com/terms-of-service" />
        <meta name="keywords" content="Acadex terms of service, platform rules, HND student agreement, BTS platform terms" />
      </Helmet>

      <section className={styles.panel}>
        <h1>Acadex Terms of Service</h1>
        <p className={styles.updated}>Effective date: April 3, 2026</p>

        <h2>1. Eligibility and Access</h2>
        <p>
          Acadex is designed for HND and BTS candidates, verified lecturers, and authorized administrators.
          All users must provide accurate registration details. False or misleading information may result in access
          suspension or termination.
        </p>

        <h2>2. Acceptable Use Policy</h2>
        <p>
          The platform may only be used for legitimate academic and educational activities.
          Prohibited actions include unauthorized copying, redistribution, scraping, data mining, hacking,
          sharing credentials, commercial resale, and uploading harmful content.
        </p>

        <h2>3. Account Responsibility and Security</h2>
        <p>
          Each user is responsible for activity on their account. Keep passwords confidential, use secure devices,
          and report unauthorized access immediately. Acadex is not liable for losses caused by negligent account use.
        </p>

        <h2>4. Lecturer Verification and Tutorship</h2>
        <p>
          Lecturer accounts undergo verification before they can receive bookings or upload paid materials.
          Verified lecturers may set rate preferences, manage student sessions, and deliver tutoring through the
          platform’s secure chat and session booking system.
        </p>

        <h2>5. Academic Content and Intellectual Property</h2>
        <p>
          All materials are provided for personal study and academic reference. Content ownership remains with
          contributors, institutions, and Acadex licensors. Redistribution, resale, or public posting of materials
          without authorization is strictly prohibited.
        </p>

        <h2>6. Payments, Pricing, and Revenue Sharing</h2>
        <p>
          Payments are processed securely through MTN MOMO or Orange Money. Pricing is designed to be affordable for
          students, with clear transaction receipts and billing history. Lecturers receive their payout share on the
          last day of each month, typically through MTN MOMO or Orange Money, with a platform revenue split of
          25% for Acadex and 75% to the lecturer when applicable.
        </p>

        <h2>7. Refunds and Billing Policy</h2>
        <p>
          Paid access is delivered instantly. Refunds are not guaranteed and are considered only when access failures
          or technical issues prevent delivery. Report payment problems immediately via the complaint portal or support.
        </p>

        <h2>8. Service Availability and Maintenance</h2>
        <p>
          Acadex aims for high availability, but maintenance, upgrades, and security fixes may temporarily affect service.
          The platform is not liable for interruptions caused by external providers or infrastructure events.
        </p>

        <h2>9. User Conduct and Community Standards</h2>
        <p>
          Users must behave respectfully and lawfully. Harassment, misinformation, impersonation, and attempts to manipulate
          academic systems are prohibited.
        </p>

        <h2>10. Termination of Access</h2>
        <p>
          Acadex may suspend or terminate accounts for policy violations, safety concerns, or security risks.
          This may happen without notice when required to protect the platform and its community.
        </p>

        <h2>11. Disclaimer of Warranties</h2>
        <p>
          The platform is provided on an “as is” basis. Acadex does not guarantee complete accuracy of academic materials,
          uninterrupted service, or that the platform will meet every user expectation.
        </p>

        <h2>12. Limitation of Liability</h2>
        <p>
          Acadex and its operators are not liable for indirect, incidental, or consequential damages, including academic
          decisions, data loss, or service disruptions.
        </p>

        <h2>13. Privacy and Data Usage</h2>
        <p>
          Acadex collects only the information required for authentication, content access, and service delivery.
          Personal data is handled securely and is not sold to third parties.
        </p>

        <h2>14. Complaints and Support</h2>
        <p>
          Submit complaints through the platform complaint portal or by contacting support at
          <a href="mailto:brightstackinnovations@gmail.com">brightstackinnovations@gmail.com</a> or
          <a href="https://wa.me/237678507737" target="_blank" rel="noreferrer">WhatsApp +237 678 507 737</a>.
        </p>

        <h2>15. Modifications to Terms</h2>
        <p>
          Acadex may update these Terms at any time. Continued use of the service after updates constitutes acceptance.
        </p>

        <h2>16. Governing Law and Dispute Resolution</h2>
        <p>
          Any disputes will first be addressed through internal support review. Legal matters are governed by applicable
          laws in Acadex’s jurisdiction of operation.
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
