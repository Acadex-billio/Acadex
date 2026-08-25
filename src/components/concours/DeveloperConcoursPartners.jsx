import React, { useEffect, useState } from 'react';
import api from '../../services/api';
import styles from '../../Astyles/Concours.module.css';

const initialForm = { organizationName: '', contactPerson: '', email: '', phone: '', address: '', website: '', description: '' };

export default function DeveloperConcoursPartners() {
  const [partners, setPartners] = useState([]);
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState(null);
  const [admins, setAdmins] = useState([]);

  const load = async () => {
    try {
      const response = await api.get('/concours/developer/partners');
      setPartners(response.data.partners || []);
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to load concours partners.');
    }
  };

  useEffect(() => { load(); api.get('/admin/users', { params: { role: 'admin', limit: 100 } }).then((response) => setAdmins(response.data.users || [])).catch(() => {}); }, []);

  const updateField = (event) => setForm((current) => ({ ...current, [event.target.name]: event.target.value }));

  const createPartner = async (event) => {
    event.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      await api.post('/concours/developer/partners', form);
      setForm(initialForm);
      setShowCreate(false);
      setMessage('Partner created. Agreement and login instructions were sent by email.');
      await load();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to create partner.');
    } finally {
      setSaving(false);
    }
  };

  const setPartnerStatus = async (id, status) => {
    try {
      await api.patch(`/concours/developer/partners/${id}/status`, { status });
      await load();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update partner status.');
    }
  };

  const editPartner = async (event) => {
    event.preventDefault();
    try {
      await api.put(`/concours/developer/partners/${editing._id}`, form);
      setEditing(null);
      setForm(initialForm);
      await load();
    } catch (error) {
      setMessage(error.response?.data?.message || 'Unable to update partner.');
    }
  };

  const openEdit = (partner) => {
    setEditing(partner);
    setForm({ organizationName: partner.organization?.name || '', contactPerson: partner.organization?.contact_person || partner.name || '', email: partner.email || '', phone: partner.phone || '', address: partner.address || '', website: partner.organization?.website || '', description: partner.organization?.description || '' });
  };

  const assignAdmin = async (partnerId, adminCandId) => { if (!adminCandId) return; try { await api.put(`/concours/developer/partners/${partnerId}/assign-admin`, { adminCandId, active: true }); setMessage('Admin assignment saved.'); } catch (error) { setMessage(error.response?.data?.message || 'Unable to assign admin.'); } };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div><div className={styles.eyebrow}>Developer administration</div><h1 className={styles.title}>Concours Partners</h1><p className={styles.subtitle}>Create, activate, assign, and oversee partner organizations.</p></div>
      </header>
      <div className={styles.actions}><button className={styles.button} type="button" onClick={() => setShowCreate(true)}>Create partner</button></div>
      {(showCreate || editing) ? <section className={styles.modalBackdrop} role="presentation"><div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="partner-dialog-title"><button className={styles.modalClose} type="button" onClick={() => { setShowCreate(false); setEditing(null); }}>Close</button><h2 id="partner-dialog-title" className={styles.cardTitle}>{editing ? 'Edit partner' : 'Create partner account'}</h2><form onSubmit={editing ? editPartner : createPartner} className={styles.formGrid}>
          {Object.keys(initialForm).map((field) => <label key={field} className={styles.formLabel}>{field.replace(/([A-Z])/g, ' $1').replace(/^./, (value) => value.toUpperCase())}<input className={styles.input} name={field} type={field === 'email' ? 'email' : 'text'} value={form[field]} onChange={updateField} required={['organizationName', 'contactPerson', 'email', 'phone'].includes(field)} /></label>)}
          <div className={styles.formActions}><button className={styles.button} type="submit" disabled={saving}>{saving ? 'Creating...' : 'Create partner'}</button></div>
        </form></div></section> : null}
      {message ? <p role="status">{message}</p> : null}
      <div className={styles.grid}>{partners.map((partner) => <article key={partner._id} className={styles.card}><div className={styles.cardMeta}>{partner.email}</div><h2 className={styles.cardTitle}>{partner.organization?.name || partner.name}</h2><span className={styles.status}>{String(partner.partnership?.status || 'created').replace(/_/g, ' ')}</span><label className={styles.formLabel}>Assign admin<select className={styles.input} defaultValue="" onChange={(event) => assignAdmin(partner._id, event.target.value)}><option value="">Choose an admin</option>{admins.map((admin) => <option key={admin.cand_id || admin._id} value={admin.cand_id}>{admin.name || admin.email}</option>)}</select></label><div className={styles.actions}><button className={styles.button} type="button" onClick={() => openEdit(partner)}>Edit</button><button className={styles.button} type="button" onClick={() => setPartnerStatus(partner._id, 'active')}>Activate</button><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => setPartnerStatus(partner._id, 'suspended')}>Suspend</button><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => setPartnerStatus(partner._id, 'terminated')}>Terminate</button><button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => setPartnerStatus(partner._id, 'expired')}>Expire</button></div></article>)}</div>
      {!partners.length ? <p className={styles.empty}>No concours partners found.</p> : null}
    </div>
  );
}
