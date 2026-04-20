import React, { useEffect, useMemo, useState } from "react";

import { AuthScreen } from "./components/AuthScreen.jsx";
import { InviteJoinScreen } from "./components/InviteJoinScreen.jsx";
import { UmbraWorkspace } from "./components/UmbraWorkspace.jsx";
import { UmbraBootScreen } from "./components/shared/UmbraBootScreen.jsx";
import { applyLanguageToDocument, getStoredLanguage, persistLanguage } from "./i18n.js";
import { hasSupabaseBrowserConfig, supabase } from "./supabase-browser.js";

const AUTH_CALLBACK_PATH = "/auth/callback";

function getDesktopBridge() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.umbraDesktop || null;
}

function getConfiguredPublicAppUrl() {
  return String(import.meta.env.VITE_PUBLIC_APP_URL || "")
    .trim()
    .replace(/\/$/, "");
}

function getWebAuthRedirectUrl() {
  if (typeof window === "undefined") {
    return getConfiguredPublicAppUrl()
      ? `${getConfiguredPublicAppUrl()}${AUTH_CALLBACK_PATH}`
      : AUTH_CALLBACK_PATH;
  }

  const publicBase = getConfiguredPublicAppUrl() || window.location.origin;
  return `${publicBase}${AUTH_CALLBACK_PATH}`;
}

function getAuthRedirectUrl() {
  const desktop = getDesktopBridge();
  return desktop?.redirectUri || getWebAuthRedirectUrl();
}

function isAuthCallbackPath(pathname = "") {
  const normalizedPath = String(pathname || "").replace(/\/+$/, "") || "/";
  return normalizedPath === AUTH_CALLBACK_PATH;
}

function readInviteCodeFromLocation() {
  if (typeof window === "undefined") {
    return null;
  }

  const match = window.location.pathname.match(/^\/invite\/([A-Z0-9_-]+)$/i);
  return match?.[1]?.trim().toUpperCase() || null;
}

function pushRoute(path, { replace = false } = {}) {
  if (typeof window === "undefined") {
    return null;
  }

  const method = replace ? "replaceState" : "pushState";
  window.history[method]({}, "", path);
  return readInviteCodeFromLocation();
}

const TRANSIENT_AUTH_ERROR_STATUSES = new Set([408, 429, 500, 502, 503, 504]);
const DYNAMIC_IMPORT_RELOAD_KEY = "umbra.dynamicImportReloaded";

function isTransientAuthError(error) {
  const status = Number(error?.status || error?.code || 0);
  const message = String(error?.message || "").toLowerCase();

  if (TRANSIENT_AUTH_ERROR_STATUSES.has(status)) {
    return true;
  }

  return (
    message.includes("gateway timeout") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("network request failed") ||
    message.includes("timed out")
  );
}

function isDynamicImportError(error) {
  const message = String(error?.message || "").toLowerCase();
  const stack = String(error?.stack || "").toLowerCase();

  return (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("importing a module script failed") ||
    message.includes("chunkloaderror") ||
    stack.includes("chunkloaderror")
  );
}

class RootErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      error: null
    };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error) {
    if (typeof window !== "undefined" && isDynamicImportError(error)) {
      try {
        const alreadyReloaded =
          window.sessionStorage.getItem(DYNAMIC_IMPORT_RELOAD_KEY) === "1";
        if (!alreadyReloaded) {
          window.sessionStorage.setItem(DYNAMIC_IMPORT_RELOAD_KEY, "1");
          console.warn("Umbra detected a stale dynamic chunk and will reload once.", error);
          window.location.reload();
          return;
        }
      } catch {
        // Ignore sessionStorage access issues and fall back to the normal error card.
      }
    }

    console.error("Umbra root render failed:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="boot-screen">
          <div className="boot-failure-card">
            <strong>Umbra encontro un error al dibujar la interfaz.</strong>
            <p>{this.state.error?.message || "Hubo un problema inesperado en el renderer."}</p>
            <button
              className="primary-button"
              onClick={() => window.location.reload()}
              type="button"
            >
              Recargar app
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function AppContent() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [passwordRecoveryMode, setPasswordRecoveryMode] = useState(false);
  const [inviteCode, setInviteCode] = useState(() => readInviteCodeFromLocation());
  const [inviteBrowserMode, setInviteBrowserMode] = useState(false);
  const [workspaceInitialSelection, setWorkspaceInitialSelection] = useState(null);
  const [language, setLanguage] = useState(() => getStoredLanguage());

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    try {
      window.sessionStorage.removeItem(DYNAMIC_IMPORT_RELOAD_KEY);
    } catch {
      // Ignore sessionStorage access issues.
    }
  }, []);

  useEffect(() => {
    persistLanguage(language);
    applyLanguageToDocument(language);
  }, [language]);

  useEffect(() => {
    const desktop = getDesktopBridge();
    if (!desktop) {
      return;
    }

    console.info("[runtime/client]", {
      apiBaseUrl: desktop.apiBaseUrl || "",
      publicAppUrl: desktop.publicAppUrl || "",
      socketBaseUrl: desktop.socketBaseUrl || ""
    });
  }, []);

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return undefined;
    }

    let cancelled = false;
    let retryTimer = null;

    async function bootstrapSession(attempt = 0) {
      const { data, error: sessionError } = await supabase.auth.getSession();

      if (cancelled) {
        return;
      }

      if (sessionError && isTransientAuthError(sessionError) && attempt < 2) {
        setMessage("Reconectando tu sesion con Umbra...");
        retryTimer = window.setTimeout(() => {
          bootstrapSession(attempt + 1);
        }, 1200 * (attempt + 1));
        return;
      }

      if (sessionError) {
        setError(sessionError.message);
      } else {
        setSession(data.session);
        setError("");
        setMessage("");
      }

      setReady(true);
    }

    bootstrapSession().catch((sessionError) => {
      if (cancelled) {
        return;
      }

      setError(sessionError?.message || "No se pudo restaurar la sesion.");
      setReady(true);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "PASSWORD_RECOVERY") {
        setPasswordRecoveryMode(true);
        setError("");
        setMessage("Define una nueva contrasena para completar la recuperacion.");
      }

      if (event === "USER_UPDATED" && passwordRecoveryMode) {
        setPasswordRecoveryMode(false);
      }

      setSession(nextSession);
    });

    return () => {
      cancelled = true;
      if (retryTimer) {
        window.clearTimeout(retryTimer);
      }
      subscription.unsubscribe();
    };
  }, [passwordRecoveryMode]);

  useEffect(() => {
    function handlePopState() {
      setInviteCode(readInviteCodeFromLocation());
      setInviteBrowserMode(false);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    if (!session?.user) {
      return;
    }

    if (isAuthCallbackPath(window.location.pathname)) {
      setInviteCode(pushRoute("/", { replace: true }));
    }
  }, [session?.user?.id]);

  useEffect(() => {
    const desktop = getDesktopBridge();
    if (!desktop || !supabase) {
      return undefined;
    }

    async function applyDesktopCallback(callbackUrl) {
      if (!callbackUrl) {
        return;
      }

      try {
        const parsed = new URL(callbackUrl);
        if (parsed.protocol === "umbra:" && parsed.hostname === "invite") {
          const nextInviteCode = parsed.pathname.replace(/^\/+/, "").trim().toUpperCase();
          if (nextInviteCode) {
            setInviteCode(pushRoute(`/invite/${nextInviteCode}`, { replace: true }));
            setInviteBrowserMode(false);
            setMessage("");
            setError("");
            return;
          }
        }

        const authCode = parsed.searchParams.get("code");
        const tokenHash = parsed.searchParams.get("token_hash");
        const authType = parsed.searchParams.get("type");
        const errorDescription = parsed.searchParams.get("error_description");

        if (errorDescription) {
          throw new Error(errorDescription);
        }

        if (authCode) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
            authCode
          );

          if (exchangeError) {
            throw exchangeError;
          }

          setMessage("Sesion iniciada en Umbra.");
          setError("");
          return;
        }

        if (tokenHash && authType) {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: tokenHash,
            type: authType
          });

          if (verifyError) {
            throw verifyError;
          }

          if (authType === "recovery") {
            setPasswordRecoveryMode(true);
            setMessage("Define una nueva contrasena para completar la recuperacion.");
          } else if (authType === "email_change") {
            setMessage("El nuevo correo fue confirmado correctamente.");
          } else {
            setMessage("Correo verificado correctamente.");
          }
          setError("");
        }
      } catch (callbackError) {
        setError(callbackError.message);
      }
    }

    desktop.consumeAuthCallback().then((callbackUrl) => {
      if (callbackUrl) {
        applyDesktopCallback(callbackUrl);
      }
    });

    const unsubscribe = desktop.onAuthCallback((callbackUrl) => {
      applyDesktopCallback(callbackUrl);
    });

    return unsubscribe;
  }, []);

  const accessToken = useMemo(() => session?.access_token || null, [session]);

  async function runAuthAction(action, successMessage = "") {
    setBusy(true);
    setError("");
    setMessage("");

    try {
      await action();
      if (successMessage) {
        setMessage(successMessage);
      }
    } catch (actionError) {
      setError(actionError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogleSignIn() {
    await runAuthAction(
      async () => {
        const desktop = getDesktopBridge();
        const redirectTo = getAuthRedirectUrl();

        if (desktop) {
          const { data, error: signInError } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
              redirectTo,
              skipBrowserRedirect: true
            }
          });

          if (signInError) {
            throw signInError;
          }

          if (!data?.url) {
            throw new Error("No se pudo abrir el acceso con Google.");
          }

          await desktop.openExternalAuth(data.url);
          return;
        }

        const { error: signInError } = await supabase.auth.signInWithOAuth({
          provider: "google",
          options: {
            redirectTo
          }
        });

        if (signInError) {
          throw signInError;
        }
      },
      getDesktopBridge()
        ? "Completa el acceso con Google en tu navegador. Umbra retomara la sesion al volver."
        : ""
    );
  }

  async function handleLogin({ email, password }) {
    await runAuthAction(async () => {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) {
        throw signInError;
      }
    });
  }

  async function handleSignup({ email, password, username }) {
    await runAuthAction(
      async () => {
        const { error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              username
            },
            emailRedirectTo: getAuthRedirectUrl()
          }
        });

        if (signUpError) {
          throw signUpError;
        }
      },
      "Revisa tu correo para verificar la cuenta o usa el flujo por codigo."
    );
  }

  async function handleOtpSend({ email, username }) {
    await runAuthAction(
      async () => {
        const { error: otpError } = await supabase.auth.signInWithOtp({
          email,
          options: {
            shouldCreateUser: true,
            emailRedirectTo: getAuthRedirectUrl(),
            data: {
              username: username || undefined
            }
          }
        });

        if (otpError) {
          throw otpError;
        }
      },
      "Codigo y enlace magico enviados. Revisa tu correo para entrar a Umbra."
    );
  }

  async function handleOtpVerify({ code, email }) {
    await runAuthAction(async () => {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email,
        token: code,
        type: "email"
      });

      if (verifyError) {
        throw verifyError;
      }
    });
  }

  async function handlePasswordResetRequest({ email }) {
    await runAuthAction(
      async () => {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: getAuthRedirectUrl()
        });

        if (resetError) {
          throw resetError;
        }
      },
      "Revisa tu correo para continuar con la recuperacion."
    );
  }

  async function handlePasswordResetConfirm({ confirmPassword, password }) {
    await runAuthAction(
      async () => {
        if (String(password || "").length < 8) {
          throw new Error("La contrasena debe tener al menos 8 caracteres.");
        }

        if (password !== confirmPassword) {
          throw new Error("Las contrasenas no coinciden.");
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password
        });

        if (updateError) {
          throw updateError;
        }

        setPasswordRecoveryMode(false);
      },
      "Contrasena actualizada. Ya puedes seguir usando Umbra."
    );
  }

  async function handleSignOut() {
    await runAuthAction(async () => {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw signOutError;
      }
    });
  }

  function handleInviteAccepted(payload) {
    setWorkspaceInitialSelection({
      channelId: payload?.channel_id || null,
      guildId: payload?.guild_id || null,
      kind: payload?.guild_id ? "guild" : "dm"
    });
    setInviteBrowserMode(false);
    setInviteCode(pushRoute("/", { replace: true }));
  }

  function handleExitInvite() {
    setInviteBrowserMode(false);
    setInviteCode(pushRoute("/", { replace: true }));
  }

  if (!ready) {
    return (
      <UmbraBootScreen
        subtitle="Cargando tu sesion, credenciales y acceso inicial."
        title="Preparando Umbra..."
      />
    );
  }

  if (!hasSupabaseBrowserConfig || !supabase) {
    return (
      <div className="boot-screen">
        Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para usar Umbra.
      </div>
    );
  }

  if (inviteCode && !session?.user && inviteBrowserMode) {
    return (
      <AuthScreen
        authMessage={message || "Inicia sesion para unirte al servidor en Umbra."}
        busy={busy}
        error={error}
        onGoogleSignIn={handleGoogleSignIn}
        onLogin={handleLogin}
        onOtpSend={handleOtpSend}
        onOtpVerify={handleOtpVerify}
        onPasswordResetConfirm={handlePasswordResetConfirm}
        onPasswordResetRequest={handlePasswordResetRequest}
        onSignup={handleSignup}
        passwordResetMode={passwordRecoveryMode}
      />
    );
  }

  if (inviteCode) {
    return (
      <InviteJoinScreen
        inviteCode={inviteCode}
        onAccept={handleInviteAccepted}
        onBackHome={handleExitInvite}
        onContinueInBrowser={() => setInviteBrowserMode(true)}
        session={session}
      />
    );
  }

  if (!session?.user || !accessToken) {
    return (
        <AuthScreen
          authMessage={message}
          busy={busy}
          error={error}
          language={language}
          onGoogleSignIn={handleGoogleSignIn}
          onLogin={handleLogin}
          onOtpSend={handleOtpSend}
        onOtpVerify={handleOtpVerify}
        onPasswordResetConfirm={handlePasswordResetConfirm}
        onPasswordResetRequest={handlePasswordResetRequest}
        onSignup={handleSignup}
        passwordResetMode={passwordRecoveryMode}
      />
    );
  }

  if (passwordRecoveryMode) {
    return (
      <AuthScreen
        authMessage={message}
        busy={busy}
        error={error}
        onGoogleSignIn={handleGoogleSignIn}
        onLogin={handleLogin}
        onOtpSend={handleOtpSend}
        onOtpVerify={handleOtpVerify}
        onPasswordResetConfirm={handlePasswordResetConfirm}
        onPasswordResetRequest={handlePasswordResetRequest}
        onSignup={handleSignup}
        passwordResetMode
      />
    );
  }

  return (
        <UmbraWorkspace
          accessToken={accessToken}
          initialSelection={workspaceInitialSelection}
          language={language}
          onChangeLanguage={setLanguage}
          onSignOut={handleSignOut}
        />
  );
}

export default function App() {
  return (
    <RootErrorBoundary>
      <AppContent />
    </RootErrorBoundary>
  );
}
