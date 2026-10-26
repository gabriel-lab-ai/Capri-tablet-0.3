const { app, BrowserWindow, Tray, Menu, screen, shell, ipcMain, nativeImage } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');

const PORT = 47823;
const W = 400, H = 560;
const MARKER = '127.0.0.1:' + PORT + '/event?src=capri';
const SETTINGS = path.join(os.homedir(), '.claude', 'settings.json');

let win, tray;
const CFG = path.join(app.getPath('userData'), 'config.json');
let cfg = { apiKey: process.env.ANTHROPIC_API_KEY || '', mode: 'orb', voice: true };
try { Object.assign(cfg, JSON.parse(fs.readFileSync(CFG, 'utf8'))); } catch {}
const saveCfg = () => { try { fs.mkdirSync(path.dirname(CFG), { recursive: true }); fs.writeFileSync(CFG, JSON.stringify(cfg)); } catch {} };
const history = [];
let wander = true, scale = 1;
let target = null, walking = false, dir = 1;
let idleTicks = 0;
let dragging = false, dragOrigin = null;

function createWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  win = new BrowserWindow({
    width: W, height: H,
    x: wa.x + wa.width - W - 40, y: wa.y + wa.height - H,
    transparent: true, frame: false, resizable: false, hasShadow: false,
    alwaysOnTop: true, skipTaskbar: true, focusable: true,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile('index.html');
  win.webContents.once('did-finish-load', () => {
    sendState({ mode: cfg.mode, voice: cfg.voice });
    if (cfg.mode === 'body') setTimeout(() => say('Capri online.', ['icon', 'claude', 'folder', 'nothing']), 800);
  });
}

function say(text, choices) { win && win.webContents.send('say', { text, choices: choices || [] }); }
function sendState(s) { win && win.webContents.send('state', s); }

function groundY() {
  const d = screen.getDisplayNearestPoint({ x: win.getBounds().x, y: win.getBounds().y });
  return d.workArea.y + d.workArea.height - H;
}

function pickTarget() {
  const d = screen.getDisplayNearestPoint({ x: win.getBounds().x, y: win.getBounds().y }).workArea;
  target = d.x + Math.random() * (d.width - W);
}

// main animation loop: walks the window along the bottom of the screen
setInterval(() => {
  if (!win || dragging || cfg.mode !== 'body') return;
  const b = win.getBounds();
  if (walking && target !== null) {
    const speed = 2.5 * scale;
    const dx = target - b.x;
    if (Math.abs(dx) <= speed) { walking = false; target = null; sendState({ walking: false, dir }); }
    else {
      dir = dx > 0 ? 1 : -1;
      win.setPosition(Math.round(b.x + dir * speed), groundY());
    }
  } else if (wander && ++idleTicks > 60 * 5 + Math.random() * 60 * 8) {
    idleTicks = 0;
    pickTarget(); walking = true; sendState({ walking: true, dir });
  }
}, 16);

function teleport() {
  const d = screen.getPrimaryDisplay().workArea;
  win.setPosition(Math.round(d.x + Math.random() * (d.width - W)), Math.round(d.y + Math.random() * (d.height - H)));
  say('Whoa. Teleported!');
}

function setScale(s) {
  scale = s;
  win.webContents.send('state', { scale });
}

// ---------- Claude Code hooks ----------
const EVENTS = ['PreToolUse', 'PostToolUse', 'Notification', 'Stop'];
const readSettings = () => { try { return JSON.parse(fs.readFileSync(SETTINGS, 'utf8')); } catch { return {}; } };
const hasHooks = () => JSON.stringify(readSettings()).includes(MARKER);

function stripHooks(s) {
  for (const ev of Object.keys(s.hooks || {})) {
    s.hooks[ev] = s.hooks[ev].filter(g => !JSON.stringify(g).includes(MARKER));
    if (!s.hooks[ev].length) delete s.hooks[ev];
  }
  if (s.hooks && !Object.keys(s.hooks).length) delete s.hooks;
  return s;
}
function writeSettings(s) {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  if (fs.existsSync(SETTINGS)) fs.copyFileSync(SETTINGS, SETTINGS + '.capri-backup'); // safety copy first
  fs.writeFileSync(SETTINGS, JSON.stringify(s, null, 2));
}
function installHooks() {
  const s = stripHooks(readSettings());
  s.hooks = s.hooks || {};
  for (const ev of EVENTS) {
    s.hooks[ev] = s.hooks[ev] || [];
    s.hooks[ev].push({ matcher: '', hooks: [{ type: 'command',
      command: `curl -s -m 2 -X POST "http://${MARKER}&name=${ev}" --data-binary @-` }] });
  }
  writeSettings(s);
  say("I'm hooked into Claude Code now. I'll watch it work.");
  refreshMenus();
}
function removeHooks() {
  writeSettings(stripHooks(readSettings()));
  say('Hooks removed. Your settings.json is back to normal.');
  refreshMenus();
}

// local server that Claude Code hooks POST to
http.createServer((req, res) => {
  const u = new URL(req.url, 'http://127.0.0.1');
  if (req.method === 'POST' && u.pathname === '/event') {
    let body = '';
    req.on('data', c => body += c);
    req.on('end', () => {
      let tool = ''; try { tool = JSON.parse(body).tool_name || ''; } catch {}
      const name = u.searchParams.get('name');
      const msg = {
        PreToolUse: tool ? `Claude is using ${tool}...` : 'Claude is working...',
        PostToolUse: tool ? `${tool} done.` : 'Step done.',
        Notification: 'Claude needs you!',
        Stop: 'Claude finished!',
      }[name];
      if (msg) { say(msg); if (name === 'Notification') sendState({ alert: true }); }
      res.end('ok');
    });
  } else res.end('capri');
}).listen(PORT, '127.0.0.1', () => console.log('[capri] listening on 127.0.0.1:' + PORT))
  .on('error', e => console.log('[capri] server error:', e.message));

// ---------- chat ----------
function setMode(k) {
  cfg.mode = k; saveCfg(); walking = false; sendState({ mode: k });
  const wa = screen.getPrimaryDisplay().workArea;
  win.setPosition(wa.x + wa.width - W - 40, wa.y + wa.height - H);
  refreshMenus();
}

const PERSONA = `You are Capri, a small glitchy AI entity that lives on the user's desktop. You speak in short, dry, teasing replies (1-3 sentences, max ~220 characters), a bit cyberpunk, never cruel. You can see the user's desktop only through Claude Code hooks. No emojis. Plain text only.`;
const CANNED = ['Noted. Filed under: things I did not ask for.', 'Interesting. Wrong, but interesting.', 'Say more. I am listening. Sort of.', 'Net is quiet. Too quiet.', 'Say something interesting. I am bored.', 'Hm. Noted. Filed under: things I did not ask for.', 'I would help, but I have no brain connected. Type /key followed by an API key.'];

async function chat(text) {
  text = String(text || '').trim();
  if (text.startsWith('/key ')) { cfg.apiKey = text.slice(5).trim(); saveCfg(); return 'Brain connected. Try me.'; }
  if (text === '/key clear') { cfg.apiKey = ''; saveCfg(); return 'Brain disconnected. Back to offline mode.'; }
  if (!cfg.apiKey) return CANNED[Math.floor(Math.random() * CANNED.length)] + ' (offline: type /key with an Anthropic or Gemini key)';
  history.push({ role: 'user', content: text });
  while (history.length > 12) history.shift();
  try {
    if (cfg.apiKey.startsWith('AIza')) {
      const gr = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + (cfg.model || 'gemini-3.8-flash') + ':generateContent', {
        method: 'POST', headers: { 'content-type': 'application/json', 'x-goog-api-key': cfg.apiKey },
        body: JSON.stringify({ system_instruction: { parts: [{ text: PERSONA }] },
          contents: history.map(h => ({ role: h.role === 'assistant' ? 'model' : 'user', parts: [{ text: h.content }] })) }),
      });
      const gj = await gr.json();
      if (!gr.ok) throw new Error(gj.error && gj.error.message || gr.status);
      const gout = ((gj.candidates || [])[0]?.content?.parts || []).map(p => p.text || '').join('').trim() || '...';
      history.push({ role: 'assistant', content: gout });
      return gout;
    }
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': cfg.apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-5-5', max_tokens: 200, system: PERSONA, messages: history }),
    });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error && j.error.message || r.status);
    const out = (j.content || []).map(c => c.text || '').join('').trim() || '...';
    history.push({ role: 'assistant', content: out });
    return out;
  } catch (e) { history.pop();
    if (/api key|api_key|invalid|unauthor|permission|401|403/i.test(e.message)) { cfg.apiKey = ''; saveCfg(); return 'That key was rejected, so I dropped it. Offline mode on.'; }
    return 'Signal lost: ' + e.message; }
}
ipcMain.handle('chat', (_e, t) => chat(t));
ipcMain.on('focus', () => { win.setIgnoreMouseEvents(false); win.focus(); });

// ---------- menus ----------
function buildMenu() {
  return Menu.buildFromTemplate([
    { label: 'Teleport', click: teleport },
    { label: 'Say something', click: () => say('What should I show you?', ['icon', 'claude', 'folder', 'nothing']) },
    { label: 'Mode', submenu: [['Satellite orb', 'orb'], ['Full body', 'body']].map(([l, k]) =>
        ({ label: l, type: 'radio', checked: cfg.mode === k, click: () => setMode(k) })) },
    { label: 'Voice', type: 'checkbox', checked: cfg.voice, click: m => { cfg.voice = m.checked; saveCfg(); sendState({ voice: cfg.voice }); } },
    { type: 'separator' },
    { label: 'Size', submenu: [['Small', 0.7], ['Normal', 1], ['Large', 1.4]].map(([l, s]) =>
        ({ label: l, type: 'radio', checked: scale === s, click: () => setScale(s) })) },
    { label: 'Wander when idle', type: 'checkbox', checked: wander, click: m => { wander = m.checked; } },
    { label: 'Start with Windows', type: 'checkbox', checked: app.getLoginItemSettings().openAtLogin,
      click: m => app.setLoginItemSettings({ openAtLogin: m.checked }) },
    { type: 'separator' },
    hasHooks()
      ? { label: 'Remove Claude Code hooks', click: removeHooks }
      : { label: 'Install Claude Code hooks', click: installHooks },
    { type: 'separator' },
    { label: 'Put her away', click: () => app.quit() },
  ]);
}
function refreshMenus() { tray && tray.setContextMenu(buildMenu()); }

function makeTray() {
  const img = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray.png'));
  tray = new Tray(img);
  tray.setToolTip('Capri');
  tray.setContextMenu(buildMenu());
  tray.on('click', () => win.show());
}

ipcMain.on('ignore', (_e, v) => win.setIgnoreMouseEvents(v, { forward: true }));
ipcMain.on('drag-start', () => { dragging = true; walking = false; dragOrigin = win.getPosition(); });
ipcMain.on('drag-move', (_e, dx, dy) => dragOrigin && win.setPosition(dragOrigin[0] + dx, dragOrigin[1] + dy));
ipcMain.on('drag-end', () => { dragging = false; dragOrigin = null; });
ipcMain.on('context', () => buildMenu().popup({ window: win }));
ipcMain.on('clicked', () => say('What should I show you?', ['icon', 'claude', 'folder', 'nothing']));
ipcMain.on('choice', (_e, id) => {
  if (id === 'icon') say('My icon is in the system tray by the clock. Right-click it for my menu.');
  else if (id === 'claude') say(hasHooks() ? "I'm watching Claude Code through hooks." : 'Right-click me and pick "Install Claude Code hooks" so I can watch it.');
  else if (id === 'folder') { shell.openPath(path.join(os.homedir(), '.claude')); say("This is Claude's folder. settings.json holds its settings."); }
  else say('Okay. Just click me if you need me.');
});

app.whenReady().then(() => { createWindow(); makeTray(); });
app.on('window-all-closed', () => app.quit());
