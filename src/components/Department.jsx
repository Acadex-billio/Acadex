import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import { Helmet } from 'react-helmet';
import { FaGraduationCap, FaBuilding, FaTag, FaQuoteLeft, FaBook, FaAlignLeft, FaSearch, FaTrash, FaTimes } from 'react-icons/fa';
import styles from '../Astyles/Dpt.module.css';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import { useLoading } from '../context/LoadingContext';
import { useAuth } from '../context/AuthContext';
import GraduationCapLoader from './GraduationCapLoader';

const FIELD_CONFIG = [
  { key: 'department_name', label: 'Department Name', placeholder: 'e.g. Computer Science', icon: FaBuilding },
  { key: 'abbreviation', label: 'Abbreviation', placeholder: 'e.g. CSC', icon: FaTag },
  { key: 'motto', label: 'Motto', placeholder: 'e.g. Excellence in Innovation', icon: FaQuoteLeft },
  { key: 'faculty', label: 'Faculty', placeholder: 'e.g. Faculty of Engineering', icon: FaBook },
  { key: 'description', label: 'Description', placeholder: 'Brief description of the department', icon: FaAlignLeft },
];

const PAGE_SIZE = 7;

const Department = () => {
  const { loading, startLoading, stopLoading } = useLoading();
  const { user } = useAuth();
  const [program, setProgram] = useState(String(user?.program || 'HND').toUpperCase());
  const [departments, setDepartments] = useState([]);
  const [form, setForm] = useState({
    program: String(user?.program || 'HND').toUpperCase(),
    department_name: '',
    abbreviation: '',
    motto: '',
    faculty: '',
    description: '',
  });
  const [activeId, setActiveId] = useState(null);
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);

  const fetchDepartments = useCallback(async () => {
    try {
      startLoading();
      const res = await api.get(`/admin/departments?program=${encodeURIComponent(program)}`);
      setDepartments(res.data);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to fetch departments. Check connection and try again.'), 'error');
    } finally {
      stopLoading();
    }
  }, [program, startLoading, stopLoading]);

  useEffect(() => {
    fetchDepartments();
  }, [fetchDepartments]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const clearForm = () => {
    setActiveId(null);
    setForm({ program, department_name: '', abbreviation: '', motto: '', faculty: '', description: '' });
  };

  const selectForEdit = (dept) => {
    const id = dept?.dpt_id || dept?._id;
    setActiveId(String(id));
    setForm({
      program: String(dept.program || 'HND').toUpperCase(),
      department_name: dept.department_name || '',
      abbreviation: dept.abbreviation || '',
      motto: dept.motto || '',
      faculty: dept.faculty || '',
      description: dept.description || '',
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { program: selectedProgram, department_name, abbreviation, motto, faculty, description } = form;
    if (!selectedProgram || !department_name?.trim() || !abbreviation?.trim() || !motto?.trim() || !faculty?.trim() || !description?.trim()) {
      showToast('Please fill all fields.', 'error');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        program: String(selectedProgram || 'HND').toUpperCase(),
        department_name: department_name.trim(),
        abbreviation: abbreviation.trim().toUpperCase(),
        motto: motto.trim(),
        faculty: faculty.trim(),
        description: description.trim(),
      };

      const res = activeId
        ? await api.put(`/admin/departments/${activeId}`, payload)
        : await api.post('/admin/departments', payload);

      showToast(res.data.message || (activeId ? 'Department updated.' : 'Department added.'), 'success');
      await fetchDepartments();
      clearForm();
    } catch (err) {
      showToast(getErrorMessage(err, activeId ? 'Failed to update department.' : 'Failed to add department.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (dept) => {
    const id = dept?.dpt_id || dept?._id;
    if (!id) return;
    const ok = window.confirm(`Delete department "${dept.department_name}"? This cannot be undone.`);
    if (!ok) return;

    try {
      startLoading();
      const res = await api.delete(`/admin/departments/${id}`);
      showToast(res.data?.message || 'Department deleted.', 'success');
      if (String(activeId) === String(id)) clearForm();
      await fetchDepartments();
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to delete department.'), 'error');
    } finally {
      stopLoading();
    }
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return departments;
    return departments.filter((d) => {
      const hay = [d.department_name, d.abbreviation, d.faculty, d.description, d.motto]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [departments, search]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
    [filtered.length]
  );

  const pagedDepartments = useMemo(() => {
    const start = pageIndex * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, pageIndex]);

  useEffect(() => {
    setPageIndex(0);
  }, [search, program]);

  useEffect(() => {
    setPageIndex((prev) => Math.min(prev, totalPages - 1));
  }, [totalPages]);

  return (
    <div className={styles.container}>
      {loading && <GraduationCapLoader fullscreen label="Loading departments…" />}
      <Helmet>
        <title>Manage Departments | Acadex Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      <header className={styles.header}>
        <FaGraduationCap className={styles.headerIcon} />
        <h1 className={styles.title}>Manage Departments</h1>
        <p className={styles.subtitle}>Add and view academic departments</p>
      </header>

      <div className={styles.grid}>
        <section className={styles.formSection}>
          <div className={styles.formHeader}>
            <h2 className={styles.sectionTitle}>{activeId ? 'Update Department' : 'Add Department'}</h2>
            {activeId && (
              <button type="button" className={styles.clearBtn} onClick={clearForm} title="Cancel editing">
                <FaTimes />
                <span>Cancel</span>
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit} className={styles.form}>
          <div className={styles.field}>
            <label htmlFor="program" className={styles.label}>
              Program
            </label>
            <select
              id="program"
              name="program"
              value={form.program}
              onChange={(e) => {
                const nextProgram = e.target.value;
                setProgram(nextProgram);
                setForm((prev) => ({ ...prev, program: nextProgram }));
              }}
              className={styles.input}
              required
            >
              <option value="HND">HND</option>
              <option value="BTS">BTS</option>
            </select>
          </div>

          {FIELD_CONFIG.map(({ key, label, placeholder, icon: Icon }) => (
            <div key={key} className={styles.field}>
              <label htmlFor={key} className={styles.label}>
                <Icon className={styles.fieldIcon} />
                {label}
              </label>
              {key === 'description' ? (
                <textarea
                  id={key}
                  name={key}
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={handleChange}
                  rows={3}
                  className={styles.input}
                  required
                />
              ) : (
                <input
                  id={key}
                  name={key}
                  type="text"
                  placeholder={placeholder}
                  value={form[key]}
                  onChange={handleChange}
                  className={styles.input}
                  autoComplete="off"
                  required
                />
              )}
            </div>
          ))}
          <button
            type="submit"
            className={styles.submitBtn}
            disabled={submitting}
          >
            {submitting ? (activeId ? 'Updating…' : 'Adding…') : (activeId ? 'Update Department' : 'Add Department')}
          </button>
          </form>
        </section>

        <section className={`${styles.departmentsList} ${styles.stickyPanel}`}>
          <h2 className={styles.sectionTitle}>Existing Departments</h2>

          <div className={styles.searchRow}>
            <div className={styles.searchBox}>
              <FaSearch className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, abbreviation, faculty, motto, description"
                aria-label="Search departments"
              />
            </div>
          </div>

          <div className={styles.listTools}>
            <span className={styles.resultsCount}>{filtered.length} total</span>
            {filtered.length > PAGE_SIZE && (
              <label className={styles.pageSelectWrap}>
                <span>View more</span>
                <select
                  className={styles.pageSelect}
                  value={pageIndex}
                  onChange={(e) => setPageIndex(Number(e.target.value))}
                >
                  {Array.from({ length: totalPages }, (_, idx) => {
                    const start = idx * PAGE_SIZE + 1;
                    const end = Math.min((idx + 1) * PAGE_SIZE, filtered.length);
                    return (
                      <option key={`dept-page-${idx}`} value={idx}>
                        {start}-{end}
                      </option>
                    );
                  })}
                </select>
              </label>
            )}
          </div>

          {filtered.length === 0 ? (
            <p className={styles.emptyState}>{departments.length === 0 ? 'No departments yet. Add one on the left.' : 'No matches found.'}</p>
          ) : (
            <ul className={`${styles.list} ${styles.scrollList}`}>
              {pagedDepartments.map((d) => {
                const id = d.dpt_id || d._id;
                const selected = activeId && String(activeId) === String(id);
                return (
                  <li
                    key={id}
                    className={`${styles.card} ${selected ? styles.cardSelected : ''}`}
                    onClick={() => selectForEdit(d)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectForEdit(d); } }}
                    title="Click to edit"
                  >
                    <div className={styles.cardHeader}>
                      <span className={styles.cardAbbr}>{d.abbreviation}</span>
                      <h3 className={styles.cardTitle}>{d.department_name}</h3>
                      <span className={styles.cardAbbr} style={{ marginLeft: 8 }}>{String(d.program || 'HND').toUpperCase()}</span>
                      <div className={styles.cardActions}>
                        <button
                          type="button"
                          className={styles.deleteBtn}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(d);
                          }}
                          title="Delete department"
                          aria-label="Delete department"
                        >
                          <FaTrash />
                        </button>
                      </div>
                    </div>
                    {d.motto && <p className={styles.cardMotto}>"{d.motto}"</p>}
                    {d.faculty && <p className={styles.cardFaculty}>{d.faculty}</p>}
                    {d.description && <p className={styles.cardDesc}>{d.description}</p>}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default Department;
