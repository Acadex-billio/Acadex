import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FaPlus, FaEdit, FaTrash, FaEye, FaEyeSlash, FaTimes, FaBullhorn } from 'react-icons/fa';
import styles from '../Astyles/AdsManager.module.css';
import api from '../services/api';
import { showToast } from '../utility/ToastNotification';

const AUDIENCE_OPTIONS = [
  { value: 'all', label: 'All users' },
  { value: 'candidate_all', label: 'All Candidates' },
  { value: 'first_time_candidate', label: 'First-time Candidate Login (one-time)' },
  { value: 'candidate_hnd', label: 'HND Candidates' },
  { value: 'candidate_bts', label: 'BTS Candidates' },
  { value: 'lecturer', label: 'Lecturers' },
  { value: 'admin', label: 'Admin users' },
  { value: 'developer', label: 'Developers' },
];

const ROUTE_OPTIONS = [
  '/candidate',
  '/candidate/question-papers',
  '/candidate/reports',
  '/candidate/presentations',
  '/candidate/announcements',
  '/candidate/chat',
  '/candidate/lecturers',
  '/candidate/history',
  '/candidate/activity',
  '/candidate/profile',
  '/candidate/settings',
  '/candidate/subscription',
  '/lecturer',
  '/lecturer/profile-verification',
  '/lecturer/bookings',
  '/lecturer/chat',
  '/lecturer/history',
  '/lecturer/settings',
  '/admin',
  '/admin/manage-users',
  '/admin/manage-candidates',
  '/admin/departments',
  '/admin/reports',
  '/admin/presentations',
  '/admin/question-papers',
  '/admin/announcements',
  '/admin/chat',
  '/admin/internship-topics',
  '/admin/activity',
  '/admin/history',
  '/admin/profile',
  '/admin/settings',
  '/admin/manage-billing',
  '/admin/lecturers',
  '/admin/ads',
];

const DEFAULT_STYLING = {
  backgroundColor: '#ffffff',
  textColor: '#1a1a1a',
  titleColor: '#1a1a1a',
  subtitleColor: '#575757',
  bodyColor: '#333333',
  tagBackgroundColor: 'rgba(0,0,0,0.08)',
  tagTextColor: '#111111',
  buttonColor: '#4caf50',
  buttonTextColor: '#ffffff',
  buttonBorderColor: 'transparent',
  buttonBorderRadius: '999px',
  buttonBorderWidth: '0px',
  overlayColor: 'rgba(0,0,0,0.55)',
  borderRadius: '16px',
  borderColor: 'transparent',
  imagePosition: 'top',
};

const EMPTY_FORM = {
  title: '',
  subtitle: '',
  body: '',
  logoUrl: '',
  tag: '',
  ctaText: '',
  ctaUrl: '',
  ctaSecondaryText: '',
  ctaSecondaryUrl: '',
  targetAudience: ['all'],
  displayType: 'modal',
  showCloseButton: true,
  closeOnTimer: false,
  closeTimerSeconds: 8,
  intervalSeconds: 3600,
  dailyCapPerUser: 0,
  priority: 0,
  displayScope: 'global',
  specificRoutes: [],
  startDate: '',
  endDate: '',
  styling: { ...DEFAULT_STYLING },
};

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString() : '-');

const ColorField = ({ label, name, value, onChange }) => (
  <div className={styles.colorField}>
    <label>{label}</label>
    <div className={styles.colorWrap}>
      <input
        type="color"
        value={value.startsWith('rgba') || value === 'transparent' ? '#000000' : value}
        onChange={(e) => onChange(name, e.target.value)}
        aria-label={label}
      />
      <input
        className={styles.colorHex}
        type="text"
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        aria-label={`${label} value`}
      />
    </div>
  </div>
);

const LivePreview = ({ form }) => {
  const style = {
    background: form.styling.backgroundColor || '#fff',
    color: form.styling.textColor || '#111',
    borderRadius: form.styling.borderRadius || '16px',
    border: `1px solid ${form.styling.borderColor || 'transparent'}`,
  };

  const titleStyle = {
    color: form.styling.titleColor || style.color,
  };

  const subtitleStyle = {
    color: form.styling.subtitleColor || '#575757',
  };

  const bodyStyle = {
    color: form.styling.bodyColor || '#333333',
  };

  const tagStyle = {
    background: form.styling.tagBackgroundColor || 'rgba(0,0,0,0.08)',
    color: form.styling.tagTextColor || '#111',
  };

  const buttonStyle = {
    background: form.styling.buttonColor || '#4caf50',
    color: form.styling.buttonTextColor || '#fff',
    borderColor: form.styling.buttonBorderColor || 'transparent',
    borderWidth: form.styling.buttonBorderWidth || '0px',
    borderStyle: 'solid',
    borderRadius: form.styling.buttonBorderRadius || '999px',
  };

  const showLogo = form.logoUrl;

  return (
    <div className={styles.previewWrap}>
      <div className={styles.previewHeader}>Live Preview</div>
      <div className={styles.previewCard} style={style}>
        {showLogo ? <div className={styles.previewLogo}><img src={form.logoUrl} alt="Logo preview" /></div> : null}
        {form.tag ? <span className={styles.previewTag} style={tagStyle}>{form.tag}</span> : null}
        <h3 className={styles.previewTitle} style={titleStyle}>{form.title || 'Your ad title'}</h3>
        {form.subtitle ? <p className={styles.previewSubtitle} style={subtitleStyle}>{form.subtitle}</p> : null}
        {form.body ? <p className={styles.previewBody} style={bodyStyle}>{form.body}</p> : null}
        <div className={styles.previewMeta}>
          <span>{form.displayType}</span>
          <span>interval {form.intervalSeconds}s</span>
          <span>daily cap {Number(form.dailyCapPerUser || 0) || 'unlimited'}</span>
        </div>
        <div className={styles.previewButtons}>
          {form.ctaText ? <button type="button" className={styles.previewBtn} style={buttonStyle}>{form.ctaText}</button> : null}
          {form.ctaSecondaryText ? <button type="button" className={styles.previewBtnGhost} style={{ borderColor: buttonStyle.borderColor, color: buttonStyle.color }}>{form.ctaSecondaryText}</button> : null}
        </div>
      </div>
    </div>
  );
};

const PerformanceView = ({ data, onChange, onSave }) => {
  if (!data) return <div>No data loaded. Click Refresh.</div>;

  const local = { ...data };
  const setField = (k, v) => {
    local[k] = v;
    if (typeof onChange === 'function') onChange({ ...local });
  };

  const calcDerived = (d) => {
    const impressions = Number(d.impressions || 0);
    const clicks = Number(d.clicks || 0);
    const registrations = Number(d.registrations || 0);
    const modalOpens = Number(d.modalOpens || 0);
    const dismissCount = Number(d.dismissCount || 0);
    const avgViewTime = Number(d.averageViewTimeSeconds || 0);

    return {
      ctr: impressions > 0 ? ((clicks / impressions) * 100).toFixed(2) : '0.00',
      conversionRate: clicks > 0 ? ((registrations / clicks) * 100).toFixed(2) : '0.00',
      dismissRate: modalOpens > 0 ? ((dismissCount / modalOpens) * 100).toFixed(2) : '0.00',
      avgViewTimeLabel: avgViewTime ? `${Math.floor(avgViewTime / 60)}m ${Math.round(avgViewTime % 60)}s` : '0s',
    };
  };

  const derived = calcDerived(local);

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div>
          <label>Impressions</label>
          <input type="number" className={styles.input} value={local.impressions ?? 0} onChange={(e) => setField('impressions', Number(e.target.value))} />
        </div>
        <div>
          <label>Unique Viewers</label>
          <input type="number" className={styles.input} value={local.uniqueViewers ?? 0} onChange={(e) => setField('uniqueViewers', Number(e.target.value))} />
        </div>
        <div>
          <label>Clicks</label>
          <input type="number" className={styles.input} value={local.clicks ?? 0} onChange={(e) => setField('clicks', Number(e.target.value))} />
        </div>
        <div>
          <label>CTR (%)</label>
          <input className={styles.input} value={`${derived.ctr}`} readOnly />
        </div>
        <div>
          <label>Registrations</label>
          <input type="number" className={styles.input} value={local.registrations ?? 0} onChange={(e) => setField('registrations', Number(e.target.value))} />
        </div>
        <div>
          <label>Conversion Rate (%)</label>
          <input className={styles.input} value={`${derived.conversionRate}`} readOnly />
        </div>
        <div>
          <label>Amount Paid</label>
          <input type="number" className={styles.input} value={local.amountPaid ?? ''} onChange={(e) => setField('amountPaid', Number(e.target.value))} />
        </div>
        <div>
          <label>Modal Opens</label>
          <input type="number" className={styles.input} value={local.modalOpens ?? 0} onChange={(e) => setField('modalOpens', Number(e.target.value))} />
        </div>
        <div>
          <label>Modal Closes</label>
          <input type="number" className={styles.input} value={local.modalCloses ?? 0} onChange={(e) => setField('modalCloses', Number(e.target.value))} />
        </div>
        <div>
          <label>Dismiss Count</label>
          <input type="number" className={styles.input} value={local.dismissCount ?? 0} onChange={(e) => setField('dismissCount', Number(e.target.value))} />
        </div>
        <div>
          <label>Dismiss Rate (%)</label>
          <input className={styles.input} value={`${derived.dismissRate}`} readOnly />
        </div>
        <div>
          <label>Avg. View Time</label>
          <input className={styles.input} value={derived.avgViewTimeLabel} readOnly />
        </div>
        <div style={{ gridColumn: '1 / -1' }}>
          <label>Peak Hours</label>
          <input className={styles.input} value={local.peakHours || ''} onChange={(e) => setField('peakHours', e.target.value)} />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <div className={styles.performanceGrid}>
          <div className={styles.performanceCard}>
            <strong>Audience by Department</strong>
            {Array.isArray(data.audienceByDept) && data.audienceByDept.length ? (
              data.audienceByDept.map((r) => <div key={r.department}>{r.department}: {r.count}</div>)
            ) : (<div className={styles.hint}>No audience breakdown available</div>)}
          </div>
          <div className={styles.performanceCard}>
            <strong>Audience by Program</strong>
            {Array.isArray(data.audienceByProgram) && data.audienceByProgram.length ? (
              data.audienceByProgram.map((r) => <div key={r.program}>{r.program}: {r.count}</div>)
            ) : (<div className={styles.hint}>No program analytics available</div>)}
          </div>
        </div>

        <div style={{ marginTop: 12 }}>
          <strong>Daily Views</strong>
          {Array.isArray(data.daily) && data.daily.length ? (
            <div style={{ maxHeight: 180, overflow: 'auto' }}>
              {data.daily.map((d) => <div key={d.day}>{d.day}: {d.impressions} views, {d.clicks} clicks</div>)}
            </div>
          ) : (<div className={styles.hint}>No daily data</div>)}
        </div>

        <div style={{ marginTop: 12, display: 'grid', gap: 12 }}>
          <div>
            <label>Link Analytics</label>
            <textarea className={styles.textarea} value={local.linkAnalyticsNotes || ''} onChange={(e) => setField('linkAnalyticsNotes', e.target.value)} placeholder="Describe link analytics or destination tracking details." />
          </div>
          <div>
            <label>Destination Tracking</label>
            <textarea className={styles.textarea} value={local.destinationTrackingNotes || ''} onChange={(e) => setField('destinationTrackingNotes', e.target.value)} placeholder="Record destination tracking information or link behavior." />
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label>Weekly Export Report</label>
            <textarea className={styles.textarea} value={local.weeklyReport || ''} onChange={(e) => setField('weeklyReport', e.target.value)} placeholder="Weekly summary / export notes." />
          </div>
          <div>
            <label>Monthly Export Report</label>
            <textarea className={styles.textarea} value={local.monthlyReport || ''} onChange={(e) => setField('monthlyReport', e.target.value)} placeholder="Monthly summary / export notes." />
          </div>
        </div>
        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label>Ads Duration Export Report</label>
            <textarea className={styles.textarea} value={local.durationReport || ''} onChange={(e) => setField('durationReport', e.target.value)} placeholder="Ad duration report details." />
          </div>
          <div>
            <label>Recommendation</label>
            <textarea className={styles.textarea} value={local.recommendation || ''} onChange={(e) => setField('recommendation', e.target.value)} placeholder="Recommendation based on performance." />
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <label>Notes</label>
          <textarea className={styles.textarea} value={local.notes || ''} onChange={(e) => setField('notes', e.target.value)} placeholder="Internal notes or comments." />
        </div>
      </div>

      <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className={styles.saveBtn} onClick={() => onSave(local)}>Save Overrides</button>
        <button type="button" className={styles.actionBtn} onClick={() => {
          const reportHtml = `
            <div style="font-family: Arial, sans-serif; padding: 24px;">
              <div style="display:flex; align-items:center; gap:16px; margin-bottom:24px;">
                <div><img src="https://www.acadexe.com/logo.png" alt="Acadex" style="height:42px; object-fit:contain;" onerror="this.style.display='none'"/></div>
                <div>
                  <h1 style="margin:0;font-size:24px;">Acadex Ad Performance Report</h1>
                  <div style="font-size:13px;color:#555;">Created: ${fmtDate(data.ad?.createdAt)}</div>
                </div>
              </div>
              <h2 style="font-size:18px; color:#111; margin-bottom:8px;">${data.ad?.title || ''}</h2>
              <div style="margin-bottom:16px;">
                <p><strong>Impressions:</strong> ${local.impressions}</p>
                <p><strong>Unique Viewers:</strong> ${local.uniqueViewers}</p>
                <p><strong>Clicks:</strong> ${local.clicks}</p>
                <p><strong>CTR:</strong> ${derived.ctr}%</p>
                <p><strong>Registrations:</strong> ${local.registrations}</p>
                <p><strong>Conversion Rate:</strong> ${derived.conversionRate}%</p>
                <p><strong>Amount Paid:</strong> ${local.amountPaid ?? 0}</p>
                <p><strong>Duration Report:</strong> ${local.durationReport || 'N/A'}</p>
                <p><strong>Recommendation:</strong> ${local.recommendation || 'No recommendation yet.'}</p>
              </div>
              <div style="border-top:1px solid #ddd; padding-top:16px; font-size:12px; color:#555;">
                <p>Acadex | https://www.acadexe.com</p>
                <p>Support: acadexmail@gmail.com | WhatsApp 678507737</p>
                <p>Powered by Brightstack Innovations, Douala Bonaberi</p>
              </div>
            </div>
          `;
          const w = window.open('', '_blank');
          w.document.write('<html><head><title>Acadex Ad Performance Report</title></head><body>');
          w.document.write(reportHtml);
          w.document.write('</body></html>');
          w.document.close();
          w.print();
        }}>Export PDF</button>
      </div>
    </div>
  );
};

const AdsManager = () => {
  const [ads, setAds] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [routeQuery, setRouteQuery] = useState('');
  const [customRoute, setCustomRoute] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoFileName, setLogoFileName] = useState('');
  const [perfOpen, setPerfOpen] = useState(false);
  const [perfAd, setPerfAd] = useState(null);
  const [perfLoading, setPerfLoading] = useState(false);
  const [perfData, setPerfData] = useState(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.get('/ads');
      setAds(Array.isArray(res.data?.ads) ? res.data.ads : []);
    } catch {
      showToast('Failed to load ads', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setRouteQuery('');
    setCustomRoute('');
    setLogoFileName('');
    setShowModal(true);
  };

  const openEdit = (ad) => {
    setEditingId(ad._id);
    setForm({
      title: ad.title || '',
      subtitle: ad.subtitle || '',
      body: ad.body || '',
      logoUrl: ad.logoUrl || '',
      tag: ad.tag || '',
      ctaText: ad.ctaText || '',
      ctaUrl: ad.ctaUrl || '',
      ctaSecondaryText: ad.ctaSecondaryText || '',
      ctaSecondaryUrl: ad.ctaSecondaryUrl || '',
      targetAudience: Array.isArray(ad.targetAudience) ? ad.targetAudience : ['all'],
      displayType: ad.displayType || 'modal',
      showCloseButton: ad.showCloseButton !== false,
      closeOnTimer: Boolean(ad.closeOnTimer),
      closeTimerSeconds: ad.closeTimerSeconds ?? 8,
      intervalSeconds: ad.intervalSeconds ?? 3600,
      dailyCapPerUser: ad.dailyCapPerUser ?? 0,
      priority: ad.priority ?? 0,
      displayScope: ad.displayScope || 'global',
      specificRoutes: Array.isArray(ad.specificRoutes) ? ad.specificRoutes : [],
      startDate: ad.startDate ? ad.startDate.slice(0, 10) : '',
      endDate: ad.endDate ? ad.endDate.slice(0, 10) : '',
      styling: { ...DEFAULT_STYLING, ...(ad.styling || {}) },
    });
    setRouteQuery('');
    setCustomRoute('');
    setLogoFileName('');
    setShowModal(true);
  };

  const set = (key, val) => setForm((prev) => ({ ...prev, [key]: val }));
  const setStyle = (key, val) => setForm((prev) => ({ ...prev, styling: { ...prev.styling, [key]: val } }));

  const toggleAudience = (val) => {
    setForm((prev) => {
      const current = prev.targetAudience;
      if (current.includes(val)) {
        const next = current.filter((v) => v !== val);
        return { ...prev, targetAudience: next.length ? next : ['all'] };
      }
      return { ...prev, targetAudience: [...current, val] };
    });
  };

  const toggleRoute = (route) => {
    setForm((prev) => {
      const exists = prev.specificRoutes.includes(route);
      return {
        ...prev,
        specificRoutes: exists ? prev.specificRoutes.filter((r) => r !== route) : [...prev.specificRoutes, route],
      };
    });
  };

  const addCustomRoute = () => {
    const next = customRoute.trim();
    if (!next) return;
    if (!next.startsWith('/')) {
      showToast('Route must start with /', 'warning');
      return;
    }
    setForm((prev) => ({
      ...prev,
      specificRoutes: prev.specificRoutes.includes(next) ? prev.specificRoutes : [...prev.specificRoutes, next],
    }));
    setCustomRoute('');
  };

  const uploadLogoFile = async (file) => {
    if (!file) return;
    setLogoUploading(true);
    try {
      const data = new FormData();
      data.append('logo', file, file.name);
      const res = await api.post('/ads/upload-logo', data);

      const nextLogoUrl = String(res.data?.logoUrl || '').trim();
      if (!nextLogoUrl) {
        showToast('Logo upload failed: no URL returned', 'error');
        return;
      }

      set('logoUrl', nextLogoUrl);
      setLogoFileName(file.name);
      showToast('Logo uploaded successfully', 'success');
    } catch (err) {
      const msg = err?.response?.data?.message || 'Failed to upload logo';
      showToast(msg, 'error');
    } finally {
      setLogoUploading(false);
    }
  };

  const filteredRouteOptions = useMemo(() => {
    const q = routeQuery.trim().toLowerCase();
    if (!q) return ROUTE_OPTIONS;
    return ROUTE_OPTIONS.filter((route) => route.toLowerCase().includes(q));
  }, [routeQuery]);

  const save = async (andPublish = false) => {
    if (!form.title.trim()) {
      showToast('Ad title is required', 'error');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        dailyCapPerUser: Math.max(0, Number(form.dailyCapPerUser || 0)),
        specificRoutes: Array.from(new Set(form.specificRoutes.map((r) => r.trim()).filter(Boolean))),
        startDate: form.startDate || null,
        endDate: form.endDate || null,
      };

      let adId = editingId;
      if (editingId) {
        const res = await api.put(`/ads/${editingId}`, payload);
        adId = res.data.ad._id;
        showToast('Ad updated', 'success');
      } else {
        const res = await api.post('/ads', payload);
        adId = res.data.ad._id;
        showToast('Ad created', 'success');
      }

      if (andPublish) {
        await api.post(`/ads/${adId}/publish`);
        showToast('Ad published', 'success');
      }

      setShowModal(false);
      load();
    } catch {
      showToast('Failed to save ad', 'error');
    } finally {
      setSaving(false);
    }
  };

  const togglePublish = async (ad) => {
    try {
      await api.post(ad.isPublished ? `/ads/${ad._id}/unpublish` : `/ads/${ad._id}/publish`);
      showToast(ad.isPublished ? 'Ad unpublished' : 'Ad published', 'success');
      load();
    } catch {
      showToast('Failed to update status', 'error');
    }
  };

  const remove = async (ad) => {
    if (!window.confirm(`Delete ad "${ad.title}"?`)) return;
    try {
      await api.delete(`/ads/${ad._id}`);
      showToast('Ad deleted', 'success');
      load();
    } catch {
      showToast('Failed to delete ad', 'error');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}><FaBullhorn style={{ marginRight: 8 }} />Ads Manager</h1>
        <button type="button" className={styles.createBtn} onClick={openCreate}><FaPlus /> New Ad</button>
      </div>

      {loading ? (
        <div className={styles.empty}>Loading ads...</div>
      ) : ads.length === 0 ? (
        <div className={styles.empty}>No ads yet. Create your first one.</div>
      ) : (
        <div className={styles.adList}>
          {ads.map((ad) => (
            <div key={ad._id} className={styles.adCard}>
              <div className={styles.adCardBody}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
                  <p className={styles.adCardTitle}>{ad.title}</p>
                  <span className={`${styles.badge} ${ad.isPublished ? styles.badgeGreen : styles.badgeGrey}`}>{ad.isPublished ? 'Published' : 'Draft'}</span>
                  <span className={`${styles.badge} ${styles.badgeBlue}`}>{ad.displayType}</span>
                </div>
                <div className={styles.adCardMeta}>
                  <span>Audience: {(ad.targetAudience || []).join(', ')}</span>
                  <span>Interval: {ad.intervalSeconds}s</span>
                  <span>Daily cap: {Number(ad.dailyCapPerUser || 0) > 0 ? ad.dailyCapPerUser : 'Unlimited'}</span>
                  {ad.displayScope === 'specific_routes' ? <span>Routes: {(ad.specificRoutes || []).length}</span> : <span>Global</span>}
                  {ad.startDate && <span>From {fmtDate(ad.startDate)}</span>}
                  {ad.endDate && <span>To {fmtDate(ad.endDate)}</span>}
                </div>
                <div className={styles.stats}>
                  <span>Views {ad.impressions ?? 0}</span>
                  <span>Clicks {ad.clicks ?? 0}</span>
                </div>
              </div>
              <div className={styles.adCardActions}>
                <button type="button" className={`${styles.actionBtn}`} onClick={async () => { setPerfAd(ad); setPerfOpen(true); setPerfLoading(true); try { const res = await api.get(`/ads/${ad._id}/performance`); setPerfData(res.data.performance); } catch (e) { showToast('Failed to load performance', 'error'); } finally { setPerfLoading(false); } }} title="View Performance">Perf</button>
                <button type="button" className={styles.actionBtn} onClick={() => openEdit(ad)} title="Edit"><FaEdit /> Edit</button>
                <button type="button" className={`${styles.actionBtn} ${ad.isPublished ? '' : styles.actionBtnPrimary}`} onClick={() => togglePublish(ad)}>
                  {ad.isPublished ? <><FaEyeSlash /> Unpublish</> : <><FaEye /> Publish</>}
                </button>
                <button type="button" className={`${styles.actionBtn} ${styles.actionBtnDanger}`} onClick={() => remove(ad)} title="Delete"><FaTrash /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {perfOpen && perfAd ? (
        <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) { setPerfOpen(false); setPerfData(null); } }}>
          <div className={styles.performanceModal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Performance - {perfAd.title}</h2>
              <button type="button" className={styles.closeBtn} onClick={() => { setPerfOpen(false); setPerfData(null); }} aria-label="Close"><FaTimes /></button>
            </div>
            <div className={styles.modalBody}>
              <div style={{ display: 'flex', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <p><strong>Ad</strong></p>
                  {perfAd.logoUrl ? <img src={perfAd.logoUrl} alt="logo" style={{ maxWidth: 120, maxHeight: 60, objectFit: 'contain' }} /> : <div style={{ height: 60 }} />}
                  <p>{perfAd.title}</p>
                  <p>Created: {fmtDate(perfAd.createdAt)}</p>
                </div>
                <div style={{ flex: 2 }}>
                  <p><strong>Metrics</strong></p>
                  {perfLoading ? <div>Loading...</div> : (
                    <PerformanceView data={perfData} onChange={(next) => setPerfData(next)} onSave={async (next) => {
                      try {
                        setPerfLoading(true);
                        const payload = {
                          impressions: Number(next.impressions || 0),
                          uniqueViewers: Number(next.uniqueViewers || 0),
                          clicks: Number(next.clicks || 0),
                          registrations: Number(next.registrations || 0),
                          amountPaid: Number(next.amountPaid || 0),
                          notes: next.notes || '',
                          modalOpens: Number(next.modalOpens || 0),
                          modalCloses: Number(next.modalCloses || 0),
                          dismissCount: Number(next.dismissCount || 0),
                          averageViewTimeSeconds: Number(next.averageViewTimeSeconds || 0),
                          peakHours: next.peakHours || '',
                          linkAnalyticsNotes: next.linkAnalyticsNotes || '',
                          destinationTrackingNotes: next.destinationTrackingNotes || '',
                          weeklyReport: next.weeklyReport || '',
                          monthlyReport: next.monthlyReport || '',
                          durationReport: next.durationReport || '',
                          recommendation: next.recommendation || '',
                        };
                        await api.put(`/ads/${perfAd._id}/performance`, payload);
                        showToast('Performance saved', 'success');
                      } catch (e) {
                        showToast('Failed to save performance', 'error');
                      } finally { setPerfLoading(false); }
                    }} />
                  )}
                </div>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.cancelBtn} onClick={() => { setPerfOpen(false); setPerfData(null); }}>Close</button>
              <button type="button" className={styles.saveBtn} onClick={async () => {
                // fetch performance
                try {
                  setPerfLoading(true);
                  const res = await api.get(`/ads/${perfAd._id}/performance`);
                  setPerfData(res.data.performance);
                } catch (e) {
                  showToast('Failed to load performance', 'error');
                } finally { setPerfLoading(false); }
              }}>Refresh</button>
              <button type="button" className={styles.saveBtn} style={{ background: '#1976d2' }} onClick={() => {
                // open print view
                const html = document.querySelector(`.${styles.performanceModal}`).outerHTML;
                const w = window.open('', '_blank');
                w.document.write('<html><head><title>Ad Performance</title></head><body>');
                w.document.write(html);
                w.document.write('</body></html>');
                w.document.close();
                w.print();
              }}>Export PDF</button>
            </div>
          </div>
        </div>
      ) : null}

      {showModal && (
        <div className={styles.overlay} onClick={(e) => { if (e.target === e.currentTarget) setShowModal(false); }}>
          <div className={styles.modal}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>{editingId ? 'Edit Ad' : 'Create Ad'}</h2>
              <button type="button" className={styles.closeBtn} onClick={() => setShowModal(false)} aria-label="Close"><FaTimes /></button>
            </div>

            <div className={styles.modalBody}>
              <LivePreview form={form} />

              <div className={styles.section}>
                <p className={styles.sectionTitle}>Content</p>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label>Title *</label>
                    <input className={styles.input} value={form.title} onChange={(e) => set('title', e.target.value)} placeholder="Ad headline" />
                  </div>
                  <div className={styles.field}>
                    <label>Tag</label>
                    <input className={styles.input} value={form.tag} onChange={(e) => set('tag', e.target.value)} placeholder="NEW" />
                  </div>
                </div>
                <div className={styles.field}>
                  <label>Subtitle</label>
                  <input className={styles.input} value={form.subtitle} onChange={(e) => set('subtitle', e.target.value)} placeholder="Optional subtitle" />
                </div>
                <div className={styles.field}>
                  <label>Body</label>
                  <textarea className={styles.textarea} value={form.body} onChange={(e) => set('body', e.target.value)} placeholder="Optional body text" />
                </div>
                <div className={styles.field}>
                  <label>Logo file (PNG/JPG, max 5MB)</label>
                  <input
                    type="file"
                    className={styles.input}
                    accept="image/png,image/jpeg,image/jpg"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) uploadLogoFile(f);
                    }}
                  />
                  <span className={styles.hint}>
                    {logoUploading
                      ? 'Uploading logo...'
                      : (form.logoUrl ? `Uploaded: ${logoFileName || 'logo file ready'}` : 'No logo uploaded yet')}
                  </span>
                  {form.logoUrl ? (
                    <button
                      type="button"
                      className={styles.actionBtn}
                      onClick={() => {
                        set('logoUrl', '');
                        setLogoFileName('');
                      }}
                    >
                      Remove logo
                    </button>
                  ) : null}
                </div>
              </div>

              <div className={styles.section}>
                <p className={styles.sectionTitle}>CTA</p>
                <div className={styles.row}>
                  <div className={styles.field}><label>Primary text</label><input className={styles.input} value={form.ctaText} onChange={(e) => set('ctaText', e.target.value)} /></div>
                  <div className={styles.field}><label>Primary URL</label><input className={styles.input} value={form.ctaUrl} onChange={(e) => set('ctaUrl', e.target.value)} /></div>
                </div>
                <div className={styles.row}>
                  <div className={styles.field}><label>Secondary text</label><input className={styles.input} value={form.ctaSecondaryText} onChange={(e) => set('ctaSecondaryText', e.target.value)} /></div>
                  <div className={styles.field}><label>Secondary URL</label><input className={styles.input} value={form.ctaSecondaryUrl} onChange={(e) => set('ctaSecondaryUrl', e.target.value)} /></div>
                </div>
              </div>

              <div className={styles.section}>
                <p className={styles.sectionTitle}>Audience Targeting</p>
                <div className={styles.audienceGrid}>
                  {AUDIENCE_OPTIONS.map(({ value, label }) => (
                    <label key={value} className={`${styles.audienceChip} ${form.targetAudience.includes(value) ? styles.selected : ''}`}>
                      <input type="checkbox" checked={form.targetAudience.includes(value)} onChange={() => toggleAudience(value)} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              <div className={styles.section}>
                <p className={styles.sectionTitle}>Behavior</p>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label>Display type</label>
                    <select className={styles.select} value={form.displayType} onChange={(e) => set('displayType', e.target.value)}>
                      <option value="modal">Modal</option>
                      <option value="banner_top">Banner Top</option>
                      <option value="banner_bottom">Banner Bottom</option>
                    </select>
                  </div>
                  <div className={styles.field}>
                    <label>Interval (seconds)</label>
                    <input type="number" min={0} className={styles.input} value={form.intervalSeconds} onChange={(e) => set('intervalSeconds', Number(e.target.value))} />
                    <span className={styles.hint}>0 means every eligible visit.</span>
                  </div>
                </div>
                <div className={styles.row}>
                  <div className={styles.field}>
                    <label>Daily cap per user</label>
                    <input type="number" min={0} className={styles.input} value={form.dailyCapPerUser} onChange={(e) => set('dailyCapPerUser', Number(e.target.value))} />
                    <span className={styles.hint}>0 means unlimited. Example: 3 means max 3 shows per user per day.</span>
                  </div>
                  <div className={styles.field}>
                    <label>Priority</label>
                    <input type="number" className={styles.input} value={form.priority} onChange={(e) => set('priority', Number(e.target.value))} />
                  </div>
                </div>
                <div className={styles.row}>
                  <label className={styles.checkRow}><input type="checkbox" checked={form.showCloseButton} onChange={(e) => set('showCloseButton', e.target.checked)} />Show close button</label>
                  <label className={styles.checkRow}><input type="checkbox" checked={form.closeOnTimer} onChange={(e) => set('closeOnTimer', e.target.checked)} />Auto close on timer</label>
                </div>
                {form.closeOnTimer ? (
                  <div className={styles.field}>
                    <label>Auto close after (seconds)</label>
                    <input type="number" min={1} max={120} className={styles.input} value={form.closeTimerSeconds} onChange={(e) => set('closeTimerSeconds', Number(e.target.value))} />
                  </div>
                ) : null}
              </div>

              <div className={styles.section}>
                <p className={styles.sectionTitle}>Route Targeting</p>
                <div className={styles.field}>
                  <label>Display scope</label>
                  <select className={styles.select} value={form.displayScope} onChange={(e) => set('displayScope', e.target.value)}>
                    <option value="global">Global</option>
                    <option value="specific_routes">Specific routes</option>
                  </select>
                </div>

                {form.displayScope === 'specific_routes' ? (
                  <>
                    <div className={styles.field}>
                      <label>Find route</label>
                      <input className={styles.input} value={routeQuery} onChange={(e) => setRouteQuery(e.target.value)} placeholder="Search routes..." />
                    </div>

                    <div className={styles.routePickerGrid}>
                      {filteredRouteOptions.map((route) => (
                        <label key={route} className={`${styles.routeChip} ${form.specificRoutes.includes(route) ? styles.selectedRoute : ''}`}>
                          <input type="checkbox" checked={form.specificRoutes.includes(route)} onChange={() => toggleRoute(route)} />
                          <span>{route}</span>
                        </label>
                      ))}
                    </div>

                    <div className={styles.field}>
                      <label>Add custom route</label>
                      <div className={styles.customRouteRow}>
                        <input className={styles.input} value={customRoute} onChange={(e) => setCustomRoute(e.target.value)} placeholder="/custom/landing" />
                        <button type="button" className={styles.actionBtn} onClick={addCustomRoute}>Add</button>
                      </div>
                    </div>

                    <div className={styles.selectedRoutesWrap}>
                      {form.specificRoutes.length === 0 ? (
                        <span className={styles.hint}>No selected routes yet.</span>
                      ) : form.specificRoutes.map((route) => (
                        <button key={route} type="button" className={styles.selectedRouteTag} onClick={() => toggleRoute(route)} title="Remove route">
                          {route} <FaTimes />
                        </button>
                      ))}
                    </div>
                  </>
                ) : null}
              </div>

              <div className={styles.section}>
                <p className={styles.sectionTitle}>Schedule (optional)</p>
                <div className={styles.row}>
                  <div className={styles.field}><label>Start date</label><input type="date" className={styles.input} value={form.startDate} onChange={(e) => set('startDate', e.target.value)} /></div>
                  <div className={styles.field}><label>End date</label><input type="date" className={styles.input} value={form.endDate} onChange={(e) => set('endDate', e.target.value)} /></div>
                </div>
              </div>

              <div className={styles.section}>
                <p className={styles.sectionTitle}>Styling</p>
                <div className={styles.colorRow}>
                  <ColorField label="Background" name="backgroundColor" value={form.styling.backgroundColor} onChange={setStyle} />
                  <ColorField label="Text" name="textColor" value={form.styling.textColor} onChange={setStyle} />
                  <ColorField label="Title" name="titleColor" value={form.styling.titleColor} onChange={setStyle} />
                  <ColorField label="Subtitle" name="subtitleColor" value={form.styling.subtitleColor} onChange={setStyle} />
                  <ColorField label="Body" name="bodyColor" value={form.styling.bodyColor} onChange={setStyle} />
                  <ColorField label="Tag bg" name="tagBackgroundColor" value={form.styling.tagBackgroundColor} onChange={setStyle} />
                  <ColorField label="Tag text" name="tagTextColor" value={form.styling.tagTextColor} onChange={setStyle} />
                  <ColorField label="Button" name="buttonColor" value={form.styling.buttonColor} onChange={setStyle} />
                  <ColorField label="Button text" name="buttonTextColor" value={form.styling.buttonTextColor} onChange={setStyle} />
                  <ColorField label="Button border" name="buttonBorderColor" value={form.styling.buttonBorderColor} onChange={setStyle} />
                  <ColorField label="Overlay" name="overlayColor" value={form.styling.overlayColor} onChange={setStyle} />
                  <ColorField label="Border" name="borderColor" value={form.styling.borderColor} onChange={setStyle} />
                </div>
                <div className={styles.row}>
                  <div className={styles.field}><label>Border radius</label><input className={styles.input} value={form.styling.borderRadius} onChange={(e) => setStyle('borderRadius', e.target.value)} /></div>
                  <div className={styles.field}><label>Button border radius</label><input className={styles.input} value={form.styling.buttonBorderRadius} onChange={(e) => setStyle('buttonBorderRadius', e.target.value)} /></div>
                  <div className={styles.field}><label>Button border width</label><input className={styles.input} value={form.styling.buttonBorderWidth} onChange={(e) => setStyle('buttonBorderWidth', e.target.value)} /></div>
                  <div className={styles.field}>
                    <label>Image position</label>
                    <select className={styles.select} value={form.styling.imagePosition} onChange={(e) => setStyle('imagePosition', e.target.value)}>
                      <option value="top">Top</option>
                      <option value="left">Left</option>
                      <option value="right">Right</option>
                      <option value="background">Background</option>
                      <option value="none">Hidden</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div className={styles.modalFooter}>
              <button type="button" className={styles.cancelBtn} onClick={() => setShowModal(false)}>Cancel</button>
              <button type="button" className={styles.saveBtn} onClick={() => save(false)} disabled={saving}>{saving ? 'Saving...' : 'Save Draft'}</button>
              <button type="button" className={styles.saveBtn} style={{ background: '#1976d2' }} onClick={() => save(true)} disabled={saving}>{saving ? 'Saving...' : 'Save & Publish'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdsManager;
