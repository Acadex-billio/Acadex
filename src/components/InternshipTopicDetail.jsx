import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../services/api';
import styles from '../Astyles/internshipTopicsCandidate.module.css';
import { getErrorMessage } from '../utility/getErrorMessage';
import { showToast } from '../utility/ToastNotification';
import GraduationCapLoader from './GraduationCapLoader';

const InternshipTopicDetail = () => {
  const { topicId } = useParams();
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

  if (loading) return <GraduationCapLoader fullscreen label="Loading topic..." />;
  if (!topic) return <div className={styles.page}><p>Topic not found.</p><Link to="/candidate/internship-topics">Back to topics</Link></div>;

  return (
    <div className={styles.page}>
      <Link className={styles.backLink} to="/candidate/internship-topics">← Back to topics</Link>

      <article className={styles.detailCard}>
        <div className={styles.cardTop}>
          <h1>{topic.title}</h1>
          <span className={styles.programBadge}>{topic.program}</span>
        </div>

        <div className={styles.metrics}>
          <span>Rating: {topic.metrics.rating_average} ({topic.metrics.rating_count})</span>
          <span>Recommended: {topic.metrics.recommendation_count}</span>
          <span>👍 {topic.metrics.reaction_up_count} | 👎 {topic.metrics.reaction_down_count}</span>
        </div>

        <section>
          <h3>Description</h3>
          <p className={styles.detailText}>{topic.description}</p>
        </section>

        <section>
          <h3>Guide to carry out the research</h3>
          <p className={styles.detailText}>{topic.research_guide}</p>
        </section>

        <section>
          <h3>Applicable departments</h3>
          <div className={styles.departments}>
            {(topic.departments || []).map((dept) => (
              <span key={dept.department_id} className={styles.deptChip}>{dept.department_name} ({dept.abbreviation})</span>
            ))}
          </div>
        </section>

        {topic.citations?.length ? (
          <section>
            <h3>Optional citations</h3>
            <ul className={styles.citationList}>
              {topic.citations.map((citation, idx) => (
                <li key={`${citation.text}-${idx}`}>{citation.text}</li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className={styles.feedbackSection}>
          <h3>Your feedback</h3>

          <div className={styles.feedbackRow}>
            <span>Rate this topic:</span>
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
        </section>
      </article>
    </div>
  );
};

export default InternshipTopicDetail;
