import { supabase } from "../../../../supabase-browser.js";
import { clampUnitVolume } from "./voiceRtcSessionConfig.js";

export function createVoiceRtcSessionControls({
  applyPlaybackToPeer,
  cleanupPeer,
  getLocalStreams,
  getParticipantState,
  getPlaybackState,
  getPeers,
  getRealtimeChannel,
  handlePeerLeft,
  handlePeersSnapshot,
  handleSignal,
  handleSocketConnect,
  handleSessionError,
  realtimeEnabled,
  setDestroyed,
  setParticipantState,
  setPlaybackState,
  setRealtimeChannel,
  socket,
  syncLocalAudioToPeer,
  syncLocalVideoToPeer,
  syncRealtimePresence,
  updateLocalStreams
}) {
  return {
    async updateLocalMediaStreams({
      audioStream = null,
      cameraStream = null,
      screenShareStream = null
    } = {}) {
      updateLocalStreams({
        audioStream,
        cameraStream,
        screenShareStream
      });

      if (realtimeEnabled && getRealtimeChannel()) {
        syncRealtimePresence().catch((error) => {
          handleSessionError(error);
        });
      }

      for (const entry of getPeers().values()) {
        await syncLocalAudioToPeer(entry, {
          renegotiate: true
        });
        await syncLocalVideoToPeer(entry, {
          renegotiate: true
        });
      }
    },
    setLocalTrackEnabled(nextEnabled) {
      const streams = getLocalStreams();
      streams.localAudioStream?.getAudioTracks?.().forEach((track) => {
        track.enabled = Boolean(nextEnabled);
      });
    },
    updateParticipantState(nextState = {}) {
      const participantState = getParticipantState();
      setParticipantState({
        deafened:
          typeof nextState.deafened === "boolean"
            ? nextState.deafened
            : participantState.deafened,
        micMuted:
          typeof nextState.micMuted === "boolean"
            ? nextState.micMuted
            : participantState.micMuted,
        speaking:
          typeof nextState.speaking === "boolean"
            ? nextState.speaking
            : participantState.speaking
      });

      if (realtimeEnabled && getRealtimeChannel()) {
        syncRealtimePresence().catch((error) => {
          handleSessionError(error);
        });
      }
    },
    updatePlayback(nextPlayback = {}) {
      const playbackState = getPlaybackState();
      setPlaybackState({
        deafened:
          typeof nextPlayback.deafened === "boolean"
            ? nextPlayback.deafened
            : playbackState.deafened,
        outputDeviceId: nextPlayback.outputDeviceId || playbackState.outputDeviceId,
        outputVolume:
          nextPlayback.outputVolume === undefined
            ? playbackState.outputVolume
            : clampUnitVolume(nextPlayback.outputVolume, playbackState.outputVolume)
      });

      for (const entry of getPeers().values()) {
        applyPlaybackToPeer(entry);
      }
    },
    async destroy() {
      setDestroyed(true);

      if (realtimeEnabled) {
        const realtimeChannel = getRealtimeChannel();
        if (realtimeChannel) {
          try {
            await realtimeChannel.untrack();
          } catch {
            // Ignore untrack races during teardown.
          }

          try {
            await supabase.removeChannel(realtimeChannel);
          } catch {
            // Ignore realtime teardown failures.
          }

          setRealtimeChannel(null);
        }
      } else {
        socket.off("voice:peers", handlePeersSnapshot);
        socket.off("voice:peer-left", handlePeerLeft);
        socket.off("voice:signal", handleSignal);
        socket.off("connect", handleSocketConnect);
      }

      for (const peerId of [...getPeers().keys()]) {
        cleanupPeer(peerId);
      }
    }
  };
}
