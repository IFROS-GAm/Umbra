import React, { useEffect, useMemo, useRef, useState } from "react";

import { Avatar } from "../Avatar.jsx";
import { Icon } from "../Icon.jsx";

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

function describeForwardedMessagePreview(message) {
  const content = String(message?.content || "").trim();
  if (content) {
    return content;
  }

  if (message?.sticker?.name) {
    return `Sticker: ${message.sticker.name}`;
  }

  const attachmentCount = Array.isArray(message?.attachments) ? message.attachments.length : 0;
  if (attachmentCount > 0) {
    return attachmentCount === 1 ? "1 adjunto" : `${attachmentCount} adjuntos`;
  }

  return "Mensaje sin texto.";
}

function getDialogMeta(type) {
  switch (type) {
    case "forward":
      return {
        heroIcon: "forward",
        subtitle: "Elige a quien quieres reenviar este mensaje sin salir del workspace.",
        title: "Reenviar mensaje"
      };
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
    case "dm_group_edit":
      return {
        heroIcon: "edit",
        subtitle: "Cambia el nombre y la foto del grupo sin salir de la conversacion.",
        title: "Editar grupo"
      };
    case "dm_group_invite":
      return {
        heroIcon: "userAdd",
        subtitle: "Suma amistades nuevas al grupo manteniendo el limite de 10 personas.",
        title: "Invitar al grupo"
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
  const isGroupCreateDialog = dialog.type === "dm_group";
  const isGroupEditDialog = dialog.type === "dm_group_edit";
  const isGroupInviteDialog = dialog.type === "dm_group_invite";
  const isGroupAvatarDialog = isGroupCreateDialog || isGroupEditDialog;
  const activeGroup = dialog.channel || null;
  const canChangeGroupManageMode =
    isGroupCreateDialog ||
    Boolean(
      activeGroup?.can_change_group_permissions ||
        String(activeGroup?.created_by || "") === String(dialog.currentUserId || "")
    );
  const activeGroupParticipantIds = useMemo(
    () => new Set((activeGroup?.participants || []).map((participant) => participant.id).filter(Boolean)),
    [activeGroup]
  );
  const groupRecipientLimit = isGroupInviteDialog
    ? Math.max(0, GROUP_DM_MAX_PARTICIPANTS - Number(activeGroup?.participants?.length || 0))
    : GROUP_DM_MAX_RECIPIENTS;
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
  const [groupIconFile, setGroupIconFile] = useState(null);
  const [groupIconPreview, setGroupIconPreview] = useState("");
  const [groupManageMode, setGroupManageMode] = useState("owner");
  const [clearGroupIconRequested, setClearGroupIconRequested] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const groupIconInputRef = useRef(null);
  const meta = useMemo(() => getDialogMeta(dialog.type), [dialog.type]);
  const eligibleFriendUsers = useMemo(() => {
    if (!isGroupInviteDialog) {
      return users;
    }

    return users.filter((user) => !activeGroupParticipantIds.has(user.id));
  }, [activeGroupParticipantIds, isGroupInviteDialog, users]);
  const filteredFriendUsers = useMemo(() => {
    const normalizedQuery = friendQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return eligibleFriendUsers;
    }

    return eligibleFriendUsers.filter((user) =>
      `${user.display_name || ""} ${user.username || ""} ${user.custom_status || ""}`
        .toLowerCase()
        .includes(normalizedQuery)
    );
  }, [eligibleFriendUsers, friendQuery]);
  const categoryOptions = useMemo(
    () => guildChannels.filter((channel) => channel.is_category),
    [guildChannels]
  );

  function releasePreviewUrl(candidate) {
    if (String(candidate || "").startsWith("blob:")) {
      URL.revokeObjectURL(candidate);
    }
  }

  useEffect(() => {
    setName(isGroupEditDialog ? String(activeGroup?.name || "") : "");
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
    setGroupIconFile(null);
    setGroupManageMode(
      isGroupEditDialog ? String(activeGroup?.group_manage_mode || "owner") : "owner"
    );
    setClearGroupIconRequested(false);
    setGroupIconPreview((previous) => {
      releasePreviewUrl(previous);
      return isGroupEditDialog ? String(activeGroup?.icon_url || "") : "";
    });
    if (groupIconInputRef.current) {
      groupIconInputRef.current.value = "";
    }
  }, [activeGroup?.icon_url, activeGroup?.name, dialog, isGroupEditDialog, users]);

  useEffect(
    () => () => {
      releasePreviewUrl(groupIconPreview);
    },
    [groupIconPreview]
  );

  function toggleRecipient(userId) {
    setRecipientIds((previous) => {
      if (previous.includes(userId)) {
        setError("");
        return previous.filter((item) => item !== userId);
      }

      if (previous.length >= groupRecipientLimit) {
        setError(
          `Un grupo directo admite maximo ${GROUP_DM_MAX_PARTICIPANTS} personas contando contigo.`
        );
        return previous;
      }

      setError("");
      return [...previous, userId];
    });
  }

  function clearGroupIcon() {
    setGroupIconFile(null);
    setClearGroupIconRequested(Boolean(activeGroup?.icon_url));
    setGroupIconPreview((previous) => {
      releasePreviewUrl(previous);
      return "";
    });

    if (groupIconInputRef.current) {
      groupIconInputRef.current.value = "";
    }
  }

  function handleGroupIconSelection(event) {
    const nextFile = event.target.files?.[0] || null;
    if (!nextFile) {
      return;
    }

    if (!String(nextFile.type || "").startsWith("image/")) {
      setError("Selecciona una imagen valida para la foto del grupo.");
      if (groupIconInputRef.current) {
        groupIconInputRef.current.value = "";
      }
      return;
    }

    setError("");
    setClearGroupIconRequested(false);
    setGroupIconFile(nextFile);
    setGroupIconPreview((previous) => {
      releasePreviewUrl(previous);
      return URL.createObjectURL(nextFile);
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (isGroupCreateDialog && recipientIds.length < 2) {
        throw new Error("Selecciona al menos dos amigos para crear el grupo.");
      }

      if (isGroupCreateDialog && recipientIds.length > GROUP_DM_MAX_RECIPIENTS) {
        throw new Error(
          `Un grupo directo admite maximo ${GROUP_DM_MAX_PARTICIPANTS} personas contando contigo.`
        );
      }

      if (isGroupInviteDialog && recipientIds.length < 1) {
        throw new Error("Selecciona al menos una amistad para invitar al grupo.");
      }

      if (isGroupInviteDialog && recipientIds.length > groupRecipientLimit) {
        throw new Error(
          `Este grupo solo admite ${GROUP_DM_MAX_PARTICIPANTS} personas contando contigo.`
        );
      }

      await onSubmit({
        channelId: activeGroup?.id || null,
        clearIcon: clearGroupIconRequested,
        description,
        iconFile: groupIconFile,
        kind,
        manageMode: groupManageMode,
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

          {isGroupAvatarDialog ? (
            <div className="dialog-group-avatar-editor">
              <input
                accept="image/*"
                hidden
                onChange={handleGroupIconSelection}
                onClick={(event) => {
                  event.currentTarget.value = "";
                }}
                ref={groupIconInputRef}
                type="file"
              />
              <button
                className="dialog-group-avatar-trigger"
                onClick={() => groupIconInputRef.current?.click()}
                type="button"
              >
                <Avatar
                  hue={248}
                  label={name || "Grupo"}
                  size={72}
                  src={groupIconPreview}
                />
              </button>
              <div className="dialog-group-avatar-actions">
                <button
                  className="ghost-button"
                  onClick={() => groupIconInputRef.current?.click()}
                  type="button"
                >
                  <Icon name="upload" />
                  <span>{groupIconPreview ? "Cambiar foto" : "Subir foto"}</span>
                </button>
                {groupIconPreview ? (
                  <button className="ghost-button" onClick={clearGroupIcon} type="button">
                    <Icon name="close" />
                    <span>Quitar</span>
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="dialog-hero-icon">
              <Icon name={meta.heroIcon} size={28} />
            </div>
          )}

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
          ) : isGroupCreateDialog || isGroupEditDialog || isGroupInviteDialog ? (
            <>
              {isGroupCreateDialog || isGroupEditDialog ? (
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
              ) : null}

              {isGroupCreateDialog || isGroupEditDialog ? (
                <div className="dialog-field">
                  <span className="dialog-field-label">
                    <Icon name="settings" />
                    <em>Permisos del grupo</em>
                  </span>
                  {canChangeGroupManageMode ? (
                    <>
                      <div className="dialog-field-helper">
                        Decide si solo el creador puede editar el grupo e invitar personas, o si
                        cualquier integrante tambien puede hacerlo.
                      </div>
                      <div className="dialog-segmented-control">
                        <button
                          className={groupManageMode === "owner" ? "active" : ""}
                          onClick={() => setGroupManageMode("owner")}
                          type="button"
                        >
                          <Icon name="profile" size={16} />
                          <span>Solo el creador</span>
                        </button>
                        <button
                          className={groupManageMode === "members" ? "active" : ""}
                          onClick={() => setGroupManageMode("members")}
                          type="button"
                        >
                          <Icon name="community" size={16} />
                          <span>Todos</span>
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="dialog-field-helper">
                      {groupManageMode === "members"
                        ? "Ahora mismo todos los integrantes pueden editar el grupo e invitar personas."
                        : "Ahora mismo solo el creador puede editar el grupo e invitar personas."}
                    </div>
                  )}
                </div>
              ) : null}

              {isGroupEditDialog ? (
                <div className="dialog-field-helper">
                  Cambia el nombre o la foto. Si dejas el nombre vacio, Umbra volvera a mostrar a
                  los integrantes como fallback.
                </div>
              ) : null}

              {isGroupCreateDialog || isGroupInviteDialog ? (
                <div className="dialog-field">
                  <span className="dialog-field-label">
                    <Icon name="community" />
                    <em>Sombras disponibles</em>
                  </span>
                  {eligibleFriendUsers.length ? (
                    <>
                      <div className="dialog-field-helper">
                        {isGroupCreateDialog
                          ? `Selecciona entre 2 y ${GROUP_DM_MAX_RECIPIENTS} sombras. Si no nombras el grupo, Umbra mostrara a los integrantes y solo tendra un chat de texto compartido.`
                          : `Puedes sumar hasta ${groupRecipientLimit} personas mas a este grupo.`}
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
                        {isGroupCreateDialog
                          ? `${recipientIds.length + 1}/${GROUP_DM_MAX_PARTICIPANTS} personas`
                          : `${recipientIds.length} seleccionadas • ${activeGroup?.participants?.length || 0}/${GROUP_DM_MAX_PARTICIPANTS} ya dentro`}
                      </div>
                      <div className="dialog-friend-list discord-like">
                        {filteredFriendUsers.map((user) => {
                          const selected = recipientIds.includes(user.id);
                          const atCapacity = !selected && recipientIds.length >= groupRecipientLimit;
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
                            <span>
                              {isGroupInviteDialog
                                ? "Prueba otra busqueda o revisa si ya estan dentro del grupo."
                                : "Prueba otra busqueda dentro de tu lista de amigos."}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </>
                  ) : (
                    <div className="dialog-friends-empty prominent">
                      <strong>
                        {isGroupInviteDialog ? "No quedan sombras para invitar" : "No tienes sombras"}
                      </strong>
                      <span>
                        {isGroupInviteDialog
                          ? groupRecipientLimit <= 0
                            ? "Este grupo ya llego al limite de 10 personas."
                            : "Todas tus amistades disponibles ya forman parte del grupo."
                          : "Cuando tengas amistades reales en Umbra, aqui podras reunirlas en un grupo DM como en Discord."}
                      </span>
                    </div>
                  )}
                </div>
              ) : null}
            </>
          ) : (
            <>
              {dialog.type === "forward" && dialog.forwardMessage ? (
                <div className="dialog-field">
                  <span className="dialog-field-label">
                    <Icon name="mail" />
                    <em>Vista previa</em>
                  </span>
                  <div className="dialog-forward-preview">
                    <strong>
                      {dialog.forwardMessage.display_name ||
                        dialog.forwardMessage.author?.display_name ||
                        dialog.forwardMessage.author?.username ||
                        "Umbra"}
                    </strong>
                    <span>{describeForwardedMessagePreview(dialog.forwardMessage)}</span>
                  </div>
                </div>
              ) : null}

              <label className="dialog-field">
                <span className="dialog-field-label">
                  <Icon name="friends" />
                  <em>{dialog.type === "forward" ? "Destino" : "Persona"}</em>
                </span>
                <select onChange={(event) => setRecipientId(event.target.value)} value={recipientId}>
                  {users
                    .filter((user) => user.id !== dialog.currentUserId)
                    .map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.display_name || user.username}
                      </option>
                    ))}
                </select>
              </label>
            </>
          )}

          {error ? <p className="form-error">{error}</p> : null}

          <div className="dialog-actions">
            <button className="ghost-button" onClick={onClose} type="button">
              <Icon name="close" />
              <span>Cancelar</span>
            </button>
            <button
              className="primary-button"
              disabled={
                busy ||
                ((isGroupCreateDialog || isGroupInviteDialog) && eligibleFriendUsers.length === 0)
              }
              type="submit"
            >
              <Icon
                name={
                  isGroupCreateDialog
                    ? "friends"
                    : isGroupEditDialog
                      ? "save"
                      : isGroupInviteDialog
                        ? "userAdd"
                    : dialog.type === "forward"
                      ? "forward"
                      : dialog.type === "dm"
                        ? "mail"
                        : "add"
                }
              />
              <span>
                {busy
                  ? "Guardando..."
                  : isGroupEditDialog
                    ? "Guardar cambios"
                    : isGroupInviteDialog
                      ? "Invitar"
                  : dialog.type === "forward"
                    ? "Reenviar"
                    : isGroupCreateDialog
                      ? "Crear grupo"
                      : "Confirmar"}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
