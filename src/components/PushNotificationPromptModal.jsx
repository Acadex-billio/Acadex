import React, { useEffect, useMemo, useState } from 'react';
import styles from '../Astyles/PushNotificationPromptModal.module.css';
import { useAuth } from '../context/AuthContext';
import {
  canUsePushNotifications,
  getPushPermissionStatus,
  isPushConfigured,
  registerAndSubscribePush,
  reportPushFailure,
  requestPushPermission,
} from '../services/pushNotifications';
import { showToast } from '../utility/ToastNotification';

const PUSH_PROMPT_EVENT = 'push-notification-prompt-request';

const PushNotificationPromptModal = () => {
  const { user } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [permissionState, setPermissionState] = useState('unknown');

  useEffect(() => {
    const handlePromptRequest = () => {
      if (!user?.cand_id) return;

      const status = getPushPermissionStatus();
      const storageEnabled = String(localStorage.getItem('allowPushNotifications') || '').toLowerCase() === 'true';
      const shouldShow = isPushConfigured() && canUsePushNotifications() && (status.permission !== 'granted' || !storageEnabled);

      if (shouldShow) {
        setPermissionState(status.permission);
        setIsOpen(true);
      }
    };

    window.addEventListener(PUSH_PROMPT_EVENT, handlePromptRequest);
    return () => window.removeEventListener(PUSH_PROMPT_EVENT, handlePromptRequest);
  }, [user?.cand_id]);

  const heading = useMemo(() => {
    if (permissionState === 'denied') return 'Notifications are blocked';
    return 'Enable push notifications';
  }, [permissionState]);

  const description = useMemo(() => {
    if (permissionState === 'denied') {
      return 'Your browser is blocking notifications. Turn them on in browser settings so you never miss important updates.';
    }
    return 'Stay updated with announcements, submissions, and important system alerts by turning on browser notifications.';
  }, [permissionState]);

  if (!isOpen || !user?.cand_id) return null;

  const closeModal = () => setIsOpen(false);

  const handleEnable = async () => {
    if (!user?.cand_id) return;

    setIsWorking(true);

    try {
      const permission = await requestPushPermission();
      if (permission !== 'granted') {
        await reportPushFailure({
          candId: user.cand_id,
          reason: `Permission ${permission}`,
          stage: 'permission',
          browser: navigator.userAgent,
        });
        throw new Error('Push permission was not granted. Please allow notifications in your browser settings.');
      }

      await registerAndSubscribePush(user.cand_id);
      setIsOpen(false);
      showToast('Push notifications are now enabled.', 'success');
    } catch (err) {
      const reason = err?.message || 'Unable to enable push notifications.';
      try {
        await reportPushFailure({
          candId: user.cand_id,
          reason,
          stage: 'permission',
          browser: navigator.userAgent,
        });
      } catch (_) {
        // Ignore secondary failure reporting issues.
      }
      showToast(reason, 'warning');
      if (permissionState === 'denied') {
        setIsOpen(false);
      }
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <div className={styles.overlay} role="dialog" aria-modal="true" aria-labelledby="push-notification-modal-title">
      <div className={styles.modalCard}>
        <div className={styles.iconBadge}>🔔</div>
        <h3 id="push-notification-modal-title" className={styles.title}>{heading}</h3>
        <p className={styles.description}>{description}</p>

        <div className={styles.toggleRow}>
          <span className={styles.toggleLabel}>Enable browser notifications</span>
          <button
            type="button"
            className={`${styles.switchButton} ${isWorking ? styles.switchButtonBusy : ''}`}
            role="switch"
            aria-checked={permissionState === 'granted'}
            disabled={isWorking}
            onClick={handleEnable}
          >
            <span className={styles.switchThumb} />
          </button>
        </div>

        <div className={styles.actions}>
          <button type="button" className={styles.secondaryButton} onClick={closeModal} disabled={isWorking}>
            Maybe later
          </button>
          <button type="button" className={styles.primaryButton} onClick={handleEnable} disabled={isWorking}>
            {isWorking ? 'Enabling…' : 'Enable now'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default PushNotificationPromptModal;
