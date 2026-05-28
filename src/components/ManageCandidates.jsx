import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import GraduationCapLoader from './GraduationCapLoader';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/Settings.module.css';
import { maskCandidateId } from '../utility/maskCandidateId';

const ManageCandidates = () => {
  const { user } = useAuth();
  const isDeveloper = String(user?.role || '').toLowerCase() === 'developer';
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [candidates, setCandidates] = useState([]);
  const [page, setPage] = useState(1);
  const [limit] = useState(25);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);

  const [suspendStart, setSuspendStart] = useState('');
  const [suspendEnd, setSuspendEnd] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [previewImageUrl, setPreviewImageUrl] = useState(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const backendOrigin = api.defaults.baseURL?.replace(/\/api$/, '')?.replace(/\/$/, '') || '';
  const buildImageUrl = (url) => {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    if (url.startsWith('/')) return `${backendOrigin}${url}`;
    return `${backendOrigin}/${url}`;
  };
  const loadCandidates = useCallback(async ({ q = '', targetPage = 1 } = {}) => {
    try {
      setLoading(true);
      const path = isDeveloper
        ? `/admin/users?q=${encodeURIComponent(q)}&page=${targetPage}&limit=${limit}`
        : `/admin/candidates?q=${encodeURIComponent(q)}&page=${targetPage}&limit=${limit}`;
      const { data } = await api.get(path);
      const raw = isDeveloper ? (Array.isArray(data?.users) ? data.users : []) : (Array.isArray(data?.candidates) ? data.candidates : []);
      const pagination = data?.pagination || null;

      setPage(Number(pagination?.page) > 0 ? Number(pagination.page) : targetPage);
      setTotal(Number(pagination?.total) >= 0 ? Number(pagination.total) : raw.length);
      setTotalPages(Number(pagination?.totalPages) > 0 ? Number(pagination.totalPages) : 1);

      setCandidates(
        raw.map((u) => ({
          cand_id: u.cand_id,
          name: u.name,
          email: u.email,
          role: u.role || (u.is_admin ? 'admin' : 'candidate'),
          department_abbreviation: u.department_abbreviation || u.department?.abbreviation || '',
          account_status: u.account_status || 'active',
        }))
      );
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load candidates'), 'error');
    } finally {
      setLoading(false);
    }
  }, [isDeveloper, limit]);

  const updateUserRole = async (candId, newRole) => {
    if (!candId) return;
    setSaving(true);
    try {
      await api.put(`/admin/users/${encodeURIComponent(candId)}/role`, { role: newRole });
      showToast(`User role updated to ${newRole}`, 'success');
      await onOpenCandidate(candId);
      await loadCandidates({ q: query.trim(), targetPage: page });
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update user role'), 'error');
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    loadCandidates({ q: debouncedQuery, targetPage: page });
  }, [page, debouncedQuery, loadCandidates]);

  const onOpenCandidate = async (candId) => {
    try {
      setSelected(candId);
      setDetails(null);
      const { data } = await api.get(`/admin/candidates/${encodeURIComponent(candId)}`);
      const candidateData = data?.candidate || null;
      setDetails(candidateData);
      setSuspendStart('');
      setSuspendEnd('');
      setActionReason('');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load candidate'), 'error');
      setSelected(null);
      setDetails(null);
    }
  };

  const closeModal = () => {
    setSelected(null);
    setDetails(null);
  };

  const statusLabel = useMemo(() => {
    const s = String(details?.account_status || 'active');
    if (s === 'blocked') return 'Blocked';
    if (s === 'suspended') return 'Suspended';
    return 'Active';
  }, [details]);

  const onSuspend = async () => {
    if (!details?.cand_id) return;
    if (!suspendStart || !suspendEnd || !actionReason.trim()) {
      showToast('Start date, end date, and reason are required', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/admin/candidates/${encodeURIComponent(details.cand_id)}/suspend`,
        { start_at: suspendStart, end_at: suspendEnd, reason: actionReason.trim() }
      );
      showToast('Candidate suspended', 'success');
      await onOpenCandidate(details.cand_id);
      await loadCandidates({ q: query.trim(), targetPage: page });
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to suspend candidate'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const onBlock = async () => {
    if (!details?.cand_id) return;
    if (!actionReason.trim()) {
      showToast('Reason is required', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.put(`/admin/candidates/${encodeURIComponent(details.cand_id)}/block`,
        { reason: actionReason.trim() }
      );
      showToast('Candidate blocked', 'success');
      await onOpenCandidate(details.cand_id);
      await loadCandidates({ q: query.trim(), targetPage: page });
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to block candidate'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const onReactivate = async () => {
    if (!details?.cand_id) return;
    setSaving(true);
    try {
      await api.put(`/admin/candidates/${encodeURIComponent(details.cand_id)}/reactivate`, {});
      showToast('Candidate reactivated', 'success');
      await onOpenCandidate(details.cand_id);
      await loadCandidates({ q: query.trim(), targetPage: page });
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to reactivate candidate'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <GraduationCapLoader fullscreen label="Loading candidates..." />;

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <div className={styles.title}>Manage Candidate</div>
          <div className={styles.subtitle}>{isDeveloper ? 'View and manage users and admin roles' : 'View and manage candidate accounts'}</div>
        </div>
      </div>

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardTitle}>{isDeveloper ? 'Users' : 'Candidates'}</div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name / ID / email"
            style={{ width: '100%', height: 44, borderRadius: 12, border: '1px solid var(--border)', padding: '0 12px' }}
          />
          <div style={{ height: 10 }} />
          <div className={styles.accordionBody}>
            {candidates.map((c) => (
              <button
                key={c.cand_id}
                type="button"
                className={styles.accordionBtn}
                onClick={() => onOpenCandidate(c.cand_id)}
                title="View details"
              >
                <span>
                  {c.name} {c.department_abbreviation ? `• ${c.department_abbreviation}` : ''}
                </span>
                <span className={styles.chip}>{String(c.account_status || 'active')}</span>
              </button>
            ))}
            {!candidates.length && <div className={styles.rowSubtitle}>No candidates found for this filter.</div>}
          </div>
          <div style={{ height: 10 }} />
          <div className={styles.row}>
            <button
              type="button"
              className={styles.actionBtn}
              disabled={loading || page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </button>
            <div className={styles.rowSubtitle}>Page {page} of {Math.max(1, totalPages)} ({total} total)</div>
            <button
              type="button"
              className={styles.actionBtn}
              disabled={loading || page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardTitle}>Instructions</div>
          <div className={styles.rowSubtitle}>
            Click a candidate to view full details, suspend for a duration, block permanently, or reactivate.
          </div>
        </section>
      </div>

      {selected && (
        <>
          <div className={styles.modalOverlay} onClick={closeModal} />
          <div className={`${styles.card} ${styles.modalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.cardTitle}>Candidate details</div>
            {!details && <div className={styles.rowSubtitle}>Loading…</div>}
            {details && (
              <>
                <div className={styles.row}>
                  <div>
                    <div className={styles.rowTitle}>{details.name}</div>
                    <div className={styles.rowSubtitle}>{maskCandidateId(details.cand_id)}</div>
                  </div>
                  <span className={styles.chip}>{statusLabel}</span>
                </div>

                <div style={{ height: 10 }} />

                {details.profile_picture && (
                  <div style={{ marginBottom: 10 }}>
                    <img
                      src={buildImageUrl(details.profile_picture, details.cand_id)}
                      alt="profile"
                      onClick={() => {
                        const url = buildImageUrl(details.profile_picture, details.cand_id);
                        setPreviewImageUrl(url);
                        setPreviewModalOpen(true);
                      }}
                      style={{ width: 80, height: 80, borderRadius: 16, objectFit: 'cover', border: '1px solid var(--border)', cursor: 'pointer' }}
                    />
                  </div>
                )}

                <div className={styles.rowSubtitle}>
                  Role: {details.role || 'candidate'}
                </div>
                {isDeveloper && details.role && details.role !== 'superadmin' ? (
                  <div className={styles.row} style={{ gap: 10, marginTop: 10 }}>
                    {details.role === 'admin' ? (
                      <button
                        type="button"
                        className={styles.dangerBtn}
                        onClick={() => updateUserRole(details.cand_id, 'candidate')}
                        disabled={saving}
                      >
                        Demote to Candidate
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.actionBtn}
                        onClick={() => updateUserRole(details.cand_id, 'admin')}
                        disabled={saving}
                      >
                        Promote to Admin
                      </button>
                    )}
                  </div>
                ) : null}

                <div className={styles.rowSubtitle}>
                  {details.department?.department_name ? `Department: ${details.department.department_name}` : ''}
                </div>
                <div className={styles.rowSubtitle}>{details.email ? `Email: ${details.email}` : ''}</div>
                <div className={styles.rowSubtitle}>{details.phone ? `Phone: ${details.phone}` : ''}</div>

                <div style={{ height: 12 }} />

                <div className={styles.cardTitle}>Suspend account</div>
                <div className={styles.rowSubtitle}>Select start and end date and provide a reason.</div>
                <div style={{ height: 8 }} />
                <div className={styles.row}>
                  <input
                    type="datetime-local"
                    value={suspendStart}
                    onChange={(e) => setSuspendStart(e.target.value)}
                    style={{ flex: 1, height: 44, borderRadius: 12, border: '1px solid var(--border)', padding: '0 12px' }}
                  />
                  <input
                    type="datetime-local"
                    value={suspendEnd}
                    onChange={(e) => setSuspendEnd(e.target.value)}
                    style={{ flex: 1, height: 44, borderRadius: 12, border: '1px solid var(--border)', padding: '0 12px' }}
                  />
                </div>

                <div style={{ height: 8 }} />
                <textarea
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Reason (required)"
                  style={{ width: '100%', minHeight: 80, borderRadius: 12, border: '1px solid var(--border)', padding: 12 }}
                />

                <div style={{ height: 10 }} />
                <div className={styles.row}>
                  <button type="button" className={styles.actionBtn} onClick={onSuspend} disabled={saving}>
                    Suspend
                  </button>
                  <button type="button" className={styles.dangerBtn} onClick={onBlock} disabled={saving}>
                    Block
                  </button>
                  <button type="button" className={styles.actionBtn} onClick={onReactivate} disabled={saving}>
                    Reactivate
                  </button>
                </div>

                <div style={{ height: 12 }} />

                <div className={styles.cardTitle}>Complaints</div>
                {Array.isArray(details.complaints) && details.complaints.length === 0 && (
                  <div className={styles.rowSubtitle}>No complaints submitted.</div>
                )}
                {Array.isArray(details.complaints) && details.complaints.length > 0 && (
                  <div className={styles.accordionBody}>
                    {details.complaints.slice(0, 8).map((c, idx) => (
                      <div key={String(idx)} className={styles.listRow}>
                        <div>
                          <div className={styles.listTitle}>{c.status || 'pending'}</div>
                          <div className={styles.listMeta}>{c.createdAt ? new Date(c.createdAt).toLocaleString() : ''}</div>
                          <div className={styles.rowSubtitle} style={{ marginTop: 6 }}>
                            {c.text}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {previewModalOpen && previewImageUrl && (
            <>
              <div className={styles.modalOverlay} onClick={() => {
                setPreviewModalOpen(false);
                setPreviewImageUrl(null);
              }} />
              <div
                className={styles.modalCard}
                style={{
                  maxWidth: 'min(520px, calc(100vw - 32px))',
                  padding: 0,
                  overflow: 'hidden',
                }}
              >
                <button
                  type="button"
                  onClick={() => setPreviewModalOpen(false)}
                  style={{
                    position: 'absolute',
                    top: 14,
                    right: 14,
                    zIndex: 1,
                    background: 'rgba(255,255,255,0.95)',
                    border: 'none',
                    borderRadius: '50%',
                    width: 34,
                    height: 34,
                    cursor: 'pointer',
                    fontSize: 18,
                    lineHeight: '34px',
                  }}
                  aria-label="Close preview"
                >
                  ×
                </button>
                <img
                  src={previewImageUrl}
                  alt="Candidate profile preview"
                  style={{
                    width: '100%',
                    height: 'auto',
                    display: 'block',
                    maxHeight: '80vh',
                    objectFit: 'contain',
                    background: '#000',
                  }}
                />
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default ManageCandidates;
