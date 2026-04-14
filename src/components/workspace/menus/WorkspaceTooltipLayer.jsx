import React from "react";
import { createPortal } from "react-dom";

const TOOLTIP_GAP = 12;
const VIEWPORT_MARGIN = 12;

function resolveTooltipTarget(node) {
  if (!(node instanceof Element)) {
    return null;
  }

  return node.closest("[data-tooltip]");
}

function getTooltipSnapshot(target) {
  if (!(target instanceof Element)) {
    return null;
  }

  const text = String(target.getAttribute("data-tooltip") || "").trim();
  if (!text) {
    return null;
  }

  return {
    position: target.getAttribute("data-tooltip-position") || "bottom",
    rect: target.getBoundingClientRect(),
    target,
    text
  };
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function measureTooltipPosition(anchorRect, tooltipRect, preferredPosition) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const placements = (() => {
    switch (preferredPosition) {
      case "top":
        return ["top", "bottom", "right"];
      case "right":
        return ["right", "top", "bottom"];
      default:
        return ["bottom", "top", "right"];
    }
  })();

  for (const placement of placements) {
    let left = 0;
    let top = 0;

    if (placement === "top") {
      left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
      top = anchorRect.top - tooltipRect.height - TOOLTIP_GAP;
    } else if (placement === "right") {
      left = anchorRect.right + TOOLTIP_GAP;
      top = anchorRect.top + anchorRect.height / 2 - tooltipRect.height / 2;
    } else {
      left = anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2;
      top = anchorRect.bottom + TOOLTIP_GAP;
    }

    const fitsHorizontally =
      left >= VIEWPORT_MARGIN &&
      left + tooltipRect.width <= viewportWidth - VIEWPORT_MARGIN;
    const fitsVertically =
      top >= VIEWPORT_MARGIN &&
      top + tooltipRect.height <= viewportHeight - VIEWPORT_MARGIN;

    if (fitsHorizontally && fitsVertically) {
      return {
        left,
        placement,
        top
      };
    }
  }

  const fallbackLeft = clamp(
    anchorRect.left + anchorRect.width / 2 - tooltipRect.width / 2,
    VIEWPORT_MARGIN,
    viewportWidth - tooltipRect.width - VIEWPORT_MARGIN
  );
  const fallbackTop = clamp(
    anchorRect.bottom + TOOLTIP_GAP,
    VIEWPORT_MARGIN,
    viewportHeight - tooltipRect.height - VIEWPORT_MARGIN
  );

  return {
    left: fallbackLeft,
    placement: "bottom",
    top: fallbackTop
  };
}

export function WorkspaceTooltipLayer() {
  const [tooltipState, setTooltipState] = React.useState(null);
  const [floatingStyle, setFloatingStyle] = React.useState(null);
  const bubbleRef = React.useRef(null);

  React.useEffect(() => {
    if (typeof document === "undefined") {
      return undefined;
    }

    function showTooltip(target) {
      const snapshot = getTooltipSnapshot(target);
      setTooltipState(snapshot);
    }

    function hideTooltip(target) {
      setTooltipState((previous) => {
        if (!previous) {
          return previous;
        }

        if (!target || previous.target === target) {
          return null;
        }

        return previous;
      });
    }

    function handlePointerOver(event) {
      const target = resolveTooltipTarget(event.target);
      if (!target) {
        return;
      }

      showTooltip(target);
    }

    function handlePointerOut(event) {
      const target = resolveTooltipTarget(event.target);
      if (!target) {
        return;
      }

      const nextTarget = resolveTooltipTarget(event.relatedTarget);
      if (nextTarget === target) {
        return;
      }

      hideTooltip(target);
    }

    function handleFocusIn(event) {
      const target = resolveTooltipTarget(event.target);
      if (!target) {
        return;
      }

      showTooltip(target);
    }

    function handleFocusOut(event) {
      const target = resolveTooltipTarget(event.target);
      if (!target) {
        return;
      }

      const nextTarget = resolveTooltipTarget(event.relatedTarget);
      if (nextTarget === target) {
        return;
      }

      hideTooltip(target);
    }

    function refreshTooltip() {
      setTooltipState((previous) => {
        if (!previous?.target?.isConnected) {
          return null;
        }

        const nextSnapshot = getTooltipSnapshot(previous.target);
        if (!nextSnapshot) {
          return null;
        }

        return nextSnapshot;
      });
    }

    document.addEventListener("pointerover", handlePointerOver, true);
    document.addEventListener("pointerout", handlePointerOut, true);
    document.addEventListener("focusin", handleFocusIn, true);
    document.addEventListener("focusout", handleFocusOut, true);
    window.addEventListener("scroll", refreshTooltip, true);
    window.addEventListener("resize", refreshTooltip);

    return () => {
      document.removeEventListener("pointerover", handlePointerOver, true);
      document.removeEventListener("pointerout", handlePointerOut, true);
      document.removeEventListener("focusin", handleFocusIn, true);
      document.removeEventListener("focusout", handleFocusOut, true);
      window.removeEventListener("scroll", refreshTooltip, true);
      window.removeEventListener("resize", refreshTooltip);
    };
  }, []);

  React.useLayoutEffect(() => {
    if (!tooltipState || !bubbleRef.current) {
      setFloatingStyle(null);
      return;
    }

    const bubbleRect = bubbleRef.current.getBoundingClientRect();
    const { left, placement, top } = measureTooltipPosition(
      tooltipState.rect,
      bubbleRect,
      tooltipState.position
    );

    setFloatingStyle({
      left,
      top
    });

    bubbleRef.current.dataset.position = placement;
  }, [tooltipState]);

  if (typeof document === "undefined" || !tooltipState) {
    return null;
  }

  return createPortal(
    <div className="floating-tooltip-layer" role="presentation">
      <div className="floating-tooltip-bubble" ref={bubbleRef} style={floatingStyle || undefined}>
        {tooltipState.text}
      </div>
    </div>,
    document.body
  );
}
