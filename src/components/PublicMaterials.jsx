import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Helmet } from 'react-helmet';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { FaBookOpen, FaFileAlt, FaFilePowerpoint, FaFilePdf, FaSearch, FaDownload, FaEye } from 'react-icons/fa';
import api from '../services/api';
import { getErrorMessage } from '../utility/getErrorMessage';
import { showToast } from '../utility/ToastNotification';
import PublicHeader from './PublicHeader';
import PublicFooter from './PublicFooter';
import styles from '../Astyles/PublicMaterials.module.css';

const CATEGORIES = [
  { id: 'papers', label: 'Question papers', Icon: FaBookOpen },
  { id: 'reports', label: 'Reports', Icon: FaFileAlt },
  { id: 'presentations', label: 'Presentations', Icon: FaFilePowerpoint },
];

const PublicMaterials = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedType = searchParams.get('type');
  const type = CATEGORIES.some((category) => category.id === requestedType) ? requestedType : 'papers';
  const [search, setSearch] = useState('');
  const [items, setItems] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [reload, setReload] = useState(0);
  const [previewItem, setPreviewItem] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState('');
  const previewRequest = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setLoadError('');
      try {
        const { data } = await api.get('/materials/catalog', {
          params: { type, page: pagination.page, limit: 12, q: search.trim() || undefined },
        });
        if (cancelled) return;
        setItems(Array.isArray(data?.items) ? data.items : []);
        setPagination((previous) => ({
          ...previous,
          ...(data?.pagination || {}),
          page: data?.pagination?.page || 1,
          pages: data?.pagination?.pages || 1,
          total: data?.pagination?.total || 0,
        }));
      } catch (error) {
        if (cancelled) return;
        const message = getErrorMessage(error, 'Unable to load public materials.');
        setLoadError(message);
        showToast(message, 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, search.trim() ? 250 : 0);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [type, pagination.page, search, reload]);

  const changeCategory = (nextType) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous);
      next.set('type', nextType);
      return next;
    });
    setPagination((previous) => ({ ...previous, page: 1 }));
  };

  const requireAuthentication = (action) => {
    showToast(`Authentication is required to ${action}. Please sign in to continue.`, 'warning');
    navigate('/login?from=%2Fmaterials');
  };

  const closePreview = useCallback(() => {
    previewRequest.current += 1;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setPreviewItem(null);
    setPreviewLoading(false);
    setPreviewError('');
  }, [previewUrl]);

  const previewMaterial = useCallback(async (item) => {
    closePreview();
    const requestId = ++previewRequest.current;
    setPreviewItem(item);
    setPreviewLoading(true);
    try {
      const { data } = await api.get(`/materials/${type}/${encodeURIComponent(item.id)}/preview`, {
        responseType: 'blob',
      });
      if (previewRequest.current !== requestId) return;
      setPreviewUrl(URL.createObjectURL(data));
    } catch (error) {
      if (previewRequest.current !== requestId) return;
      const message = getErrorMessage(error, 'Unable to load this material preview.');
      setPreviewError(message);
      showToast(message, 'error');
    } finally {
      if (previewRequest.current === requestId) setPreviewLoading(false);
    }
  }, [closePreview, type]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  useEffect(() => {
    if (!previewItem) return undefined;
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') closePreview();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [closePreview, previewItem]);

  const activeCategory = CATEGORIES.find((category) => category.id === type) || CATEGORIES[0];
  const ActiveIcon = activeCategory.Icon;

  return (
    <div className={styles.page}>
      <Helmet>
        <title>Browse Study Materials | Acadex</title>
        <meta name="description" content="Browse Acadex question papers, reports, and presentations, and preview the first page before signing in to continue." />
      </Helmet>
      <PublicHeader />
      <main className={styles.main}>
        <section className={styles.intro}>
          <span className={styles.eyebrow}>ACADEX LEARNING LIBRARY</span>
          <h1>Explore study materials</h1>
          <p>Browse question papers, reports, and presentations. Preview the first page, then sign in to continue reading or download.</p>
        </section>

        <div className={styles.toolbar}>
          <div className={styles.tabs} role="tablist" aria-label="Material category">
            {CATEGORIES.map(({ id, label, Icon }) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={type === id}
                className={type === id ? styles.activeTab : styles.tab}
                onClick={() => changeCategory(id)}
              >
                <Icon aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
          <label className={styles.search}>
            <FaSearch aria-hidden="true" />
            <input
              type="search"
              value={search}
              placeholder={`Search ${activeCategory.label.toLowerCase()}...`}
              onChange={(event) => {
                setSearch(event.target.value);
                setPagination((previous) => ({ ...previous, page: 1 }));
              }}
              aria-label={`Search ${activeCategory.label.toLowerCase()}`}
            />
          </label>
        </div>

        <div className={styles.resultsHeading}>
          <div>
            <h2><ActiveIcon aria-hidden="true" /> {activeCategory.label}</h2>
            {!loading && <span>{pagination.total} materials</span>}
          </div>
          <span className={styles.visibilityNote}>Public catalogue · First page preview available</span>
        </div>

        {loading ? (
          <div className={styles.status} role="status">Loading materials…</div>
        ) : loadError ? (
          <div className={styles.status} role="alert">
            <p>{loadError}</p>
            <button type="button" onClick={() => setReload((previous) => previous + 1)}>Try again</button>
          </div>
        ) : items.length === 0 ? (
          <div className={styles.status}>No materials found. Try a different search.</div>
        ) : (
          <div className={styles.grid}>
            {items.map((item, index) => (
              <article className={styles.card} key={item.id || `${type}-${item.title}-${index}`}>
                <div className={styles.cardTop}>
                  <span className={styles.fileIcon}><FaFilePdf aria-hidden="true" /></span>
                  <span className={styles.program}>{item.program || 'ACADEX'}</span>
                </div>
                <h3>{item.title || 'Untitled material'}</h3>
                {item.author && <p className={styles.author}>{item.author}</p>}
                {item.description && <p className={styles.description}>{item.description}</p>}
                <div className={styles.metadata}>
                  {item.category && <span>{item.category}</span>}
                  {item.year && <span>{item.year}</span>}
                  {item.pages && <span>{item.pages} pages</span>}
                  {item.academicSession && <span>{item.academicSession}</span>}
                  {item.isGuide && <span>Study guide</span>}
                  {item.departments?.length > 0 && <span>{item.departments.join(', ')}</span>}
                </div>
                <div className={styles.actions}>
                  <button type="button" onClick={() => previewMaterial(item)}>
                    <FaEye aria-hidden="true" /> Preview
                  </button>
                  <button type="button" onClick={() => requireAuthentication('download this material')}>
                    <FaDownload aria-hidden="true" /> Download
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}

        {!loading && !loadError && pagination.pages > 1 && (
          <nav className={styles.pagination} aria-label="Material pages">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => setPagination((previous) => ({ ...previous, page: previous.page - 1 }))}
            >
              Previous
            </button>
            <span>Page {pagination.page} of {pagination.pages}</span>
            <button
              type="button"
              disabled={pagination.page >= pagination.pages}
              onClick={() => setPagination((previous) => ({ ...previous, page: previous.page + 1 }))}
            >
              Next
            </button>
          </nav>
        )}
      </main>
      <PublicFooter />
      {previewItem && (
        <div className={styles.previewBackdrop} role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) closePreview();
        }}>
          <section className={styles.previewModal} role="dialog" aria-modal="true" aria-labelledby="material-preview-title">
            <button type="button" className={styles.previewClose} onClick={closePreview} aria-label="Close preview">×</button>
            <h2 id="material-preview-title">{previewItem.title || 'Material preview'}</h2>
            <p className={styles.previewPageNote}>Page 1 preview · Sign in to read the remaining pages.</p>
            {previewLoading ? (
              <div className={styles.previewStatus} role="status">Preparing secure preview…</div>
            ) : previewError ? (
              <div className={styles.previewStatus} role="alert">{previewError}</div>
            ) : previewUrl ? (
              <iframe className={styles.previewFrame} src={previewUrl} title={`First page of ${previewItem.title || 'material'}`} />
            ) : null}
            <div className={styles.lockedPreview}>
              <span aria-hidden="true">🔒</span>
              <p><strong>Page 2 is locked.</strong> Sign in to continue reading this material.</p>
              <button type="button" onClick={() => requireAuthentication('continue reading this material')}>
                Sign in to continue
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

export default PublicMaterials;
