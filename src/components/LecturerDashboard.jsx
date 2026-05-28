import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FaCalendarCheck, FaMoneyBillWave, FaClock, FaExclamationTriangle, FaIdCard } from 'react-icons/fa';
import api from '../services/api';
import { useAuth } from '../context/AuthContext';
import styles from '../Astyles/lecturerPortal.module.css';

const LecturerDashboard = () => {
  const { user } = useAuth();
  const isPending = String(user?.account_status || 'active') !== 'active';
  const [data, setData] = useState({ pending_requests: 0, upcoming_sessions: 0, month_earnings: { gross: 0, lecturer_share: 0, platform_share: 0 } });

  useEffect(() => {
    if (isPending) return;
    let mounted = true;
    (async () => {
      try {
        const res = await api.get('/lecturers/me/dashboard');
        if (!mounted) return;
        setData((prev) => res.data?.dashboard || prev);
      } catch (_) {
        // keep defaults
      }
    })();
    return () => { mounted = false; };
  }, [isPending]);

  return (
    <div className={styles.page}>
      {isPending && (
        <div className={styles.pendingBanner}>
          <FaExclamationTriangle className={styles.pendingBannerIcon} />
          <div>
            <strong>Your account is pending verification.</strong>
            <span> Complete your verification profile to unlock bookings and earnings.</span>
          </div>
          <Link className={styles.pendingBannerBtn} to="/lecturer/profile-verification">
            <FaIdCard /> Complete Profile
          </Link>
        </div>
      )}

      <div className={styles.header}>
        <div>
          <div className={styles.title}>Lecturer Dashboard</div>
          <div className={styles.subtitle}>Track bookings, approvals, and monthly earnings.</div>
        </div>
      </div>

      <div className={styles.grid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}><FaClock /></div>
          <div className={styles.kpiValue}>{data.pending_requests}</div>
          <div className={styles.kpiLabel}>Pending Requests</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}><FaCalendarCheck /></div>
          <div className={styles.kpiValue}>{data.upcoming_sessions}</div>
          <div className={styles.kpiLabel}>Upcoming Sessions</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}><FaMoneyBillWave /></div>
          <div className={styles.kpiValue}>{Number(data.month_earnings?.lecturer_share || 0).toFixed(0)} XAF</div>
          <div className={styles.kpiLabel}>Your Share This Month</div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}><FaMoneyBillWave /></div>
          <div className={styles.kpiValue}>{Number(data.month_earnings?.platform_share || 0).toFixed(0)} XAF</div>
          <div className={styles.kpiLabel}>Platform Share</div>
        </div>
      </div>
    </div>
  );
};

export default LecturerDashboard;
