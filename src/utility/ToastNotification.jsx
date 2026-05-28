// src/utils/ToastNotification.jsx

import React from 'react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import i18n from '../i18n';

const audio = new Audio(process.env.PUBLIC_URL + '/messagetone.wav');

const isPushEnabled = () => localStorage.getItem('allowPushNotifications') === 'true';
const isToastSoundEnabled = () => localStorage.getItem('allowToastSound') !== 'false';

const TOAST_MESSAGE_MAP = {
    'Authentication required': 'toast.auth.required',
    'Admin access required': 'toast.auth.adminRequired',
    'Developer access required': 'toast.auth.developerRequired',
    'Your session has expired. Please log in again.': 'toast.sessionExpired',
    'Access denied for this resource. Please contact the administrator.': 'toast.accessDenied',
    'Too many auth checks too quickly; please wait a few seconds.': 'toast.tooManyChecks',
    'Login successful! Redirecting...': 'toast.loginSuccess',
    'Settings updated': 'toast.settings.updated',
    'Language updated': 'toast.settings.languageUpdated',
    'Notification settings updated': 'toast.settings.notificationsUpdated',
    'Failed to load departments': 'toast.registration.departmentsLoadFailed',
    'Registration successful! Redirecting to login...': 'toast.registration.success',
    'Download started': 'toast.download.started',
    'Uploaded successfully.': 'toast.upload.success',
    'User role updated to admin': 'toast.role.promoted',
    'User role updated to candidate': 'toast.role.demoted',
};

const resolveToastMessage = (message, options) => {
    if (typeof message !== 'string') return message;

    if (message.startsWith('toast.')) {
        return i18n.t(message, options || {});
    }

    const mappedKey = TOAST_MESSAGE_MAP[message];
    if (mappedKey) {
        return i18n.t(mappedKey, { defaultValue: message, ...(options || {}) });
    }

    return message;
};

const trySystemNotification = (message, type) => {
    if (!isPushEnabled()) return;
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;

    const titleByType = {
        success: i18n.t('toastTitle.success', { defaultValue: 'Success' }),
        error: i18n.t('toastTitle.error', { defaultValue: 'Error' }),
        warning: i18n.t('toastTitle.warning', { defaultValue: 'Warning' }),
        info: i18n.t('toastTitle.info', { defaultValue: 'Information' }),
    };

    try {
        new Notification(`Acadex - ${titleByType[type] || 'Notification'}`, {
            body: String(message || ''),
            icon: process.env.PUBLIC_URL + '/logo192.png',
            tag: 'hnd-platform-toast-fallback',
        });
    } catch (_err) {
    }
};

const playToastAudio = async (message, type) => {
    if (!isToastSoundEnabled()) return;
    try {
        audio.currentTime = 0;
        await audio.play();
    } catch (_error) {
        // If browser blocks audio autoplay, fall back to system notification sound.
        trySystemNotification(message, type);
    }
};

const ToastNotification = () => {
    const notify = (message, type, options) => {
        const finalMessage = resolveToastMessage(message, options);
        playToastAudio(finalMessage, type);

        switch (type) {
            case 'success':
                toast.success(finalMessage);
                break;
            case 'error':
                toast.error(finalMessage);
                break;
            case 'info':
                toast.info(finalMessage);
                break;
            case 'warning':
                toast.warn(finalMessage);
                break;
            default:
                toast(finalMessage);
                break;
        }
    };

    // Make notify available outside of this component
    window.notify = notify;
    window.showToast = notify;

    return (
        <>
            <ToastContainer
                position="top-right"
                autoClose={5000}
                hideProgressBar={false}
                closeOnClick
                pauseOnHover
                draggable
                pauseOnFocusLoss
                theme="light"
            />
        </>
    );
};

export const showToast = (message, type, options) => {
    if (typeof window.notify === 'function') {
        window.notify(message, type, options);
        return;
    }
    const finalMessage = resolveToastMessage(message, options);
    if (type === 'success') {
        toast.success(finalMessage);
    } else if (type === 'error') {
        toast.error(finalMessage);
    } else if (type === 'warning') {
        toast.warn(finalMessage);
    } else if (type === 'info') {
        toast.info(finalMessage);
    } else {
        toast(finalMessage);
    }
};

export default ToastNotification;