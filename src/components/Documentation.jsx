import React from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate } from 'react-router-dom';
import {
  FaArrowRight,
  FaBookOpen,
  FaBriefcase,
  FaBullhorn,
  FaChalkboardTeacher,
  FaComments,
  FaFileAlt,
  FaGraduationCap,
  FaLaptop,
  FaLightbulb,
  FaVideo,
} from 'react-icons/fa';
import styles from '../Astyles/Documentation.module.css';
import { useLoading } from '../context/LoadingContext';

const audiences = [
  {
    icon: FaGraduationCap,
    title: 'For learners',
    description: 'Find trusted study resources, get help from lecturers, and discover opportunities for your next step.',
    link: 'Explore learning tools',
    target: 'learning-tools',
  },
  {
    icon: FaChalkboardTeacher,
    title: 'For lecturers',
    description: 'Share your expertise, support learners through tutoring, and manage your academic profile and bookings.',
    link: 'See lecturer tools',
    target: 'teaching-tools',
  },
  {
    icon: FaBriefcase,
    title: 'For organizations',
    description: 'Publish concours opportunities and manage candidate applications from a dedicated partner workspace.',
    link: 'Explore concours tools',
    target: 'concours-tools',
  },
];

const learningTools = [
  {
    icon: FaBookOpen,
    title: 'Question papers',
    description: 'Browse past papers by program and subject to guide focused exam preparation.',
  },
  {
    icon: FaFileAlt,
    title: 'Reports & presentations',
    description: 'Explore academic and research examples for learning, planning, and presentation preparation.',
  },
  {
    icon: FaLightbulb,
    title: 'Internship topics & AI study',
    description: 'Discover topic ideas and use AI-powered study tools to explore concepts and organize your learning.',
  },
  {
    icon: FaComments,
    title: 'Tutoring & chat',
    description: 'Connect with lecturers and peers through tutoring, personal chats, groups, and learning centers.',
  },
  {
    icon: FaVideo,
    title: 'Live video calls',
    description: 'Meet with your chat community for face-to-face study and collaboration.',
  },
  {
    icon: FaBullhorn,
    title: 'Announcements',
    description: 'Keep up with academic notices, platform updates, and opportunities shared on Acadex.',
  },
];

const Documentation = () => {
  const navigate = useNavigate();
  const { startLoading, stopLoading } = useLoading();

  const navigateWithLoader = (path) => {
    startLoading();
    navigate(path);
    window.setTimeout(() => stopLoading(), 450);
  };

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <main className={styles.page}>
      <Helmet>
        <title>About Acadex | Learn, Teach & Grow Together</title>
        <meta
          name="description"
          content="Acadex brings learning resources, AI study tools, tutoring, live calls, lecturer services, and concours opportunities together for learners and organizations."
        />
        <meta name="robots" content="index,follow" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="Acadex" />
        <meta property="og:title" content="Acadex | Your Academic Ecosystem" />
        <meta
          property="og:description"
          content="Study smarter. Teach confidently. Connect with institutions. Discover learning tools and opportunities on Acadex."
        />
        <meta property="og:locale" content="en_US" />
        <meta property="og:url" content="https://www.acadexe.com/documentation" />
        <meta property="og:image" content="https://www.acadexe.com/acadex-social-preview.png" />
        <meta property="og:image:secure_url" content="https://www.acadexe.com/acadex-social-preview.png" />
        <meta property="og:image:type" content="image/png" />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="Acadex — your academic ecosystem to learn, teach, connect, and grow" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Acadex | Your Academic Ecosystem" />
        <meta
          name="twitter:description"
          content="Study smarter. Teach confidently. Connect with institutions. Discover learning tools and opportunities on Acadex."
        />
        <meta name="twitter:image" content="https://www.acadexe.com/acadex-social-preview.png" />
        <link rel="canonical" href="https://www.acadexe.com/documentation" />
        <meta name="keywords" content="Acadex, academic resources, HND, BTS, higher education, lecturers, tutoring, concours, academic opportunities" />
      </Helmet>

      <header className={styles.topBar}>
        <button type="button" className={styles.brand} onClick={() => navigateWithLoader('/')} aria-label="Acadex home">
          <img src={`${process.env.PUBLIC_URL}/acadex-logo.png`} alt="Acadex — Academic Ecosystem" />
        </button>
        <nav className={styles.navLinks} aria-label="About page navigation">
          <button type="button" onClick={() => scrollTo('learning-tools')}>What you can do</button>
          <button type="button" onClick={() => scrollTo('concours-tools')}>For organizations</button>
        </nav>
        <button type="button" className={styles.navCta} onClick={() => navigateWithLoader('/register')}>
          Get started <FaArrowRight aria-hidden="true" />
        </button>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><span /> One connected academic ecosystem</p>
          <h1 className={styles.title}>
            Your next step in learning starts <span>here.</span>
          </h1>
          <p className={styles.subtitle}>
            Study smarter. Teach confidently. Find opportunities. Acadex brings learners, lecturers, and organizations
            together with practical tools for the whole academic journey.
          </p>
          <div className={styles.heroActions}>
            <button type="button" className={styles.primaryBtn} onClick={() => navigateWithLoader('/register')}>
              Join Acadex <FaArrowRight aria-hidden="true" />
            </button>
            <button type="button" className={styles.secondaryBtn} onClick={() => scrollTo('audiences')}>
              Explore the platform
            </button>
          </div>
          <p className={styles.heroNote}>For learners across programs, educators, and concours partners.</p>
        </div>
        <div className={styles.heroVisual} aria-hidden="true">
          <div className={styles.visualGlow} />
          <div className={styles.visualLogo}>
            <img src={`${process.env.PUBLIC_URL}/acadex-logo.png`} alt="" />
          </div>
          <div className={`${styles.floatingCard} ${styles.resourceCard}`}>
            <span className={styles.visualIcon}><FaBookOpen /></span>
            <span><strong>Learn with purpose</strong><small>Resources · AI study · tutoring</small></span>
          </div>
          <div className={`${styles.floatingCard} ${styles.opportunityCard}`}>
            <span className={styles.visualIcon}><FaBriefcase /></span>
            <span><strong>Find what’s next</strong><small>Concours · lecturer support</small></span>
          </div>
          <div className={styles.visualCaption}>LEARN <i /> TEACH <i /> GROW</div>
        </div>
      </section>

      <section className={styles.audiences} id="audiences">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>Built for your journey</p>
          <h2>One platform. Different ways to move forward.</h2>
          <p>Whether you are studying, teaching, or creating opportunities, Acadex gives you a place to connect.</p>
        </div>
        <div className={styles.audienceGrid}>
          {audiences.map(({ icon: Icon, title, description, link, target }) => (
            <article className={styles.audienceCard} key={title}>
              <span className={styles.audienceIcon}><Icon aria-hidden="true" /></span>
              <h3>{title}</h3>
              <p>{description}</p>
              <button type="button" onClick={() => scrollTo(target)}>
                {link} <FaArrowRight aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.toolsSection} id="learning-tools">
        <div className={styles.sectionHeading}>
          <p className={styles.eyebrow}>A connected toolkit</p>
          <h2>Everything you need to keep moving.</h2>
          <p>Bring study, collaboration, and academic support into one convenient space.</p>
        </div>
        <div className={styles.toolGrid}>
          {learningTools.map(({ icon: Icon, title, description }) => (
            <article className={styles.toolCard} key={title}>
              <span className={styles.toolIcon}><Icon aria-hidden="true" /></span>
              <div><h3>{title}</h3><p>{description}</p></div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.rolesSection} id="teaching-tools">
        <div className={styles.roleVisual} aria-hidden="true"><FaChalkboardTeacher /></div>
        <div>
          <p className={styles.eyebrow}>For lecturers</p>
          <h2>Turn your expertise into meaningful support.</h2>
          <p>
            Build your lecturer profile, receive tutoring bookings, meet learners online, and contribute resources
            that help students make progress.
          </p>
          <button type="button" className={styles.textLink} onClick={() => navigateWithLoader('/register')}>
            Get started with Acadex <FaArrowRight aria-hidden="true" />
          </button>
        </div>
      </section>

      <section className={styles.concoursSection} id="concours-tools">
        <div>
          <p className={styles.eyebrow}>For concours organizations</p>
          <h2>Bring your opportunities closer to the right candidates.</h2>
          <p>
            Use the partner workspace to create and publish concours opportunities, configure application forms,
            and review candidate submissions in one place.
          </p>
          <a
            className={styles.lightBtn}
            href="mailto:acadexmail@gmail.com?subject=Acadex%20Concours%20Partnership"
          >
            Contact our team <FaArrowRight aria-hidden="true" />
          </a>
        </div>
        <span className={styles.concoursIcon} aria-hidden="true"><FaLaptop /></span>
      </section>

      <section className={styles.integrity}>
        <div className={styles.integrityIcon}><FaGraduationCap aria-hidden="true" /></div>
        <div>
          <h2>Built around learning with integrity.</h2>
          <p>
            Acadex resources are for study and reference. Respect original work, cite sources, and help keep learning
            spaces constructive and safe for everyone.
          </p>
        </div>
      </section>

      <section className={styles.finalCta}>
        <p className={styles.eyebrow}>Make your next move</p>
        <h2>Learning is better when everything connects.</h2>
        <p>Join learners, lecturers, and organizations building their next opportunity on Acadex.</p>
        <div className={styles.heroActions}>
          <button type="button" className={styles.primaryBtn} onClick={() => navigateWithLoader('/register')}>
            Get started <FaArrowRight aria-hidden="true" />
          </button>
          <button type="button" className={styles.finalLogin} onClick={() => navigateWithLoader('/login')}>
            Already a member? Log in
          </button>
        </div>
      </section>

      <footer className={styles.footer}>
        <button type="button" onClick={() => navigateWithLoader('/')}>Acadex</button>
        <span>Learn · Teach · Connect · Grow</span>
        <button type="button" onClick={() => navigateWithLoader('/')}>Back to home</button>
      </footer>
    </main>
  );
};

export default Documentation;
