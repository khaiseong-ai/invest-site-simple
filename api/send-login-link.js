// api/send-login-link.js
import nodemailer from 'nodemailer';
import admin from 'firebase-admin';

// ---------- Firebase Admin 初始化（只初始化一次） ----------
if (!admin.apps.length) {
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saRaw) {
    throw new Error('Missing env FIREBASE_SERVICE_ACCOUNT');
  }
  const serviceAccount = JSON.parse(saRaw);
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

const ALLOW_ORIGIN = process.env.CORS_ORIGIN || '*';
const RETURN_URL   = process.env.RETURN_URL;

// ---------- 工具：标准化响应 ----------
function sendJSON(res, status, obj) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(obj));
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', ALLOW_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'POST') return sendJSON(res, 405, { ok:false, error: 'Method Not Allowed' });

  try {
    // 读取 body
    let body = {};
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    } else {
      body = req.body || {};
    }
    const { email } = body;
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return sendJSON(res, 400, { ok:false, error: 'Invalid email' });
    }
    if (!RETURN_URL) {
      return sendJSON(res, 500, { ok:false, error: 'Missing RETURN_URL env' });
    }

    // 1) 生成 Firebase 邮件登录链接（不会占用 Firebase 发信配额，我们自己发信）
    const actionCodeSettings = {
      url: RETURN_URL,
      handleCodeInApp: true
    };
    const link = await admin.auth().generateSignInWithEmailLink(email, actionCodeSettings);

    // 2) 发送邮件（SMTP）
    const port = Number(process.env.SMTP_PORT || 465);
    const secure = String(process.env.SMTP_SECURE || '').toLowerCase() === 'true';
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const html = `
      <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; color:#0b1730">
        <h2>登录 ST Club</h2>
        <p>请点击下面的按钮完成登录（同设备打开）：</p>
        <p><a href="${link}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none">登录</a></p>
        <p style="color:#667085">如果按钮无法点击，请复制以下链接到浏览器打开：</p>
        <p style="word-break:break-all;color:#334155">${link}</p>
      </div>
    `;

    await transporter.sendMail({
      from: process.env.SMTP_USER,
      to: email,
      subject: 'ST Club 登录链接',
      html
    });

    return sendJSON(res, 200, { ok:true });
  } catch (err) {
    console.error('send-login-link error:', err);
    return sendJSON(res, 500, { ok:false, error: String(err && err.message || err) });
  }
}
