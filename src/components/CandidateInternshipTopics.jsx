import React, { useCallback, useMemo, useState, useEffect } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import api from '../services/api';
import styles from '../Astyles/internshipTopicsCandidate.module.css';
import { getErrorMessage } from '../utility/getErrorMessage';
import { showToast } from '../utility/ToastNotification';
import GraduationCapLoader from './GraduationCapLoader';
import * as PhosphorIcons from 'phosphor-react';

const CandidateInternshipTopics = () => {
  const [loading, setLoading] = useState(true);
  const [topics, setTopics] = useState([]);
  const [query, setQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState('newest');

  const loadTopics = useCallback(async (nextFilters = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      const q = nextFilters.query ?? query;
      const dept = nextFilters.departmentFilter ?? departmentFilter;
      const rating = nextFilters.minRating ?? minRating;
      const sort = nextFilters.sortBy ?? sortBy;

      if (q) params.set('q', q);
      if (dept) params.set('department_id', dept);
      if (Number(rating) > 0) params.set('min_rating', String(rating));
      if (sort) params.set('sort', sort);

      const { data } = await api.get(`/candidate/internship-topics?${params.toString()}`);
      setTopics(Array.isArray(data?.topics) ? data.topics : []);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load internship topics.'), 'error');
      setTopics([]);
    } finally {
      setLoading(false);
    }
  }, [departmentFilter, minRating, query, sortBy]);

  React.useEffect(() => {
    loadTopics();
  }, [loadTopics]);

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    if (!topics.length) return;
    const params = new URLSearchParams(location.search);
    const topicId = String(params.get('topicId') || '').trim();
    if (!topicId) return;
    const linked = topics.find((t) => String(t.topic_id) === topicId || String(t.topic_id) === topicId.replace(/%20/g, ' '));
    if (linked && linked.title) {
      // Update query state AND reload with the new filter
      const newQuery = linked.title;
      setQuery(newQuery);
      loadTopics({ query: newQuery, departmentFilter, minRating, sortBy });
    }
    navigate('/candidate/internship-topics', { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topics, location.search]);

  const allDepartments = useMemo(() => {
    const map = new Map();
    topics.forEach((topic) => {
      (topic.departments || []).forEach((dept) => {
        map.set(String(dept.department_id), dept);
      });
    });
    return Array.from(map.values());
  }, [topics]);

  if (loading) {
    return <GraduationCapLoader fullscreen label="Loading research topics..." />;
  }

  const renderIcon = (iconName) => {
    const Icon = iconName ? PhosphorIcons[String(iconName)] : null;
    if (Icon && typeof Icon === 'object' && Icon.$$typeof === Symbol.for('react.forward_ref')) {
      return <Icon size={28} weight="duotone" />;
    }
    return <span>{iconName || '💡'}</span>;
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1>Internship Research Topics</h1>
        <p>Browse proposed research directions and open one to see full guidance and community feedback.</p>
      </div>

      <div className={styles.filters}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search topics"
        />

        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
          <option value="">All departments</option>
          {allDepartments.map((dept) => (
            <option key={dept.department_id} value={dept.department_id}>
              {dept.department_name}
            </option>
          ))}
        </select>

        <select value={minRating} onChange={(e) => setMinRating(Number(e.target.value || 0))}>
          <option value={0}>Any rating</option>
          <option value={2}>2 stars and above</option>
          <option value={3}>3 stars and above</option>
          <option value={4}>4 stars and above</option>
        </select>

        <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
          <option value="newest">Newest</option>
          <option value="rating">Top rated</option>
          <option value="recommended">Most recommended</option>
          <option value="popular">Popular</option>
        </select>

        <button type="button" onClick={() => loadTopics()}>Apply</button>
      </div>

      {topics.length === 0 ? <p className={styles.empty}>No topics found for this filter.</p> : null}

      <div className={styles.list}>
        {topics.map((topic) => (
          <article key={topic.topic_id} className={styles.card}>
            <div className={styles.cardTop}>
              <div className={styles.topicIconWrap}>
                <div className={styles.topicIcon}>{renderIcon(topic.topic_icon)}</div>
              </div>
              <div className={styles.topicLead}>
                <h2>{topic.title}</h2>
                <div className={styles.programChips}>
                  {(Array.isArray(topic.programs) ? topic.programs : [topic.program]).map((program) => (
                    <span key={program} className={styles.programBadge}>{program}</span>
                  ))}
                </div>
              </div>
            </div>

            {topic.problem_statement ? (
              <p className={styles.problemSnippet}><strong>Problem Statement</strong> {topic.problem_statement}</p>
            ) : (
              <p className={styles.description}>{topic.description}</p>
            )}

            <div className={styles.departments}>
              {(topic.departments || []).map((dept) => (
                <span key={dept.department_id} className={styles.deptChip}>{dept.abbreviation}</span>
              ))}
            </div>

            <div className={styles.metrics}>
              <span>Rating: {topic.metrics.rating_average} ({topic.metrics.rating_count})</span>
              <span>Recommended: {topic.metrics.recommendation_count}</span>
              <span>Reactions: 👍 {topic.metrics.reaction_up_count} / 👎 {topic.metrics.reaction_down_count}</span>
            </div>

            <div className={styles.actionRow}>
              <Link to={`/candidate/internship-topics/${topic.topic_id}`} className={styles.actionBtn}>
                View full topic
              </Link>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={async () => {
                  try {
                    const payload = { content_type: 'internship_topic', content_title: topic.title || 'Topic', action: 'save' };
                    await api.post('/candidate/history/add', payload);
                    showToast('Saved topic to your profile', 'success');
                  } catch (err) {
                    showToast(getErrorMessage(err, 'Failed to save topic'), 'error');
                  }
                }}
              >
                Save
              </button>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
};

export default CandidateInternshipTopics;
