import { localMailer } from "./mail.mjs";
import nodemailer from "nodemailer";
let raw = "";
for await (const chunk of process.stdin) {
  raw += chunk;
  if (raw.length > 16384) throw new Error("Operational alert too large");
}
const { to, subject, text } = JSON.parse(raw);
if (!subject?.startsWith("[AI operations]") || typeof text !== "string")
  throw new Error("Invalid operational alert");
let queueId;
const accepted = await localMailer("no-reply@ai.igurl.dk", {
  createTransport: (options) => {
    const transport = nodemailer.createTransport(options);
    return {
      sendMail: async (message) => {
        const info = await transport.sendMail(message);
        queueId = /queued as ([A-F0-9]+)/i.exec(info.response || "")?.[1];
        return info;
      },
    };
  },
})({
  to,
  subject,
  text,
});
console.log(JSON.stringify({ accepted, queueId }));
if (!accepted) process.exitCode = 1;
