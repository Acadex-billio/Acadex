import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import styles from '../Astyles/Settings.module.css';
import GraduationCapLoader from './GraduationCapLoader';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import { maskCandidateId } from '../utility/maskCandidateId';

const ManageUsers = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      params.set('limit', '200');
      const { data } = await api.get(`/admin/users?${params.toString()}`);
      setUsers(Array.isArray(data?.users) ? data.users : []);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load users'), 'error');
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const adminAccounts = useMemo(
    () => users.filter((u) => ['admin', 'developer', 'superadmin'].includes(String(u.role || '').toLowerCase())),
    [users]
  );

  const promoteCandidates = useMemo(
    () => users.filter((u) => ['candidate', 'lecturer'].includes(String(u.role || '').toLowerCase())),
    [users]
  );

  const openDetails = async (candId) => {
    try {
      setSelected(candId);
      setDetails(null);
      const { data } = await api.get(`/admin/candidates/${encodeURIComponent(candId)}`);
      setDetails(data?.candidate || null);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load user details'), 'error');
      setSelected(null);
      setDetails(null);
    }
  };

  const updateRole = async (candId, role) => {
    if (!candId) return;
    setSaving(true);
    try {
      await api.put(`/admin/users/${encodeURIComponent(candId)}/role`, { role });
      showToast(`Role updated to ${role}`, 'success');
      await loadUsers();
      await openDetails(candId);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update role'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <GraduationCapLoader fullscreen label="Loading users..." />;

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <div className={styles.title}>Admin Management</div>
          <div className={styles.subtitle}>Developer-only workspace for promoting and demoting admin access.</div>
        </div>
      </div>

      <div className={styles.grid} style={{ gridTemplateColumns: '1fr 1fr' }}>
        <section className={styles.card}>
          <div className={styles.cardTitle}>Current Admin Accounts</div>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name / ID / email"
            style={{ width: '100%', height: 44, borderRadius: 12, border: '1px solid var(--border)', padding: '0 12px' }}
          />
          <div style={{ height: 10 }} />
          <div className={styles.accordionBody}>
            {adminAccounts.map((u) => (
              <button key={u.cand_id} type="button" className={styles.accordionBtn} onClick={() => openDetails(u.cand_id)}>
                <span>{u.name} • {String(u.role || '').toUpperCase()}</span>
                <span className={styles.chip}>{u.account_status || 'active'}</span>
              </button>
            ))}
            {!adminAccounts.length && <div className={styles.rowSubtitle}>No admin accounts found.</div>}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardTitle}>Promote Users to Admin</div>
          <div className={styles.accordionBody}>
            {promoteCandidates.map((u) => (
              <div key={u.cand_id} className={styles.listRow}>
                <div>
                  <div className={styles.listTitle}>{u.name}</div>
                  <div className={styles.listMeta}>{maskCandidateId(u.cand_id)} • {String(u.role || '').toUpperCase()}</div>
                </div>
                <button type="button" className={styles.actionBtn} onClick={() => updateRole(u.cand_id, 'admin')} disabled={saving}>Promote</button>
              </div>
            ))}
            {!promoteCandidates.length && <div className={styles.rowSubtitle}>No promotable users found.</div>}
          </div>
        </section>
      </div>

      {selected && (
        <>
          <div className={styles.modalOverlay} onClick={() => { setSelected(null); setDetails(null); }} />
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
                  <span className={styles.chip}>{String(details.role || '').toUpperCase()}</span>
                </div>
                <div style={{ height: 10 }} />
                <div className={styles.rowSubtitle}>Program: {String(details.program || 'HND').toUpperCase()}</div>
                <div className={styles.rowSubtitle}>{details.email ? `Email: ${details.email}` : ''}</div>
                <div className={styles.rowSubtitle}>{details.phone ? `Phone: ${details.phone}` : ''}</div>

                {String(details.role || '').toLowerCase() !== 'superadmin' && String(details.role || '').toLowerCase() !== 'developer' ? (
                  <div className={styles.row} style={{ marginTop: 12, gap: 10 }}>
                    {String(details.role || '').toLowerCase() === 'admin' ? (
                      <button type="button" className={styles.dangerBtn} onClick={() => updateRole(details.cand_id, 'candidate')} disabled={saving}>Demote to Candidate</button>
                    ) : (
                      <button type="button" className={styles.actionBtn} onClick={() => updateRole(details.cand_id, 'admin')} disabled={saving}>Promote to Admin</button>
                    )}
                  </div>
                ) : null}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ManageUsers;
