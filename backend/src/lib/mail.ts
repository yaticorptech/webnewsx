import { env } from "../env.js";

export type Mail = { to: string; subject: string; text: string; html: string };

/**
 * Sends one transactional email through Resend's HTTP API (no SDK needed). Without RESEND_API_KEY nothing is sent:
 * development prints the message (with its link) to this terminal so the flow can be tried locally; production logs
 * that the email was dropped. Throws when Resend refuses the message.
 */
export async function sendMail(mail: Mail): Promise<void> {
  if (!env.RESEND_API_KEY) {
    if (env.isProduction) {
      console.error(`[mail] RESEND_API_KEY isn't set: "${mail.subject}" was not sent.`);
    } else if (!env.isTest) {
      console.info(`\n[mail] (not sent: no RESEND_API_KEY) to ${mail.to} — ${mail.subject}\n${mail.text}\n`);
    }
    return;
  }
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: env.MAIL_FROM, to: [mail.to], subject: mail.subject, text: mail.text, html: mail.html }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    // Resend's error body names the problem (unverified domain, bad key…); never the key itself.
    throw new Error(`Resend refused the email (${response.status}): ${(await response.text()).slice(0, 300)}`);
  }
}

const HTML_ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c);
}

/** The "reset your password" email: one button, the link spelled out, and how long it lasts. */
export function passwordResetMail({ to, name, url, minutes }: { to: string; name: string; url: string; minutes: number }): Mail {
  const greeting = name.trim() ? `Hi ${name.trim()},` : "Hi,";
  const text = [
    greeting,
    "",
    "Someone asked to reset the password of your WebNEWS account. Open this link to choose a new one:",
    url,
    "",
    `The link works once and expires in ${minutes} minutes. If you didn't ask for this, ignore this email: your password stays the same.`,
    "",
    "— WebNEWS",
  ].join("\n");
  const safeUrl = escapeHtml(url);
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f7;font-family:Arial,Helvetica,sans-serif;color:#16181d">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:16px;border-top:4px solid #d22e2a">
    <tr><td style="padding:28px 28px 8px;font-size:22px;font-weight:900;letter-spacing:-0.5px">Web<span style="color:#d22e2a">NEWS</span></td></tr>
    <tr><td style="padding:8px 28px 0;font-size:15px;line-height:1.6">
      <p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 20px">Someone asked to reset the password of your WebNEWS account. Choose a new one here:</p>
      <p style="margin:0 0 20px"><a href="${safeUrl}" style="display:inline-block;background:#d22e2a;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">Reset password</a></p>
      <p style="margin:0 0 20px;font-size:13px;color:#5b5f6b">Or paste this link into your browser:<br><a href="${safeUrl}" style="color:#d22e2a;word-break:break-all">${safeUrl}</a></p>
      <p style="margin:0 0 28px;font-size:13px;color:#5b5f6b">The link works once and expires in ${minutes} minutes. If you didn't ask for this, ignore this email: your password stays the same.</p>
    </td></tr>
  </table>
</body></html>`;
  return { to, subject: "Reset your WebNEWS password", text, html };
}

/**
 * Press meet emails (owner 2026-10-01): invitations and reminders — a heading, a few lines, one button. Sent alongside
 * the bell notification; without RESEND_API_KEY they're only printed in development (see sendMail).
 */
export function pressMeetMail({
  to,
  name,
  subject,
  heading,
  lines,
  cta,
  url,
}: {
  to: string;
  name: string;
  subject: string;
  heading: string;
  lines: string[];
  cta: string;
  url: string;
}): Mail {
  const greeting = name.trim() ? `Hi ${name.trim()},` : "Hi,";
  const text = [greeting, "", heading, "", ...lines, "", `${cta}: ${url}`, "", "— WebNEWS Press Meet"].join("\n");
  const safeUrl = escapeHtml(url);
  const paragraphs = lines.map((line) => `<p style="margin:0 0 12px">${escapeHtml(line)}</p>`).join("");
  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f6f6f7;font-family:Arial,Helvetica,sans-serif;color:#16181d">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:16px;border-top:4px solid #e30613">
    <tr><td style="padding:28px 28px 4px;font-size:22px;font-weight:900;letter-spacing:-0.5px">Web<span style="color:#e30613">NEWS</span> <span style="font-size:12px;font-weight:700;letter-spacing:1.5px;color:#e30613;text-transform:uppercase">Press Meet</span></td></tr>
    <tr><td style="padding:12px 28px 0;font-size:15px;line-height:1.6">
      <p style="margin:0 0 12px">${escapeHtml(greeting)}</p>
      <p style="margin:0 0 16px;font-size:17px;font-weight:700">${escapeHtml(heading)}</p>
      ${paragraphs}
      <p style="margin:8px 0 28px"><a href="${safeUrl}" style="display:inline-block;background:#e30613;color:#ffffff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:999px">${escapeHtml(cta)}</a></p>
    </td></tr>
  </table>
</body></html>`;
  return { to, subject, text, html };
}
