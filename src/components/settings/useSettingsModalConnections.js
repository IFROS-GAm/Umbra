import { useEffect, useMemo, useState } from "react";

import { api } from "../../api.js";
import { hasSupabaseBrowserConfig, supabase } from "../../supabase-browser.js";
import { sanitizeUsername } from "../../utils.js";
import {
  RECOVERY_PROVIDER_OPTIONS,
  SOCIAL_PLATFORM_OPTIONS,
  getLocalizedRecoveryPlaceholder,
  isEmailAddress,
  maskEmail,
  normalizeRecoveryAccount,
  normalizeRecoveryProvider
} from "../settingsModalHelpers.js";

export function useSettingsModalConnections({
  form,
  locale,
  normalizedProfileColor,
  onUpdateProfile,
  privacySettings,
  publicSocialLinks,
  setError,
  setSaved,
  user
}) {
  const [connectionsBusy, setConnectionsBusy] = useState("");
  const [authEmailDraft, setAuthEmailDraft] = useState(user.email || "");
  const [inviteEmailDraft, setInviteEmailDraft] = useState("");
  const [newPasswordDraft, setNewPasswordDraft] = useState("");
  const [confirmPasswordDraft, setConfirmPasswordDraft] = useState("");
  const [reauthNonceDraft, setReauthNonceDraft] = useState("");

  useEffect(() => {
    setConnectionsBusy("");
    setAuthEmailDraft(user.email || "");
    setInviteEmailDraft("");
    setNewPasswordDraft("");
    setConfirmPasswordDraft("");
    setReauthNonceDraft("");
  }, [user]);

  const recoveryProvider = normalizeRecoveryProvider(form.recoveryProvider);
  const recoveryProviderMeta =
    RECOVERY_PROVIDER_OPTIONS.find((option) => option.value === recoveryProvider) ||
    RECOVERY_PROVIDER_OPTIONS[0];
  const emailConfirmed = Boolean(user.email_confirmed_at);
  const recoveryAccount = normalizeRecoveryAccount(form.recoveryAccount);
  const recoveryLooksLikeEmail = isEmailAddress(recoveryAccount);
  const authProviderLabel = String(user.auth_provider || "email").toUpperCase();

  const connectionSummaryItems = useMemo(
    () => [
      {
        id: "primary-email",
        helper: emailConfirmed
          ? locale.connections.summary.primaryHelperReady
          : locale.connections.summary.primaryHelperPending,
        icon: "mail",
        label: locale.connections.summary.primary,
        value: user.email ? maskEmail(user.email) : locale.connections.noEmail
      },
      {
        id: "provider",
        helper: emailConfirmed
          ? locale.connections.summary.providerReady
          : locale.connections.summary.providerPending,
        icon: "settings",
        label: locale.connections.summary.provider,
        value: authProviderLabel
      },
      {
        id: "recovery",
        helper: recoveryLooksLikeEmail
          ? locale.connections.summary.recoveryReady
          : locale.connections.summary.recoveryPending,
        icon: "link",
        label: locale.connections.summary.recovery,
        value: recoveryProvider
          ? locale.recoveryProviders[recoveryProvider] || recoveryProviderMeta.label
          : locale.connections.summary.noConfig
      },
      {
        id: "links",
        helper: privacySettings.showSocialLinks
          ? locale.connections.summary.publicVisible
          : locale.connections.summary.publicHidden,
        icon: "sparkles",
        label: locale.connections.summary.public,
        value: privacySettings.showSocialLinks
          ? `${publicSocialLinks.length} ${
              publicSocialLinks.length === 1
                ? locale.connections.summary.linkSingular
                : locale.connections.summary.linkPlural
            }`
          : locale.connections.summary.hidden
      }
    ],
    [
      authProviderLabel,
      emailConfirmed,
      locale.connections.noEmail,
      locale.connections.summary.hidden,
      locale.connections.summary.linkPlural,
      locale.connections.summary.linkSingular,
      locale.connections.summary.noConfig,
      locale.connections.summary.primary,
      locale.connections.summary.primaryHelperPending,
      locale.connections.summary.primaryHelperReady,
      locale.connections.summary.provider,
      locale.connections.summary.providerPending,
      locale.connections.summary.providerReady,
      locale.connections.summary.public,
      locale.connections.summary.publicHidden,
      locale.connections.summary.publicVisible,
      locale.connections.summary.recovery,
      locale.connections.summary.recoveryPending,
      locale.connections.summary.recoveryReady,
      locale.recoveryProviders,
      privacySettings.showSocialLinks,
      publicSocialLinks.length,
      recoveryLooksLikeEmail,
      recoveryProvider,
      recoveryProviderMeta.label,
      user.email
    ]
  );

  async function handleSendPrimaryEmailCheck() {
    if (!user.email) {
      setError("No hay un correo principal asociado a esta cuenta.");
      return;
    }

    setConnectionsBusy("primary-email");
    setError("");
    setSaved("");

    try {
      const payload = await api.sendEmailCheck({
        emailRedirectTo:
          typeof window !== "undefined" ? window.location.origin : undefined,
        target: "primary"
      });

      setSaved(
        payload?.kind === "confirmation"
          ? "Correo de confirmacion enviado al principal."
          : "Correo de prueba enviado al principal."
      );
    } catch (sendError) {
      setError(sendError.message || "No se pudo enviar la comprobacion al correo principal.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handleSendRecoveryEmailCheck() {
    if (!recoveryAccount) {
      setError("Configura primero una cuenta de respaldo.");
      return;
    }

    if (!recoveryLooksLikeEmail) {
      setError("El respaldo debe ser un correo valido para poder recibir una comprobacion.");
      return;
    }

    setConnectionsBusy("recovery-email");
    setError("");
    setSaved("");

    try {
      await api.sendEmailCheck({
        emailRedirectTo:
          typeof window !== "undefined" ? window.location.origin : undefined,
        target: "recovery"
      });

      setSaved("Correo de prueba enviado al respaldo.");
    } catch (sendError) {
      setError(sendError.message || "No se pudo enviar la comprobacion al correo de respaldo.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handlePrimaryEmailChange() {
    const nextEmail = String(authEmailDraft || "").trim().toLowerCase();
    if (!nextEmail) {
      setError("Ingresa el nuevo correo principal.");
      return;
    }

    if (!isEmailAddress(nextEmail)) {
      setError("Ingresa un correo principal valido.");
      return;
    }

    if (!hasSupabaseBrowserConfig || !supabase) {
      setError("Supabase no esta configurado en este entorno.");
      return;
    }

    setConnectionsBusy("change-email");
    setError("");
    setSaved("");

    try {
      const { error: updateError } = await supabase.auth.updateUser(
        {
          email: nextEmail
        },
        {
          emailRedirectTo:
            typeof window !== "undefined" ? window.location.origin : undefined
        }
      );

      if (updateError) {
        throw updateError;
      }

      setSaved(
        "Solicitud de cambio de correo enviada. Revisa tu correo actual y el nuevo para confirmar."
      );
    } catch (updateError) {
      setError(updateError.message || "No se pudo iniciar el cambio de correo.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handleSendReauthentication() {
    if (!hasSupabaseBrowserConfig || !supabase) {
      setError("Supabase no esta configurado en este entorno.");
      return;
    }

    setConnectionsBusy("reauth");
    setError("");
    setSaved("");

    try {
      const { error: reauthError } = await supabase.auth.reauthenticate();
      if (reauthError) {
        throw reauthError;
      }

      setSaved("Codigo de reautenticacion enviado al correo principal.");
    } catch (reauthError) {
      setError(reauthError.message || "No se pudo enviar el codigo de reautenticacion.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handlePasswordChange() {
    if (!hasSupabaseBrowserConfig || !supabase) {
      setError("Supabase no esta configurado en este entorno.");
      return;
    }

    if (String(newPasswordDraft || "").length < 8) {
      setError("La nueva contrasena debe tener al menos 8 caracteres.");
      return;
    }

    if (newPasswordDraft !== confirmPasswordDraft) {
      setError("Las contrasenas nuevas no coinciden.");
      return;
    }

    setConnectionsBusy("password");
    setError("");
    setSaved("");

    try {
      const payload = {
        password: newPasswordDraft
      };

      if (String(reauthNonceDraft || "").trim()) {
        payload.nonce = String(reauthNonceDraft).trim();
      }

      const { error: passwordError } = await supabase.auth.updateUser(payload);
      if (passwordError) {
        throw passwordError;
      }

      setNewPasswordDraft("");
      setConfirmPasswordDraft("");
      setReauthNonceDraft("");
      setSaved("Contrasena actualizada correctamente.");
    } catch (passwordError) {
      setError(passwordError.message || "No se pudo actualizar la contrasena.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handleInviteUmbraByEmail() {
    const email = String(inviteEmailDraft || "").trim().toLowerCase();
    if (!email) {
      setError("Ingresa un correo para enviar la invitacion.");
      return;
    }

    if (!isEmailAddress(email)) {
      setError("Ingresa un correo valido para invitar a Umbra.");
      return;
    }

    setConnectionsBusy("invite-user");
    setError("");
    setSaved("");

    try {
      await api.inviteUmbraUser({
        email,
        redirectTo: typeof window !== "undefined" ? window.location.origin : undefined
      });
      setInviteEmailDraft("");
      setSaved("Invitacion enviada. La otra persona recibira un acceso para crear su cuenta.");
    } catch (inviteError) {
      setError(inviteError.message || "No se pudo enviar la invitacion a Umbra.");
    } finally {
      setConnectionsBusy("");
    }
  }

  async function handleConnectionsSave() {
    setConnectionsBusy("recovery");
    setError("");
    setSaved("");

    try {
      await onUpdateProfile({
        avatarHue: form.avatarHue,
        bio: form.bio,
        customStatus: form.customStatus,
        privacySettings,
        profileColor: normalizedProfileColor,
        recoveryAccount: normalizeRecoveryAccount(form.recoveryAccount),
        recoveryProvider,
        socialLinks: publicSocialLinks,
        username: sanitizeUsername(form.username)
      });

      setSaved("Conexiones actualizadas.");
    } catch (saveError) {
      setError(saveError.message || "No se pudieron guardar las conexiones.");
    } finally {
      setConnectionsBusy("");
    }
  }

  return {
    authEmailDraft,
    confirmPasswordDraft,
    connectionSummaryItems,
    connectionsBusy,
    emailConfirmed,
    handleConnectionsSave,
    handleInviteUmbraByEmail,
    handlePasswordChange,
    handlePrimaryEmailChange,
    handleSendPrimaryEmailCheck,
    handleSendReauthentication,
    handleSendRecoveryEmailCheck,
    inviteEmailDraft,
    newPasswordDraft,
    reauthNonceDraft,
    recoveryAccount,
    recoveryLooksLikeEmail,
    recoveryProvider,
    recoveryProviderMeta,
    setAuthEmailDraft,
    setConfirmPasswordDraft,
    setInviteEmailDraft,
    setNewPasswordDraft,
    setReauthNonceDraft
  };
}

export {
  RECOVERY_PROVIDER_OPTIONS,
  SOCIAL_PLATFORM_OPTIONS,
  getLocalizedRecoveryPlaceholder,
  maskEmail
};
