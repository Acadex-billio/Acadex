import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import GraduationCapLoader from './GraduationCapLoader';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/announcements.module.css';

const EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢'];

const formatWhen = (iso) => {
  try {
    const d = new Date(iso);
    return d.toLocaleString();
  } catch (_) {
    return String(iso || '');
  }
};

const Announcements = () => {
  const [announcements, setAnnouncements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reactingId, setReactingId] = useState(null);
  const [attachmentObjectUrls, setAttachmentObjectUrls] = useState({});

  useEffect(() => {
    // No need for axios defaults when using api service
  }, []);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await api.get('/announcements/active');
      setAnnouncements(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load announcements'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onReact = async (announcementId, emoji) => {
    if (!announcementId || !emoji) return;
    setReactingId(String(announcementId));
    try {
      const { data } = await api.post(`/announcements/${announcementId}/reactions`, { emoji });

      setAnnouncements((prev) =>
        prev.map((a) =>
          String(a.announcement_id) === String(announcementId)
            ? {
                ...a,
                reactions_count: data?.reactions_count ?? a.reactions_count,
                my_reaction: data?.my_reaction ?? null,
              }
            : a
        )
      );
    } catch (_) {
    } finally {
      setReactingId(null);
    }
  };

  const active = useMemo(() => announcements.filter(Boolean), [announcements]);

  const isImageFile = (attachment) => {
    if (!attachment) return false;
    const ext = String(attachment.originalname || '').toLowerCase();
    const imageExts = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp'];
    return imageExts.some((e) => ext.endsWith(e));
  };

  useEffect(() => {
    const urlsToRevoke = [];
    let cancelled = false;

    const loadAttachmentImages = async () => {
      const next = {};

      for (const a of active) {
        if (!a?.attachment?.url || !isImageFile(a.attachment)) continue;
        try {
          const { data } = await api.get(`/announcements/${a.announcement_id}/attachment`, {
            responseType: 'blob',
          });
          const objectUrl = URL.createObjectURL(data);
          next[String(a.announcement_id)] = objectUrl;
          urlsToRevoke.push(objectUrl);
        } catch (_) {
        }
      }

      if (!cancelled) {
        setAttachmentObjectUrls((prev) => {
          Object.values(prev).forEach((u) => {
            try {
              URL.revokeObjectURL(u);
            } catch (_) {
            }
          });
          return next;
        });
      } else {
        urlsToRevoke.forEach((u) => {
          try {
            URL.revokeObjectURL(u);
          } catch (_) {
          }
        });
      }
    };

    loadAttachmentImages();

    return () => {
      cancelled = true;
      urlsToRevoke.forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch (_) {
        }
      });
    };
  }, [active]);

  const handleAttachmentDownload = async (announcement) => {
    if (!announcement?.attachment?.url || !announcement?.announcement_id) return;
    try {
      const { data } = await api.get(`/announcements/${announcement.announcement_id}/attachment`, {
        responseType: 'blob',
      });
      const objectUrl = URL.createObjectURL(data);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = announcement.attachment.originalname || 'attachment';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (_) {
    }
  };

  if (loading) return <GraduationCapLoader fullscreen label="Loading announcements..." />;

  return (
    <div className={styles.container}>
      <div className={styles.headerRow}>
        <h2 className={styles.title}>Announcements</h2>
        <button type="button" className={styles.refreshBtn} onClick={load} disabled={loading}>
          Refresh
        </button>
      </div>

      {loading ? <div className={styles.state}>Loading...</div> : null}
      {!loading && error ? <div className={styles.stateError}>{error}</div> : null}

      {!loading && !error && active.length === 0 ? (
        <div className={styles.state}>No active announcements.</div>
      ) : null}

      <div className={styles.list}>
        {active.map((a) => (
          <div key={a.announcement_id} className={styles.card}>
            <div className={styles.cardTop}>
              <div>
                <div className={styles.cardTitle}>{a.title}</div>
                <div className={styles.cardMeta}>
                  <span>Program: {String(a.program || 'HND').toUpperCase()}</span>
                  <span>From: {a.source}</span>
                  <span>Published: {formatWhen(a.created_at)}</span>
                  <span>Expires: {formatWhen(a.expires_at)}</span>
                </div>
              </div>
              <div className={styles.reactionPill}>
                {a.my_reaction?.emoji ? <span className={styles.myEmoji}>{a.my_reaction.emoji}</span> : null}
                <span>{Number(a.reactions_count || 0)}</span>
              </div>
            </div>

            <div className={styles.body}>{a.body}</div>

            {a.attachment?.url ? (
              isImageFile(a.attachment) ? (
                attachmentObjectUrls[String(a.announcement_id)] ? (
                  <img
                    src={attachmentObjectUrls[String(a.announcement_id)]}
                    alt={a.attachment.originalname}
                    className={styles.attachmentImage}
                    onError={(e) => {
                      console.error('[Announcements] Image failed to load:', a.attachment.originalname);
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                ) : null
              ) : (
                <button
                  type="button"
                  className={styles.attachment}
                  onClick={() => handleAttachmentDownload(a)}
                >
                  Attachment: {a.attachment.originalname}
                </button>
              )
            ) : null}

            <div className={styles.reactionRow}>
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`${styles.emojiBtn} ${a.my_reaction?.emoji === e ? styles.emojiActive : ''}`}
                  onClick={() => onReact(a.announcement_id, e)}
                  disabled={reactingId === String(a.announcement_id)}
                  title="React"
                >
                  {e}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Announcements;
