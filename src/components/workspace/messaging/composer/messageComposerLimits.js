export const MESSAGE_CONTENT_MAX_LENGTH = 1500;
export const MESSAGE_CONTENT_COUNTER_THRESHOLD = 200;

export function clampComposerContent(value) {
  return String(value || "").slice(0, MESSAGE_CONTENT_MAX_LENGTH);
}

export function countComposerCharacters(value) {
  return String(value || "").length;
}

export function getRemainingComposerCharacters(value) {
  return MESSAGE_CONTENT_MAX_LENGTH - countComposerCharacters(value);
}
