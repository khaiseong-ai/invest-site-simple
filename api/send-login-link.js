// api/send-login-link.js — Vercel Serverless Function (CommonJS, Node 22)

const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

/** --------- 环境变量 --------- **/
const {
  // Firebase service account（必填）
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,

  // SMTP（Gmail 默认值可不配）
  SMTP_HOST = 'smtp.gmail.com',
  SMTP_PORT = '465',
  SMTP_SECURE = 'true',

  // Gmail 发信账号（必填：你的 Gmail）与 App Password（必填）
  SMTP_USER,
  SMTP_PASS,

  // 登录后回跳地址（可选；不填则用当前 vercel 域名）
  RETURN_URL,
} = process.env;

// 去掉用户无意间粘贴的首尾空格
const SMTP_USER_SAFE = (SMTP_USER || '').trim();
const SMTP_PASS_SAFE = (SMTP_PASS || '').trim();
const PRIVATE_KEY_NORMALIZED = (FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

/** --------- 初始化 Firebase Admin（只做一次） --------- **/
if (!admin.apps.length) {
  if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !PRIVATE_KEY_NORMALIZED) {
    console.error('[ENV MISSING] 请在 Vercel 环境变量里配置: FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY');
  } else {
    admin.initializeApp({
      credential: admin.credential.cert({
        project_id: FIREBASE_PROJECT_ID,
        client_email: FIREBASE_CLIENT_EMAIL,
        private_key: PRIVATE_KEY_NORMALIZED,
      }),
    });
  }
}

/** --------- 创建 SMTP transporter --------- **/
const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: Number(SMTP_PORT),
  secure: String(SMTP_SECURE).toLowerCase() === 'true',
  auth: {
    user: SMTP_USER_SAFE,
    pass: SMTP_PASS_SAFE,
  },
});

/** --------- 简单 CORS 处理（允许前端直接 fetch） --------- **/
function withCORS(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

/** --------- 主处理函数 --------- **/
module.exports = async function handler(req, res) {
  withCORS(res);

  // 预检
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
  }

  try {
    // 解析 body
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const email = (body.email || '').trim();

    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.status(400).json({ ok: false, error: 'Invalid email' });
    }

    // 基本校验：环境变量
    if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !PRIVATE_KEY_NORMALIZED) {
      return res.status(500).json({ ok: false, error: 'Firebase service account is not configured' });
    }
    if (!SMTP_USER_SAFE || !SMTP_PASS_SAFE) {
      return res.status(500).json({ ok: false, error: 'SMTP is not configured' });
    }

    // 生成 Email Link（使用 Admin SDK，不占用 Firebase 免费邮件配额）
    const actionCodeSettings = {
      url: RETURN_URL || `https://${req.headers.host || 'localhost'}`,
      handleCodeInApp: true,
    };

    const link = await admin.auth().generateSignInWithEmailLink(email, actionCodeSettings);

    // 邮件内容
    const subject = 'ST Club 登录链接';
    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width: 560px; margin: 0 auto;">
        <h2 style="margin: 0 0 12px;">欢迎来到 ST Club</h2>
        <p>点击下方按钮完成登录（该链接仅对 <b>${email}</b> 有效）：</p>
        <p><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;padding:12px 18px;border-radius:10px">登录</a></p>
        <p style="color:#64748b;font-size:13px">若按钮无法点击，请复制以下链接到浏览器打开：</p>
        <p style="word-break:break-all;font-size:13px;"><a href="${link}">${link}</a></p>
      </div>
    `;

    // 发送邮件
    await transporter.sendMail({
      from: `ST Club <${SMTP_USER_SAFE}>`,
      to: email,
      subject,
      html,
    });

    return res.status(200).json({ ok: true, message: 'sent' });
  } catch (err) {
    console.error('[send-login-link]', err);
    // 尽量给出可读的错误信息
    const msg = err && (err.message || err.errorInfo?.message) ? (err.message || err.errorInfo.message) : 'INTERNAL_SERVER_ERROR';
    return res.status(500).json({ ok: false, error: msg });
  }
};
