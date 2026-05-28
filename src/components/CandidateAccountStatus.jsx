import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { useNavigate } from 'react-router-dom';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/accountRestriction.module.css';

const CandidateAccountStatus = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);
  const [complaint, setComplaint] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get('/candidate/account/status');
        if (cancelled) return;
        setStatus(data);
        const s = String(data?.account_status || 'active');
        if (s === 'active') {
          navigate('/candidate', { replace: true });
          return;
        }
      } catch (err) {
        if (!cancelled) showToast(getErrorMessage(err, 'Failed to load account status'), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const onSubmit = async () => {
    const text = String(complaint || '').trim();
    if (!text) return;
    setSubmitting(true);
    try {
      await api.post('/candidate/account/complaint', { text });
      setComplaint('');
      showToast('Complaint submitted', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to submit complaint'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return null;

  const accountStatus = String(status?.account_status || 'active');
  const suspension = status?.suspension || null;
  const block = status?.block || null;

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <div className={styles.title}>Account Access Restricted</div>
          <div className={styles.subtitle}>Your account is currently {accountStatus}. You can submit a complaint or appeal below.</div>
        </div>
        <button type="button" className={styles.backButton} onClick={() => navigate('/')}>
          ← Back to Home
        </button>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardTitle}>Status</div>

          <div className={styles.row}>
            <div>
              <div className={styles.rowTitle}>{accountStatus === 'blocked' ? 'Blocked account' : 'Suspended account'}</div>
              <div className={styles.rowSubtitle}>You cannot access other pages until this is resolved.</div>
            </div>
          </div>

          {accountStatus === 'suspended' && (
            <div style={{ marginTop: 12 }}>
              <div className={styles.rowTitle}>Reason</div>
              <div className={styles.rowSubtitle}>{suspension?.reason || '-'}</div>
              <div style={{ height: 10 }} />
              <div className={styles.rowTitle}>Duration</div>
              <div className={styles.rowSubtitle}>
                {suspension?.start_at ? new Date(suspension.start_at).toLocaleString() : '-'}
                {'  '}to{'  '}
                {suspension?.end_at ? new Date(suspension.end_at).toLocaleString() : '-'}
              </div>
            </div>
          )}

          {accountStatus === 'blocked' && (
            <div style={{ marginTop: 12 }}>
              <div className={styles.rowTitle}>Reason</div>
              <div className={styles.rowSubtitle}>{block?.reason || '-'}</div>
              <div style={{ height: 10 }} />
              <div className={styles.rowSubtitle}>This account will not automatically reactivate.</div>
            </div>
          )}

          <div style={{ marginTop: 14 }}>
            <div className={styles.rowTitle}>Support Contacts</div>
            <div className={styles.rowSubtitle}>Email: brightstackinnovations@gmail.com</div>
            <div className={styles.rowSubtitle}>WhatsApp: +237 678 507 737</div>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardTitle}>Submit Complaint Or Appeal</div>
          <div className={styles.rowSubtitle}>Describe why your account should be restored and include any useful details.</div>
          <div style={{ height: 10 }} />
          <textarea
            value={complaint}
            onChange={(e) => setComplaint(e.target.value)}
            placeholder="Type your complaint or appeal message..."
            className={styles.textarea}
          />
          <div style={{ height: 10 }} />
          <button type="button" className={styles.actionBtn} onClick={onSubmit} disabled={submitting || !complaint.trim()}>
            Submit
          </button>

          <div className={styles.complaintHistoryWrap}>
            <div className={styles.rowTitle}>Previous complaints</div>
            {Array.isArray(status?.complaints) && status.complaints.length > 0 ? (
              <div className={styles.complaintList}>
                {status.complaints
                  .slice()
                  .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                  .map((item, idx) => (
                    <article key={`${item.createdAt || idx}-${idx}`} className={styles.complaintItem}>
                      <div className={styles.complaintMeta}>
                        <span>{new Date(item.createdAt).toLocaleString()}</span>
                        <span className={styles.statusPill}>{item.status || 'pending'}</span>
                      </div>
                      <p>{item.text}</p>
                    </article>
                  ))}
              </div>
            ) : (
              <div className={styles.rowSubtitle}>No complaint submitted yet.</div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default CandidateAccountStatus;
