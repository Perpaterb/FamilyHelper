/**
 * WebRTC Hook for Video Calling
 *
 * Manages WebRTC peer connections for video calls.
 * Supports both web (native WebRTC API) and mobile (react-native-webrtc).
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { Platform } from 'react-native';
import api from '../services/api';

// Import WebRTC classes - on mobile, use react-native-webrtc
let RTCPeerConnectionClass;
let RTCSessionDescriptionClass;
let RTCIceCandidateClass;
let mediaDevicesAPI;

if (Platform.OS === 'web') {
  // Web: Use native WebRTC API
  RTCPeerConnectionClass = typeof RTCPeerConnection !== 'undefined' ? RTCPeerConnection : null;
  RTCSessionDescriptionClass = typeof RTCSessionDescription !== 'undefined' ? RTCSessionDescription : null;
  RTCIceCandidateClass = typeof RTCIceCandidate !== 'undefined' ? RTCIceCandidate : null;
  mediaDevicesAPI = typeof navigator !== 'undefined' && navigator.mediaDevices ? navigator.mediaDevices : null;
} else {
  // Mobile: Use react-native-webrtc
  try {
    const webrtc = require('react-native-webrtc');
    RTCPeerConnectionClass = webrtc.RTCPeerConnection;
    RTCSessionDescriptionClass = webrtc.RTCSessionDescription;
    RTCIceCandidateClass = webrtc.RTCIceCandidate;
    mediaDevicesAPI = webrtc.mediaDevices;
  } catch (err) {
    console.warn('[WebRTC] react-native-webrtc not available:', err.message);
  }
}

/**
 * @typedef {Object} PeerConnection
 * @property {string} peerId - The peer's group member ID
 * @property {RTCPeerConnection} connection - The WebRTC peer connection
 * @property {MediaStream} remoteStream - The remote media stream
 * @property {string} connectionState - Current connection state
 */

/**
 * @typedef {Object} WebRTCState
 * @property {MediaStream} localStream - Local camera/mic stream
 * @property {Object.<string, PeerConnection>} peers - Map of peer connections
 * @property {boolean} isConnecting - Whether connection is in progress
 * @property {string} error - Error message if any
 * @property {string[]} recordingStatus - Recording status messages from server
 */

/**
 * Hook for managing WebRTC calls (audio and video)
 *
 * @param {Object} options
 * @param {string} options.groupId - The group ID
 * @param {string} options.callId - The call ID
 * @param {boolean} options.isActive - Whether the call is active
 * @param {boolean} options.isInitiator - Whether current user initiated the call
 * @param {boolean} options.audioOnly - Whether this is audio-only (phone call) vs video call
 * @param {string} options.callType - 'phone' or 'video' - determines API endpoint
 * @returns {Object} WebRTC state and controls
 */
export function useWebRTC({ groupId, callId, isActive, isInitiator, audioOnly = false, callType = 'video' }) {
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({}); // { peerId: MediaStream }
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);
  const [myPeerId, setMyPeerId] = useState(null);
  const [connectionStates, setConnectionStates] = useState({}); // { peerId: state }
  const [cameraFacing, setCameraFacing] = useState('front'); // 'front' or 'back'
  const [recordingStatus, setRecordingStatus] = useState([]); // Recording status messages from server

  // Recording chunk tracking - parsed from status messages
  const [recordingChunks, setRecordingChunks] = useState({
    totalExpected: 0,    // How many chunks will there be (from "Recording X STARTED")
    uploaded: 0,         // How many have been uploaded (from "UPLOADED to S3")
    uploading: false,    // Is an upload currently in progress
  });

  const peerConnectionsRef = useRef({}); // { peerId: RTCPeerConnection }
  const iceServersRef = useRef([]);
  const pollingRef = useRef(null);
  const localStreamRef = useRef(null); // Ref to track localStream for cleanup
  // WebRTC is supported if we have the necessary classes (either native web or react-native-webrtc)
  const isWebRTCSupported = RTCPeerConnectionClass !== null && mediaDevicesAPI !== null;

  // API endpoint base path depends on call type
  const apiBasePath = callType === 'phone'
    ? `/groups/${groupId}/phone-calls/${callId}`
    : `/groups/${groupId}/video-calls/${callId}`;

  /**
   * Create a new peer connection
   */
  const createPeerConnection = useCallback((peerId) => {
    if (!isWebRTCSupported) return null;

    const pc = new RTCPeerConnectionClass({
      iceServers: iceServersRef.current,
    });

    // Add local stream tracks
    if (localStream) {
      localStream.getTracks().forEach(track => {
        pc.addTrack(track, localStream);
      });
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      // Filter out the ghost recorder - it shouldn't appear as a participant
      if (peerId === 'recorder') {
        return;
      }

      const stream = event.streams[0];
      setRemoteStreams(prev => ({
        ...prev,
        [peerId]: stream,
      }));
    };

    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        try {
          await api.post(`${apiBasePath}/signal`, {
            type: 'ice-candidate',
            data: event.candidate,
            targetPeerId: peerId,
          });
        } catch (err) {
          console.error('[WebRTC] ICE candidate error:', err.message);
        }
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      // Don't track recorder's connection state
      if (peerId === 'recorder') return;

      // Only log significant state changes
      if (['connected', 'failed', 'disconnected'].includes(pc.connectionState)) {
        console.log(`[WebRTC] ${peerId}: ${pc.connectionState}`);
      }

      setConnectionStates(prev => ({
        ...prev,
        [peerId]: pc.connectionState,
      }));
    };

    peerConnectionsRef.current[peerId] = pc;
    return pc;
  }, [groupId, callId, localStream, isWebRTCSupported]);

  /**
   * Create and send an offer
   */
  const createOffer = useCallback(async (peerId) => {
    if (!isWebRTCSupported) return;

    let pc = peerConnectionsRef.current[peerId];
    if (!pc) {
      pc = createPeerConnection(peerId);
    }

    try {
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await pc.setLocalDescription(offer);

      await api.post(`${apiBasePath}/signal`, {
        type: 'offer',
        data: offer,
        targetPeerId: peerId,
      });
    } catch (err) {
      console.error('[WebRTC] Offer error:', err.message);
      setError('Failed to create offer');
    }
  }, [groupId, callId, createPeerConnection, isWebRTCSupported]);

  /**
   * Handle incoming offer and create answer
   */
  const handleOffer = useCallback(async (peerId, offer) => {
    if (!isWebRTCSupported) return;

    let pc = peerConnectionsRef.current[peerId];
    if (!pc) {
      pc = createPeerConnection(peerId);
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescriptionClass(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      await api.post(`${apiBasePath}/signal`, {
        type: 'answer',
        data: answer,
        targetPeerId: peerId,
      });
    } catch (err) {
      console.error('[WebRTC] Answer error:', err.message);
      setError('Failed to handle offer');
    }
  }, [groupId, callId, createPeerConnection, isWebRTCSupported]);

  /**
   * Handle incoming answer
   */
  const handleAnswer = useCallback(async (peerId, answer) => {
    if (!isWebRTCSupported) return;

    const pc = peerConnectionsRef.current[peerId];
    if (!pc) {
      return;
    }

    try {
      await pc.setRemoteDescription(new RTCSessionDescriptionClass(answer));
    } catch (err) {
      console.error('[WebRTC] Handle answer error:', err.message);
      setError('Failed to handle answer');
    }
  }, [isWebRTCSupported]);

  /**
   * Handle incoming ICE candidate
   */
  const handleIceCandidate = useCallback(async (peerId, candidate) => {
    if (!isWebRTCSupported) return;

    const pc = peerConnectionsRef.current[peerId];
    if (!pc) {
      return;
    }

    try {
      await pc.addIceCandidate(new RTCIceCandidateClass(candidate));
    } catch (err) {
      // ICE candidate errors are common and usually not critical
    }
  }, [isWebRTCSupported]);

  /**
   * Process incoming signals
   */
  const processSignals = useCallback(async (signals) => {
    for (const signal of signals) {
      switch (signal.type) {
        case 'offer':
          await handleOffer(signal.from, signal.data);
          break;
        case 'answer':
          await handleAnswer(signal.from, signal.data);
          break;
        case 'ice-candidate':
          await handleIceCandidate(signal.from, signal.data);
          break;
        default:
          // Unknown signal type - ignore
      }
    }
  }, [handleOffer, handleAnswer, handleIceCandidate]);

  /**
   * Poll for signals
   */
  const pollSignals = useCallback(async () => {
    if (!isActive || !isWebRTCSupported) return;

    try {
      const response = await api.get(`${apiBasePath}/signal`);
      const { signals, peers, myPeerId: receivedPeerId, recordingStatus: newStatus } = response.data;

      if (receivedPeerId && !myPeerId) {
        setMyPeerId(receivedPeerId);
      }

      // Handle recording status messages from server
      if (newStatus && newStatus.length > 0) {
        newStatus.forEach(msg => {
          console.log(`[Recording] ${msg}`);

          // Parse messages to track chunk progress
          // "Recording X STARTED" - indicates there will be X chunks
          const startedMatch = msg.match(/Recording (\d+) STARTED/);
          if (startedMatch) {
            const chunkNum = parseInt(startedMatch[1], 10);
            setRecordingChunks(prev => ({
              ...prev,
              totalExpected: Math.max(prev.totalExpected, chunkNum),
            }));
          }

          // "Recording X uploading to S3..." - upload in progress
          const uploadingMatch = msg.match(/Recording \d+ uploading to S3/);
          if (uploadingMatch) {
            setRecordingChunks(prev => ({ ...prev, uploading: true }));
          }

          // "Recording X UPLOADED to S3 ✓" - upload complete
          const uploadedMatch = msg.match(/Recording (\d+) UPLOADED to S3/);
          if (uploadedMatch) {
            setRecordingChunks(prev => ({
              ...prev,
              uploaded: prev.uploaded + 1,
              uploading: false,
            }));
          }
        });
        setRecordingStatus(prev => [...prev, ...newStatus].slice(-20)); // Keep last 20 messages
      }

      // Process any incoming signals
      if (signals && signals.length > 0) {
        await processSignals(signals);
      }

      // If we're the initiator and there are new peers, send offers
      if (isInitiator && peers) {
        for (const peer of peers) {
          // Send offers to all peers including the recorder (so it can receive our audio)
          if (!peerConnectionsRef.current[peer.peerId] && peer.status !== 'invited') {
            await createOffer(peer.peerId);
          }
        }
      }

      // Non-initiators also need to send offers to the recorder when it joins
      if (!isInitiator && peers) {
        for (const peer of peers) {
          if (peer.peerId === 'recorder' && !peerConnectionsRef.current['recorder']) {
            await createOffer('recorder');
          }
        }
      }
    } catch (err) {
      console.error('[WebRTC] Signal poll error:', err.message);
    }
  }, [groupId, callId, isActive, isInitiator, myPeerId, processSignals, createOffer, isWebRTCSupported]);

  /**
   * Initialize local stream
   */
  const initializeLocalStream = useCallback(async () => {
    if (!isWebRTCSupported) {
      setError('WebRTC is not available. Please use a development build with react-native-webrtc.');
      return null;
    }

    try {
      const constraints = {
        video: !audioOnly, // No video for phone calls
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      };
      const stream = await mediaDevicesAPI.getUserMedia(constraints);
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      console.error('[WebRTC] Media access error:', err.message);
      // Try audio only if video fails (for video calls)
      if (!audioOnly) {
        try {
          const audioStream = await mediaDevicesAPI.getUserMedia({
            video: false,
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
          localStreamRef.current = audioStream;
          setLocalStream(audioStream);
          return audioStream;
        } catch (audioErr) {
          console.error('[WebRTC] Audio access error:', audioErr.message);
          setError('Failed to access microphone');
          return null;
        }
      } else {
        setError('Failed to access microphone');
        return null;
      }
    }
  }, [isWebRTCSupported, audioOnly]);

  /**
   * Fetch ICE servers
   */
  const fetchIceServers = useCallback(async () => {
    try {
      const response = await api.get(`${apiBasePath}/ice-servers`);
      iceServersRef.current = response.data.iceServers || [];
    } catch (err) {
      // Use default Google STUN servers as fallback
      iceServersRef.current = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ];
    }
  }, [groupId, callId]);

  /**
   * Start the WebRTC connection process
   */
  const startConnection = useCallback(async () => {
    if (!isWebRTCSupported) {
      setError('WebRTC is not available. Please use a development build.');
      return;
    }

    setIsConnecting(true);
    setError(null);

    try {
      // Fetch ICE servers
      await fetchIceServers();

      // Initialize local stream
      await initializeLocalStream();

      // Start polling for signals
      pollingRef.current = setInterval(pollSignals, 1000);

      setIsConnecting(false);
    } catch (err) {
      console.error('[WebRTC] Failed to start connection:', err);
      setError('Failed to start video connection');
      setIsConnecting(false);
    }
  }, [fetchIceServers, initializeLocalStream, pollSignals, isWebRTCSupported]);

  /**
   * Stop all connections and cleanup
   */
  const stopConnection = useCallback(() => {
    // Stop polling
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }

    // Close all peer connections
    for (const [peerId, pc] of Object.entries(peerConnectionsRef.current)) {
      pc.close();
    }
    peerConnectionsRef.current = {};

    // Stop local stream - use ref to ensure we always have access to current stream
    const stream = localStreamRef.current;
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
      });
      localStreamRef.current = null;
      setLocalStream(null);
    }

    // Clear remote streams
    setRemoteStreams({});
    setConnectionStates({});
    setRecordingStatus([]);
    setRecordingChunks({ totalExpected: 0, uploaded: 0, uploading: false });
  }, []);

  /**
   * Toggle local video
   */
  const toggleVideo = useCallback((enabled) => {
    if (localStream) {
      localStream.getVideoTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }, [localStream]);

  /**
   * Toggle local audio
   */
  const toggleAudio = useCallback((enabled) => {
    if (localStream) {
      localStream.getAudioTracks().forEach(track => {
        track.enabled = enabled;
      });
    }
  }, [localStream]);

  /**
   * Switch between front and back camera
   */
  const switchCamera = useCallback(async () => {
    if (!localStream || audioOnly || !isWebRTCSupported) {
      return;
    }

    try {
      const newFacing = cameraFacing === 'front' ? 'back' : 'front';
      const facingMode = newFacing === 'front' ? 'user' : 'environment';

      // Get new video stream with opposite camera
      const newStream = await mediaDevicesAPI.getUserMedia({
        video: { facingMode },
        audio: false, // Keep existing audio track
      });

      const newVideoTrack = newStream.getVideoTracks()[0];
      const oldVideoTrack = localStream.getVideoTracks()[0];

      if (oldVideoTrack && newVideoTrack) {
        // Replace track in all peer connections
        Object.values(peerConnectionsRef.current).forEach(pc => {
          const sender = pc.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(newVideoTrack);
          }
        });

        // Stop old track and replace in local stream
        oldVideoTrack.stop();
        localStream.removeTrack(oldVideoTrack);
        localStream.addTrack(newVideoTrack);

        // Update state
        setCameraFacing(newFacing);
        setLocalStream(localStream); // Trigger re-render
      }
    } catch (err) {
      console.error('[WebRTC] Camera switch error:', err.message);
    }
  }, [localStream, cameraFacing, audioOnly, isWebRTCSupported]);

  // Start connection when call becomes active
  useEffect(() => {
    if (isActive && isWebRTCSupported) {
      startConnection();
    }

    return () => {
      stopConnection();
    };
  }, [isActive, isWebRTCSupported]);

  // Poll signals while active
  useEffect(() => {
    if (isActive && localStream && !pollingRef.current && isWebRTCSupported) {
      pollingRef.current = setInterval(pollSignals, 1000);
    }

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [isActive, localStream, pollSignals, isWebRTCSupported]);

  return {
    // State
    localStream,
    remoteStreams,
    isConnecting,
    error,
    myPeerId,
    connectionStates,
    isWebRTCSupported,
    recordingStatus, // Recording status messages from server
    recordingChunks, // { totalExpected, uploaded, uploading } - for UI progress display

    // Controls
    startConnection,
    stopConnection,
    toggleVideo,
    toggleAudio,
    switchCamera,
  };
}

export default useWebRTC;
