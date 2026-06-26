import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import GraduationCapLoader from './GraduationCapLoader';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/Settings.module.css';
import { maskCandidateId } from '../utility/maskCandidateId';

const PROGRAM_OPTIONS = ['HND', 'BTS', 'BACHELOR', 'MASTERS', 'LICENCE', 'MASTER'];

const ManageCandidates = ({ fixedRole = 'candidate', title = 'Manage Candidates' }) => {
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [users, setUsers] = useState([]);
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

  const [individualProgram, setIndividualProgram] = useState('');
  const [bulkCurrentProgram, setBulkCurrentProgram] = useState('HND');
  const [bulkTargetProgram, setBulkTargetProgram] = useState('BACHELOR');
  const [bulkMessage, setBulkMessage] = useState('');

  const isCandidateView = String(fixedRole || '').toLowerCase() === 'candidate';

  const loadUsers = useCallback(async ({ q = '', targetPage = 1 } = {}) => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      params.set('q', q);
      params.set('page', String(targetPage));
      params.set('limit', String(limit));
      if (fixedRole) params.set('role', fixedRole);

      const { data } = await api.get(`/admin/users?${params.toString()}`);
      const raw = Array.isArray(data?.users) ? data.users : [];
      const pagination = data?.pagination || null;

      setPage(Number(pagination?.page) > 0 ? Number(pagination.page) : targetPage);
      setTotal(Number(pagination?.total) >= 0 ? Number(pagination.total) : raw.length);
      setTotalPages(Number(pagination?.totalPages) > 0 ? Number(pagination.totalPages) : 1);

      setUsers(
        raw.map((u) => ({
          cand_id: u.cand_id,
          name: u.name,
          email: u.email,
          role: u.role || 'candidate',
          program: String(u.program || 'HND').toUpperCase(),
          department_abbreviation: u.department_abbreviation || '',
          account_status: u.account_status || 'active',
        }))
      );
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load users'), 'error');
    } finally {
      setLoading(false);
    }
  }, [fixedRole, limit]);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQuery(query.trim());
      setPage(1);
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  useEffect(() => {
    loadUsers({ q: debouncedQuery, targetPage: page });
  }, [page, debouncedQuery, loadUsers]);

  const onOpenUser = async (candId) => {
    try {
      setSelected(candId);
      setDetails(null);
      const { data } = await api.get(`/admin/candidates/${encodeURIComponent(candId)}`);
      const nextDetails = data?.candidate || null;
      setDetails(nextDetails);
      setSuspendStart('');
      setSuspendEnd('');
      setActionReason('');
      setIndividualProgram(String(nextDetails?.program || 'HND').toUpperCase());
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load user details'), 'error');
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
      await api.put(`/admin/candidates/${encodeURIComponent(details.cand_id)}/suspend`, {
        start_at: suspendStart,
        end_at: suspendEnd,
        reason: actionReason.trim(),
      });
      showToast('User suspended', 'success');
      await onOpenUser(details.cand_id);
      await loadUsers({ q: query.trim(), targetPage: page });
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to suspend user'), 'error');
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
      await api.put(`/admin/candidates/${encodeURIComponent(details.cand_id)}/block`, {
        reason: actionReason.trim(),
      });
      showToast('User blocked', 'success');
      await onOpenUser(details.cand_id);
      await loadUsers({ q: query.trim(), targetPage: page });
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to block user'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const onReactivate = async () => {
    if (!details?.cand_id) return;
    setSaving(true);
    try {
      await api.put(`/admin/candidates/${encodeURIComponent(details.cand_id)}/reactivate`, {});
      showToast('User reactivated', 'success');
      await onOpenUser(details.cand_id);
      await loadUsers({ q: query.trim(), targetPage: page });
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to reactivate user'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const onUpdateIndividualProgram = async () => {
    if (!details?.cand_id || !individualProgram) return;
    setSaving(true);
    try {
      try {
        await api.put(`/admin/users/${encodeURIComponent(details.cand_id)}/program`, { program: individualProgram });
      } catch (primaryErr) {
        if (Number(primaryErr?.response?.status) !== 404) throw primaryErr;
        await api.put(`/admin/candidates/${encodeURIComponent(details.cand_id)}/program`, { program: individualProgram });
      }
      showToast('Candidate program updated', 'success');
      await onOpenUser(details.cand_id);
      await loadUsers({ q: query.trim(), targetPage: page });
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update candidate program'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const onRunBulkProgramUpdateScript = async () => {
    if (!bulkCurrentProgram || !bulkTargetProgram) {
      showToast('Select source and destination programs', 'warning');
      return;
    }
    if (bulkCurrentProgram === bulkTargetProgram) {
      showToast('Source and destination programs must be different', 'warning');
      return;
    }

    setSaving(true);
    try {
      let data;
      try {
        const response = await api.post('/admin/users/program-update-campaign', {
          current_program: bulkCurrentProgram,
          target_program: bulkTargetProgram,
          message: bulkMessage,
        });
        data = response.data;
      } catch (primaryErr) {
        if (Number(primaryErr?.response?.status) !== 404) throw primaryErr;
        const response = await api.post('/admin/candidates/program-update-campaign', {
          current_program: bulkCurrentProgram,
          target_program: bulkTargetProgram,
          message: bulkMessage,
        });
        data = response.data;
      }
      showToast(`Program update prompt sent to ${Number(data?.targeted_count || 0)} candidates.`, 'success');
      setBulkMessage('');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to start program update script'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <GraduationCapLoader fullscreen label="Loading users..." />;

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <div className={styles.title}>{title}</div>
          <div className={styles.subtitle}>Manage account status, profile context, and moderation actions.</div>
        </div>
      </div>

      {isCandidateView && (
        <section className={styles.card} style={{ marginBottom: 14 }}>
          <div className={styles.cardTitle}>Candidate Program Update Script</div>
          <div className={styles.rowSubtitle}>
            Select a source program and destination program. Candidates in the source program will receive a popup asking them to accept or reject migration after validation.
          </div>
          <div style={{ height: 8 }} />
          <div className={styles.row}>
            <select value={bulkCurrentProgram} onChange={(e) => setBulkCurrentProgram(e.target.value)} style={{ flex: 1, height: 42, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px' }}>
              {PROGRAM_OPTIONS.map((p) => <option key={`source-${p}`} value={p}>{p}</option>)}
            </select>
            <select value={bulkTargetProgram} onChange={(e) => setBulkTargetProgram(e.target.value)} style={{ flex: 1, height: 42, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px' }}>
              {PROGRAM_OPTIONS.map((p) => <option key={`target-${p}`} value={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ height: 8 }} />
          <textarea
            value={bulkMessage}
            onChange={(e) => setBulkMessage(e.target.value)}
            placeholder="Optional custom popup message"
            style={{ width: '100%', minHeight: 70, borderRadius: 10, border: '1px solid var(--border)', padding: 10 }}
          />
          <div style={{ height: 8 }} />
          <button type="button" className={styles.actionBtn} onClick={onRunBulkProgramUpdateScript} disabled={saving}>
            Run Program Update Script
          </button>
        </section>
      )}

      <div className={styles.grid}>
        <section className={styles.card}>
          <div className={styles.cardTitle}>{title}</div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name / ID / email"
            style={{ width: '100%', height: 44, borderRadius: 12, border: '1px solid var(--border)', padding: '0 12px' }}
          />
          <div style={{ height: 10 }} />
          <div className={styles.accordionBody}>
            {users.map((u) => (
              <button
                key={u.cand_id}
                type="button"
                className={styles.accordionBtn}
                onClick={() => onOpenUser(u.cand_id)}
                title="View details"
              >
                <span>
                  {u.name} {u.department_abbreviation ? `• ${u.department_abbreviation}` : ''} • {u.program}
                </span>
                <span className={styles.chip}>{String(u.account_status || 'active')}</span>
              </button>
            ))}
            {!users.length && <div className={styles.rowSubtitle}>No users found for this filter.</div>}
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
      </div>

      {selected && (
        <>
          <div className={styles.modalOverlay} onClick={closeModal} />
          <div className={`${styles.card} ${styles.modalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.cardTitle}>User details</div>
            {!details && <div className={styles.rowSubtitle}>Loading...</div>}
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
                <div className={styles.rowSubtitle}>Role: {details.role || 'candidate'}</div>
                <div className={styles.rowSubtitle}>Program: {String(details.program || 'HND').toUpperCase()}</div>
                <div className={styles.rowSubtitle}>{details.department?.department_name ? `Department: ${details.department.department_name}` : ''}</div>
                <div className={styles.rowSubtitle}>{details.email ? `Email: ${details.email}` : ''}</div>
                <div className={styles.rowSubtitle}>{details.phone ? `Phone: ${details.phone}` : ''}</div>

                {isCandidateView && (
                  <>
                    <div style={{ height: 12 }} />
                    <div className={styles.cardTitle}>Individual Program Update</div>
                    <div className={styles.row}>
                      <select value={individualProgram} onChange={(e) => setIndividualProgram(e.target.value)} style={{ flex: 1, height: 42, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px' }}>
                        {PROGRAM_OPTIONS.map((p) => <option key={`individual-${p}`} value={p}>{p}</option>)}
                      </select>
                      <button type="button" className={styles.actionBtn} onClick={onUpdateIndividualProgram} disabled={saving}>Update Program</button>
                    </div>
                  </>
                )}

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
                  <button type="button" className={styles.actionBtn} onClick={onSuspend} disabled={saving}>Suspend</button>
                  <button type="button" className={styles.dangerBtn} onClick={onBlock} disabled={saving}>Block</button>
                  <button type="button" className={styles.actionBtn} onClick={onReactivate} disabled={saving}>Reactivate</button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ManageCandidates;
