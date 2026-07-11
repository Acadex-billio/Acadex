import React, { useState } from 'react';

const PROGRAM_OPTIONS = ['HND', 'BTS', 'LICENCE', 'BACHELOR', 'MASTERS', 'MASTER'];
const AUDIENCE_OPTIONS = ['GENERAL', 'SINGLE', 'MULTIPLE'];
const YEAR_OPTIONS = ['2024', '2025', '2026', '2027'];

const fieldStyle = {
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const selectStyle = {
  padding: '12px 14px',
  borderRadius: 12,
  border: '1px solid #d1d5db',
  background: '#fff',
  fontSize: 15,
};

const AdminPublishResults = () => {
  const [program, setProgram] = useState('HND');
  const [audience, setAudience] = useState('GENERAL');
  const [department, setDepartment] = useState('');
  const [year, setYear] = useState('2024');

  return (
    <div style={{ padding: 24, maxWidth: 980, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 24 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32 }}>Publish Results</h1>
          <p style={{ margin: '8px 0 0', color: '#4b5563' }}>
            Create result announcements for candidates by program, department and year.
          </p>
        </div>
      </div>

      <div
        style={{
          background: 'linear-gradient(135deg, #eef2ff 0%, #f3f4f6 100%)',
          border: '1px solid #c7d2fe',
          borderRadius: 28,
          padding: 26,
          marginBottom: 24,
          boxShadow: '0 25px 50px rgba(99, 102, 241, 0.08)',
          transform: 'translateY(0px)',
          animation: 'popIn 0.45s ease-out forwards',
        }}
      >
        <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 18 }}>
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              display: 'grid',
              placeItems: 'center',
              background: '#6366f1',
              color: '#fff',
              fontSize: 24,
              boxShadow: '0 12px 30px rgba(99, 102, 241, 0.18)',
            }}
          >
            🔒
          </div>
          <div>
            <strong style={{ display: 'block', fontSize: 18, marginBottom: 6, color: '#1f2937' }}>
              Under development — release pending HND board permission
            </strong>
            <p style={{ margin: 0, color: '#475569', lineHeight: 1.7 }}>
              This page is being refined and requires approval from the HND Board before result publishing can go live.
            </p>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 10, padding: 18, background: '#eef2ff', borderRadius: 20, border: '1px dashed #c7d2fe' }}>
          <p style={{ margin: 0, color: '#334155', fontWeight: 600 }}>What happens next?</p>
          <ul style={{ margin: 0, paddingLeft: 18, color: '#475569', lineHeight: 1.8 }}>
            <li>Finalize the result publication workflow</li>
            <li>Secure board permission for academic release</li>
            <li>Enable candidate results delivery once approved</li>
          </ul>
        </div>
      </div>
      <style>{`
        @keyframes popIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      <div style={{ display: 'grid', gap: 20, background: '#fff', borderRadius: 24, padding: 24, boxShadow: '0 12px 30px rgba(15, 23, 42, 0.05)' }}>
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <div style={fieldStyle}>
            <label htmlFor="program" style={{ fontWeight: 600 }}>Program</label>
            <select id="program" value={program} onChange={(e) => setProgram(e.target.value)} style={selectStyle}>
              {PROGRAM_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label htmlFor="audience" style={{ fontWeight: 600 }}>Audience</label>
            <select id="audience" value={audience} onChange={(e) => setAudience(e.target.value)} style={selectStyle}>
              {AUDIENCE_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>

          <div style={fieldStyle}>
            <label htmlFor="department" style={{ fontWeight: 600 }}>Department</label>
            <input
              id="department"
              type="text"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
              placeholder="e.g. Software Engineering"
              style={{ ...selectStyle, borderRadius: 12 }}
            />
          </div>

          <div style={fieldStyle}>
            <label htmlFor="year" style={{ fontWeight: 600 }}>Year</label>
            <select id="year" value={year} onChange={(e) => setYear(e.target.value)} style={selectStyle}>
              {YEAR_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ background: '#f1f5f9', borderRadius: 16, padding: 18, color: '#475569' }}>
          <p style={{ margin: 0 }}>
            The publishing workflow is being built. When ready, this page will let you choose the program, audience, department and year, then publish results for candidates.
          </p>
        </div>

        <button type="button" disabled style={{ width: 200, padding: '14px 20px', borderRadius: 14, border: 'none', background: '#9ca3af', color: '#fff', fontWeight: 700, cursor: 'not-allowed' }}>
          Coming soon
        </button>
      </div>
    </div>
  );
};

export default AdminPublishResults;
