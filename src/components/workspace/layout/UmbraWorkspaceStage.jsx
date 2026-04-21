import React, { Suspense } from "react";

import { ChatHeader } from "../ChatHeader.jsx";
import { MembersPanel } from "../MembersPanel.jsx";
import { WorkspacePanelFallback } from "../WorkspacePanelFallback.jsx";
import { resolveDirectChannelVisual } from "../shared/workspaceHelpers.js";
import { DirectCallPanel } from "../voice/DirectCallPanel.jsx";

export function UmbraWorkspaceStage({
  FriendsHome,
  MessageRequestsHome,
  MessageStage,
  VoiceRoomStage,
  activeChannel,
  activeGuild,
  activeNowUsers,
  activeSelection,
  attachmentInputRef,
  availableUsersById,
  blockedUsers,
  cameraMenuNode,
  cameraStatus,
  chatHeaderPanelNode,
  composer,
  composerAttachments,
  composerMenuOpen,
  composerPicker,
  composerRef,
  canInvitePeople,
  currentUser,
  directMessageProfile,
  directCallLayoutMode,
  editingMessage,
  effectiveMembersPanelVisible,
  friendUsers,
  guildStickers,
  handleAcceptFriendRequest,
  handleAttachmentSelection,
  handleBlockUser,
  handleCancelFriendRequest,
  handleComposerChange,
  handleComposerShortcut,
  handleDeleteMessage,
  handleEditMessage,
  handleJoinDirectCall,
  handleJumpToLatest,
  handleOpenDmFromCard,
  handleOpenDialog,
  handleOpenInviteModal,
  handleOpenFullProfile,
  handleOpenParticipantMenu,
  handleOpenProfileCard,
  handleCopyProfileId,
  handlePickerInsert,
  handleReaction,
  handleRemoveFriend,
  handleReportUser,
  handleRetryMessages,
  handleScroll,
  handleSelectGuildChannel,
  handleSendFriendRequest,
  handleForwardMessage,
  handleStartMembersResize,
  handleStartReply,
  handleStickerSelect,
  handleSubmitMessage,
  handleTogglePinnedMessage,
  handleToggleScreenShare,
  handleToggleVoiceMenu,
  handleToggleVoiceState,
  handleVoiceLeave,
  headerActionsRef,
  headerCopy,
  headerPanel,
  headerSearchPlaceholder,
  inputMenuNode,
  isDirectCallActive,
  isDirectConversation,
  isGroupDirectConversation,
  isResizingMembersPanel,
  isSingleDirectMessagePanel,
  isVoiceChannel,
  joinedVoiceChannelId,
  language,
  listRef,
  loadingHistoryMessages,
  loadingMessages,
  memberGroups,
  memberList,
  membersPanelVisible,
  messageLoadError,
  messageMenuFor,
  messages,
  onAcceptInviteFromMessage,
  reactionPickerFor,
  removeComposerAttachment,
  replyMentionEnabled,
  replyTarget,
  screenShareQualityLabel,
  setDirectCallLayoutMode,
  setComposer,
  setComposerAttachments,
  setComposerMenuOpen,
  setComposerPicker,
  setEditingMessage,
  setMembersPanelVisible,
  setMessageMenuFor,
  setReactionPickerFor,
  setReplyMentionEnabled,
  setReplyTarget,
  shareMenuNode,
  showUiNotice,
  submittingMessage,
  typingUsers,
  uiNotice,
  updateComposerAttachment,
  uploadingAttachments,
  voiceInputLevel,
  voiceMenu,
  voiceStageParticipants,
  voiceState,
  workspace,
  toggleHeaderPanel
}) {
  const directConversationVisual = isDirectConversation
    ? resolveDirectChannelVisual(activeChannel, currentUser?.id)
    : null;
  const shouldRenderVoiceStage = isVoiceChannel || (isDirectCallActive && isGroupDirectConversation);
  const shouldRenderDirectCallSplit =
    isDirectCallActive && isDirectConversation && !isGroupDirectConversation;
  const shouldRenderDirectCallPanel =
    shouldRenderDirectCallSplit && directCallLayoutMode !== "chat";
  const shouldRenderMessageStage =
    !shouldRenderVoiceStage &&
    (!shouldRenderDirectCallSplit || directCallLayoutMode !== "call");

  const messageStageNode = (
    <Suspense fallback={<WorkspacePanelFallback />}>
      <MessageStage
        activeChannel={activeChannel}
        activeSelectionKind={activeSelection.kind}
        attachmentInputRef={attachmentInputRef}
        availableUsersById={availableUsersById}
        composer={composer}
        composerAttachments={composerAttachments}
        composerMenuOpen={composerMenuOpen}
        composerPicker={composerPicker}
        composerRef={composerRef}
        directMessageProfile={directMessageProfile}
        editingMessage={editingMessage}
        guildStickers={activeGuild?.stickers || []}
        handleAttachmentSelection={handleAttachmentSelection}
        handleComposerChange={handleComposerChange}
        handleComposerShortcut={handleComposerShortcut}
        handleDeleteMessage={handleDeleteMessage}
        handlePickerInsert={handlePickerInsert}
        handleReaction={handleReaction}
        handleScroll={handleScroll}
        handleStickerSelect={handleStickerSelect}
        handleSubmitMessage={handleSubmitMessage}
        language={language}
        listRef={listRef}
        loadingHistoryMessages={loadingHistoryMessages}
        loadingMessages={loadingMessages}
        messageLoadError={messageLoadError}
        messageMenuFor={messageMenuFor}
        messages={messages}
        onAcceptFriendRequest={handleAcceptFriendRequest}
        onAcceptInvite={onAcceptInviteFromMessage}
        onAddFriend={handleSendFriendRequest}
        onBlockUser={handleBlockUser}
        onCancelEdit={() => {
          setEditingMessage(null);
          setComposerAttachments([]);
          setComposer("");
        }}
        onCancelFriendRequest={handleCancelFriendRequest}
        onCancelReply={() => {
          setReplyTarget(null);
          setReplyMentionEnabled(true);
        }}
        onEditMessage={handleEditMessage}
        onForwardMessage={handleForwardMessage}
        onJumpToLatest={handleJumpToLatest}
        onReportUser={handleReportUser}
        onRetryMessages={handleRetryMessages}
        onSetComposerMenuOpen={setComposerMenuOpen}
        onSetComposerPicker={setComposerPicker}
        onSetMessageMenuFor={setMessageMenuFor}
        onSetReactionPickerFor={setReactionPickerFor}
        onShowNotice={showUiNotice}
        onStartReply={handleStartReply}
        onTogglePinnedMessage={handleTogglePinnedMessage}
        onToggleReplyMention={() => setReplyMentionEnabled((previous) => !previous)}
        openProfileCard={handleOpenProfileCard}
        reactionPickerFor={reactionPickerFor}
        removeComposerAttachment={removeComposerAttachment}
        replyMentionEnabled={replyMentionEnabled}
        replyTarget={replyTarget}
        showUiNotice={showUiNotice}
        submittingMessage={submittingMessage}
        typingUsers={typingUsers}
        uiNotice={uiNotice}
        updateComposerAttachment={updateComposerAttachment}
        uploadingAttachments={uploadingAttachments}
        workspace={workspace}
      />
    </Suspense>
  );

  return (
    <>
      <main className="chat-stage">
        {activeSelection.kind === "home" ? (
          <Suspense fallback={<WorkspacePanelFallback />}>
            <FriendsHome
              availableUsers={workspace.available_users}
              blockedUsers={blockedUsers}
              friends={friendUsers}
              onAcceptFriendRequest={handleAcceptFriendRequest}
              onCancelFriendRequest={handleCancelFriendRequest}
              onOpenDm={handleOpenDmFromCard}
              onOpenProfileCard={handleOpenProfileCard}
              onRemoveFriend={handleRemoveFriend}
              onSendFriendRequest={handleSendFriendRequest}
              pendingReceived={workspace.friend_requests_received || []}
              pendingSent={workspace.friend_requests_sent || []}
            />
          </Suspense>
        ) : activeSelection.kind === "requests" ? (
          <Suspense fallback={<WorkspacePanelFallback />}>
            <MessageRequestsHome
              onOpenDm={handleOpenDmFromCard}
              onShowNotice={showUiNotice}
              requests={workspace.message_requests || []}
              spam={workspace.message_request_spam || []}
            />
          </Suspense>
        ) : (
          <>
            <ChatHeader
              activeChannel={activeChannel}
              directMessageProfile={directMessageProfile}
              directConversationVisual={directConversationVisual}
              directCallLayoutMode={directCallLayoutMode}
              headerActionsRef={headerActionsRef}
              headerPanel={headerPanel}
              headerPanelNode={chatHeaderPanelNode}
              headerSearchPlaceholder={headerSearchPlaceholder}
              isDirectCallActive={isDirectCallActive && !isGroupDirectConversation}
              isDirectConversation={isDirectConversation}
              isDirectGroupConversation={isGroupDirectConversation}
              membersPanelVisible={effectiveMembersPanelVisible}
              canInvitePeople={canInvitePeople}
              onAddFriend={handleSendFriendRequest}
              onOpenDialog={handleOpenDialog}
              onOpenInviteModal={handleOpenInviteModal}
              onLeaveDirectCall={handleVoiceLeave}
              onShowNotice={showUiNotice}
              onSetDirectCallLayoutMode={setDirectCallLayoutMode}
              onStartDirectCall={() => handleJoinDirectCall()}
              onStartDirectVideoCall={() => handleJoinDirectCall({ enableCamera: true })}
              onToggleDirectCallCamera={() => handleToggleVoiceState("cameraEnabled")}
              onToggleDirectCallMute={() => handleToggleVoiceState("micMuted")}
              onToggleHeaderPanel={toggleHeaderPanel}
              onToggleMembersPanel={() => setMembersPanelVisible((previous) => !previous)}
              subtitle={activeGuild?.name || headerCopy.eyebrow}
              title={headerCopy.title}
              voiceState={voiceState}
            />

            {shouldRenderVoiceStage ? (
              <Suspense fallback={<WorkspacePanelFallback />}>
                <VoiceRoomStage
                  activeChannel={activeChannel}
                  cameraMenuNode={voiceMenu === "camera" ? cameraMenuNode : null}
                  cameraStatus={cameraStatus}
                  inputMenuNode={voiceMenu === "input" ? inputMenuNode : null}
                  isDirectCall={isDirectConversation}
                  joinedVoiceChannelId={joinedVoiceChannelId}
                  onHandleVoiceLeave={handleVoiceLeave}
                  onJoinVoiceChannel={() =>
                    isVoiceChannel
                      ? handleSelectGuildChannel(activeChannel)
                      : handleJoinDirectCall()
                  }
                  onOpenParticipantMenu={handleOpenParticipantMenu}
                  onOpenProfileCard={handleOpenProfileCard}
                  onShowNotice={showUiNotice}
                  onToggleScreenShare={handleToggleScreenShare}
                  onToggleVoiceMenu={handleToggleVoiceMenu}
                  onToggleVoiceState={handleToggleVoiceState}
                  screenShareQualityLabel={screenShareQualityLabel}
                  shareMenuNode={voiceMenu === "share" ? shareMenuNode : null}
                  voiceInputLevel={voiceInputLevel}
                  voiceMenu={voiceMenu}
                  voiceStageParticipants={voiceStageParticipants}
                  voiceState={voiceState}
                  workspace={workspace}
                />
              </Suspense>
            ) : shouldRenderDirectCallSplit ? (
              <section
                className={`direct-call-chat-layout direct-call-chat-layout-${directCallLayoutMode}`.trim()}
              >
                {shouldRenderDirectCallPanel ? (
                  <DirectCallPanel
                    activeChannel={activeChannel}
                    currentUser={currentUser}
                    displayMode={directCallLayoutMode}
                    joinedVoiceChannelId={joinedVoiceChannelId}
                    onJoinVoiceChannel={() => handleJoinDirectCall()}
                    onLeaveVoice={handleVoiceLeave}
                    onOpenProfileCard={handleOpenProfileCard}
                    onShowNotice={showUiNotice}
                    onToggleCamera={() => handleToggleVoiceState("cameraEnabled")}
                    onToggleMute={() => handleToggleVoiceState("micMuted")}
                    onToggleScreenShare={handleToggleScreenShare}
                    voiceStageParticipants={voiceStageParticipants}
                    voiceState={voiceState}
                  />
                ) : null}

                {shouldRenderMessageStage ? (
                  <div className="direct-call-chat-messages">{messageStageNode}</div>
                ) : null}
              </section>
            ) : (
              messageStageNode
            )}
          </>
        )}
      </main>

      {effectiveMembersPanelVisible ? (
        <>
          {isSingleDirectMessagePanel ? (
            <button
              aria-label="Ajustar ancho del panel"
              className={`members-panel-divider ${isResizingMembersPanel ? "is-dragging" : ""}`.trim()}
              onMouseDown={handleStartMembersResize}
              type="button"
            />
          ) : null}
          <MembersPanel
            activeChannel={activeChannel}
            activeNowUsers={activeNowUsers}
            activeSelectionKind={activeSelection.kind}
            directMessageProfile={directMessageProfile}
            memberGroups={memberGroups}
            memberList={memberList}
            onAcceptFriendRequest={handleAcceptFriendRequest}
            onAddFriend={handleSendFriendRequest}
            onBlockUser={handleBlockUser}
            onCancelFriendRequest={handleCancelFriendRequest}
            onCopyProfileId={handleCopyProfileId}
            onOpenDm={handleOpenDmFromCard}
            onOpenFullProfile={handleOpenFullProfile}
            onOpenProfileCard={handleOpenProfileCard}
            onRemoveFriend={handleRemoveFriend}
            onReportUser={handleReportUser}
            onShowNotice={showUiNotice}
            workspace={workspace}
          />
        </>
      ) : null}
    </>
  );
}
