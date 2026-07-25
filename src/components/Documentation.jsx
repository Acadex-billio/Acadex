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
        <meta property="og:image" content="https://www.acadexe.com/logo192.png" />
        <meta property="og:image:alt" content="Acadex documentation preview" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content="@AcadexOfficial" />
        <meta name="twitter:creator" content="@AcadexOfficial" />
        <meta name="twitter:title" content="About Acadex | Documentation" />
        <meta
          name="twitter:description"
          content="A quick guide to academic resources and tools available on Acadex for HND and BTS students, lecturers, and institutions."
        />
        <meta name="twitter:image" content="https://www.acadexe.com/logo192.png" />
        <meta name="twitter:image:alt" content="Acadex documentation preview" />
        <link rel="canonical" href="https://www.acadexe.com/documentation" />
        <meta name="keywords" content="Acadex documentation, HND study portal, BTS platform guide, academic resource platform, Brightstack Innovations" />
      </Helmet>

      <section className={styles.panel}>
        <p className={styles.kicker}>Platform Guide</p>
        <h1 className={styles.title}>About Acadex</h1>
        <p className={styles.subtitle}>
          Acadex is a modern academic platform built for students, lecturers, and institutions to share verified learning
          resources, manage academic support, and collaborate in a safe and structured environment.
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
            <h2>What Acadex Offers</h2>
            <p>
              The platform brings together past question papers, research reports, presentations, internship topics,
              announcements, AI-assisted study help, secure payments, lecturer support, and communication tools in one place.
              Students can learn faster, lecturers can share knowledge more effectively, and administrators can manage content
              with greater transparency.
            </p>
          </article>
          <article>
            <h2>How Students Should Use It</h2>
            <p>
              Materials on Acadex are meant for study purposes and academic reference. Students may use reports and
              presentations to learn structures, ideas, and research approaches, but they must not submit another person’s
              work as their own. Where work is referenced, the student should acknowledge the original author and include the
              Acadex source URL or citation details provided on the platform.
            </p>
          </article>
          <article>
            <h2>Academic Integrity and Community Safety</h2>
            <p>
              Acadex protects academic integrity by treating defended reports and protected academic work as copyrighted or
              protected materials. The platform also maintains community standards for chats and tutoring spaces, where users
              are expected to avoid immoral content, abusive language, false information, harassment, nudity, or harmful conduct.
              Violations may lead to moderation actions, account restrictions, or permanent suspension.
            </p>
          </article>
          <article>
            <h2>For Lecturers and Institutions</h2>
            <p>
              Verified lecturers can manage profiles, receive bookings, deliver tutoring, and contribute academic resources.
              Institutions and administrators can oversee approvals, content quality, payments, and compliance while ensuring
              that the platform remains useful, secure, and beneficial for learners.
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
