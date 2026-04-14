import { useEffect, useMemo, useRef, useState } from "react";

import {
  createVoiceScreenShareSession,
  SCREEN_SHARE_QUALITY_PRESETS
} from "../voiceScreenShareSession.js";

const DEFAULT_SCREEN_SHARE_QUALITY = "720p30";

function getScreenShareQualityPreset(qualityId) {
  return (
    SCREEN_SHARE_QUALITY_PRESETS[qualityId] ||
    SCREEN_SHARE_QUALITY_PRESETS[DEFAULT_SCREEN_SHARE_QUALITY]
  );
}

function buildScreenShareStatus(qualityId) {
  return {
    audioAvailable: false,
    error: "",
    kind: "window",
    label: "",
    quality: getScreenShareQualityPreset(qualityId),
    ready: false,
    sourceId: ""
  };
}

function getDesktopBridge() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.umbraDesktop || null;
}

function buildFallbackScreenShareSources(t) {
  return [
    {
      id: "native-window",
      kind: "window",
      name: t("voice.share.nativeWindow", "Elegir aplicacion o ventana"),
      thumbnailDataUrl: ""
    },
    {
      id: "native-screen",
      kind: "screen",
      name: t("voice.share.nativeScreen", "Elegir pantalla completa"),
      thumbnailDataUrl: ""
    }
  ];
}

export function useWorkspaceScreenShare({
  activeChannelId,
  joinedVoiceChannelId,
  language,
  onLeaveVoice,
  setScreenShareStream,
  setVoiceInputPanel,
  setVoiceMenu,
  setVoiceOutputPanel,
  showUiNotice,
  t,
  toggleVoiceMenu,
  updateVoiceSetting,
  voiceInputPanel,
  voiceMenu,
  voiceOutputPanel,
  voiceState
}) {
  const screenShareSessionRef = useRef(null);
  const [screenShareStatus, setScreenShareStatus] = useState(() =>
    buildScreenShareStatus(voiceState.screenShareQuality)
  );
  const [screenSharePicker, setScreenSharePicker] = useState({
    loading: false,
    open: false,
    quality: voiceState.screenShareQuality || DEFAULT_SCREEN_SHARE_QUALITY,
    selectedSourceId: "",
    shareAudio: voiceState.shareAudio,
    sources: [],
    tab: "applications"
  });

  const screenShareQualityOptions = useMemo(
    () => [
      {
        description: t(
          "voice.share.quality.sdCopy",
          "Video mas fluido para chats rapidos y equipos mas modestos."
        ),
        id: "720p30",
        label: "720P 30 FPS",
        shortLabel: "SD"
      },
      {
        description: t(
          "voice.share.quality.hdCopy",
          "Mas detalle visual para apps, codigo y ventanas pequenas."
        ),
        id: "1080p30",
        label: "1080P 30 FPS",
        shortLabel: "HD"
      }
    ],
    [language]
  );
  const screenShareQualityLabel =
    screenShareQualityOptions.find((option) => option.id === voiceState.screenShareQuality)?.label ||
    SCREEN_SHARE_QUALITY_PRESETS[DEFAULT_SCREEN_SHARE_QUALITY].label;

  useEffect(
    () => () => {
      if (screenShareSessionRef.current) {
        screenShareSessionRef.current.destroy().catch(() => {});
        screenShareSessionRef.current = null;
      }
    },
    []
  );

  useEffect(() => {
    setScreenSharePicker((previous) => ({
      ...previous,
      quality: voiceState.screenShareQuality,
      shareAudio: voiceState.shareAudio
    }));
  }, [voiceState.screenShareQuality, voiceState.shareAudio]);

  useEffect(() => {
    if (joinedVoiceChannelId === activeChannelId) {
      return;
    }

    if (!screenShareSessionRef.current) {
      return;
    }

    screenShareSessionRef.current.destroy().catch(() => {});
    screenShareSessionRef.current = null;
    setScreenShareStream(null);
    setScreenShareStatus(buildScreenShareStatus(voiceState.screenShareQuality));
    if (voiceState.screenShareEnabled) {
      updateVoiceSetting("screenShareEnabled", false);
    }
  }, [
    activeChannelId,
    joinedVoiceChannelId,
    setScreenShareStream,
    updateVoiceSetting,
    voiceState.screenShareEnabled,
    voiceState.screenShareQuality
  ]);

  useEffect(() => {
    if (!voiceMenu && !voiceInputPanel && !voiceOutputPanel && !screenSharePicker.open) {
      return undefined;
    }

    function handlePointerDown(event) {
      const target = event.target;
      if (
        target?.closest?.(".screen-share-picker") ||
        target?.closest?.(".voice-control-menu") ||
        target?.closest?.(".dock-split-control") ||
        target?.closest?.(".voice-stage-menu-shell")
      ) {
        return;
      }

      setVoiceInputPanel(null);
      setVoiceOutputPanel(null);
      setScreenSharePicker((previous) =>
        previous.open
          ? {
              ...previous,
              open: false
            }
          : previous
      );
      if (voiceMenu) {
        toggleVoiceMenu(voiceMenu);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [
    screenSharePicker.open,
    setVoiceInputPanel,
    setVoiceOutputPanel,
    toggleVoiceMenu,
    voiceInputPanel,
    voiceMenu,
    voiceOutputPanel
  ]);

  async function loadScreenShareSources(nextTab = "applications") {
    const desktopBridge = getDesktopBridge();
    const fallbackSources = buildFallbackScreenShareSources(t);
    const fallbackSource =
      nextTab === "screen"
        ? fallbackSources.find((source) => source.kind === "screen")
        : fallbackSources.find((source) => source.kind === "window");

    if (!desktopBridge?.listDisplaySources) {
      setScreenSharePicker((previous) => ({
        ...previous,
        loading: false,
        open: true,
        selectedSourceId: previous.selectedSourceId || fallbackSource?.id || "native-window",
        shareAudio: voiceState.shareAudio,
        sources: fallbackSources,
        tab: nextTab
      }));

      return fallbackSources;
    }

    setScreenSharePicker((previous) => ({
      ...previous,
      loading: true,
      open: true,
      tab: nextTab
    }));

    try {
      const sources = await desktopBridge.listDisplaySources();
      const nextFallbackSource =
        sources.find((source) => source.kind === (nextTab === "screen" ? "screen" : "window")) ||
        sources[0] ||
        null;

      setScreenSharePicker((previous) => ({
        ...previous,
        loading: false,
        open: true,
        selectedSourceId: previous.selectedSourceId || nextFallbackSource?.id || "",
        shareAudio: voiceState.shareAudio,
        sources,
        tab: nextTab
      }));

      return sources;
    } catch (error) {
      const handlerMissing = /No handler registered/i.test(String(error?.message || ""));
      if (handlerMissing) {
        setScreenSharePicker((previous) => ({
          ...previous,
          loading: false,
          open: true,
          selectedSourceId: previous.selectedSourceId || fallbackSource?.id || "native-window",
          shareAudio: voiceState.shareAudio,
          sources: fallbackSources,
          tab: nextTab
        }));
        showUiNotice(
          t(
            "voice.share.fallbackNotice",
            "Umbra usara el selector nativo de pantalla en esta sesion."
          )
        );
        return fallbackSources;
      }

      setScreenSharePicker((previous) => ({
        ...previous,
        loading: false,
        open: false
      }));
      setScreenShareStatus((previous) => ({
        ...previous,
        error: error.message || "No se pudieron listar las fuentes para compartir."
      }));
      showUiNotice(error.message || "No se pudieron listar las fuentes para compartir.");
      return [];
    }
  }

  async function stopScreenShare({ notify = true } = {}) {
    if (screenShareSessionRef.current) {
      await screenShareSessionRef.current.destroy().catch(() => {});
      screenShareSessionRef.current = null;
    }

    setScreenShareStream(null);
    setScreenShareStatus(buildScreenShareStatus(voiceState.screenShareQuality));
    setScreenSharePicker((previous) => ({
      ...previous,
      open: false
    }));
    if (voiceState.screenShareEnabled) {
      updateVoiceSetting("screenShareEnabled", false);
    }
    if (notify) {
      showUiNotice("Transmision detenida.");
    }
  }

  async function handleLeaveVoiceSession() {
    await stopScreenShare({ notify: false });
    onLeaveVoice();
  }

  async function startScreenShareSession({
    label = "",
    sourceId = "",
    sourceKind = "window"
  } = {}) {
    if (joinedVoiceChannelId !== activeChannelId) {
      showUiNotice("Unete primero a la llamada para compartir pantalla.");
      return;
    }

    if (screenShareSessionRef.current) {
      await screenShareSessionRef.current.destroy().catch(() => {});
      screenShareSessionRef.current = null;
    }

    const resolvedSourceId = String(sourceId || "").startsWith("native-") ? "" : sourceId;

    try {
      const session = await createVoiceScreenShareSession({
        includeAudio: voiceState.shareAudio,
        label,
        onEnded: () => {
          stopScreenShare({ notify: true }).catch(() => {});
        },
        quality: voiceState.screenShareQuality,
        sourceId: resolvedSourceId,
        sourceKind
      });

      screenShareSessionRef.current = session;
      session.setEnabled(true);
      setScreenShareStream(session.stream);
      setScreenShareStatus({
        audioAvailable: session.audioAvailable,
        error: "",
        kind: session.kind,
        label: session.label,
        quality: session.quality,
        ready: true,
        sourceId: sourceId === "native-display" ? "native-display" : session.sourceId
      });
      setScreenSharePicker((previous) => ({
        ...previous,
        open: false
      }));
      updateVoiceSetting("screenShareEnabled", true);
      setVoiceMenu(null);
      if (voiceState.shareAudio && !session.audioAvailable) {
        showUiNotice("La pantalla se esta compartiendo sin audio del sistema.");
      } else {
        showUiNotice(`Transmitiendo ${session.label}.`);
      }
    } catch (error) {
      setScreenShareStream(null);
      setScreenShareStatus({
        audioAvailable: false,
        error: error.message || "No se pudo iniciar la transmision.",
        kind: sourceKind,
        label,
        quality: getScreenShareQualityPreset(voiceState.screenShareQuality),
        ready: false,
        sourceId
      });
      updateVoiceSetting("screenShareEnabled", false);
      showUiNotice(error.message || "No se pudo iniciar la transmision.");
    }
  }

  async function openScreenSharePicker(tab = "applications") {
    setScreenSharePicker((previous) => ({
      ...previous,
      loading: true,
      open: true,
      quality: voiceState.screenShareQuality,
      shareAudio: voiceState.shareAudio,
      tab
    }));

    await loadScreenShareSources(tab);
  }

  async function handleToggleScreenShare() {
    if (voiceState.screenShareEnabled) {
      await stopScreenShare();
      return;
    }

    await openScreenSharePicker("applications");
  }

  async function handleConfirmScreenShare() {
    const selectedSource =
      screenSharePicker.sources.find((source) => source.id === screenSharePicker.selectedSourceId) ||
      null;

    if (!selectedSource) {
      showUiNotice("Elige una ventana o pantalla para continuar.");
      return;
    }

    await startScreenShareSession({
      label: selectedSource.name,
      sourceId: selectedSource.id,
      sourceKind: selectedSource.kind
    });
  }

  async function handleChangeScreenShareQuality(nextQuality) {
    updateVoiceSetting("screenShareQuality", nextQuality);

    if (!screenShareSessionRef.current || !voiceState.screenShareEnabled) {
      return;
    }

    await startScreenShareSession({
      label: screenShareStatus.label,
      sourceId: screenShareStatus.sourceId,
      sourceKind: screenShareStatus.kind
    });
  }

  async function handleToggleShareAudio() {
    const nextShareAudio = !voiceState.shareAudio;
    updateVoiceSetting("shareAudio", nextShareAudio);
    setScreenSharePicker((previous) => ({
      ...previous,
      shareAudio: nextShareAudio
    }));

    if (!screenShareSessionRef.current || !voiceState.screenShareEnabled) {
      return;
    }

    await startScreenShareSession({
      label: screenShareStatus.label,
      sourceId: screenShareStatus.sourceId,
      sourceKind: screenShareStatus.kind
    });
  }

  return {
    screenSharePicker,
    screenShareQualityLabel,
    screenShareQualityOptions,
    screenShareStatus,
    setScreenSharePicker,
    handleChangeScreenShareQuality,
    handleConfirmScreenShare,
    handleLeaveVoiceSession,
    handleToggleScreenShare,
    handleToggleShareAudio,
    loadScreenShareSources,
    openScreenSharePicker
  };
}
