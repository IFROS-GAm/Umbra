import { createHttpError } from "./shared.js";

export function registerMessageRoutes({
  app,
  emitChannelEvent,
  emitChannelPreview,
  requireViewer,
  sendError,
  store,
  upload
}) {
  app.get("/api/channels/:channelId/messages", requireViewer, async (req, res) => {
    try {
      const payload = await store.listChannelMessages({
        before: req.query.before || null,
        channelId: req.params.channelId,
        limit: Number(req.query.limit || 30),
        userId: req.viewer.id
      });

      res.json(payload);
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/channels/:channelId/messages", requireViewer, async (req, res) => {
    try {
      const created = await store.createMessage({
        attachments: Array.isArray(req.body.attachments) ? req.body.attachments : [],
        authorId: req.viewer.id,
        channelId: req.params.channelId,
        clientNonce: req.body.clientNonce || null,
        content: req.body.content,
        stickerId: req.body.stickerId || null,
        replyMentionUserId: req.body.replyMentionUserId || null,
        replyTo: req.body.replyTo || null
      });
      const message = created?.message || created;
      const preview = created?.preview || (await store.getChannelPreview(req.params.channelId));

      emitChannelEvent(req.params.channelId, "message:create", {
        message,
        preview
      }).catch(() => {});
      emitChannelPreview(req.params.channelId, preview).catch(() => {});

      res.status(201).json({ message, preview });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post(
    "/api/attachments",
    requireViewer,
    upload.array("files", Number(process.env.MAX_ATTACHMENT_FILES || 10)),
    async (req, res) => {
      try {
        if (!req.files?.length) {
          throw createHttpError("No se recibieron archivos.", 400);
        }

        const attachments = await store.storeAttachments(req.files);
        res.status(201).json({ attachments });
      } catch (error) {
        sendError(res, error);
      }
    }
  );

  app.patch("/api/messages/:messageId", requireViewer, async (req, res) => {
    try {
      const message = await store.updateMessage({
        content: req.body.content,
        messageId: req.params.messageId,
        userId: req.viewer.id
      });
      const preview = await store.getChannelPreview(message.channel_id);

      emitChannelEvent(message.channel_id, "message:update", {
        message,
        preview
      }).catch(() => {});
      emitChannelPreview(message.channel_id, preview).catch(() => {});

      res.json({ message, preview });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.delete("/api/messages/:messageId", requireViewer, async (req, res) => {
    try {
      const payload = await store.deleteMessage({
        messageId: req.params.messageId,
        userId: req.viewer.id
      });
      const preview = await store.getChannelPreview(payload.channel_id);

      emitChannelEvent(payload.channel_id, "message:delete", {
        ...payload,
        preview
      }).catch(() => {});
      emitChannelPreview(payload.channel_id, preview).catch(() => {});

      res.json({
        ok: true,
        ...payload,
        preview
      });
    } catch (error) {
      sendError(res, error);
    }
  });

  app.post("/api/messages/:messageId/reactions", requireViewer, async (req, res) => {
    try {
      const message = await store.toggleReaction({
        emoji: req.body.emoji,
        messageId: req.params.messageId,
        userId: req.viewer.id
      });

      emitChannelEvent(message.channel_id, "reaction:update", { message }).catch(() => {});
      res.json({ message });
    } catch (error) {
      sendError(res, error);
    }
  });
}
