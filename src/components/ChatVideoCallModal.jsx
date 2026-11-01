import React, { useEffect, useMemo, useState } from 'react';
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

const ChatCallStage = () => {
  const tracks = useTracks([
    { source: Track.Source.Camera, withPlaceholder: true },
    { source: Track.Source.ScreenShare, withPlaceholder: false },
  ]);
  const participants = useParticipants();
  const connectionState = useConnectionState();
  const [panel, setPanel] = useState('');

  return (
    <div className={styles.livekitShell}>
      <div className={styles.livekitContent}>
        <div className={styles.livekitGridWrap}>
          <GridLayout tracks={tracks} style={{ height: '100%' }}>
            <ParticipantTile />
          </GridLayout>
        </div>
        {panel ? (
          <aside className={styles.livekitSidePanel}>
            <div className={styles.livekitPanelHeader}>
              <strong>{panel === 'chat' ? 'In-call chat' : 'Participants'}</strong>
              <button type="button" onClick={() => setPanel('')} aria-label="Close panel"><FaTimes /></button>
            </div>
            {panel === 'chat' ? (
              <div className={styles.livekitChat}>
                <Chat />
                <small>Chat messages are only available during this call.</small>
              </div>
            ) : (
              <div className={styles.livekitParticipantList}>
                {participants.map((participant) => (
                  <div className={styles.livekitParticipant} key={participant.identity}>
                    <span>{participant.name || 'Chat member'}{participant.isLocal ? ' (you)' : ''}</span>
                  </div>
                ))}
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
            <button type="button" onClick={() => setPanel(panel === 'participants' ? '' : 'participants')}><FaUsers /> People</button>
            <button type="button" onClick={() => setPanel(panel === 'chat' ? '' : 'chat')}><FaComments /> Chat</button>
          </div>
        </div>
        <ControlBar
          variation="minimal"
          controls={{
            camera: true,
            microphone: true,
            screenShare: true,
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
        <div className={styles.videoHeader}>
          <span><FaVideo /> Free video call · {roomLabel}</span>
          <div className={styles.videoHeaderActions}>
            {call?.is_initiator && !callEnded ? (
              <button className={styles.videoEndButton} type="button" onClick={endForEveryone} disabled={ending}>
                {ending ? 'Ending...' : 'End for everyone'}
              </button>
            ) : null}
            <button className={styles.videoClose} type="button" onClick={onClose} aria-label="Leave call"><FaTimes /></button>
          </div>
        </div>
        <div className={styles.videoMetaBar}>
          <span>{call?.is_initiator ? 'You started this call' : `Call started by ${call?.started_by_name || 'a chat member'}`}</span>
          <span>{remainingMs === null ? '' : `Up to ${Math.floor(remainingMs / 3600000)}h ${Math.floor((remainingMs % 3600000) / 60000)}m remaining`}</span>
        </div>
        {joinError ? <p className={styles.videoPreflightError} role="alert">{joinError}</p> : null}
        {endError ? <p className={styles.videoPreflightError} role="alert">{endError}</p> : null}
        {callEnded ? (
          <div className={styles.videoEnded} role="status">
            <strong>This video call has ended.</strong>
            <span>Start another free call from this chat whenever you’re ready.</span>
            <button type="button" onClick={onClose}>Close</button>
          </div>
        ) : connected ? (
          <div className={styles.videoFrameHost}>
            <LiveKitRoom
              token={call.livekit_token}
              serverUrl={call.livekit_url}
              connect
              audio={microphoneEnabled}
              video={cameraEnabled}
              onError={(error) => setJoinError(error?.message || 'Unable to connect to the video call.')}
              onDisconnected={() => {
                if (!callEnded) onClose();
              }}
              data-lk-theme="default"
              options={{ adaptiveStream: true, dynacast: true }}
            >
              <RoomAudioRenderer />
              <ChatCallStage />
            </LiveKitRoom>
          </div>
        ) : (
          <div className={styles.videoPreflight}>
            <h2>Join this free call</h2>
            <p>Anyone who belongs to this chat can join while the call is active.</p>
            <div className={styles.videoPreflightToggles}>
              <label><input type="checkbox" checked={cameraEnabled} onChange={(event) => setCameraEnabled(event.target.checked)} /> Camera on</label>
              <label><input type="checkbox" checked={microphoneEnabled} onChange={(event) => setMicrophoneEnabled(event.target.checked)} /> Microphone on</label>
            </div>
            <div className={styles.videoPreflightActions}>
              <button type="button" onClick={joinCall} disabled={joining}>{joining ? 'Joining...' : 'Check devices & join'}</button>
              {joinError ? (
                <button type="button" onClick={() => { setCameraEnabled(false); setMicrophoneEnabled(false); setConnected(true); }}>
                  Join without camera/mic
                </button>
              ) : null}
            </div>
          </div>
        )}
        <p className={styles.videoNote}>{connected ? 'Connected to' : 'Joining'} {roomLabel}</p>
      </div>
    </div>
  );
};

export default ChatVideoCallModal;
