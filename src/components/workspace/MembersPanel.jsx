import React from "react";

import { Avatar } from "../Avatar.jsx";
import { DirectMessageSidebar } from "./DirectMessagePanels.jsx";

export function MembersPanel({
  activeChannel,
  activeNowUsers,
  directMessageProfile,
  activeSelectionKind,
  memberGroups,
  memberList,
  onAcceptFriendRequest,
  onAddFriend,
  onBlockUser,
  onCancelFriendRequest,
  onCopyProfileId,
  onOpenDm,
  onOpenFullProfile,
  onOpenProfileCard,
  onRemoveFriend,
  onReportUser,
  onShowNotice,
  workspace
}) {
  const currentUser = workspace?.current_user || null;

  function getMemberAvatar(member) {
    if (!member) {
      return "";
    }

    if (member.avatar_url) {
      return member.avatar_url;
    }

    if (currentUser?.id === member.id) {
      return currentUser.avatar_url || "";
    }

    return "";
  }

  if (activeSelectionKind === "dm" && directMessageProfile && activeChannel?.type === "dm") {
    return (
      <aside className="members-panel">
        <DirectMessageSidebar
          onAcceptFriendRequest={onAcceptFriendRequest}
          onAddFriend={onAddFriend}
          onBlockUser={onBlockUser}
          onCancelFriendRequest={onCancelFriendRequest}
          onCopyId={onCopyProfileId}
          onOpenDm={onOpenDm}
          onOpenFullProfile={onOpenFullProfile}
          onOpenProfileCard={onOpenProfileCard}
          onRemoveFriend={onRemoveFriend}
          onReportUser={onReportUser}
          onShowNotice={onShowNotice}
          profile={directMessageProfile}
        />
      </aside>
    );
  }

  return (
    <aside className="members-panel">
      {activeSelectionKind === "home" ? (
        <>
          <div className="members-header">
            <p className="eyebrow">Activo ahora</p>
            <h3>{activeNowUsers.length ? "Usuarios conectados" : "Sin actividad"}</h3>
          </div>

          <div className="activity-panel">
            {activeNowUsers.map((user) => (
              <button
                className="activity-card"
                key={user.id}
                onClick={(event) => onOpenProfileCard(event, user)}
                type="button"
              >
                <div className="activity-card-header">
                  <Avatar
                    hue={user.avatar_hue}
                    label={user.username}
                    priority
                    size={42}
                    src={getMemberAvatar(user)}
                    status={user.status}
                  />
                  <div className="activity-card-copy">
                    <strong>{user.username}</strong>
                    <span>{user.custom_status || "Online"}</span>
                  </div>
                </div>
                <div className="activity-card-body">
                  <p>{user.bio || "Sin bio visible."}</p>
                </div>
              </button>
            ))}

            {!activeNowUsers.length ? (
              <div className="guide-note">
                <h4>Sin actividad destacada</h4>
                <p>Cuando tus usuarios esten online, aqui aparecera su presencia reciente.</p>
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="members-header">
            <p className="eyebrow">
              {activeSelectionKind === "guild" ? "Miembros" : "Participantes"}
            </p>
            <h3>
              {activeSelectionKind === "guild"
                ? `${memberList.length} personas`
                : `${memberList.length} en el chat`}
            </h3>
          </div>

          <div className="member-list">
            {memberGroups.map((group) => (
              <section className="member-group" key={group.id}>
                <p className="member-group-label">{group.label}</p>
                {group.members.map((member) => (
                  <button
                    className="member-row member-row-button"
                    key={member.id}
                    onClick={(event) => onOpenProfileCard(event, member)}
                    type="button"
                  >
                    <Avatar
                      hue={member.avatar_hue}
                      label={member.display_name || member.username}
                      priority
                      size={38}
                      src={getMemberAvatar(member)}
                      status={member.status}
                    />
                    <div className="member-copy">
                      <strong style={member.role_color ? { color: member.role_color } : undefined}>
                        {member.display_name || member.username}
                      </strong>
                      <span>{member.custom_status || member.status}</span>
                    </div>
                  </button>
                ))}
              </section>
            ))}
          </div>

          <div className="guide-note">
            <h4>Umbra desktop + cloud</h4>
            <p>
              Shell mas cercana a Discord, composer mas rico, menus laterales y una base lista
              para seguir conectando features reales.
            </p>
          </div>
        </>
      )}
    </aside>
  );
}
