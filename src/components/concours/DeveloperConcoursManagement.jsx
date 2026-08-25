import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { showToast } from '../../utility/ToastNotification';
import styles from '../../Astyles/Concours.module.css';

export default function DeveloperConcoursManagement() {
  const { user } = useAuth();
  const [rows, setRows] = useState([]);
  const [partners, setPartners] = useState([]);
  const [partnerId, setPartnerId] = useState('');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState('');
  const [details, setDetails] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');

  const load = async () => {
    try {
      const [concoursResponse, partnerResponse] = await Promise.all([
        api.get('/concours/partner/concours'),
        api.get('/concours/developer/partners'),
      ]);
      setRows(concoursResponse.data.concours || []);
      setPartners(partnerResponse.data.partners || []);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to load concours.');
    }
  };

  useEffect(() => { load(); }, []);

  const publish = async (id) => {
    try {
      await api.post(`/concours/partner/concours/${id}/publish`);
      showToast('Concours published successfully.', 'success');
      await load();
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Unable to publish concours.';
      setMessage(errorMessage);
      showToast(errorMessage, 'error');
    }
  };

  const unpublish = async (id) => {
    try {
      await api.patch(`/concours/partner/concours/${id}/unpublish`);
      showToast('Concours moved back to draft.', 'info');
      await load();
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Unable to unpublish concours.';
      setMessage(errorMessage);
      showToast(errorMessage, 'error');
    }
  };

  const deleteConcours = async (event) => {
    event.preventDefault();
    if (deleteConfirmation.trim().toLowerCase() !== 'delete concours') return;
    try {
      await api.delete(`/concours/partner/concours/${deleteTarget._id}`);
      showToast('Concours deleted.', 'success');
      setDeleteTarget(null);
      setDeleteConfirmation('');
      await load();
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Unable to delete concours.';
      setMessage(errorMessage);
      showToast(errorMessage, 'error');
    }
  };

  const filtered = rows.filter((row) => (
    (!partnerId || String(row.partnerId) === partnerId)
    && (!query || `${row.title} ${row.organizationName}`.toLowerCase().includes(query.toLowerCase()))
  ));
  const canPublish = ['developer', 'superadmin'].includes(String(user?.role || '').toLowerCase());

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Developer review</div>
          <h1 className={styles.title}>Concours Management</h1>
          <p className={styles.subtitle}>Review complete opportunity details and forms before publication.</p>
        </div>
        <Link className={`${styles.button} ${styles.buttonSecondary}`} to="/admin/manage-users/concours-partners">Manage partners</Link>
      </header>
      <div className={styles.filters}>
        <input className={styles.search} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search title or organization" />
        <select className={styles.search} value={partnerId} onChange={(event) => setPartnerId(event.target.value)}>
          <option value="">All partners</option>
          {partners.map((partner) => <option key={partner._id} value={partner._id}>{partner.organization?.name || partner.name}</option>)}
        </select>
      </div>
      {message ? <p role="status">{message}</p> : null}
      <div className={styles.grid}>
        {filtered.map((row) => (
          <article className={styles.card} key={row._id}>
            <div className={styles.cardMeta}>{row.organizationName} · {row.category}</div>
            <h2 className={styles.cardTitle}>{row.title}</h2>
            <span className={styles.status}>{row.status}</span>
            <p className={styles.cardText}>{row.shortDescription}</p>
            <div className={styles.actions}>
              <button className={styles.button} type="button" onClick={() => setDetails(row)}>View details</button>
              <Link className={styles.button} to={`/admin/concours/${row._id}/form`}>Review form</Link>
              {canPublish && (row.status === 'published'
                ? <button className={styles.button} type="button" onClick={() => unpublish(row._id)}>Unpublish</button>
                : <button className={styles.button} type="button" onClick={() => publish(row._id)}>Publish</button>)}
              <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => { setDeleteTarget(row); setDeleteConfirmation(''); }}>Delete</button>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length ? <p className={styles.empty}>No concours found.</p> : null}
      {details ? (
        <div className={styles.modalBackdrop} onClick={() => setDetails(null)}>
          <section className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <button className={styles.modalClose} type="button" onClick={() => setDetails(null)}>Close</button>
            <div className={styles.eyebrow}>{details.organizationName} · {details.category}</div>
            <h2 className={styles.cardTitle}>{details.title}</h2>
            <p className={styles.cardText}>{details.fullDescription}</p>
            <h3>Dates</h3>
            <p className={styles.cardText}>Opens {new Date(details.openingDate).toLocaleDateString()} · Closes {new Date(details.closingDate).toLocaleDateString()}{details.selectionDate ? ` · Selection ${new Date(details.selectionDate).toLocaleDateString()}` : ''}</p>
            <h3>Eligibility</h3>
            <p className={styles.cardText}>{details.eligibility || 'Not provided.'}</p>
            <h3>Instructions and notes</h3>
            <p className={styles.cardText}>{details.instructions || 'Not provided.'}</p>
            <h3>Application form</h3>
            <p className={styles.cardText}>{details.applicationForm?.fields?.length || 0} field(s), {details.applicationForm?.published ? 'published' : 'not published'}</p>
          </section>
        </div>
      ) : null}
      {deleteTarget ? (
        <div className={styles.modalBackdrop} onClick={() => setDeleteTarget(null)}>
          <section className={styles.modal} onClick={(event) => event.stopPropagation()}>
            <button className={styles.modalClose} type="button" onClick={() => setDeleteTarget(null)}>Cancel</button>
            <h2>Delete concours?</h2>
            <p className={styles.cardText}>Type <strong>delete concours</strong> to permanently delete “{deleteTarget.title}”.</p>
            <form onSubmit={deleteConcours}>
              <label className={styles.formLabel}>Confirmation
                <input className={styles.search} value={deleteConfirmation} onChange={(event) => setDeleteConfirmation(event.target.value)} autoComplete="off" />
              </label>
              <button className={`${styles.button} ${styles.buttonSecondary}`} type="submit" disabled={deleteConfirmation.trim().toLowerCase() !== 'delete concours'}>Delete permanently</button>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}
