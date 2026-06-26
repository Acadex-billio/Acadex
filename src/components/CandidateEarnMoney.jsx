import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/CandidateEarnMoney.module.css';

const formatMoney = (value) => Number(value || 0).toFixed(2);

const getProgramLabel = (program) => {
  const value = String(program || '').trim().toUpperCase();
  const labels = {
    HND: 'HND',
    BTS: 'BTS',
    BACHELOR: 'Bachelor',
    MASTERS: 'Masters',
    LICENCE: 'Licence',
    MASTER: 'Master',
  };
  return labels[value] || null;
};

const getTargetFromUploaderProgram = (program) => {
  const value = String(program || '').trim().toUpperCase();
  if (value === 'BACHELOR' || value === 'BACHELORS') return 'HND';
  if (value === 'MASTERS') return 'BACHELOR';
  if (value === 'LICENCE') return 'BTS';
  if (value === 'MASTER') return 'LICENCE';
  return null;
};

const CandidateEarnMoney = () => {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState('');
  const [form, setForm] = useState({ submission_type: 'report', title: '', description: '', location: '', pages: '' });
  const [file, setFile] = useState(null);

  const loadOverview = async () => {
    try {
      setLoading(true);
      const res = await api.get('/candidate/projects/overview');
      if (!res.data?.success) throw new Error(res.data?.message || 'Unable to load submission overview');
      setOverview(res.data);
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to load the earn-money area.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOverview(); }, []);

  const canUpload = useMemo(() => Boolean(overview?.canUploadMore), [overview]);
  const targetProgramLabel = useMemo(() => {
    if (overview?.targetProgramLabel) return overview.targetProgramLabel;
    const fromTargetCode = getProgramLabel(overview?.targetProgram);
    if (fromTargetCode) return fromTargetCode;
    const derivedTarget = getTargetFromUploaderProgram(overview?.uploaderProgram);
    return getProgramLabel(derivedTarget);
  }, [overview]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file || !form.title || !form.location || !form.pages) {
      showToast('Please select a file, provide a title, location, and page count.', 'warning');
      return;
    }

    try {
      setSubmitting(true);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('submission_type', form.submission_type);
      fd.append('title', form.title);
      fd.append('description', form.description);
      fd.append('location', form.location);
      fd.append('pages', form.pages);
      const res = await api.post('/candidate/projects/submit', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!res.data?.success) throw new Error(res.data?.message || 'Submission failed');
      showToast('Your project has been submitted for developer review.', 'success');
      setFile(null);
      setForm({ submission_type: 'report', title: '', description: '', location: '', pages: '' });
      await loadOverview();
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to submit your project.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  const handlePermissionRequest = async () => {
    if (!permissionMessage.trim()) {
      showToast('Please explain why you need permission for another upload.', 'warning');
      return;
    }
    try {
      const res = await api.post('/candidate/projects/request-permission', { message: permissionMessage });
      if (!res.data?.success) throw new Error(res.data?.message || 'Permission request failed');
      showToast('Your permission request has been sent to the developer.', 'success');
      setPermissionMessage('');
      await loadOverview();
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to request permission.'), 'error');
    }
  };

  if (loading) return <div className={styles.page}>Loading earn money workspace...</div>;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h2 className={styles.heroTitle}>Earn Money with Your <strong>Project Work</strong></h2>
        <p className={styles.heroText}>
          Share your academic expertise and earn by helping others. Submit your project report and presentation for review. After both upload slots are used, request developer permission for additional uploads.
        </p>

        <div className={styles.statsCard}>
          <div className={styles.statBlock}>
            <span className={styles.statLabel}>Upload fee</span>
            <strong className={styles.statValue}>{formatMoney(overview?.uploadFee)} FCFA</strong>
          </div>
          <div className={styles.statBlock}>
            <span className={styles.statLabel}>Target program</span>
            <strong className={styles.statValue}>{targetProgramLabel || 'Not available'}</strong>
          </div>
        </div>
      </section>

      <div className={styles.switchRow}>
        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, submission_type: 'report' }))}
          className={`${styles.switchBtn} ${form.submission_type === 'report' ? styles.switchBtnActive : ''}`}
        >
          Upload a report (Word only)
        </button>
        <button
          type="button"
          onClick={() => setForm((prev) => ({ ...prev, submission_type: 'presentation' }))}
          className={`${styles.switchBtn} ${form.submission_type === 'presentation' ? styles.switchBtnActive : ''}`}
        >
          Upload a presentation (PowerPoint only)
        </button>
      </div>

      {!canUpload ? (
        <div className={styles.warningCard}>
          <h4 className={styles.warningTitle}>You are currently not entitled to submit another project.</h4>
          <p className={styles.warningText}>{overview?.infoMessage}</p>
          <textarea
            value={permissionMessage}
            onChange={(e) => setPermissionMessage(e.target.value)}
            placeholder="Write a short request for developer permission to upload another material."
            className={styles.permissionInput}
          />
          <button type="button" onClick={handlePermissionRequest} className={styles.permissionBtn}>
            Send permission request
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className={styles.formCard}>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Title</span>
          <input className={styles.fieldInput} type="text" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} required />
        </label>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Description</span>
          <textarea className={styles.fieldTextarea} value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} />
        </label>
        <div className={styles.switchRow} style={{ margin: '0 0 10px' }}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Location / Geo Focus</span>
            <input className={styles.fieldInput} type="text" value={form.location} onChange={(e) => setForm((prev) => ({ ...prev, location: e.target.value }))} required />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Number of pages</span>
            <input className={styles.fieldInput} type="number" min="1" value={form.pages} onChange={(e) => setForm((prev) => ({ ...prev, pages: e.target.value }))} required />
          </label>
        </div>
        <label className={styles.field}>
          <span className={styles.fieldLabel}>Upload file</span>
          <input className={styles.fileInput} type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
        </label>
        <button type="submit" disabled={submitting || !canUpload} className={styles.submitBtn}>
          {submitting ? 'Submitting...' : `Submit ${form.submission_type === 'report' ? 'report' : 'presentation'}`}
        </button>
      </form>

      <section className={styles.submissionsCard}>
        <h3 className={styles.submissionsTitle}>Your submissions</h3>
        {(overview?.submissions || []).length === 0 ? <p>No submissions yet.</p> : (
          <ul className={styles.submissionsList}>
            {(overview?.submissions || []).map((item) => (
              <li key={item._id} className={styles.submissionsItem}>
                <strong>{item.title}</strong> — {item.submission_type} • {item.status} • {formatMoney(item.upload_fee)} FCFA
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default CandidateEarnMoney;
