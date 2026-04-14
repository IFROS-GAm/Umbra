import { createWorkspaceActionShared } from "../createWorkspaceActionShared.js";
import { createWorkspaceAttachmentActions } from "../createWorkspaceAttachmentActions.js";
import { createWorkspaceComposerActions } from "../createWorkspaceComposerActions.js";
import { createWorkspaceDialogActions } from "../createWorkspaceDialogActions.js";
import { createWorkspaceVoiceActions } from "../createWorkspaceVoiceActions.js";

export function createWorkspaceCoreActions(context) {
  const shared = createWorkspaceActionShared(context);

  return {
    ...createWorkspaceComposerActions(context, shared),
    ...createWorkspaceAttachmentActions(context, shared),
    ...createWorkspaceDialogActions(context, shared),
    ...createWorkspaceVoiceActions(context, shared),
    showUiNotice: shared.showUiNotice
  };
}
