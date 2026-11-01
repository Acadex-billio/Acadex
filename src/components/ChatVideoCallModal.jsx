import React, { useEffect, useMemo, useState } from 'react';
import {
  Chat,
  DisconnectButton,
  GridLayout,
  LayoutContextProvider,
  LiveKitRoom,
  MediaDeviceSelect,
  ParticipantTile,
  RoomAudioRenderer,
  useConnectionState,
  useLocalParticipant,
  useParticipants,
  useTracks,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import {
  FaBookOpen,
  FaComments,
  FaDesktop,
  FaEllipsisH,
  FaGraduationCap,
  FaMicrophone,
  FaMicrophoneSlash,
  FaPhone,
  FaTimes,
  FaUser,
  FaUsers,
  FaVideo,
  FaVideoSlash,
} from 'react-icons/fa';
import '@livekit/components-styles';
import api from '../services/api';
import styles from '../Astyles/ChatVideoCall.module.css';

const formatDuration = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const ChatCallStage = ({ call, roomLabel, onLeave, onEndForEveryone, ending, endError }) => {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const {
    localParticipant,
    isCameraEnabled,
    isMicrophoneEnabled,
    isScreenShareEnabled,
  } = useLocalParticipant();
  const [panel, setPanel] = useState('');
  const [mediaError, setMediaError] = useState('');
  const [now, setNow] = useState(Date.now());
  const canShareScreen = typeof navigator !== 'undefined'
    && typeof navigator.mediaDevices?.getDisplayMedia === 'function';
  const startedAt = new Date(call?.started_at || Date.now()).getTime();
  const elapsed = Number.isFinite(startedAt) ? formatDuration(now - startedAt) : '00:00';
  const connectionLabel = String(connectionState || 'connecting').toLowerCase();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const runMediaAction = async (action) => {
    setMediaError('');
    try {
      await action();
    } catch (error) {
      setMediaError(error?.message || 'Unable to change this device setting.');
    }
  };

  const toggleMicrophone = () => runMediaAction(
    () => localParticipant.setMicrophoneEnabled(!isMicrophoneEnabled)
  );
  const toggleCamera = () => runMediaAction(
    () => localParticipant.setCameraEnabled(!isCameraEnabled)
  );
  const toggleScreenShare = () => runMediaAction(
    () => localParticipant.setScreenShareEnabled(!isScreenShareEnabled)
  );

  const togglePanel = (nextPanel) => {
    setPanel((current) => current === nextPanel ? '' : nextPanel);
  };

  return (
    <div className={styles.callStage}>
      <header className={styles.brandHeader}>
        <div className={styles.brandLockup}>
          <span className={styles.brandMark}><FaGraduationCap /></span>
          <span className={styles.brandText}>
            <strong>ACADEX</strong>
            <small>LEARN · CONNECT · GROW</small>
          </span>
        </div>
        <div className={styles.livePill}>
          <FaVideo />
          <span>ACADEX Video Call</span>
          <i />
          <strong>Live</strong>
        </div>
        <div className={styles.headerActions}>
          <span className={styles.callDuration}>{elapsed}</span>
          {call?.is_initiator ? (
            <button
              type="button"
              className={styles.endForEveryoneButton}
              onClick={onEndForEveryone}
              disabled={ending}
            >
              {ending ? 'Ending…' : 'End for everyone'}
            </button>
          ) : null}
          <span className={styles.accountAvatar} aria-label="Your account"><FaUser /></span>
        </div>
      </header>

      <div className={styles.callHeading}>
        <div>
          <span className={styles.eyebrow}>VIDEO ROOM</span>
          <h1>{roomLabel}</h1>
        </div>
        <div className={styles.connectionStatus} data-connection={connectionLabel} aria-live="polite">
          <span />
          {connectionLabel === 'connected' ? 'Connected' : connectionLabel}
        </div>
      </div>

      <div className={styles.stageBody}>
        <main className={styles.videoArea}>
          {tracks.length ? (
            <GridLayout className={styles.participantGrid} tracks={tracks}>
              <ParticipantTile />
            </GridLayout>
          ) : (
            <div className={styles.waitingState}>
              <span className={styles.waitingIcon}><FaUsers /></span>
              <strong>Getting your call ready</strong>
              <span>Your video will appear here as soon as you connect.</span>
            </div>
          )}
        </main>

        {panel ? (
          <aside className={styles.sidePanel}>
            <div className={styles.panelHeader}>
              <div>
                <span className={styles.eyebrow}>
                  {panel === 'chat' ? 'CONVERSATION' : panel === 'devices' ? 'CALL SETTINGS' : 'IN THIS CALL'}
                </span>
                <strong>
                  {panel === 'chat' ? 'In-call chat' : panel === 'devices' ? 'Devices' : `Participants (${participants.length})`}
                </strong>
              </div>
              <button type="button" className={styles.panelClose} onClick={() => setPanel('')} aria-label="Close panel">
                <FaTimes />
              </button>
            </div>
            {panel === 'chat' ? (
              <div className={styles.callChat}>
                <Chat />
                <small>Messages are only available while you’re in this call.</small>
              </div>
            ) : panel === 'devices' ? (
              <div className={styles.devicePanel}>
                <label>Microphone</label>
                <MediaDeviceSelect kind="audioinput" requestPermissions={false} />
                <label>Camera</label>
                <MediaDeviceSelect kind="videoinput" requestPermissions={false} />
                {mediaError ? <p className={styles.mediaError} role="alert">{mediaError}</p> : null}
              </div>
            ) : (
              <div className={styles.participantList}>
                {participants.map((participant) => (
                  <div className={styles.participantRow} key={participant.identity}>
                    <span className={styles.participantAvatar}>
                      {String(participant.name || participant.identity || '?').trim().charAt(0).toUpperCase()}
                    </span>
                    <span>{participant.name || 'Chat member'}{participant.isLocal ? ' (You)' : ''}</span>
                    <span className={participant.isMicrophoneEnabled ? styles.micOn : styles.micOff}>
                      {participant.isMicrophoneEnabled ? <FaMicrophone /> : <FaMicrophoneSlash />}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </aside>
        ) : null}
      </div>

      {mediaError && panel !== 'devices' ? (
        <p className={styles.mediaError} role="alert">{mediaError}</p>
      ) : null}
      {endError ? <p className={styles.mediaError} role="alert">{endError}</p> : null}

      <footer className={styles.controlDock}>
        <div className={styles.controlGroup}>
          <button
            type="button"
            className={`${styles.controlButton} ${isMicrophoneEnabled ? styles.controlEnabled : styles.controlDisabled}`}
            onClick={toggleMicrophone}
            aria-pressed={isMicrophoneEnabled}
            aria-label={isMicrophoneEnabled ? 'Mute microphone' : 'Unmute microphone'}
          >
            {isMicrophoneEnabled ? <FaMicrophone /> : <FaMicrophoneSlash />}
            <span>{isMicrophoneEnabled ? 'Mute' : 'Unmute'}</span>
          </button>
          <button
            type="button"
            className={`${styles.controlButton} ${isCameraEnabled ? styles.controlEnabled : styles.controlDisabled}`}
            onClick={toggleCamera}
            aria-pressed={isCameraEnabled}
            aria-label={isCameraEnabled ? 'Stop video' : 'Start video'}
          >
            {isCameraEnabled ? <FaVideo /> : <FaVideoSlash />}
            <span>{isCameraEnabled ? 'Stop Video' : 'Start Video'}</span>
          </button>
          {canShareScreen ? (
            <button
              type="button"
              className={`${styles.controlButton} ${isScreenShareEnabled ? styles.controlEnabled : ''}`}
              onClick={toggleScreenShare}
              aria-pressed={isScreenShareEnabled}
              aria-label={isScreenShareEnabled ? 'Stop sharing screen' : 'Share screen'}
            >
              <FaDesktop />
              <span>{isScreenShareEnabled ? 'Stop Share' : 'Share'}</span>
            </button>
          ) : null}
          <button
            type="button"
            className={`${styles.controlButton} ${panel === 'participants' ? styles.controlSelected : ''}`}
            onClick={() => togglePanel('participants')}
            aria-pressed={panel === 'participants'}
          >
            <span className={styles.controlIconWithCount}>
              <FaUsers /><i>{participants.length}</i>
            </span>
            <span>Participants</span>
          </button>
          <button
            type="button"
            className={`${styles.controlButton} ${panel === 'chat' ? styles.controlSelected : ''}`}
            onClick={() => togglePanel('chat')}
            aria-pressed={panel === 'chat'}
          >
            <FaComments />
            <span>Chat</span>
          </button>
          <button
            type="button"
            className={`${styles.controlButton} ${panel === 'devices' ? styles.controlSelected : ''}`}
            onClick={() => togglePanel('devices')}
            aria-pressed={panel === 'devices'}
          >
            <FaEllipsisH />
            <span>More</span>
          </button>
          <DisconnectButton className={`${styles.controlButton} ${styles.leaveButton}`} onClick={onLeave}>
            <FaPhone />
            <span>Leave</span>
          </DisconnectButton>
        </div>
      </footer>

      <div className={styles.brandFooter}>
        <span>Your academic journey, connected.</span>
        <FaBookOpen aria-hidden="true" />
      </div>
      <RoomAudioRenderer />
    </div>
  );
};

const ChatVideoCallModal = ({ roomId, call, roomLabel, onClose }) => {
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [connected, setConnected] = useState(false);
  const [callEnded, setCallEnded] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState('');
  const [now, setNow] = useState(Date.now());

  const expiresAt = useMemo(() => {
    const value = new Date(call?.expires_at || 0).getTime();
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [call?.expires_at]);

  useEffect(() => {
    if (!roomId || !call?.call_id) return undefined;
    let cancelled = false;
    const checkCall = async () => {
      try {
        const { data } = await api.get(`/chat/rooms/${encodeURIComponent(roomId)}/video-call`);
        if (!cancelled && String(data?.active_call?.call_id || '') !== String(call.call_id)) {
          setCallEnded(true);
        }
      } catch (error) {
        if (!cancelled && error?.response?.status !== 429) {
          setJoinError(error?.response?.data?.message || 'Unable to check call status.');
        }
      }
    };
    checkCall();
    const timer = window.setInterval(checkCall, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [roomId, call?.call_id]);

  useEffect(() => {
    if (!expiresAt) return undefined;
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (currentTime >= expiresAt) setCallEnded(true);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const remainingMs = expiresAt ? Math.max(0, expiresAt - now) : null;
  const joinCall = async () => {
    setJoining(true);
    setJoinError('');
    try {
      if (cameraEnabled || microphoneEnabled) {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('This browser does not support camera and microphone access.');
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: cameraEnabled,
          audio: microphoneEnabled,
        });
        stream.getTracks().forEach((track) => track.stop());
      }
      setConnected(true);
    } catch (error) {
      setJoinError(error?.message || 'Camera or microphone permission was denied. Check browser settings or turn both off to join.');
    } finally {
      setJoining(false);
    }
  };

  const endForEveryone = async () => {
    if (!call?.is_initiator || !window.confirm('End this video call for everyone in the chat?')) return;
    setEnding(true);
    setEndError('');
    try {
      await api.post(`/chat/rooms/${encodeURIComponent(roomId)}/video-call/end`);
      setCallEnded(true);
    } catch (error) {
      setEndError(error?.response?.data?.message || 'Unable to end this video call.');
    } finally {
      setEnding(false);
    }
  };

  return (
    <div className={styles.videoOverlay} role="dialog" aria-modal="true" aria-label={`Video call: ${roomLabel}`}>
      <div className={styles.videoModal}>
        {callEnded ? (
          <div className={styles.videoEnded} role="status">
            <span className={styles.endedIcon}><FaPhone /></span>
            <span className={styles.eyebrow}>ACADEX VIDEO CALL</span>
            <strong>This video call has ended.</strong>
            <span>Start another free call from this chat whenever you’re ready.</span>
            <button type="button" onClick={onClose}>Back to chat</button>
          </div>
        ) : connected ? (
          <LiveKitRoom
            token={call.livekit_token}
            serverUrl={call.livekit_url}
            data-lk-theme="default"
            connect
            audio={microphoneEnabled}
            video={cameraEnabled}
            onError={(error) => setJoinError(error?.message || 'Unable to connect to the video call.')}
            onDisconnected={onClose}
            options={{ adaptiveStream: true, dynacast: true }}
          >
            <LayoutContextProvider>
              <ChatCallStage
                call={call}
                roomLabel={roomLabel}
                onLeave={onClose}
                onEndForEveryone={endForEveryone}
                ending={ending}
                endError={endError}
              />
            </LayoutContextProvider>
          </LiveKitRoom>
        ) : (
          <div className={styles.preflight}>
            <header className={styles.preflightHeader}>
              <div className={styles.brandLockup}>
                <span className={styles.brandMark}><FaGraduationCap /></span>
                <span className={styles.brandText}>
                  <strong>ACADEX</strong>
                  <small>LEARN · CONNECT · GROW</small>
                </span>
              </div>
              <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Close call window">
                <FaTimes />
              </button>
            </header>
            <div className={styles.preflightBody}>
              <span className={styles.eyebrow}>YOU’RE INVITED</span>
              <span className={styles.preflightIcon}><FaVideo /></span>
              <h1>Join the video call</h1>
              <p>{roomLabel} · started by {call?.started_by_name || 'a chat member'}</p>
              {remainingMs !== null ? (
                <span className={styles.expiryText}>
                  {Math.floor(remainingMs / 3600000)}h {Math.floor((remainingMs % 3600000) / 60000)}m remaining
                </span>
              ) : null}
              <div className={styles.preflightToggles}>
                <label>
                  <input type="checkbox" checked={cameraEnabled} onChange={(event) => setCameraEnabled(event.target.checked)} />
                  <FaVideo /> Camera on
                </label>
                <label>
                  <input type="checkbox" checked={microphoneEnabled} onChange={(event) => setMicrophoneEnabled(event.target.checked)} />
                  <FaMicrophone /> Microphone on
                </label>
              </div>
              {joinError ? <p className={styles.preflightError} role="alert">{joinError}</p> : null}
              {endError ? <p className={styles.preflightError} role="alert">{endError}</p> : null}
              <div className={styles.preflightActions}>
                <button type="button" className={styles.joinButton} onClick={joinCall} disabled={joining}>
                  <FaVideo /> {joining ? 'Checking devices…' : 'Join call'}
                </button>
                {joinError ? (
                  <button
                    type="button"
                    className={styles.audioOnlyButton}
                    onClick={() => { setCameraEnabled(false); setMicrophoneEnabled(false); setConnected(true); }}
                  >
                    Join without camera or mic
                  </button>
                ) : null}
                {call?.is_initiator ? (
                  <button type="button" className={styles.endForEveryoneButton} onClick={endForEveryone} disabled={ending}>
                    {ending ? 'Ending…' : 'End call for everyone'}
                  </button>
                ) : null}
              </div>
            </div>
            <div className={styles.brandFooter}>
              <span>Your academic journey, connected.</span>
              <FaBookOpen aria-hidden="true" />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatVideoCallModal;
