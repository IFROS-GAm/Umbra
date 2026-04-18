import { api } from "../../../api.js";
import { sanitizeUsername } from "../../../utils.js";
import { findDirectDmByUserId } from "../workspaceHelpers.js";

function sanitizeForwardedAttachment(attachment) {
  if (!attachment) {
    return attachment;
  }

  const {
    preview_url: _previewUrl,
    upload_error: _uploadError,
    upload_status: _uploadStatus,
    local_id: _localId,
    ...sanitized
  } = attachment;

  return {
    ...sanitized,
    alt_text: String(sanitized.alt_text || "").trim(),
    is_spoiler: Boolean(sanitized.is_spoiler),
    name: String(sanitized.name || "Adjunto").trim() || "Adjunto"
  };
}

function buildForwardedContent(message = {}) {
  const sourceName =
    message.display_name ||
    message.author?.display_name ||
    message.author?.username ||
    "Umbra";
  const body =
    String(message.content || "").trim() ||
    (message.sticker?.name ? `[Sticker] ${message.sticker.name}` : "");
  const heading = `**Reenviado de ${sourceName}**`;

  return body ? `${heading}\n${body}` : heading;
}

export function createWorkspaceDialogActions(context, shared = {}) {
  const {
    accessToken,
    activeGuild,
    activeSelectionRef,
    dialog,
    isVoiceChannel,
    loadBootstrap,
    loadMessages,
    pendingDirectDmRef,
    setAppError,
    setDialog,
    setProfileCard,
    workspace
  } = context;
  const { showUiNotice = () => {} } = shared;

  async function handleStatusChange(status) {
    try {
      await api.updateStatus({
        status
      });
      setProfileCard((previous) =>
        previous?.profile?.id === workspace?.current_user?.id
          ? {
              ...previous,
              profile: {
                ...previous.profile,
                status
              }
            }
          : previous
      );
      await loadBootstrap(activeSelectionRef.current);
    } catch (error) {
      setAppError(error.message);
    }
  }

  async function handleProfileUpdate(nextProfile) {
    try {
      const {
        avatarFile,
        avatarUrl: requestedAvatarUrl,
        bannerFile,
        bannerImageUrl: requestedBannerImageUrl,
        clearAvatar,
        clearBanner,
        ...profilePatch
      } = nextProfile;
      let avatarUrl = requestedAvatarUrl;
      let bannerImageUrl = requestedBannerImageUrl;

      if (avatarFile) {
        const uploadPayload = await api.uploadAttachments([avatarFile]);
        avatarUrl = uploadPayload.attachments?.[0]?.url;

        if (!avatarUrl) {
          throw new Error("No se pudo subir la foto de perfil.");
        }
      } else if (clearAvatar) {
        avatarUrl = "";
      }

      if (bannerFile) {
        const uploadPayload = await api.uploadAttachments([bannerFile]);
        bannerImageUrl = uploadPayload.attachments?.[0]?.url;

        if (!bannerImageUrl) {
          throw new Error("No se pudo subir la imagen del panel.");
        }
      } else if (clearBanner) {
        bannerImageUrl = "";
      }

      await api.updateProfile({
        ...profilePatch,
        avatarUrl,
        bannerImageUrl
      });
      await loadBootstrap(activeSelectionRef.current);

      if (activeSelectionRef.current.channelId) {
        await loadMessages({
          channelId: activeSelectionRef.current.channelId
        });
      }

      setAppError("");
    } catch (error) {
      setAppError(error.message);
      throw error;
    }
  }

  async function handleDialogSubmit(values) {
    if (!dialog) {
      return;
    }

    try {
      if (dialog.type === "guild") {
        const payload = await api.createGuild({
          description: values.description,
          name: values.name,
          templateId: values.templateId
        });
        await loadBootstrap(
          {
            channelId: payload.channel_id,
            guildId: payload.guild_id,
            kind: "guild"
          },
          {
            selectionMode: "target"
          }
        );
      }

      if (dialog.type === "channel") {
        if (!activeGuild?.permissions?.can_manage_channels) {
          throw new Error("Solo el administrador puede cambiar la estructura del servidor.");
        }

        const payload = await api.createChannel({
          guildId: activeGuild.id,
          kind: values.kind,
          name: values.name,
          parentId: values.parentId,
          topic: values.topic
        });
        await loadBootstrap(
          {
            channelId: payload.channel.id,
            guildId: activeGuild.id,
            kind: "guild"
          },
          {
            selectionMode: "target"
          }
        );
      }

      if (dialog.type === "category") {
        if (!activeGuild?.permissions?.can_manage_channels) {
          throw new Error("Solo el administrador puede cambiar la estructura del servidor.");
        }

        await api.createCategory({
          guildId: activeGuild.id,
          name: values.name
        });
        await loadBootstrap(
          {
            channelId: activeSelectionRef.current.channelId,
            guildId: activeGuild.id,
            kind: "guild"
          },
          {
            selectionMode: "target"
          }
        );
      }

      if (dialog.type === "dm") {
        const recipientId = values.recipientId;
        const existingDm = findDirectDmByUserId(
          workspace?.dms || [],
          workspace?.current_user?.id,
          recipientId
        );

        if (existingDm) {
          await loadBootstrap(
            {
              channelId: existingDm.id,
              guildId: null,
              kind: "dm"
            },
            {
              selectionMode: "target"
            }
          );
        } else {
          if (pendingDirectDmRef.current.has(recipientId)) {
            return;
          }

          pendingDirectDmRef.current.add(recipientId);

          try {
            const payload = await api.createDm({
              recipientId
            });
            await loadBootstrap(
              {
                channelId: payload.channel.id,
                guildId: null,
                kind: "dm"
              },
              {
                selectionMode: "target"
              }
            );
          } finally {
            pendingDirectDmRef.current.delete(recipientId);
          }
        }
      }

      if (dialog.type === "forward") {
        const recipientId = values.recipientId;
        const targetMessage = dialog.forwardMessage || null;

        if (!recipientId || !targetMessage) {
          throw new Error("No se pudo preparar el reenvio.");
        }

        const payload = await api.createDm({
          recipientId
        });

        await api.createMessage({
          attachments: (targetMessage.attachments || []).map(sanitizeForwardedAttachment),
          channelId: payload.channel.id,
          content: buildForwardedContent(targetMessage),
          replyMentionUserId: null,
          replyTo: null
        });

        await loadBootstrap(activeSelectionRef.current);
        showUiNotice("Mensaje reenviado.");
      }

      if (dialog.type === "dm_group") {
        const payload = await api.createGroupDm({
          name: values.name,
          recipientIds: values.recipientIds
        });
        await loadBootstrap(
          {
            channelId: payload.channel.id,
            guildId: null,
            kind: "dm"
          },
          {
            selectionMode: "target"
          }
        );
      }

      setDialog(null);
      setAppError("");
    } catch (error) {
      setAppError(error.message);
      throw error;
    }
  }

  function handleForwardMessage(message) {
    if (!message?.id) {
      return;
    }

    setDialog({
      currentUserId: workspace.current_user.id,
      forwardMessage: {
        attachments: message.attachments || [],
        author: message.author || null,
        content: message.content || "",
        display_name: message.display_name || "",
        id: message.id,
        sticker: message.sticker || null
      },
      type: "forward"
    });
  }

  return {
    handleForwardMessage,
    handleDialogSubmit,
    handleProfileUpdate,
    handleStatusChange
  };
}
