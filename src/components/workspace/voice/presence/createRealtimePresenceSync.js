export function createRealtimePresenceSync({
  getChannel,
  log = null,
  onError = null
}) {
  const state = {
    disposed: false,
    flushing: false,
    queuedBatch: null
  };

  async function flush() {
    if (state.flushing || state.disposed) {
      return;
    }

    state.flushing = true;

    try {
      while (!state.disposed && state.queuedBatch) {
        const batch = state.queuedBatch;
        state.queuedBatch = null;

        const channel = getChannel?.() || null;

        if (!channel) {
          batch.waiters.forEach((resolve) => resolve());
          continue;
        }

        try {
          if (batch.payload) {
            log?.("track:flush", {
              channelId: batch.payload.channelId || "",
              micMuted: Boolean(batch.payload.micMuted),
              peerId: batch.payload.peerId || "",
              revision: batch.payload.revision || 0,
              videoMode: batch.payload.videoMode || ""
            });
            await channel.track(batch.payload);
          } else {
            log?.("untrack:flush", {});
            await channel.untrack();
          }
        } catch (error) {
          onError?.(error, batch.payload);
        } finally {
          batch.waiters.forEach((resolve) => resolve());
        }
      }
    } finally {
      state.flushing = false;

      if (!state.disposed && state.queuedBatch) {
        void flush();
      }
    }
  }

  return {
    dispose() {
      state.disposed = true;
      if (state.queuedBatch) {
        state.queuedBatch.waiters.forEach((resolve) => resolve());
        state.queuedBatch = null;
      }
    },
    schedule(payload) {
      if (state.disposed) {
        return Promise.resolve();
      }

      return new Promise((resolve) => {
        if (state.queuedBatch) {
          state.queuedBatch.payload = payload;
          state.queuedBatch.waiters.push(resolve);
        } else {
          state.queuedBatch = {
            payload,
            waiters: [resolve]
          };
        }

        void flush();
      });
    }
  };
}
