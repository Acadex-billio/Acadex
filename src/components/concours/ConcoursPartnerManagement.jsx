import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../../services/api';
import { showToast } from '../../utility/ToastNotification';
import styles from '../../Astyles/ConcoursPartner.module.css';

const emptyDraft = () => ({
  title: '',
  shortDescription: '',
  fullDescription: '',
  organizationName: '',
  category: 'General',
  location: '',
  instructions: '',
  eligibility: '',
  openingDate: '',
  closingDate: '',
  selectionDate: '',
});

export default function ConcoursPartnerManagement() {
  const [rows, setRows] = useState([]);
  const [message, setMessage] = useState('');
  const [draft, setDraft] = useState(emptyDraft());
  const [editingId, setEditingId] = useState(null);
  const [showEditor, setShowEditor] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reuseFormId, setReuseFormId] = useState('');

  const resetDraft = () => {
    setDraft(emptyDraft());
    setReuseFormId('');
    setEditingId(null);
  };

  const openCreateModal = () => {
    resetDraft();
    setShowEditor(true);
  };

  const openEditModal = (row) => {
    setEditingId(row._id);
    setDraft({
      title: row.title || '',
      shortDescription: row.shortDescription || '',
      fullDescription: row.fullDescription || '',
      organizationName: row.organizationName || '',
      category: row.category || 'General',
      location: row.location || '',
      instructions: row.instructions || '',
      eligibility: row.eligibility || '',
      openingDate: row.openingDate ? new Date(row.openingDate).toISOString().slice(0, 10) : '',
      closingDate: row.closingDate ? new Date(row.closingDate).toISOString().slice(0, 10) : '',
      selectionDate: row.selectionDate ? new Date(row.selectionDate).toISOString().slice(0, 10) : '',
    });
    setReuseFormId('');
    setShowEditor(true);
  };

  const updateDraft = (field, value) => {
    setDraft((current) => ({ ...current, [field]: value }));
  };

  const load = () =>
    api
      .get('/concours/partner/concours')
      .then((res) => setRows(res.data.concours || []))
      .catch((error) => setMessage(error.response?.data?.message || 'Unable to load concours.'));

  useEffect(() => {
    load();
  }, []);

  const submitDraft = async (event) => {
    event.preventDefault();

    if (!draft.title.trim() || !draft.organizationName.trim() || !draft.shortDescription.trim() || !draft.fullDescription.trim()) {
      showToast('Title, organization, and description are required before creating a concours.', 'warning');
      return;
    }

    if (!draft.openingDate || !draft.closingDate) {
      showToast('Opening and closing dates are required.', 'warning');
      return;
    }

    const openingDate = new Date(draft.openingDate);
    const closingDate = new Date(draft.closingDate);
    if (Number.isNaN(openingDate.getTime()) || Number.isNaN(closingDate.getTime()) || closingDate <= openingDate) {
      showToast('Closing date must be later than the opening date.', 'warning');
      return;
    }

    const selectedForm = reuseFormId ? rows.find((row) => row._id === reuseFormId)?.applicationForm : null;
    const payload = {
      ...draft,
      openingDate: openingDate.toISOString(),
      closingDate: closingDate.toISOString(),
      selectionDate: draft.selectionDate ? new Date(draft.selectionDate).toISOString() : null,
      title: draft.title.trim(),
      shortDescription: draft.shortDescription.trim(),
      fullDescription: draft.fullDescription.trim(),
      organizationName: draft.organizationName.trim(),
      category: draft.category.trim() || 'General',
      instructions: draft.instructions.trim(),
      eligibility: draft.eligibility.trim(),
      location: draft.location.trim(),
      applicationForm: selectedForm && selectedForm.fields?.length ? { ...selectedForm, published: false } : undefined,
    };

    if (payload.applicationForm) {
      delete payload.applicationForm.publishedAt;
    }

    setIsSubmitting(true);
    try {
      if (editingId) {
        await api.put(`/concours/partner/concours/${editingId}`, payload);
        showToast('Concours updated successfully.', 'success');
      } else {
        await api.post('/concours/partner/concours', payload);
        showToast('Concours draft created successfully.', 'success');
      }
      setShowEditor(false);
      resetDraft();
      setMessage('');
      load();
    } catch (error) {
      const errMessage = error.response?.data?.message || 'Unable to save concours.';
      setMessage(errMessage);
      showToast(errMessage, 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestUnpublish = async (id) => {
    try {
      await api.post(`/concours/partner/concours/${id}/unpublish-request`);
      showToast('Unpublish request sent to the developer team.', 'success');
    } catch (error) {
      showToast(error.response?.data?.message || 'Unable to send unpublish request.', 'error');
    }
  };

  const reuseFormOptions = rows.filter((row) => row.applicationForm?.fields?.length);

  return (
    <div className={styles.concoursList}>
      <div className={styles.concoursListHeader}>
        <h1 className={styles.concoursListTitle}>My Concours</h1>
        <p className={styles.concoursListSubtitle}>
          Create, manage, and publish concours opportunities for your organization.
        </p>
      </div>

      <button type="button" className={styles.concoursCreateBtn} onClick={openCreateModal}>
        + Create concours
      </button>

      {message && <div className={styles.formMessage}>{message}</div>}

      {showEditor && (
        <div className={`${styles.paymentModalBackdrop} ${styles.concoursEditorBackdrop}`} onClick={() => setShowEditor(false)}>
          <div className={`${styles.paymentModal} ${styles.concoursEditorModal}`} onClick={(event) => event.stopPropagation()}>
            <h2>{editingId ? 'Edit concours' : 'Create new concours'}</h2>
            <p>Set the details for your opportunity before you publish it.</p>

            <form onSubmit={submitDraft}>
              <div className={styles.formField}>
                <label className={styles.formFieldLabel}>Title</label>
                <input className={styles.formFieldInput} value={draft.title} onChange={(event) => updateDraft('title', event.target.value)} placeholder="e.g. 2026 Leadership Scholarship" required />
              </div>

              <div className={styles.formField}>
                <label className={styles.formFieldLabel}>Organization</label>
                <input className={styles.formFieldInput} value={draft.organizationName} onChange={(event) => updateDraft('organizationName', event.target.value)} placeholder="Your organization or team" required />
              </div>

              <div className={styles.formField}>
                <label className={styles.formFieldLabel}>Category</label>
                <input className={styles.formFieldInput} value={draft.category} onChange={(event) => updateDraft('category', event.target.value)} placeholder="General" />
              </div>

              <div className={styles.formField}>
                <label className={styles.formFieldLabel}>Location</label>
                <input className={styles.formFieldInput} value={draft.location} onChange={(event) => updateDraft('location', event.target.value)} placeholder="Remote or city name" />
              </div>

              <div className={styles.formField}>
                <label className={styles.formFieldLabel}>Short description</label>
                <textarea className={styles.formFieldTextarea} value={draft.shortDescription} onChange={(event) => updateDraft('shortDescription', event.target.value)} rows={3} required />
              </div>

              <div className={styles.formField}>
                <label className={styles.formFieldLabel}>Full description</label>
                <textarea className={styles.formFieldTextarea} value={draft.fullDescription} onChange={(event) => updateDraft('fullDescription', event.target.value)} rows={5} required />
              </div>

              <div className={styles.formField}>
                <label className={styles.formFieldLabel}>Eligibility requirements</label>
                <textarea className={styles.formFieldTextarea} value={draft.eligibility} onChange={(event) => updateDraft('eligibility', event.target.value)} rows={4} placeholder="Describe eligibility, qualifications and requirements" />
              </div>

              <div className={styles.formField}>
                <label className={styles.formFieldLabel}>Instructions / notes for applicants</label>
                <textarea className={styles.formFieldTextarea} value={draft.instructions} onChange={(event) => updateDraft('instructions', event.target.value)} rows={4} placeholder="Submission notes, deadlines or documents to prepare" />
              </div>

              <div className={styles.formField}>
                <label className={styles.formFieldLabel}>Opening date</label>
                <input className={styles.formFieldInput} type="date" value={draft.openingDate} onChange={(event) => updateDraft('openingDate', event.target.value)} required />
              </div>

              <div className={styles.formField}>
                <label className={styles.formFieldLabel}>Closing date</label>
                <input className={styles.formFieldInput} type="date" value={draft.closingDate} onChange={(event) => updateDraft('closingDate', event.target.value)} required />
              </div>

              <div className={styles.formField}>
                <label className={styles.formFieldLabel}>Selection date (optional)</label>
                <input className={styles.formFieldInput} type="date" value={draft.selectionDate} onChange={(event) => updateDraft('selectionDate', event.target.value)} />
              </div>

              {!editingId && reuseFormOptions.length > 0 && (
                <div className={styles.formField}>
                  <label className={styles.formFieldLabel}>Reuse an existing form template</label>
                  <select className={styles.formFieldSelect} value={reuseFormId} onChange={(event) => setReuseFormId(event.target.value)}>
                    <option value="">Start with a blank form</option>
                    {reuseFormOptions.map((row) => (
                      <option key={row._id} value={row._id}>{row.title}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className={styles.paymentModalActions}>
                <button type="button" className={styles.paymentCancelButton} onClick={() => setShowEditor(false)}>
                  Cancel
                </button>
                <button type="submit" className={styles.partnershipButton} disabled={isSubmitting}>
                  {isSubmitting ? 'Saving...' : editingId ? 'Save changes' : 'Create draft'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {rows.length > 0 ? (
        <div>
          {rows.map((row) => (
            <article key={row._id} className={styles.concoursItem}>
              <h2 className={styles.concoursItemTitle}>{row.title}</h2>
              <div className={styles.concoursItemMeta}>
                <span className={styles.concoursItemStatus}>{row.status}</span>
                <span>{row.closingDate ? `Closes ${new Date(row.closingDate).toLocaleDateString()}` : 'No closing date yet'}</span>
              </div>
              <div className={styles.concoursItemActions}>
                <button type="button" className={styles.concoursEditLink} onClick={() => openEditModal(row)}>
                  Edit details
                </button>
                <Link to={`/partner/concours/${row._id}/form`} className={styles.concoursEditLink}>
                  Edit application form
                </Link>
                {row.status === 'published' && <button type="button" className={styles.concoursEditLink} onClick={() => requestUnpublish(row._id)}>Request unpublish</button>}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyStateTitle}>No concours yet</div>
          <p className={styles.emptyStateMessage}>
            Create a new concours with title, dates, description, and eligibility details before publishing it.
          </p>
        </div>
      )}

    </div>
  );
}
