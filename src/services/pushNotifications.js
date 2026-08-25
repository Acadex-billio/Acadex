import api from './api';

const SW_PATH = '/push-sw.js';
const PUSH_PROMPT_EVENT = 'push-notification-prompt-request';

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
};

export const canUsePushNotifications = () => {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
};

export const isPushConfigured = () => Boolean(String(process.env.REACT_APP_VAPID_PUBLIC_KEY || '').trim());

export const getPushPermissionStatus = () => {
  if (!canUsePushNotifications()) {
    return { permission: 'unsupported', isGranted: false };
  }
  return { permission: Notification.permission, isGranted: Notification.permission === 'granted' };
};

export const requestPushPermission = async () => {
  if (!canUsePushNotifications()) return 'unsupported';
  return Notification.requestPermission();
};

export const triggerPushPrompt = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(PUSH_PROMPT_EVENT));
};

export const reportPushFailure = async ({ candId, reason, stage, browser }) => {
  if (!candId) return null;
  try {
    await api.post(`/candidate/profile/push-failure/${encodeURIComponent(candId)}`, {
      reason,
      stage,
      browser,
    });
    return true;
  } catch (_) {
    return false;
  }
};

export const registerAndSubscribePush = async (candId) => {
  if (!canUsePushNotifications()) {
    throw new Error('Push notifications are not supported on this device/browser.');
  }

  const vapidPublicKey = String(process.env.REACT_APP_VAPID_PUBLIC_KEY || '').trim();
  if (!vapidPublicKey) {
    throw new Error('Push notifications are not configured. Missing REACT_APP_VAPID_PUBLIC_KEY.');
  }

  let registration;
  try {
    registration = await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
  } catch (err) {
    throw new Error(`Service worker registration failed: ${err?.message || 'Unknown error'}`);
  }

  let existingSubscription = null;
  try {
    existingSubscription = await registration.pushManager.getSubscription();
  } catch (err) {
    throw new Error(`Unable to read push subscription: ${err?.message || 'Unknown error'}`);
  }

  let subscription = existingSubscription;
  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });
    } catch (err) {
      throw new Error(`Browser rejected push subscription: ${err?.message || 'Unknown error'}`);
    }
  }

  try {
    await api.put(`/candidate/profile/push-subscription/${encodeURIComponent(candId)}`, {
      subscription,
    });
  } catch (err) {
    throw new Error(err?.response?.data?.message || 'Failed to save push subscription.');
  }

  localStorage.setItem('allowPushNotifications', 'true');
  return subscription;
};

export const unsubscribePush = async (candId) => {
  if (canUsePushNotifications()) {
    const registration = await navigator.serviceWorker.getRegistration(SW_PATH);
    const subscription = registration ? await registration.pushManager.getSubscription() : null;
    if (subscription) {
      await subscription.unsubscribe();
    }
  }

  await api.delete(`/candidate/profile/push-subscription/${encodeURIComponent(candId)}`);
  localStorage.setItem('allowPushNotifications', 'false');
};
