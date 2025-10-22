// api/send-login-link.js  —— Vercel Serverless Function (CommonJS)

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// 1) 读取环境变量
const {
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  SMTP_HOST = 'smtp.gmail.com',
  SMTP_PORT = '465',
  SMTP_SECURE = 'true',             // 'true' 或 'false' (字符串)
  SMTP_USER,  ksk288857@gmail.com                      // 你的 Gmail 地址
  SMTP_PASS, uvascazodpbsjmqs                       // 你的 App Password
  RETURN_URL = 'https://invest-site-simple.vercel.app' // 登录回跳页，按需改
} = process.env;

// 2) 初始化 Firebase Admin（只初始化一次）
if (!admin.apps.length) {
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
    console.error('[ENV MISSING] 请在 Vercel 环境变量里配置 FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY');
  }

  // 关键：把单行私钥中的 \n 转换为真正换行
  const privateKey = (FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  admin.initializeApp({
    credential: admin.credential.cert({
      project_id: FIREBASE_PROJECT_ID,
      client_email: FIREBASE_CLIENT_EMAIL,
      private_key: privateKey,
    }),
  });
}

module.exports = async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }

    const { email } = req.body || {};
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ ok: false, error: 'Invalid email' });
    }

    // 3) 生成 Email Link（Firebase Email Link 登录）
    const actionCodeSettings = {
      url: RETURN_URL,     // 登录后回到这个地址（你的站点）
      handleCodeInApp: true,
    };

    const link = await admin.auth().generateSignInWithEmailLink(email, actionCodeSettings);

    // 4) 通过 SMTP 发邮件
    if (!SMTP_USER || !SMTP_PASS) {
      console.error('[ENV MISSING] SMTP_USER / SMTP_PASS 未配置');
      return res.status(500).json({ ok: false, error: 'SMTP not configured' });
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(SMTP_PORT),
      secure: String(SMTP_SECURE).toLowerCase() === 'true', // 'true' -> true
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const html = `
      <div style="font-family:system-ui,Segoe UI,Arial">
        <h2>欢迎登录 ST Club</h2>
        <p>点击下面按钮在本设备完成登录：</p>
        <p><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">登录</a></p>
        <p style="color:#6b7280">若按钮无法点击，可复制以下链接到浏
