import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Helmet } from 'react-helmet';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import * as PhosphorIcons from 'phosphor-react';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/internshipTopicsAdmin.module.css';
import crudStyles from '../Astyles/AdminCrudTwoCol.module.css';

const PROGRAM_OPTIONS = ['HND', 'BTS', 'LICENCE', 'BACHELOR', 'MASTERS', 'MASTER'];
const RECENT_ICON_STORAGE_KEY = 'acadex-recent-topic-icons';

const FORWARD_REF_ICON_TYPE = Symbol.for('react.forward_ref');

const isPhosphorIconComponent = (value) =>
  value && typeof value === 'object' && value.$$typeof === FORWARD_REF_ICON_TYPE;

const PHOSPHOR_ICON_OPTIONS = Object.entries(PhosphorIcons)
  .filter(([, icon]) => isPhosphorIconComponent(icon))
  .map(([value]) => value)
  .sort()
  .map((value) => ({
    value,
    label: value.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase(),
  }));

const EMPTY_FORM = {
  title: '',
  topic_icon: 'Lightbulb',
  description: '',
  research_guide: '',
  problem_statement: '',
  tools_technology: '',
  system_solutions: '',
  programs: ['HND'],
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
  const [departmentSearch, setDepartmentSearch] = useState('');
  const [iconQuery, setIconQuery] = useState('');
  const [recentIcons, setRecentIcons] = useState([]);
  const [isIconModalOpen, setIsIconModalOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);

  const filteredDepartments = useMemo(() => {
    if (!form.programs.length) return departments;
    const programFiltered = departments.filter((d) => form.programs.includes(String(d.program || 'HND').toUpperCase()));
    if (!departmentSearch.trim()) return programFiltered;
    const query = departmentSearch.trim().toLowerCase();
    return programFiltered.filter((d) =>
      `${String(d.department_name || '').toLowerCase()} ${String(d.abbreviation || '').toLowerCase()}`.includes(query)
    );
  }, [departments, form.programs, departmentSearch]);

  const visibleDepartments = useMemo(() => filteredDepartments.slice(0, 6), [filteredDepartments]);

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
  };

  const toggleProgram = (program) => {
    setForm((prev) => {
      const normalized = String(program || '').toUpperCase();
      const selected = prev.programs.includes(normalized)
        ? prev.programs.filter((item) => item !== normalized)
        : [...prev.programs, normalized];

      const validDeptIds = new Set(
        departments
          .filter((d) => selected.includes(String(d.program || 'HND').toUpperCase()))
          .map((d) => String(d.dpt_id || d._id))
      );

      return {
        ...prev,
        programs: selected,
        department_ids: prev.department_ids.filter((deptId) => validDeptIds.has(String(deptId))),
      };
    });
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

  const filteredIconOptions = useMemo(() => {
    const query = (iconQuery || '').trim().toLowerCase();
    if (!query) return PHOSPHOR_ICON_OPTIONS;
    return PHOSPHOR_ICON_OPTIONS.filter((option) =>
      option.label.toLowerCase().includes(query) || option.value.toLowerCase().includes(query)
    );
  }, [iconQuery]);

  const renderIconPreview = (iconName) => {
    const Icon = iconName ? PhosphorIcons[String(iconName)] : null;
    if (isPhosphorIconComponent(Icon)) {
      return <Icon size={26} weight="duotone" />;
    }
    return <span>{iconName || '💡'}</span>;
  };

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(RECENT_ICON_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setRecentIcons(parsed.filter((item) => typeof item === 'string'));
        }
      }
    } catch (err) {
      // ignore localStorage errors
    }
  }, []);

  const openIconModal = () => setIsIconModalOpen(true);
  const closeIconModal = () => {
    setIsIconModalOpen(false);
    setIconQuery('');
  };

  const chooseIcon = (value) => {
    setForm((prev) => ({ ...prev, topic_icon: value }));
    setRecentIcons((prev) => {
      const next = [value, ...prev.filter((item) => item !== value)].slice(0, 10);
      try {
        window.localStorage.setItem(RECENT_ICON_STORAGE_KEY, JSON.stringify(next));
      } catch (err) {
        // ignore storage errors
      }
      return next;
    });
    closeIconModal();
  };

  const filteredTopics = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return topics;

    return topics.filter((topic) => {
      const deptText = Array.isArray(topic.departments)
        ? topic.departments.map((d) => `${d.department_name || ''} ${d.abbreviation || ''}`.trim()).join(' ')
        : '';
      const programText = Array.isArray(topic.programs)
        ? topic.programs.join(' ')
        : topic.program || '';
      const hay = [
        topic.title,
        topic.description,
        programText,
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
  }, [search, form.programs]);

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, totalPages - 1));
  }, [totalPages]);

  const onSubmit = async (e) => {
    e.preventDefault();

    if (!form.title.trim() || !form.description.trim() || !form.research_guide.trim()) {
      showToast('Title, description, and research guide are required.', 'warning');
      return;
    }

    if (!form.programs.length) {
      showToast('Select at least one program.', 'warning');
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
        topic_icon: String(form.topic_icon || '').trim(),
        description: form.description.trim(),
        research_guide: form.research_guide.trim(),
        problem_statement: String(form.problem_statement || '').trim(),
        tools_technology: String(form.tools_technology || '').trim(),
        system_solutions: String(form.system_solutions || '').trim(),
        programs: form.programs,
        department_ids: form.department_ids,
        keywords: keywords,
        citations: citations,
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
    const programs = Array.isArray(topic.programs) && topic.programs.length
      ? topic.programs
      : topic.program
        ? [topic.program]
        : ['HND'];

    setEditingId(topic.topic_id);
    setForm({
      title: topic.title || '',
      topic_icon: topic.topic_icon || 'Lightbulb',
      description: topic.description || '',
      research_guide: topic.research_guide || '',
      problem_statement: topic.problem_statement || '',
      tools_technology: topic.tools_technology || '',
      system_solutions: topic.system_solutions || '',
      programs,
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
                <textarea
                  name="title"
                  value={form.title}
                  onChange={onChange}
                  rows={2}
                  placeholder="Enter a topic title"
                />
              </label>
            </div>

            <div className={styles.field}>
              <span>Topic icon</span>
              <div className={styles.iconPicker}>
                <button type="button" className={styles.iconButton} onClick={openIconModal}>
                  <div className={styles.iconPreview}>{renderIconPreview(form.topic_icon)}</div>
                  <div className={styles.iconButtonLabel}>Choose icon</div>
                </button>
                <div className={styles.iconSummary}>
                  <strong>{PHOSPHOR_ICON_OPTIONS.find((icon) => icon.value === form.topic_icon)?.label || form.topic_icon}</strong>
                  <span>Current topic preview icon</span>
                </div>
              </div>
              <div className={styles.helpText}>Search and choose a Phosphor icon for the topic preview.</div>
            </div>

            {isIconModalOpen ? createPortal(
              <div className={styles.iconModalBackdrop} onClick={closeIconModal}>
                <div className={styles.iconModal} role="dialog" aria-modal="true" aria-label="Select topic icon" onClick={(event) => event.stopPropagation()}>
                  <div className={styles.iconModalHeader}>
                    <div>
                      <h3>Select topic icon</h3>
                      <p>Search the icon library and click one to use for the topic preview.</p>
                      <p className={styles.iconModalCount}>
                        {filteredIconOptions.length === PHOSPHOR_ICON_OPTIONS.length
                          ? `${PHOSPHOR_ICON_OPTIONS.length.toLocaleString()} icons available`
                          : `${filteredIconOptions.length.toLocaleString()} of ${PHOSPHOR_ICON_OPTIONS.length.toLocaleString()} icons shown`}
                      </p>
                    </div>
                    <button type="button" className={styles.iconCloseButton} onClick={closeIconModal} aria-label="Close icon picker">
                      ✕
                    </button>
                  </div>
                  <div className={styles.iconModalBody}>
                  {recentIcons.length > 0 && (
                    <div className={styles.iconRecentSection}>
                      <div className={styles.iconRecentTitle}>Recently used</div>
                      <div className={styles.iconGridRecent}>
                        {recentIcons.map((icon) => (
                          <button
                            key={icon}
                            type="button"
                            className={`${styles.iconTile} ${form.topic_icon === icon ? styles.iconTileActive : ''}`}
                            onClick={() => chooseIcon(icon)}
                          >
                            <div className={styles.iconTilePreview}>{renderIconPreview(icon)}</div>
                            <span>{icon}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <input
                    type="search"
                    className={styles.iconSearch}
                    placeholder="Search icons"
                    value={iconQuery}
                    onChange={(e) => setIconQuery(e.target.value)}
                  />
                  <div className={styles.iconGrid}>
                    {filteredIconOptions.length === 0 ? (
                      <div className={styles.iconEmpty}>No icons found. Try a different search term.</div>
                    ) : (
                      filteredIconOptions.map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          className={`${styles.iconTile} ${form.topic_icon === option.value ? styles.iconTileActive : ''}`}
                          onClick={() => chooseIcon(option.value)}
                          aria-label={`Choose icon ${option.label}`}
                        >
                          <div className={styles.iconTilePreview}>{renderIconPreview(option.value)}</div>
                          <span>{option.label}</span>
                        </button>
                      ))
                    )}
                  </div>
                  </div>
                </div>
              </div>,
              document.body
            ) : null}

            <div className={styles.field}>
              <span>Programs</span>
              <div className={styles.programList}>
                {PROGRAM_OPTIONS.map((program) => (
                  <button
                    key={program}
                    type="button"
                    className={`${styles.programChip} ${form.programs.includes(program) ? styles.programSelected : ''}`}
                    onClick={() => toggleProgram(program)}
                  >
                    {program}
                  </button>
                ))}
              </div>
              <div className={styles.helpText}>Select one or more programs eligible for this topic.</div>
            </div>

            <label className={styles.field}>
              <span>Problem statement</span>
              <textarea
                name="problem_statement"
                value={form.problem_statement || ''}
                onChange={onChange}
                rows={3}
                placeholder="Summarize the core problem this internship topic addresses."
              />
            </label>

            <label className={styles.field}>
              <span>Tools / technology</span>
              <textarea
                name="tools_technology"
                value={form.tools_technology || ''}
                onChange={onChange}
                rows={3}
                placeholder="Describe the tools, platforms, or technologies recommended for this study."
              />
            </label>

            <label className={styles.field}>
              <span>System solutions</span>
              <textarea
                name="system_solutions"
                value={form.system_solutions || ''}
                onChange={onChange}
                rows={3}
                placeholder="Explain how the candidate should structure the solution or system design."
              />
            </label>

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
              <div className={styles.departmentCard}>
                <input
                  className={styles.departmentSearch}
                  type="search"
                  placeholder="Search departments"
                  value={departmentSearch}
                  onChange={(e) => setDepartmentSearch(e.target.value)}
                />
                <div className={styles.departmentGrid}>
                  {visibleDepartments.map((dept) => {
                    const id = String(dept.dpt_id || dept._id);
                    const selected = form.department_ids.includes(id);
                    return (
                      <button
                        key={id}
                        type="button"
                        aria-pressed={selected}
                        className={`${styles.deptChip} ${selected ? styles.deptChipSelected : ''}`}
                        onClick={(e) => {
                          e.preventDefault();
                          onDepartmentToggle(id);
                        }}
                      >
                        <span>{dept.department_name} ({dept.abbreviation})</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              {filteredDepartments.length > visibleDepartments.length ? (
                <div className={styles.departmentHint}>
                  Showing first {visibleDepartments.length} of {filteredDepartments.length} departments. Narrow the search to locate others.
                </div>
              ) : null}
              <div className={styles.helpText}>Departments are filtered by selected program(s). Select multiple departments if the topic spans several streams.</div>
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
                        Programs: {Array.isArray(topic.programs) ? topic.programs.join(', ') : topic.program}
                        • Depts: {deptLabel}
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
