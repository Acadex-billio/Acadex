import api from './api';

const SW_PATH = '/push-sw.js';
const PUSH_PROMPT_EVENT = 'push-notification-prompt-request';
let pushConfigPromise;

export const getPushConfig = async () => {
  if (!pushConfigPromise) {
    pushConfigPromise = api.get('/push/config')
      .then(({ data }) => {
        const publicKey = data?.configured === true ? String(data?.publicKey || '').trim() : '';
        return { configured: Boolean(publicKey), publicKey };
      })
      .catch((error) => {
        pushConfigPromise = null;
        throw error;
      });
  }

  return pushConfigPromise;
};

const storePushPreference = (enabled) => {
  try {
    localStorage.setItem('allowPushNotifications', enabled ? 'true' : 'false');
  } catch (err) {
    console.warn('[Push] Subscription saved, but the local preference could not be cached:', err?.message || err);
  }
};

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
  return !getPushSupportMessage();
};

export const getPushSupportMessage = () => {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return 'Push notifications are not available in this environment.';
  }
  if (window.isSecureContext === false) {
    return 'Push notifications require a secure HTTPS connection.';
  }

  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isInstalled = navigator.standalone === true
    || window.matchMedia?.('(display-mode: standalone)')?.matches === true;
  if (isIOS && !isInstalled) {
    return 'On iPhone and iPad, install Acadex to your Home Screen and open it there to enable push notifications.';
  }

  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'This browser does not support push notifications. Try an up-to-date browser with notifications enabled.';
  }
  return '';
};

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
  } catch (err) {
    console.error('[Push] Failed to report subscription failure:', err?.message || err);
    return false;
  }
};

export const registerAndSubscribePush = async (candId, configuredPublicKey) => {
  if (!canUsePushNotifications()) {
    throw new Error(getPushSupportMessage());
  }

  const vapidPublicKey = String(configuredPublicKey || '').trim();
  if (!vapidPublicKey) {
    throw new Error('Push notifications are not configured on the server. Please contact support.');
  }

  const applicationServerKey = urlBase64ToUint8Array(vapidPublicKey);
  let registration;
  try {
    await navigator.serviceWorker.register(SW_PATH, { scope: '/' });
    registration = await navigator.serviceWorker.ready;
    if (!registration.active) {
      throw new Error('The notification service worker did not become active.');
    }
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
  if (subscription?.options?.applicationServerKey) {
    const currentKey = new Uint8Array(subscription.options.applicationServerKey);
    const sameKey = currentKey.length === applicationServerKey.length
      && currentKey.every((value, index) => value === applicationServerKey[index]);
    if (!sameKey) {
      try {
        await subscription.unsubscribe();
        subscription = null;
      } catch (err) {
        throw new Error(`Unable to renew the push subscription: ${err?.message || 'Unknown error'}`);
      }
    }
  }

  if (!subscription) {
    try {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey,
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

  storePushPreference(true);
  return subscription;
};

export const unsubscribePush = async (candId) => {
  await api.delete(`/candidate/profile/push-subscription/${encodeURIComponent(candId)}`);
  storePushPreference(false);

  if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.getRegistration('/');
      const subscription = registration ? await registration.pushManager.getSubscription() : null;
      if (subscription) await subscription.unsubscribe();
      return true;
    } catch (err) {
      console.error('[Push] Server preference disabled, but local subscription cleanup failed:', err?.message || err);
      return false;
    }
  }

  return true;
};
