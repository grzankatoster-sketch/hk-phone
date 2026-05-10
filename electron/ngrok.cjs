// ─── electron/ngrok.cjs ──────────────────────────────────────────────────────
// Zarządza tunelem ngrok — publiczny adres dla pracowników (stała domena)
// ─────────────────────────────────────────────────────────────────────────────

const ngrok   = require("@ngrok/ngrok");
const fs      = require("fs");
const path    = require("path");
const { app } = require("electron");

const CONFIG_FILE   = path.join(app.getPath("userData"), "ngrok-config.json");
const FIXED_DOMAIN  = "unbuskined-aboriginally-norene.ngrok-free.dev";
const FIXED_TOKEN   = "3Bd26Ovtyq9RNRKimyAA0eJL1P5_2QvKH4eve1VW3rmt9csiR";

let _listener   = null;
let _url        = null;
let _onUrl      = null; // callback gdy URL gotowy

// ─── Zapis/odczyt tokenu i domeny ────────────────────────────────────────────
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {}
  return { token: null, domain: null };
}

function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); } catch {}
}

function getConfig() { return { ...loadConfig(), domain: FIXED_DOMAIN }; }

function setToken(token) {
  const cfg = loadConfig();
  cfg.token = token.trim();
  saveConfig(cfg);
}

function setDomain(domain) {
  const cfg = loadConfig();
  cfg.domain = domain.trim();
  saveConfig(cfg);
}

function getUrl() { return _url; }

function setOnUrl(fn) { _onUrl = fn; }

// ─── Start tunelu ─────────────────────────────────────────────────────────────
async function start() {
  try {
    if (_listener) {
      try { await _listener.close(); } catch {}
      _listener = null;
      _url = null;
    }

    // Najpierw spróbuj ze stałą domeną, jeśli błąd — spróbuj bez domeny
    try {
      _listener = await ngrok.forward({ authtoken: FIXED_TOKEN, addr: 3737, domain: FIXED_DOMAIN });
    } catch (e1) {
      console.warn("[ngrok] Błąd ze stałą domeną:", e1.message, "— próba bez domeny...");
      _listener = await ngrok.forward({ authtoken: FIXED_TOKEN, addr: 3737 });
    }
    _url = _listener.url();
    console.log("[ngrok] Tunel:", _url);
    if (_onUrl) _onUrl(_url);
    return { ok: true, url: _url };
  } catch (e) {
    console.error("[ngrok] Błąd:", e.message);
    return { ok: false, error: e.message };
  }
}

async function stop() {
  if (_listener) {
    try { await _listener.close(); } catch {}
    _listener = null;
    _url = null;
  }
}

module.exports = { start, stop, getUrl, getConfig, setToken, setDomain, setOnUrl };
