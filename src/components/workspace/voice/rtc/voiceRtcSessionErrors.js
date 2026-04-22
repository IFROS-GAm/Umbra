export function normalizeVoiceErrorMessage(error) {
  return String(error?.message || error || "").trim();
}

export function isRetryableVoiceSignalAbortError(error) {
  const message = normalizeVoiceErrorMessage(error).toLowerCase();
  const errorName = String(error?.name || "").trim().toLowerCase();

  return (
    errorName === "aborterror" ||
    message.includes("abort handler called") ||
    (message.includes("could not establish signal connection") && message.includes("abort"))
  );
}

export function shouldSilenceVoiceSessionError(error, { destroyed = false } = {}) {
  if (destroyed) {
    return true;
  }

  const message = normalizeVoiceErrorMessage(error).toLowerCase();

  return (
    message.includes("client initiated disconnect") ||
    message.includes("cancelled") ||
    message.includes("canceled")
  );
}

export function getVoiceErrorNoticeMessage(
  error,
  fallback = "No se pudo iniciar la sesion de voz."
) {
  if (shouldSilenceVoiceSessionError(error)) {
    return "";
  }

  if (isRetryableVoiceSignalAbortError(error)) {
    return "No se pudo establecer la conexion de voz. Intenta unirte de nuevo.";
  }

  const message = normalizeVoiceErrorMessage(error);
  return message || fallback;
}
