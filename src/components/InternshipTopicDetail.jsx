import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import styles from '../Astyles/internshipTopicsCandidate.module.css';
import { getErrorMessage } from '../utility/getErrorMessage';
import { showToast } from '../utility/ToastNotification';
import GraduationCapLoader from './GraduationCapLoader';
import * as PhosphorIcons from 'phosphor-react';

const InternshipTopicDetail = ({ previewMode = false }) => {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const isPreviewRoute = previewMode || location.pathname.includes('/preview/');
  const [loading, setLoading] = useState(true);
  const [topic, setTopic] = useState(null);
  const [busyAction, setBusyAction] = useState('');

  const loadTopic = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/candidate/internship-topics/${encodeURIComponent(topicId)}`);
      setTopic(data?.topic || null);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load topic details.'), 'error');
      setTopic(null);
    } finally {
      setLoading(false);
    }
  }, [topicId]);

  useEffect(() => {
    loadTopic();
  }, [loadTopic]);

  useEffect(() => {
    if (!topicId) return;
    if (isAuthenticated || isPreviewRoute) return;
    navigate(`/candidate/internship-topics/preview/${encodeURIComponent(topicId)}`, { replace: true });
  }, [isAuthenticated, isPreviewRoute, navigate, topicId]);

  const requireAuthForAction = (message = 'Please log in or create an account to access the full topic experience.') => {
    if (isAuthenticated) return true;
    showToast(message, 'info');
    navigate('/login', { state: { from: location.pathname + location.search } });
    return false;
  };

  const submitRating = async (stars) => {
    setBusyAction('rating');
    try {
      const { data } = await api.post(`/candidate/internship-topics/${encodeURIComponent(topicId)}/rating`, { stars });
      setTopic(data?.topic || topic);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to save rating.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const toggleRecommend = async () => {
    if (!requireAuthForAction()) return;
    setBusyAction('recommend');
    try {
      const { data } = await api.post(`/candidate/internship-topics/${encodeURIComponent(topicId)}/recommend`);
      setTopic(data?.topic || topic);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update recommendation.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const setReaction = async (type) => {
    if (!requireAuthForAction()) return;
    setBusyAction(type);
    try {
      const { data } = await api.post(`/candidate/internship-topics/${encodeURIComponent(topicId)}/reaction`, { type });
      setTopic(data?.topic || topic);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update reaction.'), 'error');
    } finally {
      setBusyAction('');
    }
  };

  const starButtons = useMemo(() => [1, 2, 3, 4, 5], []);

  const renderCitation = (citation, idx) => {
    const text = String(citation?.text || '').trim();
    if (!text) return null;
    const urlMatch = text.match(/https?:\/\/[\S]+/i);
    if (urlMatch) {
      const url = urlMatch[0];
      const label = text.replace(url, '').trim() || url;
      return (
        <li key={`${url}-${idx}`}>
          <a href={url} target="_blank" rel="noopener noreferrer" className={styles.citationLink}>
            {label || url}
          </a>
        </li>
      );
    }
    return <li key={`${text}-${idx}`}>{text}</li>;
  };

  const renderIcon = (iconName) => {
    const Icon = iconName ? PhosphorIcons[String(iconName)] : null;
    if (Icon && typeof Icon === 'object' && Icon.$$typeof === Symbol.for('react.forward_ref')) {
      return <Icon size={32} weight="duotone" />;
    }
    return <span>{iconName || '💡'}</span>;
  };

  const renderKeywords = () => {
    const keywords = Array.isArray(topic.keywords)
      ? topic.keywords
      : typeof topic.keywords_text === 'string'
        ? topic.keywords_text.split(',').map((value) => value.trim()).filter(Boolean)
        : [];

    if (!keywords.length) return null;
    return (
      <div className={styles.keywordList}>
        {keywords.map((keyword) => (
          <span key={keyword} className={styles.keywordTag}>{keyword}</span>
        ))}
      </div>
    );
  };

  const handleShare = async (platform) => {
    const shareBaseUrl = `${window.location.origin}/candidate/internship-topics/preview/${encodeURIComponent(topicId || '')}`;
    const pageUrl = isPreviewRoute ? `${window.location.origin}${location.pathname}` : shareBaseUrl;
    const title = topic.title || 'Internship research topic';
    const departments = Array.isArray(topic.departments)
      ? topic.departments.map((dept) => dept.department_name || dept.abbreviation).filter(Boolean)
      : [];
    const departmentList = departments.length ? departments.join(', ') : 'General';

    const rawText = `Yoo Friend, I found this interesting internship topic on Acadex and I think you should check it out. Visit Acadex to view the full guide and access thousands more topics.\n\n*Departments*\n${departmentList}\n\n*Topic*\n${title}\n\n*URL*\n${pageUrl}`;
    const encodedText = encodeURIComponent(rawText);

    if (platform === 'link') {
      try {
        await navigator.clipboard.writeText(rawText);
        showToast('Topic share text copied to clipboard.', 'success');
      } catch {
        try {
          await navigator.clipboard.writeText(pageUrl);
          showToast('Topic URL copied to clipboard.', 'success');
        } catch {
          showToast('Unable to copy link automatically. Please copy it manually.', 'warning');
        }
      }
      return;
    }

    const sharePayload = {
      title: 'Interesting Acadex internship topic',
      text: rawText,
      url: pageUrl,
    };

    if (navigator.share && platform !== 'facebook') {
      try {
        await navigator.share(sharePayload);
        return;
      } catch {
        // fall back to URL-based sharing if the native share dialog fails
      }
    }

    let shareUrl = '';
    if (platform === 'whatsapp') {
      shareUrl = `https://wa.me/?text=${encodedText}`;
    } else if (platform === 'facebook') {
      shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(pageUrl)}`;
    } else if (platform === 'twitter') {
      shareUrl = `https://twitter.com/intent/tweet?text=${encodedText}`;
    }

    if (shareUrl) {
      window.open(shareUrl, '_blank', 'noopener,noreferrer');
      showToast(`Preparing ${platform} share...`, 'success');
    }
  };

  if (loading) return <GraduationCapLoader fullscreen label="Loading topic..." />;
  if (!topic) return <div className={styles.page}><p>Topic not found.</p><Link to="/candidate/internship-topics">Back to topics</Link></div>;

  return (
    <div className={styles.page}>
      <Link className={styles.backLink} to="/candidate/internship-topics">← Back to topics</Link>

      {!isAuthenticated && (
        <div className={styles.authGateNotice}>
          <strong>Preview mode:</strong> you can review this topic without an account. Sign in or create an account to save it, rate it, and join the feedback experience.
        </div>
      )}

      <div className={styles.detailLayout}>
        <article className={styles.detailCard}>
          <div className={styles.cardTop}>
            <div className={styles.topicIconWrap}>
              <div className={styles.topicIcon}>{renderIcon(topic.topic_icon)}</div>
            </div>
            <div>
              <h1>{topic.title}</h1>
              <div className={styles.programChips}>
                {(Array.isArray(topic.programs) ? topic.programs : [topic.program]).map((program) => (
                  <span key={program} className={styles.programBadge}>{program}</span>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.metrics}>
            <span>Rating: {topic.metrics.rating_average} ({topic.metrics.rating_count})</span>
            <span>Recommended: {topic.metrics.recommendation_count}</span>
            <span>Reactions: 👍 {topic.metrics.reaction_up_count} / 👎 {topic.metrics.reaction_down_count}</span>
          </div>

          <section>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionIcon}><PhosphorIcons.WarningCircle size={18} weight="fill" /></span>
              <span>Problem Statement</span>
            </div>
            <p className={styles.detailText}>{topic.problem_statement || 'No problem statement provided.'}</p>
          </section>

          <section>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionIcon}><PhosphorIcons.TextAlignLeft size={18} weight="fill" /></span>
              <span>Full Description</span>
            </div>
            <p className={styles.detailText}>{topic.description || 'No description provided.'}</p>
          </section>

          {topic.tools_technology ? (
            <section>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionIcon}><PhosphorIcons.Wrench size={18} weight="fill" /></span>
                <span>Tools / Technology</span>
              </div>
              <p className={styles.detailText}>{topic.tools_technology}</p>
            </section>
          ) : null}

          {topic.system_solutions ? (
            <section>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionIcon}><PhosphorIcons.CheckCircle size={18} weight="fill" /></span>
                <span>System Solutions</span>
              </div>
              <p className={styles.detailText}>{topic.system_solutions}</p>
            </section>
          ) : null}

          <section>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionIcon}><PhosphorIcons.BookOpen size={18} weight="fill" /></span>
              <span>Research Guide</span>
            </div>
            <p className={styles.detailText}>{topic.research_guide || 'No research guide available.'}</p>
          </section>

          {renderKeywords()}

          <section>
            <div className={styles.sectionHeading}>
              <span className={styles.sectionIcon}><PhosphorIcons.Buildings size={18} weight="fill" /></span>
              <span>Applicable Departments</span>
            </div>
            <div className={styles.departments}>
              {(topic.departments || []).map((dept) => (
                <span key={dept.department_id} className={styles.deptChip}>{dept.department_name || dept.abbreviation}</span>
              ))}
            </div>
          </section>

          {topic.citations?.length ? (
            <section>
              <div className={styles.sectionHeading}>
                <span className={styles.sectionIcon}><PhosphorIcons.LinkSimple size={18} weight="fill" /></span>
                <span>Optional Citations</span>
              </div>
              <ul className={styles.citationList}>
                {topic.citations.map((citation, idx) => renderCitation(citation, idx))}
              </ul>
            </section>
          ) : null}
        </article>

        <aside className={styles.sidebar}>
          <div className={styles.sidebarCard}>
            <div className={styles.sidebarHeading}>Your feedback</div>
            {!isAuthenticated ? (
              <div className={styles.feedbackRow}>
                <button type="button" className={styles.actionBtn} onClick={() => requireAuthForAction()}>Sign in to rate or react</button>
              </div>
            ) : (
              <>
                <div className={styles.feedbackRow}>
                  <span>Rate this topic</span>
                  <div className={styles.stars}>
                    {starButtons.map((star) => (
                      <button
                        key={star}
                        type="button"
                        className={`${styles.starBtn} ${Number(topic.my_feedback?.stars || 0) >= star ? styles.starActive : ''}`}
                        disabled={busyAction === 'rating'}
                        onClick={() => submitRating(star)}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                </div>

                <div className={styles.feedbackRow}>
                  <button type="button" className={styles.actionBtn} disabled={busyAction === 'recommend'} onClick={toggleRecommend}>
                    {topic.my_feedback?.recommended ? 'Recommended' : 'Recommend'}
                  </button>
                </div>

                <div className={styles.feedbackRow}>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${topic.my_feedback?.reaction === 'up' ? styles.selected : ''}`}
                    disabled={busyAction === 'up'}
                    onClick={() => setReaction('up')}
                  >
                    👍 Positive
                  </button>
                  <button
                    type="button"
                    className={`${styles.actionBtn} ${topic.my_feedback?.reaction === 'down' ? styles.selected : ''}`}
                    disabled={busyAction === 'down'}
                    onClick={() => setReaction('down')}
                  >
                    👎 Negative
                  </button>
                </div>
              </>
            )}
          </div>

          <div className={styles.sidebarCard}>
            <div className={styles.sidebarHeading}>Share this topic</div>
            <p className={styles.shareDescription}>Help other students discover this research direction.</p>
            <div className={styles.shareButtons}>
              <button type="button" title="Copy share text to clipboard" className={styles.shareIconButton} onClick={() => handleShare('link')} aria-label="Copy topic link">
                <PhosphorIcons.LinkSimple size={18} />
              </button>
              <button type="button" title="Share via WhatsApp" className={styles.shareIconButton} onClick={() => handleShare('whatsapp')} aria-label="Share topic on WhatsApp">
                <PhosphorIcons.WhatsappLogo size={18} />
              </button>
              <button type="button" title="Share on Facebook" className={styles.shareIconButton} onClick={() => handleShare('facebook')} aria-label="Share topic on Facebook">
                <PhosphorIcons.FacebookLogo size={18} />
              </button>
              <button type="button" title="Share on Twitter" className={styles.shareIconButton} onClick={() => handleShare('twitter')} aria-label="Share topic on Twitter">
                <PhosphorIcons.TwitterLogo size={18} />
              </button>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};

export default InternshipTopicDetail;
