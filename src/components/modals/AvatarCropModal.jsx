import React, { useEffect, useMemo, useState } from "react";

import { Icon } from "../Icon.jsx";

const VIEWPORT_SIZE = 320;
const OUTPUT_SIZE = 512;

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function computeBounds(naturalWidth, naturalHeight, zoom) {
  const baseScale = Math.max(VIEWPORT_SIZE / naturalWidth, VIEWPORT_SIZE / naturalHeight);
  const scale = baseScale * zoom;
  const renderedWidth = naturalWidth * scale;
  const renderedHeight = naturalHeight * scale;
  return {
    maxX: Math.max(0, (renderedWidth - VIEWPORT_SIZE) / 2),
    maxY: Math.max(0, (renderedHeight - VIEWPORT_SIZE) / 2),
    scale
  };
}

async function exportCroppedAvatar({ file, imageUrl, offsetX, offsetY, zoom }) {
  const image = await new Promise((resolve, reject) => {
    const nextImage = new Image();
    nextImage.onload = () => resolve(nextImage);
    nextImage.onerror = reject;
    nextImage.src = imageUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const context = canvas.getContext("2d");
  const { scale } = computeBounds(image.naturalWidth, image.naturalHeight, zoom);
  const outputScale = OUTPUT_SIZE / VIEWPORT_SIZE;
  const drawX = ((VIEWPORT_SIZE - image.naturalWidth * scale) / 2 + offsetX) * outputScale;
  const drawY = ((VIEWPORT_SIZE - image.naturalHeight * scale) / 2 + offsetY) * outputScale;

  context.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
  context.drawImage(
    image,
    drawX,
    drawY,
    image.naturalWidth * scale * outputScale,
    image.naturalHeight * scale * outputScale
  );

  const blob = await new Promise((resolve) =>
    canvas.toBlob((nextBlob) => resolve(nextBlob), "image/png", 0.92)
  );

  if (!blob) {
    throw new Error("No se pudo preparar el avatar.");
  }

  return new File([blob], file.name.replace(/\.[^.]+$/, "") + "-avatar.png", {
    type: "image/png"
  });
}

export function AvatarCropModal({ file, imageUrl, onApply, onClose }) {
  const [imageSize, setImageSize] = useState({ height: 1, width: 1 });
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [saving, setSaving] = useState(false);

  const bounds = useMemo(
    () => computeBounds(imageSize.width || 1, imageSize.height || 1, zoom),
    [imageSize.height, imageSize.width, zoom]
  );

  useEffect(() => {
    setOffsetX((previous) => clamp(previous, -bounds.maxX, bounds.maxX));
    setOffsetY((previous) => clamp(previous, -bounds.maxY, bounds.maxY));
  }, [bounds.maxX, bounds.maxY]);

  async function handleApply() {
    setSaving(true);
    try {
      const croppedFile = await exportCroppedAvatar({
        file,
        imageUrl,
        offsetX,
        offsetY,
        zoom
      });
      onApply(croppedFile);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="settings-backdrop" onClick={saving ? undefined : onClose}>
      <div className="avatar-crop-modal" onClick={(event) => event.stopPropagation()}>
        <div className="avatar-crop-header">
          <h3>Editar imagen</h3>
          <button className="ghost-button icon-only" onClick={onClose} type="button">
            <Icon name="close" />
          </button>
        </div>

        <div className="avatar-crop-stage">
          <img
            alt="Vista previa del avatar"
            className="avatar-crop-image"
            onLoad={(event) =>
              setImageSize({
                height: event.currentTarget.naturalHeight,
                width: event.currentTarget.naturalWidth
              })
            }
            src={imageUrl}
            style={{
              transform: `translate(calc(-50% + ${offsetX}px), calc(-50% + ${offsetY}px)) scale(${bounds.scale})`
            }}
          />
          <div className="avatar-crop-ring" />
        </div>

        <div className="avatar-crop-controls">
          <label className="avatar-crop-control">
            <span>
              <Icon name="search" size={16} /> Zoom
            </span>
            <input
              max="2.6"
              min="1"
              onChange={(event) => setZoom(Number(event.target.value))}
              step="0.01"
              type="range"
              value={zoom}
            />
          </label>

          <label className="avatar-crop-control">
            <span>
              <Icon name="arrowRight" size={16} /> Horizontal
            </span>
            <input
              max={bounds.maxX}
              min={-bounds.maxX}
              onChange={(event) => setOffsetX(Number(event.target.value))}
              step="1"
              type="range"
              value={offsetX}
            />
          </label>

          <label className="avatar-crop-control">
            <span>
              <Icon name="chevronDown" size={16} /> Vertical
            </span>
            <input
              max={bounds.maxY}
              min={-bounds.maxY}
              onChange={(event) => setOffsetY(Number(event.target.value))}
              step="1"
              type="range"
              value={offsetY}
            />
          </label>
        </div>

        <div className="avatar-crop-actions">
          <button
            className="ghost-button"
            onClick={() => {
              setZoom(1);
              setOffsetX(0);
              setOffsetY(0);
            }}
            type="button"
          >
            Reiniciar
          </button>
          <div className="avatar-crop-actions-right">
            <button className="ghost-button" onClick={onClose} type="button">
              Cancelar
            </button>
            <button className="primary-button" disabled={saving} onClick={handleApply} type="button">
              {saving ? "Aplicando..." : "Aplicar"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
