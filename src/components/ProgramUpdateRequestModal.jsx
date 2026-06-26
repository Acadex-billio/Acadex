import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import styles from '../Astyles/ProgramUpdateRequestModal.module.css';

const ProgramUpdateRequestModal = () => {
  const [loading, setLoading] = useState(true);
  const [pendingRequest, setPendingRequest] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const load = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/candidate/account/program-update/pending');
      setPendingRequest(data?.pending ? data.request : null);
    } catch (_) {
      setPendingRequest(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submitResponse = async (response) => {
    try {
      setSubmitting(true);
      const { data } = await api.post('/candidate/account/program-update/respond', { response });
      showToast(data?.message || 'Response submitted successfully.', 'success');
      setPendingRequest(null);
    } catch (err) {
      showToast(getErrorMessage(err, 'Unable to submit your response.'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading || !pendingRequest) return null;

  return (
    <div className={styles.overlay}>
      <div className={styles.card}>
        <h3 className={styles.title}>Program Upgrade Confirmation</h3>
        <p className={styles.message}>
          {pendingRequest.message || `You are currently in ${pendingRequest.source_program}. Have you successfully validated your previous program and are you now qualified to move to ${pendingRequest.target_program}?`}
        </p>
        <p className={styles.track}>
          From <span>{pendingRequest.source_program}</span> to <span>{pendingRequest.target_program}</span>
        </p>

        <div className={styles.actions}>
          <button
            type="button"
            disabled={submitting}
            onClick={() => submitResponse('reject')}
            className={styles.rejectBtn}
          >
            Reject
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => submitResponse('accept')}
            className={styles.acceptBtn}
          >
            Accept and Update Program
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProgramUpdateRequestModal;