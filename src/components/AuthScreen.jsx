import React, { useState } from "react";

import { UmbraLogo } from "./UmbraLogo.jsx";

export function AuthScreen({
  authMessage,
  busy,
  error,
  onGoogleSignIn,
  onLogin,
  onOtpSend,
  onOtpVerify,
  onSignup
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
  const [otpSent, setOtpSent] = useState(false);

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

  return (
    <div className="auth-shell">
      <div className="auth-backdrop" />

      <section className="auth-brand">
        <div className="auth-brand-top">
          <div className="brand-lockup">
            <UmbraLogo alt="Logo de Umbra" size={68} />
            <div className="brand-lockup-copy">
              <p className="eyebrow">Umbra</p>
              <strong>Arriba como abajo</strong>
            </div>
          </div>

          <h1>Chat with shadows.</h1>
          <p>
            Arriba como abajo. Umbra entra con auth real, backend protegido,
            flujo desktop y una base lista para despliegue.
          </p>
        </div>

        <div className="auth-highlights">
          <div>
            <strong>Realtime</strong>
            <span>Socket.IO, presencia, replies, reacciones y lectura por canal.</span>
          </div>
          <div>
            <strong>Acceso moderno</strong>
            <span>Email, OTP por codigo y soporte preparado para Google OAuth.</span>
          </div>
          <div>
            <strong>Desktop-ready</strong>
            <span>Electron levanta Umbra como app instalable con backend embebido.</span>
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
            Crear cuenta
          </button>
          <button
            className={mode === "login" ? "active" : ""}
            onClick={() => {
              setMode("login");
              setOtpSent(false);
            }}
            type="button"
          >
            Entrar
          </button>
          <button
            className={mode === "otp" ? "active" : ""}
            onClick={() => setMode("otp")}
            type="button"
          >
            Codigo
          </button>
        </div>

        <button className="google-button" disabled={busy} onClick={onGoogleSignIn} type="button">
          Continuar con Google
        </button>

        {mode === "signup" ? (
          <form className="auth-form" onSubmit={handleSignupSubmit}>
            <label>
              <span>Usuario</span>
              <input
                onChange={(event) =>
                  setSignupForm((previous) => ({
                    ...previous,
                    username: event.target.value
                  }))
                }
                placeholder="umbra_user"
                required
                value={signupForm.username}
              />
            </label>
            <label>
              <span>Email</span>
              <input
                onChange={(event) =>
                  setSignupForm((previous) => ({
                    ...previous,
                    email: event.target.value
                  }))
                }
                placeholder="tu@email.com"
                required
                type="email"
                value={signupForm.email}
              />
            </label>
            <label>
              <span>Contrasena</span>
              <input
                minLength={8}
                onChange={(event) =>
                  setSignupForm((previous) => ({
                    ...previous,
                    password: event.target.value
                  }))
                }
                placeholder="Minimo 8 caracteres"
                required
                type="password"
                value={signupForm.password}
              />
            </label>
            <button className="primary-button auth-submit" disabled={busy} type="submit">
              {busy ? "Creando..." : "Crear cuenta"}
            </button>
          </form>
        ) : null}

        {mode === "login" ? (
          <form className="auth-form" onSubmit={handleLoginSubmit}>
            <label>
              <span>Email</span>
              <input
                onChange={(event) =>
                  setLoginForm((previous) => ({
                    ...previous,
                    email: event.target.value
                  }))
                }
                placeholder="tu@email.com"
                required
                type="email"
                value={loginForm.email}
              />
            </label>
            <label>
              <span>Contrasena</span>
              <input
                onChange={(event) =>
                  setLoginForm((previous) => ({
                    ...previous,
                    password: event.target.value
                  }))
                }
                placeholder="Tu contrasena"
                required
                type="password"
                value={loginForm.password}
              />
            </label>
            <button className="primary-button auth-submit" disabled={busy} type="submit">
              {busy ? "Entrando..." : "Entrar en Umbra"}
            </button>
          </form>
        ) : null}

        {mode === "otp" ? (
          <form className="auth-form" onSubmit={otpSent ? handleOtpVerify : handleOtpSend}>
            <label>
              <span>Email</span>
              <input
                onChange={(event) =>
                  setOtpForm((previous) => ({
                    ...previous,
                    email: event.target.value
                  }))
                }
                placeholder="tu@email.com"
                required
                type="email"
                value={otpForm.email}
              />
            </label>

            {!otpSent ? (
              <label>
                <span>Usuario inicial</span>
                <input
                  onChange={(event) =>
                    setOtpForm((previous) => ({
                      ...previous,
                      username: event.target.value
                    }))
                  }
                  placeholder="Solo para usuarios nuevos"
                  value={otpForm.username}
                />
              </label>
            ) : (
              <label>
                <span>Codigo recibido</span>
                <input
                  onChange={(event) =>
                    setOtpForm((previous) => ({
                      ...previous,
                      code: event.target.value
                    }))
                  }
                  placeholder="123456"
                  required
                  value={otpForm.code}
                />
              </label>
            )}

            <button className="primary-button auth-submit" disabled={busy} type="submit">
              {busy
                ? "Procesando..."
                : otpSent
                  ? "Verificar codigo"
                  : "Enviar codigo de acceso"}
            </button>
          </form>
        ) : null}

        {authMessage ? <p className="auth-message success">{authMessage}</p> : null}
        {error ? <p className="auth-message error">{error}</p> : null}
      </section>
    </div>
  );
}
