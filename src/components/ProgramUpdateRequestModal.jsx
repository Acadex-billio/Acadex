import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';

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
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 1200, display: 'grid', placeItems: 'center', padding: 16 }}>
      <div style={{ width: 'min(680px, 100%)', background: '#fff', borderRadius: 14, border: '1px solid #dbe7f4', padding: 18 }}>
        <h3 style={{ marginTop: 0 }}>Program Upgrade Confirmation</h3>
        <p style={{ color: '#334155', lineHeight: 1.6 }}>
          {pendingRequest.message || `You are currently in ${pendingRequest.source_program}. Have you successfully validated your previous program and are you now qualified to move to ${pendingRequest.target_program}?`}
        </p>
        <p style={{ color: '#475569' }}>
          From: <strong>{pendingRequest.source_program}</strong> to <strong>{pendingRequest.target_program}</strong>
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 14 }}>
          <button
            type="button"
            disabled={submitting}
            onClick={() => submitResponse('reject')}
            style={{ border: '1px solid #ef4444', color: '#b91c1c', background: '#fff', borderRadius: 10, padding: '10px 14px' }}
          >
            Reject
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => submitResponse('accept')}
            style={{ border: 'none', color: '#fff', background: '#0f766e', borderRadius: 10, padding: '10px 14px' }}
          >
            Accept and Update Program
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProgramUpdateRequestModal;