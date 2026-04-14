import React from "react";

import { Icon } from "../../Icon.jsx";

export function WorkspaceChannelList({
  activeSelection,
  canManageStructure,
  categoryEntries,
  channelDropHint,
  collapsedSectionIds,
  handleCategoryDragOver,
  handleCategoryDrop,
  handleRootSectionDragOver,
  handleRootSectionDrop,
  onOpenDialog,
  renderTextChannelRow,
  renderVoiceChannel,
  toggleSection,
  uncategorizedTextChannels,
  uncategorizedVoiceChannels
}) {
  return (
    <div className="channel-list">
      {categoryEntries.map((entry) => (
        <div className="channel-category-group" key={entry.id}>
          <div
            className={`panel-section-label category ${
              channelDropHint?.type === "category" && channelDropHint.targetId === entry.category.id
                ? "drop-target"
                : ""
            }`.trim()}
            onDragOver={(event) => handleCategoryDragOver(event, entry.category.id)}
            onDrop={(event) => handleCategoryDrop(event, entry.category.id, entry.channels)}
          >
            <button
              aria-expanded={!collapsedSectionIds[entry.category.id]}
              className="category-toggle"
              onClick={() => toggleSection(entry.category.id)}
              type="button"
            >
              <Icon
                name={collapsedSectionIds[entry.category.id] ? "arrowRight" : "chevronDown"}
                size={14}
              />
              <span>{entry.category.name}</span>
            </button>
            {canManageStructure ? (
              <button
                className="ghost-button icon-only category-action"
                onClick={() =>
                  onOpenDialog("channel", {
                    initialKind: "text",
                    initialParentId: entry.category.id
                  })
                }
                type="button"
              >
                <Icon name="add" />
              </button>
            ) : null}
          </div>
          {(() => {
            const isCollapsed = Boolean(collapsedSectionIds[entry.category.id]);
            const activeNestedChannel =
              entry.channels.find((channel) => channel.id === activeSelection.channelId) || null;
            const visibleChannels = isCollapsed
              ? activeNestedChannel
                ? [activeNestedChannel]
                : []
              : entry.channels;

            if (!visibleChannels.length) {
              return (
                <div className="category-empty">
                  {isCollapsed ? "Categoria vacia" : "Sin canales por ahora."}
                </div>
              );
            }

            return visibleChannels.map((channel) =>
              channel.is_voice
                ? renderVoiceChannel(channel, { nested: true })
                : renderTextChannelRow(channel, { nested: true })
            );
          })()}
        </div>
      ))}

      {uncategorizedTextChannels.length ? (
        <>
          <div
            className={`panel-section-label ${
              channelDropHint?.type === "root" && channelDropHint.targetId === "__uncategorized_text__"
                ? "drop-target"
                : ""
            }`.trim()}
            onDragOver={(event) => handleRootSectionDragOver(event, "__uncategorized_text__")}
            onDrop={(event) => handleRootSectionDrop(event, "text")}
          >
            <button
              aria-expanded={!collapsedSectionIds.__uncategorized_text__}
              className="category-toggle"
              onClick={() => toggleSection("__uncategorized_text__")}
              type="button"
            >
              <Icon
                name={collapsedSectionIds.__uncategorized_text__ ? "arrowRight" : "chevronDown"}
                size={14}
              />
              <span>Canales de texto</span>
            </button>
            {canManageStructure ? (
              <button
                className="ghost-button icon-only category-action"
                onClick={() => onOpenDialog("channel", { initialKind: "text" })}
                type="button"
              >
                <Icon name="add" />
              </button>
            ) : null}
          </div>
          {(() => {
            const isCollapsed = Boolean(collapsedSectionIds.__uncategorized_text__);
            const activeTextChannel =
              uncategorizedTextChannels.find((channel) => channel.id === activeSelection.channelId) || null;
            const visibleChannels = isCollapsed
              ? activeTextChannel
                ? [activeTextChannel]
                : []
              : uncategorizedTextChannels;

            return visibleChannels.map((channel) => renderTextChannelRow(channel));
          })()}
        </>
      ) : null}

      {uncategorizedVoiceChannels.length ? (
        <>
          <div
            className={`panel-section-label voice ${
              channelDropHint?.type === "root" && channelDropHint.targetId === "__uncategorized_voice__"
                ? "drop-target"
                : ""
            }`.trim()}
            onDragOver={(event) => handleRootSectionDragOver(event, "__uncategorized_voice__")}
            onDrop={(event) => handleRootSectionDrop(event, "voice")}
          >
            <button
              aria-expanded={!collapsedSectionIds.__uncategorized_voice__}
              className="category-toggle"
              onClick={() => toggleSection("__uncategorized_voice__")}
              type="button"
            >
              <Icon
                name={collapsedSectionIds.__uncategorized_voice__ ? "arrowRight" : "chevronDown"}
                size={14}
              />
              <span>Canales de voz</span>
            </button>
            {canManageStructure ? (
              <button
                className="ghost-button icon-only category-action"
                onClick={() => onOpenDialog("channel", { initialKind: "voice" })}
                type="button"
              >
                <Icon name="add" />
              </button>
            ) : null}
          </div>
          {(() => {
            const isCollapsed = Boolean(collapsedSectionIds.__uncategorized_voice__);
            const activeVoiceChannel =
              uncategorizedVoiceChannels.find((channel) => channel.id === activeSelection.channelId) || null;
            const visibleChannels = isCollapsed
              ? activeVoiceChannel
                ? [activeVoiceChannel]
                : []
              : uncategorizedVoiceChannels;

            return visibleChannels.map((channel) => renderVoiceChannel(channel));
          })()}
        </>
      ) : null}
    </div>
  );
}
