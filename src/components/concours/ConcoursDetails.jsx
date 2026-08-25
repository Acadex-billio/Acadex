import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import api from '../../services/api';
import { showToast } from '../../utility/ToastNotification';
import styles from '../../Astyles/Concours.module.css';

const profileValues = (user) => ({
  name: user?.name || '',
  email: user?.email || '',
  phone: user?.phone || '',
  program: user?.program || '',
  address: user?.address || '',
  profile_picture: user?.profile_picture || '',
});

const valueFor = (answers, field) => answers[field.id] ?? (field.type === 'multi_select' ? [] : '');

export default function ConcoursDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [item, setItem] = useState(null);
  const [answers, setAnswers] = useState({});
  const [files, setFiles] = useState({});
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get(`/concours/${id}`).then((res) => {
      const concours = res.data.concours;
      const profile = profileValues(user);
      const initial = {};
      (concours.applicationForm?.fields || []).forEach((field) => {
        if (field.profileKey && profile[field.profileKey] !== '') initial[field.id] = profile[field.profileKey];
      });
      setItem(concours);
      setAnswers(initial);
    }).catch(() => setMessage('Concours not found.'));
  }, [id, user]);

  const updateAnswer = (field, value) => {
    setAnswers((current) => ({ ...current, [field.id]: value }));
  };

  const updateMultiSelect = (field, option, checked) => {
    const current = Array.isArray(answers[field.id]) ? answers[field.id] : [];
    updateAnswer(field, checked ? [...current, option] : current.filter((value) => value !== option));
  };

  const renderControl = (field) => {
    const value = valueFor(answers, field);
    const common = {
      id: field.id,
      name: field.id,
      required: Boolean(field.required),
      disabled: Boolean(field.profileKey && field.editable === false),
      placeholder: field.placeholder || '',
    };

    if (field.type === 'select') {
      return <select {...common} className={styles.candidateSelect} value={value} onChange={(event) => updateAnswer(field, event.target.value)}><option value="">Select an option</option>{(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}</select>;
    }
    if (field.type === 'radio') {
      return <div className={styles.choiceGroup}>{(field.options || []).map((option) => <label className={styles.choiceOption} key={option}><input type="radio" name={field.id} value={option} checked={value === option} required={Boolean(field.required) && !value} onChange={() => updateAnswer(field, option)} /> <span>{option}</span></label>)}</div>;
    }
    if (field.type === 'checkbox') {
      return <label className={styles.choiceOption}><input type="checkbox" checked={Boolean(value)} onChange={(event) => updateAnswer(field, event.target.checked)} /> <span>{field.placeholder || 'Yes, I agree'}</span></label>;
    }
    if (field.type === 'multi_select') {
      return <div className={styles.choiceGroup}>{(field.options || []).map((option) => <label className={styles.choiceOption} key={option}><input type="checkbox" name={`${field.id}[]`} value={option} checked={Array.isArray(value) && value.includes(option)} onChange={(event) => updateMultiSelect(field, option, event.target.checked)} /> <span>{option}</span></label>)}</div>;
    }
    if (field.type === 'long_text') {
      return <textarea {...common} className={styles.candidateTextarea} rows={5} value={value} onChange={(event) => updateAnswer(field, event.target.value)} />;
    }
    if (field.type === 'file') {
      return <input id={field.id} name={field.id} className={styles.candidateInput} type="file" required={Boolean(field.required)} onChange={(event) => { const file = event.target.files?.[0]; setFiles((current) => ({ ...current, [field.id]: file })); updateAnswer(field, file?.name || ''); }} />;
    }
    const inputType = ['email', 'number', 'date', 'phone'].includes(field.type) ? (field.type === 'phone' ? 'tel' : field.type) : 'text';
    return <input {...common} className={styles.candidateInput} type={inputType} value={value} onChange={(event) => updateAnswer(field, event.target.value)} />;
  };

  const apply = async (event) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const response = await api.post(`/concours/${id}/applications`, { answers });
      const applicationId = response.data.application?._id;
      await Promise.all(Object.entries(files).filter(([, file]) => file && applicationId).map(([fieldId, file]) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fieldId', fieldId);
        return api.post(`/concours/applications/${applicationId}/documents`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      }));
      showToast('Application submitted successfully.', 'success');
      navigate('/candidate/concours/applications');
    } catch (error) {
      const errorMessage = error.response?.data?.message || 'Unable to submit application.';
      setMessage(errorMessage);
      showToast(errorMessage, 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (!item) return <div className={styles.candidateLoading}>{message || 'Loading concours...'}</div>;
  const fields = item.applicationForm?.fields || [];

  return (
    <main className={styles.candidatePage}>
      <div className={styles.candidateHeader}>
        <Link className={styles.backLink} to="/candidate/concours">Back to concours</Link>
        <div className={styles.candidateEyebrow}>{item.category || 'Opportunity'}</div>
        <h1 className={styles.candidateTitle}>{item.title}</h1>
        <p className={styles.candidateMeta}>{item.organizationName}{item.location ? ` · ${item.location}` : ''}</p>
        <div className={styles.dateStrip}><span><strong>Opens</strong>{new Date(item.openingDate).toLocaleDateString()}</span><span><strong>Deadline</strong>{new Date(item.closingDate).toLocaleDateString()}</span>{item.selectionDate ? <span><strong>Selection</strong>{new Date(item.selectionDate).toLocaleDateString()}</span> : null}</div>
      </div>

      <section className={styles.candidateContent}>
        <article className={styles.candidateOverview}>
          <h2>About this opportunity</h2>
          <p className={styles.candidateLead}>{item.shortDescription}</p>
          <p>{item.fullDescription}</p>
          <div className={styles.candidateInfoGrid}><div><h3>Eligibility</h3><p>{item.eligibility || 'See the application requirements below.'}</p></div><div><h3>Instructions</h3><p>{item.instructions || 'Complete all required fields before submitting.'}</p></div></div>
        </article>

        <form className={styles.candidateForm} onSubmit={apply}>
          <div className={styles.candidateFormHeader}><div className={styles.candidateEyebrow}>Application</div><h2>Tell us about yourself</h2><p>Fields marked with <strong>*</strong> are required.</p></div>
          {fields.map((field) => field.type === 'section' ? <div className={styles.candidateSection} key={field.id}><h3>{field.label}</h3>{field.helpText ? <p>{field.helpText}</p> : null}</div> : <div className={styles.candidateField} key={field.id}><label htmlFor={field.id}>{field.label}{field.required ? <span className={styles.requiredMark}> *</span> : null}{field.profileKey ? <small>From your ACADEX profile</small> : null}</label>{renderControl(field)}{field.helpText ? <p className={styles.fieldHelp}>{field.helpText}</p> : null}</div>)}
          {message ? <div className={styles.candidateError} role="alert">{message}</div> : null}
          <button className={styles.candidateSubmit} type="submit" disabled={submitting}>{submitting ? 'Submitting application...' : 'Submit application'}</button>
        </form>
      </section>
    </main>
  );
}
