import { useEffect } from "react";

import { api } from "../../../api.js";
import { getSocket } from "../../../socket.js";
import { BACKGROUND_PREFETCH_COOLDOWN_MS } from "../workspaceCoreMessageStore.js";
import { shouldUseLiveKitVoice } from "../voice/rtc/voiceRtcSessionConfig.js";
import {
  areVoiceSessionsEqual
} from "../workspaceCoreEffectHelpers.js";
import {
  isChannelCacheFresh,
  listLikelyChannelIds
} from "../workspaceHelpers.js";

function isRealtimeSocketConnected(accessToken) {
  if (!accessToken) {
    return false;
  }

  try {
    return Boolean(getSocket(accessToken)?.connected);
  } catch {
    return false;
  }
}

function scheduleAdaptiveLoop(run, getDelayMs) {
  let timeoutId = null;
  let cancelled = false;

  async function tick() {
    try {
      await run();
    } catch {
      // Individual sync loops stay best-effort and should never break scheduling.
    }

    if (cancelled) {
      return;
    }

    timeoutId = window.setTimeout(tick, getDelayMs());
  }

  tick();

  return () => {
    cancelled = true;
    if (timeoutId) {
      window.clearTimeout(timeoutId);
    }
  };
}

export function useWorkspaceBackgroundEffects({
  accessToken,
  activeChannel,
  activeGuildVoiceChannels,
  activeSelection,
  activeSelectionRef,
  backgroundPrefetchRef,
  historyScrollStateRef,
  loadBootstrapRef,
  loadMessages,
  readChannelCache,
  readReceiptTimeoutRef,
  setTypingEvents,
  setUiNotice,
  voiceFallbackSyncRef,
  voiceSessionsRef,
  bootstrapFallbackSyncRef,
  channelFallbackSyncRef,
  applyVoiceSessions,
  uiNotice,
  workspace
}) {
  const activeGuildVoiceChannelIdsKey = (activeGuildVoiceChannels || [])
    .map((channel) => channel.id)
    .filter(Boolean)
    .join("|");

  useEffect(() => {
    if (!accessToken || !workspace || !activeSelection.channelId || activeChannel?.is_voice) {
      return undefined;
    }

    let cancelled = false;

    async function syncActiveChannelMessages() {
      if (cancelled || channelFallbackSyncRef.current) {
        return;
      }

      const socketConnected = isRealtimeSocketConnected(accessToken);
      if (socketConnected && historyScrollStateRef?.current?.autoSyncToLatest !== false) {
        return;
      }

      if (historyScrollStateRef?.current?.autoSyncToLatest === false) {
        return;
      }

      channelFallbackSyncRef.current = true;

      try {
        await loadMessages({
          channelId: activeSelection.channelId,
          force: true,
          limit: 24,
          silent: true
        });
      } catch {
        // Keep the fallback quiet; socket events remain the primary realtime path.
      } finally {
        channelFallbackSyncRef.current = false;
      }
    }

    const stopLoop = scheduleAdaptiveLoop(syncActiveChannelMessages, () => {
      const socketConnected = isRealtimeSocketConnected(accessToken);
      if (socketConnected) {
        return document.hidden ? 120_000 : 45_000;
      }

      return document.hidden ? 30_000 : 12_000;
    });

    return () => {
      cancelled = true;
      stopLoop();
      channelFallbackSyncRef.current = false;
    };
  }, [accessToken, activeChannel?.is_voice, activeSelection.channelId, Boolean(workspace)]);

  useEffect(() => {
    if (!accessToken || !workspace || workspace.mode === "supabase") {
      return undefined;
    }

    let cancelled = false;

    async function syncWorkspaceShellFromCurrentSelection() {
      if (cancelled || bootstrapFallbackSyncRef.current) {
        return;
      }

      if (isRealtimeSocketConnected(accessToken)) {
        return;
      }

      bootstrapFallbackSyncRef.current = true;

      try {
        await loadBootstrapRef.current?.(activeSelectionRef.current, {
          silentError: true
        });
      } catch {
        // Background sync should not surface noisy errors.
      } finally {
        bootstrapFallbackSyncRef.current = false;
      }
    }

    const stopLoop = scheduleAdaptiveLoop(syncWorkspaceShellFromCurrentSelection, () =>
      document.hidden ? 120_000 : 60_000
    );

    return () => {
      cancelled = true;
      stopLoop();
      bootstrapFallbackSyncRef.current = false;
    };
  }, [accessToken, Boolean(workspace)]);

  useEffect(() => {
    if (
      !accessToken ||
      !workspace ||
      !shouldUseLiveKitVoice(workspace.mode) ||
      !(activeGuildVoiceChannels || []).length
    ) {
      return undefined;
    }

    let cancelled = false;
    const requestedChannelIds = [...new Set(activeGuildVoiceChannels.map((channel) => channel.id).filter(Boolean))];

    function mergeRequestedVoiceSessions(incomingSessions = {}) {
      const nextSessions = {
        ...(voiceSessionsRef.current || {})
      };

      requestedChannelIds.forEach((channelId) => {
        delete nextSessions[channelId];
      });

      Object.entries(incomingSessions || {}).forEach(([channelId, userIds]) => {
        if (!requestedChannelIds.includes(channelId)) {
          return;
        }

        const normalizedUserIds = [...new Set((Array.isArray(userIds) ? userIds : []).filter(Boolean))];
        if (normalizedUserIds.length) {
          nextSessions[channelId] = normalizedUserIds;
        }
      });

      return nextSessions;
    }

    async function syncLiveKitOccupancy() {
      if (cancelled || voiceFallbackSyncRef.current) {
        return;
      }

      if (isRealtimeSocketConnected(accessToken)) {
        return;
      }

      voiceFallbackSyncRef.current = true;

      try {
        const payload = await api.fetchLiveKitOccupancy({
          channelIds: requestedChannelIds
        });
        if (cancelled) {
          return;
        }

        const nextSessions = mergeRequestedVoiceSessions(payload?.sessions || {});
        if (areVoiceSessionsEqual(voiceSessionsRef.current, nextSessions)) {
          return;
        }

        applyVoiceSessions(nextSessions);
      } catch {
        // Voice fallback stays silent while the primary socket path is healthy.
      } finally {
        voiceFallbackSyncRef.current = false;
      }
    }

    const stopLoop = scheduleAdaptiveLoop(syncLiveKitOccupancy, () =>
      document.hidden ? 60_000 : 20_000
    );

    return () => {
      cancelled = true;
      stopLoop();
      voiceFallbackSyncRef.current = false;
    };
  }, [
    accessToken,
    activeGuildVoiceChannelIdsKey,
    workspace?.mode,
    Boolean(workspace),
    applyVoiceSessions
  ]);

  useEffect(() => {
    if (!workspace || !accessToken) {
      return undefined;
    }

    const candidateIds = listLikelyChannelIds(workspace, activeSelection, 5).filter(
      (channelId) => {
        const cachedEntry = readChannelCache(channelId);
        if (cachedEntry && isChannelCacheFresh(cachedEntry)) {
          return false;
        }

        const lastPrefetchAt = backgroundPrefetchRef.current.get(channelId) || 0;
        return Date.now() - lastPrefetchAt > BACKGROUND_PREFETCH_COOLDOWN_MS;
      }
    );

    if (!candidateIds.length) {
      return undefined;
    }

    let cancelled = false;
    const scheduleIdle =
      typeof window.requestIdleCallback === "function"
        ? (callback) => window.requestIdleCallback(callback, { timeout: 1400 })
        : (callback) => window.setTimeout(callback, 700);
    const cancelIdle =
      typeof window.cancelIdleCallback === "function"
        ? (handle) => window.cancelIdleCallback(handle)
        : (handle) => window.clearTimeout(handle);

    const handle = scheduleIdle(async () => {
      if (document.hidden) {
        return;
      }

      for (const channelId of candidateIds) {
        const cachedEntry = readChannelCache(channelId);
        if (cancelled || (cachedEntry && isChannelCacheFresh(cachedEntry))) {
          continue;
        }

        backgroundPrefetchRef.current.set(channelId, Date.now());
        await loadMessages({
          background: true,
          channelId,
          limit: 18,
          silent: true
        });
      }
    });

    return () => {
      cancelled = true;
      cancelIdle(handle);
    };
  }, [accessToken, activeSelection.channelId, activeSelection.guildId, activeSelection.kind, workspace]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setTypingEvents((previous) =>
        previous.filter((item) => item.expires_at > Date.now())
      );
    }, 1000);

    return () => window.clearInterval(interval);
  }, [setTypingEvents]);

  useEffect(() => {
    return () => {
      if (readReceiptTimeoutRef.current) {
        window.clearTimeout(readReceiptTimeoutRef.current);
      }
    };
  }, [readReceiptTimeoutRef]);

  useEffect(() => {
    if (!uiNotice) {
      return undefined;
    }

    const timeout = window.setTimeout(() => {
      setUiNotice("");
    }, 3200);

    return () => window.clearTimeout(timeout);
  }, [uiNotice, setUiNotice]);
}
