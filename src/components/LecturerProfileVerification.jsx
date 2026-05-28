import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  FaIdCard, FaMapMarkerAlt, FaGraduationCap, FaUpload,
  FaCheckCircle, FaTimesCircle, FaClock, FaUser, FaBriefcase,
  FaLink, FaVideo, FaComments, FaStar, FaCamera, FaRedo,
} from 'react-icons/fa';
import api from '../services/api';
import styles from '../Astyles/lecturerPortal.module.css';
import { showToast } from '../utility/ToastNotification';

const QUALIFICATIONS = ['HND', 'BTS', "Bachelor's Degree", "Master's Degree", 'PhD', 'Professional Certificate', 'Other'];
const REGIONS = [
  'Adamawa', 'Centre', 'East', 'Far North', 'Littoral',
  'North', 'North West', 'South', 'South West', 'West',
];

const asTextBlock = (value) => (Array.isArray(value) ? value.join('\n') : '');

const statusConfig = {
  approved: { color: '#16a34a', bg: '#dcfce7', icon: FaCheckCircle, label: 'APPROVED' },
  rejected: { color: '#dc2626', bg: '#fee2e2', icon: FaTimesCircle, label: 'REJECTED' },
  pending:  { color: '#d97706', bg: '#fef3c7', icon: FaClock,      label: 'PENDING REVIEW' },
};

const DOC_REVIEW_LABELS = {
  id_card_front: 'ID Card Front',
  id_card_back: 'ID Card Back',
  certificate_scan: 'Certificate Scan',
};

const CameraCaptureModal = ({ label, busy, error, onCapture, onCancel }) => {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const [starting, setStarting] = useState(true);

  useEffect(() => {
    let active = true;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
      } catch (_) {
        showToast('Camera access failed. Allow camera permission and try again.', 'error');
      } finally {
        if (active) setStarting(false);
      }
    };

    if (!navigator.mediaDevices?.getUserMedia) {
      showToast('Camera capture is not supported in this browser.', 'error');
      setStarting(false);
      return () => {};
    }

    start();

    return () => {
      active = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  const capture = async () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth || !video.videoHeight) {
      showToast('Camera is not ready yet. Please wait a moment.', 'warning');
      return;
    }

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          showToast('Failed to capture image. Try again.', 'error');
          return;
        }
        await onCapture(blob);
      },
      'image/jpeg',
      0.92
    );
  };

  return (
    <div className={styles.cameraOverlay}>
      <div className={styles.cameraModal}>
        <div className={styles.cameraHeader}>
          <strong><FaCamera /> Live Scan: {label}</strong>
          <button type="button" className={styles.videoClose} onClick={onCancel}>Close</button>
        </div>
        <div className={styles.cameraBody}>
          <video ref={videoRef} className={styles.cameraPreview} playsInline muted />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
          <div className={styles.cameraHint}>
            Position the document inside the frame and capture.
          </div>
          {error ? <div className={styles.cameraError}>{error}</div> : null}
          <div className={styles.cameraActions}>
            <button type="button" className={styles.buttonAlt} onClick={onCancel} disabled={busy}>Cancel</button>
            <button type="button" className={styles.button} onClick={capture} disabled={busy || starting}>
              <FaCamera /> {busy ? 'Uploading...' : starting ? 'Starting camera...' : 'Capture & Upload'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const DocUploadField = ({ label, icon: Icon, fieldKey, value, onChange }) => {
  const [uploading, setUploading] = useState(false);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const uploadBlob = async (blob) => {
    const file = new File([blob], `${fieldKey}-${Date.now()}.jpg`, { type: 'image/jpeg' });
    setUploading(true);
    setCameraError('');
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('doc_type', fieldKey);
      const res = await api.post('/lecturers/me/upload-doc', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      onChange(res.data?.url || '');
      setCameraOpen(false);
      showToast(`${label} uploaded successfully.`, 'success');
    } catch (err) {
      const message = err?.response?.data?.message || `Failed to upload ${label}.`;
      setCameraError(message);
      showToast(message, 'error');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      {cameraOpen ? (
        <CameraCaptureModal
          label={label}
          busy={uploading}
          error={cameraError}
          onCapture={uploadBlob}
          onCancel={() => {
            if (!uploading) {
              setCameraOpen(false);
              setCameraError('');
            }
          }}
        />
      ) : null}
      <div className={styles.docField}>
        <label className={styles.docLabel}>
          <Icon className={styles.docLabelIcon} /> {label}
        </label>
        <div className={styles.docRow}>
          {value ? (
            <a href={value} target="_blank" rel="noopener noreferrer" className={styles.docPreviewLink}>
              <FaCheckCircle style={{ color: '#16a34a' }} /> View Uploaded File
            </a>
          ) : (
            <span className={styles.docPlaceholder}>No file uploaded</span>
          )}
          <button
            type="button"
            className={styles.docUploadBtn}
            onClick={() => setCameraOpen(true)}
            disabled={uploading}
          >
            {value ? <FaRedo /> : <FaCamera />} {uploading ? 'Uploading...' : value ? 'Rescan' : 'Scan Live'}
          </button>
        </div>
      </div>
    </>
  );
};

const LecturerProfileVerification = () => {
  const profilePictureInputRef = useRef(null);
  const [form, setForm] = useState({
    profile_picture: '',
    full_name: '',
    id_card_number: '',
    region: '',
    highest_qualification: '',
    headline: '',
    bio: '',
    qualifications: '',
    years_experience: 0,
    specialization_tags: '',
    hourly_rate: 5000,
    currency: 'XAF',
    availability_notes: '',
    accepts_video_sessions: true,
    accepts_chat_tutorship: true,
    evidence_links: '',
    id_card_front_url: '',
    id_card_back_url: '',
    certificate_scan_url: '',
  });
  const [approval, setApproval] = useState('pending');
  const [approvalNote, setApprovalNote] = useState('');
  const [docReview, setDocReview] = useState({
    id_card_front: { status: 'pending', note: '' },
    id_card_back: { status: 'pending', note: '' },
    certificate_scan: { status: 'pending', note: '' },
  });
  const [saving, setSaving] = useState(false);
  const [uploadingPicture, setUploadingPicture] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get('/lecturers/me/profile');
        if (!mounted) return;
        const p = res.data?.profile || {};
        setForm({
          profile_picture: res.data?.user?.profile_picture || '',
          full_name: p.full_name || '',
          id_card_number: p.id_card_number || '',
          region: p.region || '',
          highest_qualification: p.highest_qualification || '',
          headline: p.headline || '',
          bio: p.bio || '',
          qualifications: asTextBlock(p.qualifications),
          years_experience: Number(p.years_experience || 0),
          specialization_tags: Array.isArray(p.specialization_tags) ? p.specialization_tags.join(', ') : '',
          hourly_rate: Number(p.hourly_rate || 5000),
          currency: p.currency || 'XAF',
          availability_notes: p.availability_notes || '',
          accepts_video_sessions: p.accepts_video_sessions !== false,
          accepts_chat_tutorship: p.accepts_chat_tutorship !== false,
          evidence_links: asTextBlock(p.evidence_links),
          id_card_front_url: p.id_card_front_url || '',
          id_card_back_url: p.id_card_back_url || '',
          certificate_scan_url: p.certificate_scan_url || '',
        });
        setApproval(String(p.approval_status || 'pending'));
        setApprovalNote(String(p.approval_note || ''));
        setDocReview({
          id_card_front: p.doc_review?.id_card_front || { status: 'pending', note: '' },
          id_card_back: p.doc_review?.id_card_back || { status: 'pending', note: '' },
          certificate_scan: p.doc_review?.certificate_scan || { status: 'pending', note: '' },
        });
      } catch (err) {
        showToast('Unable to load lecturer profile', 'error');
      }
    })();
    return () => { mounted = false; };
  }, []);

  const sc = useMemo(() => statusConfig[approval] || statusConfig.pending, [approval]);
  const StatusIcon = sc.icon;
  const docsUploaded = useMemo(
    () => ['id_card_front_url', 'id_card_back_url', 'certificate_scan_url'].filter((key) => String(form[key] || '').trim()).length,
    [form]
  );
  const docsApproved = useMemo(
    () => Object.values(docReview).filter((item) => String(item?.status || '').toLowerCase() === 'approved').length,
    [docReview]
  );
  const publicProfileReady = useMemo(
    () => Boolean(form.full_name.trim() && form.highest_qualification.trim() && form.headline.trim() && form.bio.trim()),
    [form]
  );

  const set = (key) => (e) => setForm((s) => ({ ...s, [key]: e.target.value }));
  const setCheck = (key) => (e) => setForm((s) => ({ ...s, [key]: e.target.checked }));
  const setUrl = (key) => (url) => setForm((s) => ({ ...s, [key]: url }));

  const uploadProfilePicture = async (file) => {
    if (!file) return;
    setUploadingPicture(true);
    try {
      const data = new FormData();
      data.append('profile_picture', file);
      const res = await api.post('/lecturers/me/profile-picture', data, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      setForm((prev) => ({ ...prev, profile_picture: res.data?.profile_picture || prev.profile_picture }));
      showToast('Profile picture uploaded successfully.', 'success');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to upload profile picture.', 'error');
    } finally {
      setUploadingPicture(false);
      if (profilePictureInputRef.current) profilePictureInputRef.current.value = '';
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!form.full_name.trim()) { showToast('Full name is required.', 'warning'); return; }
    if (!form.id_card_number.trim()) { showToast('ID card number is required.', 'warning'); return; }
    setSaving(true);
    try {
      await api.put('/lecturers/me/profile', form);
      showToast('Documents submitted and under review.', 'success');
      setApproval('pending');
      setApprovalNote('Documents submitted and under review.');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Could not save profile.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.verifyHeader}>
        <div>
          <div className={styles.title}>Profile &amp; Verification</div>
          <div className={styles.subtitle}>Submit your identity and credentials for account activation.</div>
        </div>
        <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>
          <StatusIcon /> {sc.label}
        </span>
      </div>

      {approvalNote && (
        <div className={styles.approvalNote}>
          <strong>Developer note:</strong> {approvalNote}
        </div>
      )}

      {approval === 'pending' && (
        <div className={styles.approvalNote}>
          <strong>Review status:</strong> Your documents are submitted and currently under review.
        </div>
      )}

      <div className={styles.docAdminGrid}>
        {Object.keys(DOC_REVIEW_LABELS).map((docKey) => {
          const review = docReview[docKey] || { status: 'pending', note: '' };
          return (
            <div key={docKey} className={styles.docAdminCard}>
              <div className={styles.rowTitle}>{DOC_REVIEW_LABELS[docKey]}</div>
              <div className={styles.meta}>Status: {review.status || 'pending'}</div>
              {review.note ? <div className={styles.meta}>Note: {review.note}</div> : null}
            </div>
          );
        })}
      </div>

      <div className={styles.grid3}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Documents Uploaded</div>
          <div className={styles.kpiValue}>{docsUploaded}/3</div>
          <div className={styles.meta}>Upload all identity and certificate scans.</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Documents Approved</div>
          <div className={styles.kpiValue}>{docsApproved}/3</div>
          <div className={styles.meta}>Each document is reviewed independently.</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiLabel}>Public Profile</div>
          <div className={styles.kpiValue}>{publicProfileReady ? 'Ready' : 'Draft'}</div>
          <div className={styles.meta}>Candidates will see your profile once verification is approved.</div>
        </div>
      </div>

      <form className={styles.verifyForm} onSubmit={onSubmit}>

        <div className={styles.section}>
          <div className={styles.sectionTitle}><FaCamera /> Profile Picture</div>
          <div className={styles.profilePicturePanel}>
            {form.profile_picture ? (
              <img src={form.profile_picture} alt={form.full_name || 'Lecturer'} className={styles.verifyProfileImage} />
            ) : (
              <div className={styles.verifyProfileFallback}>
                {(form.full_name || 'L').trim().slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className={styles.profilePictureMeta}>
              <div className={styles.rowTitle}>Candidate-facing profile picture</div>
              <div className={styles.meta}>This image appears on the lecturer directory and booking screen after verification.</div>
              <input
                ref={profilePictureInputRef}
                type="file"
                accept=".jpg,.jpeg,.png"
                style={{ display: 'none' }}
                onChange={(e) => uploadProfilePicture(e.target.files?.[0] || null)}
              />
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.button}
                  disabled={uploadingPicture}
                  onClick={() => profilePictureInputRef.current?.click()}
                >
                  <FaUpload /> {uploadingPicture ? 'Uploading...' : form.profile_picture ? 'Replace Picture' : 'Upload Picture'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Section: Identity */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}><FaIdCard /> Identity Information</div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label><FaUser /> Full Legal Name <span className={styles.req}>*</span></label>
              <input className={styles.input} placeholder="As it appears on ID" value={form.full_name} onChange={set('full_name')} required />
            </div>
            <div className={styles.field}>
              <label><FaIdCard /> National ID / Passport Number <span className={styles.req}>*</span></label>
              <input className={styles.input} placeholder="ID card or passport number" value={form.id_card_number} onChange={set('id_card_number')} required />
            </div>
          </div>
          <div className={styles.grid2}>
            <div className={styles.field}>
              <label><FaMapMarkerAlt /> Region</label>
              <select className={styles.select} value={form.region} onChange={set('region')}>
                <option value="">Select region</option>
                {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className={styles.field}>
              <label><FaGraduationCap /> Highest Qualification</label>
              <select className={styles.select} value={form.highest_qualification} onChange={set('highest_qualification')}>
                <option value="">Select qualification</option>
                {QUALIFICATIONS.map((q) => <option key={q} value={q}>{q}</option>)}
              </select>
            </div>
          </div>
        </div>

        {/* Section: Document Uploads */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}><FaUpload /> Document Uploads</div>
          <div className={styles.docGrid}>
            <DocUploadField label="ID Card - Front" icon={FaIdCard} fieldKey="id_card_front" value={form.id_card_front_url} onChange={setUrl('id_card_front_url')} />
            <DocUploadField label="ID Card - Back" icon={FaIdCard} fieldKey="id_card_back" value={form.id_card_back_url} onChange={setUrl('id_card_back_url')} />
            <DocUploadField label="Scanned Certificate" icon={FaGraduationCap} fieldKey="certificate_scan" value={form.certificate_scan_url} onChange={setUrl('certificate_scan_url')} />
          </div>
        </div>

        {/* Section: Public Profile */}
        <div className={styles.section}>
          <div className={styles.sectionTitle}><FaStar /> Public Profile</div>
          <div className={styles.field}>
            <label>Professional Headline</label>
            <input className={styles.input} placeholder="e.g. HND Computer Science Lecturer with 5 years experience" value={form.headline} onChange={set('headline')} />
          </div>
          <div className={styles.field}>
            <label>Bio</label>
            <textarea className={styles.textarea} placeholder="Tell students about yourself..." value={form.bio} onChange={set('bio')} />
          </div>
          <div className={styles.field}>
            <label>Qualifications (one per line)</label>
            <textarea className={styles.textarea} placeholder="HND Computer Science - 2018&#10;Master's in Education - 2021" value={form.qualifications} onChange={set('qualifications')} />
          </div>
          <div className={styles.grid3}>
            <div className={styles.field}>
              <label><FaBriefcase /> Years of Experience</label>
              <input className={styles.input} type="number" min="0" value={form.years_experience} onChange={(e) => setForm((s) => ({ ...s, years_experience: Number(e.target.value || 0) }))} />
            </div>
            <div className={styles.field}>
              <label>Hourly Rate</label>
              <input className={styles.input} type="number" min="0" value={form.hourly_rate} onChange={(e) => setForm((s) => ({ ...s, hourly_rate: Number(e.target.value || 0) }))} />
            </div>
            <div className={styles.field}>
              <label>Currency</label>
              <input className={styles.input} placeholder="XAF" value={form.currency} onChange={set('currency')} />
            </div>
          </div>
          <div className={styles.field}>
            <label>Specialization Tags (comma-separated)</label>
            <input className={styles.input} placeholder="e.g. Programming, Networking, Databases" value={form.specialization_tags} onChange={set('specialization_tags')} />
          </div>
          <div className={styles.field}>
            <label>Availability Notes</label>
            <textarea className={styles.textarea} placeholder="e.g. Available weekday evenings and weekends" value={form.availability_notes} onChange={set('availability_notes')} />
          </div>
          <div className={styles.field}>
            <label><FaLink /> Evidence Links (one per line)</label>
            <textarea className={styles.textarea} placeholder="https://linkedin.com/...&#10;https://github.com/..." value={form.evidence_links} onChange={set('evidence_links')} />
          </div>
          <div className={styles.checkRow}>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={form.accepts_video_sessions} onChange={setCheck('accepts_video_sessions')} />
              <FaVideo /> Accept video sessions
            </label>
            <label className={styles.checkLabel}>
              <input type="checkbox" checked={form.accepts_chat_tutorship} onChange={setCheck('accepts_chat_tutorship')} />
              <FaComments /> Accept chat tutorship
            </label>
          </div>
        </div>

        <button className={styles.submitBtn} type="submit" disabled={saving}>
          {saving ? 'Submitting...' : 'Submit for Approval'}
        </button>
      </form>
    </div>
  );
};

export default LecturerProfileVerification;
