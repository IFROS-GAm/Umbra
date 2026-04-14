import React, { useEffect } from "react";

import {
  WorkspaceCameraMenu,
  WorkspaceInputMenu,
  WorkspaceOutputMenu,
  WorkspaceShareMenu
} from "../WorkspaceVoiceMenus.jsx";

export function useWorkspaceVoiceMenus({
  cameraStatus,
  getSelectedDeviceLabel,
  handleChangeScreenShareQuality,
  handleToggleScreenShare,
  handleToggleShareAudio,
  handleVoiceDeviceChange,
  language,
  openScreenSharePicker,
  screenSharePicker,
  screenShareQualityLabel,
  screenShareQualityOptions,
  screenShareStatus,
  setSettingsOpen,
  setVoiceInputPanel,
  setVoiceMenu,
  setVoiceOutputPanel,
  showUiNotice,
  toggleVoiceState,
  t,
  updateVoiceSetting,
  voiceDevices,
  voiceInputLevel,
  voiceInputPanel,
  voiceInputStatus,
  voiceMenu,
  voiceOutputPanel,
  voiceState,
  selectedVoiceDevices
}) {
  const inputMeterBars = Array.from({ length: 18 }, (_, index) => index);
  const activeInputBars = Math.max(
    0,
    Math.round((voiceInputLevel / 100) * inputMeterBars.length)
  );
  const voiceSuppressionLabel =
    voiceInputStatus.engine === "speex"
      ? t("voice.input.label.speex", "Speex DSP activo")
      : voiceInputStatus.engine === "native"
        ? t("voice.input.label.native", "Filtro nativo del navegador")
        : t("voice.input.label.off", "Sin supresion adicional");
  const voiceSuppressionCopy = voiceInputStatus.error
    ? voiceInputStatus.error
    : voiceState.noiseSuppression
      ? voiceInputStatus.ready
        ? t(
            "voice.input.copy.activeReady",
            "Umbra esta limpiando el ruido del microfono en tiempo real."
          )
        : t(
            "voice.input.copy.activePending",
            "Activa la supresion y Umbra preparara el microfono cuando abras voz."
          )
      : t(
          "voice.input.copy.off",
          "La entrada llega sin filtro adicional para mantener la voz natural."
        );
  const voiceSuppressionAmountLabel = `${voiceState.noiseSuppressionAmount}%`;
  const voiceProfileOptions = [
    {
      description: t(
        "voice.profile.isolation.description",
        "Filtro fuerte para reducir fondo y ruido continuo."
      ),
      id: "isolation",
      label: t("voice.profile.isolation.label", "Aislamiento de voz"),
      settings: {
        inputProfile: "isolation",
        inputVolume: 76,
        noiseSuppressionAmount: 78,
        noiseSuppression: true
      }
    },
    {
      description: t(
        "voice.profile.studio.description",
        "Entrada mas natural para microfonos limpios o estudio."
      ),
      id: "studio",
      label: t("voice.profile.studio.label", "Estudio"),
      settings: {
        inputProfile: "studio",
        inputVolume: 82,
        noiseSuppressionAmount: 18,
        noiseSuppression: false
      }
    },
    {
      description: t(
        "voice.profile.custom.description",
        "Control manual del volumen y del filtro."
      ),
      id: "custom",
      label: t("voice.profile.custom.label", "Personalizar"),
      settings: {
        inputProfile: "custom"
      }
    }
  ];
  const activeInputProfile = voiceState.inputProfile || "custom";
  const activeInputProfileLabel =
    voiceProfileOptions.find((option) => option.id === activeInputProfile)?.label ||
    t("voice.profile.custom.label", "Personalizar");

  useEffect(() => {
    if (voiceMenu !== "input" && voiceInputPanel) {
      setVoiceInputPanel(null);
    }
  }, [setVoiceInputPanel, voiceInputPanel, voiceMenu]);

  useEffect(() => {
    if (voiceMenu !== "output" && voiceOutputPanel) {
      setVoiceOutputPanel(null);
    }
  }, [setVoiceOutputPanel, voiceOutputPanel, voiceMenu]);

  function handleApplyVoiceProfile(profile) {
    updateVoiceSetting("inputProfile", profile.id);
    if (typeof profile.settings.noiseSuppression === "boolean") {
      updateVoiceSetting("noiseSuppression", profile.settings.noiseSuppression);
    }
    if (typeof profile.settings.noiseSuppressionAmount === "number") {
      updateVoiceSetting("noiseSuppressionAmount", profile.settings.noiseSuppressionAmount);
    }
    if (typeof profile.settings.inputVolume === "number") {
      updateVoiceSetting("inputVolume", profile.settings.inputVolume);
    }
    setVoiceInputPanel(null);
    showUiNotice(`${t("voice.input.profile", "Perfil de entrada")}: ${profile.label}.`);
  }

  const inputMenuNode = (
    <WorkspaceInputMenu
      activeInputBars={activeInputBars}
      activeInputProfile={activeInputProfile}
      activeInputProfileLabel={activeInputProfileLabel}
      getSelectedDeviceLabel={getSelectedDeviceLabel}
      handleApplyVoiceProfile={handleApplyVoiceProfile}
      handleVoiceDeviceChange={handleVoiceDeviceChange}
      inputMeterBars={inputMeterBars}
      language={language}
      selectedVoiceDevices={selectedVoiceDevices}
      setSettingsOpen={setSettingsOpen}
      setVoiceInputPanel={setVoiceInputPanel}
      setVoiceMenu={setVoiceMenu}
      showUiNotice={showUiNotice}
      toggleVoiceState={toggleVoiceState}
      updateVoiceSetting={updateVoiceSetting}
      voiceDevices={voiceDevices}
      voiceInputPanel={voiceInputPanel}
      voiceInputStatus={voiceInputStatus}
      voiceProfileOptions={voiceProfileOptions}
      voiceState={voiceState}
      voiceSuppressionAmountLabel={voiceSuppressionAmountLabel}
      voiceSuppressionCopy={voiceSuppressionCopy}
      voiceSuppressionLabel={voiceSuppressionLabel}
    />
  );
  const cameraMenuNode = (
    <WorkspaceCameraMenu
      cameraStatus={cameraStatus}
      getSelectedDeviceLabel={getSelectedDeviceLabel}
      language={language}
      setSettingsOpen={setSettingsOpen}
      toggleVoiceState={toggleVoiceState}
      voiceState={voiceState}
    />
  );
  const outputMenuNode = (
    <WorkspaceOutputMenu
      getSelectedDeviceLabel={getSelectedDeviceLabel}
      handleVoiceDeviceChange={handleVoiceDeviceChange}
      language={language}
      selectedVoiceDevices={selectedVoiceDevices}
      setSettingsOpen={setSettingsOpen}
      setVoiceOutputPanel={setVoiceOutputPanel}
      showUiNotice={showUiNotice}
      updateVoiceSetting={updateVoiceSetting}
      voiceDevices={voiceDevices}
      voiceOutputPanel={voiceOutputPanel}
      voiceState={voiceState}
    />
  );
  const shareMenuNode = (
    <WorkspaceShareMenu
      language={language}
      onChangeScreenShareQuality={handleChangeScreenShareQuality}
      onChangeShareSource={() =>
        openScreenSharePicker(screenShareStatus.kind === "screen" ? "screen" : "applications")
      }
      onToggleScreenShare={handleToggleScreenShare}
      onToggleShareAudio={handleToggleShareAudio}
      screenSharePickerOpen={screenSharePicker.open}
      screenShareQualityLabel={screenShareQualityLabel}
      shareQualityOptions={screenShareQualityOptions}
      showUiNotice={showUiNotice}
      voiceShareStatus={screenShareStatus}
      voiceState={voiceState}
    />
  );

  return {
    cameraMenuNode,
    inputMenuNode,
    outputMenuNode,
    shareMenuNode
  };
}
