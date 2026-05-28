import React, { useCallback, useEffect, useState } from 'react';
import api from '../services/api';
import styles from '../Astyles/lecturerPortal.module.css';
import { showToast } from '../utility/ToastNotification';
import { maskCandidateId } from '../utility/maskCandidateId';

const LecturerEarnings = () => {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState({ totals: { gross: 0, lecturer_share: 0, platform_share: 0, paid_out: 0 }, bookings: [] });

  const load = useCallback(async (nextYear = year, nextMonth = month) => {
    try {
      const res = await api.get(`/lecturers/me/earnings?year=${encodeURIComponent(nextYear)}&month=${encodeURIComponent(nextMonth)}`);
      setData({ totals: res.data?.totals || {}, bookings: res.data?.bookings || [] });
    } catch (err) {
      showToast('Unable to load earnings', 'error');
    }
  }, [month, year]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Monthly Earnings</div>
          <div className={styles.subtitle}>Track gross amounts, your share, platform split, and payout status.</div>
        </div>
      </div>

      <div className={styles.inline}>
        <input className={styles.input} type="number" value={year} onChange={(e) => setYear(Number(e.target.value || now.getFullYear()))} />
        <input className={styles.input} type="number" min="1" max="12" value={month} onChange={(e) => setMonth(Number(e.target.value || now.getMonth() + 1))} />
        <button className={styles.buttonAlt} onClick={() => load(year, month)}>Load</button>
      </div>

      <div className={styles.grid}>
        <div className={styles.card}><div className={styles.kpiValue}>{Number(data.totals?.gross || 0).toFixed(0)}</div><div className={styles.kpiLabel}>Gross (XAF)</div></div>
        <div className={styles.card}><div className={styles.kpiValue}>{Number(data.totals?.lecturer_share || 0).toFixed(0)}</div><div className={styles.kpiLabel}>Lecturer Share (XAF)</div></div>
        <div className={styles.card}><div className={styles.kpiValue}>{Number(data.totals?.platform_share || 0).toFixed(0)}</div><div className={styles.kpiLabel}>Platform Share (XAF)</div></div>
        <div className={styles.card}><div className={styles.kpiValue}>{Number(data.totals?.paid_out || 0).toFixed(0)}</div><div className={styles.kpiLabel}>Paid Out (XAF)</div></div>
      </div>

      <div className={styles.list}>
        {(data.bookings || []).map((b) => (
          <div className={styles.row} key={b.id}>
            <div className={styles.rowTitle}>{b.topic}</div>
            <div className={styles.meta}>Candidate: {maskCandidateId(b.candidate_cand_id)} | Payment: {b.payment_status} | Session: {b.status}</div>
            <div className={styles.meta}>Gross: {Number(b.amount_total || 0).toFixed(0)} XAF | Your share: {Number(b.lecturer_share || 0).toFixed(0)} XAF | Paid out: {b.paid_out ? 'Yes' : 'No'}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default LecturerEarnings;
