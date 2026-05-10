// ─── electron/remoteserver.cjs ────────────────────────────────────────────────
// Synchronizuje stan HK z hostowanym serwerem (Railway)
// ─────────────────────────────────────────────────────────────────────────────

const https = require("https");
const http  = require("http");
const fs    = require("fs");
const path  = require("path");
const { app } = require("electron");

const CONFIG_FILE = path.join(app.getPath("userData"), "remote-server.json");
const SECRET      = "conrad2026";

let _baseUrl = null;

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf8"));
  } catch {}
  return { url: null };
}

function saveConfig(cfg) {
  try { fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2)); } catch {}
}

function setUrl(url) {
  url = url.trim().replace(/\/$/, "");
  _baseUrl = url;
  saveConfig({ url });
}

function getUrl() {
  if (_baseUrl) return _baseUrl;
  const cfg = loadConfig();
  if (cfg.url) { _baseUrl = cfg.url; return _baseUrl; }
  return null;
}

function post(path, body) {
  const url = getUrl();
  if (!url) return Promise.resolve({ ok: false, error: "Brak adresu serwera" });
  return new Promise((resolve) => {
    try {
      const fullUrl = new URL(url + path);
      const data    = JSON.stringify(body);
      const lib     = fullUrl.protocol === "https:" ? https : http;
      const req     = lib.request({
        hostname: fullUrl.hostname,
        port:     fullUrl.port || (fullUrl.protocol === "https:" ? 443 : 80),
        path:     fullUrl.pathname + fullUrl.search,
        method:   "POST",
        headers:  { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data), "x-secret": SECRET },
      }, (res) => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => { try { resolve({ ok: res.statusCode < 300, ...JSON.parse(d) }); } catch { resolve({ ok: false }); } });
      });
      req.on("error", e => resolve({ ok: false, error: e.message }));
      req.write(data);
      req.end();
    } catch (e) { resolve({ ok: false, error: e.message }); }
  });
}

function pushState(state) {
  return post("/api/update", state);
}

function pushVacate(room) {
  return post("/api/vacate", { room });
}

async function testConnection() {
  const url = getUrl();
  if (!url) return { ok: false, error: "Brak adresu serwera" };
  return new Promise((resolve) => {
    try {
      const fullUrl = new URL(url + "/ping");
      const lib     = fullUrl.protocol === "https:" ? https : http;
      const req     = lib.request({ hostname: fullUrl.hostname, port: fullUrl.port || (fullUrl.protocol === "https:" ? 443 : 80), path: "/ping", method: "GET" }, (res) => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => resolve({ ok: res.statusCode === 200 }));
      });
      req.setTimeout(5000, () => { req.destroy(); resolve({ ok: false, error: "Timeout" }); });
      req.on("error", e => resolve({ ok: false, error: e.message }));
      req.end();
    } catch (e) { resolve({ ok: false, error: e.message }); }
  });
}

function fetchState() {
  const url = getUrl();
  if (!url) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const fullUrl = new URL(url + "/api/state");
      const lib     = fullUrl.protocol === "https:" ? https : http;
      const req     = lib.request({
        hostname: fullUrl.hostname,
        port:     fullUrl.port || (fullUrl.protocol === "https:" ? 443 : 80),
        path:     "/api/state",
        method:   "GET",
      }, (res) => {
        let d = "";
        res.on("data", c => d += c);
        res.on("end", () => { try { resolve(JSON.parse(d)); } catch { resolve(null); } });
      });
      req.setTimeout(4000, () => { req.destroy(); resolve(null); });
      req.on("error", () => resolve(null));
      req.end();
    } catch { resolve(null); }
  });
}

let _pollInterval = null;

function startPolling(onStateUpdate) {
  if (_pollInterval) clearInterval(_pollInterval);
  _pollInterval = setInterval(async () => {
    const remote = await fetchState();
    if (remote && remote.rooms) onStateUpdate(remote);
  }, 5000);
}

function stopPolling() {
  if (_pollInterval) { clearInterval(_pollInterval); _pollInterval = null; }
}

module.exports = { setUrl, getUrl, pushState, pushVacate, testConnection, startPolling, stopPolling };
