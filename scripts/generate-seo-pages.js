const fs = require('fs');
const path = require('path');
const seoContent = require('../src/data/seoPages.json');

const root = path.resolve(__dirname, '..');
const buildDirectory = path.join(root, 'build');
const indexPath = path.join(buildDirectory, 'index.html');
const origin = 'https://www.acadexe.com';
let baseHtml = '';

const escapeHtml = (value) => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function setMeta(html, attribute, key, content) {
  const escapedKey = escapeRegExp(key);
  const pattern = new RegExp(`<meta\\b(?=[^>]*\\b${attribute}=["']${escapedKey}["'])[^>]*>`, 'i');
  const tag = `<meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(content)}"/>`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `  ${tag}\n</head>`);
}

function setCanonical(html, url) {
  const pattern = /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i;
  const tag = `<link rel="canonical" href="${escapeHtml(url)}"/>`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `  ${tag}\n</head>`);
}

function setTitle(html, title) {
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function pageHtml({ title, description, canonical, body, robots = 'index,follow,max-image-preview:large', socialType = 'website' }) {
  let html = baseHtml;
  html = setTitle(html, title);
  html = setMeta(html, 'name', 'description', description);
  html = setMeta(html, 'name', 'robots', robots);
  html = setMeta(html, 'property', 'og:type', socialType);
  html = setMeta(html, 'property', 'og:site_name', 'Acadex');
  html = setMeta(html, 'property', 'og:title', title);
  html = setMeta(html, 'property', 'og:description', description);
  html = setMeta(html, 'property', 'og:url', canonical);
  html = setMeta(html, 'property', 'og:image', `${origin}/acadex-social-preview.png`);
  html = setMeta(html, 'property', 'og:image:secure_url', `${origin}/acadex-social-preview.png`);
  html = setMeta(html, 'property', 'og:image:type', 'image/png');
  html = setMeta(html, 'property', 'og:image:width', '1200');
  html = setMeta(html, 'property', 'og:image:height', '630');
  html = setMeta(html, 'property', 'og:image:alt', 'Acadex — your academic ecosystem to learn, teach, connect, and grow');
  html = setMeta(html, 'name', 'twitter:card', 'summary_large_image');
  html = setMeta(html, 'name', 'twitter:title', title);
  html = setMeta(html, 'name', 'twitter:description', description);
  html = setMeta(html, 'name', 'twitter:image', `${origin}/acadex-social-preview.png`);
  html = setCanonical(html, canonical);
  html = html.replace(/<div id="root"><\/div>/i, `<div id="root">${body}</div>`);
  return html;
}

function renderLandingBody(page) {
  const sections = page.sections.map((section) => `
    <section>
      <h2>${escapeHtml(section.heading)}</h2>
      ${section.paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
    </section>`).join('');
  const faqs = page.faqs.map((faq) => `
    <details>
      <summary>${escapeHtml(faq.question)}</summary>
      <p>${escapeHtml(faq.answer)}</p>
    </details>`).join('');

  return `
    <main style="max-width:900px;margin:0 auto;padding:24px;font:16px/1.7 Arial,sans-serif;color:#1c2a21">
      <header style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #e8eee9;padding-bottom:16px">
        <a href="/" style="color:#105b35;font-weight:bold">Acadex</a>
        <nav><a href="/materials">Study materials</a> · <a href="/documentation">About Acadex</a></nav>
      </header>
      <article>
        <p style="color:#168347;font-weight:bold;text-transform:uppercase">${escapeHtml(page.eyebrow)}</p>
        <h1 style="font-size:2.5rem;line-height:1.15">${escapeHtml(page.heading)}</h1>
        <p>${escapeHtml(page.intro)}</p>
        <p><a href="${escapeHtml(page.ctaHref)}">${escapeHtml(page.ctaLabel)} →</a></p>
        ${sections}
        <section><h2>Frequently asked questions</h2>${faqs}</section>
        <nav aria-label="More Acadex resources">
          <h2>Explore more on Acadex</h2>
          ${seoContent.pages.filter((item) => item.slug !== page.slug).map((item) => (
    `<p><a href="/${escapeHtml(item.slug)}">${escapeHtml(item.heading)}</a></p>`
  )).join('')}
          <p><a href="/materials">Browse the materials catalogue</a></p>
        </nav>
      </article>
    </main>`;
}

function renderMaterialsBody() {
  return `
    <main style="max-width:900px;margin:0 auto;padding:24px;font:16px/1.7 Arial,sans-serif;color:#1c2a21">
      <header><a href="/">Acadex</a> · <a href="/documentation">About Acadex</a></header>
      <h1>Study materials on Acadex</h1>
      <p>Browse HND and BTS past question papers, and available exam resources, academic reports, and presentations across supported program tracks. Preview the first page when available; sign-in may be needed to access a full material.</p>
      <h2>Browse the catalogue</h2>
      <ul>
        <li><a href="/hnd-bts-past-papers">HND and BTS past question papers</a></li>
        <li><a href="/bachelor-bsc-licence-masters-exam-resources">Bachelor, BSc, Licence and Master’s exam resources</a></li>
        <li><a href="/academic-reports-report-writing">Academic reports and report writing</a></li>
        <li><a href="/presentations-hnd-defence">Presentations and HND defence resources</a></li>
      </ul>
    </main>`;
}

function renderHomeBody() {
  return `
    <main style="max-width:1000px;margin:0 auto;padding:32px 24px;font:16px/1.7 Arial,sans-serif;color:#1c2a21">
      <header><a href="/" style="color:#105b35;font-weight:bold">Acadex</a> · <a href="/materials">Study materials</a> · <a href="/documentation">About</a></header>
      <h1>${escapeHtml(seoContent.site.heading)}</h1>
      <p>${escapeHtml(seoContent.site.intro)}</p>
      <p><a href="/materials">Browse study materials</a> · <a href="/register">Get started</a></p>
      <h2>Explore Acadex</h2>
      <ul>${seoContent.pages.map((page) => (
    `<li><a href="/${escapeHtml(page.slug)}">${escapeHtml(page.heading)}</a></li>`
  )).join('')}</ul>
      <p>For learners across programs, lecturers, and concours organizations.</p>
    </main>`;
}

function renderAboutBody() {
  return `
    <main style="max-width:900px;margin:0 auto;padding:24px;font:16px/1.7 Arial,sans-serif;color:#1c2a21">
      <header><a href="/">Acadex</a> · <a href="/materials">Study materials</a></header>
      <h1>About Acadex</h1>
      <p>Acadex brings learners, lecturers, and organizations together with tools for study, tutoring, collaboration, and academic opportunities.</p>
      <h2>For learners</h2>
      <p>Explore HND and BTS past papers, resources for Bachelor, Licence, and Master’s programs, academic reports, presentations, internship topics, AI study tools, tutoring, chat, and video calls.</p>
      <h2>For lecturers</h2>
      <p>Manage a lecturer profile, receive tutoring bookings, meet learners online, and share academic resources.</p>
      <h2>For concours organizations</h2>
      <p>Publish opportunities, configure application forms, and review candidate submissions in the partner workspace.</p>
      <h2>Explore resources</h2>
      <ul>${seoContent.pages.map((page) => (
    `<li><a href="/${escapeHtml(page.slug)}">${escapeHtml(page.heading)}</a></li>`
  )).join('')}</ul>
    </main>`;
}

function writeSitemap() {
  const publicRoutes = [
    '/',
    '/materials',
    '/documentation',
    ...seoContent.pages.map((page) => `/${page.slug}`),
  ];
  const urls = publicRoutes.map((route) => `  <url><loc>${origin}${route === '/' ? '/' : route}</loc></url>`).join('\n');
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
  fs.writeFileSync(path.join(buildDirectory, 'sitemap.xml'), sitemap);
}

function writeRoute(route, html) {
  const outputDirectory = path.join(buildDirectory, route);
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(path.join(outputDirectory, 'index.html'), html);
}

function main() {
  if (!fs.existsSync(indexPath)) {
    throw new Error(`CRA build output not found at ${indexPath}`);
  }
  baseHtml = fs.readFileSync(indexPath, 'utf8');

  const homeDescription = seoContent.site.description;
  fs.writeFileSync(indexPath, pageHtml({
    title: seoContent.site.title,
    description: homeDescription,
    canonical: `${origin}/`,
    body: renderHomeBody(),
  }));

  const routes = [
    {
      route: 'materials',
      title: 'HND & BTS Past Papers, Reports & Study Materials | Acadex',
      description: 'Browse HND and BTS past papers, exam resources across supported programs, academic reports, and presentations on Acadex.',
      body: renderMaterialsBody(),
    },
    {
      route: 'documentation',
      title: 'About Acadex | Learn, Teach & Grow Together',
      description: 'Discover how Acadex connects learners, lecturers, and organizations through study resources, tutoring, collaboration, and concours opportunities.',
      body: renderAboutBody(),
    },
    {
      route: 'login',
      title: 'Sign in to Acadex',
      description: 'Sign in to your Acadex account.',
      body: '<main><h1>Sign in to Acadex</h1></main>',
      robots: 'noindex,nofollow',
    },
    {
      route: 'register',
      title: 'Create an Acadex account',
      description: 'Create an account to access Acadex learning and collaboration tools.',
      body: '<main><h1>Create an Acadex account</h1></main>',
      robots: 'noindex,nofollow',
    },
    {
      route: 'reset-password',
      title: 'Reset your Acadex password',
      description: 'Securely reset your Acadex account password.',
      body: '<main><h1>Reset your Acadex password</h1></main>',
      robots: 'noindex,nofollow',
    },
  ];

  for (const route of routes) {
    writeRoute(route.route, pageHtml({
      title: route.title,
      description: route.description,
      canonical: `${origin}/${route.route}`,
      body: route.body,
      robots: route.robots || 'index,follow,max-image-preview:large',
    }));
  }

  for (const page of seoContent.pages) {
    writeRoute(page.slug, pageHtml({
      title: page.title,
      description: page.description,
      canonical: `${origin}/${page.slug}`,
      body: renderLandingBody(page),
      socialType: 'article',
    }));
  }

  writeSitemap();
  console.log(`Generated ${seoContent.pages.length + routes.length} SEO route documents.`);
}

main();
