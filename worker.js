// worker.js — LUNAR License Worker (Cloudflare)
// Save this as _worker.js if uploading via Cloudflare Pages.

const CFG = {
  GAME: 'BGMI',
  SECRET: 'ZAKPUBGSKIN',
  KEY_ALPHA: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  KV_PREFIX: 'license:',
};

function md5(input) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  const origBitLen = bytes.length * 8;
  let padLen = 56 - (bytes.length % 64);
  if (padLen <= 0) padLen += 64;
  const buf = new Uint8Array(bytes.length + padLen + 8);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(buf.length - 8, origBitLen >>> 0, true);
  view.setUint32(buf.length - 4, Math.floor(origBitLen / 0x100000000), true);

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;
  const S = [7,12,17,22,5,9,14,20,4,11,16,23,6,10,15,21];
  const K = [
    0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
    0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
    0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
    0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
    0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
    0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
    0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
    0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391
  ];
  const M = new Uint32Array(16);
  for (let i = 0; i < buf.length; i += 64) {
    for (let j = 0; j < 16; j++) M[j] = view.getUint32(i + j * 4, true);
    let A = a0, B = b0, C = c0, D = d0;
    for (let j = 0; j < 64; j++) {
      let F, g;
      if (j < 16)      { F = (B & C) | (~B & D); g = j; }
      else if (j < 32) { F = (D & B) | (~D & C); g = (5 * j + 1) % 16; }
      else if (j < 48) { F = B ^ C ^ D;         g = (3 * j + 5) % 16; }
      else             { F = C ^ (B | ~D);      g = (7 * j) % 16; }
      const s = S[(j >> 4) * 4 + (j % 4)];
      F = (F + A + K[j] + M[g]) >>> 0;
      const rot = ((F << s) | (F >>> (32 - s))) >>> 0;
      A = D; D = C; C = B;
      B = (B + rot) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  const hex = v =>
    (v & 0xff).toString(16).padStart(2,'0') +
    ((v >>> 8) & 0xff).toString(16).padStart(2,'0') +
    ((v >>> 16) & 0xff).toString(16).padStart(2,'0') +
    ((v >>> 24) & 0xff).toString(16).padStart(2,'0');
  return hex(a0) + hex(b0) + hex(c0) + hex(d0);
}

const nowSec = () => Math.floor(Date.now() / 1000);

function randChars(n) {
  const buf = crypto.getRandomValues(new Uint8Array(n));
  let s = '';
  for (let i = 0; i < n; i++) s += CFG.KEY_ALPHA[buf[i] & 31];
  return s;
}
function makeKey(prefix) {
  const p = (prefix || 'LUNAR').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8) || 'LUNAR';
  return `${p}-${randChars(4)}-${randChars(4)}-${randChars(4)}-${randChars(4)}`;
}
function jsonResp(obj, status = 200, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
  });
}
function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Admin-Token',
    'Access-Control-Max-Age': '86400',
  };
}
function ctEq(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
function requireAdmin(req, env) {
  const auth = req.headers.get('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const xToken = (req.headers.get('X-Admin-Token') || '').trim();
  const provided = bearer || xToken;
  const expected = String(env.ADMIN_TOKEN || '');
  return !!expected && ctEq(provided, expected);
}
function clampInt(v, lo, hi, def) {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.trunc(n), lo), hi);
}
async function readJson(req) {
  try {
    const text = await req.text();
    if (!text) return {};
    const v = JSON.parse(text);
    return v && typeof v === 'object' ? v : {};
  } catch { return {}; }
}
async function getRecord(env, key) {
  if (!key) return null;
  const raw = await env.LICENSE_KV.get(CFG.KV_PREFIX + key);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}

async function handleConnect(req, env, ctx) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'POST')   return jsonResp({ status: false, reason: 'Invalid request' }, 200, cors);

  let params;
  try {
    const text = await req.text();
    if (text.length === 0 || text.length > 4096) throw new Error('size');
    params = new URLSearchParams(text);
  } catch {
    return jsonResp({ status: false, reason: 'Invalid request' }, 200, cors);
  }

  const game   = params.get('game') || '';
  const key    = (params.get('user_key') || '').trim();
  const serial = (params.get('serial')   || '').trim();

  if (game !== CFG.GAME || !key || !serial || key.length > 512 || serial.length > 512) {
    return jsonResp({ status: false, reason: 'Invalid request' }, 200, cors);
  }

  let record = null;
  try {
    const raw = await env.LICENSE_KV.get(CFG.KV_PREFIX + key);
    if (raw) record = JSON.parse(raw);
  } catch { }

  if (!record) return jsonResp({ status: false, reason: 'Invalid key' }, 200, cors);
  if (record.revoked) return jsonResp({ status: false, reason: 'Revoked' }, 200, cors);

  const now = nowSec();
  if (record.expires_at !== null && now >= record.expires_at) {
    return jsonResp({ status: false, reason: 'Expired' }, 200, cors);
  }

  record.serials = Array.isArray(record.serials) ? record.serials : [];
  if (!record.serials.includes(serial)) {
    const maxDev = Number(record.max_devices) || 1;
    if (record.serials.length >= maxDev) {
      return jsonResp({ status: false, reason: 'Max Devices' }, 200, cors);
    }
    record.serials.push(serial);
  }
  record.last_login_at = now;
  record.last_serial   = serial;
  record.login_count   = (record.login_count || 0) + 1;

  ctx.waitUntil(env.LICENSE_KV.put(CFG.KV_PREFIX + key, JSON.stringify(record)));

  const token = md5(`${CFG.GAME}-${key}-${serial}-${CFG.SECRET}`);
  return jsonResp({ status: true, data: { token, rng: now } }, 200, cors);
}

async function handleAdmin(req, env, url, sub) {
  const cors = corsHeaders();
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (!requireAdmin(req, env))  return jsonResp({ ok: false, error: 'unauthorized' }, 401, cors);

  try {
    if (sub === 'generate' && req.method === 'POST') {
      const body = await readJson(req);
      const count      = clampInt(body.count, 1, 100, 1);
      const days       = body.days == null ? 30 : clampInt(body.days, 0, 36500, 0);
      const maxDevices = clampInt(body.max_devices, 1, 50, 1);
      const note       = String(body.note || '').slice(0, 200);
      const prefix     = String(body.prefix || 'LUNAR');
      const now = nowSec();
      const expires = days > 0 ? now + days * 86400 : null;
      const out = [];
      const used = new Set();
      for (let i = 0; i < count; i++) {
        let key;
        for (let tries = 0; tries < 8; tries++) {
          key = makeKey(prefix);
          if (used.has(key)) continue;
          const exists = await env.LICENSE_KV.get(CFG.KV_PREFIX + key);
          if (!exists) break;
          key = null;
        }
        if (!key) { out.push({ error: 'collision' }); continue; }
        used.add(key);
        const rec = {
          key, serials: [], max_devices: maxDevices,
          created_at: now, expires_at: expires,
          revoked: false, revoked_at: null, note,
          last_login_at: null, last_serial: null, login_count: 0,
        };
        await env.LICENSE_KV.put(CFG.KV_PREFIX + key, JSON.stringify(rec));
        out.push(rec);
      }
      return jsonResp({ ok: true, keys: out }, 200, cors);
    }

    if (sub === 'list' && req.method === 'GET') {
      const limit  = clampInt(url.searchParams.get('limit'), 1, 500, 50);
      const cursor = url.searchParams.get('cursor') || undefined;
      const page = await env.LICENSE_KV.list({ prefix: CFG.KV_PREFIX, limit, cursor });
      const keys = [];
      for (const k of page.keys) {
        const raw = await env.LICENSE_KV.get(k.name);
        if (raw) { try { keys.push(JSON.parse(raw)); } catch {} }
      }
      return jsonResp({ ok: true, keys, cursor: page.cursor || null, complete: !!page.list_complete }, 200, cors);
    }

    if (sub === 'info' && req.method === 'GET') {
      const key = (url.searchParams.get('key') || '').trim();
      if (!key) return jsonResp({ ok: false, error: 'key required' }, 400, cors);
      const rec = await getRecord(env, key);
      if (!rec) return jsonResp({ ok: false, error: 'not found' }, 404, cors);
      return jsonResp({ ok: true, key: rec }, 200, cors);
    }

    if (sub === 'revoke' && req.method === 'POST') {
      const b = await readJson(req);
      const key = String(b.key || '').trim();
      const rec = await getRecord(env, key);
      if (!rec) return jsonResp({ ok: false, error: 'not found' }, 404, cors);
      rec.revoked = true; rec.revoked_at = nowSec();
      await env.LICENSE_KV.put(CFG.KV_PREFIX + key, JSON.stringify(rec));
      return jsonResp({ ok: true, key: rec }, 200, cors);
    }

    if (sub === 'unrevoke' && req.method === 'POST') {
      const b = await readJson(req);
      const key = String(b.key || '').trim();
      const rec = await getRecord(env, key);
      if (!rec) return jsonResp({ ok: false, error: 'not found' }, 404, cors);
      rec.revoked = false; rec.revoked_at = null;
      await env.LICENSE_KV.put(CFG.KV_PREFIX + key, JSON.stringify(rec));
      return jsonResp({ ok: true, key: rec }, 200, cors);
    }

    if (sub === 'delete' && req.method === 'POST') {
      const b = await readJson(req);
      const key = String(b.key || '').trim();
      if (!key) return jsonResp({ ok: false, error: 'key required' }, 400, cors);
      await env.LICENSE_KV.delete(CFG.KV_PREFIX + key);
      return jsonResp({ ok: true }, 200, cors);
    }

    if (sub === 'unbind' && req.method === 'POST') {
      const b = await readJson(req);
      const key = String(b.key || '').trim();
      const serial = b.serial == null ? null : String(b.serial).trim();
      const rec = await getRecord(env, key);
      if (!rec) return jsonResp({ ok: false, error: 'not found' }, 404, cors);
      rec.serials = rec.serials || [];
      if (serial === null || serial === '') rec.serials = [];
      else rec.serials = rec.serials.filter(s => s !== serial);
      await env.LICENSE_KV.put(CFG.KV_PREFIX + key, JSON.stringify(rec));
      return jsonResp({ ok: true, key: rec }, 200, cors);
    }

    if (sub === 'extend' && req.method === 'POST') {
      const b = await readJson(req);
      const key = String(b.key || '').trim();
      const days = clampInt(b.days, 0, 36500, 30);
      const rec = await getRecord(env, key);
      if (!rec) return jsonResp({ ok: false, error: 'not found' }, 404, cors);
      if (days === 0) {
        rec.expires_at = null;
      } else {
        const base = rec.expires_at && rec.expires_at > nowSec() ? rec.expires_at : nowSec();
        rec.expires_at = base + days * 86400;
      }
      await env.LICENSE_KV.put(CFG.KV_PREFIX + key, JSON.stringify(rec));
      return jsonResp({ ok: true, key: rec }, 200, cors);
    }

    if (sub === 'expire-now' && req.method === 'POST') {
      const b = await readJson(req);
      const key = String(b.key || '').trim();
      const rec = await getRecord(env, key);
      if (!rec) return jsonResp({ ok: false, error: 'not found' }, 404, cors);
      rec.expires_at = nowSec();
      await env.LICENSE_KV.put(CFG.KV_PREFIX + key, JSON.stringify(rec));
      return jsonResp({ ok: true, key: rec }, 200, cors);
    }

    if (sub === 'import' && req.method === 'POST') {
      const b = await readJson(req);
      const list = Array.isArray(b.keys) ? b.keys : [];
      const days = b.days == null ? 30 : clampInt(b.days, 0, 36500, 0);
      const maxDevices = clampInt(b.max_devices, 1, 50, 1);
      const note = String(b.note || '').slice(0, 200);
      const now = nowSec();
      const expires = days > 0 ? now + days * 86400 : null;
      const imported = [], skipped = [];
      for (const k of list) {
        const key = String(k || '').trim();
        if (!key || key.length > 512) { skipped.push(k); continue; }
        const exists = await env.LICENSE_KV.get(CFG.KV_PREFIX + key);
        if (exists) { skipped.push(key); continue; }
        const rec = {
          key, serials: [], max_devices: maxDevices,
          created_at: now, expires_at: expires,
          revoked: false, revoked_at: null, note,
          last_login_at: null, last_serial: null, login_count: 0,
        };
        await env.LICENSE_KV.put(CFG.KV_PREFIX + key, JSON.stringify(rec));
        imported.push(rec);
      }
      return jsonResp({ ok: true, imported, skipped }, 200, cors);
    }

    if (sub === 'verify' && req.method === 'POST') {
      const b = await readJson(req);
      const key = String(b.key || '').trim();
      const serial = String(b.serial || '').trim();
      if (!key || !serial) return jsonResp({ ok: false, error: 'key and serial required' }, 400, cors);
      const token = md5(`${CFG.GAME}-${key}-${serial}-${CFG.SECRET}`);
      return jsonResp({ ok: true, token, rng: nowSec() }, 200, cors);
    }

    return jsonResp({ ok: false, error: 'unknown endpoint' }, 404, cors);
  } catch (e) {
    return jsonResp({ ok: false, error: String((e && e.message) || e) }, 500, cors);
  }
}

const ADMIN_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>LUNAR License Admin</title>
<style>
*{box-sizing:border-box}body{font-family:ui-monospace,Menlo,Consolas,monospace;background:#0b0f14;color:#dce5ef;margin:0;padding:16px;line-height:1.4}
h1,h2{color:#8ee6b0;margin:12px 0 6px}h1{font-size:18px}h2{font-size:14px;color:#7ac3e8}
input,button,textarea{font-family:inherit;font-size:13px}
input[type=text],input[type=password],input[type=number],textarea{background:#111821;border:1px solid #263241;color:#dce5ef;padding:6px 8px;border-radius:4px;width:100%}
button{background:#1d2c3a;border:1px solid #3a5468;color:#cfe8ff;padding:6px 12px;border-radius:4px;cursor:pointer}
button:hover{background:#26415a}
button.danger{background:#3a1d24;border-color:#7d2b3d;color:#ffc8d2}button.danger:hover{background:#5a2432}
.row{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px}
.row>*{flex:1;min-width:120px}
pre{background:#111821;border:1px solid #263241;padding:8px;border-radius:4px;overflow:auto;max-height:220px;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}
th,td{padding:6px;border-bottom:1px solid #1d2632;text-align:left;vertical-align:top}
th{color:#8ee6b0}
.muted{color:#6b7c8e;font-size:11px}
.hidden{display:none}
.toast{position:fixed;bottom:16px;right:16px;background:#1d2c3a;border:1px solid #3a5468;padding:8px 14px;border-radius:4px;opacity:0;transition:opacity .2s;pointer-events:none}
.toast.show{opacity:1}
.k{color:#8ee6b0}
</style></head><body>
<h1>LUNAR License Admin</h1>
<div id="authBox">
  <p class="muted">Bearer token must match <code>ADMIN_TOKEN</code> secret on the worker.</p>
  <div class="row"><input type="password" id="token" placeholder="Admin token"><button onclick="saveToken()">Save</button></div>
</div>

<div id="app" class="hidden">
  <div class="row" style="justify-content:flex-end"><button onclick="logout()" class="danger">Logout</button></div>

  <h2>Generate keys</h2>
  <div class="row">
    <input type="number" id="g-count" value="1" min="1" max="100" placeholder="count">
    <input type="number" id="g-days"  value="30" min="0" placeholder="days (0=lifetime)">
    <input type="number" id="g-max"   value="1" min="1" placeholder="max devices">
    <input type="text"   id="g-prefix" value="LUNAR" placeholder="prefix">
    <input type="text"   id="g-note"   placeholder="note">
  </div>
  <div class="row"><button onclick="gen()">Generate</button></div>
  <pre id="gen-out" class="hidden"></pre>

  <h2>All keys</h2>
  <div class="row">
    <input type="text" id="search" placeholder="filter by key substring" oninput="renderList()">
    <button onclick="loadList()">Refresh</button>
  </div>
  <table id="list"><thead><tr>
    <th>Key</th><th>Status</th><th>Expires</th><th>Devices</th><th>Logins</th><th>Actions</th>
  </tr></thead><tbody></tbody></table>
</div>

<div class="toast" id="toast"></div>

<script>
const $ = id => document.getElementById(id);
let state = { token: localStorage.getItem('lunar_admin') || '', keys: [] };
function toast(msg, ms=1800) {
  const t = $('toast'); t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), ms);
}
function saveToken() {
  state.token = $('token').value.trim();
  if (!state.token) return toast('empty token');
  localStorage.setItem('lunar_admin', state.token);
  showApp(); loadList();
}
function logout() { localStorage.removeItem('lunar_admin'); state.token=''; state.keys=[]; $('app').classList.add('hidden'); $('authBox').classList.remove('hidden'); }
function showApp() { $('authBox').classList.add('hidden'); $('app').classList.remove('hidden'); }

async function api(path, opts={}) {
  const r = await fetch('/admin/' + path, {
    ...opts,
    headers: { 'Authorization': 'Bearer ' + state.token, 'Content-Type': 'application/json', ...(opts.headers||{}) }
  });
  if (r.status === 401) { logout(); toast('unauthorized'); throw new Error('401'); }
  return r.json();
}

async function gen() {
  const body = {
    count: +$('g-count').value || 1,
    days: +$('g-days').value,
    max_devices: +$('g-max').value || 1,
    prefix: $('g-prefix').value || 'LUNAR',
    note: $('g-note').value || '',
  };
  const r = await api('generate', { method: 'POST', body: JSON.stringify(body) });
  const out = $('gen-out'); out.classList.remove('hidden');
  out.textContent = (r.keys||[]).map(k => k.key).filter(Boolean).join('\\n') || JSON.stringify(r, null, 2);
  toast('generated ' + (r.keys||[]).length);
  loadList();
}

async function loadList() {
  const r = await api('list?limit=500');
  state.keys = r.keys || [];
  renderList();
}

function renderList() {
  const filter = $('search').value.trim().toLowerCase();
  const body = document.querySelector('#list tbody');
  body.innerHTML = '';
  const keys = state.keys.filter(k => !filter || k.key.toLowerCase().includes(filter));
  if (keys.length === 0) {
    body.innerHTML = '<tr><td colspan="6" class="muted">no keys</td></tr>'; return;
  }
  for (const k of keys) {
    const now = Math.floor(Date.now()/1000);
    let status = 'active';
    if (k.revoked) status = 'revoked';
    else if (k.expires_at !== null && now >= k.expires_at) status = 'expired';
    const exp = k.expires_at === null ? 'lifetime' : new Date(k.expires_at*1000).toISOString().slice(0,19).replace('T',' ');
    const tr = document.createElement('tr');
    tr.innerHTML = '<td><span class="k">' + k.key + '</span></td>'
      + '<td>' + status + '</td>'
      + '<td>' + exp + '</td>'
      + '<td>' + (k.serials||[]).length + '/' + k.max_devices + '</td>'
      + '<td>' + (k.login_count||0) + '</td>'
      + '<td></td>';
    const td = tr.lastChild;
    const mk = (label, fn, cls) => {
      const
      b=document.createElement('button'); b.textContent=label;
      if(cls)b.className=cls; b.style.marginRight='4px'; b.onclick=fn; td.appendChild(b);
    };
    if (k.revoked) mk('unrevoke', () => doAct('unrevoke', k.key));
    else           mk('revoke',   () => doAct('revoke',   k.key));
    mk('unbind',  () => { if(confirm('clear ALL bound devices for '+k.key+'?')) doAct('unbind', k.key); });
    mk('delete',  () => { if(confirm('DELETE '+k.key+' permanently?')) doAct('delete', k.key); }, 'danger');
    body.appendChild(tr);
  }
}

async function doAct(action, key) {
  await api(action, { method: 'POST', body: JSON.stringify({ key }) });
  toast(action + ' ok');
  loadList();
}

if (state.token) { showApp(); loadList(); } else { $('authBox').classList.remove('hidden'); }
</script></body></html>`;

function serveAdminPage() {
  return new Response(ADMIN_HTML, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const path = url.pathname;
    if (path === '/connect') return handleConnect(req, env, ctx);
    if (path === '/admin' || path === '/admin/') return serveAdminPage();
    if (path.startsWith('/admin/')) return handleAdmin(req, env, url, path.slice('/admin/'.length));
    return new Response('Not found', { status: 404 });
  },
};