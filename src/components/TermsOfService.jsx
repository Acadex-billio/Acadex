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
        <meta property="og:image" content="https://www.acadexe.com/logo192.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@AcadexOfficial" />
        <meta name="twitter:creator" content="@AcadexOfficial" />
        <meta name="twitter:title" content="Terms of Service | Acadex" />
        <meta
          name="twitter:description"
          content="Review permitted use, account responsibilities, and platform rules for using Acadex."
        />
        <meta name="twitter:image" content="https://www.acadexe.com/logo192.png" />
        <meta name="twitter:image:alt" content="Acadex Terms of Service" />
        <link rel="canonical" href="https://www.acadexe.com/terms-of-service" />
        <meta name="keywords" content="Acadex terms of service, platform rules, HND student agreement, BTS platform terms" />
      </Helmet>

      <section className={styles.panel}>
        <h1>Acadex Terms of Service</h1>
        <p className={styles.updated}>Effective date: July 25, 2026</p>

        <p>
          These Terms of Service govern your access to and use of Acadex, the academic platform designed for Higher National
          Diploma (HND), Bachelor of Technology (BTech), Bachelor of Science (BSc/BSS), Business Administration (BBA),
          Master’s, and other advanced academic learners. Acadex provides access to verified question papers, reports,
          presentations, internship topics, announcements, tutoring features, AI-assisted study tools, and community chat
          experiences for educational purposes.
        </p>

        <h2>1. Eligibility and Access</h2>
        <p>
          Acadex is intended for students, lecturers, institutions, and authorized administrators. You must provide accurate
          information during registration and maintain the confidentiality of your account. False identity details, shared
          credentials, unauthorized impersonation, or attempts to bypass institutional access rules are prohibited.
        </p>

        <h2>2. Platform Capabilities and Permitted Use</h2>
        <p>
          Acadex may be used to browse and study academic resources such as past question papers, reports, presentations,
          internship topics, lecture notes, announcements, and AI-based assistance. Users may also use the platform to
          connect with lecturers, join tutoring sessions, participate in authenticated chat groups, make secure payments,
          and receive academic notifications.
        </p>
        <p>
          The platform must be used for legitimate academic, instructional, and research-related purposes. Commercial resale,
          unauthorized redistribution, automated scraping, hacking, credential sharing, or any activity that undermines the
          reliability, fairness, or security of the platform is prohibited.
        </p>

        <h2>3. Study-Only Use of Academic Materials</h2>
        <p>
          Materials on Acadex are intended for study purposes only. Students are welcome to use reports, presentations,
          question papers, and other available learning materials as references to improve understanding, strengthen research,
          and support revision.
        </p>
        <p>
          Students must not present another student’s reports, presentations, or other uploaded work as their own. Where a
          student uses another person’s work for study, reference, or inspiration, the student must properly acknowledge the
          original author and include the Acadex source URL or the relevant citation details provided on the platform.
        </p>
        <p>
          Defended reports, presentations, and other submitted academic content are treated as copyrighted or protected
          academic materials on Acadex. Unauthorized copying, reproduction, redistribution, submission without attribution,
          or misuse of protected work may result in account suspension, content removal, or permanent blockage from the
          platform.
        </p>

        <h2>4. Community Standards and Chat Conduct</h2>
        <p>
          Acadex supports academic collaboration, but users must maintain respectful and lawful behaviour in all chats,
          group discussions, tutoring spaces, and public interactions. The following are strictly prohibited:
        </p>
        <ul>
          <li>Sharing immoral or sexually explicit content</li>
          <li>Engaging in abusive, threatening, insulting, or discriminatory language</li>
          <li>Spreading false information, defamation, or misinformation</li>
          <li>Uploading harmful, offensive, or illegal content</li>
          <li>Harassing other users, lecturers, or administrators</li>
          <li>Manipulating the platform for fraud, scams, impersonation, or spam</li>
        </ul>
        <p>
          Violations of these standards may lead to warnings, content removal, temporary restriction, or formal sanctions,
          including account suspension or permanent ban depending on severity and repetition.
        </p>

        <h2>5. Account Responsibility and Security</h2>
        <p>
          Users are responsible for the activity that occurs under their account. You should keep your credentials private,
          use secure devices, and report suspicious activity immediately. Acadex cannot be held responsible for losses caused
          by negligence, shared credentials, or failure to protect access information.
        </p>

        <h2>6. Lecturer, Institution, and Admin Roles</h2>
        <p>
          Verified lecturers and institutional users may upload, moderate, tutor, and manage educational content within the
          approved scope of their roles. Administrators may approve, remove, or safeguard material to protect platform quality,
          academic integrity, and user safety.
        </p>

        <h2>7. Payments, Billing, and Revenue</h2>
        <p>
          Some features may require secure payments through approved methods such as MTN Mobile Money or Orange Money. Users
          must ensure that billing information is correct and that transactions are authorized. Tutors and lecturers may receive
          earnings according to the platform’s payout rules, while Acadex may retain its agreed platform share.
        </p>

        <h2>8. Content Ownership and Intellectual Property</h2>
        <p>
          Academic materials uploaded to Acadex remain subject to the rights of the original contributor, author, institution,
          or licensor. By uploading content, you represent that you have the legal right to share it and that you are not
          infringing on another person’s rights. Acadex may remove or restrict content that violates platform policy,
          copyright, or academic integrity standards.
        </p>

        <h2>9. Service Availability and Changes</h2>
        <p>
          Acadex strives to provide reliable access, but maintenance, upgrades, technical failures, internet interruptions,
          and external provider issues may temporarily affect service. The platform may change, enhance, or remove features
          over time as it evolves.
        </p>

        <h2>10. Suspension, Termination, and Enforcement</h2>
        <p>
          Acadex reserves the right to suspend, restrict, or permanently terminate access where users violate these Terms,
          abuse academic materials, breach community standards, compromise security, or engage in misconduct. This applies to
          both individual users and any account acting on behalf of a student, lecturer, or institution.
        </p>

        <h2>11. Limitation of Liability and Disclaimer</h2>
        <p>
          The platform is provided for educational support and is not a substitute for formal academic supervision or
          institutional policy. Acadex does not guarantee absolute accuracy, completeness, or uninterrupted access to every
          material, feature, or service, and will not be held liable for indirect, incidental, or consequential damages.
        </p>

        <h2>12. Privacy, Complaints, and Contact</h2>
        <p>
          Please review the Privacy Policy for details about the information we collect and how it is handled. Complaints,
          concerns, or support requests may be submitted through the platform’s support channels or by contacting
          <a href="mailto:brightstackinnovations@gmail.com">brightstackinnovations@gmail.com</a> or
          <a href="https://wa.me/237678507737" target="_blank" rel="noreferrer">WhatsApp +237 678 507 737</a>.
        </p>

        <h2>13. Changes to These Terms</h2>
        <p>
          Acadex may update or revise these Terms over time. Continued use of the platform after updates means you accept the
          revised Terms.
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
