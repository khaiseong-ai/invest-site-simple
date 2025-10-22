// api/send-login-link.js
import nodemailer from "nodemailer";
import * as admin from "firebase-admin";

const app = admin.apps[0] ?? admin.initializeApp({
  credential: admin.credential.cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
  }),
});

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: "Missing email" });

    // 1) 生成 Firebase 邮件登录链接（不让 Firebase 发；我们自己发）
    const actionCodeSettings = {
      url: process.env.RETURN_URL, // 必须在 Firebase Authorized domains 里
      handleCodeInApp: true,
    };
    const link = await admin.auth().generateSignInWithEmailLink(email, actionCodeSettings);

    // 2) 通过 Gmail SMTP 发信
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE || "true") === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });

    const html = `
      <div style="font-family:system-ui,Segoe UI,Arial">
        <h2>登录 ST Club</h2>
        <p>点击下面按钮在当前设备完成登录：</p>
        <p><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">登录</a></p>
        <p>若按钮无效，可复制链接到浏览器打开：</p>
        <p style="word-break:break-all">${link}</p>
        <hr />
        <small>如非本人操作，请忽略本邮件。</small>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_FROM, // 显示名+地址
      to: email,
      subject: "ST Club 登录链接",
      html,
    });

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: e.message || "send failed" });
  }
}
