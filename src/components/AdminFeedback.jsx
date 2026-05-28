import React, { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import { maskCandidateId } from '../utility/maskCandidateId';
import styles from '../Astyles/feedback.module.css';
import { FaCheckCircle, FaBell, FaUsers } from 'react-icons/fa';

const formatDate = (value) => {
  try {
    return new Date(value).toLocaleString();
  } catch (_) {
    return String(value || '');
  }
};

const AdminFeedback = () => {
  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadComplaints = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.get('/admin/complaints');
      setComplaints(Array.isArray(res.data?.complaints) ? res.data.complaints : []);
      if (res.data?.complaints?.length) {
        setSelected(res.data.complaints[0]);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'Unable to load complaints.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComplaints();
  }, []);

  const filteredComplaints = useMemo(() => {
    if (filter === 'all') return complaints;
    return complaints.filter((item) => String(item.status || 'pending') === filter);
  }, [complaints, filter]);

  const counts = useMemo(() => ({
    all: complaints.length,
    pending: complaints.filter((item) => item.status === 'pending').length,
    reviewed: complaints.filter((item) => item.status === 'reviewed').length,
  }), [complaints]);

  const markReviewed = async (candId) => {
    try {
      setRefreshing(true);
      await api.put(`/admin/candidates/${candId}/complaints/reviewed`);
      showToast('Complaint marked reviewed', 'success');
      await loadComplaints();
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to update complaint'), 'error');
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.pageTitle}>Feedback & Complaints</div>
          <div className={styles.pageSubtitle}>Track candidate concerns and manage reviews in one place.</div>
        </div>
        <div className={styles.metricRow}>
          <div className={styles.metricCard}>
            <FaBell className={styles.metricIcon} />
            <div>
              <div className={styles.metricLabel}>Pending</div>
              <div className={styles.metricValue}>{counts.pending}</div>
            </div>
          </div>
          <div className={styles.metricCard}>
            <FaCheckCircle className={styles.metricIcon} />
            <div>
              <div className={styles.metricLabel}>Reviewed</div>
              <div className={styles.metricValue}>{counts.reviewed}</div>
            </div>
          </div>
          <div className={styles.metricCard}>
            <FaUsers className={styles.metricIcon} />
            <div>
              <div className={styles.metricLabel}>Total Complaints</div>
              <div className={styles.metricValue}>{counts.all}</div>
            </div>
          </div>
        </div>
      </div>

      {error ? <div className={styles.error}>{error}</div> : null}

      <div className={styles.grid}>
        <div className={styles.leftPanel}>
          <div className={styles.sectionTitle}>Complaint stream</div>
          <div className={styles.filters}>
            {['all', 'pending', 'reviewed'].map((item) => (
              <button
                key={item}
                type="button"
                className={`${styles.filterBtn} ${filter === item ? styles.filterActive : ''}`}
                onClick={() => setFilter(item)}
              >
                {item === 'all' ? 'All' : item.charAt(0).toUpperCase() + item.slice(1)}
              </button>
            ))}
          </div>
          <div className={styles.list}>
            {loading ? <div className={styles.loading}>Loading complaints…</div> : null}
            {!loading && filteredComplaints.length === 0 ? (
              <div className={styles.emptyState}>No complaints found.</div>
            ) : null}
            {filteredComplaints.map((complaint) => (
              <button
                key={`${complaint.cand_id}-${complaint.createdAt}-${complaint.text}`}
                type="button"
                className={`${styles.complaintItem} ${selected?.cand_id === complaint.cand_id && selected?.createdAt === complaint.createdAt ? styles.complaintSelected : ''}`}
                onClick={() => setSelected(complaint)}
              >
                <div className={styles.complaintHeader}>
                  <strong>{complaint.name || maskCandidateId(complaint.cand_id)}</strong>
                  <span className={styles.statusTag}>{complaint.status || 'pending'}</span>
                </div>
                <div className={styles.complaintMeta}>{complaint.email}</div>
                <div className={styles.complaintText}>{String(complaint.text).slice(0, 80)}{String(complaint.text).length > 80 ? '…' : ''}</div>
              </button>
            ))}
          </div>
        </div>

        <div className={styles.rightPanel}>
          <div className={styles.sectionTitle}>Selected complaint</div>
          {selected ? (
            <div className={styles.detailCard}>
              <div className={styles.detailHeader}>
                <div>
                  <div className={styles.detailName}>{selected.name || maskCandidateId(selected.cand_id)}</div>
                  <div className={styles.detailEmail}>{selected.email}</div>
                </div>
                <span className={styles.statusTag}>{selected.status || 'pending'}</span>
              </div>
              <div className={styles.detailBody}>
                <p>{selected.text}</p>
              </div>
              <div className={styles.detailFooter}>
                <div>{formatDate(selected.createdAt)}</div>
                <button
                  type="button"
                  className={styles.actionBtn}
                  disabled={selected.status === 'reviewed' || refreshing}
                  onClick={() => markReviewed(selected.cand_id)}
                >
                  Mark as reviewed
                </button>
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}>Select a complaint to view details.</div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminFeedback;
