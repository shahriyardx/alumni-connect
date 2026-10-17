import { Mailroom } from "@shahriyardx/mailroom";
import { env } from "@/env";

const mailroom =
  env.MAILROOM_BASE_URL && env.MAILROOM_API_KEY
    ? new Mailroom({
        baseUrl: env.MAILROOM_BASE_URL,
        apiKey: env.MAILROOM_API_KEY,
      })
    : null;

export async function sendMail(to: string, subject: string, text: string) {
  if (!mailroom) {
    console.log(`\n[mail] to=${to} | ${subject}\n${text}\n`);
    return;
  }
  await mailroom.emails.send({ from: env.MAIL_FROM, to, subject, text });
}
