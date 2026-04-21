import React, { useEffect, useMemo, useRef, useState } from "react";

import { api, resolveAssetUrl } from "../../api.js";
import { translate } from "../../i18n.js";
import { Icon } from "../Icon.jsx";

function normalizeStickerName(value) {
  return String(value || "").trim().slice(0, 32);
}

function normalizeStickerEmoji(value) {
  return String(value || "").trim().slice(0, 16);
}

function replaceCount(template, count, fallback) {
  return String(template || fallback).replace("{count}", String(count));
}

export function ServerStickersPanel({ guildId, language = "es" }) {
  const fileInputRef = useRef(null);
  const t = (key, fallback) => translate(language, key, fallback);
  const [stickersState, setStickersState] = useState({
    error: "",
    loaded: false,
    loading: false,
    stickers: []
  });
  const [form, setForm] = useState({
    emoji: "",
    imageFile: null,
    imagePreview: "",
    name: ""
  });
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    setStickersState({
      error: "",
      loaded: false,
      loading: false,
      stickers: []
    });
    setForm({
      emoji: "",
      imageFile: null,
      imagePreview: "",
      name: ""
    });
    setSubmitting(false);
    setNotice("");
  }, [guildId]);

  useEffect(
    () => () => {
      if (form.imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(form.imagePreview);
      }
    },
    [form.imagePreview]
  );

  useEffect(() => {
    if (stickersState.loaded || stickersState.loading) {
      return;
    }

    let cancelled = false;
    setStickersState((previous) => ({
      ...previous,
      error: "",
      loading: true
    }));

    api
      .listGuildStickers({ guildId })
      .then((payload) => {
        if (cancelled) {
          return;
        }

        setStickersState({
          error: "",
          loaded: true,
          loading: false,
          stickers: payload.stickers || []
        });
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }

        setStickersState({
          error: error.message,
          loaded: true,
          loading: false,
          stickers: []
        });
      });

    return () => {
      cancelled = true;
    };
  }, [guildId, stickersState.loaded, stickersState.loading]);

  const customStickerCount = useMemo(
    () => stickersState.stickers.filter((sticker) => !sticker.is_default).length,
    [stickersState.stickers]
  );

  function updateForm(key, value) {
    setForm((previous) => ({
      ...previous,
      [key]: value
    }));
  }

  function handleFileSelection(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!file.type.startsWith("image/")) {
      setStickersState((previous) => ({
        ...previous,
        error: t("server.settings.stickers.invalidImage", "Selecciona una imagen valida para el sticker.")
      }));
      return;
    }

    setForm((previous) => {
      if (previous.imagePreview?.startsWith("blob:")) {
        URL.revokeObjectURL(previous.imagePreview);
      }

      return {
        ...previous,
        imageFile: file,
        imagePreview: URL.createObjectURL(file)
      };
    });
    setNotice("");
    setStickersState((previous) => ({
      ...previous,
      error: ""
    }));
  }

  async function handleCreateSticker(event) {
    event.preventDefault();
    setSubmitting(true);
    setNotice("");
    setStickersState((previous) => ({
      ...previous,
      error: ""
    }));

    try {
      let imageUrl = "";
      if (form.imageFile) {
        const uploadPayload = await api.uploadAttachments([form.imageFile]);
        imageUrl = uploadPayload.attachments?.[0]?.url || "";
        if (!imageUrl) {
          throw new Error(
            t("server.settings.stickers.uploadFailed", "No se pudo subir la imagen del sticker.")
          );
        }
      }

      const payload = await api.createGuildSticker({
        emoji: normalizeStickerEmoji(form.emoji),
        guildId,
        imageUrl,
        name: normalizeStickerName(form.name)
      });

      setStickersState((previous) => ({
        ...previous,
        stickers: [...previous.stickers, payload.sticker].sort(
          (left, right) => Number(left.position || 0) - Number(right.position || 0)
        )
      }));
      setForm((previous) => {
        if (previous.imagePreview?.startsWith("blob:")) {
          URL.revokeObjectURL(previous.imagePreview);
        }

        return {
          emoji: "",
          imageFile: null,
          imagePreview: "",
          name: ""
        };
      });
      setNotice(t("server.settings.stickers.created", "Sticker creado."));
    } catch (error) {
      setStickersState((previous) => ({
        ...previous,
        error: error.message
      }));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDeleteSticker(sticker) {
    try {
      await api.deleteGuildSticker({
        guildId,
        stickerId: sticker.id
      });
      setStickersState((previous) => ({
        ...previous,
        stickers: previous.stickers.filter((item) => item.id !== sticker.id)
      }));
      setNotice(t("server.settings.stickers.deleted", "Sticker eliminado."));
    } catch (error) {
      setStickersState((previous) => ({
        ...previous,
        error: error.message
      }));
    }
  }

  return (
    <div className="server-settings-body single-column">
      <div className="server-settings-tab-panel">
        <div className="server-settings-list-header">
          <div>
            <h3>{t("server.settings.stickers.title", "Stickers")}</h3>
            <span>
              {replaceCount(
                t(
                  "server.settings.stickers.subtitle",
                  `${stickersState.stickers.length} stickers disponibles en este servidor`
                ),
                stickersState.stickers.length,
                `${stickersState.stickers.length} stickers disponibles en este servidor`
              )}
            </span>
          </div>
          <span className="server-settings-pill">
            {replaceCount(
              t("server.settings.stickers.customCount", `${customStickerCount} personalizados`),
              customStickerCount,
              `${customStickerCount} personalizados`
            )}
          </span>
        </div>

        <form className="server-stickers-form" onSubmit={handleCreateSticker}>
          <input
            accept="image/*"
            className="hidden-file-input"
            onChange={handleFileSelection}
            ref={fileInputRef}
            type="file"
          />

          <label className="settings-field">
            <span>{t("server.settings.stickers.name", "Nombre del sticker")}</span>
            <input
              maxLength={32}
              onChange={(event) => updateForm("name", event.target.value)}
              placeholder={t("server.settings.stickers.placeholderName", "ej. Saludo")}
              required
              value={form.name}
            />
          </label>

          <div className="server-stickers-form-row">
            <label className="settings-field">
              <span>{t("server.settings.stickers.emoji", "Emoji")}</span>
              <input
                maxLength={16}
                onChange={(event) => updateForm("emoji", event.target.value)}
                placeholder="✨"
                value={form.emoji}
              />
            </label>

            <div className="settings-field">
              <span>{t("server.settings.stickers.image", "Imagen")}</span>
              <div className="server-stickers-upload-row">
                <button
                  className="ghost-button"
                  onClick={() => fileInputRef.current?.click()}
                  type="button"
                >
                  <Icon name="upload" />
                  <span>
                    {form.imageFile
                      ? t("server.settings.stickers.changeImage", "Cambiar imagen")
                      : t("server.settings.stickers.uploadImage", "Subir imagen")}
                  </span>
                </button>
                {form.imagePreview ? (
                  <button
                    className="ghost-button"
                    onClick={() =>
                      setForm((previous) => {
                        if (previous.imagePreview?.startsWith("blob:")) {
                          URL.revokeObjectURL(previous.imagePreview);
                        }

                        return {
                          ...previous,
                          imageFile: null,
                          imagePreview: ""
                        };
                      })
                    }
                    type="button"
                  >
                    <Icon name="close" />
                    <span>{t("server.settings.stickers.removeImage", "Quitar")}</span>
                  </button>
                ) : null}
              </div>
            </div>
          </div>

          {form.imagePreview ? (
            <div className="server-sticker-preview">
              <img alt={form.name || "Sticker"} src={form.imagePreview} />
            </div>
          ) : null}

          {notice ? <p className="settings-form-success">{notice}</p> : null}
          {stickersState.error ? (
            <div className="settings-form-actions inline">
              <p className="form-error settings-form-error">{stickersState.error}</p>
              <button
                className="ghost-button small"
                onClick={() =>
                  setStickersState((previous) => ({
                    ...previous,
                    error: "",
                    loaded: false,
                    loading: false
                  }))
                }
                type="button"
              >
                <Icon name="refresh" size={14} />
                <span>Reintentar</span>
              </button>
            </div>
          ) : null}

          <div className="settings-form-actions">
            <button className="primary-button" disabled={submitting} type="submit">
              <Icon name="sticker" />
              <span>
                {submitting
                  ? t("server.settings.stickers.creating", "Creando...")
                  : t("server.settings.stickers.create", "Crear sticker")}
              </span>
            </button>
          </div>
        </form>

        {stickersState.loading ? (
          <div className="server-settings-empty">
            {t("server.settings.stickers.loading", "Cargando stickers...")}
          </div>
        ) : (
          <div className="server-stickers-grid">
            {stickersState.stickers.map((sticker) => (
              <article className="server-sticker-card" key={sticker.id}>
                <div className="server-sticker-card-main">
                  <div className="server-sticker-card-visual">
                    {sticker.image_url ? (
                      <img alt={sticker.name} src={resolveAssetUrl(sticker.image_url)} />
                    ) : (
                      <span>{sticker.emoji || "✨"}</span>
                    )}
                  </div>
                  <div className="server-sticker-card-copy">
                    <strong>{sticker.name}</strong>
                    <span>
                      {sticker.emoji ||
                        t("server.settings.stickers.serverSticker", "Sticker del servidor")}
                    </span>
                  </div>
                </div>
                <div className="server-settings-badges">
                  {sticker.is_default ? (
                    <span className="server-settings-pill accent">
                      {t("server.settings.stickers.default", "Predeterminado")}
                    </span>
                  ) : (
                    <button
                      className="ghost-button small"
                      onClick={() => handleDeleteSticker(sticker)}
                      type="button"
                    >
                      <Icon name="trash" size={14} />
                      <span>{t("server.settings.stickers.delete", "Eliminar")}</span>
                    </button>
                  )}
                </div>
              </article>
            ))}

            {!stickersState.stickers.length ? (
              <div className="server-settings-empty">
                {t(
                  "server.settings.stickers.empty",
                  "Este servidor aun no tiene stickers. Crea uno para usarlo en el chat."
                )}
              </div>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
