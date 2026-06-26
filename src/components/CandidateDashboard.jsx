import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api";
import { useAuth } from "../context/AuthContext";
import {
  FaChevronRight,
  FaCircle,
  FaUserCircle,
} from "react-icons/fa";
import styles from "../Astyles/CanDashboard.module.css";
import { showToast } from "../utility/ToastNotification";
import { getErrorMessage } from "../utility/getErrorMessage";
import ProgramUpdateRequestModal from './ProgramUpdateRequestModal';

const getBackendOrigin = () => api.defaults.baseURL?.replace(/\/api$/, '')?.replace(/\/$/, '') || '';
const buildImageUrl = (url) => {
  if (!url) return null;
  const backendOrigin = getBackendOrigin();
  if (url.startsWith('http')) return url;
  if (url.startsWith('/')) return `${backendOrigin}${url}`;
  return `${backendOrigin}/${url}`;
};

const CandidateDashboard = () => {
  const navigate = useNavigate();
  const { user: authUser } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [dashboard, setDashboard] = useState({
    user: {},
    questionPapers: [],
    reports: [],
    presentations: [],
    courseMates: [],
    currentAnnouncement: null,
    downloads: 0,
  });
  const userEmail = authUser?.email || "";

  useEffect(() => {
    api
      .get(`/candidate/dashboard`)
      .then((res) => {
        if (!res.data?.success) throw new Error(res.data?.message || "Failed to load dashboard");
        setDashboard(res.data);
      })
      .catch((err) => {
        const msg = getErrorMessage(err, "Failed to load dashboard. Check connection and try again.");
        setError(msg);
        showToast(msg, "error");
      })
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className={styles.state}>Loading dashboard…</div>;
  if (error) return <div className={styles.stateError}>{error}</div>;

  const { user, questionPapers, reports, presentations, courseMates, downloads } = dashboard;
  const currentAnnouncement = dashboard.currentAnnouncement || null;

  const today = new Date().toLocaleString("en-US", {
    weekday: "long",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  const dayLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const jsDay = new Date().getDay(); // 0 = Sun, 1 = Mon
  const currentDayIndex = jsDay === 0 ? 6 : jsDay - 1;
  const weekValues = dayLabels.map((_, idx) => {
    if (idx < currentDayIndex) return 58;
    if (idx === currentDayIndex) return 86;
    return 34;
  });

  const announcementText = currentAnnouncement
    ? `${currentAnnouncement.title} · ${currentAnnouncement.source}`
    : 'NO ACTIVE UPDATE';

  const planCode = String(authUser?.subscription?.plan || 'basic').toLowerCase();
  const planLabelMap = {
    pro: 'Pro',
    basic: 'Basic',
    paygo: 'Paygo',
  };
  const planLabel = planLabelMap[planCode] || planCode.charAt(0).toUpperCase() + planCode.slice(1);

  return (
    <div className={styles.layout}>
      <ProgramUpdateRequestModal />
      {/* SIDEBAR */}
      {/* MAIN */}
      <main className={styles.main}>
        {/* PROFILE CARD */}
        <section className={styles.profileCard}>
          <div className={styles.profileLeft}>
            <img
              src={buildImageUrl(user.profilePicture, user.id) || ''}
              alt="Candidate"
              className={styles.avatar}
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                const fallback = e.currentTarget.nextElementSibling;
                if (fallback) fallback.style.display = 'flex';
              }}
            />
            <div className={styles.avatarFallback} style={{ display: buildImageUrl(user.profilePicture, user.id) ? 'none' : 'flex' }}>
              <FaUserCircle />
            </div>
            <div className={styles.profileText}>
              <h2>{user.name}</h2>
              <p className={styles.department}>{user.department}</p>
              <div className={styles.profileTimeRow}>
                <span className={styles.profileTimeDot} />
                <span>{today}</span>
              </div>
              <span className={styles.email}>{userEmail}</span>

              <div className={styles.matesPreview}>
                {courseMates.map((m) => (
                  <div key={m.id} title={m.name} className={styles.friendAvatarWrap}>
                    {buildImageUrl(m.profile_picture) ? (
                      <img
                        src={buildImageUrl(m.profile_picture)}
                        alt={m.name}
                        className={styles.friendAvatar}
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.nextElementSibling;
                          if (fallback) fallback.style.display = 'flex';
                        }}
                      />
                    ) : null}
                    <div className={styles.friendAvatarFallback} style={{ display: buildImageUrl(m.profile_picture) ? 'none' : 'flex' }}>
                      <FaUserCircle />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.divider} />

          <div className={styles.deptBlock}>
            <div className={styles.deptAbbr}>{user.departmentAbbr}</div>
            <div className={styles.deptFull}>{user.department}</div>
          </div>

          <div className={styles.divider} />

          <div className={styles.statusBlock}>
            <FaCircle className={`${styles.statusIcon} ${styles.active}`} />
            <span className={styles.statusText}>{user.status}</span>
          </div>

          <button
            type="button"
            className={`${styles.subscriptionCard} ${styles.subscriptionCardBtn}`}
            onClick={() => navigate('/candidate/subscription')}
            aria-label="Open subscription page"
          >
            <span className={styles.subscriptionText}>Subscription: {planLabel}</span>
            <FaChevronRight className={styles.dateArrow} />
          </button>
        </section>

        {/* MID GRID */}
        <section className={styles.midGrid}>
          <div className={styles.downloadCard}>
            <h3>Downloads Overview</h3>
            <div className={styles.downloadStats}>
              <div className={styles.miniStat}><strong>{questionPapers.length}</strong><span>Papers</span></div>
              <div className={styles.miniStat}><strong>{reports.length}</strong><span>Reports</span></div>
              <div className={styles.miniStat}><strong>{presentations.length}</strong><span>Presentations</span></div>
              <div className={styles.miniStat}><strong>{downloads}</strong><span>Total</span></div>
            </div>
          </div>

          <div className={styles.weekCard}>
            <h3>Week Progress</h3>
            <div className={styles.weekBars}>
              {dayLabels.map((d, idx) => (
                <div key={d} className={styles.dayBar}>
                  <div
                    className={`${styles.bar} ${idx < currentDayIndex ? styles.barPast : idx === currentDayIndex ? styles.barCurrent : styles.barFuture}`}
                    style={{ height: `${weekValues[idx]}px` }}
                  />
                  <small>{d}</small>
                </div>
              ))}
            </div>
          </div>

          <button
            type="button"
            className={`${styles.updateCard} ${styles.updateCardBtn}`}
            onClick={() => navigate('/candidate/earn-money')}
            aria-label="Open earn-money workspace"
          >
            <h3>Earn Money</h3>
            <div className={styles.calendarMock}>Submit one approved report or presentation and await developer review.</div>
          </button>

          <button
            type="button"
            className={`${styles.updateCard} ${styles.updateCardBtn}`}
            onClick={() => navigate('/candidate/announcements')}
            aria-label="Open announcements"
          >
            <h3>Important Updates</h3>
            <div className={styles.calendarMock}>{announcementText}</div>
          </button>
        </section>

        {/* CONTENT */}
        <section className={styles.contentGrid}>
          <div className={styles.contentCard}>
            <h3>Recent Question Papers</h3>
            {questionPapers.slice(0, 3).map((q) => <div key={q.id} className={styles.item}>{q.course_title}</div>)}
          </div>

          <div className={styles.contentCard}>
            <h3>Latest Reports</h3>
            {reports.slice(0, 3).map((r) => <div key={r.id} className={styles.item}>{r.title}</div>)}
          </div>

          <div className={styles.contentCard}>
            <h3>Presentations</h3>
            {presentations.slice(0, 3).map((p) => <div key={p.id} className={styles.item}>{p.title}</div>)}
          </div>
        </section>
      </main>
    </div>
  );
};

export default CandidateDashboard;
