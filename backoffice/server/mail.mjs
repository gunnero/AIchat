import nodemailer from "nodemailer";
import { z } from "zod";

export function invitationMessage({ email, name, locale, url, role }) {
  const da = locale === "da";
  return {
    to: email,
    subject: da
      ? "Din invitation til AI Kundetypeassistent"
      : "Your invitation to AI Kundetypeassistent",
    text: da
      ? `Hej ${name},\n\nDu er inviteret som ${role === "admin" ? "Admin" : "Customer"} til AI Kundetypeassistent.\n\nÅbn dette personlige link for at vælge dit brugernavn og din adgangskode samt tilknytte din authenticator (obligatorisk 2FA):\n\n${url}\n\nLinket kan kun bruges én gang og udløber efter 48 timer. Del det ikke med andre. Hvis du ikke forventede invitationen, kan du ignorere denne e-mail.\n\nAI Kundetypeassistent\nDette er en automatisk e-mail. Svar ikke på denne adresse.`
      : `Hello ${name},\n\nYou are invited as ${role === "admin" ? "Admin" : "Customer"} to AI Kundetypeassistent.\n\nOpen your personal link to choose your username and password and connect your authenticator (required 2FA):\n\n${url}\n\nThis link can only be used once and expires after 48 hours. Do not share it. If you did not expect this invitation, you can ignore this email.\n\nAI Kundetypeassistent\nThis is an automated email. Please do not reply to this address.`,
  };
}

// Fixed loopback destination, verified STARTTLS and no file/URL content loading.
// Local SMTP avoids setgid mail helpers under systemd NoNewPrivileges.
export function localMailer(
  from,
  { createTransport = nodemailer.createTransport } = {},
) {
  z.email().parse(from);
  if (!/^[\x21-\x7e]+$/.test(from)) throw new Error("Invalid sender");
  const transport = createTransport({
    host: "127.0.0.1",
    port: 25,
    secure: false,
    requireTLS: true,
    tls: { servername: "jig.123url.dk", rejectUnauthorized: true },
    connectionTimeout: 3000,
    greetingTimeout: 3000,
    socketTimeout: 10000,
    disableFileAccess: true,
    disableUrlAccess: true,
    maxRecipients: 1,
    logger: false,
    debug: false,
    transactionLog: false,
  });
  return async ({ to, subject, text }) => {
    z.email().parse(to);
    if (!/^[\x21-\x7e]+$/.test(to)) return false;
    try {
      const info = await transport.sendMail({
        from: { name: "AI Kundetypeassistent", address: from },
        to: { address: to },
        envelope: { from, to: [to] },
        subject,
        text,
        headers: { "Auto-Submitted": "auto-generated" },
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      return info.accepted?.length === 1 && info.rejected?.length === 0;
    } catch {
      return false;
    }
  };
}
