import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import GraduationCapLoader from './GraduationCapLoader';
import styles from '../Astyles/Settings.module.css';
import { useAuth } from '../context/AuthContext';
import { showToast } from '../utility/ToastNotification';
import { getErrorMessage } from '../utility/getErrorMessage';
import i18n, { resolveLanguageForUser } from '../i18n';
import {
  canUsePushNotifications,
  registerAndSubscribePush,
  requestPushPermission,
  unsubscribePush,
} from '../services/pushNotifications';
import { maskCandidateId } from '../utility/maskCandidateId';

const THEME_KEY = 'theme';
const TOAST_SOUND_KEY = 'allowToastSound';

const Settings = () => {
  const { user, updateUser } = useAuth();
  const { t } = useTranslation();
  const cand_id = user?.cand_id || '';
  const isAdmin = user?.is_admin === true;

  const [loading, setLoading] = useState(true);
  const [theme, setTheme] = useState(() => localStorage.getItem(THEME_KEY) || 'light');
  const [allowEmails, setAllowEmails] = useState(true);
  const [allowPushNotifications, setAllowPushNotifications] = useState(false);
  const [allowToastSound, setAllowToastSound] = useState(true);
  const [preferredLanguage, setPreferredLanguage] = useState(() => resolveLanguageForUser(user));
  const [updatingPush, setUpdatingPush] = useState(false);

  const [accountStatus, setAccountStatus] = useState('active');
  const [leftOpen, setLeftOpen] = useState(false);
  const [blockedOpen, setBlockedOpen] = useState(false);
  const [leftGroups, setLeftGroups] = useState([]);
  const [blockedUsers, setBlockedUsers] = useState([]);
  const [loadingLeft, setLoadingLeft] = useState(false);
  const [loadingBlocked, setLoadingBlocked] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    // JWT handles credentials automatically
  }, []);

  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (!cand_id) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      try {
        const { data } = await api.get(`/candidate/profile/${cand_id}`);
        if (cancelled) return;
        setAllowEmails(typeof data?.allow_emails === 'boolean' ? data.allow_emails : true);
        const pushAllowed = typeof data?.allow_push_notifications === 'boolean' ? data.allow_push_notifications : false;
        const toastSoundAllowed = typeof data?.allow_toast_sound === 'boolean' ? data.allow_toast_sound : true;
        setAllowPushNotifications(pushAllowed);
        setAllowToastSound(toastSoundAllowed);
        setPreferredLanguage(String(data?.preferred_language || resolveLanguageForUser(data)).toLowerCase());
        localStorage.setItem('allowPushNotifications', pushAllowed ? 'true' : 'false');
        localStorage.setItem(TOAST_SOUND_KEY, toastSoundAllowed ? 'true' : 'false');

        if (!isAdmin) {
          try {
            const st = await api.get('/candidate/account/status');
            if (!cancelled) setAccountStatus(String(st?.data?.account_status || 'active'));
          } catch (_) {
          }
        }
      } catch (err) {
        if (!cancelled) showToast(getErrorMessage(err, 'Failed to load settings'), 'error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [cand_id, isAdmin]);

  const onSaveEmailPref = async (value) => {
    if (!cand_id) return;

    try {
      await api.put(
        `/candidate/profile/settings/${cand_id}`,
        { allow_emails: value }
      );
      showToast('Settings updated', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update settings'), 'error');
    }
  };

  const onSaveLanguagePref = async (value) => {
    if (!cand_id) return;

    try {
      await api.put(`/candidate/profile/settings/${cand_id}`, { preferred_language: value });
      setPreferredLanguage(value);
      updateUser({ ...user, preferred_language: value });
      await i18n.changeLanguage(value);
      showToast('Language updated', 'success');
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to update language'), 'error');
    }
  };

  const onTogglePushNotifications = async (value) => {
    if (!cand_id || updatingPush) return;

    if (value && !canUsePushNotifications()) {
      showToast('Push notifications are not supported on this device/browser.', 'warning');
      return;
    }

    setUpdatingPush(true);
    setAllowPushNotifications(value);

    try {
      if (value) {
        const permission = await requestPushPermission();
        if (permission !== 'granted') {
          throw new Error('Notification permission was not granted.');
        }
        await registerAndSubscribePush(cand_id);
        await api.put(`/candidate/profile/settings/${cand_id}`, { allow_push_notifications: true });
      } else {
        await unsubscribePush(cand_id);
        await api.put(`/candidate/profile/settings/${cand_id}`, { allow_push_notifications: false });
      }

      showToast('Notification settings updated', 'success');
    } catch (err) {
      setAllowPushNotifications(!value);
      localStorage.setItem('allowPushNotifications', !value ? 'true' : 'false');
      showToast(getErrorMessage(err, 'Failed to update push notifications'), 'error');
    } finally {
      setUpdatingPush(false);
    }
  };

  const onToggleToastSound = async (value) => {
    if (!cand_id) return;

    setAllowToastSound(value);
    localStorage.setItem(TOAST_SOUND_KEY, value ? 'true' : 'false');

    try {
      await api.put(`/candidate/profile/settings/${cand_id}?allow_toast_sound=${value ? 'true' : 'false'}&allowToastSound=${value ? 'true' : 'false'}`, {
        allow_toast_sound: value,
        allowToastSound: value,
      });
      showToast('Settings updated', 'success');
    } catch (err) {
      setAllowToastSound(!value);
      localStorage.setItem(TOAST_SOUND_KEY, !value ? 'true' : 'false');
      showToast(getErrorMessage(err, 'Failed to update toast sound setting'), 'error');
    }
  };

  const themeLabel = useMemo(() => (theme === 'dark' ? 'Dark' : 'Light'), [theme]);

  const loadLeftGroups = async () => {
    if (loadingLeft) return;
    setLoadingLeft(true);
    try {
      const { data } = await api.get('/candidate/account/left-groups');
      setLeftGroups(Array.isArray(data?.left_groups) ? data.left_groups : []);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load left groups'), 'error');
      setLeftGroups([]);
    } finally {
      setLoadingLeft(false);
    }
  };

  const loadBlockedUsers = async () => {
    if (loadingBlocked) return;
    setLoadingBlocked(true);
    try {
      const { data } = await api.get('/candidate/account/blocked-users');
      setBlockedUsers(Array.isArray(data?.blocked_users) ? data.blocked_users : []);
    } catch (err) {
      showToast(getErrorMessage(err, 'Failed to load blocked users'), 'error');
      setBlockedUsers([]);
    } finally {
      setLoadingBlocked(false);
    }
  };

  if (loading) return <GraduationCapLoader fullscreen label="Loading settings..." />;

  return (
    <div className={styles.page}>
      <div className={styles.headerRow}>
        <div>
          <div className={styles.title}>Settings</div>
          <div className={styles.subtitle}>Preferences and system options</div>
        </div>
      </div>

      <div className={styles.grid}>
        {!isAdmin && (
          <section className={styles.card}>
            <div className={styles.cardTitle}>Account</div>

              <div className={styles.row}>
                <div>
                  <div className={styles.rowTitle}>{t('common.program')}</div>
                  <div className={styles.rowSubtitle}>{t('settingsPage.programSubtitle')}</div>
                </div>
                <span className={styles.chip}>{String(user?.program || 'HND').toUpperCase()}</span>
              </div>

              <div style={{ height: 12 }} />

            <div className={styles.row}>
              <div>
                  <div className={styles.rowTitle}>{t('settingsPage.accountStatus')}</div>
                  <div className={styles.rowSubtitle}>{accountStatus === 'active' ? t('settingsPage.activeCandidate') : accountStatus}</div>
              </div>
              <span className={styles.chip}>{accountStatus === 'active' ? 'Active' : 'Restricted'}</span>
            </div>

            <div style={{ height: 12 }} />

            <button
              type="button"
              className={styles.accordionBtn}
              onClick={async () => {
                const next = !leftOpen;
                setLeftOpen(next);
                if (next) await loadLeftGroups();
              }}
            >
              <span>Left groups</span>
              <span className={styles.chip}>{leftGroups.length}</span>
            </button>
            {leftOpen && (
              <div className={styles.accordionBody}>
                {loadingLeft && <div className={styles.rowSubtitle}>Loading…</div>}
                {!loadingLeft && leftGroups.length === 0 && <div className={styles.rowSubtitle}>No left groups</div>}
                {!loadingLeft &&
                  leftGroups.map((g) => (
                    <div key={String(g.room_id)} className={styles.listRow}>
                      <div>
                        <div className={styles.listTitle}>{g.room_name}</div>
                        <div className={styles.listMeta}>{g.left_at ? `Left: ${new Date(g.left_at).toLocaleString()}` : ''}</div>
                      </div>
                      <label className={styles.switch}>
                        <input
                          type="checkbox"
                          onChange={async (e) => {
                            const on = e.target.checked;
                            if (!on) return;
                            try {
                              await api.post(
                                `/candidate/account/left-groups/${encodeURIComponent(g.room_id)}/rejoin`,
                                {}
                              );
                              await loadLeftGroups();
                              showToast('Joined group again', 'success');
                            } catch (err) {
                              showToast(getErrorMessage(err, 'Failed to rejoin'), 'error');
                            }
                          }}
                        />
                        <span className={styles.slider} />
                      </label>
                    </div>
                  ))}
              </div>
            )}

            <div style={{ height: 12 }} />

            <button
              type="button"
              className={styles.accordionBtn}
              onClick={async () => {
                const next = !blockedOpen;
                setBlockedOpen(next);
                if (next) await loadBlockedUsers();
              }}
            >
              <span>Blocked users</span>
              <span className={styles.chip}>{blockedUsers.length}</span>
            </button>
            {blockedOpen && (
              <div className={styles.accordionBody}>
                {loadingBlocked && <div className={styles.rowSubtitle}>Loading…</div>}
                {!loadingBlocked && blockedUsers.length === 0 && <div className={styles.rowSubtitle}>No blocked users</div>}
                {!loadingBlocked &&
                  blockedUsers.map((b) => (
                    <div key={String(b.cand_id)} className={styles.listRow}>
                      <div>
                        <div className={styles.listTitle}>{b.name || maskCandidateId(b.cand_id)}</div>
                        <div className={styles.listMeta}>{b.blocked_at ? `Blocked: ${new Date(b.blocked_at).toLocaleString()}` : ''}</div>
                      </div>
                      <label className={styles.switch}>
                        <input
                          type="checkbox"
                          onChange={async (e) => {
                            const on = e.target.checked;
                            if (!on) return;
                            try {
                              await api.delete(
                                `/candidate/account/blocked-users/${encodeURIComponent(b.cand_id)}`
                              );
                              await loadBlockedUsers();
                              showToast('Unblocked', 'success');
                            } catch (err) {
                              showToast(getErrorMessage(err, 'Failed to unblock'), 'error');
                            }
                          }}
                        />
                        <span className={styles.slider} />
                      </label>
                    </div>
                  ))}
              </div>
            )}

            <div style={{ height: 12 }} />

            <div className={styles.row}>
              <div>
                <div className={styles.rowTitle}>Delete account</div>
                <div className={styles.rowSubtitle}>Permanently deletes all your candidate data.</div>
              </div>
              <button type="button" className={styles.dangerBtn} onClick={() => setShowDeleteConfirm(true)}>
                Delete
              </button>
            </div>
          </section>
        )}

        <section className={styles.card}>
          <div className={styles.cardTitle}>{t('settingsPage.appearance')}</div>

          <div className={styles.row}>
            <div>
              <div className={styles.rowTitle}>{t('settingsPage.profileLanguage')}</div>
              <div className={styles.rowSubtitle}>{t('settingsPage.profileLanguageSubtitle')}</div>
            </div>
            <select
              value={preferredLanguage}
              onChange={(e) => onSaveLanguagePref(e.target.value)}
              style={{ height: 40, borderRadius: 12, border: '1px solid var(--border)', padding: '0 12px' }}
            >
              <option value="en">{t('common.english')}</option>
              <option value="fr">{t('common.french')}</option>
            </select>
          </div>

          <div style={{ height: 12 }} />

          <div className={styles.row}>
            <div>
              <div className={styles.rowTitle}>{t('settingsPage.theme')}</div>
              <div className={styles.rowSubtitle}>{t('settingsPage.themeSubtitle')}</div>
            </div>

            <button
              type="button"
              className={styles.actionBtn}
              onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            >
              {themeLabel}
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardTitle}>{t('settingsPage.notifications')}</div>

          <div className={styles.row}>
            <div>
              <div className={styles.rowTitle}>{t('settingsPage.allowEmails')}</div>
              <div className={styles.rowSubtitle}>{t('settingsPage.allowEmailsSubtitle')}</div>
            </div>

            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={allowEmails}
                onChange={(e) => {
                  const v = e.target.checked;
                  setAllowEmails(v);
                  onSaveEmailPref(v);
                }}
              />
              <span className={styles.slider} />
            </label>
          </div>

          <div style={{ height: 12 }} />

          <div className={styles.row}>
            <div>
              <div className={styles.rowTitle}>{t('settingsPage.pushNotifications')}</div>
              <div className={styles.rowSubtitle}>{t('settingsPage.pushNotificationsSubtitle')}</div>
            </div>

            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={allowPushNotifications}
                disabled={updatingPush}
                onChange={(e) => onTogglePushNotifications(e.target.checked)}
              />
              <span className={styles.slider} />
            </label>
          </div>

          <div style={{ height: 12 }} />

          <div className={styles.row}>
            <div>
              <div className={styles.rowTitle}>{t('settingsPage.toastSound')}</div>
              <div className={styles.rowSubtitle}>{t('settingsPage.toastSoundSubtitle')}</div>
            </div>

            <label className={styles.switch}>
              <input
                type="checkbox"
                checked={allowToastSound}
                onChange={(e) => onToggleToastSound(e.target.checked)}
              />
              <span className={styles.slider} />
            </label>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardTitle}>Security</div>

          <div className={styles.row}>
            <div>
              <div className={styles.rowTitle}>Logout everywhere</div>
              <div className={styles.rowSubtitle}>Ends your current session. If you suspect account misuse, do this.</div>
            </div>

            <button
              type="button"
              className={styles.dangerBtn}
              onClick={async () => {
                try {
                  await api.post('/auth/logout');
                } catch (_) {
                } finally {
                  localStorage.removeItem('userId');
                  localStorage.removeItem('userEmail');
                  localStorage.removeItem('userName');
                  localStorage.removeItem('isAdmin');
                  window.location.href = '/login';
                }
              }}
            >
              Logout
            </button>
          </div>
        </section>
      </div>

      {showDeleteConfirm && (
        <>
          <div className={styles.modalOverlay} onClick={() => setShowDeleteConfirm(false)} />
          <div className={`${styles.card} ${styles.modalCard}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.cardTitle}>Delete account?</div>
            <div className={styles.rowSubtitle}>
              This action cannot be undone. Your account and all your data will be permanently deleted.
            </div>
            <div style={{ height: 12 }} />
            <div className={styles.row}>
              <button type="button" className={styles.actionBtn} onClick={() => setShowDeleteConfirm(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={styles.dangerBtn}
                onClick={async () => {
                  try {
                    await api.delete('/candidate/account/delete');
                  } catch (_) {
                  } finally {
                    localStorage.removeItem('userId');
                    localStorage.removeItem('userEmail');
                    localStorage.removeItem('userName');
                    localStorage.removeItem('isAdmin');
                    window.location.href = '/login';
                  }
                }}
              >
                Delete account
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Settings;
