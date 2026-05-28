import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/internshipTopicsAdmin.module.css';
import crudStyles from '../Astyles/AdminCrudTwoCol.module.css';

const EMPTY_FORM = {
  title: '',
  description: '',
  research_guide: '',
  program: 'HND',
  department_ids: [],
  keywords_text: '',
  citations_text: '',
};

const PAGE_SIZE = 7;

const AdminInternshipTopics = () => {
  const [form, setForm] = useState(EMPTY_FORM);
  const [departments, setDepartments] = useState([]);
  const [topics, setTopics] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [pageIndex, setPageIndex] = useState(0);

  const filteredDepartments = useMemo(
    () => departments.filter((d) => String(d.program || 'HND').toUpperCase() === String(form.program || 'HND').toUpperCase()),
    [departments, form.program]
  );

  const loadDepartments = useCallback(async () => {
    const { data } = await api.get('/admin/departments');
    setDepartments(Array.isArray(data) ? data : []);
  }, []);

  const loadTopics = useCallback(async () => {
    const { data } = await api.get('/admin/internship-topics?limit=200');
    setTopics(Array.isArray(data?.topics) ? data.topics : []);
  }, []);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([loadDepartments(), loadTopics()]);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load internship topics.'), 'error');
    } finally {
      setLoading(false);
    }
  }, [loadDepartments, loadTopics]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));

    if (name === 'program') {
      setForm((prev) => ({
        ...prev,
        program: value,
        department_ids: [],
      }));
    }
  };

  const onDepartmentToggle = (id) => {
    setForm((prev) => {
      const exists = prev.department_ids.includes(id);
      return {
        ...prev,
        department_ids: exists ? prev.department_ids.filter((x) => x !== id) : [...prev.department_ids, id],
      };
    });
  };

  const keywords = useMemo(
    () => String(form.keywords_text || '')
      .split(',')
      .map((k) => k.trim())
      .filter(Boolean),
    [form.keywords_text]
  );

  const citations = useMemo(
    () => String(form.citations_text || '')
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
    [form.citations_text]
  );

  const filteredTopics = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return topics;

    return topics.filter((topic) => {
      const deptText = Array.isArray(topic.departments)
        ? topic.departments.map((d) => `${d.department_name || ''} ${d.abbreviation || ''}`.trim()).join(' ')
        : '';
      const hay = [
        topic.title,
        topic.description,
        topic.program,
        deptText,
        Array.isArray(topic.keywords) ? topic.keywords.join(' ') : '',
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();

      return hay.includes(q);
    });
  }, [topics, search]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filteredTopics.length / PAGE_SIZE)),
    [filteredTopics.length]
  );

  const pagedTopics = useMemo(() => {
    const start = pageIndex * PAGE_SIZE;
    return filteredTopics.slice(start, start + PAGE_SIZE);
  }, [filteredTopics, pageIndex]);

  useEffect(() => {
    setPageIndex(0);
  }, [search, form.program]);

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, totalPages - 1));
  }, [totalPages]);

  const onSubmit = async (e) => {
    e.preventDefault();

    if (!form.title.trim() || !form.description.trim() || !form.research_guide.trim()) {
      showToast('Title, description, and research guide are required.', 'warning');
      return;
    }

    if (form.department_ids.length === 0) {
      showToast('Select at least one department.', 'warning');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description.trim(),
        research_guide: form.research_guide.trim(),
        program: form.program,
        department_ids: form.department_ids,
        keywords,
        citations,
      };

      if (editingId) {
        await api.put(`/admin/internship-topics/${encodeURIComponent(editingId)}`, payload);
        showToast('Topic updated successfully.', 'success');
      } else {
        await api.post('/admin/internship-topics', payload);
        showToast('Topic created successfully.', 'success');
      }

      setEditingId(null);
      setForm(EMPTY_FORM);
      await loadTopics();
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to save topic.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const startEdit = (topic) => {
    setEditingId(topic.topic_id);
    setForm({
      title: topic.title || '',
      description: topic.description || '',
      research_guide: topic.research_guide || '',
      program: topic.program || 'HND',
      department_ids: Array.isArray(topic.departments) ? topic.departments.map((d) => String(d.department_id)) : [],
      keywords_text: Array.isArray(topic.keywords) ? topic.keywords.join(', ') : '',
      citations_text: Array.isArray(topic.citations) ? topic.citations.map((c) => c.text).join('\n') : '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const onDelete = async (topicId) => {
    const ok = window.confirm('Delete this topic?');
    if (!ok) return;

    try {
      await api.delete(`/admin/internship-topics/${encodeURIComponent(topicId)}`);
      setTopics((prev) => prev.filter((topic) => String(topic.topic_id) !== String(topicId)));
      showToast('Topic deleted.', 'success');

      if (String(editingId) === String(topicId)) {
        setEditingId(null);
        setForm(EMPTY_FORM);
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to delete topic.'), 'error');
    }
  };

  return (
    <div className={crudStyles.page}>
      <Helmet>
        <title>Admin — Internship Topics</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <div className={crudStyles.grid}>
        <section className={crudStyles.card}>
          <div className={crudStyles.cardHeader}>
            <h2 className={crudStyles.cardTitle}>{editingId ? 'Update Internship Topic' : 'Create Internship Topic'}</h2>
            {editingId ? (
              <button
                type="button"
                className={`${crudStyles.btn} ${crudStyles.btnGhost}`}
                onClick={() => {
                  setEditingId(null);
                  setForm(EMPTY_FORM);
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>

          <p className={styles.subtitle}>Create and manage topic proposals by program and applicable departments.</p>

          <form className={styles.form} onSubmit={onSubmit}>
            <div className={styles.row}>
              <label className={styles.field}>
                <span>Title</span>
                <input name="title" value={form.title} onChange={onChange} placeholder="Enter a topic title" />
              </label>
              <label className={styles.field}>
                <span>Program</span>
                <select name="program" value={form.program} onChange={onChange}>
                  <option value="HND">HND</option>
                  <option value="BTS">BTS</option>
                </select>
              </label>
            </div>

            <label className={styles.field}>
              <span>Full description</span>
              <textarea name="description" value={form.description} onChange={onChange} rows={4} placeholder="Explain what the topic is about." />
            </label>

            <label className={styles.field}>
              <span>Research guide</span>
              <textarea name="research_guide" value={form.research_guide} onChange={onChange} rows={5} placeholder="Provide step-by-step guidance for candidates." />
            </label>

            <label className={styles.field}>
              <span>Keywords (hidden from candidates)</span>
              <input
                name="keywords_text"
                value={form.keywords_text}
                onChange={onChange}
                placeholder="comma, separated, search, terms"
              />
            </label>

            <label className={styles.field}>
              <span>Optional citations (one per line)</span>
              <textarea
                name="citations_text"
                value={form.citations_text}
                onChange={onChange}
                rows={4}
                placeholder="Paper title - author - year"
              />
            </label>

            <div className={styles.field}>
              <span>Applicable departments</span>
              <div className={styles.departmentGrid}>
                {filteredDepartments.map((dept) => {
                  const id = String(dept.dpt_id || dept._id);
                  const checked = form.department_ids.includes(id);
                  return (
                    <label key={id} className={styles.deptChip}>
                      <input type="checkbox" checked={checked} onChange={() => onDepartmentToggle(id)} />
                      <span>{dept.department_name} ({dept.abbreviation})</span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className={styles.actions}>
              <button type="submit" className={styles.primaryBtn} disabled={submitting}>
                {submitting ? 'Saving...' : editingId ? 'Update Topic' : 'Create Topic'}
              </button>
            </div>
          </form>
        </section>

        <section className={`${crudStyles.card} ${crudStyles.stickyPanel}`}>
          <div className={crudStyles.cardHeader}>
            <h3 className={crudStyles.cardTitle}>Existing Internship Topics</h3>
          </div>

          <input
            className={crudStyles.search}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title, description, department, program…"
          />

          <div className={crudStyles.listTools}>
            <span className={crudStyles.resultsCount}>{filteredTopics.length} total</span>
            {filteredTopics.length > PAGE_SIZE && (
              <label className={crudStyles.pageSelectWrap}>
                <span>View more</span>
                <select
                  className={crudStyles.pageSelect}
                  value={pageIndex}
                  onChange={(e) => setPageIndex(Number(e.target.value))}
                >
                  {Array.from({ length: totalPages }, (_, idx) => {
                    const start = idx * PAGE_SIZE + 1;
                    const end = Math.min((idx + 1) * PAGE_SIZE, filteredTopics.length);
                    return (
                      <option key={`topic-page-${idx}`} value={idx}>
                        {start}-{end}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}
          </div>

          <div className={`${crudStyles.list} ${crudStyles.scrollList}`}>
            {loading ? <div className={crudStyles.item}>Loading internship topics...</div> : null}
            {!loading && filteredTopics.length === 0 ? (
              <div className={crudStyles.item}>No internship topics found.</div>
            ) : null}

            {!loading && pagedTopics.map((topic) => {
              const id = topic.topic_id;
              const deptLabel = Array.isArray(topic.departments) && topic.departments.length
                ? topic.departments.map((d) => d.abbreviation || d.department_name).join(', ')
                : 'General';

              return (
                <div
                  key={String(id)}
                  className={`${crudStyles.item} ${String(editingId) === String(id) ? crudStyles.itemActive : ''}`}
                  onClick={() => startEdit(topic)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      startEdit(topic);
                    }
                  }}
                  title="Click to edit"
                >
                  <div className={crudStyles.itemTop}>
                    <div>
                      <div className={crudStyles.itemTitle}>{topic.title}</div>
                      <div className={crudStyles.itemMeta}>
                        Program: {topic.program} • Depts: {deptLabel}
                        <br />
                        Rating: {topic.metrics?.rating_average || 0} ({topic.metrics?.rating_count || 0})
                      </div>
                    </div>

                    <div className={crudStyles.actions}>
                      <button
                        type="button"
                        className={`${crudStyles.btn} ${crudStyles.btnDanger}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          onDelete(id);
                        }}
                        title="Delete topic"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AdminInternshipTopics;
