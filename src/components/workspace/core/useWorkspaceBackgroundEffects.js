import { useEffect } from "react";

import { api } from "../../../api.js";
import { BACKGROUND_PREFETCH_COOLDOWN_MS } from "../workspaceCoreMessageStore.js";
import {
  areVoiceSessionsEqual
} from "../workspaceCoreEffectHelpers.js";
import {
  isChannelCacheFresh,
  listLikelyChannelIds
} from "../workspaceHelpers.js";

export function useWorkspaceBackgroundEffects({
  accessToken,
  activeChannel,
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
  useEffect(() => {
    if (!accessToken || !workspace || !activeSelection.channelId || activeChannel?.is_voice) {
      return undefined;
    }

    let cancelled = false;

    async function syncActiveChannelMessages() {
      if (cancelled || channelFallbackSyncRef.current) {
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

    syncActiveChannelMessages();

    const interval = window.setInterval(
      syncActiveChannelMessages,
      document.hidden ? 1800 : 900
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      channelFallbackSyncRef.current = false;
    };
  }, [accessToken, activeChannel?.is_voice, activeSelection.channelId, Boolean(workspace)]);

  useEffect(() => {
    if (!accessToken || !workspace) {
      return undefined;
    }

    let cancelled = false;

    async function syncWorkspaceShellFromCurrentSelection() {
      if (cancelled || bootstrapFallbackSyncRef.current) {
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

    syncWorkspaceShellFromCurrentSelection();

    const interval = window.setInterval(
      syncWorkspaceShellFromCurrentSelection,
      document.hidden ? 3600 : 1800
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      bootstrapFallbackSyncRef.current = false;
    };
  }, [accessToken, Boolean(workspace)]);

  useEffect(() => {
    if (!accessToken || !workspace || workspace.mode === "supabase") {
      return undefined;
    }

    let cancelled = false;

    async function syncVoiceSessions() {
      if (cancelled || voiceFallbackSyncRef.current) {
        return;
      }

      voiceFallbackSyncRef.current = true;

      try {
        const payload = await api.fetchVoiceState();
        if (cancelled) {
          return;
        }

        const nextSessions = payload?.sessions || {};
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

    syncVoiceSessions();

    const interval = window.setInterval(
      syncVoiceSessions,
      workspace.mode === "supabase"
        ? document.hidden
          ? 5000
          : 2500
        : document.hidden
          ? 3200
          : 1600
    );

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      voiceFallbackSyncRef.current = false;
    };
  }, [accessToken, workspace?.mode, Boolean(workspace), applyVoiceSessions]);

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
