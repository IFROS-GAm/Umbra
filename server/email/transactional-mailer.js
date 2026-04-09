import nodemailer from "nodemailer";

const MAIL_FROM_NAME = process.env.MAIL_FROM_NAME || "Umbra";
const MAIL_FROM_EMAIL = process.env.MAIL_FROM_EMAIL || "";
const SMTP_HOST = process.env.SMTP_HOST || "";
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_SECURE = String(process.env.SMTP_SECURE || "").toLowerCase() === "true";
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_REPLY_TO = process.env.SMTP_REPLY_TO || MAIL_FROM_EMAIL;
const PUBLIC_APP_URL = process.env.PUBLIC_APP_URL || "http://localhost:5173";

let transporterPromise = null;

function escapeHtml(value = "") {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function hasMailerConfig() {
  return Boolean(SMTP_HOST && SMTP_PORT && SMTP_USER && SMTP_PASS && MAIL_FROM_EMAIL);
}

async function getTransporter() {
  if (!hasMailerConfig()) {
    const error = new Error(
      "Umbra aun no tiene SMTP configurado. Agrega SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y MAIL_FROM_EMAIL."
    );
    error.statusCode = 400;
    throw error;
  }

  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        auth: {
          pass: SMTP_PASS,
          user: SMTP_USER
        },
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_SECURE
      })
    );
  }

  return transporterPromise;
}

function buildUmbraTemplate({
  actionLabel,
  actionUrl,
  intro,
  preheader,
  recipientEmail,
  title
}) {
  const safeTitle = escapeHtml(title);
  const safeIntro = escapeHtml(intro);
  const safeRecipientEmail = escapeHtml(recipientEmail);
  const safePreheader = escapeHtml(preheader);
  const safeActionLabel = escapeHtml(actionLabel);
  const safeActionUrl = escapeHtml(actionUrl || PUBLIC_APP_URL);

  const text = [
    title,
    "",
    intro,
    "",
    `Destino: ${recipientEmail}`,
    "",
    `Abrir Umbra: ${actionUrl || PUBLIC_APP_URL}`
  ].join("\n");

  const html = `<!doctype html>
<html lang="es">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
  </head>
  <body style="margin:0;padding:0;background:#0d0f14;color:#f2f4f8;font-family:Inter,Segoe UI,Arial,sans-serif;">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${safePreheader}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0d0f14;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#151922;border:1px solid rgba(255,255,255,0.07);border-radius:22px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px;background:linear-gradient(135deg,#5d6cf8 0%,#243056 55%,#141922 100%);">
                <div style="font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:#c4ceff;font-weight:800;">Umbra</div>
                <div style="margin-top:8px;font-size:30px;line-height:1.15;font-weight:800;color:#ffffff;">${safeTitle}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px 14px;">
                <p style="margin:0 0 16px;font-size:16px;line-height:1.7;color:#d7deec;">${safeIntro}</p>
                <div style="margin:0 0 18px;padding:16px 18px;border-radius:16px;background:#0f131a;border:1px solid rgba(255,255,255,0.06);">
                  <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#9ba7c1;font-weight:700;">Correo destino</div>
                  <div style="margin-top:8px;font-size:16px;color:#ffffff;font-weight:700;">${safeRecipientEmail}</div>
                </div>
                <a href="${safeActionUrl}" style="display:inline-block;padding:14px 22px;border-radius:14px;background:#6a73ff;color:#ffffff;text-decoration:none;font-weight:800;font-size:15px;">${safeActionLabel}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 28px;color:#92a0bc;font-size:13px;line-height:1.6;">
                Este correo fue enviado por Umbra para validar que tu ruta de acceso o recuperacion siga disponible.
                Si no esperabas este mensaje, puedes ignorarlo sin problema.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { html, text };
}

export async function sendUmbraTransactionalEmail({
  actionLabel = "Abrir Umbra",
  actionUrl = PUBLIC_APP_URL,
  intro,
  preheader,
  subject,
  to,
  title
}) {
  const transporter = await getTransporter();
  const { html, text } = buildUmbraTemplate({
    actionLabel,
    actionUrl,
    intro,
    preheader,
    recipientEmail: to,
    title
  });

  await transporter.sendMail({
    from: `"${MAIL_FROM_NAME}" <${MAIL_FROM_EMAIL}>`,
    html,
    replyTo: SMTP_REPLY_TO || undefined,
    subject,
    text,
    to
  });

  return {
    provider: "smtp",
    to
  };
}

export function canSendUmbraEmails() {
  return hasMailerConfig();
}
