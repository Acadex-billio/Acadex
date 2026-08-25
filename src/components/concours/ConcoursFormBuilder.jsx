import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { showToast } from '../../utility/ToastNotification';
import styles from '../../Astyles/ConcoursPartner.module.css';

const TYPES = ['short_text', 'long_text', 'email', 'phone', 'number', 'date', 'select', 'radio', 'checkbox', 'multi_select', 'file', 'section'];
const PROFILE_KEYS = [
  { value: '', label: 'No ACADEX profile mapping' },
  { value: 'name', label: 'Candidate name' },
  { value: 'email', label: 'Candidate email' },
  { value: 'phone', label: 'Candidate phone' },
  { value: 'program', label: 'Candidate program' },
  { value: 'address', label: 'Candidate address' },
  { value: 'profile_picture', label: 'Candidate profile picture' },
];

export default function ConcoursFormBuilder({ concoursId, initialForm = {} }) {
  const params = useParams();
  const { user } = useAuth();
  const targetConcoursId = concoursId || params.id;
  const [fields, setFields] = useState(initialForm.fields || []);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [publishing, setPublishing] = useState(false);

  useEffect(() => {
    if (!targetConcoursId || initialForm.fields?.length) return;
    api
      .get(`/concours/partner/concours/${targetConcoursId}`)
      .then((res) => setFields(res.data.concours?.applicationForm?.fields || []))
      .catch(() => setMessage('Unable to load the existing form.'));
  }, [targetConcoursId, initialForm.fields]);

  const addField = () =>
    setFields((current) => [
      ...current,
      { id: `field_${Date.now()}`, type: 'short_text', label: 'New question', required: false, options: [], conditions: [] },
    ]);

  const update = (index, patch) =>
    setFields((current) => current.map((field, fieldIndex) => (fieldIndex === index ? { ...field, ...patch } : field)));

  const remove = (index) => setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index));

  const move = (index, offset) =>
    setFields((current) => {
      const next = [...current];
      const target = index + offset;
      if (target < 0 || target >= next.length) return next;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  const save = async () => {
    setSaving(true);
    setMessage('');
    try {
      const fieldsToSave = fields.map((field) => ({
        ...field,
        profileKey: field.profileKey || null,
        options: (field.options || [])
          .map((option) => String(option).trim())
          .filter(Boolean),
      }));
      await api.put(`/concours/partner/concours/${targetConcoursId}/form`, { fields: fieldsToSave });
      const successMessage = 'Application form saved successfully.';
      setMessage(successMessage);
      showToast(successMessage, 'success');
    } catch (error) {
      const errMessage = error.response?.data?.message || 'Unable to save form.';
      setMessage(errMessage);
      showToast(errMessage, 'error');
    } finally {
      setSaving(false);
    }
  };

  const publishForm = async () => {
    setPublishing(true);
    try {
      await api.post(`/concours/partner/concours/${targetConcoursId}/form/publish`);
      showToast('Application form published.', 'success');
    } catch (error) {
      showToast(error.response?.data?.message || 'Unable to publish application form.', 'error');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className={styles.formBuilder}>
      <div className={styles.formBuilderHeader}>
        <h1 className={styles.formBuilderTitle}>Application Form Builder</h1>
        <p className={styles.formBuilderDescription}>
          Design your application form. Fields are validated before saving.
        </p>
      </div>

      {fields.map((field, index) => (
        <section key={field.id} className={styles.formFieldContainer}>
          <div className={styles.formFieldActions}>
            <button
              type="button"
              className={styles.formFieldActionBtn}
              onClick={() => move(index, -1)}
              aria-label="Move field up"
            >
              ↑ Up
            </button>
            <button
              type="button"
              className={styles.formFieldActionBtn}
              onClick={() => move(index, 1)}
              aria-label="Move field down"
            >
              ↓ Down
            </button>
            <button
              type="button"
              className={styles.formFieldActionBtn}
              onClick={() => remove(index)}
              style={{ borderColor: '#e91e63', color: '#b0003a' }}
            >
              Remove
            </button>
          </div>

          <div className={styles.formField}>
            <label className={styles.formFieldLabel}>Field Type</label>
            <select
              className={styles.formFieldSelect}
              value={field.type}
              onChange={(e) => update(index, { type: e.target.value })}
            >
              {TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace('_', ' ')}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.formField}>
            <label className={styles.formFieldLabel}>Question Label</label>
            <input
              className={styles.formFieldInput}
              value={field.label}
              onChange={(e) => update(index, { label: e.target.value })}
              placeholder="Enter question text"
            />
          </div>

          <div className={styles.formFieldCheckbox}>
            <input
              type="checkbox"
              id={`required-${field.id}`}
              className={styles.formFieldCheckboxInput}
              checked={Boolean(field.required)}
              onChange={(e) => update(index, { required: e.target.checked })}
            />
            <label htmlFor={`required-${field.id}`} className={styles.formFieldLabel}>
              Required field
            </label>
          </div>

          <div className={styles.formField}>
            <label className={styles.formFieldLabel}>Use candidate data on ACADEX</label>
            <select
              className={styles.formFieldSelect}
              value={field.profileKey || ''}
              onChange={(e) => update(index, { profileKey: e.target.value || null })}
            >
              {PROFILE_KEYS.map((item) => (
                <option key={item.value || 'none'} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>

          {['select', 'radio', 'multi_select'].includes(field.type) && (
            <div className={styles.formField}>
              <label className={styles.formFieldLabel}>Options (one per line)</label>
              <textarea
                className={styles.formFieldTextarea}
                value={(field.options || []).join('\n')}
                onChange={(e) =>
                  update(index, { options: e.target.value.split(/\r?\n/).map((v) => v.trim()) })
                }
                placeholder="Option 1&#10;Option 2&#10;Option 3"
              />
            </div>
          )}
        </section>
      ))}

      <div className={styles.formBuilderActions}>
        <button type="button" className={styles.formAddFieldBtn} onClick={addField}>
          + Add Field
        </button>
        {fields.length > 0 && (
          <button type="button" className={styles.formSaveBtn} onClick={save} disabled={saving}>
            {saving ? 'Saving...' : 'Save Form'}
          </button>
        )}
        {fields.length > 0 && ['developer'].includes(String(user?.role || '').toLowerCase()) && (
          <button type="button" className={styles.formSaveBtn} onClick={publishForm} disabled={saving || publishing}>
            {publishing ? 'Publishing...' : 'Publish Form'}
          </button>
        )}
      </div>

      {message && <div className={styles.formMessage}>{message}</div>}
    </div>
  );
}
