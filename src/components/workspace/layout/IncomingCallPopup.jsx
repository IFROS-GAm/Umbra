import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { Icon } from "../../Icon.jsx";

const POPUP_WIDTH = 320;
const POPUP_HEIGHT = 212;

function clampPosition(position) {
  if (typeof window === "undefined") {
    return position;
  }

  return {
    x: Math.min(Math.max(16, position.x), Math.max(16, window.innerWidth - POPUP_WIDTH - 16)),
    y: Math.min(Math.max(16, position.y), Math.max(16, window.innerHeight - POPUP_HEIGHT - 16))
  };
}

function getDefaultPosition() {
  if (typeof window === "undefined") {
    return { x: 24, y: 24 };
  }

  return clampPosition({
    x: window.innerWidth - POPUP_WIDTH - 28,
    y: window.innerHeight - POPUP_HEIGHT - 28
  });
}

function getInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!parts.length) {
    return "U";
  }

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export function IncomingCallPopup({ call, onAccept, onReject }) {
  const popupRef = useRef(null);
  const dragStateRef = useRef(null);
  const [dragging, setDragging] = useState(false);
  const [position, setPosition] = useState(() => getDefaultPosition());
  const [remainingSeconds, setRemainingSeconds] = useState(28);

  useEffect(() => {
    setPosition(getDefaultPosition());
  }, [call?.callId]);

  useEffect(() => {
    if (!call?.expiresAt) {
      setRemainingSeconds(28);
      return undefined;
    }

    const updateCountdown = () => {
      const remaining = Math.max(0, Math.ceil((call.expiresAt - Date.now()) / 1000));
      setRemainingSeconds(remaining);
    };

    updateCountdown();
    const intervalId = window.setInterval(updateCountdown, 250);
    return () => {
      window.clearInterval(intervalId);
    };
  }, [call?.callId, call?.expiresAt]);

  useEffect(() => {
    if (!dragging) {
      return undefined;
    }

    const handlePointerMove = (event) => {
      const dragState = dragStateRef.current;
      if (!dragState) {
        return;
      }

      setPosition(
        clampPosition({
          x: event.clientX - dragState.offsetX,
          y: event.clientY - dragState.offsetY
        })
      );
    };

    const handlePointerUp = () => {
      dragStateRef.current = null;
      setDragging(false);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);
    window.addEventListener("pointercancel", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [dragging]);

  const callerName = call?.callerName || call?.channelName || "Umbra";
  const callerInitials = useMemo(() => getInitials(callerName), [callerName]);

  const handlePointerDown = (event) => {
    if (event.button !== 0 || event.target.closest("button")) {
      return;
    }

    const rect = popupRef.current?.getBoundingClientRect();
    if (!rect) {
      return;
    }

    dragStateRef.current = {
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top
    };
    setDragging(true);
    event.preventDefault();
  };

  if (typeof document === "undefined" || !call) {
    return null;
  }

  return createPortal(
    <div className="incoming-call-popup-layer" aria-live="assertive">
      <aside
        className={`incoming-call-popup floating-surface ${dragging ? "dragging" : ""}`.trim()}
        onPointerDown={handlePointerDown}
        ref={popupRef}
        role="dialog"
        style={{
          left: `${position.x}px`,
          top: `${position.y}px`
        }}
      >
        <div className="incoming-call-popup-topbar">
          <span className="incoming-call-popup-kicker">Llamada entrante</span>
          <span className="incoming-call-popup-timer">{remainingSeconds}s</span>
        </div>

        <div className="incoming-call-popup-body">
          <div className="incoming-call-popup-avatar">
            {call.avatarUrl ? (
              <img alt={callerName} src={call.avatarUrl} />
            ) : (
              <span>{callerInitials}</span>
            )}
          </div>

          <div className="incoming-call-popup-copy">
            <strong>{callerName}</strong>
            <p>{call.body || "Hay una llamada esperandote."}</p>
          </div>
        </div>

        <div className="incoming-call-popup-actions">
          <button
            className="incoming-call-popup-action reject"
            onClick={() => onReject?.(call.channelId)}
            type="button"
          >
            <Icon name="close" size={18} />
          </button>
          <button
            className="incoming-call-popup-action accept"
            onClick={() => onAccept?.(call.channelId)}
            type="button"
          >
            <Icon name="phone" size={18} />
          </button>
        </div>
      </aside>
    </div>,
    document.body
  );
}
