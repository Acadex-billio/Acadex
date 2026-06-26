import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/DeveloperProjectSubmissions.module.css';

const actions = [
  { value: 'approve', label: 'Approve' },
  { value: 'publish', label: 'Publish' },
  { value: 'reject', label: 'Reject' },
  { value: 'grant-permission', label: 'Grant Permission' },
];

const formatMoney = (value) => Number(value || 0).toFixed(2);

const DeveloperProjectSubmissions = () => {
  const [items, setItems] = useState([]);
  const [pricing, setPricing] = useState([]);
  const [loading, setLoading] = useState(true);
  const [noteById, setNoteById] = useState({});
  const [actionById, setActionById] = useState({});
  const [priceDraftByProgram, setPriceDraftByProgram] = useState({});

  const load = async () => {
    try {
      setLoading(true);
      const res = await api.get('/admin/project-submissions');
      if (!res.data?.success) throw new Error(res.data?.message || 'Failed to load submissions');
      setItems(res.data.submissions || []);

      const pricingRes = await api.get('/admin/project-submissions/pricing');
      if (pricingRes.data?.success) {
        const list = pricingRes.data.pricing || [];
        setPricing(list);
        setPriceDraftByProgram(
          list.reduce((acc, item) => {
            acc[item.target_program] = formatMoney(item.upload_fee);
            return acc;
          }, {})
        );
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to load candidate project submissions.'), 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const updateSubmission = async (id) => {
    const action = actionById[id] || 'approve';
    const note = noteById[id] || '';
    try {
      const res = await api.put(`/admin/project-submissions/${id}`, { action, note });
      if (!res.data?.success) throw new Error(res.data?.message || 'Update failed');
      showToast(`Submission ${action}d successfully.`, 'success');
      await load();
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to update this submission.'), 'error');
    }
  };

  const updatePrice = async (targetProgram, feeValue) => {
    try {
      const numericFee = Number(feeValue);
      const res = await api.put('/admin/project-submissions/pricing', {
        target_program: targetProgram,
        upload_fee: numericFee,
      });
      if (!res.data?.success) throw new Error(res.data?.message || 'Pricing update failed');
      showToast(`Pricing updated for ${targetProgram}.`, 'success');
      await load();
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to update upload pricing.'), 'error');
    }
  };

  if (loading) return <div style={{ padding: 24 }}>Loading submissions…</div>;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <h2 className={styles.heroTitle}>Candidate Project Review Queue</h2>
        <p className={styles.heroText}>Review candidate and lecturer uploads, keep them private during moderation, and publish only approved items.</p>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Upload Pricing</h3>
        <div className={styles.pricingGrid}>
          {pricing.map((entry) => (
            <article key={entry.target_program} className={styles.priceCard}>
              <span className={styles.priceLabel}>{entry.target_program}</span>
              <div className={styles.priceInputRow}>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={priceDraftByProgram[entry.target_program] ?? formatMoney(entry.upload_fee)}
                  onChange={(e) => setPriceDraftByProgram((prev) => ({ ...prev, [entry.target_program]: e.target.value }))}
                  onBlur={(e) => updatePrice(entry.target_program, e.target.value)}
                  className={styles.priceInput}
                />
                <span>FCFA</span>
              </div>
              <div className={styles.meta}>Current: {formatMoney(entry.upload_fee)}</div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>Private Review Queue</h3>
        {items.length === 0 ? <p className={styles.emptyState}>No pending private submissions found.</p> : null}
        <div className={styles.queue}>
        {items.map((item) => (
          <article key={item._id} className={styles.card}>
            <div className={styles.cardTop}>
              <div>
                <h4 className={styles.cardTitle}>{item.title}</h4>
                <div className={styles.meta}>
                  {item.submission_type} by {item.uploader_name || item.uploader_cand_id}
                </div>
                <div className={styles.badges}>
                  <span className={`${styles.badge} ${styles.status}`}>{item.status}</span>
                  <span className={styles.badge}>Uploader: {item.uploader_program}</span>
                  <span className={styles.badge}>Target: {item.target_program}</span>
                  <span className={styles.badge}>Fee: {formatMoney(item.upload_fee)} FCFA</span>
                </div>
              </div>
              <a href={item.file_path} target="_blank" rel="noreferrer" className={styles.linkBtn}>Open File</a>
            </div>

            <div className={styles.controls}>
              <select
                value={actionById[item._id] || 'approve'}
                onChange={(e) => setActionById((prev) => ({ ...prev, [item._id]: e.target.value }))}
                className={styles.actionSelect}
              >
                {actions.map((entry) => (
                  <option key={entry.value} value={entry.value}>{entry.label}</option>
                ))}
              </select>
              <input
                type="text"
                value={noteById[item._id] || ''}
                onChange={(e) => setNoteById((prev) => ({ ...prev, [item._id]: e.target.value }))}
                placeholder="Optional review note"
                className={styles.noteInput}
              />
              <button
                type="button"
                onClick={() => updateSubmission(item._id)}
                className={styles.applyBtn}
              >
                Apply
              </button>
            </div>
          </article>
        ))}
        </div>
      </section>
    </div>
  );
};

export default DeveloperProjectSubmissions;
