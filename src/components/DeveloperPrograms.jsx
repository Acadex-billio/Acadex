import React, { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/DeveloperPrograms.module.css';

const EMPTY_FORM = {
  code: '',
  name: '',
  abbreviation: '',
  language: 'en',
  department_track: '',
  visibility_group: 'ENGLISH',
  candidate_project_enabled: false,
  candidate_project_target_code: '',
  aliases: '',
  display_order: 0,
};

const DeveloperPrograms = () => {
  const [programs, setPrograms] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingCode, setEditingCode] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadPrograms = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/programs/manage');
      setPrograms(Array.isArray(data?.programs) ? data.programs : []);
    } catch (error) {
      showToast(getErrorMessage(error, 'Unable to load programs.'), 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadPrograms(); }, [loadPrograms]);

  const setField = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const editProgram = (program) => {
    setEditingCode(program.code);
    setForm({
      code: program.code,
      name: program.name || '',
      abbreviation: program.abbreviation || '',
      language: program.language || 'en',
      department_track: program.department_track || '',
      visibility_group: program.visibility_group || '',
      candidate_project_enabled: Boolean(program.candidate_project_enabled),
      candidate_project_target_code: program.candidate_project_target_code || '',
      aliases: (program.aliases || []).join(', '),
      display_order: Number(program.display_order || 0),
    });
  };

  const resetForm = () => {
    setEditingCode('');
    setForm(EMPTY_FORM);
  };

  const saveProgram = async (event) => {
    event.preventDefault();
    const payload = {
      ...form,
      aliases: String(form.aliases || '').split(',').map((alias) => alias.trim()).filter(Boolean),
      candidate_project_target_code: form.candidate_project_target_code || null,
      display_order: Number(form.display_order || 0),
    };

    try {
      setSaving(true);
      if (editingCode) {
        await api.put(`/programs/${encodeURIComponent(editingCode)}`, payload);
        showToast('Program updated.', 'success');
      } else {
        await api.post('/programs', payload);
        showToast('Program created.', 'success');
      }
      resetForm();
      await loadPrograms();
    } catch (error) {
      showToast(getErrorMessage(error, 'Unable to save program.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (program, active) => {
    try {
      if (active) {
        await api.patch(`/programs/${encodeURIComponent(program.code)}/activate`);
      } else {
        await api.delete(`/programs/${encodeURIComponent(program.code)}`);
      }
      showToast(active ? 'Program reactivated.' : 'Program deactivated.', 'success');
      await loadPrograms();
    } catch (error) {
      showToast(getErrorMessage(error, 'Unable to update program status.'), 'error');
    }
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Program Management</h1>
          <p>Programs define registration language, department track, content visibility, and project eligibility.</p>
        </div>
      </header>

      <div className={styles.layout}>
        <section className={styles.panel}>
          <h2>{editingCode ? `Edit ${editingCode}` : 'Add program'}</h2>
          <form className={styles.form} onSubmit={saveProgram}>
            <label className={styles.field}>Program code
              <input value={form.code} onChange={(event) => setField('code', event.target.value.toUpperCase())} disabled={Boolean(editingCode)} required />
            </label>
            <label className={styles.field}>Program name
              <input value={form.name} onChange={(event) => setField('name', event.target.value)} maxLength="100" required />
            </label>
            <label className={styles.field}>Abbreviation
              <input value={form.abbreviation} onChange={(event) => setField('abbreviation', event.target.value.toUpperCase())} maxLength="20" required />
            </label>
            <label className={styles.field}>Default language
              <select value={form.language} onChange={(event) => setField('language', event.target.value)}>
                <option value="en">English</option>
                <option value="fr">French</option>
              </select>
            </label>
            <label className={styles.field}>Department track
              <select value={form.department_track} onChange={(event) => setField('department_track', event.target.value)}>
                <option value="">No department track</option>
                <option value="HND">HND</option>
                <option value="BTS">BTS</option>
              </select>
            </label>
            <label className={styles.field}>Material visibility group
              <input value={form.visibility_group} onChange={(event) => setField('visibility_group', event.target.value.toUpperCase())} maxLength="40" required />
            </label>
            <label className={styles.checkRow}>
              <input type="checkbox" checked={form.candidate_project_enabled} onChange={(event) => setField('candidate_project_enabled', event.target.checked)} />
              Eligible for candidate project submissions
            </label>
            {form.candidate_project_enabled ? (
              <label className={styles.field}>Project target program
                <select value={form.candidate_project_target_code} onChange={(event) => setField('candidate_project_target_code', event.target.value)} required>
                  <option value="">Select target</option>
                  {programs.filter((program) => program.is_active && program.code !== editingCode).map((program) => (
                    <option key={program.code} value={program.code}>{program.name} ({program.code})</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className={styles.field}>Legacy aliases (comma separated)
              <input value={form.aliases} onChange={(event) => setField('aliases', event.target.value.toUpperCase())} placeholder="BACHELORS" />
            </label>
            <label className={styles.field}>Display order
              <input type="number" value={form.display_order} onChange={(event) => setField('display_order', event.target.value)} />
            </label>
            <div className={styles.actions}>
              <button className={styles.button} type="submit" disabled={saving}>{saving ? 'Saving…' : editingCode ? 'Save changes' : 'Create program'}</button>
              {editingCode ? <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={resetForm}>Cancel</button> : null}
            </div>
          </form>
        </section>

        <section className={styles.panel}>
          <h2>Catalog {loading ? '(loading…)' : `(${programs.length})`}</h2>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr><th>Program</th><th>Language</th><th>Track / visibility</th><th>Projects</th><th>Status</th><th>Actions</th></tr></thead>
              <tbody>
                {programs.map((program) => (
                  <tr key={program.code}>
                    <td><strong>{program.name}</strong><br /><span className={styles.muted}>{program.abbreviation} · {program.code}</span></td>
                    <td>{program.language === 'fr' ? 'French' : 'English'}</td>
                    <td>{program.department_track || 'None'} / {program.visibility_group}</td>
                    <td>{program.candidate_project_enabled ? program.candidate_project_target_code || 'Enabled' : 'No'}</td>
                    <td>{program.is_active ? 'Active' : 'Inactive'}</td>
                    <td><div className={styles.actions}>
                      <button className={`${styles.button} ${styles.buttonSecondary}`} type="button" onClick={() => editProgram(program)}>Edit</button>
                      <button className={`${styles.button} ${styles.buttonDanger}`} type="button" onClick={() => setActive(program, program.is_active)}>{program.is_active ? 'Deactivate' : 'Reactivate'}</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
};

export default DeveloperPrograms;