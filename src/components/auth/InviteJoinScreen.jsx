import React, { useEffect, useMemo, useState } from "react";

import { api, buildInviteUrl, resolveAssetUrl } from "../../api.js";
import { Icon } from "../Icon.jsx";
import { UmbraLogo } from "../UmbraLogo.jsx";

function buildDesktopInviteLink(code) {
  return `umbra://invite/${encodeURIComponent(code)}`;
}

export function InviteJoinScreen({
  inviteCode,
  onAccept,
  onBackHome,
  onContinueInBrowser,
  session
}) {
  const [invite, setInvite] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadInvite() {
      setLoading(true);
      setError("");

      try {
        const payload = await api.getInviteByCode(inviteCode);
        if (!cancelled) {
          setInvite(payload.invite || null);
        }
      } catch (inviteError) {
        if (!cancelled) {
          setError(inviteError.message || "No se pudo cargar la invitacion.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadInvite();

    return () => {
      cancelled = true;
    };
  }, [inviteCode]);

  const inviteLink = useMemo(() => buildInviteUrl(inviteCode), [inviteCode]);
  const isDesktopRuntime =
    typeof window !== "undefined" && Boolean(window.umbraDesktop);

  const guild = invite?.guild || null;
  const guildIcon = guild?.icon_url ? resolveAssetUrl(guild.icon_url) : "";
  const guildBanner = guild?.banner_image_url
    ? resolveAssetUrl(guild.banner_image_url)
    : "";
  const currentUsername =
    session?.user?.user_metadata?.username ||
    session?.user?.user_metadata?.user_name ||
    session?.user?.email?.split("@")[0] ||
    "Umbra";
  const isAlreadyJoined = Boolean(invite?.already_joined);

  async function handleAccept() {
    if (!session?.user || busy) {
      return;
    }

    setBusy(true);
    setError("");

    try {
      const payload = await api.acceptInvite(inviteCode);
      onAccept?.(payload);
    } catch (inviteError) {
      setError(inviteError.message || "No se pudo aceptar la invitacion.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="invite-route-shell"
      style={{
        "--invite-banner-color": guild?.banner_color || "#5865F2"
      }}
    >
      <div className="invite-route-backdrop">
        {guildBanner ? (
          <img
            alt={guild?.name || "Servidor Umbra"}
            className="invite-route-backdrop-image"
            draggable="false"
            src={guildBanner}
          />
        ) : (
          <div className="invite-route-backdrop-gradient" />
        )}
      </div>

      <div className="invite-route-overlay" />

      <div className="invite-route-card floating-surface">
        <button
          className="invite-route-close icon-button"
          onClick={onBackHome}
          type="button"
        >
          <Icon name="close" />
        </button>

        {loading ? (
          <div className="invite-route-loading">
            <UmbraLogo alt="Umbra" size={48} />
            <strong>Preparando la invitacion...</strong>
          </div>
        ) : error ? (
          <div className="invite-route-loading error">
            <Icon name="mail" size={30} />
            <strong>La invitacion no esta disponible.</strong>
            <span>{error}</span>
            <button className="primary-button" onClick={onBackHome} type="button">
              Volver a Umbra
            </button>
          </div>
        ) : (
          <>
            <div className="invite-route-copy">
              <div className="invite-route-copy-eyebrow">Umbra invite</div>
              <div className="invite-route-guild-badge">
                {guildIcon ? (
                  <img
                    alt={guild?.name || "Servidor Umbra"}
                    className="invite-route-guild-icon"
                    draggable="false"
                    src={guildIcon}
                  />
                ) : (
                  <div className="invite-route-guild-icon fallback">
                    {guild?.icon_text || guild?.name?.slice(0, 2)?.toUpperCase() || "UM"}
                  </div>
                )}
              </div>
              <p>Te invitaron a unirte a</p>
              <h1>{guild?.name || "Servidor Umbra"}</h1>
              <div className="invite-route-stats">
                <span>
                  <i className="invite-dot online" />
                  {new Intl.NumberFormat("es-CO").format(
                    invite?.stats?.online_count || 0
                  )}{" "}
                  en linea
                </span>
                <span>
                  <i className="invite-dot" />
                  {new Intl.NumberFormat("es-CO").format(
                    invite?.stats?.member_count || 0
                  )}{" "}
                  miembros
                </span>
              </div>
              {invite?.channel?.name ? (
                <span className="invite-route-channel-copy">
                  Llegaras a <strong>#{invite.channel.name}</strong>
                </span>
              ) : null}
              <p className="invite-route-description">
                {guild?.description || "Un espacio oscuro y vivo en Umbra."}
              </p>
            </div>

            <div className="invite-route-actions">
              {session?.user ? (
                <>
                  <button
                    className="primary-button invite-accept-button"
                    disabled={busy}
                    onClick={handleAccept}
                    type="button"
                  >
                    {busy
                      ? "Entrando..."
                      : `${isAlreadyJoined ? "Abrir" : "Aceptar"} como ${currentUsername}`}
                  </button>
                  <button
                    className="secondary-button invite-decline-button"
                    onClick={onBackHome}
                    type="button"
                  >
                    No, gracias
                  </button>
                </>
              ) : (
                <>
                  {isDesktopRuntime ? (
                    <button
                      className="primary-button invite-accept-button"
                      onClick={onContinueInBrowser}
                      type="button"
                    >
                      Continuar en Umbra
                    </button>
                  ) : (
                    <a
                      className="primary-button invite-accept-button"
                      href={buildDesktopInviteLink(inviteCode)}
                    >
                      Abrir aplicacion
                    </a>
                  )}
                  <button
                    className="secondary-button invite-decline-button"
                    onClick={isDesktopRuntime ? onBackHome : onContinueInBrowser}
                    type="button"
                  >
                    {isDesktopRuntime ? "No, gracias" : "Continuar en el navegador"}
                  </button>
                </>
              )}
              <div className="invite-route-link-copy">
                <span>{inviteLink}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
