import React, { useEffect, useState } from 'react';
import { FaTimes, FaVideo } from 'react-icons/fa';
import { LiveKitRoom, GridLayout, ParticipantTile, RoomAudioRenderer, ControlBar, useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';
import '@livekit/components-styles';
import styles from '../Astyles/lecturerPortal.module.css';

const ConferenceStage = () => {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);

  return (
    <div className={styles.livekitShell}>
      <div className={styles.livekitGridWrap}>
        <GridLayout tracks={tracks} style={{ height: '100%' }}>
          <ParticipantTile />
        </GridLayout>
      </div>
      <div className={styles.livekitToolbarWrap}>
        <ControlBar
          variation="minimal"
          controls={{
            camera: true,
            microphone: true,
            screenShare: true,
            leave: true,
            chat: false,
            settings: false,
            deviceSelector: true,
          }}
        />
      </div>
    </div>
  );
};

const BookingVideoConferenceModal = ({
  roomName,
  accessToken,
  serverUrl,
  displayName,
  email,
  title,
  subtitle,
  minutesLeft,
  onClose,
}) => {
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    if (!accessToken || !serverUrl) {
      setLoadError('Video service details are missing. Please refresh and try again.');
      return;
    }
    setLoadError('');
  }, [accessToken, serverUrl]);

  return (
    <div className={styles.videoOverlay}>
      <div className={styles.videoModal}>
        <div className={styles.videoHeader}>
          <span><FaVideo /> {title || 'Contract Video Conference'}</span>
          <button className={styles.videoClose} onClick={onClose} aria-label="Close"><FaTimes /></button>
        </div>

        <div className={styles.videoMetaBar}>
          <span>{subtitle || 'Secure in-app session'}</span>
          <span>{minutesLeft > 0 ? `${minutesLeft} min left` : 'Session ending soon'}</span>
        </div>

        {loadError ? (
          <div className={styles.videoError}>{loadError}</div>
        ) : (
          <div className={styles.videoFrameHost}>
            <LiveKitRoom
              token={accessToken}
              serverUrl={serverUrl}
              connect
              audio
              video
              onError={(err) => setLoadError(err?.message || 'Unable to connect to the conference.')}
              data-lk-theme="default"
              options={{ adaptiveStream: true, dynacast: true }}
            >
              <RoomAudioRenderer />
              <ConferenceStage />
            </LiveKitRoom>
          </div>
        )}

        <p className={styles.videoNote}>
          Connected as {String(displayName || 'Guest')}{email ? ` (${email})` : ''} in room {roomName}.
        </p>
      </div>
    </div>
  );
};

export default BookingVideoConferenceModal;
