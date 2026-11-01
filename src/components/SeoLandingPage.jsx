import React from 'react';
import { Helmet } from 'react-helmet';
import { Link } from 'react-router-dom';
import { FaArrowRight, FaBookOpen, FaGraduationCap } from 'react-icons/fa';
import seoContent from '../data/seoPages.json';
import styles from '../Astyles/SeoLandingPage.module.css';

const SeoLandingPage = ({ slug }) => {
  const page = seoContent.pages.find((item) => item.slug === slug);
  if (!page) return null;

  const canonical = `https://www.acadexe.com/${page.slug}`;
  const relatedPages = seoContent.pages.filter((item) => item.slug !== page.slug).slice(0, 4);

  return (
    <main className={styles.page}>
      <Helmet>
        <title>{page.title}</title>
        <meta name="description" content={page.description} />
        <meta name="robots" content="index,follow,max-image-preview:large" />
        <link rel="canonical" href={canonical} />
        <meta property="og:type" content="article" />
        <meta property="og:site_name" content="Acadex" />
        <meta property="og:title" content={page.title} />
        <meta property="og:description" content={page.description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content="https://www.acadexe.com/acadex-social-preview.png" />
        <meta property="og:image:alt" content="Acadex — your academic ecosystem to learn, teach, connect, and grow" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={page.title} />
        <meta name="twitter:description" content={page.description} />
        <meta name="twitter:image" content="https://www.acadexe.com/acadex-social-preview.png" />
        <script type="application/ld+json">
          {JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: page.title,
            description: page.description,
            url: canonical,
            isPartOf: {
              '@type': 'WebSite',
              name: 'Acadex',
              url: 'https://www.acadexe.com/',
            },
          })}
        </script>
      </Helmet>

      <header className={styles.header}>
        <Link to="/" className={styles.brand} aria-label="Acadex home">
          <img src={`${process.env.PUBLIC_URL}/acadex-logo.png`} alt="" />
          <span>Acadex</span>
        </Link>
        <nav aria-label="Main navigation">
          <Link to="/materials">Study materials</Link>
          <Link to="/documentation">About Acadex</Link>
        </nav>
        <Link to="/register" className={styles.headerCta}>Get started</Link>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><FaGraduationCap aria-hidden="true" /> {page.eyebrow}</p>
          <h1>{page.heading}</h1>
          <p className={styles.intro}>{page.intro}</p>
          <Link to={page.ctaHref} className={styles.primaryCta}>
            {page.ctaLabel} <FaArrowRight aria-hidden="true" />
          </Link>
        </div>
        <div className={styles.heroArt} aria-hidden="true">
          <span className={styles.artCircle}><FaBookOpen /></span>
          <span className={styles.artCaption}>LEARN · TEACH · GROW</span>
        </div>
      </section>

      <article className={styles.content}>
        {page.sections.map((section) => (
          <section className={styles.contentSection} key={section.heading}>
            <h2>{section.heading}</h2>
            {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ))}

        <section className={styles.faqSection}>
          <h2>Frequently asked questions</h2>
          {page.faqs.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}</summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </section>
      </article>

      <section className={styles.related}>
        <h2>Explore more on Acadex</h2>
        <div className={styles.relatedLinks}>
          {relatedPages.map((related) => (
            <Link to={`/${related.slug}`} key={related.slug}>
              {related.heading} <FaArrowRight aria-hidden="true" />
            </Link>
          ))}
          <Link to="/materials">Browse the materials catalogue <FaArrowRight aria-hidden="true" /></Link>
        </div>
      </section>

      <footer className={styles.footer}>
        <Link to="/">Acadex</Link>
        <span>Academic resources, support, and opportunities.</span>
        <Link to="/documentation">About Acadex</Link>
      </footer>
    </main>
  );
};

export default SeoLandingPage;
