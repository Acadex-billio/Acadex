import React from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import styles from '../Astyles/Documentation.module.css';
import { useLoading } from '../context/LoadingContext';

const docs = [
  {
    title: 'Question Papers',
    description: 'Browse verified HND and BTS question papers, filter by department, level, semester, and year, then download or bookmark your most relevant exam resources for fast revision.'
  },
  {
    title: 'Reports',
    description: 'Access internship, project, and research reports uploaded by administrators. Review report summaries, compare sample structures, and discover high-quality academic insights.'
  },
  {
    title: 'Presentations',
    description: 'Explore approved presentation decks, supporting slides, and study notes for coursework, seminars, and internship defenses.'
  },
  {
    title: 'Internship Topics',
    description: 'Browse verified internship and research topic ideas by discipline, then select and prepare submission-ready proposals with lecturer guidance.'
  },
  {
    title: 'AI Study Mode',
    description: 'Use the platform’s AI-powered study and research assistant to summarize concepts, generate question prompts, and support academic planning.'
  },
  {
    title: 'Chat & Tutorship',
    description: 'Connect with lecturers, join group discussions, and use center or community chats for collaborative study and real-time tutoring support.'
  },
  {
    title: 'Payments & Pricing',
    description: 'Pay securely with MTN MOMO or Orange Money, choose affordable access plans, and view receipts instantly after payment.'
  },
  {
    title: 'Announcements & Notifications',
    description: 'Receive timely email alerts, in-app updates, and toast notifications for academic notices, platform news, and scheduled events.'
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
          content="Understand key Acadex features, including question papers, reports, presentations, announcements, internships, AI study mode, and tutoring." 
        />
        <meta property="og:locale" content="en_US" />
        <meta property="og:url" content="https://www.acadexe.com/documentation" />
        <meta property="og:image" content="https://www.acadexe.com/hnd-mark.svg" />
        <meta property="og:image:alt" content="Acadex documentation preview" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@AcadexOfficial" />
        <meta name="twitter:creator" content="@AcadexOfficial" />
        <meta name="twitter:title" content="About Acadex | Documentation" />
        <meta
          name="twitter:description"
          content="A quick guide to academic resources and tools available on Acadex for HND and BTS students, lecturers, and institutions."
        />
        <meta name="twitter:image" content="https://www.acadexe.com/hnd-mark.svg" />
        <meta name="twitter:image:alt" content="Acadex documentation preview" />
        <link rel="canonical" href="https://www.acadexe.com/documentation" />
        <meta name="keywords" content="Acadex documentation, HND study portal, BTS platform guide, academic resource platform, Brightstack Innovations" />
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

        <section className={styles.details}>
          <article>
            <h2>Candidate Experience</h2>
            <p>
              HND and BTS candidates access a secure dashboard to retrieve study materials,
              register for tutoring sessions, manage payments, and track announcements.
              Student workflows are designed to keep learning focused and compliant with institutional standards.
            </p>
          </article>
          <article>
            <h2>Lecturer Support</h2>
            <p>
              Verified lecturers manage profiles, set hourly or session rates, receive bookings,
              and upload academic resources. Lecturers also collaborate with candidates through
              personal and group chat channels while earning revenue on platform-enabled bookings.
            </p>
          </article>
          <article>
            <h2>Administrator Controls</h2>
            <p>
              Admins publish verified content, approve reports and presentations, manage pricing,
              monitor ads, and handle support requests. Administrative tools keep the platform secure,
              compliant, and easy to maintain.
            </p>
          </article>
        </section>

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
