import React, { useEffect, useMemo, useState } from "react";

import { Icon } from "./Icon.jsx";

const GUILD_TEMPLATES = [
  { id: "games", icon: "games", label: "Juegos", description: "Raids, squads y noches de party." },
  { id: "friends", icon: "friends", label: "Amigos", description: "Servidor social pequeno y directo." },
  { id: "study", icon: "study", label: "Grupo de estudio", description: "Clases, tareas y seguimiento." },
  { id: "community", icon: "community", label: "Comunidad local", description: "Eventos, anuncios y equipo." }
];
const GROUP_DM_MAX_PARTICIPANTS = 10;
const GROUP_DM_MAX_RECIPIENTS = GROUP_DM_MAX_PARTICIPANTS - 1;

function buildTemplateName(template) {
  return `Servidor de ${template.label}`;
}

function getDialogMeta(type) {
  switch (type) {
    case "guild":
      return {
        heroIcon: "server",
        subtitle: "Crea un servidor con identidad propia y un punto de arranque claro.",
        title: "Crea tu servidor"
      };
    case "channel":
      return {
        heroIcon: "channel",
        subtitle: "Abre un nuevo espacio de texto y organiza mejor el flujo del equipo.",
        title: "Nuevo canal"
      };
    case "category":
      return {
        heroIcon: "channel",
        subtitle: "Crea una categoria para ordenar mejor tus canales de texto y voz.",
        title: "Nueva categoria"
      };
    case "dm_group":
      return {
        heroIcon: "friends",
        subtitle: "Crea un grupo privado dentro de mensajes directos usando solo gente de tu lista.",
        title: "Nuevo grupo"
      };
    default:
      return {
        heroIcon: "mail",
        subtitle: "Abre una conversacion directa sin salir del workspace.",
        title: "Nuevo mensaje directo"
      };
  }
}

export function Dialog({ dialog, guildChannels = [], onClose, onSubmit, users }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedTemplateId, setSelectedTemplateId] = useState("friends");
  const [kind, setKind] = useState(dialog.initialKind || "text");
  const [parentId, setParentId] = useState(dialog.initialParentId || "");
  const [topic, setTopic] = useState("");
  const [recipientId, setRecipientId] = useState(
    users.find((user) => user.id !== dialog.currentUserId)?.id || ""
  );
  const [recipientIds, setRecipientIds] = useState([]);
  const [friendQuery, setFriendQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const meta = useMemo(() => getDialogMeta(dialog.type), [dialog.type]);
  const filteredFriendUsers = useMemo(() => {
    const normalizedQuery = friendQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return users;
    }

    return users.filter((user) =>
      `${user.display_name || ""} ${user.username || ""} ${user.custom_status || ""}`
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [friendQuery, users]);
  const categoryOptions = useMemo(
    () => guildChannels.filter((channel) => channel.is_category),
    [guildChannels]
  );

  useEffect(() => {
    setName("");
    setDescription("");
    setSelectedTemplateId("friends");
    setKind(dialog.initialKind || "text");
    setParentId(dialog.initialParentId || "");
    setTopic("");
    setError("");
    setBusy(false);
    setRecipientId(users.find((user) => user.id !== dialog.currentUserId)?.id || "");
    setRecipientIds([]);
    setFriendQuery("");
  }, [dialog, users]);

  function toggleRecipient(userId) {
    setRecipientIds((previous) => {
      if (previous.includes(userId)) {
        setError("");
        return previous.filter((item) => item !== userId);
      }

      if (previous.length >= GROUP_DM_MAX_RECIPIENTS) {
        setError(
          `Un grupo directo admite maximo ${GROUP_DM_MAX_PARTICIPANTS} personas contando contigo.`
        );
        return previous;
      }

      setError("");
      return [...previous, userId];
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (dialog.type === "dm_group" && recipientIds.length < 2) {
        throw new Error("Selecciona al menos dos amigos para crear el grupo.");
      }

      if (dialog.type === "dm_group" && recipientIds.length > GROUP_DM_MAX_RECIPIENTS) {
        throw new Error(
          `Un grupo directo admite maximo ${GROUP_DM_MAX_PARTICIPANTS} personas contando contigo.`
        );
      }

      await onSubmit({
        description,
        kind,
        name,
        parentId: parentId || null,
        recipientId,
        recipientIds,
        templateId: selectedTemplateId,
        topic
      });
    } catch (submitError) {
      setError(submitError.message);
      setBusy(false);
    }
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-card" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <button
            aria-label="Cerrar modal"
            className="ghost-button icon-only dialog-close-button"
            onClick={onClose}
            title="Cerrar"
            type="button"
          >
            <Icon name="close" />
          </button>

          <div className="dialog-hero-icon">
            <Icon name={meta.heroIcon} size={28} />
          </div>

          <h3>{meta.title}</h3>
          <p>{meta.subtitle}</p>
        </div>

        {dialog.type === "guild" ? (
          <div className="dialog-template-list">
            {GUILD_TEMPLATES.map((template) => (
              <button
                className={`dialog-template-card ${
                  selectedTemplateId === template.id ? "selected" : ""
                }`.trim()}
                key={template.id}
                onClick={() => {
                  setSelectedTemplateId(template.id);
                  setName(buildTemplateName(template));
                  setDescription(template.description);
                }}
                type="button"
              >
                <span className="dialog-template-icon">
                  <Icon name={template.icon} />
                </span>
                <div>
                  <strong>{template.label}</strong>
                  <span>{template.description}</span>
                </div>
                <Icon name="arrowRight" />
              </button>
            ))}
          </div>
        ) : null}

        <form className="dialog-form" onSubmit={handleSubmit}>
          {dialog.type === "guild" || dialog.type === "channel" || dialog.type === "category" ? (
            <>
              <label className="dialog-field">
                <span className="dialog-field-label">
                  <Icon name={dialog.type === "guild" ? "server" : "channel"} />
                  <em>
                    {dialog.type === "guild"
                      ? "Nombre del servidor"
                      : dialog.type === "category"
                        ? "Nombre de la categoria"
                        : "Nombre del canal"}
                  </em>
                </span>
                <input
                  autoFocus
                  maxLength={40}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={
                    dialog.type === "guild"
                      ? "Umbra Core"
                      : dialog.type === "category"
                        ? "Nueva categoria"
                        : "general"
                  }
                  required
                  value={name}
                />
              </label>

              {dialog.type === "guild" ? (
                <label className="dialog-field">
                  <span className="dialog-field-label">
                    <Icon name="sparkles" />
                    <em>Descripcion</em>
                  </span>
                  <textarea
                    maxLength={180}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Que energia o funcion tendra este servidor"
                    rows={3}
                    value={description}
                  />
                </label>
              ) : dialog.type === "channel" ? (
                <>
                  <div className="dialog-field">
                    <span className="dialog-field-label">
                      <Icon name="channel" />
                      <em>Tipo de canal</em>
                    </span>
                    <div className="dialog-segmented-control">
                      <button
                        className={kind === "text" ? "active" : ""}
                        onClick={() => setKind("text")}
                        type="button"
                      >
                        <Icon name="channel" size={16} />
                        <span>Texto</span>
                      </button>
                      <button
                        className={kind === "voice" ? "active" : ""}
                        onClick={() => setKind("voice")}
                        type="button"
                      >
                        <Icon name="headphones" size={16} />
                        <span>Voz</span>
                      </button>
                    </div>
                  </div>

                  <label className="dialog-field">
                    <span className="dialog-field-label">
                      <Icon name="threads" />
                      <em>Categoria</em>
                    </span>
                    <select onChange={(event) => setParentId(event.target.value)} value={parentId}>
                      <option value="">Sin categoria</option>
                      {categoryOptions.map((category) => (
                        <option key={category.id} value={category.id}>
                          {category.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="dialog-field">
                    <span className="dialog-field-label">
                      <Icon name={kind === "voice" ? "headphones" : "threads"} />
                      <em>{kind === "voice" ? "Descripcion del canal" : "Tema del canal"}</em>
                    </span>
                    <textarea
                      maxLength={180}
                      onChange={(event) => setTopic(event.target.value)}
                      placeholder={
                        kind === "voice"
                          ? "Que ocurrira dentro de este canal de voz"
                          : "Contexto rapido para el equipo"
                      }
                      rows={3}
                      value={topic}
                    />
                  </label>
                </>
              ) : (
                <label className="dialog-field">
                  <span className="dialog-field-label">
                    <Icon name="threads" />
                    <em>Descripcion</em>
                  </span>
                  <textarea
                    maxLength={180}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Describe el tipo de canales que viviran aqui"
                    rows={3}
                    value={description}
                  />
                </label>
              )}
            </>
          ) : dialog.type === "dm_group" ? (
            <>
              <label className="dialog-field">
                <span className="dialog-field-label">
                  <Icon name="friends" />
                  <em>Nombre del grupo</em>
                </span>
                <input
                  autoFocus
                  maxLength={40}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Grupo de madrugada"
                  value={name}
                />
              </label>

              <div className="dialog-field">
                <span className="dialog-field-label">
                  <Icon name="community" />
                  <em>Sombras disponibles</em>
                </span>
                {users.length ? (
                  <>
                    <div className="dialog-field-helper">
                      Selecciona entre 2 y {GROUP_DM_MAX_RECIPIENTS} sombras. Si no nombras el grupo,
                      Umbra mostrara a los integrantes y solo tendra un chat de texto compartido.
                    </div>
                    <label className="dialog-friend-search">
                      <Icon name="search" size={16} />
                      <input
                        onChange={(event) => setFriendQuery(event.target.value)}
                        placeholder="Buscar sombras"
                        type="text"
                        value={friendQuery}
                      />
                    </label>
                    <div className="dialog-selected-count">
                      {recipientIds.length + 1}/{GROUP_DM_MAX_PARTICIPANTS} personas
                    </div>
                    <div className="dialog-friend-list discord-like">
                      {filteredFriendUsers.map((user) => {
                        const selected = recipientIds.includes(user.id);
                        const atCapacity =
                          !selected && recipientIds.length >= GROUP_DM_MAX_RECIPIENTS;
                        return (
                          <button
                            className={`dialog-friend-option ${selected ? "selected" : ""} ${
                              atCapacity ? "disabled" : ""
                            }`.trim()}
                            disabled={atCapacity}
                            key={user.id}
                            onClick={() => toggleRecipient(user.id)}
                            type="button"
                          >
                            <span className="dialog-friend-check" aria-hidden="true">
                              {selected ? <Icon name="check" size={14} /> : null}
                            </span>
                            <span className="dialog-friend-copy">
                              <strong>{user.display_name || user.username}</strong>
                              <small>
                                @{user.username}
                                {user.custom_status ? ` - ${user.custom_status}` : ""}
                              </small>
                            </span>
                          </button>
                        );
                      })}

                      {!filteredFriendUsers.length ? (
                        <div className="dialog-friends-empty">
                          <strong>No encontramos sombras</strong>
                          <span>Prueba otra busqueda dentro de tu lista de amigos.</span>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="dialog-friends-empty prominent">
                    <strong>No tienes sombras</strong>
                    <span>
                      Cuando tengas amistades reales en Umbra, aqui podras reunirlas en un grupo DM
                      como en Discord.
                    </span>
                  </div>
                )}
              </div>
            </>
          ) : (
            <label className="dialog-field">
              <span className="dialog-field-label">
                <Icon name="friends" />
                <em>Persona</em>
              </span>
              <select onChange={(event) => setRecipientId(event.target.value)} value={recipientId}>
                {users
                  .filter((user) => user.id !== dialog.currentUserId)
                  .map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.username}
                    </option>
                  ))}
              </select>
            </label>
          )}

          {error ? <p className="form-error">{error}</p> : null}

          <div className="dialog-actions">
            <button className="ghost-button" onClick={onClose} type="button">
              <Icon name="close" />
              <span>Cancelar</span>
            </button>
            <button
              className="primary-button"
              disabled={busy || (dialog.type === "dm_group" && users.length === 0)}
              type="submit"
            >
              <Icon
                name={dialog.type === "dm_group" ? "friends" : dialog.type === "dm" ? "mail" : "add"}
              />
              <span>{busy ? "Guardando..." : "Confirmar"}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
