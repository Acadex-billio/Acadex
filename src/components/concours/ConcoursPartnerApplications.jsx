import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import { showToast } from '../../utility/ToastNotification';
import styles from '../../Astyles/ConcoursPartner.module.css';

const statuses = ['received', 'under_review', 'shortlisted', 'rejected', 'selected', 'correction_requested', 'forwarded'];

export default function ConcoursPartnerApplications() {
  const [applications, setApplications] = useState([]);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const response = await api.get('/concours/partner/applications');
      setApplications(response.data.applications || []);
      setError('');
    } catch (requestError) {
      setError(requestError.response?.data?.message || 'Unable to load applications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const updateStatus = async (application, status, reason = '') => {
    setSavingId(application._id);
    try {
      const response = await api.patch(`/concours/partner/applications/${application._id}`, { status, reason });
      setApplications((current) => current.map((item) => (item._id === application._id ? response.data.application : item)));
      setSelected((current) => (current?._id === application._id ? response.data.application : current));
      showToast('Application status updated.', 'success');
    } catch (requestError) {
      showToast(requestError.response?.data?.message || 'Unable to update application status.', 'error');
    } finally {
      setSavingId(null);
    }
  };

  const visibleApplications = applications.filter((application) => {
    const candidate = application.profileSnapshot?.name || application.candidateCandId || '';
    const concours = application.concoursId?.title || '';
    const matchesQuery = !query || `${candidate} ${concours}`.toLowerCase().includes(query.toLowerCase());
    return matchesQuery && (filter === 'all' || application.status === filter);
  });

  if (loading) return <div className={styles.loading}>Loading applications...</div>;

  return (
    <div className={styles.applicationsList}>
      <div className={styles.applicationsHeader}>
        <div className={styles.concoursItemStatus}>Partner workspace</div>
        <h1 className={styles.applicationsTitle}>Student applications</h1>
        <p className={styles.applicationsSubtitle}>Review submissions, inspect answers, and manage each application status.</p>
      </div>

      <div className={styles.applicationFilters}>
        <input className={styles.formFieldInput} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search candidate or concours" />
        <select className={styles.formFieldSelect} value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
        </select>
      </div>

      {error ? <div className={styles.formMessage}>{error}</div> : null}
      {!visibleApplications.length ? <div className={styles.emptyState}><div className={styles.emptyStateTitle}>No applications found</div><p className={styles.emptyStateMessage}>Submitted applications will appear here for review.</p></div> : (
        <div className={styles.applicationsGrid}>
          {visibleApplications.map((application) => {
            const candidateName = application.profileSnapshot?.name || application.candidateCandId || 'Candidate';
            return <article className={styles.applicationCard} key={application._id}>
              <span className={styles.applicationStatus}>{String(application.status).replace(/_/g, ' ')}</span>
              <h2 className={styles.applicationCandidate}>{candidateName}</h2>
              <div className={styles.applicationConcours}>{application.concoursId?.title || 'Concours opportunity'}</div>
              <div className={styles.applicationDate}>{application.submittedAt ? `Submitted ${new Date(application.submittedAt).toLocaleString()}` : 'Draft application'}</div>
              <div className={styles.applicationActions}>
                <button className={styles.applicationActionBtn} type="button" onClick={() => setSelected(application)}>View application</button>
                <select className={styles.applicationActionBtn} value={application.status} disabled={savingId === application._id} onChange={(event) => updateStatus(application, event.target.value)} aria-label={`Update status for ${candidateName}`}>
                  <option value={application.status}>{String(application.status).replace(/_/g, ' ')}</option>
                  {statuses.filter((status) => status !== application.status).map((status) => <option key={status} value={status}>{status.replace(/_/g, ' ')}</option>)}
                </select>
              </div>
            </article>;
          })}
        </div>
      )}

      {selected ? <ApplicationDetails application={selected} onClose={() => setSelected(null)} onStatusChange={(status, reason) => updateStatus(selected, status, reason)} saving={savingId === selected._id} /> : null}
    </div>
  );
}

function ApplicationDetails({ application, onClose, onStatusChange, saving }) {
  const [status, setStatus] = useState(application.status);
  const [reason, setReason] = useState('');
  const answers = application.answers || {};
  const snapshot = application.profileSnapshot || {};

  return <div className={styles.paymentModalBackdrop} onClick={onClose}>
    <section className={`${styles.paymentModal} ${styles.applicationDetailsModal}`} onClick={(event) => event.stopPropagation()}>
      <button type="button" className={styles.paymentCancelButton} onClick={onClose}>Close</button>
      <h2>{snapshot.name || application.candidateCandId || 'Candidate application'}</h2>
      <p>{application.concoursId?.title || 'Concours application'}{application.submittedAt ? ` · Submitted ${new Date(application.submittedAt).toLocaleString()}` : ''}</p>
      <div className={styles.applicationProfileGrid}><div><strong>Email</strong><span>{snapshot.email || 'Not provided'}</span></div><div><strong>Phone</strong><span>{snapshot.phone || 'Not provided'}</span></div><div><strong>Program</strong><span>{snapshot.program || 'Not provided'}</span></div><div><strong>Address</strong><span>{snapshot.address || 'Not provided'}</span></div></div>
      <h3>Submitted answers</h3>
      <div className={styles.answerList}>{Object.entries(answers).map(([key, value]) => <div className={styles.answerRow} key={key}><strong>{key}</strong><span>{Array.isArray(value) ? value.join(', ') : String(value || 'Not provided')}</span></div>)}</div>
      {application.documents?.length ? <><h3>Documents</h3><div className={styles.answerList}>{application.documents.map((document) => <a className={styles.documentLink} key={document._id} href={`/api/concours/applications/${application._id}/documents/${document._id}`} target="_blank" rel="noreferrer">{document.originalName || 'View document'}</a>)}</div></> : null}
      <h3>Manage status</h3>
      <select className={styles.formFieldSelect} value={status} onChange={(event) => setStatus(event.target.value)}><option value={status}>{status.replace(/_/g, ' ')}</option>{statuses.filter((item) => item !== status).map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ')}</option>)}</select>
      {status === 'correction_requested' ? <textarea className={styles.formFieldTextarea} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain what the candidate should correct" rows={3} /> : null}
      <div className={styles.paymentModalActions}><button type="button" className={styles.partnershipButton} onClick={() => onStatusChange(status, reason)} disabled={saving}>{saving ? 'Updating...' : 'Update status'}</button></div>
    </section>
  </div>;
}
