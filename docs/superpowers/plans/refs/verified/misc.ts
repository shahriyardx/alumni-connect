import { Client } from "minio";
import nodemailer from "nodemailer";
const minio = new Client({ endPoint: "localhost", port: 9000, useSSL: false, accessKey: "k", secretKey: "s" });
async function m() {
  if (!(await minio.bucketExists("b"))) await minio.makeBucket("b");
  const put = await minio.presignedPutObject("b", "k/x.png", 600);
  const get = await minio.presignedGetObject("b", "k/x.png", 3600);
  const st = await minio.statObject("b", "k/x.png"); st.size; st.metaData["content-type"];
  const p = minio.newPostPolicy(); p.setBucket("b"); p.setKey("k"); p.setContentLengthRange(1, 5e6); p.setExpires(new Date(Date.now()+6e5));
  const { postURL, formData } = await minio.presignedPostPolicy(p);
  void put; void get; void postURL; void formData;
}
const tx = nodemailer.createTransport(process.env.SMTP_URL!);
async function mail() { const info = await tx.sendMail({ from: '"App" <no-reply@x.com>', to: "a@b.c", subject: "s", text: "t", html: "<p>t</p>" }); info.messageId; await tx.verify(); }
void m; void mail;
