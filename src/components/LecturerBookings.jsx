import React, { useEffect, useCallback, useState } from 'react';
import {
  FaCalendarCheck, FaComments, FaVideo,
  FaCheck, FaBan, FaClock, FaLock, FaIdCard,
  FaPaperPlane,
} from 'react-icons/fa';
import { Link } from 'react-router-dom';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import styles from '../Astyles/lecturerPortal.module.css';
import { showToast } from '../utility/ToastNotification';
import BookingVideoConferenceModal from './BookingVideoConferenceModal';
import { maskCandidateId } from '../utility/maskCandidateId';

const STATUS_COLOR = {
  requested: '#d97706', accepted: '#2563eb', scheduled: '#7c3aed',
  completed: '#16a34a', rejected: '#dc2626', cancelled: '#6b7280',
};

const LecturerBookings = () => {
  const { user } = useAuth();
  const isPending = String(user?.account_status || 'active') !== 'active';
  const [bookings, setBookings] = useState([]);
  const [messagesByBooking, setMessagesByBooking] = useState({});
  const [draftByBooking, setDraftByBooking] = useState({});
  const [meetingLinkByBooking, setMeetingLinkByBooking] = useState({});
  const [activeConference, setActiveConference] = useState(null);
  const [openChatId, setOpenChatId] = useState(null);

  const loadBookings = useCallback(async () => {
    try {
      const res = await api.get('/lecturers/me/bookings');
      setBookings(Array.isArray(res.data?.bookings) ? res.data.bookings : []);
    } catch (err) {
      showToast('Unable to load bookings', 'error');
    }
  }, []);

  useEffect(() => {
    if (!isPending) loadBookings();
  }, [isPending, loadBookings]);

  const updateStatus = async (bookingId, status) => {
    try {
      await api.put(`/lecturers/me/bookings/${encodeURIComponent(bookingId)}/status`, {
        status,
        meeting_link: meetingLinkByBooking[bookingId] || '',
      });
      showToast('Booking updated.', 'success');
      await loadBookings();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to update booking.', 'error');
    }
  };

  const loadMessages = async (bookingId) => {
    try {
      const res = await api.get(`/lecturers/bookings/${encodeURIComponent(bookingId)}/messages`);
      setMessagesByBooking((prev) => ({ ...prev, [bookingId]: res.data?.messages || [] }));
    } catch (err) {
      showToast('Unable to load conversation', 'error');
    }
  };

  const toggleChat = async (bookingId) => {
    if (openChatId === bookingId) { setOpenChatId(null); return; }
    setOpenChatId(bookingId);
    await loadMessages(bookingId);
  };

  const sendMessage = async (bookingId) => {
    const text = String(draftByBooking[bookingId] || '').trim();
    if (!text) return;
    try {
      await api.post(`/lecturers/bookings/${encodeURIComponent(bookingId)}/messages`, { message: text });
      setDraftByBooking((prev) => ({ ...prev, [bookingId]: '' }));
      await loadMessages(bookingId);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to send message.', 'error');
    }
  };

  const simulateChat = async (bookingId) => {
    try {
      const res = await api.post(`/lecturers/bookings/${encodeURIComponent(bookingId)}/messages/simulate`);
      if (Array.isArray(res.data?.messages)) {
        setMessagesByBooking((prev) => ({ ...prev, [bookingId]: res.data.messages }));
      }
      showToast(res.data?.message || 'Chat simulation completed.', 'success');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to simulate conversation.', 'error');
    }
  };

  const openConference = async (bookingId) => {
    try {
      const res = await api.get(`/lecturers/bookings/${encodeURIComponent(bookingId)}/video/access`);
      const conf = res.data?.conference;
      if (!conf?.livekit_url || !conf?.livekit_token) {
        showToast('Live video service is not configured yet.', 'error');
        return;
      }
      setActiveConference({
        roomName: conf.room_name,
        serverUrl: conf.livekit_url,
        accessToken: conf.livekit_token,
        minutesLeft: conf.minutes_left,
        subtitle: conf.conference_live ? 'Session is live' : 'Session room ready',
      });
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to open conference.', 'error');
    }
  };

  const startConference = async (bookingId) => {
    try {
      await api.post(`/lecturers/bookings/${encodeURIComponent(bookingId)}/video/start`);
      showToast('Conference started. Invited candidates were notified.', 'success');
      await loadBookings();
      await openConference(bookingId);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to start conference.', 'error');
    }
  };

  if (isPending) {
    return (
      <div className={styles.page}>
        <div className={styles.lockScreen}>
          <FaLock className={styles.lockIcon2} />
          <h2 className={styles.lockTitle}>Bookings Locked</h2>
          <p className={styles.lockDesc}>
            Your account must be verified and approved before you can receive bookings.
          </p>
          <Link className={styles.button} to="/lecturer/profile-verification">
            <FaIdCard /> Complete Verification Profile
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {activeConference ? (
        <BookingVideoConferenceModal
          roomName={activeConference.roomName}
          serverUrl={activeConference.serverUrl}
          accessToken={activeConference.accessToken}
          displayName={user?.name || 'Lecturer'}
          email={user?.email || ''}
          title="Live Video Session"
          subtitle={activeConference.subtitle}
          minutesLeft={activeConference.minutesLeft}
          onClose={() => setActiveConference(null)}
        />
      ) : null}

      <div className={styles.header}>
        <div>
          <div className={styles.title}>Tutorship Bookings</div>
          <div className={styles.subtitle}>Manage incoming requests, schedule sessions, and launch video calls.</div>
        </div>
      </div>

      {bookings.length === 0 && (
        <div className={styles.emptyState}>
          <FaCalendarCheck className={styles.emptyIcon} />
          <p>No bookings yet. Students will appear here once they book a session with you.</p>
        </div>
      )}

      <div className={styles.bookingList}>
        {bookings.map((booking) => {
          const statusColor = STATUS_COLOR[booking.status] || '#475569';
          const canVideo = ['accepted', 'scheduled'].includes(booking.status);
          const chatOpen = openChatId === booking.id;

          return (
            <div className={styles.bookingCard} key={booking.id}>
              <div className={styles.bookingCardTop}>
                <div className={styles.bookingTopic}>{booking.topic}</div>
                <span className={styles.bookingStatus} style={{ color: statusColor, borderColor: statusColor }}>
                  {booking.status?.toUpperCase()}
                </span>
              </div>

              <div className={styles.bookingMeta}>
                <span>Student: <strong>{maskCandidateId(booking.candidate_cand_id)}</strong></span>
                <span>Service: <strong>{booking.booking_type === 'video_conference' ? 'Video Conference' : 'Tutorship'}</strong></span>
                <span>Payment: <strong>{booking.payment_status}</strong></span>
                <span><FaClock /> {new Date(booking.scheduled_for).toLocaleString()} ({booking.duration_minutes} min)</span>
                <span>Your share: <strong>{Number(booking.lecturer_share || 0).toFixed(0)} {booking.currency || 'XAF'}</strong></span>
                <span>Contract: <strong>{booking.contract_sealed ? 'Sealed' : 'Open'}</strong></span>
                <span>Conference: <strong>{booking.conference_live ? 'Live now' : 'Offline'}</strong></span>
              </div>

              <div className={styles.bookingActions}>
                {booking.status === 'requested' && (
                  <>
                    <button className={`${styles.actionBtn} ${styles.actionAccept}`} onClick={() => updateStatus(booking.id, 'accepted')}>
                      <FaCheck /> Accept
                    </button>
                    <button className={`${styles.actionBtn} ${styles.actionReject}`} onClick={() => updateStatus(booking.id, 'rejected')}>
                      <FaBan /> Reject
                    </button>
                  </>
                )}
                {booking.status === 'accepted' && (
                  <button className={`${styles.actionBtn} ${styles.actionSchedule}`} onClick={() => updateStatus(booking.id, 'scheduled')}>
                    <FaCalendarCheck /> Mark Scheduled
                  </button>
                )}
                {booking.status === 'scheduled' && (
                  <button className={`${styles.actionBtn} ${styles.actionComplete}`} onClick={() => updateStatus(booking.id, 'completed')}>
                    <FaCheck /> Mark Completed
                  </button>
                )}
                {canVideo && (
                  <button className={`${styles.actionBtn} ${styles.actionVideo}`} onClick={() => openConference(booking.id)} disabled={!booking.contract_sealed || booking.session_mode !== 'video'}>
                    <FaVideo /> Join Video Session
                  </button>
                )}
                {canVideo && (
                  <button className={`${styles.actionBtn} ${styles.actionSchedule}`} onClick={() => startConference(booking.id)} disabled={!booking.contract_sealed || booking.session_mode !== 'video'}>
                    <FaVideo /> Start Session + Notify
                  </button>
                )}
                <button className={`${styles.actionBtn} ${styles.actionChat}`} onClick={() => toggleChat(booking.id)} disabled={!booking.contract_sealed}>
                  <FaComments /> {chatOpen ? 'Close Chat' : 'Open Chat'}
                </button>
                <button className={`${styles.actionBtn} ${styles.actionSchedule}`} onClick={() => simulateChat(booking.id)} disabled={!booking.contract_sealed}>
                  <FaComments /> Simulate Chat
                </button>
              </div>

              {/* Meeting link input */}
              <div className={styles.meetingRow}>
                <input
                  className={styles.input}
                  placeholder="Custom meeting link (optional)"
                  value={meetingLinkByBooking[booking.id] ?? (booking.meeting_link || '')}
                  onChange={(e) => setMeetingLinkByBooking((prev) => ({ ...prev, [booking.id]: e.target.value }))}
                />
              </div>

              {/* Inline chat panel */}
              {chatOpen && (
                <div className={styles.chatPanel}>
                  <div className={styles.chatMessages}>
                    {(messagesByBooking[booking.id] || []).map((msg) => (
                      <div
                        key={msg._id}
                        className={`${styles.chatMsg} ${msg.sender_role === 'lecturer' ? styles.chatMsgSelf : styles.chatMsgOther}`}
                      >
                        <span className={styles.chatSender}>{msg.sender_role === 'lecturer' ? 'You' : 'Student'}</span>
                        <span className={styles.chatText}>{msg.message}</span>
                      </div>
                    ))}
                    {!(messagesByBooking[booking.id]?.length) && (
                      <p className={styles.chatEmpty}>No messages yet. Start the conversation.</p>
                    )}
                  </div>
                  <div className={styles.chatInputRow}>
                    <input
                      className={styles.input}
                      placeholder="Type a message..."
                      value={draftByBooking[booking.id] || ''}
                      onChange={(e) => setDraftByBooking((prev) => ({ ...prev, [booking.id]: e.target.value }))}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(booking.id); }}}
                    />
                    <button className={`${styles.actionBtn} ${styles.actionAccept}`} onClick={() => sendMessage(booking.id)}>
                      <FaPaperPlane />
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default LecturerBookings;
