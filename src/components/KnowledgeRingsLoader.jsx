import React from 'react';
import styles from '../Astyles/knowledgeRingsLoader.module.css';

/**
 * Props:
 * - fullscreen (bool): if true, covers the viewport with a dimmed overlay
 * - size (number|string): diameter of the loader (e.g. 120 or "10rem")
 * - label (string): accessible + visible loading text
 */
const KnowledgeRingsLoader = ({ fullscreen = false, size = 140, label = 'Loading resources… /n Please be patient'}) => {
  const styleSize = typeof size === 'number' ? `${size}px` : size;

  return (
    <div
      className={fullscreen ? styles.overlay : styles.inlineWrap}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <div className={styles.loader} style={{ width: styleSize, height: styleSize }}>
        {/* Ambient glow backdrop */}
        <div className={styles.glow} aria-hidden="true" />

        {/* Concentric rings */}
        <span className={`${styles.ring} ${styles.ring1}`} aria-hidden="true" />
        <span className={`${styles.ring} ${styles.ring2}`} aria-hidden="true" />
        <span className={`${styles.ring} ${styles.ring3}`} aria-hidden="true" />
        <span className={`${styles.ring} ${styles.ring4}`} aria-hidden="true" />
        <span className={`${styles.ring} ${styles.ring5}`} aria-hidden="true" />
      </div>

      {/* Visible text (centered under rings) */}
      <p className={styles.loadingText}>{label}</p>

      {/* Hidden text for screen readers */}
      <span className={styles.srOnly}>{label}</span>
    </div>
  );
};

export default KnowledgeRingsLoader;
