import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { resolveAssetUrl } from "../../api.js";
import { Icon } from "../Icon.jsx";
import { attachmentKey } from "./workspaceHelpers.js";

const MAX_ZOOM = 10;
const MIN_ZOOM = 1;
const ZOOM_STEP = 1.28;

function clampIndex(index, length) {
  if (!length) {
    return 0;
  }

  const normalized = Number(index) || 0;
  if (normalized < 0) {
    return length - 1;
  }

  if (normalized >= length) {
    return 0;
  }

  return normalized;
}

function clampZoom(value) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, Number(value) || MIN_ZOOM));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function measureFittedImageSize(container, image) {
  const containerWidth = container?.clientWidth || 0;
  const containerHeight = container?.clientHeight || 0;
  const naturalWidth = image?.naturalWidth || 0;
  const naturalHeight = image?.naturalHeight || 0;

  if (!containerWidth || !containerHeight || !naturalWidth || !naturalHeight) {
    return null;
  }

  const ratio = Math.min(containerWidth / naturalWidth, containerHeight / naturalHeight, 1);

  return {
    height: Math.max(1, Math.round(naturalHeight * ratio)),
    width: Math.max(1, Math.round(naturalWidth * ratio))
  };
}

export function MessageImageViewer({
  attachments = [],
  initialIndex = 0,
  onClose
}) {
  const [activeIndex, setActiveIndex] = useState(() => clampIndex(initialIndex, attachments.length));
  const [zoom, setZoom] = useState(1);
  const [baseSize, setBaseSize] = useState(null);
  const [viewportSize, setViewportSize] = useState({
    height: 0,
    width: 0
  });
  const [isDragging, setIsDragging] = useState(false);
  const [showZoomIndicator, setShowZoomIndicator] = useState(false);
  const wrapRef = useRef(null);
  const imageRef = useRef(null);
  const mediaRef = useRef(null);
  const dragStateRef = useRef(null);
  const zoomAnchorRef = useRef(null);
  const pendingCenterRef = useRef(true);
  const zoomIndicatorTimeoutRef = useRef(null);

  useEffect(() => {
    setActiveIndex(clampIndex(initialIndex, attachments.length));
  }, [attachments, initialIndex]);

  useEffect(() => {
    setZoom(1);
    setBaseSize(null);
    setIsDragging(false);
    setShowZoomIndicator(false);
    dragStateRef.current = null;
    zoomAnchorRef.current = null;
    pendingCenterRef.current = true;
  }, [activeIndex]);

  useEffect(() => {
    return () => {
      if (zoomIndicatorTimeoutRef.current) {
        window.clearTimeout(zoomIndicatorTimeoutRef.current);
      }
    };
  }, []);

  const activeAttachment = useMemo(
    () => attachments[clampIndex(activeIndex, attachments.length)] || null,
    [activeIndex, attachments]
  );

  useEffect(() => {
    if (!attachments.length) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose?.();
        return;
      }

      if (event.key === "0") {
        setZoom(1);
        pendingCenterRef.current = true;
        return;
      }

      if (attachments.length <= 1) {
        return;
      }

      if (event.key === "ArrowLeft") {
        setActiveIndex((previous) => clampIndex(previous - 1, attachments.length));
      }

      if (event.key === "ArrowRight") {
        setActiveIndex((previous) => clampIndex(previous + 1, attachments.length));
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [attachments.length, onClose]);

  const measureImageSize = useCallback(() => {
    const wrap = wrapRef.current;
    const nextSize = measureFittedImageSize(wrap, imageRef.current);

    if (wrap?.clientWidth && wrap?.clientHeight) {
      setViewportSize((previous) => {
        const nextViewport = {
          height: wrap.clientHeight,
          width: wrap.clientWidth
        };

        if (
          previous &&
          Math.abs(previous.width - nextViewport.width) < 1 &&
          Math.abs(previous.height - nextViewport.height) < 1
        ) {
          return previous;
        }

        return nextViewport;
      });
    }

    if (!nextSize) {
      return;
    }

    setBaseSize((previous) => {
      if (
        previous &&
        Math.abs(previous.width - nextSize.width) < 1 &&
        Math.abs(previous.height - nextSize.height) < 1
      ) {
        return previous;
      }

      return nextSize;
    });
  }, []);

  const getScrollLimits = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) {
      return {
        maxScrollLeft: 0,
        maxScrollTop: 0
      };
    }

    return {
      maxScrollLeft: Math.max(wrap.scrollWidth - wrap.clientWidth, 0),
      maxScrollTop: Math.max(wrap.scrollHeight - wrap.clientHeight, 0)
    };
  }, []);

  const centerMediaInViewport = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) {
      return false;
    }

    const { maxScrollLeft, maxScrollTop } = getScrollLimits();
    wrap.scrollLeft = maxScrollLeft / 2;
    wrap.scrollTop = maxScrollTop / 2;
    return true;
  }, [getScrollLimits]);

  useLayoutEffect(() => {
    measureImageSize();

    if (typeof ResizeObserver !== "function" || !wrapRef.current) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      measureImageSize();
    });

    observer.observe(wrapRef.current);

    return () => {
      observer.disconnect();
    };
  }, [measureImageSize, activeAttachment?.url]);

  useLayoutEffect(() => {
    const anchor = zoomAnchorRef.current;
    const wrap = wrapRef.current;
    const media = mediaRef.current;
    const nextRenderedWidth = baseSize?.width ? Math.max(1, Math.round(baseSize.width * zoom)) : null;
    const nextRenderedHeight = baseSize?.height ? Math.max(1, Math.round(baseSize.height * zoom)) : null;

    if (!anchor || !wrap || !media || !nextRenderedWidth || !nextRenderedHeight) {
      return undefined;
    }

    let frameId = window.requestAnimationFrame(() => {
      const wrapBounds = wrap.getBoundingClientRect();
      const mediaBounds = media.getBoundingClientRect();
      const mediaOffsetLeft = wrap.scrollLeft + mediaBounds.left - wrapBounds.left;
      const mediaOffsetTop = wrap.scrollTop + mediaBounds.top - wrapBounds.top;
      const unclampedScrollLeft =
        mediaOffsetLeft + nextRenderedWidth * anchor.ratioX - anchor.pointerOffsetX;
      const unclampedScrollTop =
        mediaOffsetTop + nextRenderedHeight * anchor.ratioY - anchor.pointerOffsetY;
      const { maxScrollLeft, maxScrollTop } = getScrollLimits();

      wrap.scrollLeft = clamp(unclampedScrollLeft, 0, maxScrollLeft);
      wrap.scrollTop = clamp(unclampedScrollTop, 0, maxScrollTop);
      zoomAnchorRef.current = null;
      pendingCenterRef.current = false;
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [baseSize, getScrollLimits, zoom]);

  useLayoutEffect(() => {
    if (zoomAnchorRef.current || isDragging) {
      return;
    }

    if (zoom > 1.001 && !pendingCenterRef.current) {
      return;
    }

    let frameId = window.requestAnimationFrame(() => {
      if (centerMediaInViewport()) {
        pendingCenterRef.current = false;
      }
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [activeIndex, centerMediaInViewport, isDragging, zoom]);

  function handleImageLoad() {
    measureImageSize();
    pendingCenterRef.current = true;
  }

  function showZoomHud() {
    setShowZoomIndicator(true);

    if (zoomIndicatorTimeoutRef.current) {
      window.clearTimeout(zoomIndicatorTimeoutRef.current);
    }

    zoomIndicatorTimeoutRef.current = window.setTimeout(() => {
      setShowZoomIndicator(false);
      zoomIndicatorTimeoutRef.current = null;
    }, 1500);
  }

  function handleImageWheel(event) {
    event.preventDefault();

    const wrap = wrapRef.current;
    const media = mediaRef.current;
    if (!wrap || !media) {
      return;
    }

    const wrapBounds = wrap.getBoundingClientRect();
    const mediaBounds = media.getBoundingClientRect();
    const nextZoom = clampZoom(event.deltaY < 0 ? zoom * ZOOM_STEP : zoom / ZOOM_STEP);

    if (nextZoom === zoom) {
      return;
    }

    zoomAnchorRef.current = {
      pointerOffsetX: event.clientX - wrapBounds.left,
      pointerOffsetY: event.clientY - wrapBounds.top,
      ratioX: clamp((event.clientX - mediaBounds.left) / Math.max(1, mediaBounds.width), 0, 1),
      ratioY: clamp((event.clientY - mediaBounds.top) / Math.max(1, mediaBounds.height), 0, 1)
    };

    setZoom(nextZoom);
    showZoomHud();
  }

  function handlePointerDown(event) {
    if (zoom <= 1.001 || event.button !== 0 || !wrapRef.current || event.target === event.currentTarget) {
      return;
    }

    dragStateRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      pointerId: event.pointerId,
      scrollLeft: wrapRef.current.scrollLeft,
      scrollTop: wrapRef.current.scrollTop
    };
    setIsDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function handlePointerMove(event) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId || !wrapRef.current) {
      return;
    }

    const { maxScrollLeft, maxScrollTop } = getScrollLimits();
    wrapRef.current.scrollLeft = clamp(
      dragState.scrollLeft - (event.clientX - dragState.clientX),
      0,
      maxScrollLeft
    );
    wrapRef.current.scrollTop = clamp(
      dragState.scrollTop - (event.clientY - dragState.clientY),
      0,
      maxScrollTop
    );
    event.preventDefault();
  }

  function stopDragging(event) {
    const dragState = dragStateRef.current;
    if (!dragState || dragState.pointerId !== event.pointerId) {
      return;
    }

    dragStateRef.current = null;
    setIsDragging(false);
    event.currentTarget.releasePointerCapture?.(event.pointerId);
  }

  const renderedWidth = baseSize?.width ? Math.max(1, Math.round(baseSize.width * zoom)) : null;
  const renderedHeight = baseSize?.height ? Math.max(1, Math.round(baseSize.height * zoom)) : null;
  const canvasWidth = Math.max(viewportSize.width || 0, renderedWidth || 0);
  const canvasHeight = Math.max(viewportSize.height || 0, renderedHeight || 0);
  const activeAttachmentUrl = resolveAssetUrl(activeAttachment.preview_url || activeAttachment.url);
  const zoomPercent = Math.round(zoom * 100);
  const maxZoomPercent = Math.round(MAX_ZOOM * 100);
  const remainingZoomPercent = Math.max(maxZoomPercent - zoomPercent, 0);
  const zoomProgress = clamp((zoom - MIN_ZOOM) / Math.max(MAX_ZOOM - MIN_ZOOM, 1), 0, 1);
  const canCloseWithBackdropClick = zoom < 1.5;

  if (!attachments.length || !activeAttachment) {
    return null;
  }

  return (
    <div
      className="message-image-viewer-layer"
      onClick={() => {
        if (canCloseWithBackdropClick) {
          onClose?.();
        }
      }}
      role="dialog"
      aria-label="Visor de imagenes"
      aria-modal="true"
    >
      <div className="message-image-viewer-shell">
        <div className="message-image-viewer-topbar" onClick={(event) => event.stopPropagation()}>
          <div className="message-image-viewer-meta">
            <strong>{activeAttachment.name || "Imagen"}</strong>
            <span>
              {activeIndex + 1} / {attachments.length}
            </span>
          </div>
          <button
            aria-label="Cerrar visor"
            className="message-image-viewer-close"
            onClick={onClose}
            type="button"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <div
          className={`message-image-viewer-stage ${
            attachments.length <= 1 ? "single-image" : ""
          }`.trim()}
        >
          {attachments.length > 1 ? (
            <button
              aria-label="Imagen anterior"
              className="message-image-viewer-nav previous"
              onClick={(event) => {
                event.stopPropagation();
                setActiveIndex((previous) => clampIndex(previous - 1, attachments.length));
              }}
              type="button"
            >
              <Icon name="chevronLeft" size={20} />
            </button>
          ) : null}

          <div
            className={`message-image-viewer-image-wrap ${zoom > 1 ? "zoomed" : ""} ${
              isDragging ? "dragging" : ""
            }`.trim()}
            onClick={(event) => {
              if (event.target === event.currentTarget && canCloseWithBackdropClick) {
                onClose?.();
              }
            }}
            onPointerCancel={stopDragging}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={stopDragging}
            onWheel={handleImageWheel}
            ref={wrapRef}
          >
            <div className="message-image-viewer-zoom-indicator" onClick={(event) => event.stopPropagation()}>
              <span className="message-image-viewer-zoom-label">Zoom</span>
              <strong>{zoomPercent}%</strong>
              <div className="message-image-viewer-zoom-meter" aria-hidden="true">
                <div
                  className="message-image-viewer-zoom-meter-fill"
                  style={{
                    height: `${Math.max(zoomProgress * 100, 4)}%`
                  }}
                />
              </div>
              <span className="message-image-viewer-zoom-hint">Falta {remainingZoomPercent}%</span>
            </div>
            <div
              className="message-image-viewer-canvas"
              style={
                canvasWidth && canvasHeight
                  ? {
                      height: `${canvasHeight}px`,
                      width: `${canvasWidth}px`
                    }
                  : undefined
              }
            >
              <div
                className="message-image-viewer-media"
                onClick={(event) => event.stopPropagation()}
                ref={mediaRef}
                style={
                  renderedWidth && renderedHeight
                    ? {
                        height: `${renderedHeight}px`,
                        width: `${renderedWidth}px`
                      }
                    : undefined
                }
              >
                <img
                  alt={activeAttachment.alt_text || activeAttachment.name || "Imagen adjunta"}
                  className="message-image-viewer-image"
                  draggable="false"
                  onLoad={handleImageLoad}
                  ref={imageRef}
                  src={activeAttachmentUrl}
                />
              </div>
            </div>
          </div>

          {attachments.length > 1 ? (
            <button
              aria-label="Siguiente imagen"
              className="message-image-viewer-nav next"
              onClick={(event) => {
                event.stopPropagation();
                setActiveIndex((previous) => clampIndex(previous + 1, attachments.length));
              }}
              type="button"
            >
              <Icon name="arrowRight" size={20} />
            </button>
          ) : null}
        </div>

        {attachments.length > 1 ? (
          <div className="message-image-viewer-thumbs" onClick={(event) => event.stopPropagation()}>
            {attachments.map((attachment, index) => (
              <button
                aria-label={`Abrir imagen ${index + 1}`}
                className={`message-image-viewer-thumb ${index === activeIndex ? "active" : ""}`.trim()}
                key={attachmentKey(attachment)}
                onClick={() => setActiveIndex(index)}
                type="button"
              >
                <img
                  alt={attachment.alt_text || attachment.name || `Imagen ${index + 1}`}
                  draggable="false"
                  src={resolveAssetUrl(attachment.preview_url || attachment.url)}
                />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
