import React from 'react';
import styles from '../Astyles/PublicPageChrome.module.css';

const PublicFooter = () => (
  <footer className={styles.footer}>
    <span>© {new Date().getFullYear()} ACADEX. All rights reserved.</span>
    <span className={styles.footerDivider} aria-hidden="true" />
    <span>Empowering HND students to excel.</span>
    <span className={styles.heart} aria-label="with love">♥</span>
  </footer>
);

export default PublicFooter;
