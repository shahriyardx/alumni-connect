import nodemailer from "nodemailer";
import { env } from "@/env";

const transport = env.SMTP_URL
  ? nodemailer.createTransport(env.SMTP_URL)
  : null;

export async function sendMail(to: string, subject: string, text: string) {
  if (!transport) {
    console.log(`\n[mail] to=${to} | ${subject}\n${text}\n`);
    return;
  }
  await transport.sendMail({ from: env.MAIL_FROM, to, subject, text });
}
