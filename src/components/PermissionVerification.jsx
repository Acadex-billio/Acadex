import React, { useEffect, useState } from 'react';
import api from '../services/api';
import GraduationCapLoader from './GraduationCapLoader';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/adminHistory.module.css';

const PermissionVerification = () => {
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState([]);
  const [selectedCandidate, setSelectedCandidate] = useState(null);
  const [grantType, setGrantType] = useState('plan');
  const [planCode, setPlanCode] = useState('pro');
  const [expiresInDays, setExpiresInDays] = useState(90);
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

  useEffect(() => {
    if (!selectedCandidate) {
      setGrantType('plan');
      setPlanCode('pro');
      setExpiresInDays(90);
      setMessage('');
    }
  }, [selectedCandidate]);

  const selectCandidate = (candidate) => {
    setSelectedCandidate(candidate);
    setError('');
  };

  const grantPermission = async () => {
    if (!selectedCandidate) {
      setError('Select a candidate first.');
      return;
    }
    if (grantType === 'plan' && !planCode.trim()) {
      setError('Select a plan to grant.');
      return;
    }

    setSubmitting(true);
    setError('');
    try {
      const body = {
        query: selectedCandidate.email || selectedCandidate.cand_id || selectedCandidate.name,
        item_type: grantType,
        plan: grantType === 'plan' ? planCode : undefined,
        amount: grantType === 'plan' ? 0 : 0,
        currency: 'XAF',
        expires_in_days: Number(expiresInDays) || 90,
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

  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Permission Verification</h2>

      <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <input
            type="text"
            placeholder="Search candidate by email, ID, or name"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className={styles.pagerBtn}
            style={{ flex: '1 1 320px', minWidth: 0 }}
          />
          <button
            type="button"
            className={styles.pagerBtn}
            onClick={searchCandidates}
            disabled={searching || !query.trim()}
          >
            {searching ? 'Searching…' : 'Search Candidates'}
          </button>
        </div>

        {error ? <div className={styles.error}>{error}</div> : null}
        {message ? <div className={styles.panelBody} style={{ background: '#ecfdf5', border: '1px solid #10b981' }}>{message}</div> : null}
      </div>

      {searching ? <GraduationCapLoader fullscreen label="Searching candidates…" /> : null}

      {results.length > 0 ? (
        <div style={{ marginTop: 18 }}>
          <div className={styles.panelTitle}>Select candidate</div>
          <div className={styles.table} style={{ marginTop: 8, overflowX: 'auto' }}>
            {results.map((candidate) => (
              <div
                key={candidate.cand_id || candidate._id}
                className={styles.logRow}
                style={{
                  gridTemplateColumns: '1.4fr 1fr 1fr auto',
                  background: selectedCandidate && selectedCandidate.cand_id === candidate.cand_id ? '#f8fafc' : 'transparent',
                }}
              >
                <div>
                  <div>{candidate.name || candidate.email || 'Unknown Candidate'}</div>
                  <div className={styles.small}>{candidate.email || '—'}</div>
                </div>
                <div>{candidate.cand_id || '—'}</div>
                <div>{candidate.subscription?.plan || 'No plan'}</div>
                <div>
                  <button
                    type="button"
                    className={styles.pagerBtn}
                    onClick={() => selectCandidate(candidate)}
                    style={{ width: '100%' }}
                  >
                    Select
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {selectedCandidate ? (
        <div style={{ marginTop: 20, display: 'grid', gap: 12 }}>
          <div className={styles.panelTitle}>Grant Permission for {selectedCandidate.name || selectedCandidate.email}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, alignItems: 'center' }}>
            <div>
              <label className={styles.small} style={{ display: 'block', marginBottom: 6 }}>Grant type</label>
              <select
                className={styles.pagerBtn}
                value={grantType}
                onChange={(e) => setGrantType(e.target.value)}
                style={{ width: '100%' }}
              >
                <option value="plan">Subscription plan</option>
                <option value="report">Report access</option>
                <option value="presentation">Presentation access</option>
                <option value="paper">Question paper access</option>
                <option value="center">Center access</option>
                <option value="ai_mode">AI access</option>
              </select>
            </div>
            {grantType === 'plan' ? (
              <div>
                <label className={styles.small} style={{ display: 'block', marginBottom: 6 }}>Plan code</label>
                <select
                  className={styles.pagerBtn}
                  value={planCode}
                  onChange={(e) => setPlanCode(e.target.value)}
                  style={{ width: '100%' }}
                >
                  <option value="basic">basic</option>
                  <option value="pro">pro</option>
                  <option value="paygo">paygo</option>
                </select>
              </div>
            ) : null}
            <div>
              <label className={styles.small} style={{ display: 'block', marginBottom: 6 }}>Grant duration (days)</label>
              <input
                type="number"
                min="1"
                value={expiresInDays}
                onChange={(e) => setExpiresInDays(Number(e.target.value || 90))}
                className={styles.pagerBtn}
                style={{ width: '100%' }}
              />
            </div>
          </div>
          <button
            type="button"
            className={styles.pagerBtn}
            onClick={grantPermission}
            disabled={submitting}
            style={{ width: 200 }}
          >
            {submitting ? 'Granting…' : 'Grant Permission'}
          </button>
        </div>
      ) : null}
    </div>
  );
};

export default PermissionVerification;
