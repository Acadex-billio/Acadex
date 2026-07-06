import React, { useState } from 'react';
import api from '../services/api';
import styles from '../Astyles/adminHistory.module.css';
import { getErrorMessage } from '../utility/getErrorMessage';

const BillingAccessGrantModal = ({ open, onClose }) => {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [grantType, setGrantType] = useState('paper');
  const [itemId, setItemId] = useState('');
  const [itemTitle, setItemTitle] = useState('');
  const [accessAction, setAccessAction] = useState('preview');
  const [materialLookupLoading, setMaterialLookupLoading] = useState(false);
  const [materialLookupError, setMaterialLookupError] = useState('');
  const [expiresInHours, setExpiresInHours] = useState(1);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const searchCandidates = async () => {
    if (!query.trim()) {
      setError('Enter candidate email, ID, or name to search.');
      return;
    }
    setSearching(true);
    setError('');
    setResults([]);
    try {
      const res = await api.get('/admin/candidates', { params: { q: query.trim(), limit: 50 } });
      setResults(Array.isArray(res.data?.candidates) ? res.data.candidates : []);
    } catch (err) {
      setError(getErrorMessage(err, 'Search failed'));
    } finally {
      setSearching(false);
    }
  };

  const selectCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    setError('');
  };

  const fetchMaterialTitle = async (type, id) => {
    const value = String(id || '').trim();
    if (!value) {
      setItemTitle('');
      setMaterialLookupError('');
      return;
    }
    setMaterialLookupLoading(true);
    setMaterialLookupError('');
    try {
      const res = await api.get('/admin/access-grants/material', { params: { type, id: value } });
      if (res.data?.ok && res.data?.data) {
        setItemTitle(res.data.data.item_title || '');
      } else {
        setMaterialLookupError(res.data?.error || 'Unable to resolve material title.');
      }
    } catch (err) {
      setItemTitle('');
      setMaterialLookupError(getErrorMessage(err, 'Unable to resolve item title'));
    } finally {
      setMaterialLookupLoading(false);
    }
  };

  const grantPermission = async () => {
    if (!selectedCandidate) {
      setError('Select a candidate first.');
      return;
    }
    if (['paper', 'report', 'presentation'].includes(grantType) && !itemId.trim()) {
      setError('Provide the material ID for this grant.');
      return;
    }
    if (['paper', 'report', 'presentation'].includes(grantType) && !itemTitle.trim()) {
      setError('Material title must be resolved before granting access.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const body = {
        query: selectedCandidate.email || selectedCandidate.cand_id || selectedCandidate.name,
        item_type: grantType,
        item_id: itemId.trim() || undefined,
        item_title: itemTitle.trim() || undefined,
        access_action: ['paper', 'report', 'presentation'].includes(grantType) ? accessAction : undefined,
        amount: 0,
        currency: 'XAF',
        expires_in_hours: Number(expiresInHours) || 1,
      };
      await api.post('/admin/access-grants/find-and-grant', body);
      setMessage(`Access grant sent for ${selectedCandidate.name || selectedCandidate.email}.`);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to grant access'));
      setMessage('');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <div>
            <h2 className={styles.modalTitle}>Create Access History</h2>
            <p className={styles.modalSubtitle}>Grant a subscription or specific material access for a candidate.</p>
          </div>
          <button type="button" className={styles.closeBtn} onClick={onClose}>Close</button>
        </div>

        <div className={styles.modalBody}>
          <div className={styles.modalField}>
            <label className={styles.modalLabel}>Search candidate</label>
            <div className={styles.modalSearchRow}>
              <input
                type="text"
                placeholder="Search candidate by email, ID, or name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className={`${styles.pagerBtn} ${styles.modalInput}`}
              />
              <button type="button" className={`${styles.pagerBtn} ${styles.saveBtn}`} onClick={searchCandidates} disabled={searching || !query.trim()}>
                {searching ? 'Searching…' : 'Search Candidates'}
              </button>
            </div>
          </div>

          {error ? <div className={styles.error}>{error}</div> : null}
          {message ? <div className={styles.successMessage}>{message}</div> : null}

          {results.length > 0 ? (
            <div className={styles.panel}>
              <div className={styles.panelTitle}>Select candidate</div>
              <div className={styles.table}>
                {results.map((candidate) => (
                  <div
                    key={candidate.cand_id || candidate._id}
                    className={styles.logRow}
                    style={{
                      gridTemplateColumns: '1.4fr 1fr 1fr auto',
                      background: selectedCandidate && selectedCandidate.cand_id === candidate.cand_id ? '#f0f9ff' : 'transparent',
                    }}
                  >
                    <div>
                      <div className={styles.user}>{candidate.name || candidate.email || 'Unknown Candidate'}</div>
                      <div className={styles.small}>{candidate.email || '—'}</div>
                    </div>
                    <div className={styles.meta}>{candidate.cand_id || '—'}</div>
                    <div className={styles.meta}>{candidate.subscription?.plan || 'No plan'}</div>
                    <div>
                      <button type="button" className={`${styles.pagerBtn} ${styles.saveBtn}`} onClick={() => selectCandidate(candidate)} style={{ width: '100%' }}>
                        Select
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {selectedCandidate ? (
            <div className={styles.panel}>
              <div className={styles.panelTitle}>Grant Permission for {selectedCandidate.name || selectedCandidate.email}</div>
              <div className={styles.modalGrid}>
                <div className={styles.modalField}>
                  <label className={styles.modalLabel}>Access type</label>
                  <select className={`${styles.pagerBtn} ${styles.modalInput}`} value={grantType} onChange={(e) => {
                      setGrantType(e.target.value);
                      setItemId('');
                      setItemTitle('');
                      setMaterialLookupError('');
                    }}>
                    <option value="paper">Question paper access</option>
                    <option value="report">Report access</option>
                    <option value="presentation">Presentation access</option>
                    <option value="center">Center access</option>
                    <option value="ai_mode">AI access</option>
                  </select>
                </div>

                {['paper', 'report', 'presentation', 'center'].includes(grantType) ? (
                  <>
                    <div className={styles.modalField}>
                      <label className={styles.modalLabel}>Material ID</label>
                      <input
                        type="text"
                        value={itemId}
                        onChange={(e) => {
                          const value = e.target.value;
                          setItemId(value);
                          setItemTitle('');
                          setMaterialLookupError('');
                        }}
                        onBlur={() => fetchMaterialTitle(grantType, itemId)}
                        className={`${styles.pagerBtn} ${styles.modalInput}`}
                        placeholder="Paste the material ID"
                      />
                    </div>
                    <div className={styles.modalField}>
                      <label className={styles.modalLabel}>Resolved material</label>
                      <input
                        type="text"
                        value={itemTitle}
                        onChange={(e) => setItemTitle(e.target.value)}
                        className={`${styles.pagerBtn} ${styles.modalInput}`}
                        placeholder="Auto-filled material title"
                      />
                      {materialLookupLoading ? <div className={styles.small}>Looking up material...</div> : null}
                    </div>
                  </>
                ) : null}
                {['paper', 'report', 'presentation'].includes(grantType) ? (
                  <div className={styles.modalField}>
                    <label className={styles.modalLabel}>Access action</label>
                    <select className={`${styles.pagerBtn} ${styles.modalInput}`} value={accessAction} onChange={(e) => setAccessAction(e.target.value)}>
                      <option value="preview">Preview access</option>
                      <option value="download">Download access</option>
                    </select>
                  </div>
                ) : null}

                <div className={styles.modalField}>
                  <label className={styles.modalLabel}>Access duration (hours)</label>
                  <input
                    type="number"
                    min="1"
                    value={expiresInHours}
                    onChange={(e) => setExpiresInHours(Number(e.target.value || 1))}
                    className={`${styles.pagerBtn} ${styles.modalInput}`}
                    placeholder="1"
                  />
                </div>
              </div>
              {materialLookupError ? <div className={styles.error}>{materialLookupError}</div> : null}
              <div className={styles.modalActions}>
                <button type="button" className={`${styles.saveBtn} ${styles.fullWidth}`} onClick={grantPermission} disabled={submitting}>
                  {submitting ? 'Granting…' : 'Grant Permission'}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default BillingAccessGrantModal;
