import React, { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';
import { FaPhone, FaTimes, FaVideo, FaVolumeMute, FaVolumeUp } from 'react-icons/fa';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';
import { getErrorMessage } from '../utility/getErrorMessage';
import { showToast } from '../utility/ToastNotification';
import styles from '../Astyles/IncomingChatCallRinger.module.css';

const ChatVideoCallModal = lazy(() => import('./ChatVideoCallModal'));
const SOUND_PREFERENCE_KEY = 'acadex-chat-call-sound';

const readSoundPreference = () => {
  try {
    return window.localStorage.getItem(SOUND_PREFERENCE_KEY) !== 'off';
  } catch (error) {
    console.warn('[IncomingChatCallRinger] Unable to read sound preference:', error.message);
    return true;
  }
};

const IncomingChatCallRinger = () => {
  const { isAuthenticated, user } = useAuth();
  const [incomingCalls, setIncomingCalls] = useState([]);
  const [activeCall, setActiveCall] = useState(null);
  const [joiningCallId, setJoiningCallId] = useState('');
  const [soundEnabled, setSoundEnabled] = useState(readSoundPreference);
  const [audioReady, setAudioReady] = useState(false);
  const audioContextRef = useRef(null);
  const pollErrorNotifiedRef = useRef(false);

  const refreshIncomingCalls = useCallback(async () => {
    try {
      const { data } = await api.get('/chat/video-calls/incoming');
      setIncomingCalls(Array.isArray(data?.incoming_calls) ? data.incoming_calls : []);
    } catch (error) {
      if (error?.response?.status === 401 || error?.response?.status === 429) return;
      if (!pollErrorNotifiedRef.current) {
        pollErrorNotifiedRef.current = true;
        showToast(getErrorMessage(error, 'Unable to check for incoming calls'), 'error');
      }
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || !user?.cand_id) {
      setIncomingCalls([]);
      setActiveCall(null);
      return undefined;
    }

    refreshIncomingCalls();
    const timer = window.setInterval(refreshIncomingCalls, 6000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refreshIncomingCalls();
    };
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [isAuthenticated, user?.cand_id, refreshIncomingCalls]);

  const unlockAudio = useCallback(async () => {
    const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextConstructor) return false;
    try {
      if (!audioContextRef.current) audioContextRef.current = new AudioContextConstructor();
      if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
      const ready = audioContextRef.current.state === 'running';
      setAudioReady(ready);
      return ready;
    } catch (error) {
      console.error('[IncomingChatCallRinger] Unable to enable call audio:', error);
      return false;
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    const unlockFromGesture = () => {
      unlockAudio();
    };
    window.addEventListener('pointerdown', unlockFromGesture, { once: true });
    window.addEventListener('keydown', unlockFromGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', unlockFromGesture);
      window.removeEventListener('keydown', unlockFromGesture);
    };
  }, [isAuthenticated, unlockAudio]);

  const playRingtone = useCallback(() => {
    const context = audioContextRef.current;
    if (!soundEnabled || document.visibilityState !== 'visible' || context?.state !== 'running') return;

    [0, 0.55].forEach((offset) => {
      const startAt = context.currentTime + offset;
      [440, 480].forEach((frequency) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, startAt);
        gain.gain.exponentialRampToValueAtTime(0.04, startAt + 0.03);
        gain.gain.setValueAtTime(0.04, startAt + 0.32);
        gain.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.4);
        oscillator.connect(gain);
        gain.connect(context.destination);
        oscillator.start(startAt);
        oscillator.stop(startAt + 0.42);
      });
    });
  }, [soundEnabled]);

  useEffect(() => {
    if (!isAuthenticated || !incomingCalls.length || !soundEnabled) return undefined;
    playRingtone();
    const timer = window.setInterval(playRingtone, 2600);
    return () => window.clearInterval(timer);
  }, [incomingCalls.length, isAuthenticated, playRingtone, soundEnabled]);

  const updateSoundPreference = async (enabled) => {
    setSoundEnabled(enabled);
    try {
      window.localStorage.setItem(SOUND_PREFERENCE_KEY, enabled ? 'on' : 'off');
    } catch (error) {
      console.warn('[IncomingChatCallRinger] Unable to save sound preference:', error.message);
    }
    if (enabled) await unlockAudio();
  };

  const answerCall = async (incomingCall) => {
    if (joiningCallId) return;
    setJoiningCallId(String(incomingCall.call_id));
    try {
      const { data } = await api.post(
        `/chat/rooms/${encodeURIComponent(incomingCall.room_id)}/video-call/join`
      );
      const call = data?.call;
      if (!call?.livekit_url || !call?.livekit_token) {
        throw new Error('The video service did not return valid call access.');
      }
      setActiveCall({
        ...call,
        roomId: String(incomingCall.room_id),
        room_name: incomingCall.room_name,
      });
      setIncomingCalls((current) => current.filter(
        (item) => String(item.call_id) !== String(incomingCall.call_id)
      ));
    } catch (error) {
      showToast(getErrorMessage(error, 'Unable to join the incoming video call'), 'error');
    } finally {
      setJoiningCallId('');
    }
  };

  const dismissCall = async (incomingCall) => {
    try {
      await api.post(
        `/chat/rooms/${encodeURIComponent(incomingCall.room_id)}/video-call/dismiss`,
        { call_id: incomingCall.call_id }
      );
      setIncomingCalls((current) => current.filter(
        (item) => String(item.call_id) !== String(incomingCall.call_id)
      ));
    } catch (error) {
      showToast(getErrorMessage(error, 'Unable to dismiss this incoming call'), 'error');
    }
  };

  if (!isAuthenticated || !user?.cand_id) return null;

  const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
  const soundLabel = !AudioContextConstructor
    ? 'Sound unavailable'
    : soundEnabled && !audioReady
      ? 'Enable sound'
      : soundEnabled
        ? 'Mute ringtone'
        : 'Turn sound on';

  return (
    <>
      {incomingCalls.length > 0 && !activeCall ? (
        <div className={styles.callAlerts} role="status" aria-live="assertive">
          {incomingCalls.map((incomingCall) => (
            <div className={styles.callAlert} key={incomingCall.call_id}>
              <span className={styles.callIcon}><FaPhone /></span>
              <div className={styles.callDetails}>
                <strong>Incoming video call</strong>
                <span>{incomingCall.started_by_name} is calling from {incomingCall.room_name || 'chat'}</span>
              </div>
              <button
                type="button"
                className={styles.answerButton}
                onClick={() => answerCall(incomingCall)}
                disabled={Boolean(joiningCallId)}
              >
                <FaVideo /> {joiningCallId === String(incomingCall.call_id) ? 'Joining...' : 'Answer'}
              </button>
              <button
                type="button"
                className={styles.dismissButton}
                onClick={() => dismissCall(incomingCall)}
                aria-label="Dismiss incoming call"
                title="Dismiss"
              >
                <FaTimes />
              </button>
            </div>
          ))}
          <div className={styles.soundPreference}>
            <button
              type="button"
              onClick={() => updateSoundPreference(soundEnabled && !audioReady ? true : !soundEnabled)}
              disabled={!AudioContextConstructor}
              aria-label={soundLabel}
              title={soundLabel}
            >
              {soundEnabled ? <FaVolumeUp /> : <FaVolumeMute />}
              <span>{soundLabel}</span>
            </button>
            {!audioReady && soundEnabled && AudioContextConstructor ? (
              <span>Browser audio may need to be enabled before calls arrive.</span>
            ) : null}
          </div>
        </div>
      ) : null}
      {activeCall ? (
        <Suspense fallback={null}>
          <ChatVideoCallModal
            roomId={activeCall.roomId}
            call={activeCall}
            roomLabel={activeCall.room_name || 'Chat'}
            onClose={() => setActiveCall(null)}
          />
        </Suspense>
      ) : null}
    </>
  );
};

export default IncomingChatCallRinger;
