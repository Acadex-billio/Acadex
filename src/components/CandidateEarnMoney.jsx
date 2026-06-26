import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';

const formatMoney = (value) => Number(value || 0).toFixed(2);

const CandidateEarnMoney = () => {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [permissionMessage, setPermissionMessage] = useState('');
  const [form, setForm] = useState({ submission_type: 'report', title: '', description: '' });
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

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!file || !form.title) {
      showToast('Please select a file and provide a title.', 'warning');
      return;
    }

    try {
      setSubmitting(true);
      const fd = new FormData();
      fd.append('file', file);
      fd.append('submission_type', form.submission_type);
      fd.append('title', form.title);
      fd.append('description', form.description);
      const res = await api.post('/candidate/projects/submit', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!res.data?.success) throw new Error(res.data?.message || 'Submission failed');
      showToast('Your project has been submitted for developer review.', 'success');
      setFile(null);
      setForm({ submission_type: 'report', title: '', description: '' });
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

  if (loading) return <div style={{ padding: 24 }}>Loading earn money workspace…</div>;

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <h2>Earn Money with Your Project Work</h2>
      <p style={{ lineHeight: 1.7, color: '#475569' }}>
        Eligible candidates can submit one approved project report or presentation for review. The upload fee is set by the developer and is displayed below. After a submission is published, additional uploads require explicit developer permission.
      </p>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: 20, margin: '20px 0' }}>
        <strong>Upload fee:</strong> {formatMoney(overview?.uploadFee)} FCFA
        <div style={{ marginTop: 8, color: '#334155' }}>
          {overview?.targetProgramLabel ? `Target program: ${overview.targetProgramLabel}` : 'Target program: Bachelor'}
        </div>
      </div>

      <div style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
        <button type="button" onClick={() => setForm((prev) => ({ ...prev, submission_type: 'report' }))} style={{ padding: 14, borderRadius: 12, border: form.submission_type === 'report' ? '2px solid #2563eb' : '1px solid #cbd5e1', background: form.submission_type === 'report' ? '#eff6ff' : '#fff' }}>
          Upload a report (Word only)
        </button>
        <button type="button" onClick={() => setForm((prev) => ({ ...prev, submission_type: 'presentation' }))} style={{ padding: 14, borderRadius: 12, border: form.submission_type === 'presentation' ? '2px solid #2563eb' : '1px solid #cbd5e1', background: form.submission_type === 'presentation' ? '#eff6ff' : '#fff' }}>
          Upload a presentation (PowerPoint only)
        </button>
      </div>

      {!canUpload ? (
        <div style={{ background: '#fff7ed', border: '1px solid #fdba74', borderRadius: 14, padding: 16, marginBottom: 20 }}>
          <strong>You are currently not entitled to submit another project.</strong>
          <p style={{ marginTop: 8, color: '#9a2c00' }}>{overview?.infoMessage}</p>
          <textarea
            value={permissionMessage}
            onChange={(e) => setPermissionMessage(e.target.value)}
            placeholder="Write a short request for developer permission to upload another material."
            style={{ width: '100%', minHeight: 100, marginTop: 10, padding: 10, borderRadius: 10, border: '1px solid #fdba74' }}
          />
          <button type="button" onClick={handlePermissionRequest} style={{ marginTop: 10, padding: '10px 14px', borderRadius: 10, background: '#ea580c', color: 'white', border: 'none' }}>
            Send permission request
          </button>
        </div>
      ) : null}

      <form onSubmit={handleSubmit} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 18, padding: 20 }}>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <span style={{ display: 'block', marginBottom: 6 }}>Title</span>
          <input type="text" value={form.title} onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }} required />
        </label>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <span style={{ display: 'block', marginBottom: 6 }}>Description</span>
          <textarea value={form.description} onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))} style={{ width: '100%', minHeight: 92, padding: 10, borderRadius: 10, border: '1px solid #cbd5e1' }} />
        </label>
        <label style={{ display: 'block', marginBottom: 10 }}>
          <span style={{ display: 'block', marginBottom: 6 }}>Upload file</span>
          <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} required />
        </label>
        <button type="submit" disabled={submitting || !canUpload} style={{ padding: '12px 16px', borderRadius: 10, border: 'none', background: '#2563eb', color: 'white', cursor: submitting || !canUpload ? 'not-allowed' : 'pointer' }}>
          {submitting ? 'Submitting…' : `Submit ${form.submission_type === 'report' ? 'report' : 'presentation'}`}
        </button>
      </form>

      <div style={{ marginTop: 20 }}>
        <h3>Your submissions</h3>
        {(overview?.submissions || []).length === 0 ? <p>No submissions yet.</p> : (
          <ul>
            {(overview?.submissions || []).map((item) => (
              <li key={item._id} style={{ marginBottom: 10 }}>
                <strong>{item.title}</strong> — {item.submission_type} • {item.status} • {formatMoney(item.upload_fee)} FCFA
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default CandidateEarnMoney;
