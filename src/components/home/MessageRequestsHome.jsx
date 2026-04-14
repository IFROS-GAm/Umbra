import React, { useEffect, useMemo, useState } from "react";

import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";
import { UmbraLogo } from "../UmbraLogo.jsx";

function normalizeRequest(item = {}) {
  return {
    ...item,
    description:
      item.description ||
      item.preview ||
      "Quiere abrir un mensaje directo contigo dentro de Umbra.",
    title: item.title || item.display_name || item.username || "Solicitud nueva"
  };
}

export function MessageRequestsHome({
  onOpenDm,
  onShowNotice,
  requests = [],
  spam = []
}) {
  const [tab, setTab] = useState("requests");
  const [visibleRequests, setVisibleRequests] = useState(() => requests.map(normalizeRequest));
  const [visibleSpam, setVisibleSpam] = useState(() => spam.map(normalizeRequest));

  useEffect(() => {
    setVisibleRequests(requests.map(normalizeRequest));
  }, [requests]);

  useEffect(() => {
    setVisibleSpam(spam.map(normalizeRequest));
  }, [spam]);

  const activeItems = useMemo(
    () => (tab === "requests" ? visibleRequests : visibleSpam),
    [tab, visibleRequests, visibleSpam]
  );

  function dismissItem(itemId, sourceTab) {
    if (sourceTab === "spam") {
      setVisibleSpam((previous) => previous.filter((item) => item.id !== itemId));
      return;
    }

    setVisibleRequests((previous) => previous.filter((item) => item.id !== itemId));
  }

  async function handleAccept(item, sourceTab) {
    dismissItem(item.id, sourceTab);

    if (item.user && onOpenDm) {
      await onOpenDm(item.user);
      return;
    }

    if (onShowNotice) {
      onShowNotice(sourceTab === "spam" ? "DM aceptado desde spam." : "Solicitud aceptada.");
    }
  }

  function handleReject(item, sourceTab) {
    dismissItem(item.id, sourceTab);

    if (onShowNotice) {
      onShowNotice(sourceTab === "spam" ? "Solicitud eliminada del spam." : "Solicitud rechazada.");
    }
  }

  return (
    <section className="requests-home">
      <header className="requests-header">
        <div className="requests-title">
          <Icon name="mail" size={18} />
          <strong>Solicitudes de mensajes</strong>
          <span className="friends-dot">.</span>
        </div>

        <div className="requests-tabs">
          <button
            className={`friends-tab ${tab === "requests" ? "active" : ""}`}
            onClick={() => setTab("requests")}
            type="button"
          >
            Solicitudes
          </button>
          <button
            className={`friends-tab ${tab === "spam" ? "active" : ""}`}
            onClick={() => setTab("spam")}
            type="button"
          >
            Spam ({spam.length})
          </button>
        </div>
      </header>

      {activeItems.length ? (
        <div className="requests-list">
          {activeItems.map((item) => (
            <article className="request-row" key={item.id}>
              <div className="request-row-main">
                <Avatar
                  hue={item.user?.avatar_hue || item.avatar_hue || 220}
                  label={item.title}
                  size={46}
                  src={item.user?.avatar_url || item.avatar_url}
                  status={item.user?.status || item.status || null}
                />
                <div className="request-row-copy">
                  <strong>{item.title}</strong>
                  <p>{item.description}</p>
                  {item.meta ? <small>{item.meta}</small> : null}
                </div>
              </div>

              <div className="request-row-actions">
                <button
                  className="request-action-button accept"
                  onClick={() => handleAccept(item, tab)}
                  type="button"
                >
                  {tab === "spam" ? "Aceptar DM" : "Aceptar"}
                </button>
                <button
                  className="request-action-button reject"
                  onClick={() => handleReject(item, tab)}
                  type="button"
                >
                  {tab === "spam" ? "Eliminar" : "Rechazar"}
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="requests-empty">
          <div className="requests-empty-illustration" aria-hidden="true">
            <div className="requests-empty-cloud" />
            <div className="requests-empty-sign" />
            <div className="requests-empty-mascot">
              <UmbraLogo size={54} />
            </div>
          </div>

          <p>No hay solicitudes de mensajes pendientes. Wumpus te hara compania.</p>
        </div>
      )}
    </section>
  );
}
