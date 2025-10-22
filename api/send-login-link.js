// api/send-login-link.js  —— Vercel Node 22（ESM）
// 需要环境变量：
// FIREBASE_SERVICE_ACCOUNT_JSON（整段 JSON，多行）
// SMTP_HOST, SMTP_PORT, SMTP_SECURE ("true"/"false"), SMTP_USER, SMTP_PASS, MAIL_FROM（可选）, RETURN_URL

import nodemailer from 'nodemailer';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

// 初始化 Firebase Admin（只初始化一次）
if (!getApps().length) {
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '{}';
  let serviceAccount;
  try {
    serviceAccount = JSON.parse(saRaw);
  } catch (e) {
    console.error('SERVICE_ACCOUNT_JSON parse error:', e);
    // 让后续报 500，便于在日志里看到
    serviceAccount = {};
  }
  initializeApp({ credential: cert(serviceAccount) });
}

function bad(res, code, msg) {
  res.status(code).json({ ok: false, error: msg });
}

// Vercel Node 22 依然支持 (req, res) 处理器的默认导出
export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return bad(res, 405, 'Method Not Allowed');
    }

    // 解析 JSON body（兼容 string / object）
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch { return bad(res, 400, 'Invalid JSON'); }
    }
    const email = String(body?.email || '').trim();
    if (!email) return bad(res, 400, 'Missing email');

    const returnUrl =
      process.env.RETURN_URL ||
      'https://invest-site-simple.vercel.app'; // 兜底

    // 1) 用 Admin SDK 生成登录链接
    const actionCodeSettings = { url: returnUrl, handleCodeInApp: true };
    const link = await getAuth().generateSignInWithEmailLink(email, actionCodeSettings);

    // 2) 通过 SMTP 发送邮件
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 465),
      secure: String(process.env.SMTP_SECURE ?? 'true') === 'true',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
    });

    const from = process.env.MAIL_FROM || process.env.SMTP_USER || 'no-reply@example.com';
    const html = `
      <div style="font-family:system-ui,Segoe UI,Arial,sans-serif">
        <h2>欢迎来到 ST Club</h2>
        <p>点击下面按钮完成登录（仅在本设备/浏览器有效）：</p>
        <p><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">登录</a></p>
        <p style="color:#6b7280;font-size:12px">若按钮无效，可复制此链接到浏览器打开：</p>
        <p style="word-break:break-all;font-size:12px">${link}</p>
      </div>
    `;

    await transporter.sendMail({
      from,
      to: email,
      subject: 'ST Club 登录链接',
      html
    });

    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('send-login-link error:', err);
    bad(res, 500, err?.message || 'Internal Server Error');
  }
}
