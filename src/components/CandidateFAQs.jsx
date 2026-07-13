import React, { useEffect, useState } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../utility/getErrorMessage';
import { showToast } from '../utility/ToastNotification';

const CandidateFAQs = () => {
  const [faqs, setFaqs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadFaqs = async () => {
      try {
        const { data } = await api.get('/candidate/faqs');
        if (!cancelled) {
          setFaqs(Array.isArray(data?.faqs) ? data.faqs : []);
        }
      } catch (err) {
        if (!cancelled) {
          showToast(getErrorMessage(err, 'Unable to load FAQs right now.'), 'warning');
          setFaqs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadFaqs();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <header style={{ marginBottom: 24 }}>
        <h1 style={{ margin: 0, fontSize: 32 }}>FAQs</h1>
        <p style={{ margin: '8px 0 0', color: '#4b5563' }}>
          Common questions and answers for candidates about reports, guides, and access.
        </p>
      </header>

      {loading ? (
        <p style={{ color: '#4b5563' }}>Loading FAQs...</p>
      ) : faqs.length === 0 ? (
        <div style={{ padding: 20, borderRadius: 18, background: '#fff', border: '1px solid #e5e7eb' }}>
          No FAQs are available right now.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 16 }}>
          {faqs.map((faq) => (
            <div key={faq._id || faq.id || faq.slug} style={{ padding: 20, borderRadius: 18, background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(15, 23, 42, 0.06)' }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{faq.title || faq.question}</p>
              <p style={{ margin: '10px 0 0', color: '#4b5563', whiteSpace: 'pre-line' }}>{faq.content || faq.answer}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default CandidateFAQs;
