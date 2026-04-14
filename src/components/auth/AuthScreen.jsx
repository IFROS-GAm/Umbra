import React, { useState } from "react";

import { translate } from "../../i18n.js";
import { UmbraLogo } from "../UmbraLogo.jsx";

export function AuthScreen({
  authMessage,
  busy,
  error,
  language = "es",
  onGoogleSignIn,
  onLogin,
  onOtpSend,
  onOtpVerify,
  onPasswordResetConfirm,
  onPasswordResetRequest,
  onSignup,
  passwordResetMode = false
}) {
  const [mode, setMode] = useState("signup");
  const [loginForm, setLoginForm] = useState({
    email: "",
    password: ""
  });
  const [signupForm, setSignupForm] = useState({
    email: "",
    password: "",
    username: ""
  });
  const [otpForm, setOtpForm] = useState({
    code: "",
    email: "",
    username: ""
  });
  const [recoveryForm, setRecoveryForm] = useState({
    email: ""
  });
  const [resetForm, setResetForm] = useState({
    confirmPassword: "",
    password: ""
  });
  const [otpSent, setOtpSent] = useState(false);
  const t = (key, fallback = "") => translate(language, key, fallback);

  React.useEffect(() => {
    if (passwordResetMode) {
      setMode("reset");
      setOtpSent(false);
    }
  }, [passwordResetMode]);

  async function handleLoginSubmit(event) {
    event.preventDefault();
    await onLogin(loginForm);
  }

  async function handleSignupSubmit(event) {
    event.preventDefault();
    await onSignup(signupForm);
  }

  async function handleOtpSend(event) {
    event.preventDefault();
    await onOtpSend(otpForm);
    setOtpSent(true);
  }

  async function handleOtpVerify(event) {
    event.preventDefault();
    await onOtpVerify(otpForm);
  }

  async function handleRecoverySubmit(event) {
    event.preventDefault();
    await onPasswordResetRequest?.(recoveryForm);
  }

  async function handleResetSubmit(event) {
    event.preventDefault();
    await onPasswordResetConfirm?.(resetForm);
  }

  return (
    <div className="auth-shell">
      <div className="auth-backdrop" />

      <section className="auth-brand">
        <div className="auth-brand-top">
          <div className="brand-lockup">
            <UmbraLogo alt="Logo de Umbra" size={68} />
            <div className="brand-lockup-copy">
              <p className="eyebrow">Umbra</p>
              <strong>{t("auth.brand.tagline", "Arriba como abajo")}</strong>
            </div>
          </div>

          <h1>{t("auth.hero.title", "Chat with shadows.")}</h1>
          <p>
            {t(
              "auth.hero.copy",
              "Arriba como abajo. Umbra entra con auth real, backend protegido, flujo desktop y una base lista para despliegue."
            )}
          </p>
        </div>

        <div className="auth-highlights">
          <div>
            <strong>{t("auth.highlight.realtime.title", "Realtime")}</strong>
            <span>
              {t(
                "auth.highlight.realtime.body",
                "Socket.IO, presencia, replies, reacciones y lectura por canal."
              )}
            </span>
          </div>
          <div>
            <strong>{t("auth.highlight.access.title", "Acceso moderno")}</strong>
            <span>
              {t(
                "auth.highlight.access.body",
                "Email, OTP por codigo y soporte preparado para Google OAuth."
              )}
            </span>
          </div>
          <div>
            <strong>{t("auth.highlight.desktop.title", "Desktop-ready")}</strong>
            <span>
              {t(
                "auth.highlight.desktop.body",
                "Electron levanta Umbra como app instalable con backend embebido."
              )}
            </span>
          </div>
        </div>
      </section>

      <section className="auth-card">
        <div className="auth-tabs">
          <button
            className={mode === "signup" ? "active" : ""}
            onClick={() => {
              setMode("signup");
              setOtpSent(false);
            }}
            type="button"
          >
            {t("auth.tab.signup", "Crear cuenta")}
          </button>
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setOtpSent(false);
            }}
            type="button"
          >
            {t("auth.tab.login", "Entrar")}
          </button>
          <button
            className={mode === "otp" ? "active" : ""}
            onClick={() => setMode("otp")}
            type="button"
          >
            {t("auth.tab.otp", "Codigo / link")}
          </button>
        </div>

        <button className="google-button" disabled={busy} onClick={onGoogleSignIn} type="button">
          {t("auth.google", "Continuar con Google")}
        </button>

        {mode === "signup" ? (
          <form className="auth-form" onSubmit={handleSignupSubmit}>
            <label>
              <span>{t("auth.user", "Usuario")}</span>
              <input
                onChange={(event) =>
                  setSignupForm((previous) => ({
                    ...previous,
                    username: event.target.value
                  }))
                }
                placeholder={t("auth.placeholder.user", "umbra_user")}
                required
                value={signupForm.username}
              />
            </label>
            <label>
              <span>{t("auth.email", "Email")}</span>
              <input
                onChange={(event) =>
                  setSignupForm((previous) => ({
                    ...previous,
                    email: event.target.value
                  }))
                }
                placeholder={t("auth.placeholder.email", "tu@email.com")}
                required
                type="email"
                value={signupForm.email}
              />
            </label>
            <label>
              <span>{t("auth.password", "Contrasena")}</span>
              <input
                minLength={8}
                onChange={(event) =>
                  setSignupForm((previous) => ({
                    ...previous,
                    password: event.target.value
                  }))
                }
                placeholder={t("auth.placeholder.password", "Minimo 8 caracteres")}
                required
                type="password"
                value={signupForm.password}
              />
            </label>
            <button className="primary-button auth-submit" disabled={busy} type="submit">
              {busy
                ? t("auth.busy.creating", "Creando...")
                : t("auth.submit.signup", "Crear cuenta")}
            </button>
          </form>
        ) : null}

        {mode === "login" ? (
          <form className="auth-form" onSubmit={handleLoginSubmit}>
            <label>
              <span>{t("auth.email", "Email")}</span>
              <input
                onChange={(event) =>
                  setLoginForm((previous) => ({
                    ...previous,
                    email: event.target.value
                  }))
                }
                placeholder={t("auth.placeholder.email", "tu@email.com")}
                required
                type="email"
                value={loginForm.email}
              />
            </label>
            <label>
              <span>{t("auth.password", "Contrasena")}</span>
              <input
                onChange={(event) =>
                  setLoginForm((previous) => ({
                    ...previous,
                    password: event.target.value
                  }))
                }
                placeholder={t("auth.placeholder.loginPassword", "Tu contrasena")}
                required
                type="password"
                value={loginForm.password}
              />
            </label>
            <button className="primary-button auth-submit" disabled={busy} type="submit">
              {busy
                ? t("auth.busy.entering", "Entrando...")
                : t("auth.submit.login", "Entrar en Umbra")}
            </button>
            <button
              className="ghost-button auth-secondary-action"
              disabled={busy}
              onClick={() => setMode("recover")}
              type="button"
            >
              {t("auth.recover", "Olvide mi contrasena")}
            </button>
          </form>
        ) : null}

        {mode === "otp" ? (
          <form className="auth-form" onSubmit={otpSent ? handleOtpVerify : handleOtpSend}>
            <label>
              <span>{t("auth.email", "Email")}</span>
              <input
                onChange={(event) =>
                  setOtpForm((previous) => ({
                    ...previous,
                    email: event.target.value
                  }))
                }
                placeholder={t("auth.placeholder.email", "tu@email.com")}
                required
                type="email"
                value={otpForm.email}
              />
            </label>

            {!otpSent ? (
              <label>
                <span>{t("auth.initialUser", "Usuario inicial")}</span>
                <input
                  onChange={(event) =>
                    setOtpForm((previous) => ({
                      ...previous,
                      username: event.target.value
                    }))
                  }
                  placeholder={t("auth.placeholder.initialUser", "Solo para usuarios nuevos")}
                  value={otpForm.username}
                />
              </label>
            ) : (
              <label>
                <span>{t("auth.receivedCode", "Codigo recibido")}</span>
                <input
                  onChange={(event) =>
                    setOtpForm((previous) => ({
                      ...previous,
                      code: event.target.value
                    }))
                  }
                  placeholder={t("auth.placeholder.code", "123456")}
                  required
                  value={otpForm.code}
                />
              </label>
            )}

            <button className="primary-button auth-submit" disabled={busy} type="submit">
              {busy
                ? t("auth.submit.processing", "Procesando...")
                : otpSent
                  ? t("auth.submit.verifyCode", "Verificar codigo")
                  : t("auth.submit.sendOtp", "Enviar codigo o magic link")}
            </button>
          </form>
        ) : null}

        {mode === "recover" ? (
          <form className="auth-form" onSubmit={handleRecoverySubmit}>
            <label>
              <span>{t("auth.email", "Email")}</span>
              <input
                onChange={(event) =>
                  setRecoveryForm((previous) => ({
                    ...previous,
                    email: event.target.value
                  }))
                }
                placeholder={t("auth.placeholder.email", "tu@email.com")}
                required
                type="email"
                value={recoveryForm.email}
              />
            </label>
            <button className="primary-button auth-submit" disabled={busy} type="submit">
              {busy
                ? t("auth.busy.sending", "Enviando...")
                : t("auth.submit.sendRecovery", "Enviar enlace de recuperacion")}
            </button>
            <button
              className="ghost-button auth-secondary-action"
              disabled={busy}
              onClick={() => setMode("login")}
              type="button"
            >
              {t("auth.backToLogin", "Volver a entrar")}
            </button>
          </form>
        ) : null}

        {mode === "reset" ? (
          <form className="auth-form" onSubmit={handleResetSubmit}>
            <label>
              <span>{t("auth.newPassword", "Nueva contrasena")}</span>
              <input
                minLength={8}
                onChange={(event) =>
                  setResetForm((previous) => ({
                    ...previous,
                    password: event.target.value
                  }))
                }
                placeholder={t("auth.placeholder.password", "Minimo 8 caracteres")}
                required
                type="password"
                value={resetForm.password}
              />
            </label>
            <label>
              <span>{t("auth.confirmPassword", "Confirmar contrasena")}</span>
              <input
                minLength={8}
                onChange={(event) =>
                  setResetForm((previous) => ({
                    ...previous,
                    confirmPassword: event.target.value
                  }))
                }
                placeholder={t("auth.placeholder.resetConfirm", "Repite la contrasena")}
                required
                type="password"
                value={resetForm.confirmPassword}
              />
            </label>
            <button className="primary-button auth-submit" disabled={busy} type="submit">
              {busy
                ? t("auth.busy.saving", "Guardando...")
                : t("auth.submit.savePassword", "Actualizar contrasena")}
            </button>
          </form>
        ) : null}

        {authMessage ? <p className="auth-message success">{authMessage}</p> : null}
        {error ? <p className="auth-message error">{error}</p> : null}
      </section>
    </div>
  );
}
