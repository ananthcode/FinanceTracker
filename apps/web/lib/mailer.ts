import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { serverEnv } from "@/lib/env.server";

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

let transport: Transporter | undefined;

function getTransport(): Transporter {
  const env = serverEnv();
  transport ??= nodemailer.createTransport({
    host: env.smtpHost,
    port: env.smtpPort,
    secure: env.smtpPort === 465,
    auth: env.smtpUser ? { user: env.smtpUser, pass: env.smtpPass } : undefined,
  });
  return transport;
}

/** Sends an email via SMTP (research R-02). Never throws: returns the delivery status (FR-003b). */
export async function sendMail(message: MailMessage): Promise<"sent" | "failed"> {
  try {
    await getTransport().sendMail({ from: serverEnv().smtpFrom, ...message });
    return "sent";
  } catch {
    return "failed";
  }
}
