import React from 'react';
import styles from '../Astyles/graduationCapLoader.module.css';

/**
 * Loading spinner with graduation cap icon - spins around the cap until materials are ready.
 * Props:
 * - fullscreen (bool): covers viewport with overlay
 * - size (number|string): loader size in px or CSS value
 * - label (string): loading message
 */
const GraduationCapLoader = ({
  fullscreen = false,
  size = 140,
  label = 'Loading materials… Please wait',
}) => {
  const styleSize = typeof size === 'number' ? `${size}px` : size;

  return (
    <div
      className={fullscreen ? styles.overlay : styles.inlineWrap}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className={styles.loader} style={{ width: styleSize, height: styleSize }}>
        <div className={styles.spinner} aria-hidden="true" />
        <div className={styles.capWrap} aria-hidden="true">
          <svg
            className={styles.cap}
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z" />
          </svg>
        </div>
      </div>
      <p className={styles.loadingText}>{label}</p>
      <span className={styles.srOnly}>{label}</span>
    </div>
  );
};

export default GraduationCapLoader;
