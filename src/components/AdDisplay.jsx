/**
 * AdDisplay — renders active ads for the current user.
 * Mounted once per shell (candidate/lecturer/admin). Polls /api/ads/active,
 * then shows each ad according to its interval, display type, and route targeting.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { FaTimes, FaExternalLinkAlt } from 'react-icons/fa';
import styles from '../Astyles/AdDisplay.module.css';
import api from '../services/api';
import { resolveAdCtaDestination } from '../utility/adCta';

/* ─────────── storage helpers ─────────── */
const SEEN_KEY = 'ad_last_seen_v1';

const getSeenMap = () => {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '{}'); } catch { return {}; }
};

const markSeen = (id) => {
  const map = getSeenMap();
  map[id] = Date.now();
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(map)); } catch { }
};

const shouldShow = (ad) => {
  const map = getSeenMap();
  const last = map[ad._id];
  if (!last) return true;
  const intervalMs = (Number(ad.intervalSeconds) || 3600) * 1000;
  if (intervalMs === 0) return true;
  return Date.now() - last > intervalMs;
};

/* ─────────── route match ─────────── */
const matchesRoute = (ad, pathname) => {
  if (ad.displayScope !== 'specific_routes') return true;
  const routes = Array.isArray(ad.specificRoutes) ? ad.specificRoutes : [];
  return routes.some((r) => pathname === r || pathname.startsWith(r + '/'));
};

const PersonalizedArtwork = ({ ad, className }) => (
  <div className={`${styles.personalizedArtwork} ${className || ''}`}>
    <img src={ad.imageUrl} alt="" className={styles.personalizedImage} />
    {ad.candidateName ? (
      <span className={`${styles.personalizedName} ${ad.imageUrl === '/referral-shirt.png' ? styles.personalizedNameShirt : ''}`}>
        {ad.nextGiftNumber ? `G${ad.nextGiftNumber} - ` : ''}
        {ad.candidateName}
      </span>
    ) : null}
  </div>
);

/* ─────────── single ad renderer ─────────── */
const AdModal = ({ ad, onClose, onCtaClick }) => {
  const { styling = {}, displayType } = ad;
  const br = styling.borderRadius || '16px';

  // Track modal open time
  const openTimeRef = useRef(Date.now());

  // auto-close timer
  const [timeLeft, setTimeLeft] = useState(ad.closeOnTimer ? (ad.closeTimerSeconds || 8) : null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!ad.closeOnTimer) return;
    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current); onClose(); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [ad.closeOnTimer, onClose]);

  // impression + modal-open on mount
  useEffect(() => {
    api.post(`/ads/${ad._id}/impression`, { source_route: window.location.pathname }).catch(() => { });
    api.post(`/ads/${ad._id}/modal-open`, { source_route: window.location.pathname }).catch(() => { });
  }, [ad._id]);

  // Track modal close with duration
  const handleClose = useCallback((isDismiss = false, actionTaken = false) => {
    const durationSeconds = Math.round((Date.now() - openTimeRef.current) / 1000);

    if (isDismiss) {
      api.post(`/ads/${ad._id}/dismiss`).catch(() => { });
    } else {
      api.post(`/ads/${ad._id}/modal-close`, { duration_seconds: durationSeconds, action_taken: actionTaken }).catch(() => { });
    }

    onClose();
  }, [ad._id, onClose]);

  const containerStyle = {
    backgroundColor: styling.backgroundColor || '#ffffff',
    color: styling.textColor || '#1a1a1a',
    borderRadius: br,
    border: `1.5px solid ${styling.borderColor || 'transparent'}`,
    '--br': br,
  };

  const titleStyle = {
    color: styling.titleColor || styling.textColor || '#1a1a1a',
  };

  const subtitleStyle = {
    color: styling.subtitleColor || styling.textColor || '#575757',
  };

  const bodyStyle = {
    color: styling.bodyColor || styling.textColor || '#333333',
  };

  const tagStyle = {
    color: styling.tagTextColor || '#111111',
    backgroundColor: styling.tagBackgroundColor || 'rgba(255,255,255,0.2)',
  };

  const btnStyle = {
    backgroundColor: styling.buttonColor || '#4caf50',
    color: styling.buttonTextColor || '#ffffff',
    borderColor: styling.buttonBorderColor || 'transparent',
    borderRadius: styling.buttonBorderRadius || '999px',
    border: styling.buttonBorderColor && styling.buttonBorderColor !== 'transparent'
      ? `1px solid ${styling.buttonBorderColor}`
      : 'none',
  };

  const secondaryBtnStyle = {
    backgroundColor: styling.secondaryButtonColor || 'transparent',
    color: styling.secondaryButtonTextColor || (styling.buttonColor || '#4caf50'),
    borderColor: styling.secondaryButtonBorderColor || (styling.buttonBorderColor || 'transparent'),
    borderRadius: styling.secondaryButtonBorderRadius || styling.buttonBorderRadius || '999px',
    border: styling.secondaryButtonBorderColor && styling.secondaryButtonBorderColor !== 'transparent'
      ? `1px solid ${styling.secondaryButtonBorderColor}`
      : `1px solid ${styling.secondaryButtonBorderColor || 'transparent'}`,
  };

  const showImage = ad.imageUrl && styling.imagePosition !== 'none';
  const isPersonalizedApparel = ad.imagePersonalization === 'candidate_apparel';
  const isBackground = styling.imagePosition === 'background';
  const isSide = styling.imagePosition === 'left' || styling.imagePosition === 'right';

  if (displayType === 'banner_top' || displayType === 'banner_bottom') {
    return (
      <div
        className={displayType === 'banner_top' ? styles.bannerTop : styles.bannerBottom}
        style={{ backgroundColor: styling.backgroundColor || '#1976d2', color: styling.textColor || '#fff', borderRadius: br }}
      >
        <div className={styles.bannerContent}>
          {isPersonalizedApparel && <PersonalizedArtwork ad={ad} className={styles.bannerArtwork} />}
          {ad.logoUrl && <img src={ad.logoUrl} alt="" className={styles.logo} />}
          <div style={{ minWidth: 0 }}>
            <p className={styles.bannerTitle}>{ad.title}</p>
            {ad.subtitle && <p className={styles.bannerBody}>{ad.subtitle}</p>}
          </div>
          {ad.ctaText && (
            <button type="button" className={styles.bannerCta} style={btnStyle}
              onClick={() => {
                if (onCtaClick(ad.ctaUrl, 'primary')) handleClose(false, true);
              }}>
              {ad.ctaText}
            </button>
          )}
        </div>
        {(ad.showCloseButton || ad.closeOnTimer) && (
          <button type="button" className={styles.bannerCloseBtn} onClick={() => handleClose(true)} aria-label="Close ad">
            <FaTimes />
          </button>
        )}
      </div>
    );
  }

  // Modal
  return (
    <div className={styles.modalOverlay} style={{ background: styling.overlayColor || 'rgba(0,0,0,0.55)' }}>
      <div className={styles.modal} style={containerStyle}>
        {/* background image */}
        {showImage && isBackground && (
          <div className={styles.bgImage} style={{ backgroundImage: `url(${ad.imageUrl})` }} />
        )}

        {/* top image */}
        {showImage && styling.imagePosition === 'top' && (
          <div className={styles.imageTop}>
            {isPersonalizedApparel
              ? <PersonalizedArtwork ad={ad} className={styles.apparelTop} />
              : (
                <div className={styles.imgWrapper} style={{ borderRadius: `${br} ${br} 0 0` }}>
                  <img src={ad.imageUrl} alt="" />
                </div>
              )}
          </div>
        )}

        <div className={isSide ? styles.imageSide : ''}>
          {isSide && showImage && (
            <div className={styles.innerSide}>
              {isPersonalizedApparel
                ? <PersonalizedArtwork ad={ad} className={styles.apparelSide} />
                : (
                  <div className={styles.imgWrapper} style={{ order: styling.imagePosition === 'right' ? 1 : 0 }}>
                    <img src={ad.imageUrl} alt="" />
                  </div>
                )}
              <div className={styles.inner} style={{ padding: '20px 12px 20px 0' }}>
                <InnerContent
                  ad={ad}
                  btnStyle={btnStyle}
                  secondaryBtnStyle={secondaryBtnStyle}
                  handleClose={handleClose}
                  onCtaClick={onCtaClick}
                  titleStyle={titleStyle}
                  subtitleStyle={subtitleStyle}
                  bodyStyle={bodyStyle}
                  tagStyle={tagStyle}
                />
              </div>
            </div>
          )}
          {!isSide && (
            <div className={styles.inner}>
              <InnerContent
                ad={ad}
                btnStyle={btnStyle}
                secondaryBtnStyle={secondaryBtnStyle}
                handleClose={handleClose}
                onCtaClick={onCtaClick}
                titleStyle={titleStyle}
                subtitleStyle={subtitleStyle}
                bodyStyle={bodyStyle}
                tagStyle={tagStyle}
              />
            </div>
          )}
        </div>

        {/* close button */}
        {(ad.showCloseButton || ad.closeOnTimer) && (
          <button type="button" className={styles.closeBtn} onClick={() => handleClose(true)} aria-label="Close ad">
            {ad.closeOnTimer && timeLeft !== null ? timeLeft : <FaTimes />}
          </button>
        )}

        {/* timer progress bar */}
        {ad.closeOnTimer && timeLeft !== null && (
          <div
            className={styles.timerBar}
            style={{
              width: `${(timeLeft / ad.closeTimerSeconds) * 100}%`,
              transition: 'width 1s linear',
            }}
          />
        )}
      </div>
    </div>
  );
};

/* inner content (shared between modal and side layout) */
const InnerContent = ({ ad, btnStyle, secondaryBtnStyle, handleClose, onCtaClick, titleStyle, subtitleStyle, bodyStyle, tagStyle }) => (
  <>
    {ad.logoUrl && (
      <img
        src={ad.logoUrl}
        alt="logo"
        className={styles.logo}
        onError={(e) => { e.currentTarget.style.display = 'none'; }}
      />
    )}
    {ad.tag && <span className={styles.tag} style={tagStyle}>{ad.tag}</span>}
    <h2 className={styles.adTitle} style={titleStyle}>{ad.title}</h2>
    {ad.subtitle && <p className={styles.adSubtitle} style={subtitleStyle}>{ad.subtitle}</p>}
    {ad.body && <p className={styles.adBody} style={bodyStyle}>{ad.body}</p>}
    {(ad.ctaText || ad.ctaSecondaryText) && (
      <div className={styles.ctaRow}>
          {ad.ctaText && (
          <button
            type="button"
            className={styles.ctaBtn}
            style={btnStyle}
            onClick={() => {
              if (onCtaClick(ad.ctaUrl, 'primary')) handleClose(false, true);
            }}
          >
            <FaExternalLinkAlt style={{ fontSize: 11 }} />
            {ad.ctaText}
          </button>
        )}
        {ad.ctaSecondaryText && (
          <button
            type="button"
            className={`${styles.ctaBtn} ${styles.ctaSecondary}`}
            style={secondaryBtnStyle}
            onClick={() => {
              if (onCtaClick(ad.ctaSecondaryUrl, 'secondary')) handleClose(false, true);
            }}
          >
            {ad.ctaSecondaryText}
          </button>
        )}
      </div>
    )}
  </>
);

/* ─────────────────── main export ─────────────────── */
const AdDisplay = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [queue, setQueue] = useState([]);
  const [current, setCurrent] = useState(null);
  const fetchedRef = useRef(false);

  /* fetch active ads once per mount */
  const fetchAds = useCallback(async () => {
    try {
      const res = await api.get('/ads/active');
      const ads = Array.isArray(res.data?.ads) ? res.data.ads : [];
      setQueue(ads);
    } catch {
      setQueue([]);
    }
  }, []);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    fetchAds();
  }, [fetchAds]);

  /* pick which ad to show whenever pathname or queue changes */
  useEffect(() => {
    if (current) return; // already showing one
    const eligible = queue.find(
      (ad) => shouldShow(ad) && matchesRoute(ad, location.pathname)
    );
    if (eligible) {
      markSeen(eligible._id);
      setCurrent(eligible);
    }
  }, [queue, location.pathname, current]);

  const handleClose = useCallback(() => {
    setCurrent(null);
    // After closing, advance queue (remove shown ad and try next)
    setQueue((prev) => {
      const rest = prev.filter((a) => a._id !== current?._id);
      return rest;
    });
  }, [current]);

  const handleCtaClick = useCallback((destination, button) => {
    const resolved = resolveAdCtaDestination(destination);
    if (!resolved) {
      if (typeof window.showToast === 'function') {
        window.showToast('This ad button does not have a valid destination configured.', 'warning');
      }
      return;
    }

    api.post(`/ads/${current._id}/click`, { button }).catch((error) => {
      console.error('Failed to track ad button click', error);
    });
    api.post(`/ads/${current._id}/link-click`, {
      link_destination: destination,
      button,
    }).catch((error) => {
      console.error('Failed to track ad link click', error);
    });

    try {
      localStorage.setItem('last_clicked_ad', JSON.stringify({ adId: current._id, button, ts: Date.now() }));
    } catch (_) {}

    if (resolved.type === 'internal') {
      navigate(resolved.path);
    } else {
      window.open(resolved.url, '_blank', 'noopener,noreferrer');
    }
    return true;
  }, [current, navigate]);

  if (!current) return null;

  return <AdModal ad={current} onClose={handleClose} onCtaClick={handleCtaClick} />;
};

export default AdDisplay;
