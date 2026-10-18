import React from 'react';
import styles from '../Astyles/PublicPageChrome.module.css';

const PublicFooter = () => (
  <footer className={styles.footer}>
    <span>© {new Date().getFullYear()} ACADEX. All rights reserved.</span>
    <span className={styles.footerDivider} aria-hidden="true" />
    <span>Acadex is powered by VANTORA Ltd.</span>
    <a href="mailto:acadexmail@gmail.com">acadexmail@gmail.com</a>
    <a href="https://wa.link/qt7d0t" target="_blank" rel="noopener noreferrer">WhatsApp support</a>
    <a href="tel:+237678507737">Call 678507737</a>
  </footer>
);

export default PublicFooter;
