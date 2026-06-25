import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
  const [showReportModal, setShowReportModal] = useState(false);
  const [overrideMetrics, setOverrideMetrics] = useState({
    impressions: 0,
    uniqueViewers: 0,
    clicks: 0,
    amountPaid: 0,
    modalOpens: 0,
    averageViewTimeSeconds: 0,
  });
  const [reportPeriod] = useState({ start: '01 Jun 2026', end: '07 Jun 2026' });
  const ad = useMemo(() => data?.ad ?? {}, [data]);
  const performance = useMemo(() => data?.performance ?? {}, [data]);
  const onGenerateReport = useCallback(() => setShowReportModal(true), []);

  const handlePrintReport = useCallback(() => {
    try {
      const ctr = overrideMetrics.impressions > 0 ? ((overrideMetrics.clicks / overrideMetrics.impressions) * 100) : 0;
      const printLogo = ad.logoUrl || `${process.env.PUBLIC_URL || ''}/hnd-mark.svg`;
      const reportTitle = 'ACADEX AD REPORT';
      const reportSubtitle = 'Campaign performance summary';
      const campaignId = `ADX-${(ad._id || '').toString().substring(0, 8).toUpperCase()}`;
      const campaignStatus = (performance.status || 'ACTIVE').toString().toUpperCase();
      const campaignType = ad.campaignType || 'Modal Advertisement';
      const campaignName = ad.title || 'N/A';
      const advertiser = ad.advertiserName || 'Acadex Platform';
      const reportRange = `${reportPeriod.start} - ${reportPeriod.end}`;
      const generatedDate = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });

      const printHtml = `
        <!doctype html>
        <html>
          <head>
            <meta charset="utf-8" />
            <title>Acadex Ad Report</title>
            <style>
              * { box-sizing: border-box; }
              body {
                margin: 0;
                padding: 0;
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                color: #0f172a;
                background: #f8fafc;
              }
              .page {
                width: 100%;
                max-width: 900px;
                margin: 0 auto;
                padding: 20px;
                background: #ffffff;
              }
              .page-header {
                border-bottom: 1px solid #e2e8f0;
                padding-bottom: 18px;
                margin-bottom: 22px;
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 16px;
              }
              .brand {
                display: flex;
                align-items: center;
                gap: 14px;
              }
              .brand img {
                width: 72px;
                height: 72px;
                object-fit: contain;
                border-radius: 18px;
                background: #f8fafc;
                padding: 10px;
              }
              .brand-title {
                text-transform: uppercase;
                letter-spacing: 0.12em;
                color: #111827;
                margin: 0;
                font-size: 18px;
              }
              .brand-subtitle {
                margin: 6px 0 0;
                color: #475569;
                font-size: 12px;
              }
              .report-meta {
                text-align: right;
                min-width: 180px;
              }
              .report-meta span {
                display: block;
                color: #475569;
                font-size: 12px;
              }
              .report-meta strong {
                display: block;
                margin-top: 4px;
                color: #0f172a;
                font-size: 14px;
              }
              .section-title {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin: 0 0 14px;
                font-size: 13px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
                color: #475569;
              }
              .tag {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                padding: 8px 12px;
                background: #eef7f4;
                color: #047857;
                font-size: 11px;
                font-weight: 700;
                border-radius: 999px;
              }
              .overview-grid,
              .stats-grid,
              .snapshot-grid,
              .meta-grid {
                display: grid;
                gap: 14px;
              }
              .meta-grid {
                grid-template-columns: repeat(4, minmax(160px, 1fr));
                margin-bottom: 20px;
              }
              .key-card,
              .stat-card,
              .snapshot-card,
              .footer-card {
                background: #f8fafc;
                border: 1px solid #e2e8f0;
                border-radius: 16px;
                padding: 16px;
              }
              .key-card .label,
              .snapshot-card .label {
                display: block;
                margin-bottom: 8px;
                color: #64748b;
                font-size: 11px;
                letter-spacing: 0.08em;
                text-transform: uppercase;
              }
              .key-card .value,
              .snapshot-card .value {
                color: #0f172a;
                font-size: 16px;
                font-weight: 700;
              }
              .stats-grid {
                grid-template-columns: repeat(3, minmax(180px, 1fr));
                margin-bottom: 20px;
              }
              .stat-card {
                padding: 18px;
                background: #ffffff;
                border-radius: 18px;
              }
              .stat-card span {
                display: block;
                color: #475569;
                margin-bottom: 10px;
                font-size: 12px;
              }
              .stat-card strong {
                color: #0f172a;
                font-size: 26px;
                line-height: 1;
              }
              .snapshot-grid {
                grid-template-columns: repeat(3, minmax(180px, 1fr));
                margin-bottom: 20px;
              }
              .snapshot-card {
                padding: 18px;
                background: #ffffff;
                border-radius: 18px;
              }
              .snapshot-card strong {
                display: block;
                margin-top: 10px;
                font-size: 22px;
                color: #111827;
              }
              .recommendation {
                padding: 18px;
                border-radius: 18px;
                background: linear-gradient(135deg, #fef3c7 0%, #fefce8 100%);
                border: 1px solid #fde68a;
                margin-bottom: 20px;
                color: #92400e;
                font-size: 13px;
                line-height: 1.7;
              }
              .support {
                border: 1px solid #e2e8f0;
                border-radius: 18px;
                padding: 18px;
                background: #ffffff;
              }
              .support h2 {
                margin: 0 0 10px;
                font-size: 14px;
                color: #0f172a;
              }
              .support p {
                margin: 4px 0;
                color: #475569;
                font-size: 13px;
              }
              @media print {
                body {
                  margin: 0;
                  padding: 0;
                  background: #ffffff;
                  -webkit-print-color-adjust: exact;
                  print-color-adjust: exact;
                }
                .page {
                  box-shadow: none;
                  margin: 0;
                  padding: 16px;
                }
                .page-header,
                .meta-grid,
                .stats-grid,
                .snapshot-grid,
                .support,
                .recommendation {
                  page-break-inside: avoid;
                }
                @page {
                  margin: 12mm;
                  size: auto;
                }
              }
            </style>
          </head>
          <body>
            <div class="page">
              <div class="page-header">
                <div class="brand">
                  <img src="${printLogo}" alt="Acadex logo" />
                  <div>
                    <p class="brand-title">${reportTitle}</p>
                    <p class="brand-subtitle">${reportSubtitle}</p>
                  </div>
                </div>
                <div class="report-meta">
                  <span>Report period</span>
                  <strong>${reportRange}</strong>
                  <span class="mt-2">Generated</span>
                  <strong>${generatedDate}</strong>
                </div>
              </div>

              <div class="meta-grid">
                <div class="key-card">
                  <span class="label">Client / Advertiser</span>
                  <span class="value">${advertiser}</span>
                </div>
                <div class="key-card">
                  <span class="label">Campaign</span>
                  <span class="value">${campaignName}</span>
                </div>
                <div class="key-card">
                  <span class="label">Ad ID</span>
                  <span class="value">${campaignId}</span>
                </div>
                <div class="key-card">
                  <span class="label">Status</span>
                  <span class="value">${campaignStatus}</span>
                </div>
              </div>

              <div class="section-title">
                <span>Campaign Summary</span>
                <span class="tag">${campaignType}</span>
              </div>

              <div class="stats-grid">
                <div class="stat-card">
                  <span>Impressions</span>
                  <strong>${(overrideMetrics.impressions || 0).toLocaleString()}</strong>
                </div>
                <div class="stat-card">
                  <span>Clicks</span>
                  <strong>${(overrideMetrics.clicks || 0).toLocaleString()}</strong>
                </div>
                <div class="stat-card">
                  <span>CTR</span>
                  <strong>${ctr.toFixed(2)}%</strong>
                </div>
              </div>

              <div class="section-title">Engagement Snapshot</div>
              <div class="snapshot-grid">
                <div class="snapshot-card">
                  <span class="label">Unique Viewers</span>
                  <strong>${(overrideMetrics.uniqueViewers || 0).toLocaleString()}</strong>
                </div>
                <div class="snapshot-card">
                  <span class="label">Modal Opens</span>
                  <strong>${(overrideMetrics.modalOpens || 0).toLocaleString()}</strong>
                </div>
                <div class="snapshot-card">
                  <span class="label">Average View Time</span>
                  <strong>${overrideMetrics.averageViewTimeSeconds || 0} sec</strong>
                </div>
              </div>

              <div class="recommendation">${performance.recommendation || 'Campaign is running. Monitor metrics for ongoing optimization.'}</div>

              <div class="support">
                <h2>ACADEX SUPPORT</h2>
                <p>acadex@gmail.com</p>
                <p>678507737</p>
                <p>www.acadexe.com</p>
                <p>brightstackinnovations@gmail.com</p>
              </div>
            </div>
          </body>
        </html>
      `;

      const iframe = document.createElement('iframe');
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      document.body.appendChild(iframe);

      const iframeDoc = iframe.contentWindow?.document;
      if (!iframeDoc || !iframe.contentWindow) {
        document.body.removeChild(iframe);
        showToast('Unable to prepare print preview.', 'error');
        return;
      }

      iframeDoc.open();
      iframeDoc.write(printHtml);
      iframeDoc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
        } finally {
          setTimeout(() => {
            if (document.body.contains(iframe)) {
              document.body.removeChild(iframe);
            }
          }, 600);
        }
      }, 200);
    } catch (err) {
      showToast('Failed to open print dialog.', 'error');
    }
  }, [ad, overrideMetrics, performance, reportPeriod]);

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

  useEffect(() => {
    if (!data?.performance) return;
    setOverrideMetrics({
      impressions: Number(data.performance.impressions || 0),
      uniqueViewers: Number(data.performance.uniqueViewers || 0),
      clicks: Number(data.performance.clicks || 0),
      amountPaid: Number(data.performance.amountPaid || 0),
      modalOpens: Number(data.performance.modalOpens || 0),
      averageViewTimeSeconds: Number(data.performance.averageViewTimeSeconds || 0),
    });
  }, [data]);

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

  const startDate = ad.startDate ? new Date(ad.startDate).toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }) : 'N/A';
  const endDate = ad.endDate ? new Date(ad.endDate).toLocaleDateString('en-GB', { year: 'numeric', month: '2-digit', day: '2-digit' }) : 'N/A';
  const createdDate = new Date(ad.createdAt).toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });
  const reportDate = new Date().toLocaleDateString('en-GB', { year: 'numeric', month: 'short', day: '2-digit' });
  const reportLogo = ad.logoUrl || `${process.env.PUBLIC_URL || ''}/hnd-mark.svg`;
  const computedCtr = overrideMetrics.impressions > 0 ? ((overrideMetrics.clicks / overrideMetrics.impressions) * 100) : 0;

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
          <button type="button" className={styles.printBtn} onClick={onGenerateReport}>
            GENERATE AD REPORT
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

      {/* Editable Metric Overrides */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>🛠️ Editable Report Values</h2>
        <div className={styles.overrideGrid}>
          <div className={styles.overrideField}>
            <label className={styles.fieldLabel}>Impressions</label>
            <input
              className={styles.fieldInput}
              type="number"
              min="0"
              value={overrideMetrics.impressions}
              onChange={(e) => setOverrideMetrics((prev) => ({ ...prev, impressions: Number(e.target.value) }))}
            />
          </div>
          <div className={styles.overrideField}>
            <label className={styles.fieldLabel}>Unique Viewers</label>
            <input
              className={styles.fieldInput}
              type="number"
              min="0"
              value={overrideMetrics.uniqueViewers}
              onChange={(e) => setOverrideMetrics((prev) => ({ ...prev, uniqueViewers: Number(e.target.value) }))}
            />
          </div>
          <div className={styles.overrideField}>
            <label className={styles.fieldLabel}>Clicks</label>
            <input
              className={styles.fieldInput}
              type="number"
              min="0"
              value={overrideMetrics.clicks}
              onChange={(e) => setOverrideMetrics((prev) => ({ ...prev, clicks: Number(e.target.value) }))}
            />
          </div>
          <div className={styles.overrideField}>
            <label className={styles.fieldLabel}>Amount Paid</label>
            <input
              className={styles.fieldInput}
              type="number"
              min="0"
              value={overrideMetrics.amountPaid}
              onChange={(e) => setOverrideMetrics((prev) => ({ ...prev, amountPaid: Number(e.target.value) }))}
            />
          </div>
          <div className={styles.overrideField}>
            <label className={styles.fieldLabel}>Modal Opens</label>
            <input
              className={styles.fieldInput}
              type="number"
              min="0"
              value={overrideMetrics.modalOpens}
              onChange={(e) => setOverrideMetrics((prev) => ({ ...prev, modalOpens: Number(e.target.value) }))}
            />
          </div>
          <div className={styles.overrideField}>
            <label className={styles.fieldLabel}>Avg View Time (sec)</label>
            <input
              className={styles.fieldInput}
              type="number"
              min="0"
              value={overrideMetrics.averageViewTimeSeconds}
              onChange={(e) => setOverrideMetrics((prev) => ({ ...prev, averageViewTimeSeconds: Number(e.target.value) }))}
            />
          </div>
        </div>
        <div className={styles.overridePreview}>
          <strong>Preview CTR:</strong> {computedCtr.toFixed(2)}%
        </div>
      </section>

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

      {showReportModal && (
        <div className={styles.modalBackdrop}>
          <div className={styles.reportModal}>
            <div className={styles.modalHeader}>
              <div>
                <h3>Ad Report Preview</h3>
                <p>Review the page-styled report before printing or sharing.</p>
              </div>
              <button className={styles.closeBtn} onClick={() => setShowReportModal(false)}>
                Close
              </button>
            </div>
            <div className={styles.reportPage}>
              <div className={styles.reportHeaderTop}>
                <div className={styles.reportThemeBadge}>ACADEX AD REPORT</div>
                <div className={styles.reportMetaInfo}>
                  <span>Report period</span>
                  <strong>{reportPeriod.start} - {reportPeriod.end}</strong>
                  <span>Generated</span>
                  <strong>{reportDate}</strong>
                </div>
              </div>

              <div className={styles.reportHero}>
                <img src={reportLogo} alt="Acadex logo" className={styles.reportHeroLogo} />
                <div>
                  <h2>ACADEX AD REPORT</h2>
                  <p className={styles.reportHeroSubtext}>Campaign performance summary</p>
                </div>
              </div>

              <div className={styles.reportMetaGrid}>
                <div className={styles.reportMetaCard}>
                  <span>Client / Advertiser</span>
                  <strong>{ad.advertiserName || 'Acadex Platform'}</strong>
                </div>
                <div className={styles.reportMetaCard}>
                  <span>Campaign Name</span>
                  <strong>{ad.title}</strong>
                </div>
                <div className={styles.reportMetaCard}>
                  <span>Ad ID</span>
                  <strong>ADX-{(ad._id || '').substring(0, 8).toUpperCase()}</strong>
                </div>
                <div className={styles.reportMetaCard}>
                  <span>Amount Paid</span>
                  <strong>{overrideMetrics.amountPaid.toLocaleString()} XAF</strong>
                </div>
              </div>

              <div className={styles.reportSummary}>
                <div className={styles.reportStatCard}>
                  <span>Impressions</span>
                  <strong>{overrideMetrics.impressions.toLocaleString()}</strong>
                </div>
                <div className={styles.reportStatCard}>
                  <span>Clicks</span>
                  <strong>{overrideMetrics.clicks.toLocaleString()}</strong>
                </div>
                <div className={styles.reportStatCard}>
                  <span>CTR</span>
                  <strong>{computedCtr.toFixed(2)}%</strong>
                </div>
              </div>

              <div className={styles.reportSection}>
                <h4>Engagement Snapshot</h4>
                <div className={styles.reportInfoGrid}>
                  <div className={styles.reportInfoCard}>
                    <span>Unique Viewers</span>
                    <strong>{overrideMetrics.uniqueViewers.toLocaleString()}</strong>
                  </div>
                  <div className={styles.reportInfoCard}>
                    <span>Modal Opens</span>
                    <strong>{overrideMetrics.modalOpens.toLocaleString()}</strong>
                  </div>
                  <div className={styles.reportInfoCard}>
                    <span>Average View Time</span>
                    <strong>{overrideMetrics.averageViewTimeSeconds} sec</strong>
                  </div>
                </div>
              </div>

              <div className={styles.recommendationBox}>
                <p>{performance.recommendation || 'Campaign is running. Monitor metrics for ongoing optimization.'}</p>
              </div>

              <div className={styles.supportFooter}>
                <div>
                  <h4>📧 ACADEX SUPPORT</h4>
                  <ul>
                    <li>acadex@gmail.com</li>
                    <li>678507737</li>
                    <li>www.acadexe.com</li>
                    <li>brightstackinnovations@gmail.com</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.printReportBtn} onClick={handlePrintReport}>
                Print Report
              </button>
              <button type="button" className={styles.secondaryBtn} onClick={() => setShowReportModal(false)}>
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}

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
