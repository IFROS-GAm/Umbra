import React, { useEffect, useState } from "react";

export function Dialog({ dialog, onClose, onSubmit, users }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [topic, setTopic] = useState("");
  const [recipientId, setRecipientId] = useState(
    users.find((user) => user.id !== dialog.currentUserId)?.id || ""
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName("");
    setDescription("");
    setTopic("");
    setError("");
    setBusy(false);
    setRecipientId(users.find((user) => user.id !== dialog.currentUserId)?.id || "");
  }, [dialog, users]);

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");

    try {
      await onSubmit({
        description,
        name,
        recipientId,
        topic
      });
    } catch (submitError) {
      setError(submitError.message);
      setBusy(false);
    }
  }

  const title =
    dialog.type === "guild"
      ? "Crear servidor"
      : dialog.type === "channel"
        ? "Crear canal"
        : "Nuevo DM";

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div className="dialog-card" onClick={(event) => event.stopPropagation()}>
        <div className="dialog-header">
          <h3>{title}</h3>
          <button className="ghost-button" onClick={onClose} type="button">
            Cerrar
          </button>
        </div>

        <form className="dialog-form" onSubmit={handleSubmit}>
          {dialog.type !== "dm" ? (
            <>
              <label>
                <span>{dialog.type === "guild" ? "Nombre del servidor" : "Nombre del canal"}</span>
                <input
                  autoFocus
                  onChange={(event) => setName(event.target.value)}
                  placeholder={dialog.type === "guild" ? "Umbra Ops" : "announcements"}
                  required
                  value={name}
                />
              </label>

              {dialog.type === "guild" ? (
                <label>
                  <span>Descripcion</span>
                  <textarea
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Que objetivo tendra este servidor"
                    rows={3}
                    value={description}
                  />
                </label>
              ) : (
                <label>
                  <span>Tema del canal</span>
                  <textarea
                    onChange={(event) => setTopic(event.target.value)}
                    placeholder="Contexto rapido para el equipo"
                    rows={3}
                    value={topic}
                  />
                </label>
              )}
            </>
          ) : (
            <label>
              <span>Persona</span>
              <select
                onChange={(event) => setRecipientId(event.target.value)}
                value={recipientId}
              >
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

          <button className="primary-button" disabled={busy} type="submit">
            {busy ? "Guardando..." : "Confirmar"}
          </button>
        </form>
      </div>
    </div>
  );
}
