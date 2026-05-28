import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/adminAnnouncements.module.css';
import { showToast } from '../utility/ToastNotification';

const AdminAnnouncements = () => {
  const [departments, setDepartments] = useState([]);
  const [loadingDeps, setLoadingDeps] = useState(true);

  const [form, setForm] = useState({
    title: '',
    source: '',
    program: 'HND',
    audience_type: 'general',
    faculty: '',
    department_ids: [],
    body: '',
    duration_days: 7,
    file: null,
  });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState([]);
  const [loadingSent, setLoadingSent] = useState(true);

  const faculties = useMemo(() => {
    const set = new Set(
      (departments || [])
        .map((d) => String(d.faculty || '').trim())
        .filter(Boolean)
    );
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [departments]);

  const loadDepartments = async () => {
    setLoadingDeps(true);
    try {
      const { data } = await api.get('/admin/departments');
      setDepartments(Array.isArray(data) ? data : []);
    } catch (_) {
      setDepartments([]);
    } finally {
      setLoadingDeps(false);
    }
  };

  const loadSent = async () => {
    setLoadingSent(true);
    try {
      const { data } = await api.get('/announcements/admin/list?limit=20&include_expired=true');
      setSent(Array.isArray(data?.announcements) ? data.announcements : []);
    } catch (_) {
      setSent([]);
    } finally {
      setLoadingSent(false);
    }
  };

  useEffect(() => {
    loadDepartments();
    loadSent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onChange = (e) => {
    const { name, value } = e.target;
    setForm((p) => ({ ...p, [name]: value }));
  };

  const onAudienceChange = (e) => {
    const audience_type = e.target.value;
    setForm((p) => ({
      ...p,
      audience_type,
      faculty: audience_type === 'faculty' ? p.faculty : '',
      department_ids: audience_type === 'departments' ? p.department_ids : [],
    }));
  };

  const onDeptToggle = (id) => {
    setForm((p) => {
      const exists = p.department_ids.includes(id);
      return { ...p, department_ids: exists ? p.department_ids.filter((x) => x !== id) : [...p.department_ids, id] };
    });
  };

  const onFile = (e) => {
    const file = e.target.files?.[0] || null;
    setForm((p) => ({ ...p, file }));
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!String(form.title || '').trim() || !String(form.source || '').trim() || !String(form.body || '').trim()) {
      setError('Title, source, and body are required.');
      return;
    }

    if (form.audience_type === 'departments' && form.department_ids.length === 0) {
      setError('Select at least one department.');
      return;
    }

    if (form.audience_type === 'faculty' && !String(form.faculty || '').trim()) {
      setError('Select a faculty.');
      return;
    }

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append('title', form.title);
      fd.append('source', form.source);
      fd.append('body', form.body);
      fd.append('program', String(form.program || 'HND').toUpperCase());
      fd.append('audience_type', form.audience_type);
      fd.append('duration_days', String(form.duration_days || 7));
      if (form.audience_type === 'departments') {
        fd.append('department_ids', JSON.stringify(form.department_ids));
      }
      if (form.audience_type === 'faculty') {
        fd.append('faculty', form.faculty);
      }
      if (form.file) fd.append('file', form.file);

      await api.post('/announcements', fd);

      setForm((p) => ({
        ...p,
        title: '',
        source: '',
        program: 'HND',
        body: '',
        duration_days: 7,
        file: null,
        faculty: '',
        department_ids: [],
        audience_type: 'general',
      }));

      await loadSent();
      showToast('Announcement published', 'success');
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to publish announcement'));
    } finally {
      setSubmitting(false);
    }
  };

  const onDeleteAnnouncement = async (announcementId) => {
    if (!announcementId) return;
    const ok = window.confirm('Delete this announcement? This action cannot be undone.');
    if (!ok) return;

    try {
      await api.delete(`/announcements/${encodeURIComponent(announcementId)}`);
      setSent((prev) => prev.filter((a) => String(a.announcement_id) !== String(announcementId)));
      showToast('Announcement deleted', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to delete announcement'), 'error');
    }
  };

  const onRepublishAnnouncement = async (announcementId) => {
    if (!announcementId) return;
    try {
      await api.post(`/announcements/${encodeURIComponent(announcementId)}/republish`, { duration_days: 7 });
      showToast('Announcement republished', 'success');
      await loadSent();
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to republish announcement'), 'error');
    }
  };

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Send Announcement</h2>

      <form className={styles.form} onSubmit={onSubmit}>
        {error ? <div className={styles.error}>{error}</div> : null}

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Announcement Title</label>
            <input className={styles.input} name="title" value={form.title} onChange={onChange} required />
          </div>
          <div className={styles.field}>
            <label className={styles.label}>Source</label>
            <input className={styles.input} name="source" value={form.source} onChange={onChange} required />
          </div>
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Audience</label>
            <select className={styles.input} value={form.audience_type} onChange={onAudienceChange}>
              <option value="general">General (All Departments)</option>
              <option value="departments">Selected Department(s)</option>
              <option value="faculty">Faculty</option>
            </select>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Duration (days)</label>
            <input
              className={styles.input}
              type="number"
              min={1}
              max={365}
              name="duration_days"
              value={form.duration_days}
              onChange={onChange}
              required
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Program</label>
            <select className={styles.input} name="program" value={form.program} onChange={onChange}>
              <option value="HND">HND</option>
              <option value="BTS">BTS</option>
            </select>
          </div>
        </div>

        {form.audience_type === 'faculty' ? (
          <div className={styles.field}>
            <label className={styles.label}>Faculty</label>
            <select className={styles.input} name="faculty" value={form.faculty} onChange={onChange} disabled={loadingDeps} required={form.audience_type === 'faculty'}>
              <option value="">Select faculty</option>
              {faculties.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {form.audience_type === 'departments' ? (
          <div className={styles.field}>
            <label className={styles.label}>Departments</label>
            <div className={styles.deptGrid}>
              {departments.map((d) => {
                const id = String(d.dpt_id || d._id);
                const checked = form.department_ids.includes(id);
                return (
                  <label key={id} className={styles.deptChip}>
                    <input type="checkbox" checked={checked} onChange={() => onDeptToggle(id)} />
                    <span>{d.department_name}</span>
                  </label>
                );
              })}
              {!loadingDeps && departments.length === 0 ? <div className={styles.help}>No departments found.</div> : null}
            </div>
          </div>
        ) : null}

        <div className={styles.field}>
          <label className={styles.label}>Announcement Body</label>
          <textarea className={styles.textarea} name="body" value={form.body} onChange={onChange} rows={6} required />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label className={styles.label}>Attachment (optional)</label>
            <input className={styles.input} type="file" onChange={onFile} />
          </div>

          <div className={styles.field}>
            <button className={styles.publishBtn} type="submit" disabled={submitting}>
              {submitting ? 'Publishing...' : 'Publish'}
            </button>
          </div>
        </div>
      </form>

      <div className={styles.sentHeader}>
        <h3 className={styles.sentTitle}>Recent Announcements</h3>
        <button type="button" className={styles.refreshBtn} onClick={loadSent} disabled={loadingSent}>
          Refresh
        </button>
      </div>

      {loadingSent ? <div className={styles.help}>Loading...</div> : null}

      <div className={styles.sentList}>
        {sent.map((a) => (
          <div key={a.announcement_id} className={styles.sentCard}>
            <div className={styles.sentName}>{a.title}</div>
            <div className={styles.sentMeta}>
              <span>Program: {String(a.program || 'HND').toUpperCase()}</span>
              <span>Audience: {a.audience_type}</span>
              <span>Expires: {new Date(a.expires_at).toLocaleString()}</span>
              <span>Reactions: {a.reactions_count}</span>
            </div>
            <div className={styles.sentActions}>
              <button
                type="button"
                className={styles.republishBtn}
                onClick={() => onRepublishAnnouncement(a.announcement_id)}
              >
                Republish
              </button>
              <button
                type="button"
                className={styles.deleteBtn}
                onClick={() => onDeleteAnnouncement(a.announcement_id)}
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {!loadingSent && sent.length === 0 ? <div className={styles.help}>No announcements yet.</div> : null}
      </div>
    </div>
  );
};

export default AdminAnnouncements;
