import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import styles from '../Astyles/lecturerPortal.module.css';
import { showToast } from '../utility/ToastNotification';

const CandidateLecturers = () => {
  const navigate = useNavigate();
  const [lecturers, setLecturers] = useState([]);
  const [selectedLecturer, setSelectedLecturer] = useState(null);
  const [openingLecturerId, setOpeningLecturerId] = useState('');
  const [bookingForm, setBookingForm] = useState({
    topic: '',
    notes: '',
    scheduled_for: '',
    duration_minutes: 60,
    booking_type: 'tutorship',
    session_mode: 'video',
  });

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await api.get('/lecturers/public');
        if (!mounted) return;
        setLecturers(Array.isArray(res.data?.lecturers) ? res.data.lecturers : []);
      } catch (err) {
        showToast('Unable to load lecturers', 'error');
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (bookingForm.booking_type === 'video_conference' && bookingForm.session_mode !== 'video') {
      setBookingForm((prev) => ({ ...prev, session_mode: 'video' }));
    }
  }, [bookingForm.booking_type, bookingForm.session_mode]);

  const updateField = (key, value) => {
    setBookingForm((prev) => ({ ...prev, [key]: value }));
  };

  const openLecturerDetails = async (lecturer) => {
    const lecturerId = String(lecturer?.cand_id || '').trim();
    if (!lecturerId) return;
    setOpeningLecturerId(lecturerId);
    try {
      const res = await api.get(`/lecturers/public/${encodeURIComponent(lecturerId)}`);
      setSelectedLecturer(res.data?.lecturer || lecturer);
    } catch (err) {
      // Fallback to list item so booking is still possible
      setSelectedLecturer(lecturer);
      showToast(err?.response?.data?.message || 'Unable to load full lecturer details.', 'error');
    } finally {
      setOpeningLecturerId('');
    }
  };

  const submitBooking = async () => {
    if (!selectedLecturer?.cand_id) return;
    const payload = {
      ...bookingForm,
      duration_minutes: Math.max(15, Number(bookingForm.duration_minutes || 60)),
    };
    try {
      await api.post(`/lecturers/${encodeURIComponent(selectedLecturer.cand_id)}/bookings`, payload);
      showToast('Booking request sent. Wait for lecturer confirmation before payment.', 'success');
      navigate('/candidate/tutorship-bookings');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to submit booking request.', 'error');
    }
  };

  const estimatedAmount = selectedLecturer
    ? (Number(selectedLecturer.hourly_rate || 0) * (Math.max(15, Number(bookingForm.duration_minutes || 60)) / 60))
    : 0;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Lecturers</div>
          <div className={styles.subtitle}>Browse approved lecturers, check qualifications, and book tutorship sessions.</div>
        </div>
        <button className={styles.buttonAlt} onClick={() => navigate('/candidate/tutorship-bookings')}>My Tutorship Bookings</button>
      </div>

      <div className={styles.list}>
        {lecturers.length === 0 ? (
          <div className={styles.row}>
            <div className={styles.rowTitle}>No approved lecturers available yet</div>
            <div className={styles.meta}>Approved and active lecturer profiles will appear here with qualifications and booking access.</div>
          </div>
        ) : null}
        {lecturers.map((lecturer) => {
          return (
            <div className={styles.row} key={lecturer.cand_id}>
              <div className={styles.inline}>
                {lecturer.profile_picture ? (
                  <img src={lecturer.profile_picture} alt={lecturer.name} className={styles.lecturerAvatar} />
                ) : (
                  <div className={styles.lecturerAvatarFallback}>{(lecturer.name || 'L').slice(0, 1).toUpperCase()}</div>
                )}
                <div>
                  <div className={styles.rowTitle}>{lecturer.name}</div>
                  <div className={styles.meta}>{lecturer.highest_qualification || 'Qualification not specified'}</div>
                </div>
              </div>
              <div className={styles.meta}>{lecturer.headline || 'Lecturer'}</div>
              <div className={styles.meta}>Qualifications: {(lecturer.qualifications || []).join(', ') || 'Not specified'}</div>
              <div className={styles.meta}>Rate: {Number(lecturer.hourly_rate || 0).toFixed(0)} {lecturer.currency || 'XAF'} / hour</div>

              <div className={styles.actions}>
                <button
                  className={styles.button}
                  disabled={openingLecturerId === lecturer.cand_id}
                  onClick={() => openLecturerDetails(lecturer)}
                >
                  {openingLecturerId === lecturer.cand_id ? 'Opening...' : 'View Full Details & Book'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selectedLecturer && (
        <div className={styles.card}>
          <div className={styles.rowTitle}>Book Session With {selectedLecturer.name}</div>
          <div className={styles.meta}>{selectedLecturer.bio || 'No bio provided yet.'}</div>
          <div className={styles.meta}>Availability: {selectedLecturer.availability_notes || 'To be agreed during confirmation.'}</div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <label>Booking Type</label>
              <select className={styles.select} value={bookingForm.booking_type} onChange={(e) => updateField('booking_type', e.target.value)}>
                <option value="tutorship">Tutorship</option>
                <option value="video_conference">Video Conference</option>
              </select>
            </div>
            <div className={styles.field}>
              <label>Delivery Mode</label>
              <select className={styles.select} value={bookingForm.session_mode} onChange={(e) => updateField('session_mode', e.target.value)}>
                <option value="video">Video</option>
                <option value="chat" disabled={bookingForm.booking_type === 'video_conference'}>Chat</option>
              </select>
            </div>
          </div>

          <div className={styles.field}>
            <label>Topic</label>
            <input className={styles.input} placeholder="What do you need help with?" value={bookingForm.topic} onChange={(e) => updateField('topic', e.target.value)} />
          </div>

          <div className={styles.field}>
            <label>Details</label>
            <textarea className={styles.textarea} placeholder="Add details for the lecturer" value={bookingForm.notes} onChange={(e) => updateField('notes', e.target.value)} />
          </div>

          <div className={styles.grid2}>
            <div className={styles.field}>
              <label>Preferred Date & Time</label>
              <input className={styles.input} type="datetime-local" value={bookingForm.scheduled_for} onChange={(e) => updateField('scheduled_for', e.target.value)} />
            </div>
            <div className={styles.field}>
              <label>Duration (minutes)</label>
              <input
                className={styles.input}
                type="number"
                min="15"
                step="15"
                value={bookingForm.duration_minutes}
                onChange={(e) => updateField('duration_minutes', Number(e.target.value || 60))}
              />
            </div>
          </div>

          <div className={styles.approvalNote}>
            <strong>Estimated Price:</strong> {Number(estimatedAmount || 0).toFixed(0)} {selectedLecturer.currency || 'XAF'}
          </div>

          <div className={styles.actions}>
            <button className={styles.button} onClick={submitBooking}>Book Now</button>
            <button className={styles.buttonAlt} onClick={() => setSelectedLecturer(null)}>Close Details</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CandidateLecturers;
