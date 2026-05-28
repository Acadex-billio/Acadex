import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import styles from '../Astyles/securePdfPreview.module.css';

pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/legacy/build/pdf.worker.min.mjs`;

const SecurePdfPreview = ({ fileUrl, onContextMenu, onCopy, onCut, onDrag, maxPages = null, allowTextSelection = false }) => {
  const containerRef = useRef(null);
  const [numPages, setNumPages] = useState(0);
  const [containerWidth, setContainerWidth] = useState(720);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    const target = containerRef.current;
    if (!target) return undefined;

    const updateWidth = () => {
      const nextWidth = Math.max(260, Math.floor(target.clientWidth) - 24);
      setContainerWidth(nextWidth);
    };

    updateWidth();

    let observer;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateWidth);
      observer.observe(target);
    } else {
      window.addEventListener('resize', updateWidth);
    }

    return () => {
      if (observer) observer.disconnect();
      else window.removeEventListener('resize', updateWidth);
    };
  }, []);

  const pages = useMemo(() => {
    const total = maxPages ? Math.min(numPages, maxPages) : numPages;
    return Array.from({ length: total }, (_, i) => i + 1);
  }, [maxPages, numPages]);

  return (
    <div
      ref={containerRef}
      className={styles.viewerShell}
      onContextMenu={onContextMenu}
      onCopy={onCopy}
      onCut={onCut}
      onDrag={onDrag}
    >
      <div className={styles.pdfScroll}>
        <Document
          file={fileUrl}
          loading={<div className={styles.status}>Loading preview...</div>}
          onLoadSuccess={({ numPages: total }) => {
            setLoadError('');
            setNumPages(total || 0);
          }}
          onLoadError={(err) => {
            setNumPages(0);
            setLoadError(String(err?.message || 'Failed to render preview'));
          }}
          error={<div className={styles.error}>Unable to render preview.</div>}
        >
          {loadError ? <div className={styles.error}>{loadError}</div> : null}
          {!loadError && pages.map((pageNumber) => (
            <div className={styles.pageWrap} key={pageNumber}>
              <Page
                pageNumber={pageNumber}
                width={containerWidth}
                renderAnnotationLayer={false}
                renderTextLayer={allowTextSelection}
                loading={<div className={styles.status}>Rendering page {pageNumber}...</div>}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
};

export default SecurePdfPreview;
