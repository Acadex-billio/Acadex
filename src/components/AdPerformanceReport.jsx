import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { FaArrowLeft, FaChartLine, FaEye, FaUser, FaPercent } from 'react-icons/fa';
import styles from '../Astyles/AdPerformanceReport.module.css';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';

const AdPerformanceReport = () => {
  const { adId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);
  const [reportPeriod] = useState({ start: '01 Jun 2026', end: '07 Jun 2026' });
  const onPrint = useCallback(() => window.print(), []);

  useEffect(() => {
    const fetchPerformance = async () => {
      try {
        setLoading(true);
        const response = await api.get(`/ads/${adId}/performance`);
        if (response.data.success) {
          setData(response.data);
        }
      } catch (error) {
        showToast('Failed to load performance data', 'error');
      } finally {
        setLoading(false);
      }
    };

    fetchPerformance();
  }, [adId]);

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading performance data...</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>Failed to load performance data</div>
      </div>
    );
  }

  const { ad, performance } = data;
  const startDate = ad.startDate ? new Date(ad.startDate).toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }) : 'N/A';
  const endDate = ad.endDate ? new Date(ad.endDate).toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }) : 'N/A';
  const createdDate = new Date(ad.createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });
  const reportLogo = ad.logoUrl || `${process.env.PUBLIC_URL || ''}/hnd-mark.svg`;

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div>
          <button onClick={() => navigate(-1)} className={styles.backBtn} title="Go back">
            <FaArrowLeft /> Back
          </button>
        </div>
        <div className={styles.titleSection}>
          <div className={styles.reportLogoWrapper}>
            <img src={reportLogo} alt="Ad logo" className={styles.reportLogo} onError={(e) => { e.currentTarget.src = `${process.env.PUBLIC_URL || ''}/hnd-mark.svg`; }} />
          </div>
          <h1 className={styles.pageTitle}>AD PERFORMANCE REPORT</h1>
          <p className={styles.platformName}>ACADEX PLATFORM</p>
          <p className={styles.description}>Comprehensive performance overview of your advertisement campaign on the Acadex platform.</p>
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.printBtn} onClick={onPrint}>
            PRINT PERFORMANCE
          </button>
        </div>
        <div className={styles.reportPeriod}>
          <div className={styles.periodLabel}>REPORT PERIOD</div>
          <div className={styles.periodDates}>{reportPeriod.start} - {reportPeriod.end}</div>
          <div className={styles.generatedDate}>Generated on: {createdDate}</div>
        </div>
      </div>

      {/* Client & Campaign Information */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.titleIcon}>👤</span>
          CLIENT & CAMPAIGN INFORMATION
        </h2>
        <div className={styles.infoGrid}>
          <div className={styles.infoRow}>
            <span className={styles.label}>Client / Advertiser</span>
            <span className={styles.value}>{ad.advertiserName || 'Acadex Platform'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Campaign Name</span>
            <span className={styles.value}>{ad.title}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Ad ID</span>
            <span className={styles.value}>ADX-{ad._id.substring(0, 8).toUpperCase()}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Campaign Type</span>
            <span className={styles.value}>{ad.campaignType || 'Modal Advertisement'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Amount Paid</span>
            <span className={styles.value}>{performance.amountPaid.toLocaleString()} XAF</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Campaign Duration</span>
            <span className={styles.value}>{startDate} - {endDate}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Target Audience</span>
            <span className={styles.value}>{Array.isArray(ad.targetAudience) ? ad.targetAudience.join(', ') : 'All Users'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.label}>Status</span>
            <span className={`${styles.value} ${styles.statusActive}`}>{performance.status?.toUpperCase() || 'ACTIVE'}</span>
          </div>
        </div>
      </section>

      {/* About Acadex */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.titleIcon}>🏛️</span>
          ABOUT ACADEX
        </h2>
        <p className={styles.aboutText}>
          Acadex is a smart academic management and collaboration platform built for students, lecturers, departments, and institutions.
          We help you Connect, Manage & Excel.
        </p>
        <div className={styles.statsGrid}>
          <div className={styles.stat}>
            <div className={styles.statValue}>500+</div>
            <div className={styles.statLabel}>Active Users</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue}>20+</div>
            <div className={styles.statLabel}>Departments</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue}>1000+</div>
            <div className={styles.statLabel}>Resources</div>
          </div>
          <div className={styles.stat}>
            <div className={styles.statValue}>Real-time</div>
            <div className={styles.statLabel}>Insights</div>
          </div>
        </div>
      </section>

      {/* Performance Overview */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>
          <span className={styles.titleIcon}>📊</span>
          PERFORMANCE OVERVIEW
        </h2>
        <div className={styles.metricsGrid}>
          <MetricCard
            icon={<FaEye />}
            label="Impressions"
              value={(performance.impressions || 0).toLocaleString()}
            description="Total ad displays"
            color="#4A90E2"
          />
          <MetricCard
            icon={<FaUser />}
            label="Unique Viewers"
            value={(performance.uniqueViewers || 0).toLocaleString()}
            description="Distinct users reached"
            color="#7ED321"
          />
          <MetricCard
            icon={<span style={{ fontSize: 22 }}>🖱️</span>}
            label="Clicks"
            value={(performance.clicks || 0).toLocaleString()}
            description="Total CTA clicks"
            color="#F5A623"
          />
          <MetricCard
            icon={<FaPercent />}
            label="CTR"
            value={`${(performance.ctr || 0).toFixed(2)}%`}
            description="Clicks / Impressions"
            color="#BD10E0"
          />
          <MetricCard
            icon={<FaChartLine />}
            label="Peak Impression"
            value={(performance.peakImpression || 0).toLocaleString()}
            description="Highest daily reach"
            color="#50E3C2"
          />
          
        </div>
      </section>

      {/* Daily Impressions Trend - hide section when there's no daily data */}
      {/* Daily impressions trend removed per request */}

      {/* Audience Analytics */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>👥 AUDIENCE ANALYTICS</h2>
        <div className={styles.audienceGrid}>
          <div className={styles.audienceCard}>
            <h3>By Department</h3>
            <div className={styles.pieChart}>
              <PieChart data={performance.audienceByDept} />
            </div>
          </div>
          <div className={styles.audienceCard}>
            <h3>By Program</h3>
            <div className={styles.pieChart}>
              <PieChart data={performance.audienceByProgram} />
            </div>
          </div>
        </div>
      </section>

      {/* Engagement Metrics */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>⚙️ ENGAGEMENT METRICS</h2>
        <div className={styles.engagementGrid}>
          <EngagementItem label="Modal Opened" value={(performance.modalOpens || 0).toLocaleString()} />
          <EngagementItem label="Modal Closed" value={(performance.modalCloses || 0).toLocaleString()} />
          <EngagementItem label="Dismiss Rate" value={`${(performance.dismissRate || performance.dismissRate === 0 ? performance.dismissRate : performance.dismissCount ? (performance.dismissCount / Math.max(performance.modalOpens || 1,1) * 100) : 0).toFixed(1)}%`} />
          <EngagementItem label="Average Time Viewed" value={`${Math.round(performance.averageViewTimeSeconds || 0)} sec`} />
        </div>
      </section>

      {/* Link Analytics */}
      {performance.linkAnalytics && performance.linkAnalytics.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>🔗 LINK ANALYTICS</h2>
          <div className={styles.linkAnalyticsTable}>
            <div className={styles.tableHeader}>
              <div className={styles.tableCol}>Destination</div>
              <div className={styles.tableCol}>Clicks</div>
            </div>
            {performance.linkAnalytics.map((link, idx) => (
              <div key={idx} className={styles.tableRow}>
                <div className={styles.tableCol}>{link._id || 'Direct'}</div>
                <div className={styles.tableCol}>{link.clicks}</div>
              </div>
            ))}
            <div className={styles.tableRow} style={{ borderTop: '2px solid #ddd' }}>
              <div className={styles.tableCol} style={{ fontWeight: 'bold' }}>Total Clicks</div>
              <div className={styles.tableCol} style={{ fontWeight: 'bold', color: '#4caf50' }}>
                {performance.linkAnalytics.reduce((sum, l) => sum + l.clicks, 0)}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Performance Recommendation */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>⭐ PERFORMANCE RECOMMENDATION</h2>
        <div className={styles.recommendationBox}>
          <p>{performance.recommendation || 'Campaign is running. Monitor metrics for ongoing optimization.'}</p>
        </div>
      </section>

      <section className={styles.bottomPrintSection}>
        <button type="button" className={styles.printBtn} onClick={onPrint}>
          PRINT PERFORMANCE
        </button>
      </section>

      {/* Footer */}
      <section className={styles.footer}>
        <div className={styles.footerSection}>
          <h3>📧 ACADEX SUPPORT</h3>
          <div className={styles.footerContent}>
            <p>📧 acadexmail@gmail.com</p>
            <p>💬 +237 678507737</p>
            <p>🌐 www.acadexe.com</p>
          </div>
        </div>
        <div className={styles.footerSection}>
          <h3>⚡ POWERED BY BRIGHTSTACKINNOVATIONS</h3>
          <div className={styles.footerContent}>
            <p>📧 brightstackinnovations26@gmail.com</p>
            <p>🌐 brightstackinnovations2026.com</p>
          </div>
        </div>
      </section>

      <div className={styles.copyright}>© 2026 BRIGHTSTACKINNOVATIONS. All Rights Reserved.</div>
    </div>
  );
};

// Metric Card Component
const MetricCard = ({ icon, label, value, description, color }) => (
  <div className={styles.metricCard} style={{ borderLeftColor: color }}>
    <div className={styles.metricIcon} style={{ color }}>
      {icon}
    </div>
    <div className={styles.metricContent}>
      <h3>{label}</h3>
      <p className={styles.metricValue}>{value}</p>
      <small>{description}</small>
    </div>
  </div>
);

// Daily chart removed (previously DailyChart)

// Pie Chart Component
const PieChart = ({ data }) => {
  if (!data || data.length === 0) {
    return <p className={styles.noData}>No data available</p>;
  }

  const colors = [
    '#4A90E2',
    '#7ED321',
    '#F5A623',
    '#BD10E0',
    '#50E3C2',
    '#B8E986',
    '#F8E71C',
    '#FF6B6B',
  ];

  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div className={styles.pieChartWrapper}>
      <div className={styles.pieChartLegend}>
        {data.map((item, idx) => (
          <div key={idx} className={styles.legendItem}>
            <span
              className={styles.colorBox}
              style={{ backgroundColor: colors[idx % colors.length] }}
            />
            <span className={styles.legendLabel}>
              {item.department || item.program}: {item.count} ({((item.count / total) * 100).toFixed(0)}%)
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Engagement Item Component
const EngagementItem = ({ label, value }) => (
  <div className={styles.engagementItem}>
    <div className={styles.engagementValue}>{value}</div>
    <div className={styles.engagementLabel}>{label}</div>
  </div>
);

export default AdPerformanceReport;
