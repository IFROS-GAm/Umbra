import React from "react";
import { createPortal } from "react-dom";

import { Icon } from "../../Icon.jsx";

export function DmContextMenu({
  dm,
  muted = false,
  onBlockUser,
  onClose,
  onCloseDm,
  onCopyId,
  onMarkRead,
  onOpenProfile,
  onRelationshipAction,
  onReportUser,
  onToggleMute,
  position,
  profile
}) {
  const rootRef = React.useRef(null);
  const [menuPosition, setMenuPosition] = React.useState(position);

  React.useEffect(() => {
    if (!dm) {
      return undefined;
    }

    function handlePointerDown(event) {
      if (rootRef.current?.contains(event.target)) {
        return;
      }

      onClose();
    }

    function handleEscape(event) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [dm, onClose]);

  React.useLayoutEffect(() => {
    if (!position || !rootRef.current) {
      return;
    }

    const safeArea = {
      bottom: 36,
      left: 12,
      right: 12,
      top: 12
    };
    const rect = rootRef.current.getBoundingClientRect();
    let nextX = position.x;
    let nextY = position.y;
    let nextBottom = null;
    let useBottom = false;

    if (position.anchorRect) {
      const topAlignedY = position.anchorRect.top - 6;
      const upwardAnchoredY = position.anchorRect.bottom - rect.height - 10;
      const fitsBelow = topAlignedY + rect.height <= window.innerHeight - safeArea.bottom;
      const shouldAnchorFromBottom = position.anchorRect.bottom > window.innerHeight * 0.68 || !fitsBelow;

      if (shouldAnchorFromBottom) {
        useBottom = true;
        nextBottom = Math.max(safeArea.bottom, window.innerHeight - position.anchorRect.bottom + 6);
        nextY = Math.max(safeArea.top, upwardAnchoredY);
      } else {
        nextY = topAlignedY;
      }
    }

    if (nextX + rect.width > window.innerWidth - safeArea.right) {
      nextX = Math.max(safeArea.left, window.innerWidth - rect.width - safeArea.right);
    }

    if (!useBottom && nextY + rect.height > window.innerHeight - safeArea.bottom) {
      nextY = Math.max(safeArea.top, window.innerHeight - rect.height - safeArea.bottom);
    }

    if (nextX < safeArea.left) {
      nextX = safeArea.left;
    }

    if (nextY < safeArea.top) {
      nextY = safeArea.top;
    }

    setMenuPosition((previous) => {
      if (
        previous?.x === nextX &&
        previous?.y === nextY &&
        previous?.bottom === nextBottom &&
        previous?.useBottom === useBottom
      ) {
        return previous;
      }

      return {
        bottom: nextBottom,
        useBottom,
        x: nextX,
        y: nextY
      };
    });
  }, [position]);

  if (!dm || !position) {
    return null;
  }

  const canOpenProfile = dm.type === "dm" && profile;
  const relationshipLabel =
    !profile || profile.isCurrentUser
      ? null
      : profile.isFriend
        ? "Eliminar amigo"
        : profile.friendRequestState === "received"
          ? "Aceptar solicitud"
          : profile.friendRequestState === "sent"
            ? "Enviado"
            : "Enviar solicitud de amigo";
  const relationshipDisabled = !profile || profile.isCurrentUser || profile.friendRequestState === "sent";
  const relationshipDanger = Boolean(profile?.isFriend);

  const content = (
    <div
      className="floating-surface server-context-menu-shell dm-context-menu-shell"
      ref={rootRef}
      style={{
        bottom: menuPosition?.useBottom ? `${menuPosition?.bottom ?? 28}px` : "auto",
        left: `${menuPosition?.x ?? position.x}px`,
        top: menuPosition?.useBottom ? "auto" : `${menuPosition?.y ?? position.y}px`
      }}
    >
      <div className="floating-surface server-context-menu dm-context-menu">
        <button
          className="server-context-row"
          onClick={() => {
            onMarkRead?.(dm);
            onClose();
          }}
          type="button"
        >
          <span>Marcar como leido</span>
        </button>

        {canOpenProfile ? (
          <button
            className="server-context-row"
            onClick={() => {
              onOpenProfile?.(profile);
              onClose();
            }}
            type="button"
          >
            <span>Abrir perfil</span>
            <Icon name="profile" size={15} />
          </button>
        ) : null}

        {relationshipLabel ? (
          <button
            className={`server-context-row ${relationshipDanger ? "destructive" : ""}`.trim()}
            disabled={relationshipDisabled}
            onClick={() => {
              onRelationshipAction?.(profile);
              onClose();
            }}
            type="button"
          >
            <span>{relationshipLabel}</span>
          </button>
        ) : null}

        <div className="server-context-divider" />

        <button
          className="server-context-row server-context-row-check"
          onClick={() => onToggleMute?.(dm)}
          type="button"
        >
          <span>Silenciar la conversacion</span>
          <i className={`server-context-checkbox ${muted ? "active" : ""}`.trim()} />
        </button>

        <button
          className="server-context-row"
          onClick={() => {
            onCloseDm?.(dm);
            onClose();
          }}
          type="button"
        >
          <span>Cerrar DM</span>
        </button>

        {profile ? (
          <>
            <button
              className="server-context-row destructive"
              onClick={() => {
                onBlockUser?.(profile);
                onClose();
              }}
              type="button"
            >
              <span>Bloquear</span>
            </button>
            <button
              className="server-context-row destructive"
              onClick={() => {
                onReportUser?.(profile, "spam");
                onClose();
              }}
              type="button"
            >
              <span>Denunciar spam</span>
            </button>
          </>
        ) : null}

        <div className="server-context-divider" />

        <button
          className="server-context-row"
          onClick={() => {
            onCopyId?.(dm);
            onClose();
          }}
          type="button"
        >
          <span>Copiar ID del chat</span>
          <span className="server-context-id-chip">ID</span>
        </button>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
