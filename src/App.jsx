import React, { useEffect, useMemo, useState } from "react";

import { AuthScreen } from "./components/AuthScreen.jsx";
import { UmbraWorkspace } from "./components/UmbraWorkspace.jsx";
import { hasSupabaseBrowserConfig, supabase } from "./supabase-browser.js";

function getDesktopBridge() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.umbraDesktop || null;
}

function getAuthRedirectUrl() {
  const desktop = getDesktopBridge();
  return desktop?.redirectUri || window.location.origin;
}

export default function App() {
  const [session, setSession] = useState(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!supabase) {
      setReady(true);
      return undefined;
    }

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (sessionError) {
        setError(sessionError.message);
      } else {
        setSession(data.session);
      }

      setReady(true);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => subscription.unsubscribe();
  }, []);

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

          setMessage("Correo verificado correctamente.");
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
      "Codigo enviado. Revisa tu correo y escribe el token para entrar."
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

  async function handleSignOut() {
    await runAuthAction(async () => {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        throw signOutError;
      }
    });
  }

  if (!ready) {
    return <div className="boot-screen">Preparando Umbra...</div>;
  }

  if (!hasSupabaseBrowserConfig || !supabase) {
    return (
      <div className="boot-screen">
        Configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` para usar Umbra.
      </div>
    );
  }

  if (!session?.user || !accessToken) {
    return (
      <AuthScreen
        authMessage={message}
        busy={busy}
        error={error}
        onGoogleSignIn={handleGoogleSignIn}
        onLogin={handleLogin}
        onOtpSend={handleOtpSend}
        onOtpVerify={handleOtpVerify}
        onSignup={handleSignup}
      />
    );
  }

  return <UmbraWorkspace accessToken={accessToken} onSignOut={handleSignOut} />;
}
