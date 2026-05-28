import api from './api';

const SW_PATH = '/push-sw.js';

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

export const requestPushPermission = async () => {
  if (!canUsePushNotifications()) return 'unsupported';
  return Notification.requestPermission();
};

export const registerAndSubscribePush = async (candId) => {
  if (!canUsePushNotifications()) {
    throw new Error('Push notifications are not supported on this device/browser.');
  }

  const vapidPublicKey = String(process.env.REACT_APP_VAPID_PUBLIC_KEY || '').trim();
  if (!vapidPublicKey) {
    throw new Error('Push notifications are not configured. Missing REACT_APP_VAPID_PUBLIC_KEY.');
  }

  const registration = await navigator.serviceWorker.register(SW_PATH);
  const existing = await registration.pushManager.getSubscription();

  const subscription =
    existing ||
    (await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    }));

  await api.put(`/candidate/profile/push-subscription/${encodeURIComponent(candId)}`, {
    subscription,
  });

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
