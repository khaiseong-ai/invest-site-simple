// --------------------
// Minimal SPA Router
// --------------------
const $ = (sel) => document.querySelector(sel);
const routes = {
  "/": "#route-home",
  "/login": "#route-login",
  "/my-performance": "#route-my",
  "/team-performance": "#route-team",
};

function guardRoute(routeKey){
  // 保护“我的绩效 / 团队绩效”页：未登录跳回首页
  const needAuth = ["/my-performance","/team-performance"];
  if (!auth?.currentUser && needAuth.includes(routeKey)) return "/";
  return routeKey;
}

function setActiveRoute() {
  const raw = location.hash.replace("#", "") || "/";
  const safe = guardRoute(raw);
  const route = routes[safe] || "#route-home";
  document.querySelectorAll(".route").forEach(el => el.style.display = "none");
  document.querySelector(route).style.display = "block";
  if (raw !== safe) location.hash = safe;       // 未登录时强制回首页
  window.scrollTo(0,0);
}
window.addEventListener("hashchange", setActiveRoute);

// --------------------
// Config
// --------------------
const FIREBASE_CONFIG = {
  apiKey: "AIzaSyC-q1wBXINO9odgfHeHE6-zL3tA7MF3XlU",
  authDomain: "stclub-a93d7.firebaseapp.com",
  projectId: "stclub-a93d7",
  appId: "1:838565883511:web:a9fdde822b055951592072"
};

const DATA_SOURCE = {
  investorJSON: "https://opensheet.elk.sh/1bxRWxTPALlXYVP1lNT3ybckRo6lAvL14t9Rg0wzwMYY/Sheet1",
  teamJSON:     "https://opensheet.elk.sh/1bxRWxTPALlXYVP1lNT3ybckRo6lAvL14t9Rg0wzwMYY/Sheet1"
};

const RETURN_URL =
  location.hostname === "localhost"
    ? "http://localhost:8080"
    : "https://stclub.khaiseong.eth.limo/";

const REFRESH_INTERVAL = 1000 * 60 * 60 * 6; // 6h

// --------------------
// Firebase Auth (Email Link)
// --------------------
firebase.initializeApp(FIREBASE_CONFIG);
const auth = firebase.auth();

// 回跳登录
(async function handleEmailLinkLogin() {
  const url = window.location.href;
  if (auth.isSignInWithEmailLink(url)) {
    let email = window.localStorage.getItem("emailForSignIn");
    if (!email) email = window.prompt("请输入用于登入的邮箱：");
    try {
      await auth.signInWithEmailLink(email, url);
      window.localStorage.removeItem("emailForSignIn");
      console.log("Email link sign-in success");
      location.hash = "/my-performance";
    } catch (err) {
      console.error("emailLink signIn error:", err.code, err.message);
      showMsg(
        "#loginMsg",
        `登录失败：<b>${err.code || "unknown"}</b><br>${err.message || ""}`
      );
      location.hash = "/login";
    }
  }
})();

// 顶部登录按钮（如果 index 里有）
$("#loginBtn")?.addEventListener("click", () => (location.hash = "/login"));

// 监听登录态
auth.onAuthStateChanged((user) => {
  const authed = !!user;

  // 顶部导航显示/隐藏（authed-only）
  document
    .querySelectorAll(".authed-only")
    .forEach((el) => (el.style.display = authed ? "" : "none"));

  // 登出按钮
  $("#logoutBtn") && ($("#logoutBtn").style.display = authed ? "inline-block" : "none");

  // 未登录禁止访问私有页
  const needAuth = location.hash === "#/my-performance" || location.hash === "#/team-performance";
  if (!authed && needAuth) {
    location.hash = "/login";
  }
  if (authed && (location.hash === "#/login" || location.hash === "")) {
    location.hash = "/my-performance";
  }

  // 登录后加载数据
  if (authed) {
    loadMyPerformance();
    loadTeamPerformance();
  }
});

// 发送邮箱登入链接（走你自己的 Vercel API）
$("#emailForm")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#email").value.trim();
  if (!email) return;

  try {
    const resp = await fetch("/api/send-login-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    const data = await resp.json();
    if (!resp.ok) throw new Error(data.error || "发送失败");

    window.localStorage.setItem("emailForSignIn", email);
    showMsg("#loginMsg", `已向 <b>${email}</b> 发送登入邮件，请在该设备打开邮件并点击链接完成登入。`);
  } catch (err) {
    console.error(err);
    showMsg("#loginMsg", `发送失败：<b>${err.message || ""}</b>`);
  }
});


// 登出
$("#logoutBtn")?.addEventListener("click", async () => {
  await auth.signOut();
  location.hash = "/";
});

function showMsg(sel, html) {
  const el = $(sel);
  el.innerHTML = html;
  el.style.display = "block";
}

// --------------------
// Helpers
// --------------------
async function fetchJSON(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Fetch failed " + res.status);
  return res.json();
}
const findKey = (obj, candidates) => {
  if (!obj) return null;
  const map = Object.fromEntries(Object.keys(obj).map(k => [k.toLowerCase(), k]));
  for (const c of candidates) if (map[c.toLowerCase()]) return map[c.toLowerCase()];
  return null;
};
const fmt = (v, d=2) => {
  const n = parseFloat(String(v ?? "").replace(/[, ]/g,""));
  return isNaN(n) ? "-" : n.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});
};

// --------------------
// My Performance（放大 + 表格）
// --------------------
let myTimer=null, teamTimer=null;

async function loadMyPerformance() {
  const user = auth.currentUser;
  if (!user) return;
  const myEmail = (user.email || "").toLowerCase();

  const leftCol  = document.querySelector('#route-my .grow');
  const rightCol = document.querySelector('#route-my .side');
  rightCol && (rightCol.style.display = "none");

  try {
    const rows = await fetchJSON(DATA_SOURCE.investorJSON);
    if (!rows.length) { leftCol.innerHTML = "<div class='msg'>暂无数据</div>"; return; }

    const emailKey = findKey(rows[0], ["email","Email"]);
    const nameKey  = findKey(rows[0], ["name","Name"]);
    const depoKey  = findKey(rows[0], ["Deposited (USDT)","Deposited","deposit","存入"]);
    const pointKey = findKey(rows[0], ["Point (weekly)","Point","points"]);
    const refKey   = findKey(rows[0], ["Referral (USDT)","Referral"]);
    const assetKey = findKey(rows[0], ["Asset"]);

    const mine = rows.filter(r => String(r[emailKey]||"").toLowerCase() === myEmail);
    const current = mine.length ? mine[mine.length - 1] : null;

    const myName    = (current?.[nameKey] ?? "").toString().trim();
    const deposited = current?.[depoKey]  ?? "-";
    const points    = current?.[pointKey] ?? "-";

    const myReferrals = [];
    if (myName && refKey && nameKey) {
      for (const r of rows) {
        const txt = String(r[refKey] ?? "");
        const inviter = (txt.match(/\(([^)]+)\)/) || [null, null])[1];
        const amount = parseFloat(txt.replace(/[^\d.\-]/g, ""));
        if (inviter && inviter.toLowerCase() === myName.toLowerCase() && amount && amount > 0) {
          myReferrals.push({ name: r[nameKey] ?? "", asset: r[assetKey] ?? "", amount });
        }
      }
    }
    myReferrals.sort((a,b) => (b.amount||0) - (a.amount||0));

    leftCol.innerHTML = `
      <div class="my-giant">
        <div class="card" style="max-width:900px">
          <div style="margin-bottom:10px;font-weight:900">${myName || "-"}</div>
          <div><span class="label">Deposited (USDT):</span> <span class="value">${fmt(deposited)}</span></div>
          <div><span class="label">Point (weekly):</span> <span class="value">${
            (typeof points==="string" && points.includes("%")) ? points : fmt(points).replace(/\.00$/,"")
          }</span></div>
        </div>

        ${myReferrals.length ? `
          <div class="card" style="margin-top:16px;max-width:900px">
            <div style="font-size:60%;color:#9fb0ff;margin-bottom:6px;font-weight:800">我邀请的成员</div>
            <table class="table-lg">
              <thead>
                <tr><th style="width:40%">Name</th><th style="width:40%">Asset</th><th style="width:20%">Referral (USDT)</th></tr>
              </thead>
              <tbody>
                ${myReferrals.map(x => `
                  <tr>
                    <td>${x.name}</td>
                    <td>${x.asset || ""}</td>
                    <td>${fmt(x.amount)}</td>
                  </tr>
                `).join("")}
              </tbody>
            </table>
          </div>
        ` : ``}
      </div>
    `;

    clearInterval(myTimer);
    myTimer = setInterval(loadMyPerformance, REFRESH_INTERVAL);
  } catch (e) {
    console.error(e);
    leftCol.innerHTML = "<div class='msg'>读取失败，请稍后再试</div>";
  }
}

// --------------------
// Team Performance（横向扩大图表）
// --------------------
async function loadTeamPerformance() {
  const root = document.querySelector('#route-team');
  root.querySelector('.side')?.style && (root.querySelector('.side').style.display = 'none');
  const left = root.querySelector('.grow');

  const toNum = v => (v==null ? null : (n=>Number.isFinite(n)?n:null)(parseFloat(String(v).replace(/[^\d.\-]/g,''))));
  const fmtNum = (v,d=2)=>{const n=toNum(v);return n==null?(v??'-'):n.toLocaleString(undefined,{minimumFractionDigits:d,maximumFractionDigits:d});};
  const fmtPlus=(v,unit='')=>{const n=toNum(v); if(n==null) return (v??'-'); const s=n>0?'+':(n<0?'−':''); return `${s}${Math.abs(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}${unit}`;};

  try {
    const rows = await fetchJSON(DATA_SOURCE.teamJSON);
    if (!rows.length) { left.innerHTML = "<div class='msg'>暂无团队数据</div>"; return; }

    // KPI
    const hasLabel = Object.prototype.hasOwnProperty.call(rows[0], 'Label');
    const hasValue = Object.prototype.hasOwnProperty.call(rows[0], 'Value');
    let balanceRaw=null, incomeRaw=null, yieldRaw=null, avgYield=null, weekNum=null;

    if (hasLabel && hasValue) {
      const getByLabel = (name) => {
        const r = rows.find(r => String(r.Label ?? '').trim().toLowerCase() === String(name).toLowerCase());
        return r ? r.Value : null;
      };
      balanceRaw = getByLabel('Treasury Balance');
      incomeRaw  = getByLabel('Treasury Income');
      yieldRaw   = getByLabel('Treasury Yield');
      avgYield   = getByLabel('Average Weekly Treasury Yield');
      const weekFromLabel = getByLabel('Week');
      if (weekFromLabel != null) weekNum = toNum(weekFromLabel);
    } else {
      const lastOfRow = (row, labelLC) => {
        const es = Object.entries(row);
        const has = es.some(([,v]) => String(v??'').trim().toLowerCase()===labelLC);
        if(!has) return null;
        for (let i=es.length-1;i>=0;i--) {
          const v = es[i][1];
          if (v!=null && String(v).trim()!=='' && String(v).trim().toLowerCase()!==labelLC) return v;
        }
        return null;
      };
      const findRowVal = (label)=> {
        const lc = String(label).toLowerCase();
        for (const r of rows) { const v = lastOfRow(r, lc); if (v!=null) return v; }
        return null;
      };
      balanceRaw = findRowVal('Treasury Balance');
      incomeRaw  = findRowVal('Treasury Income');
      yieldRaw   = findRowVal('Treasury Yield');
      avgYield   = findRowVal('Average Weekly Treasury Yield');
    }

    // 线图数据
    const cumKey = rows[0].hasOwnProperty('Cumulative PNL') ? 'Cumulative PNL'
                : rows[0].hasOwnProperty('Cumulative PNL PNL') ? 'Cumulative PNL PNL'
                : null;
    const weekKey = rows[0].hasOwnProperty('Week') ? 'Week' : null;

    const series = (cumKey && weekKey)
      ? rows.map(r => ({ week: toNum(r[weekKey]), cum: toNum(r[cumKey]) })).filter(p => p.week!=null && p.cum!=null)
      : [];

    // 渲染
    left.innerHTML = `
      <div class="kpi-giant" style="margin-bottom:10px">
        <div><span class="k">Treasury Balance:</span> <span class="v">${fmtNum(balanceRaw)}</span></div>
        <div><span class="k">Treasury Income:</span> <span class="v">${fmtPlus(incomeRaw,' USDT')}</span></div>
        <div><span class="k">Treasury Yield:</span> <span class="v">${
          /%/.test(String(yieldRaw||'')) ? (String(yieldRaw).startsWith('+') ? yieldRaw : ('+'+yieldRaw))
                                         : fmtPlus(yieldRaw,'%')
        }</span></div>
        ${weekNum!=null ? `<div><span class="k">Week:</span> <span class="v">${fmtNum(weekNum,0)}</span></div>` : ""}
        ${avgYield!=null ? `<div><span class="k">Average Weekly Treasury Yield:</span> <span class="v">${
          /%/.test(String(avgYield||'')) ? avgYield : (fmtNum(avgYield,2)+'%')
        }</span></div>` : ""}
      </div>

      <div class="card chart-xxl" style="margin-top:12px">
        <div class="chart-title">Cumulative PNL (USDT)</div>
        <div class="chart-wrap">
          <canvas id="teamEquityChart"></canvas>
        </div>
      </div>
    `;

    // 画图（横向靠容器变宽，高度适中）
    const ctx = document.getElementById("teamEquityChart");
    if (ctx && series.length) {
      const labels  = series.map(p => p.week);
      const cumVals = series.map(p => p.cum);
      const weekVals= series.map(p => p.week);
      new Chart(ctx, {
        type: "line",
        data: {
          labels,
          datasets: [
            { label: "Cumulative PNL (USDT)", data: cumVals, tension: 0.25, fill: false, yAxisID: "y" },
            { label: "Week",                  data: weekVals, tension: 0.25, fill: false, yAxisID: "y" }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: true, labels: { font: { size: 16 } } } },
          scales: {
            x: { ticks: { font: { size: 16 } }, grid: { display: false } },
            y: { ticks: { font: { size: 16 } }, grid: { color: "rgba(255,255,255,0.08)" } }
          }
        }
      });
    }

    clearInterval(teamTimer);
    teamTimer = setInterval(loadTeamPerformance, REFRESH_INTERVAL);
  } catch (e) {
    console.error(e);
    left.innerHTML = "<div class='msg'>读取失败，请稍后再试</div>";
  }
}

// --------------------
// 首页：历史绩效线（简版）
// --------------------
async function renderHomeTeamChart() {
  const cvs = document.getElementById('homeTeamChart');
  if (!cvs) return;

  const toNum = v => {
    if (v == null) return null;
    const n = parseFloat(String(v).replace(/[^\d.\-]/g,''));
    return Number.isFinite(n) ? n : null;
  };

  try {
    const rows = await fetchJSON(DATA_SOURCE.teamJSON);
    if (!rows?.length) return;

    const sample = rows[0];
    const weekKey = findKey(sample, ["Week","week","周次","周"]);
    const cumKey  = findKey(sample, [
      "Cumulative PNL","Cumulative PNL PNL","Cumulative","Cumulative PnL",
      "累计PNL","Cumulative PNL (USDT)"
    ]);

    const points = rows
      .map(r => ({ week: toNum(r[weekKey]), cum: toNum(r[cumKey]) }))
      .filter(p => p.week != null && p.cum != null)
      .sort((a,b) => a.week - b.week);

    if (!points.length) return;

    const labels  = points.map(p => p.week);
    const cumVals = points.map(p => p.cum);

    new Chart(cvs, {
      type: 'line',
      data: { labels, datasets: [{ label:'Cumulative PNL (USDT)', data: cumVals, tension: .25, fill: false }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }},
        scales: { x:{ grid:{ display:false }}, y:{ grid:{ color:'rgba(255,255,255,.08)' }} }
      }
    });
  } catch (e) {
    console.error('home chart error', e);
  }
}

// --------------------
// 弹窗（可点击空白 / Esc 关闭）
// --------------------
(function setupQRModal() {
  const m = document.getElementById('qrModal');
  const open = document.getElementById('consultBtn');
  const close = document.getElementById('qrClose');
  const ok = document.getElementById('qrIKnow');
  if (!m || !open) return;

  const show = () => m.classList.add('show');
  const hide = () => m.classList.remove('show');

  open.addEventListener('click', show);
  close?.addEventListener('click', hide);
  ok?.addEventListener('click', hide);
  m.querySelector('.modal-backdrop')?.addEventListener('click', hide);
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape') hide(); });
})();

// --------------------
// Init
// --------------------
document.getElementById("year").textContent = new Date().getFullYear();
setActiveRoute();
renderHomeTeamChart();
console.log("Loaded app.js ✅");
