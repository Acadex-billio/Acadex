import React, { useEffect, useMemo, useState } from 'react';
import { Helmet } from 'react-helmet';
import styles from '../Astyles/dashboard.module.css';
import { FaUsers, FaFileAlt, FaChartBar, FaBook, FaLayerGroup, FaUserCircle } from 'react-icons/fa';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS, ArcElement, CategoryScale, LinearScale,
  BarElement, PointElement, LineElement, Tooltip, Legend
} from 'chart.js';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import { useLoading } from '../context/LoadingContext';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import GraduationCapLoader from './GraduationCapLoader';
import { maskCandidateId } from '../utility/maskCandidateId';

ChartJS.register(
  ArcElement, CategoryScale, LinearScale,
  BarElement, PointElement, LineElement,
  Tooltip, Legend
);

const buildImageUrl = (url) => {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${window.location.origin}${url}`;
  return `${window.location.origin}/${url}`;
};

const AdminDashboard = () => {
  const { loading, startLoading, stopLoading } = useLoading();
  const { user } = useAuth();
  const pictureUrl = user?.profilePicture || user?.profile_picture || null;
  const avatarSrc = buildImageUrl(pictureUrl);
  const avatarLabel = user?.name?.charAt(0).toUpperCase() || user?.email?.charAt(0).toUpperCase() || 'A';

  const [summary, setSummary] = useState(null);
  const [departmentTrends, setDepartmentTrends] = useState({ labels: [], series: [] });
  const [accountStats, setAccountStats] = useState(null);
  const [recentRegistrations, setRecentRegistrations] = useState([]);
  const [dataLoading, setDataLoading] = useState(false);

  const adminName = useMemo(() => user?.name || user?.email || 'Admin', [user]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        setDataLoading(true);
        startLoading();

        const [summaryRes, trendsRes, statusRes, registrationsRes] = await Promise.all([
          api.get('/ai-tools/summary'),
          api.get('/admin/departments/trends?limit=3'),
          api.get('/ai-tools/accounts/status-stats'),
          api.get('/ai-tools/recent-registrations?count=6'),
        ]);

        setSummary(summaryRes.data?.summary || {});
        setDepartmentTrends({
          labels: Array.isArray(trendsRes.data?.labels) ? trendsRes.data.labels : [],
          series: Array.isArray(trendsRes.data?.series) ? trendsRes.data.series : [],
        });
        setAccountStats(statusRes.data?.current || {});
        setRecentRegistrations(registrationsRes.data?.registrations || []);
      } catch (err) {
        showToast(getErrorMessage(err, 'Unable to load dashboard analytics. Please refresh.'), 'error');
      } finally {
        stopLoading();
        setDataLoading(false);
      }
    };

    fetchDashboardData();
  }, [startLoading, stopLoading]);

  const statCards = useMemo(() => [
    { label: 'Total Users', value: summary?.total_users },
    { label: 'Total Candidates', value: summary?.total_candidates },
    { label: 'Admin Accounts', value: summary?.total_admins },
    { label: 'Departments', value: summary?.total_departments },
    { label: 'Question Papers', value: summary?.total_question_papers },
    { label: 'Reports', value: summary?.total_reports },
    { label: 'Presentations', value: summary?.total_presentations },
  ], [summary]);

  const topDepartmentsLineData = useMemo(() => {
    const palette = [
      { border: '#2196F3', fill: 'rgba(33, 150, 243, 0.22)' },
      { border: '#FF5722', fill: 'rgba(255, 87, 34, 0.22)' },
      { border: '#8BC34A', fill: 'rgba(139, 195, 74, 0.22)' },
    ];

    return {
      labels: departmentTrends.labels || [],
      datasets: (departmentTrends.series || []).slice(0, 3).map((dept, index) => {
        const colors = palette[index % palette.length];
        return {
          label: dept.department_name || dept.abbreviation || `Department ${index + 1}`,
          data: Array.isArray(dept.counts) ? dept.counts : [],
          tension: 0.45,
          borderColor: colors.border,
          backgroundColor: colors.fill,
          fill: true,
          borderWidth: 3,
          pointRadius: 5,
          pointHoverRadius: 8,
          pointBackgroundColor: '#ffffff',
          pointBorderColor: colors.border,
          pointBorderWidth: 2,
          pointStyle: 'circle',
        };
      }),
    };
  }, [departmentTrends]);

  const topDepartmentsOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'top',
        labels: {
          boxWidth: 12,
          padding: 18,
          usePointStyle: true,
        },
      },
      tooltip: {
        mode: 'nearest',
        intersect: false,
        padding: 10,
      },
    },
    interaction: {
      mode: 'nearest',
      intersect: false,
    },
    scales: {
      x: {
        grid: {
          display: true,
          color: 'rgba(0, 0, 0, 0.06)',
        },
        ticks: {
          color: '#4a4a4a',
          font: { size: 12 },
        },
      },
      y: {
        beginAtZero: true,
        grid: {
          borderDash: [4, 4],
          color: 'rgba(0, 0, 0, 0.06)',
        },
        ticks: {
          color: '#4a4a4a',
          font: { size: 12 },
        },
      },
    },
  }), []);

  const accountStatusData = useMemo(() => ({
    labels: ['Active', 'Suspended', 'Blocked'],
    datasets: [
      {
        label: 'Candidate accounts',
        data: [accountStats?.active || 0, accountStats?.suspended || 0, accountStats?.blocked || 0],
        backgroundColor: ['#4CAF50', '#FFB300', '#E91E63'],
      },
    ],
  }), [accountStats]);

  const accountStatusOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: { display: true },
      y: { beginAtZero: true },
    },
  }), []);

  const materialComparisonData = useMemo(() => ({
    labels: ['Question Papers', 'Reports', 'Presentations'],
    datasets: [
      {
        label: 'Downloads',
        data: [
          summary?.question_paper_downloads || 0,
          summary?.report_downloads || 0,
          summary?.presentation_downloads || 0,
        ],
        backgroundColor: 'rgba(33, 150, 243, 0.8)',
      },
      {
        label: 'Previews',
        data: [
          summary?.question_paper_previews || 0,
          summary?.report_previews || 0,
          summary?.presentation_previews || 0,
        ],
        backgroundColor: 'rgba(76, 175, 80, 0.8)',
      },
    ],
  }), [summary]);

  const materialComparisonOptions = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom' },
      tooltip: { mode: 'index', intersect: false },
    },
    scales: {
      x: {
        stacked: false,
      },
      y: {
        beginAtZero: true,
      },
    },
  }), []);

  return (
    <div className={styles.dashboard}>
      <Helmet>
        <title>Admin Dashboard | Acadex</title>
        <meta name="description" content="Admin analytic dashboard for Acadex." />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>

      {(loading || dataLoading) && <GraduationCapLoader fullscreen size={140} label="Loading admin analytics…" />}

      <div className={styles.header}>
        <div className={styles.profileArea}>
          <div className={styles.profilePic}>
            {avatarSrc ? (
              <img src={avatarSrc} alt={`${adminName} avatar`} />
            ) : (
              <span>{avatarLabel}</span>
            )}
          </div>
          <div>
            <div className={styles.welcome}>Hello, {adminName}</div>
            <div className={styles.subTitle}>Analytics hub for the admin portal</div>
          </div>
        </div>
        <div className={styles.activeIndicator} title="Active">
          <span className={styles.activeDot} />
          <span className={styles.activeLabel}>Active</span>
        </div>
      </div>

      <div className={styles.statsGrid}>
        {statCards.map((card) => (
          <div key={card.label} className={styles.statCard}>
            <div className={styles.statCardIcon}>
              {card.label.includes('Users') && <FaUsers />}
              {card.label.includes('Candidates') && <FaUsers />}
              {card.label.includes('Admin') && <FaUserCircle />}
              {card.label.includes('Departments') && <FaLayerGroup />}
              {card.label.includes('Question Papers') && <FaBook />}
              {card.label.includes('Reports') && <FaFileAlt />}
              {card.label.includes('Presentations') && <FaChartBar />}
            </div>
            <div className={styles.statCardContent}>
              <span className={styles.statCardLabel}>{card.label}</span>
              <span className={styles.statCardValue}>{card.value ?? 0}</span>
            </div>
          </div>
        ))}
      </div>

      <div className={styles.analyticsGrid}>
        <div className={styles.chartBox}>
          <h3>Top departments by candidate count</h3>
          <div className={styles.chartWrapper}>
            <Line data={topDepartmentsLineData} options={topDepartmentsOptions} />
          </div>
        </div>

        <div className={styles.chartBox}>
          <h3>Department trend lines</h3>
          <div className={styles.chartWrapper}>
            <Bar data={accountStatusData} options={accountStatusOptions} />
          </div>
        </div>
      </div>

      <div className={styles.bottomGrid}>
        <div className={styles.recentBox}>
          <div className={styles.sectionHeader}>
            <h3>Material download & preview comparison</h3>
          </div>
          <p>Review the total download and preview counts across question papers, reports, and presentations.</p>
          <div className={styles.chartWrapper}>
            <Bar data={materialComparisonData} options={materialComparisonOptions} />
          </div>
        </div>

        <div className={styles.recentBox}>
          <div className={styles.sectionHeader}>
            <h3>Recent candidate registrations</h3>
          </div>
          {recentRegistrations.length === 0 ? (
            <p>No recent registrations available.</p>
          ) : (
            <ul className={styles.registrationList}>
              {recentRegistrations.map((candidate) => (
                <li key={candidate.cand_id} className={styles.registrationItem}>
                  <div>
                    <strong>{candidate.name || maskCandidateId(candidate.cand_id)}</strong>
                    <div className={styles.rowSubtitle}>{candidate.email}</div>
                  </div>
                  <div className={styles.rowSubtitle}>{candidate.department_abbreviation || 'N/A'}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
};

export default AdminDashboard;
