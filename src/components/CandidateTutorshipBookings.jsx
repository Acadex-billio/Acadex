import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FaCheck, FaSearch, FaTimes, FaVideo } from 'react-icons/fa';
import api from '../services/api';
import { startBookingPayment, startInviteAccessPayment } from '../services/paymentFlowService';
import styles from '../Astyles/lecturerPortal.module.css';
import { showToast } from '../utility/ToastNotification';
import { useAuth } from '../context/AuthContext';
import BookingVideoConferenceModal from './BookingVideoConferenceModal';
import { maskCandidateId } from '../utility/maskCandidateId';

const CandidateTutorshipBookings = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [phoneByBooking, setPhoneByBooking] = useState({});
  const [promoByBooking, setPromoByBooking] = useState({});
  const [processingByBooking, setProcessingByBooking] = useState({});
  const [awaitingByBooking, setAwaitingByBooking] = useState({});
  const [messagesByBooking, setMessagesByBooking] = useState({});
  const [draftByBooking, setDraftByBooking] = useState({});
  const [activeConference, setActiveConference] = useState(null);
  const [inviteModalBookingId, setInviteModalBookingId] = useState(null);
  const [inviteSearch, setInviteSearch] = useState('');
  const [inviteResults, setInviteResults] = useState([]);
  const [inviteSelection, setInviteSelection] = useState({});
  const [accessBlockByBooking, setAccessBlockByBooking] = useState({});
  const pollTimerByBookingRef = useRef({});
  const PAYMENT_APPROVAL_TIMEOUT_MS = 2 * 60 * 1000;

  const buildFullPhoneNumber = (localDigits) => `+237${String(localDigits || '').replace(/\D/g, '').slice(0, 9)}`;

  const clearBookingPollTimer = (bookingId) => {
    const key = String(bookingId);
    const timerId = pollTimerByBookingRef.current[key];
    if (timerId) {
      window.clearTimeout(timerId);
      delete pollTimerByBookingRef.current[key];
    }
  };

  const stopAwaitingState = (bookingId) => {
    const key = String(bookingId);
    clearBookingPollTimer(key);
    setProcessingByBooking((prev) => ({ ...prev, [key]: false }));
    setAwaitingByBooking((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  const activeInviteBooking = useMemo(
    () => bookings.find((b) => String(b.id) === String(inviteModalBookingId || '')) || null,
    [bookings, inviteModalBookingId]
  );

  const loadBookings = async () => {
    try {
      const res = await api.get('/lecturers/candidate/bookings');
      setBookings(Array.isArray(res.data?.bookings) ? res.data.bookings : []);
    } catch (err) {
      showToast('Unable to load tutorship bookings', 'error');
    }
  };

  useEffect(() => {
    loadBookings();
  }, []);

  useEffect(() => () => {
    Object.keys(pollTimerByBookingRef.current).forEach((key) => clearBookingPollTimer(key));
  }, []);

  const searchInviteUsers = async (bookingId, q) => {
    try {
      const res = await api.get(`/lecturers/bookings/${encodeURIComponent(bookingId)}/video/invites/search`, { params: { q } });
      setInviteResults(Array.isArray(res.data?.users) ? res.data.users : []);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to search users.', 'error');
    }
  };

  const loadMessages = async (bookingId) => {
    try {
      const res = await api.get(`/lecturers/bookings/${encodeURIComponent(bookingId)}/messages`);
      setMessagesByBooking((prev) => ({ ...prev, [bookingId]: res.data?.messages || [] }));
    } catch (err) {
      showToast('Unable to load booking conversation', 'error');
    }
  };

  const startAwaitingPayment = (bookingId) => {
    const key = String(bookingId);
    const startedAt = Date.now();

    setAwaitingByBooking((prev) => ({
      ...prev,
      [key]: {
        startedAt,
        deadlineAt: startedAt + PAYMENT_APPROVAL_TIMEOUT_MS,
        statusText: 'Awaiting mobile money approval on your phone...',
      },
    }));

    const poll = async () => {
      try {
        const { data } = await api.get(`/lecturers/bookings/${encodeURIComponent(bookingId)}/pay/status`);
        const paymentStatus = String(data?.payment_status || data?.booking?.payment_status || '').toLowerCase();

        if (paymentStatus === 'successful' || paymentStatus === 'paid') {
          stopAwaitingState(key);
          showToast('Payment confirmed successfully.', 'success');
          await loadBookings();
          return;
        }

        if (['failed', 'expired', 'cancelled', 'rejected'].includes(paymentStatus)) {
          stopAwaitingState(key);
          showToast('Payment was not confirmed or was rejected by the debitor.', 'error');
          await loadBookings();
          return;
        }

        if (Date.now() >= startedAt + PAYMENT_APPROVAL_TIMEOUT_MS) {
          const { data: timeoutData } = await api.get(`/lecturers/bookings/${encodeURIComponent(bookingId)}/pay/status`);
          const timeoutStatus = String(timeoutData?.payment_status || timeoutData?.booking?.payment_status || '').toLowerCase();
          stopAwaitingState(key);
          if (timeoutStatus === 'successful' || timeoutStatus === 'paid') {
            showToast('Payment confirmed successfully.', 'success');
          } else {
            showToast('Approval timeout exceeded 2 minutes. Transaction marked as failed.', 'error');
          }
          await loadBookings();
          return;
        }

        clearBookingPollTimer(key);
        pollTimerByBookingRef.current[key] = window.setTimeout(poll, 4000);
      } catch (err) {
        stopAwaitingState(key);
        showToast(err?.response?.data?.message || 'Unable to refresh payment status.', 'error');
      }
    };

    clearBookingPollTimer(key);
    pollTimerByBookingRef.current[key] = window.setTimeout(poll, 1500);
  };

  const payBooking = async (bookingId) => {
    const key = String(bookingId);
    const localDigits = String(phoneByBooking[key] || '').replace(/\D/g, '').slice(0, 9);
    if (localDigits.length !== 9) {
      showToast('Enter a valid 9-digit Cameroon mobile number.', 'warning');
      return;
    }

    const phone = buildFullPhoneNumber(localDigits);
    const promoCode = String(promoByBooking[key] || '').trim().toUpperCase();
    try {
      setProcessingByBooking((prev) => ({ ...prev, [key]: true }));
      const data = await startBookingPayment({
        bookingId,
        phoneNumber: phone,
        promoCode,
        referralCode: promoCode,
      });

      const status = String(data?.payment?.status || data?.booking?.payment_status || '').toLowerCase();
      if (status === 'successful' || status === 'paid') {
        showToast('Payment confirmed successfully.', 'success');
        stopAwaitingState(key);
        await loadBookings();
        return;
      }

      showToast('Payment request sent. Approve on your phone. Waiting for confirmation...', 'success');
      startAwaitingPayment(key);
    } catch (err) {
      stopAwaitingState(key);
      const msg = err?.response?.data?.message || err?.message || 'Unable to initialize payment.';
      showToast(msg, 'error');
    }
  };

  const respondInvite = async (bookingId, decision) => {
    try {
      await api.post(`/lecturers/bookings/${encodeURIComponent(bookingId)}/video/invites/respond`, { decision });
      showToast(`Invitation ${decision}.`, 'success');
      await loadBookings();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to respond to invitation.', 'error');
    }
  };

  const payInviteAccess = async (bookingId) => {
    const key = String(bookingId);
    const localDigits = String(phoneByBooking[key] || '').replace(/\D/g, '').slice(0, 9);
    if (localDigits.length !== 9) {
      showToast('Enter a valid 9-digit Cameroon mobile number.', 'warning');
      return;
    }
    const phone = buildFullPhoneNumber(localDigits);
    const promoCode = String(promoByBooking[key] || '').trim().toUpperCase();
    try {
      await startInviteAccessPayment({
        bookingId,
        phoneNumber: phone,
        promoCode,
        referralCode: promoCode,
      });
      showToast('Conference access payment request sent.', 'success');
      await loadBookings();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to initialize invite payment.', 'error');
    }
  };

  const refreshInviteAccessPayment = async (bookingId) => {
    try {
      await api.get(`/lecturers/bookings/${encodeURIComponent(bookingId)}/video/invites/pay/status`);
      await loadBookings();
      showToast('Conference access payment refreshed.', 'success');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to refresh invite payment.', 'error');
    }
  };

  const openConference = async (bookingId) => {
    try {
      const res = await api.get(`/lecturers/bookings/${encodeURIComponent(bookingId)}/video/access`);
      const conf = res.data?.conference;
      if (!conf?.room_name) {
        showToast('Conference room unavailable right now.', 'warning');
        return;
      }
      if (!conf?.livekit_url || !conf?.livekit_token) {
        showToast('Live video service is not configured yet. Contact support.', 'error');
        return;
      }
      setAccessBlockByBooking((prev) => ({ ...prev, [bookingId]: null }));
      setActiveConference({
        bookingId,
        roomName: conf.room_name,
        serverUrl: conf.livekit_url,
        accessToken: conf.livekit_token,
        minutesLeft: conf.minutes_left,
        subtitle: conf.conference_live ? 'Session is live' : 'Waiting for lecturer to start',
      });
    } catch (err) {
      const data = err?.response?.data || {};
      const msg = data?.message || 'Unable to open conference.';
      showToast(msg, 'warning');
      setAccessBlockByBooking((prev) => ({
        ...prev,
        [bookingId]: {
          message: msg,
          requiresPayment: Boolean(data?.requires_payment),
          inviteFee: Number(data?.invite_fee || 0),
          currency: data?.currency || 'XAF',
          minutesLeft: Number(data?.minutes_left || 0),
        },
      }));
    }
  };

  const sendConferenceInvites = async () => {
    const bookingId = inviteModalBookingId;
    if (!bookingId) return;
    const selected = Object.keys(inviteSelection).filter((k) => inviteSelection[k]);
    if (!selected.length) {
      showToast('Select at least one user to invite.', 'warning');
      return;
    }
    try {
      await api.post(`/lecturers/bookings/${encodeURIComponent(bookingId)}/video/invites`, {
        invitee_cand_ids: selected,
      });
      showToast('Invites sent. Users will receive push and email.', 'success');
      setInviteSelection({});
      setInviteResults([]);
      setInviteSearch('');
      setInviteModalBookingId(null);
      await loadBookings();
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to send invites.', 'error');
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
      showToast(err?.response?.data?.message || 'Unable to simulate chat session.', 'error');
    }
  };

  const refreshPayment = async (bookingId) => {
    try {
      await api.get(`/lecturers/bookings/${encodeURIComponent(bookingId)}/pay/status`);
      await loadBookings();
      showToast('Payment status refreshed.', 'success');
    } catch (err) {
      showToast(err?.response?.data?.message || 'Unable to refresh payment status.', 'error');
    }
  };

  const sendMessage = async (bookingId) => {
    const text = String(draftByBooking[bookingId] || '').trim();
    if (!text) return;
    try {
      await api.post(`/lecturers/bookings/${encodeURIComponent(bookingId)}/messages`, { message: text });
      setDraftByBooking((prev) => ({ ...prev, [bookingId]: '' }));
      await loadMessages(bookingId);
    } catch (err) {
      showToast(err?.response?.data?.message || 'Could not send message.', 'error');
    }
  };

  return (
    <div className={styles.page}>
      {activeConference ? (
        <BookingVideoConferenceModal
          roomName={activeConference.roomName}
          serverUrl={activeConference.serverUrl}
          accessToken={activeConference.accessToken}
          displayName={user?.name || 'Candidate'}
          email={user?.email || ''}
          title="Contract Video Conference"
          subtitle={activeConference.subtitle}
          minutesLeft={activeConference.minutesLeft}
          onClose={() => setActiveConference(null)}
        />
      ) : null}

      {inviteModalBookingId ? (
        <div className={styles.videoOverlay}>
          <div className={styles.videoModal}>
            <div className={styles.videoHeader}>
              <span><FaVideo /> Invite Candidates to Conference</span>
              <button className={styles.videoClose} onClick={() => setInviteModalBookingId(null)} aria-label="Close"><FaTimes /></button>
            </div>
            <div className={styles.inviteModalBody}>
              <div className={styles.meta}>Topic: {activeInviteBooking?.topic}</div>
              <div className={styles.inline}>
                <input
                  className={styles.input}
                  placeholder="Search by name, email, or candidate ID"
                  value={inviteSearch}
                  onChange={(e) => setInviteSearch(e.target.value)}
                />
                <button className={styles.buttonAlt} onClick={() => searchInviteUsers(inviteModalBookingId, inviteSearch)}>
                  <FaSearch /> Search
                </button>
              </div>
              <div className={styles.inviteUserList}>
                {inviteResults.map((u) => (
                  <label key={u.cand_id} className={styles.inviteUserRow}>
                    <input
                      type="checkbox"
                      checked={Boolean(inviteSelection[u.cand_id])}
                      onChange={(e) => setInviteSelection((prev) => ({ ...prev, [u.cand_id]: e.target.checked }))}
                    />
                    <span>{u.name} ({maskCandidateId(u.cand_id)})</span>
                  </label>
                ))}
                {!inviteResults.length ? <div className={styles.meta}>No users found yet.</div> : null}
              </div>
              <div className={styles.actions}>
                <button className={styles.button} onClick={sendConferenceInvites}>Send Invitation</button>
                <button className={styles.buttonAlt} onClick={() => setInviteModalBookingId(null)}>Cancel</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className={styles.header}>
        <div>
          <div className={styles.title}>My Tutorship Bookings</div>
          <div className={styles.subtitle}>Pay for accepted bookings, chat with lecturers, and follow your schedule.</div>
        </div>
      </div>

      <div className={styles.list}>
        {bookings.map((booking) => (
          <div className={styles.row} key={booking.id}>
            <div className={styles.rowTitle}>{booking.topic}</div>
            <div className={styles.meta}>Session: {booking.session_mode} | Duration: {booking.duration_minutes} minutes</div>
            <div className={styles.meta}>Service: {booking.booking_type === 'video_conference' ? 'Video Conference' : 'Tutorship'}</div>
            <div className={styles.meta}>Scheduled: {new Date(booking.scheduled_for).toLocaleString()}</div>
            <div className={styles.meta}>Status: {booking.status} | Payment: {booking.payment_status}</div>
            <div className={styles.meta}>Amount: {Number(booking.amount_total || 0).toFixed(0)} {booking.currency || 'XAF'}</div>
            <div className={styles.meta}>Contract: {booking.contract_sealed ? 'Sealed' : 'Open'}</div>
            <div className={styles.meta}>Conference: {booking.conference_live ? 'Live now' : 'Not live'} | Time left: {Number(booking.conference_minutes_left || 0)} min</div>

            {booking.viewer_role_in_booking === 'invitee' && booking.viewer_invite?.status === 'pending' ? (
              <div className={styles.actions}>
                <button className={styles.button} onClick={() => respondInvite(booking.id, 'accepted')}><FaCheck /> Accept Invite</button>
                <button className={styles.buttonAlt} onClick={() => respondInvite(booking.id, 'rejected')}><FaTimes /> Decline</button>
              </div>
            ) : null}

            {booking.viewer_role_in_booking === 'invitee' && booking.viewer_invite?.status === 'accepted' && booking.viewer_invite?.payment_status !== 'paid' ? (
              <div className={styles.card}>
                <div className={styles.meta}>
                  Pay before joining this meeting: {Number(booking.invite_access_fee || 0).toFixed(0)} {booking.currency || 'XAF'}
                  {' '}for {Number(booking.conference_minutes_left || booking.duration_minutes || 0)} minute(s) remaining.
                </div>
                <div className={styles.actions}>
                  <div className={styles.phoneInputGroup}>
                    <div className={styles.phonePrefix}>
                      <span aria-hidden="true">CM</span>
                      <strong>+237</strong>
                    </div>
                    <input
                      className={styles.phoneInput}
                      placeholder="6XXXXXXXX"
                      value={phoneByBooking[booking.id] || ''}
                      inputMode="numeric"
                      maxLength={9}
                      onChange={(e) => setPhoneByBooking((prev) => ({
                        ...prev,
                        [booking.id]: e.target.value.replace(/\D/g, '').slice(0, 9),
                      }))}
                    />
                  </div>
                  <input
                    className={styles.input}
                    placeholder="Promo/referral code (optional)"
                    value={promoByBooking[booking.id] || ''}
                    onChange={(e) => setPromoByBooking((prev) => ({
                      ...prev,
                      [booking.id]: e.target.value.toUpperCase().replace(/\s+/g, '').slice(0, 30),
                    }))}
                  />
                  <button className={styles.button} onClick={() => payInviteAccess(booking.id)}>Pay Access</button>
                  <button className={styles.buttonAlt} onClick={() => refreshInviteAccessPayment(booking.id)}>Refresh Access Payment</button>
                </div>
              </div>
            ) : null}

            {booking.payment_status !== 'paid' && ['accepted', 'scheduled'].includes(String(booking.status || '').toLowerCase()) ? (
              <div className={styles.actions}>
                <div className={styles.phoneInputGroup}>
                  <div className={styles.phonePrefix}>
                    <span aria-hidden="true">CM</span>
                    <strong>+237</strong>
                  </div>
                  <input
                    className={styles.phoneInput}
                    placeholder="6XXXXXXXX"
                    value={phoneByBooking[booking.id] || ''}
                    inputMode="numeric"
                    maxLength={9}
                    onChange={(e) => setPhoneByBooking((prev) => ({
                      ...prev,
                      [booking.id]: e.target.value.replace(/\D/g, '').slice(0, 9),
                    }))}
                  />
                </div>
                <input
                  className={styles.input}
                  placeholder="Promo/referral code (optional)"
                  value={promoByBooking[booking.id] || ''}
                  onChange={(e) => setPromoByBooking((prev) => ({
                    ...prev,
                    [booking.id]: e.target.value.toUpperCase().replace(/\s+/g, '').slice(0, 30),
                  }))}
                />
                <button
                  className={styles.button}
                  onClick={() => payBooking(booking.id)}
                  disabled={Boolean(processingByBooking[String(booking.id)])}
                >
                  {processingByBooking[String(booking.id)] ? 'Requesting...' : 'Pay Now'}
                </button>
                <button
                  className={styles.buttonAlt}
                  onClick={() => refreshPayment(booking.id)}
                  disabled={Boolean(processingByBooking[String(booking.id)])}
                >
                  Refresh Payment
                </button>
              </div>
            ) : null}

            {awaitingByBooking[String(booking.id)] ? (
              <div className={styles.approvalNote}>
                <span className={styles.loadingDot} />
                {awaitingByBooking[String(booking.id)].statusText}
                {' '}Transaction auto-fails if not approved within 2 minutes.
              </div>
            ) : null}

            {booking.payment_status !== 'paid' && !['accepted', 'scheduled'].includes(String(booking.status || '').toLowerCase()) ? (
              <div className={styles.approvalNote}>Waiting for lecturer confirmation. Payment will unlock after confirmation.</div>
            ) : null}

            <div className={styles.actions}>
              <button className={styles.buttonAlt} onClick={() => loadMessages(booking.id)} disabled={!booking.contract_sealed}>Open Contract Chat</button>
              <button className={styles.buttonAlt} onClick={() => simulateChat(booking.id)} disabled={!booking.contract_sealed}>Simulate Chat Session</button>
              <button className={styles.button} onClick={() => openConference(booking.id)} disabled={!booking.contract_sealed || booking.session_mode !== 'video'}>Join Video Conference</button>
              {booking.viewer_role_in_booking === 'candidate' ? (
                <button className={styles.buttonAlt} onClick={() => setInviteModalBookingId(booking.id)} disabled={!booking.contract_sealed || booking.session_mode !== 'video'}>
                  Invite Candidates
                </button>
              ) : null}
            </div>

            {accessBlockByBooking[booking.id] ? (
              <div className={styles.approvalNote}>
                {accessBlockByBooking[booking.id].message}
                {accessBlockByBooking[booking.id].requiresPayment
                  ? ` Payment due: ${Number(accessBlockByBooking[booking.id].inviteFee || 0).toFixed(0)} ${accessBlockByBooking[booking.id].currency} for ${accessBlockByBooking[booking.id].minutesLeft} min.`
                  : ''}
              </div>
            ) : null}

            {Array.isArray(messagesByBooking[booking.id]) && booking.contract_sealed ? (
              <>
                <div className={styles.chatBox}>
                  {messagesByBooking[booking.id].map((msg) => (
                    <div key={msg._id} className={styles.msg}>
                      <strong>{msg.sender_role}</strong>: {msg.message}
                    </div>
                  ))}
                </div>
                <div className={styles.inline}>
                  <input
                    className={styles.input}
                    placeholder="Type message"
                    value={draftByBooking[booking.id] || ''}
                    onChange={(e) => setDraftByBooking((prev) => ({ ...prev, [booking.id]: e.target.value }))}
                  />
                  <button className={styles.buttonAlt} onClick={() => sendMessage(booking.id)}>Send</button>
                </div>
              </>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CandidateTutorshipBookings;
