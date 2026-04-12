import React, { useMemo, useState } from "react";

import { buildInviteUrl } from "../api.js";
import { Avatar } from "./Avatar.jsx";
import { Icon } from "./Icon.jsx";

export function InviteServerModal({
  channelName,
  error,
  friends = [],
  guildName,
  invite,
  loading,
  onClose,
  onRefresh,
  onSendInviteToFriend,
  onShowNotice
}) {
  const [copied, setCopied] = useState(false);
  const [invitedIds, setInvitedIds] = useState([]);
  const [sendingIds, setSendingIds] = useState([]);
  const [search, setSearch] = useState("");

  const inviteCode = invite?.code || "";
  const inviteLink = useMemo(() => buildInviteUrl(inviteCode), [inviteCode]);
  const filteredFriends = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return friends;
    }

    return friends.filter((friend) =>
      [friend.display_name, friend.username]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [friends, search]);

  async function copyValue(value, successLabel) {
    if (!value) {
      return false;
    }

    try {
      await navigator.clipboard.writeText(value);
      if (successLabel) {
        onShowNotice?.(successLabel);
      }
      return true;
    } catch {
      return false;
    }
  }

  async function handleCopyLink() {
    const copiedOk = await copyValue(inviteLink || inviteCode, "Enlace de invitacion copiado.");
    setCopied(copiedOk);
    if (copiedOk) {
      window.setTimeout(() => setCopied(false), 1400);
    }
  }

  async function handleInviteFriend(friend) {
    if (!friend?.id || !inviteCode) {
      return;
    }

    if (onSendInviteToFriend) {
      setSendingIds((current) => (current.includes(friend.id) ? current : [...current, friend.id]));

      try {
        await onSendInviteToFriend(friend, inviteCode);
        setInvitedIds((current) =>
          current.includes(friend.id) ? current : [...current, friend.id]
        );
      } catch (error) {
        onShowNotice?.(error.message || "No se pudo enviar la invitacion.");
      } finally {
        setSendingIds((current) => current.filter((id) => id !== friend.id));
      }
      return;
    }

    const copiedOk = await copyValue(
      inviteLink || inviteCode,
      `Invitacion lista para ${friend.display_name || friend.username}.`
    );

    if (copiedOk) {
      setInvitedIds((current) =>
        current.includes(friend.id) ? current : [...current, friend.id]
      );
    }
  }

  return (
    <div className="settings-backdrop" onClick={onClose}>
      <div className="invite-modal-card discordish" onClick={(event) => event.stopPropagation()}>
        <div className="invite-modal-header">
          <div>
            <h3>Invita a tus amigos a {guildName}</h3>
            <p>
              {channelName
                ? `Los destinatarios llegaran a #${channelName}`
                : "Comparte una invitacion para sumar nuevas sombras al servidor."}
            </p>
          </div>
          <button className="ghost-button icon-only" onClick={onClose} type="button">
            <Icon name="close" />
          </button>
        </div>

        <div className="invite-modal-body">
          {loading ? (
            <div className="invite-empty-state">
              <strong>Generando invitacion...</strong>
              <span>Umbra esta abriendo un nuevo acceso para este servidor.</span>
            </div>
          ) : error ? (
            <div className="invite-empty-state error">
              <strong>No se pudo crear la invitacion.</strong>
              <span>{error}</span>
            </div>
          ) : inviteCode ? (
            <>
              <label className="dialog-friend-search invite-search-bar">
                <Icon name="search" size={17} />
                <input
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Buscar amigos"
                  type="text"
                  value={search}
                />
              </label>

              <div className="invite-friend-list">
                {filteredFriends.length ? (
                  filteredFriends.map((friend) => {
                    const invited = invitedIds.includes(friend.id);
                    const sending = sendingIds.includes(friend.id);

                    return (
                      <div className="invite-friend-row" key={friend.id}>
                        <div className="invite-friend-main">
                          <Avatar
                            hue={friend.avatar_hue}
                            label={friend.display_name || friend.username}
                            size={42}
                            src={friend.avatar_url}
                            status={friend.status}
                          />
                          <div className="invite-friend-copy">
                            <strong>{friend.display_name || friend.username}</strong>
                            <small>{friend.username}</small>
                          </div>
                        </div>

                        <button
                          className={`ghost-button small invite-row-action ${
                            invited ? "active" : ""
                          }`.trim()}
                          disabled={sending}
                          onClick={() => handleInviteFriend(friend)}
                          type="button"
                        >
                          {sending ? "Enviando..." : invited ? "Invitado" : "Invitar"}
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="invite-friends-empty-state">
                    <strong>No hay sombras que coincidan.</strong>
                    <span>Cambia la busqueda o comparte el enlace manualmente.</span>
                  </div>
                )}
              </div>

              <div className="invite-link-panel">
                <strong>O envia un enlace de invitacion al servidor a un amigo</strong>
                <div className="invite-link-copy-row">
                  <div className="invite-link-field" title={inviteLink || inviteCode}>
                    {inviteLink || inviteCode}
                  </div>
                  <button className="primary-button invite-copy-button" onClick={handleCopyLink} type="button">
                    {copied ? "Copiado" : "Copiar"}
                  </button>
                </div>
                <div className="invite-link-footer">
                  <span>El acceso queda listo para compartir desde Umbra.</span>
                  <button className="ghost-button small" onClick={onRefresh} type="button">
                    <Icon name="refresh" size={14} />
                    <span>Editar enlace de invitacion</span>
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="invite-empty-state">
              <strong>No hay codigo listo todavia.</strong>
              <span>Genera una invitacion nueva para este servidor.</span>
              <button className="primary-button" onClick={onRefresh} type="button">
                <Icon name="userAdd" />
                <span>Crear invitacion</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
