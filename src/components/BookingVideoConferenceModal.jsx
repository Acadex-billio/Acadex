import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Chat,
  LiveKitRoom,
  GridLayout,
  ParticipantTile,
  RoomAudioRenderer,
  ControlBar,
  useConnectionState,
  useParticipants,
  useTracks,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { FaComments, FaTimes, FaUsers, FaVideo } from 'react-icons/fa';
import '@livekit/components-styles';
import api from '../services/api';
import styles from '../Astyles/lecturerPortal.module.css';

const formatCountdown = (milliseconds) => {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
};

const ConferenceStage = ({ bookingId, canShareScreen, canManageParticipants }) => {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const [activePanel, setActivePanel] = useState('');
  const [participantError, setParticipantError] = useState('');
  const [pendingAction, setPendingAction] = useState('');

  const toggleRemoteMute = async (participant, audioTrack) => {
    const actionKey = `${participant.identity}:${audioTrack.trackSid}`;
    setPendingAction(actionKey);
    setParticipantError('');
    try {
      await api.post(
        `/lecturers/bookings/${encodeURIComponent(bookingId)}/video/participants/${encodeURIComponent(participant.identity)}/mute`,
        { track_sid: audioTrack.trackSid, muted: !audioTrack.isMuted }
      );
    } catch (error) {
      setParticipantError(error?.response?.data?.message || 'Unable to update participant audio.');
    } finally {
      setPendingAction('');
    }
  };

  const removeParticipant = async (participant) => {
    const actionKey = `${participant.identity}:remove`;
    setPendingAction(actionKey);
    setParticipantError('');
    try {
      await api.post(
        `/lecturers/bookings/${encodeURIComponent(bookingId)}/video/participants/${encodeURIComponent(participant.identity)}/remove`
      );
    } catch (error) {
      setParticipantError(error?.response?.data?.message || 'Unable to remove participant.');
    } finally {
      setPendingAction('');
    }
  };

  return (
    <div className={styles.livekitShell}>
      <div className={styles.livekitContent}>
        <div className={styles.livekitGridWrap}>
          <GridLayout tracks={tracks} style={{ height: '100%' }}>
            <ParticipantTile />
          </GridLayout>
        </div>
        {activePanel ? (
          <aside className={styles.livekitSidePanel}>
            <div className={styles.livekitPanelHeader}>
              <strong>{activePanel === 'chat' ? 'In-call chat' : 'Participants'}</strong>
              <button type="button" onClick={() => setActivePanel('')} aria-label="Close panel">
                <FaTimes />
              </button>
            </div>
            {activePanel === 'chat' ? (
              <div className={styles.livekitChat}>
                <Chat />
                <small>Chat messages are only available during this session.</small>
              </div>
            ) : (
              <div className={styles.livekitParticipantList}>
                {participants.map((participant) => {
                  const audioTrack = Array.from(participant.trackPublications.values())
                    .find((publication) => publication.kind === Track.Kind.Audio);
                  const actionKey = audioTrack ? `${participant.identity}:${audioTrack.trackSid}` : '';
                  return (
                    <div className={styles.livekitParticipant} key={participant.identity}>
                      <span>
                        {participant.name || 'Guest'}
                        {participant.isLocal ? ' (you)' : ''}
                      </span>
                      {canManageParticipants && !participant.isLocal ? (
                        <div className={styles.livekitParticipantActions}>
                          {audioTrack ? (
                            <button
                              type="button"
                              disabled={audioTrack.isMuted || pendingAction === actionKey}
                              onClick={() => toggleRemoteMute(participant, audioTrack)}
                            >
                              {audioTrack.isMuted ? 'Muted' : 'Mute'}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            disabled={pendingAction === `${participant.identity}:remove`}
                            onClick={() => removeParticipant(participant)}
                          >
                            Remove
                          </button>
                        </div>
                      ) : null}
                    </div>
                  );
                })}
                {participantError ? <p className={styles.livekitActionError}>{participantError}</p> : null}
                {canManageParticipants ? <small>Removed participants may rejoin if they still have access.</small> : null}
              </div>
            )}
          </aside>
        ) : null}
      </div>
      <div className={styles.livekitToolbarWrap}>
        <div className={styles.livekitToolbarInfo}>
          <span aria-live="polite">Connection: {connectionState}</span>
          <span>{participants.length} participant{participants.length === 1 ? '' : 's'}</span>
          <div className={styles.livekitPanelButtons}>
            <button type="button" onClick={() => setActivePanel(activePanel === 'participants' ? '' : 'participants')}>
              <FaUsers /> People
            </button>
            <button type="button" onClick={() => setActivePanel(activePanel === 'chat' ? '' : 'chat')}>
              <FaComments /> Chat
            </button>
          </div>
        </div>
        <ControlBar
          variation="minimal"
          controls={{
            camera: true,
            microphone: true,
            screenShare: canShareScreen,
            leave: true,
            chat: false,
            settings: true,
            deviceSelector: true,
          }}
        />
      </div>
    </div>
  );
};

const BookingVideoConferenceModal = ({
  bookingId,
  roomName,
  accessToken,
  serverUrl,
  displayName,
  email,
  title,
  subtitle,
  minutesLeft,
  endsAt,
  canShareScreen = true,
  canManageParticipants = false,
  onClose,
}) => {
  const [loadError, setLoadError] = useState('');
  const [preflightError, setPreflightError] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [previewStream, setPreviewStream] = useState(null);
  const [devicesChecked, setDevicesChecked] = useState(false);
  const [connected, setConnected] = useState(false);
  const [sessionEnded, setSessionEnded] = useState(false);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState('');
  const [now, setNow] = useState(Date.now());
  const previewRef = useRef(null);

  const endTime = useMemo(() => {
    const parsed = new Date(endsAt || 0).getTime();
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [endsAt]);
  const remainingMs = endTime ? Math.max(0, endTime - now) : null;

  useEffect(() => {
    if (!accessToken || !serverUrl) {
      setLoadError('Video service details are missing. Please refresh and try again.');
      return;
    }
    setLoadError('');
  }, [accessToken, serverUrl]);

  useEffect(() => {
    if (!endTime) return undefined;
    const timer = window.setInterval(() => {
      const currentTime = Date.now();
      setNow(currentTime);
      if (currentTime >= endTime) {
        setSessionEnded(true);
        window.clearInterval(timer);
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [endTime]);

  useEffect(() => {
    const video = previewRef.current;
    if (video && previewStream) video.srcObject = previewStream;
    return () => {
      previewStream?.getTracks().forEach((track) => track.stop());
      if (video) video.srcObject = null;
    };
  }, [previewStream]);

  const checkDevices = async () => {
    setPreflightError('');
    if (endTime && Date.now() >= endTime) {
      setSessionEnded(true);
      return;
    }
    if (cameraEnabled || microphoneEnabled) {
      if (!navigator.mediaDevices?.getUserMedia) {
        setPreflightError('This browser does not support camera or microphone access. You can still join without them.');
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: microphoneEnabled,
          video: cameraEnabled,
        });
        setPreviewStream(stream);
      } catch (error) {
        setPreflightError(error?.message || 'Camera or microphone permission was denied. Check your browser settings or join without media.');
        return;
      }
    }
    setDevicesChecked(true);
  };

  const joinConference = (withoutMedia = false) => {
    if (endTime && Date.now() >= endTime) {
      setSessionEnded(true);
      return;
    }
    if (withoutMedia) {
      setCameraEnabled(false);
      setMicrophoneEnabled(false);
    }
    previewStream?.getTracks().forEach((track) => track.stop());
    setPreviewStream(null);
    setConnected(true);
  };

  const updateMediaChoice = (setter) => (event) => {
    previewStream?.getTracks().forEach((track) => track.stop());
    setPreviewStream(null);
    setDevicesChecked(false);
    setPreflightError('');
    setter(event.target.checked);
  };

  const endForEveryone = async () => {
    if (!canManageParticipants || !bookingId) return;
    if (!window.confirm('End this conference for all participants?')) return;
    setEnding(true);
    setEndError('');
    try {
      await api.post(`/lecturers/bookings/${encodeURIComponent(bookingId)}/video/end`);
      setSessionEnded(true);
      onClose();
    } catch (error) {
      setEndError(error?.response?.data?.message || 'Unable to end the conference for everyone.');
    } finally {
      setEnding(false);
    }
  };

  return (
    <div className={styles.videoOverlay} role="dialog" aria-modal="true" aria-label={title || 'Video conference'}>
      <div className={styles.videoModal}>
        <div className={styles.videoHeader}>
          <span><FaVideo /> {title || 'Contract Video Conference'}</span>
          <div className={styles.videoHeaderActions}>
            {canManageParticipants && !sessionEnded ? (
              <button className={styles.videoEndButton} type="button" onClick={endForEveryone} disabled={ending}>
                {ending ? 'Ending...' : 'End for everyone'}
              </button>
            ) : null}
            <button className={styles.videoClose} type="button" onClick={onClose} aria-label="Leave conference">
              <FaTimes />
            </button>
          </div>
        </div>

        <div className={styles.videoMetaBar}>
          <span>{subtitle || 'Secure in-app session'}</span>
          <span>
            {remainingMs !== null
              ? (remainingMs > 0 ? `Ends in ${formatCountdown(remainingMs)}` : 'Session ended')
              : `${minutesLeft > 0 ? `${minutesLeft} min` : 'Session ending soon'}`}
          </span>
        </div>
        {endError ? <p className={styles.videoPreflightError} role="alert">{endError}</p> : null}

        {loadError ? (
          <div className={styles.videoError} role="alert">{loadError}</div>
        ) : sessionEnded ? (
          <div className={styles.videoEnded} role="status">
            <strong>This conference has ended.</strong>
            <span>The scheduled session time is over.</span>
            <button type="button" onClick={onClose}>Leave</button>
          </div>
        ) : connected ? (
          <div className={styles.videoFrameHost}>
            <LiveKitRoom
              token={accessToken}
              serverUrl={serverUrl}
              connect
              audio={microphoneEnabled}
              video={cameraEnabled}
              onDisconnected={onClose}
              onError={(error) => setLoadError(error?.message || 'Unable to connect to the conference.')}
              data-lk-theme="default"
              options={{ adaptiveStream: true, dynacast: true }}
            >
              <RoomAudioRenderer />
              <ConferenceStage
                bookingId={bookingId}
                canShareScreen={canShareScreen}
                canManageParticipants={canManageParticipants}
              />
            </LiveKitRoom>
          </div>
        ) : (
          <div className={styles.videoPreflight}>
            <h2>Check your devices</h2>
            <p>Choose whether to join with your camera and microphone. You can change devices after joining.</p>
            {cameraEnabled && previewStream ? (
              <video className={styles.videoPreview} ref={previewRef} autoPlay muted playsInline aria-label="Camera preview" />
            ) : null}
            {devicesChecked ? <p>Selected devices are ready.</p> : null}
            <div className={styles.videoPreflightToggles}>
              <label>
                <input type="checkbox" checked={cameraEnabled} onChange={updateMediaChoice(setCameraEnabled)} />
                Camera on
              </label>
              <label>
                <input type="checkbox" checked={microphoneEnabled} onChange={updateMediaChoice(setMicrophoneEnabled)} />
                Microphone on
              </label>
            </div>
            {preflightError ? <p className={styles.videoPreflightError} role="alert">{preflightError}</p> : null}
            <div className={styles.videoPreflightActions}>
              {!devicesChecked ? <button type="button" onClick={checkDevices}>Check devices</button> : null}
              {devicesChecked ? <button type="button" onClick={() => joinConference()}>Join conference</button> : null}
              {preflightError ? <button type="button" onClick={() => joinConference(true)}>Join without camera/mic</button> : null}
            </div>
          </div>
        )}

        <p className={styles.videoNote}>
          {connected ? 'Connected' : 'Joining'} as {String(displayName || 'Guest')}{email ? ` (${email})` : ''} in room {roomName}.
        </p>
      </div>
    </div>
  );
};

export default BookingVideoConferenceModal;
