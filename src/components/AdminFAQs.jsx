import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { getErrorMessage } from '../utility/getErrorMessage';
import { showToast } from '../utility/ToastNotification';

const AdminFAQs = () => {
  const [faqs, setFaqs] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [draftQuestion, setDraftQuestion] = useState('');
  const [draftAnswer, setDraftAnswer] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const loadFaqs = async () => {
      try {
        const { data } = await api.get('/admin/faqs');
        if (!cancelled) setFaqs(Array.isArray(data?.faqs) ? data.faqs : []);
      } catch (err) {
        if (!cancelled) showToast(getErrorMessage(err, 'Unable to load FAQs'), 'error');
        if (!cancelled) setFaqs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadFaqs();
    return () => { cancelled = true; };
  }, []);

  const startNewFaq = () => {
    setEditingId(null);
    setDraftQuestion('');
    setDraftAnswer('');
  };

  const saveFaq = async () => {
    if (!draftQuestion.trim() || !draftAnswer.trim()) return showToast('Provide both question and answer', 'warning');

    try {
      if (editingId) {
        const { data } = await api.put(`/admin/faqs/${encodeURIComponent(editingId)}`, {
          title: draftQuestion,
          content: draftAnswer,
        });
        const updated = data?.faq;
        if (updated) setFaqs((current) => current.map((f) => (String(f._id) === String(updated._id) ? updated : f)));
        showToast('FAQ updated', 'success');
      } else {
        const { data } = await api.post('/admin/faqs', { title: draftQuestion, content: draftAnswer, audience: 'candidate', published: true });
        const created = data?.faq;
        if (created) setFaqs((current) => [created, ...current]);
        showToast('FAQ created', 'success');
      }
      setEditingId(null);
      setDraftQuestion('');
      setDraftAnswer('');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to save FAQ'), 'error');
    }
  };

  const editFaq = (faq) => {
    setEditingId(faq._id || faq.id);
    setDraftQuestion(faq.title || faq.question || '');
    setDraftAnswer(faq.content || faq.answer || '');
  };

  const deleteFaq = async (faqId) => {
    try {
      await api.delete(`/admin/faqs/${encodeURIComponent(faqId)}`);
      setFaqs((current) => current.filter((faq) => String(faq._id || faq.id) !== String(faqId)));
      if (String(editingId) === String(faqId)) {
        setEditingId(null);
        setDraftQuestion('');
        setDraftAnswer('');
      }
      showToast('FAQ deleted', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to delete FAQ'), 'error');
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32 }}>Manage FAQs</h1>
          <p style={{ margin: '8px 0 0', color: '#4b5563' }}>
            Add, edit, or remove candidate-facing FAQs.
          </p>
        </div>
        <button type="button" onClick={startNewFaq} style={{ padding: '12px 18px', borderRadius: 14, background: '#2563eb', color: '#fff', border: 'none', cursor: 'pointer' }}>
          Add FAQ
        </button>
      </header>

      <section style={{ display: 'grid', gap: 20 }}>
        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 22, boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)' }}>
          <h2 style={{ margin: 0, fontSize: 20, marginBottom: 14 }}>FAQ Editor</h2>
          <div style={{ display: 'grid', gap: 16 }}>
            <div style={{ display: 'grid', gap: 6 }}>
              <label htmlFor="faq-question" style={{ fontWeight: 600 }}>Question</label>
              <input
                id="faq-question"
                type="text"
                value={draftQuestion}
                onChange={(e) => setDraftQuestion(e.target.value)}
                placeholder="Enter question"
                style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #cbd5e1' }}
              />
            </div>
            <div style={{ display: 'grid', gap: 6 }}>
              <label htmlFor="faq-answer" style={{ fontWeight: 600 }}>Answer</label>
              <textarea
                id="faq-answer"
                value={draftAnswer}
                onChange={(e) => setDraftAnswer(e.target.value)}
                placeholder="Enter answer"
                rows={5}
                style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #cbd5e1' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={saveFaq}
                style={{ padding: '12px 18px', borderRadius: 14, background: '#16a34a', color: '#fff', border: 'none', cursor: 'pointer' }}
              >
                Save FAQ
              </button>
              <button
                type="button"
                onClick={startNewFaq}
                style={{ padding: '12px 18px', borderRadius: 14, background: '#f3f4f6', color: '#111827', border: '1px solid #d1d5db', cursor: 'pointer' }}
              >
                Clear
              </button>
            </div>
          </div>
        </div>

        <div style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 24, padding: 22, boxShadow: '0 1px 3px rgba(15, 23, 42, 0.08)' }}>
          <h2 style={{ margin: 0, fontSize: 20, marginBottom: 14 }}>Current FAQs</h2>
          <div style={{ display: 'grid', gap: 14 }}>
            {loading ? (
              <div>Loading...</div>
            ) : faqs.length === 0 ? (
              <div>No FAQs found.</div>
            ) : (
              faqs.map((faq) => (
                <div key={faq._id || faq.id || faq.slug} style={{ padding: 18, background: '#f8fafc', borderRadius: 18, border: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 700 }}>{faq.title || faq.question}</p>
                      <p style={{ margin: '10px 0 0', color: '#475569' }}>{faq.content || faq.answer}</p>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        onClick={() => editFaq(faq)}
                        style={{ padding: '8px 12px', borderRadius: 12, border: 'none', background: '#2563eb', color: '#fff', cursor: 'pointer' }}
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteFaq(faq._id || faq.id)}
                        style={{ padding: '8px 12px', borderRadius: 12, border: 'none', background: '#ef4444', color: '#fff', cursor: 'pointer' }}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

export default AdminFAQs;
