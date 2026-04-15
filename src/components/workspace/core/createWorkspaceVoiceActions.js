import { findChannelInSession } from "../../../utils.js";
import { fallbackDeviceLabel } from "../workspaceHelpers.js";
import { primeSharedVoiceAudioContext } from "../voice/rtc/voiceRtcSessionConfig.js";
import { DIRECT_CALL_TYPES } from "../workspaceCoreActionHelpers.js";

export function createWorkspaceVoiceActions(context, shared) {
  const {
    accessToken,
    activeGuild,
    activeSelectionRef,
    joinedVoiceChannelId,
    selectedVoiceDevices,
    setActiveSelection,
    setAppError,
    setHeaderPanel,
    setJoinedVoiceChannelId,
    setSelectedVoiceDevices,
    setVoiceJoinReadyChannelId,
    setVoiceMenu,
    setVoiceState,
    voiceDevices,
    workspace
  } = context;
  const {
    applyLocalVoicePresence,
    getLiveSocket,
    playSound,
    showUiNotice
  } = shared;

  function toggleHeaderPanel(panelName) {
    setHeaderPanel((previous) => (previous === panelName ? null : panelName));
  }

  function toggleVoiceState(key) {
    setVoiceState((previous) => {
      const nextValue = !previous[key];

      if (key === "micMuted") {
        playSound("voiceMute");
      } else if (key === "deafen") {
        playSound("voiceDeafen");
      } else if (key === "cameraEnabled" && nextValue) {
        playSound("cameraEnable");
      }

      return {
        ...previous,
        [key]: nextValue
      };
    });
  }

  function toggleVoiceMenu(name) {
    setVoiceMenu((previous) => (previous === name ? null : name));
  }

  function updateVoiceSetting(key, value) {
    setVoiceState((previous) => {
      if (key === "screenShareEnabled" && previous[key] !== value) {
        playSound(value ? "screenShareOn" : "screenShareOff");
      }

      if (key === "cameraEnabled" && !previous[key] && value) {
        playSound("cameraEnable");
      }

      return {
        ...previous,
        [key]: value
      };
    });
  }

  function handleVoiceDeviceChange(kind, value) {
    setSelectedVoiceDevices((previous) => ({
      ...previous,
      [kind]: value
    }));
  }

  function cycleVoiceDevice(kind) {
    const devices = voiceDevices[kind] || [];
    if (!devices.length) {
      return;
    }

    const currentIndex = devices.findIndex(
      (device) => device.deviceId === selectedVoiceDevices[kind]
    );
    const nextDevice = devices[(currentIndex + 1 + devices.length) % devices.length];
    handleVoiceDeviceChange(kind, nextDevice.deviceId);
    showUiNotice(
      `Ahora usando ${
        nextDevice.label ||
        fallbackDeviceLabel(kind, (currentIndex + 1) % devices.length)
      }.`
    );
  }

  function getSelectedDeviceLabel(kind) {
    const selectedId = selectedVoiceDevices[kind];
    const devices = voiceDevices[kind] || [];
    const index = devices.findIndex((device) => device.deviceId === selectedId);
    const device = index >= 0 ? devices[index] : devices[0];

    if (!device) {
      return "Configuracion predeterminada";
    }

    return device.label || fallbackDeviceLabel(kind, Math.max(index, 0));
  }

  function joinVoiceChannelById(channelId, { enableCamera = false } = {}) {
    if (!accessToken || !channelId) {
      return false;
    }

    primeSharedVoiceAudioContext().catch(() => {});

    const targetLookup = findChannelInSession(workspace, channelId);
    const targetChannel = targetLookup?.channel || null;

    if (!targetChannel) {
      return false;
    }

    if (targetLookup.kind === "guild") {
      if (!targetChannel.is_voice || !targetLookup.guild) {
        return false;
      }

      const shouldPlayJoinSound = joinedVoiceChannelId !== targetChannel.id;
      setVoiceMenu(null);
      setActiveSelection({
        channelId: targetChannel.id,
        guildId: targetLookup.guild.id,
        kind: "guild"
      });
      setVoiceJoinReadyChannelId(null);
      applyLocalVoicePresence(targetChannel.id);
      setJoinedVoiceChannelId(targetChannel.id);
      if (workspace?.mode !== "supabase") {
        const socket = getLiveSocket();
        socket.emit("voice:join", {
          channelId: targetChannel.id
        });
      }
      if (shouldPlayJoinSound) {
        playSound("voiceChannelJoin");
      }
      return true;
    }

    if (targetLookup.kind === "dm" && DIRECT_CALL_TYPES.has(targetChannel.type)) {
      const shouldPlayJoinSound = joinedVoiceChannelId !== targetChannel.id;
      setVoiceMenu(null);
      setActiveSelection({
        channelId: targetChannel.id,
        guildId: null,
        kind: "dm"
      });

      if (enableCamera) {
        setVoiceState((previous) => ({
          ...previous,
          cameraEnabled: true
        }));
      }

      setVoiceJoinReadyChannelId(null);
      applyLocalVoicePresence(targetChannel.id);
      setJoinedVoiceChannelId(targetChannel.id);
      if (workspace?.mode !== "supabase") {
        const socket = getLiveSocket();
        socket.emit("voice:join", {
          channelId: targetChannel.id
        });
      }
      if (shouldPlayJoinSound) {
        playSound("directCallJoin");
      }
      if (enableCamera) {
        playSound("cameraEnable");
      }
      return true;
    }

    return false;
  }

  function handleSelectGuildChannel(channel) {
    if (channel.is_voice) {
      if (joinVoiceChannelById(channel.id)) {
        return;
      }
    }

    setVoiceMenu(null);
    setActiveSelection({
      channelId: channel.id,
      guildId: activeGuild.id,
      kind: "guild"
    });
  }

  function handleJoinDirectCall({ enableCamera = false } = {}) {
    const selectedChannel = activeSelectionRef.current?.channelId
      ? findChannelInSession(workspace, activeSelectionRef.current.channelId)?.channel
      : null;

    if (
      !accessToken ||
      activeSelectionRef.current?.kind !== "dm" ||
      !selectedChannel ||
      !DIRECT_CALL_TYPES.has(selectedChannel.type)
    ) {
      return;
    }

    joinVoiceChannelById(selectedChannel.id, { enableCamera });
  }

  function handleVoiceLeave() {
    const previousChannelId = joinedVoiceChannelId;
    applyLocalVoicePresence(null);
    setVoiceMenu(null);
    setHeaderPanel(null);
    setJoinedVoiceChannelId(null);
    setVoiceJoinReadyChannelId(null);
    setVoiceState((previous) => ({
      ...previous,
      cameraEnabled: false,
      deafen: false,
      inputMonitoring: false,
      micMuted: false,
      screenShareEnabled: false
    }));
    setAppError("");

    if (previousChannelId) {
      playSound("voiceChannelLeave");
    }

    if (!previousChannelId || !accessToken) {
      return;
    }

    try {
      if (workspace?.mode !== "supabase") {
        const socket = getLiveSocket();
        socket.emit("voice:leave", {
          channelId: previousChannelId
        });
      }
    } catch {
      // Keep optimistic local cleanup even if the socket is not ready.
    }
  }

  return {
    cycleVoiceDevice,
    getSelectedDeviceLabel,
    handleJoinDirectCall,
    handleSelectGuildChannel,
    handleVoiceDeviceChange,
    handleVoiceLeave,
    joinVoiceChannelById,
    toggleHeaderPanel,
    toggleVoiceMenu,
    toggleVoiceState,
    updateVoiceSetting
  };
}
