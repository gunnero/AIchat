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

export function recoveryMessage({ email, locale, url }) {
  const da = locale === "da";
  return {
    to: email,
    subject: da
      ? "Gendan din konto · AI Kundetypeassistent"
      : "Recover your account · AI Kundetypeassistent",
    text: da
      ? `Du har bedt om at gendanne din konto.\n\n${url}\n\nLinket udløber efter 30 minutter og kan kun fuldføre én gendannelse. Du skal også bruge din authenticator eller din adgangskode og en gendannelseskode. Hvis du ikke har bedt om dette, skal du ignorere beskeden. Dine loginoplysninger ændres ikke, før gendannelsen er bekræftet.\n\nDel aldrig linket eller dine koder med andre.\nAI Kundetypeassistent`
      : `You requested account recovery.\n\n${url}\n\nThis link expires after 30 minutes and can complete only one recovery. You also need your authenticator, or your password and a recovery code. If you did not request this, ignore this message. Your sign-in details do not change until recovery is verified.\n\nNever share this link or your codes.\nAI Kundetypeassistent`,
  };
}
export function securityNotice({ email, locale, kind, url }) {
  const da = locale === "da",
    factor = kind === "authenticator";
  return {
    to: email,
    subject: da
      ? "Sikkerhedsændring · AI Kundetypeassistent"
      : "Security change · AI Kundetypeassistent",
    text: da
      ? `Din ${factor ? "authenticator og adgangskode er" : "adgangskode er"} blevet ændret gennem kontogendannelse. Alle tidligere login er afsluttet.\n\nHvis det ikke var dig, skal du kontakte support straks.\n\n${url}\nAI Kundetypeassistent`
      : `Your ${factor ? "authenticator and password were" : "password was"} changed through account recovery. All previous sign-ins have been revoked.\n\nIf this was not you, contact support immediately.\n\n${url}\nAI Kundetypeassistent`,
  };
}
