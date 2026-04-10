const avatarElement = document.getElementById("avatar");
const callerNameElement = document.getElementById("caller-name");
const bodyElement = document.getElementById("body");
const acceptButton = document.getElementById("accept-button");
const rejectButton = document.getElementById("reject-button");

let currentPayload = {
  callId: "",
  channelId: ""
};

function applyPayload(payload = {}) {
  currentPayload = {
    callId: String(payload.callId || payload.channelId || "").trim(),
    channelId: String(payload.channelId || "").trim()
  };

  callerNameElement.textContent = String(payload.callerName || "Umbra");
  bodyElement.textContent = String(payload.body || "Incoming call...");

  if (payload.avatarUrl) {
    avatarElement.src = payload.avatarUrl;
  } else {
    avatarElement.removeAttribute("src");
  }
}

acceptButton.addEventListener("click", () => {
  window.umbraIncomingCallPopup?.sendAction({
    action: "accept",
    ...currentPayload
  });
});

rejectButton.addEventListener("click", () => {
  window.umbraIncomingCallPopup?.sendAction({
    action: "reject",
    ...currentPayload
  });
});

window.umbraIncomingCallPopup?.onData((payload) => {
  applyPayload(payload);
});
