import React from 'react';

const candidateFaqs = [
  {
    id: 1,
    question: 'How do I access my academic reports?',
    answer: 'Use the Academic Reports menu on the sidebar to open Reports or Report Guides.',
  },
  {
    id: 2,
    question: 'Who can view report guides?',
    answer: 'All candidates can view report guides once they are published, regardless of program or department.',
  },
  {
    id: 3,
    question: 'How do I download a report guide?',
    answer: 'Click the download button next to the guide to save a copy to your device.',
  },
];

const CandidateFAQs = () => (
  <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
    <header style={{ marginBottom: 24 }}>
      <h1 style={{ margin: 0, fontSize: 32 }}>Candidate FAQs</h1>
      <p style={{ margin: '8px 0 0', color: '#4b5563' }}>
        Frequently asked questions for candidates about academic reports and guides.
      </p>
    </header>

    <div style={{ display: 'grid', gap: 16 }}>
      {candidateFaqs.map((faq) => (
        <div key={faq.id} style={{ padding: 20, borderRadius: 18, background: '#fff', border: '1px solid #e5e7eb', boxShadow: '0 1px 4px rgba(15, 23, 42, 0.06)' }}>
          <p style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>{faq.question}</p>
          <p style={{ margin: '10px 0 0', color: '#4b5563' }}>{faq.answer}</p>
        </div>
      ))}
    </div>
  </div>
);

export default CandidateFAQs;
