import { api } from "../../../api.js";
import {
  MAX_COMPOSER_ATTACHMENTS,
  attachmentKey
} from "../workspaceHelpers.js";

export function createWorkspaceAttachmentActions(context, shared) {
  const {
    attachmentUploadCounterRef,
    composerAttachments,
    setAppError,
    setComposerAttachments,
    setUploadingAttachments,
    submittingMessage
  } = context;
  const { showUiNotice } = shared;

  async function handleAttachmentSelection(event) {
    const files = [...(event.target.files || [])];
    event.target.value = "";

    if (!files.length) {
      return;
    }

    if (submittingMessage) {
      showUiNotice(
        "Espera a que el mensaje actual termine de enviarse antes de subir mas archivos."
      );
      return;
    }

    const remainingSlots = Math.max(
      0,
      MAX_COMPOSER_ATTACHMENTS - composerAttachments.length
    );
    if (!remainingSlots) {
      showUiNotice(
        `Solo puedes preparar hasta ${MAX_COMPOSER_ATTACHMENTS} adjuntos por mensaje.`
      );
      return;
    }

    const nextFiles = files.slice(0, remainingSlots);
    const discardedCount = files.length - nextFiles.length;
    const localDrafts = nextFiles.map((file, index) => {
      const localId =
        globalThis.crypto?.randomUUID?.() ||
        `attachment-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`;

      return {
        alt_text: "",
        content_type: file.type || "application/octet-stream",
        display_name: file.name || `Adjunto ${composerAttachments.length + index + 1}`,
        is_spoiler: false,
        local_id: localId,
        name: file.name || `Adjunto ${composerAttachments.length + index + 1}`,
        preview_url: file.type?.startsWith("image/") ? URL.createObjectURL(file) : "",
        size: file.size || 0,
        upload_error: "",
        upload_status: "uploading"
      };
    });

    const localIds = new Set(localDrafts.map((attachment) => attachment.local_id));
    setComposerAttachments((previous) =>
      [...previous, ...localDrafts].slice(0, MAX_COMPOSER_ATTACHMENTS)
    );
    attachmentUploadCounterRef.current += 1;
    setUploadingAttachments(true);

    try {
      const payload = await api.uploadAttachments(nextFiles);
      const uploadedAttachments = payload.attachments || [];

      setComposerAttachments((previous) =>
        previous.map((attachment) => {
          if (!localIds.has(attachment.local_id)) {
            return attachment;
          }

          const draftIndex = localDrafts.findIndex(
            (draft) => draft.local_id === attachment.local_id
          );
          const uploadedAttachment =
            draftIndex >= 0 ? uploadedAttachments[draftIndex] : null;

          if (!uploadedAttachment) {
            return {
              ...attachment,
              upload_error: "No se pudo procesar este adjunto.",
              upload_status: "failed"
            };
          }

          return {
            ...attachment,
            ...uploadedAttachment,
            local_id: attachment.local_id,
            preview_url: attachment.preview_url,
            upload_error: "",
            upload_status: "ready"
          };
        })
      );

      const uploadedCount = uploadedAttachments.length || nextFiles.length;
      showUiNotice(
        discardedCount
          ? `${uploadedCount} adjunto(s) listos. Solo se guardaron ${nextFiles.length} porque el maximo es ${MAX_COMPOSER_ATTACHMENTS}.`
          : `${uploadedCount} adjunto(s) listos para enviar.`
      );
      setAppError("");
    } catch (error) {
      setComposerAttachments((previous) =>
        previous.map((attachment) =>
          localIds.has(attachment.local_id)
            ? {
                ...attachment,
                upload_error: error.message,
                upload_status: "failed"
              }
            : attachment
        )
      );
      setAppError(error.message);
    } finally {
      attachmentUploadCounterRef.current = Math.max(
        0,
        attachmentUploadCounterRef.current - 1
      );
      setUploadingAttachments(attachmentUploadCounterRef.current > 0);
    }
  }

  function removeComposerAttachment(targetAttachment) {
    setComposerAttachments((previous) =>
      previous.filter(
        (attachment) => attachmentKey(attachment) !== attachmentKey(targetAttachment)
      )
    );
  }

  function updateComposerAttachment(targetAttachment, patch = {}) {
    const targetKey = attachmentKey(targetAttachment);
    if (!targetKey) {
      return;
    }

    setComposerAttachments((previous) =>
      previous.map((attachment) => {
        if (attachmentKey(attachment) !== targetKey) {
          return attachment;
        }

        return {
          ...attachment,
          ...patch
        };
      })
    );
  }

  return {
    handleAttachmentSelection,
    removeComposerAttachment,
    updateComposerAttachment
  };
}
