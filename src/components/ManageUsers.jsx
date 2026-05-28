import React, { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import styles from '../Astyles/Settings.module.css';
import GraduationCapLoader from './GraduationCapLoader';
import { useTranslation } from 'react-i18next';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import { maskCandidateId } from '../utility/maskCandidateId';

const ManageUsers = () => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [programFilter, setProgramFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [adminSearch, setAdminSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  const [users, setUsers] = useState([]);
  const [selected, setSelected] = useState(null);
  const [details, setDetails] = useState(null);

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (programFilter) params.set('program', programFilter);
      if (statusFilter) params.set('status', statusFilter);
      params.set('page', String(page));
      params.set('limit', '100');
      const { data } = await api.get(`/admin/users?${params.toString()}`);
      setUsers(Array.isArray(data?.users) ? data.users : []);
      if (data?.pagination) {
        setTotalPages(data.pagination.totalPages || 1);
        setTotal(data.pagination.total || 0);
      }
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load users'), 'error');
    } finally {
      setLoading(false);
    }
  }, [programFilter, statusFilter, page]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setPage(1);
  }, [programFilter, statusFilter]);

  const candidates = useMemo(() => {
    const q = candidateSearch.trim().toLowerCase();
    return users
      .filter((u) => String(u.role || '').toLowerCase() === 'candidate')
      .filter((u) => {
        if (!q) return true;
        const hay = `${u.name || ''} ${u.cand_id || ''} ${u.email || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [users, candidateSearch]);

  const admins = useMemo(() => {
    const q = adminSearch.trim().toLowerCase();
    return users
      .filter((u) => {
        const role = String(u.role || '').toLowerCase();
        return role === 'admin' || role === 'developer' || role === 'superadmin';
      })
      .filter((u) => {
        if (!q) return true;
        const hay = `${u.name || ''} ${u.cand_id || ''} ${u.email || ''}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  }, [users, adminSearch]);

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

  const closeModal = () => {
    setSelected(null);
    setDetails(null);
  };

  const updateRole = async (candId, role) => {
    if (!candId) return;
    setSaving(true);
    try {
      await api.put(`/admin/users/${encodeURIComponent(candId)}/role`, { role });
      showToast(role === 'admin' ? 'toast.role.promoted' : 'toast.role.demoted', 'success');
      await loadUsers();
      await openDetails(candId);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update role'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <GraduationCapLoader fullscreen label={t('common.loading')} />;

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <div className={styles.title}>{t('manageUsers.title')}</div>
          <div className={styles.subtitle}>{t('manageUsers.subtitle')}</div>
        </div>
      </div>

      <div className={styles.grid} style={{ gridTemplateColumns: '1fr 1fr' }}>
        <section className={styles.card}>
          <div className={styles.cardTitle}>{t('manageUsers.candidates')}</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
            <select
              value={programFilter}
              onChange={(e) => setProgramFilter(e.target.value)}
              style={{ height: 42, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px' }}
            >
              <option value="">{t('manageUsers.allPrograms')}</option>
              <option value="HND">{t('common.hnd')}</option>
              <option value="BTS">{t('common.bts')}</option>
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{ height: 42, borderRadius: 10, border: '1px solid var(--border)', padding: '0 10px' }}
            >
              <option value="">{t('manageUsers.allStatus')}</option>
              <option value="active">{t('common.active')}</option>
              <option value="suspended">{t('common.suspended')}</option>
              <option value="blocked">{t('common.blocked')}</option>
            </select>
          </div>

          <input
            value={candidateSearch}
            onChange={(e) => setCandidateSearch(e.target.value)}
            placeholder={t('manageUsers.searchPlaceholder')}
            aria-label="Search candidates by name, ID or email"
            style={{ width: '100%', height: 44, borderRadius: 12, border: '1px solid var(--border)', padding: '0 12px' }}
          />

          <div style={{ height: 10 }} />
          <div className={styles.accordionBody}>
            {candidates.map((u) => (
              <button key={u.cand_id} type="button" className={styles.accordionBtn} onClick={() => openDetails(u.cand_id)}>
                <span>
                  {u.name} • {u.department_abbreviation || '-'} • {String(u.program || 'HND').toUpperCase()}
                </span>
                <span className={styles.chip}>{String(u.account_status || 'active')}</span>
              </button>
            ))}
            {!candidates.length && <div className={styles.rowSubtitle}>{t('manageUsers.noCandidates')}</div>}
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardTitle}>{t('manageUsers.admins')}</div>
          <input
            value={adminSearch}
            onChange={(e) => setAdminSearch(e.target.value)}
            placeholder={t('manageUsers.searchPlaceholder')}
            aria-label="Search admins by name, ID or email"
            style={{ width: '100%', height: 44, borderRadius: 12, border: '1px solid var(--border)', padding: '0 12px' }}
          />

          <div style={{ height: 10 }} />
          <div className={styles.accordionBody}>
            {admins.map((u) => (
              <button key={u.cand_id} type="button" className={styles.accordionBtn} onClick={() => openDetails(u.cand_id)}>
                <span>
                  {u.name} • {u.department_abbreviation || '-'}
                </span>
                <span className={styles.chip}>{String(u.role || 'admin')}</span>
              </button>
            ))}
            {!admins.length && <div className={styles.rowSubtitle}>{t('manageUsers.noAdmins')}</div>}
          </div>
        </section>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '16px 0' }}>
          <button
            type="button"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || loading}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', cursor: page <= 1 ? 'default' : 'pointer' }}
          >
            Previous
          </button>
          <span style={{ fontSize: 14 }}>Page {page} of {totalPages} ({total} users)</span>
          <button
            type="button"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || loading}
            style={{ padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)', cursor: page >= totalPages ? 'default' : 'pointer' }}
          >
            Next
          </button>
        </div>
      )}

      {selected && (
        <>
          <div className={styles.modalOverlay} onClick={closeModal} />
          <div className={`${styles.card} ${styles.modalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.cardTitle}>{t('manageUsers.userDetails')}</div>
            {!details && <div className={styles.rowSubtitle}>{t('common.loading')}</div>}
            {details && (
              <>
                <div className={styles.row}>
                  <div>
                    <div className={styles.rowTitle}>{details.name}</div>
                    <div className={styles.rowSubtitle}>{maskCandidateId(details.cand_id)}</div>
                  </div>
                  <span className={styles.chip}>{String(details.account_status || 'active')}</span>
                </div>

                <div style={{ height: 10 }} />
                <div className={styles.rowSubtitle}>{t('manageUsers.roleLabel')}: {details.role || 'candidate'}</div>
                <div className={styles.rowSubtitle}>{t('manageUsers.programLabel')}: {String(details.program || 'HND').toUpperCase()}</div>
                <div className={styles.rowSubtitle}>{details.department?.department_name ? `${t('manageUsers.departmentLabel')}: ${details.department.department_name}` : ''}</div>
                <div className={styles.rowSubtitle}>{details.email ? `${t('manageUsers.emailLabel')}: ${details.email}` : ''}</div>
                <div className={styles.rowSubtitle}>{details.phone ? `${t('manageUsers.phoneLabel')}: ${details.phone}` : ''}</div>

                {String(details.role || '').toLowerCase() !== 'superadmin' && String(details.role || '').toLowerCase() !== 'developer' ? (
                  <div className={styles.row} style={{ marginTop: 12, gap: 10 }}>
                    {String(details.role || '').toLowerCase() === 'admin' ? (
                      <button type="button" className={styles.dangerBtn} onClick={() => updateRole(details.cand_id, 'candidate')} disabled={saving}>
                        {t('manageUsers.demoteCandidate')}
                      </button>
                    ) : (
                      <button type="button" className={styles.actionBtn} onClick={() => updateRole(details.cand_id, 'admin')} disabled={saving}>
                        {t('manageUsers.promoteAdmin')}
                      </button>
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
