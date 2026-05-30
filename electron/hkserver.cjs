// ─── electron/hkserver.cjs ───────────────────────────────────────────────────
// Lokalny serwer HTTP dla pokojówek — dostępny przez WiFi w obiekcie
// Każda pokojówka skanuje QR i widzi swoje pokoje na telefonie (real-time SSE)
// ─────────────────────────────────────────────────────────────────────────────

const http   = require("http");
const os     = require("os");
const fs     = require("fs");
const urlMod = require("url");
const path   = require("path");
const QRCode = require("qrcode");

let webpush = null;
try { webpush = require("web-push"); } catch (e) {
  console.warn("[HKServer] web-push module not installed — push notifications disabled. Run: npm install web-push");
}

const PORT = 3737;
let _server = null;

// ─── Web Push: VAPID + subskrypcje ───────────────────────────────────────────
const VAPID_FILE = path.join(os.homedir(), ".hkserver-vapid.json");
const SUBS_FILE  = path.join(os.homedir(), ".hkserver-pushsubs.json");
let _vapid = null;
let _pushSubs = {}; // { workerName: [subscriptionJSON, ...] }

function ensureVapid() {
  if (!webpush) return null;
  if (_vapid) return _vapid;
  try {
    if (fs.existsSync(VAPID_FILE)) {
      _vapid = JSON.parse(fs.readFileSync(VAPID_FILE, "utf8"));
    } else {
      _vapid = webpush.generateVAPIDKeys();
      fs.writeFileSync(VAPID_FILE, JSON.stringify(_vapid));
      console.log("[HKServer] Wygenerowano nowe klucze VAPID");
    }
    webpush.setVapidDetails("mailto:hk@conradcomfort.local", _vapid.publicKey, _vapid.privateKey);
    return _vapid;
  } catch (e) {
    console.error("[HKServer] VAPID error:", e.message);
    return null;
  }
}

function loadSubs() {
  try {
    if (fs.existsSync(SUBS_FILE)) _pushSubs = JSON.parse(fs.readFileSync(SUBS_FILE, "utf8")) || {};
  } catch { _pushSubs = {}; }
}
function saveSubs() {
  try { fs.writeFileSync(SUBS_FILE, JSON.stringify(_pushSubs)); } catch {}
}
loadSubs();

function addSubscription(worker, subscription) {
  if (!worker || !subscription || !subscription.endpoint) return;
  if (!_pushSubs[worker]) _pushSubs[worker] = [];
  if (!_pushSubs[worker].find(s => s.endpoint === subscription.endpoint)) {
    _pushSubs[worker].push(subscription);
    saveSubs();
  }
}

async function sendPushToWorker(worker, payload) {
  if (!webpush) return;
  if (!ensureVapid()) return;
  const subs = _pushSubs[worker] || [];
  if (!subs.length) return;
  const stale = [];
  await Promise.all(subs.map(async sub => {
    try {
      await webpush.sendNotification(sub, JSON.stringify(payload));
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) stale.push(sub.endpoint);
      else console.warn("[HKServer] Push error:", e.statusCode || "", e.message);
    }
  }));
  if (stale.length) {
    _pushSubs[worker] = subs.filter(s => !stale.includes(s.endpoint));
    saveSubs();
  }
}

async function sendPushToAll(payload, exceptWorker) {
  for (const w of Object.keys(_pushSubs)) {
    if (w === exceptWorker) continue;
    await sendPushToWorker(w, payload);
  }
}

// ─── Stan ─────────────────────────────────────────────────────────────────────
let _state = {
  date:          new Date().toISOString().split("T")[0],
  assignments:   {},
  pmAssignments: {},
  rooms:         {},
  roomTypes:     {},
  logs:          [],
  exchanges:     [],
};

// Snapshot usterek konserwatora (name → faults[])
let _konserwatorFaults = {};

function setKonserwatorFaults(name, faults) {
  _konserwatorFaults[name] = Array.isArray(faults) ? faults : [];
}

function addLog(worker, action, room, extra) {
  const time = new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  _state.logs.push({ time, worker, action, room, extra: extra || null });
  if (_state.logs.length > 200) _state.logs = _state.logs.slice(-200);
}

// ─── Wymiana pokoi ────────────────────────────────────────────────────────────
function getUnstartedRooms(workerName) {
  return (_state.assignments[workerName] || []).filter(no => {
    const r = _state.rooms[no];
    return !r || r.status === "W";
  });
}

function createExchange(from, to) {
  const rooms = getUnstartedRooms(from);
  if (!rooms.length) return null;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const exchange = { id, from, to, rooms, status: "pending", createdAt: new Date().toISOString() };
  if (!_state.exchanges) _state.exchanges = [];
  _state.exchanges = _state.exchanges.slice(-50);
  _state.exchanges.push(exchange);
  addLog(from, "exchange_request", null, "→ " + to + " (" + rooms.length + " pok.)");
  sendSSE(to,   { type: "exchange_request", exchange });
  sendSSE(from, { type: "exchange_sent",    exchange });
  sendPushToWorker(to, {
    title: "⇄ Wymiana pokoi",
    body: from + " chce Ci przekazać " + rooms.length + " pok.: " + rooms.join(", "),
    tag: "ex-" + exchange.id,
    requireInteraction: true,
  }).catch(() => {});
  notifyChange();
  return exchange;
}

// Kasia (requester) prosi Tetianę (donor) o przekazanie pokoi — donor musi zaakceptować
function requestExchangeFrom(requester, donor) {
  const rooms = getUnstartedRooms(donor);
  if (!rooms.length) return null;
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const exchange = { id, from: donor, to: requester, rooms, status: "pending", requestedBy: requester, createdAt: new Date().toISOString() };
  if (!_state.exchanges) _state.exchanges = [];
  _state.exchanges = _state.exchanges.slice(-50);
  _state.exchanges.push(exchange);
  addLog(requester, "exchange_request", null, requester + " prosi " + donor + " o pokoje");
  sendSSE(donor,     { type: "exchange_request", exchange });
  sendSSE(requester, { type: "exchange_sent",    exchange });
  sendPushToWorker(donor, {
    title: "⇄ Prośba o pokój",
    body: requester + " prosi Cię o przekazanie " + rooms.length + " pok.",
    tag: "ex-" + exchange.id,
    requireInteraction: true,
  }).catch(() => {});
  notifyChange();
  return exchange;
}

function resolveExchange(id, accept) {
  if (!_state.exchanges) _state.exchanges = [];
  const ex = _state.exchanges.find(e => e.id === id && e.status === "pending");
  if (!ex) return false;
  ex.status = accept ? "accepted" : "rejected";
  ex.resolvedAt = new Date().toISOString();
  if (accept) {
    const fromArr = _state.assignments[ex.from] || [];
    const toArr   = _state.assignments[ex.to]   || [];
    ex.rooms.forEach(no => {
      const idx = fromArr.indexOf(no);
      if (idx >= 0) fromArr.splice(idx, 1);
      if (!toArr.includes(no)) toArr.push(no);
      if (_state.rooms[no]) _state.rooms[no].worker = ex.to;
    });
    _state.assignments[ex.from] = fromArr;
    _state.assignments[ex.to]   = toArr;
    addLog(ex.to, "exchange_accept", null, "od " + ex.from + " (" + ex.rooms.length + " pok.)");
    Object.keys(_state.assignments).forEach(w => sendSSE(w, { type: "state", rooms: getWorkerRooms(w) }));
  } else {
    addLog(ex.to, "exchange_reject", null, "od " + ex.from);
  }
  sendSSE(ex.from, { type: "exchange_done", accepted: accept, exchange: ex });
  sendSSE(ex.to,   { type: "exchange_done", accepted: accept, exchange: ex });
  notifyChange();
  return true;
}

function getTeamSummary() {
  const allNames = new Set([
    ...Object.keys(_state.assignments   || {}),
    ...Object.keys(_state.pmAssignments || {}),
  ]);
  const workers = [];
  allNames.forEach(name => {
    const morning = _state.assignments[name]    || [];
    const pm      = (_state.pmAssignments || {})[name] || [];
    const all     = [...morning, ...pm];
    const done     = all.filter(no => _state.rooms[no]?.status === "czyste").length;
    const cleaning = all.filter(no => _state.rooms[no]?.status === "czyszczenie").length;
    const waiting  = all.filter(no => {
      const r = _state.rooms[no];
      return !r || r.status === "W";
    }).length;
    const firstStart = all
      .map(no => _state.rooms[no]?.startedAt).filter(Boolean).sort()[0] || null;
    workers.push({ name, total: all.length, done, cleaning, waiting, startedAt: firstStart });
  });
  const vacatedRooms = Object.entries(_state.rooms || {})
    .filter(([, r]) => r.vacated && r.status === "W")
    .map(([no, r]) => ({ no, worker: r.worker || null }));
  const recentLogs = (_state.logs || []).slice(-30);
  const exchanges  = (_state.exchanges || []).slice(-20);
  return { workers, vacatedRooms, recentLogs, exchanges, date: _state.date };
}

const STATE_FILE = path.join(os.homedir(), ".hkserver-state.json");

function saveState() {
  try { fs.writeFileSync(STATE_FILE, JSON.stringify(_state)); } catch {}
}

function loadSavedState() {
  try {
    if (fs.existsSync(STATE_FILE)) {
      var saved = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
      var today = new Date().toISOString().split("T")[0];
      if (saved.date === today) _state = saved;
    }
  } catch {}
}
loadSavedState();

// SSE klienci: workerName → [res, ...]
let _clients = {};

// Callback do Electron (powiadamianie React o zmianach)
let _onStateChange = null;
function setOnStateChange(fn) { _onStateChange = fn; }
function notifyChange() { saveState(); _onStateChange && _onStateChange(_state); }

// ─── Sieć ─────────────────────────────────────────────────────────────────────
function getLocalIP() {
  const all = [];
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const i of ifaces) {
      if (i.family === "IPv4" && !i.internal) all.push(i);
    }
  }
  if (!all.length) return "127.0.0.1";

  // Priorytet: maska /24 (255.255.255.0) — typowe WiFi/LAN/hotspot
  // VPN wykrywamy TYLKO po masce (duże podsieci: /20, /8, /16) — NIE po prefiksie adresu
  const score = (i) => {
    const a = i.address;
    const m = i.netmask;
    const n = (i.name || "").toLowerCase();
    const is24  = m === "255.255.255.0";
    const isVpn = m === "255.255.240.0"   // /20 — typowy OpenVPN / FortiClient
               || m === "255.255.0.0"     // /16
               || m === "255.0.0.0";      // /8
    if (isVpn) return 0;
    // Hotspot Windows: adres 192.168.137.x lub interfejs "Local Area Connection*"
    const isHotspot = a.startsWith("192.168.137.") || n.includes("local area connection*") || n.includes("wi-fi direct");
    if (isHotspot && is24) return 5;
    if (a.startsWith("192.168.") && is24) return 4;
    if (a.startsWith("10.")       && is24) return 3;
    if (a.startsWith("172.")      && is24) return 2;
    if (is24) return 2;
    return 1;
  };
  all.sort((a, b) => score(b) - score(a));
  return all[0].address;
}

function getBaseURL() {
  return `http://${getLocalIP()}:${PORT}`;
}

// Zwróć wszystkie interfejsy z ich wynikami (do diagnostyki w UI)
function getAllIPs() {
  const all = [];
  for (const [name, ifaces] of Object.entries(os.networkInterfaces())) {
    for (const i of ifaces) {
      if (i.family === "IPv4" && !i.internal) {
        const m = i.netmask;
        const a = i.address;
        const is24    = m === "255.255.255.0";
        const isVpn   = m === "255.255.240.0" || m === "255.255.0.0" || m === "255.0.0.0";
        const nLow    = name.toLowerCase();
        const isHotspot = a.startsWith("192.168.137.") || nLow.includes("local area connection*") || nLow.includes("wi-fi direct");
        let sc = 1;
        if (isVpn) sc = 0;
        else if (isHotspot && is24) sc = 5;
        else if (a.startsWith("192.168.") && is24) sc = 4;
        else if (a.startsWith("10.")       && is24) sc = 3;
        else if (is24) sc = 2;
        const label = isVpn ? " (VPN)" : isHotspot ? " (Hotspot)" : a.startsWith("192.168.") ? " (WiFi/LAN)" : a.startsWith("10.") ? " (LAN)" : "";
        all.push({ name, address: a, netmask: m, score: sc, label });
      }
    }
  }
  all.sort((a, b) => b.score - a.score);
  return all;
}

async function getQR(workerName, overrideIp, baseUrl, pm) {
  const base = baseUrl || (overrideIp ? `http://${overrideIp}:${PORT}` : getBaseURL());
  const prefix = pm ? "hkpm" : "hk";
  const link = `${base}/${prefix}/${encodeURIComponent(workerName)}`;
  return { url: link, dataURL: await QRCode.toDataURL(link, { width: 280, margin: 2, color: { dark: "#000000", light: "#ffffff" } }) };
}

// ─── Zarządzanie stanem ───────────────────────────────────────────────────────
// pmAssignments: { "Tetiana": ["201","202"] }, pmRoomTypes: { "201": "PGZ", "202": "BR" }
function setAssignments(assignments, date, roomTypes, pmAssignments, pmRoomTypes) {
  _state.date          = date || _state.date;
  _state.assignments   = assignments;
  _state.pmAssignments = pmAssignments || {};
  if (roomTypes) _state.roomTypes = roomTypes;

  // Poranna obsada (status W)
  Object.entries(assignments).forEach(([worker, rooms]) => {
    rooms.forEach(no => {
      const type = (_state.roomTypes || {})[no] || null;
      if (!_state.rooms[no]) {
        _state.rooms[no] = { worker, status: "W", vacated: false, startedAt: null, doneAt: null, type };
      } else {
        _state.rooms[no].worker = worker;
        if (type) _state.rooms[no].type = type;
      }
    });
  });

  // Popołudniowa obsada (PG/PGZ/BR/ZS) — typ pochodzi z pmRoomTypes
  Object.entries(_state.pmAssignments).forEach(([worker, rooms]) => {
    rooms.forEach(no => {
      const type = (pmRoomTypes || {})[no] || (_state.roomTypes || {})[no] || null;
      if (!_state.rooms[no]) {
        _state.rooms[no] = { worker, status: "W", vacated: false, startedAt: null, doneAt: null, type };
      } else {
        _state.rooms[no].worker = worker;
        if (type) _state.rooms[no].type = type;
      }
    });
  });

  // Cascade: usun pokoje ktore nie sa juz przypisane (jezeli pokojowka jeszcze nie zaczela)
  // Jezeli rs.status to "czyszczenie"/"czyste"/"pominiete" — NIE ruszamy (in-progress/done)
  const allCurrentlyAssigned = new Set();
  Object.values(assignments).forEach(arr => arr.forEach(no => allCurrentlyAssigned.add(no)));
  Object.values(_state.pmAssignments).forEach(arr => arr.forEach(no => allCurrentlyAssigned.add(no)));
  const affectedWorkers = new Set();
  Object.keys(_state.rooms).forEach(no => {
    const r = _state.rooms[no];
    if (!r) return;
    if (allCurrentlyAssigned.has(no)) return;
    // Pokoj nie jest juz przypisany — sprawdz status
    const inProgress = r.status === "czyszczenie" || r.status === "czyste" || r.status === "pominięte" || r.status === "pominiete";
    if (inProgress) return; // szanuj prace pokojowki
    if (r.worker) affectedWorkers.add(r.worker);
    delete _state.rooms[no];
  });

  // Powiadom WSZYSTKICH pracownikow (porannych + popoludniowych) o nowych przypisaniach
  Object.keys(assignments).forEach(w => sendSSE(w, { type: "state", rooms: getWorkerRooms(w) }));
  Object.keys(_state.pmAssignments).forEach(w => sendSSE(w, { type: "state", rooms: getWorkerRooms(w) }));
  // Powiadom takze pracownikow ktorych pokoje zostaly usuniete (zeby zaktualizowac telefon)
  affectedWorkers.forEach(w => {
    if (!assignments[w] && !_state.pmAssignments[w]) {
      sendSSE(w, { type: "state", rooms: getWorkerRooms(w) });
    }
  });
  saveState();
}

function vacateRoom(roomNo) {
  if (!_state.rooms[roomNo]) _state.rooms[roomNo] = { status: "W", vacated: false };
  _state.rooms[roomNo].vacated = true;
  addLog("Recepcja", "vacate", roomNo);
  const worker = _state.rooms[roomNo].worker;
  if (worker) {
    sendSSE(worker, { type: "room_vacated", room: roomNo });
    sendSSE(worker, { type: "state", rooms: getWorkerRooms(worker) });
    sendPushToWorker(worker, {
      title: "🛏 Pokój gotowy!",
      body: "Pokój " + roomNo + " jest pusty — zacznij sprzątanie",
      tag: "vac-" + roomNo,
      requireInteraction: true,
    }).catch(() => {});
  }
  notifyChange();
}

// Wysłane przez recepcję (z HKLivePanel) po dodaniu zadania w Supabase
function pushTaskToWorkers(task, workers) {
  if (!task || !task.text) return;
  const targets = Array.isArray(workers) && workers.length ? workers : Object.keys(_pushSubs);
  const body = (task.room ? "Pokój " + task.room + ": " : "") + task.text;
  targets.forEach(w => {
    sendPushToWorker(w, {
      title: "📋 Nowe zadanie HK",
      body: body.slice(0, 150),
      tag: "task-" + (task.id || Date.now()),
      requireInteraction: true,
    }).catch(() => {});
  });
}

function getState() { return _state; }

// Merguje zmiany statusów pokoi z Railway (nie nadpisuje vacated — to kontroluje Electron)
function mergeRemoteRooms(remoteState) {
  if (!remoteState || !remoteState.rooms) return;
  let changed = false;
  Object.entries(remoteState.rooms).forEach(([no, remote]) => {
    const local = _state.rooms[no];
    if (!local) return; // pokój nie należy do nas — ignoruj
    const fields = ["status", "startedAt", "doneAt", "type", "notes"];
    fields.forEach(f => {
      if (remote[f] !== undefined && remote[f] !== local[f]) {
        local[f] = remote[f];
        changed = true;
      }
    });
  });
  // Merge logs from remote
  if (remoteState.logs && remoteState.logs.length) {
    const existing = new Set(_state.logs.map(l => `${l.time}|${l.worker}|${l.room}|${l.action}`));
    remoteState.logs.forEach(l => {
      const key = `${l.time}|${l.worker}|${l.room}|${l.action}`;
      if (!existing.has(key)) { _state.logs.push(l); existing.add(key); changed = true; }
    });
    if (_state.logs.length > 200) _state.logs = _state.logs.slice(-200);
  }
  if (changed) notifyChange();
}

function resetDay(date) {
  _state.date        = date || new Date().toISOString().split("T")[0];
  _state.assignments = {};
  _state.rooms       = {};
  _clients           = {};
  saveState();
}

// ─── SSE helpers ──────────────────────────────────────────────────────────────
function sendSSE(workerName, data) {
  const cls = _clients[workerName] || [];
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  cls.forEach(res => { try { res.write(msg); } catch {} });
}

function broadcastReception(data) {
  // Wyślij do wszystkich podłączonych klientów recepcji (/reception/stream)
  (_clients["__reception__"] || []).forEach(res => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
  });
}

function getWorkerRooms(workerName) {
  // Polacz pokoje poranne (assignments) i popoludniowe (pmAssignments)
  const morningRooms = _state.assignments[workerName] || [];
  const pmRooms = (_state.pmAssignments && _state.pmAssignments[workerName]) || [];
  const all = [...morningRooms, ...pmRooms];
  return all.map(no => ({
    no, ...(_state.rooms[no] || { status: "W", vacated: false, startedAt: null, doneAt: null }),
  }));
}


// ─── Rendering HTML zakładki Zespół (po stronie serwera) ─────────────────────
function escH(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

function buildTeamHtml(workerName) {
  const d = getTeamSummary();
  const pending  = (d.exchanges||[]).filter(e=>e.status==='pending');
  const received = pending.filter(e=>e.to===workerName);
  const sent     = pending.filter(e=>e.from===workerName);
  const myData   = (d.workers||[]).find(w=>w.name===workerName);
  const myWaiting = myData ? myData.waiting : 0;

  // ── Wymiany ──
  // "received" = ktoś MNE wysyła pokoje (ja je przyjmuję)
  // "receivedRequest" = ktoś mnie PROSI żebym JA dała im pokoje (ja decyduję)
  const receivedRequest = pending.filter(e => e.from === workerName && e.requestedBy && e.requestedBy !== workerName);
  const sentByMe        = pending.filter(e => e.from === workerName && (!e.requestedBy || e.requestedBy === workerName));
  const sentReqByMe     = pending.filter(e => e.to === workerName && e.requestedBy === workerName);

  let exHtml = '';
  received.forEach(ex => {
    exHtml += `<div class="exp">
      <div class="exp-t">&#8644; Wymiana od ${escH(ex.from)}</div>
      <div style="font-size:12px;color:#8b949e">${escH(ex.from)} chce Ci przekaza&#263; <strong style="color:#f59e0b">${ex.rooms.length} pok&oacute;j</strong>: ${ex.rooms.map(escH).join(', ')}</div>
      <div class="exb">
        <button class="ba" data-exid="${escH(ex.id)}" data-exaction="accept">&#10003; Akceptuj</button>
        <button class="br2" data-exid="${escH(ex.id)}" data-exaction="reject">&#10005; Odrzu&#263;</button>
      </div></div>`;
  });
  receivedRequest.forEach(ex => {
    exHtml += `<div class="exp" style="border-color:#60a5fa">
      <div class="exp-t" style="color:#60a5fa">&#8592; ${escH(ex.requestedBy)} prosi o Twoje wolne pok&oacute;j</div>
      <div style="font-size:12px;color:#8b949e">Mo&#380;esz przekaza&#263; <strong style="color:#60a5fa">${ex.rooms.length} pok&oacute;j</strong>: ${ex.rooms.map(escH).join(', ')}</div>
      <div class="exb">
        <button class="ba" data-exid="${escH(ex.id)}" data-exaction="accept">&#10003; Oddaj pokoje</button>
        <button class="br2" data-exid="${escH(ex.id)}" data-exaction="reject">&#10005; Odm&oacute;w</button>
      </div></div>`;
  });
  sentByMe.forEach(ex => {
    exHtml += `<div style="background:#161b22;border:1.5px solid #30363d;border-radius:12px;padding:12px 14px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:#8b949e">&#9200; Oczekuje na ${escH(ex.to)}</div>
      <div style="font-size:12px;color:#484f58;margin-top:4px">Przekazujesz ${ex.rooms.length} pok&oacute;j</div></div>`;
  });
  sentReqByMe.forEach(ex => {
    exHtml += `<div style="background:#161b22;border:1.5px solid rgba(96,165,250,.3);border-radius:12px;padding:12px 14px;margin-bottom:10px">
      <div style="font-size:13px;font-weight:700;color:#60a5fa">&#9200; Prosisz ${escH(ex.from)} o pokoje...</div>
      <div style="font-size:12px;color:#484f58;margin-top:4px">Czekasz na odpowied&#378;</div></div>`;
  });
  if (!sent.length && myWaiting > 0) {
    // Mam wolne pokoje — mogę przekazać komuś innemu
    (d.workers||[]).filter(w=>w.name!==workerName).forEach(w => {
      exHtml += `<button class="bt" data-transfer="${escH(w.name)}">&rarr; Przeka&#380; wolne pok&oacute;j do ${escH(w.name)} (${myWaiting} pok.)</button>`;
    });
  } else if (!sent.length && myWaiting === 0) {
    // Nie mam wolnych — mogę poprosić kogoś kto MA wolne
    (d.workers||[]).filter(w=>w.name!==workerName && w.waiting>0).forEach(w => {
      exHtml += `<button class="bt" data-requestfrom="${escH(w.name)}" style="border-color:rgba(96,165,250,.35);background:rgba(96,165,250,.08);color:#60a5fa">&larr; Poproś ${escH(w.name)} o pok&oacute;j (ma ${w.waiting} wolnych)</button>`;
    });
  }

  // ── Pracownicy ──
  let wHtml = '';
  (d.workers||[]).forEach(w => {
    const pct = w.total ? Math.round(w.done/w.total*100) : 0;
    const stTxt = w.startedAt ? new Date(w.startedAt).toLocaleTimeString('pl-PL',{hour:'2-digit',minute:'2-digit'}) : '—';
    const wc = w.waiting > 0 ? '#f59e0b' : '#34d399';
    const me = w.name === workerName;
    const bg = me ? 'background:rgba(99,102,241,.06)' : '';
    const avBg = me ? '#6366f1' : '#30363d';
    const fw = me ? '900' : '700';
    const meTag = me ? ' <span style="font-size:10px;color:#6366f1">Ty</span>' : '';
    wHtml += `<div class="wr" style="${bg}">
      <div class="wa" style="background:${avBg}">${escH(w.name.charAt(0))}</div>
      <div style="flex:1">
        <div style="font-size:13px;font-weight:${fw};color:#e6edf3">${escH(w.name)}${meTag}</div>
        <div style="font-size:10px;color:#8b949e">start: ${stTxt}</div>
        <div style="height:3px;border-radius:999px;background:#21262d;margin-top:4px">
          <div style="height:100%;width:${pct}%;background:${avBg};border-radius:999px;transition:width .3s"></div>
        </div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:14px;font-weight:900;color:#34d399">${w.done}/${w.total}</div>
        <div style="font-size:11px;font-weight:700;color:${wc}">${w.waiting} wolnych</div>
      </div>
    </div>`;
  });

  // ── Puste pokoje ──
  let vHtml = '';
  (d.vacatedRooms||[]).forEach(v => {
    vHtml += `<span class="vp">&#128276; ${escH(v.no)}${v.worker?' &bull; '+escH(v.worker):''}</span>`;
  });

  // ── Logi ──
  const LC = {start:'#60a5fa',done:'#34d399',skip:'#f59e0b',vacate:'#a78bfa',exchange_accept:'#34d399',exchange_reject:'#f87171',exchange_request:'#f59e0b',task_done:'#34d399'};
  const LI = {start:'&#9654;',done:'&#10003;',skip:'&#10005;',vacate:'&#128276;',exchange_accept:'&#8644;',exchange_reject:'&#10005;',exchange_request:'&#8644;',task_done:'&#9745;'};
  const logTexts = {
    start:    l => escH(l.worker)+' zaczyna pok. '+escH(l.room),
    done:     l => escH(l.worker)+' sko&nacute;czy&lstrok;a pok. '+escH(l.room)+(l.extra?' &middot; '+escH(l.extra):''),
    skip:     l => escH(l.worker)+' &mdash; go&sacute;cie nie chcieli ('+escH(l.room)+')',
    vacate:   l => 'Recepcja: pok. '+escH(l.room)+' pusty',
    exchange_request: l => l.extra ? escH(l.extra) : escH(l.worker)+' proponuje wymian&ecirc;',
    exchange_accept:  l => l.extra ? escH(l.extra) : escH(l.worker)+' przyj&ecirc;&lstrok;a wymian&ecirc;',
    exchange_reject:  l => l.extra ? escH(l.extra) : escH(l.worker)+' odrzuci&lstrok;a wymian&ecirc;',
    task_done:l => escH(l.worker)+': zadanie &mdash; '+escH(l.extra||''),
  };
  let lHtml = '';
  const rev = (d.recentLogs||[]).slice().reverse();
  rev.forEach(l => {
    const c = LC[l.action]||'#8b949e';
    const ic = LI[l.action]||'&middot;';
    const txt = (logTexts[l.action]||((ll)=>escH(ll.worker)+' '+escH(ll.action)))(l);
    lHtml += `<div class="lr">
      <div class="li" style="background:${c}22;color:${c}">${ic}</div>
      <div><div class="lt">${txt}</div><div class="ltime">${escH(l.time)}</div></div>
    </div>`;
  });

  return `
    <div id="team-exchanges">${exHtml||''}</div>
    <div class="ts"><div class="ts-title">&#128101; Zesp&oacute;&lstrok; &mdash; post&ecirc;p</div><div id="team-workers">${wHtml||'<div style="padding:12px 14px;color:#484f58;font-size:12px">Brak danych</div>'}</div></div>
    <div class="ts"><div class="ts-title">&#128276; Puste pok&oacute;j</div><div id="team-vacated" style="padding:10px 14px;display:flex;flex-wrap:wrap;gap:2px">${vHtml||'<span style="color:#484f58;font-size:12px">Brak pustych</span>'}</div></div>
    <div class="ts"><div class="ts-title">&#128203; Aktywno&#347;&#263; dzi&#347;</div><div id="team-logs">${lHtml||'<div style="padding:12px 14px;color:#484f58;font-size:12px">Brak aktywno&#347;ci</div>'}</div></div>
  `;
}

// ─── Mobilna strona HTML dla pokoójwki (z zakładką Zespół) ────────────────────────
function mobilePage(workerName) {
  var wJson = JSON.stringify(workerName);
  return '<!DOCTYPE html>\n'
  + '<html lang="pl"><head>\n'
  + '<meta charset="UTF-8">\n'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">\n'
  + '<meta name="mobile-web-app-capable" content="yes">\n'
  + '<meta name="apple-mobile-web-app-capable" content="yes">\n'
  + '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n'
  + '<meta name="apple-mobile-web-app-title" content="HK ' + workerName.replace(/"/g, "") + '">\n'
  + '<meta name="theme-color" content="#161b22">\n'
  + '<link rel="manifest" href="/manifest.json?w=' + encodeURIComponent(workerName) + '">\n'
  + '<link rel="apple-touch-icon" href="/icon-192.png">\n'
  + '<title>HK \u2022 ' + workerName + '<\/title>\n'
  + '<style>\n'
  + '*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}\n'
  + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0d1117;color:#e6edf3;min-height:100vh;overscroll-behavior:none}\n'
  + '.hdr{background:#161b22;padding:12px 16px;display:flex;align-items:center;gap:10px;border-bottom:2px solid #30363d;position:sticky;top:0;z-index:10}\n'
  + '.dot{width:9px;height:9px;border-radius:50%;background:#34d399;flex-shrink:0}.dot.off{background:#f87171}\n'
  + '.hdr-name{font-size:17px;font-weight:800}.hdr-sub{font-size:11px;color:#8b949e;margin-top:1px}\n'
  + '.tabs{display:flex;background:#161b22;border-bottom:2px solid #30363d;position:sticky;top:57px;z-index:9}\n'
  + '.tab-btn{flex:1;padding:10px 8px;border:none;background:none;color:#8b949e;font-size:13px;font-weight:700;cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px}\n'
  + '.tab-btn.active{color:#6366f1;border-bottom-color:#6366f1;background:rgba(99,102,241,.07)}\n'
  + '.rooms{padding:12px;display:flex;flex-direction:column;gap:10px}\n'
  + '.card{background:#161b22;border:2px solid #30363d;border-radius:14px;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px}\n'
  + '.card.vacated{border-color:#f59e0b;background:#1a1600}.card.cleaning{border-color:#3b82f6;background:#0d1626}.card.done{border-color:#34d399;background:#0d1a14}\n'
  + '.rno{font-size:48px;font-weight:900;letter-spacing:-2px;line-height:1}\n'
  + '.rno.vacated{color:#f59e0b}.rno.cleaning{color:#3b82f6}.rno.done{color:#34d399}.rno.waiting{color:#3a3f48}\n'
  + '.btn-list{padding:12px 20px;border-radius:10px;border:none;font-size:15px;font-weight:800;cursor:pointer;background:#1d4ed8;color:#fff}.btn-list:active{opacity:.7}\n'
  + '.room-screen{display:none;flex-direction:column;min-height:100vh}.room-screen.active{display:flex}\n'
  + '.rshdr{background:#161b22;padding:12px 16px;display:flex;align-items:center;gap:12px;border-bottom:2px solid #30363d}\n'
  + '.rshdr-back{background:none;border:1px solid #30363d;color:#60a5fa;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}\n'
  + '.rshdr-info{flex:1;text-align:center}.rshdr-no{font-size:22px;font-weight:900}.rshdr-type{font-size:13px;color:#8b949e;margin-top:2px}\n'
  + '.rs-body{padding:16px;flex:1;display:flex;flex-direction:column;gap:14px}\n'
  + '.report-table{background:#161b22;border-radius:12px;overflow:hidden;border:1.5px solid #30363d}\n'
  + '.report-title{padding:10px 14px;font-size:13px;font-weight:800;color:#8b949e;border-bottom:1px solid #21262d;letter-spacing:.5px}\n'
  + '.report-row{display:flex;align-items:center;padding:11px 14px;border-bottom:1px solid #21262d;gap:10px}.report-row:last-child{border-bottom:none}\n'
  + '.report-label{flex:1;font-size:14px;font-weight:600;color:#e6edf3}\n'
  + '.report-input{width:64px;padding:7px 10px;border-radius:8px;border:1.5px solid #30363d;background:#0d1117;color:#e6edf3;font-size:16px;font-weight:800;text-align:center;outline:none}.report-input:focus{border-color:#3b82f6}\n'
  + '.btn{display:block;width:100%;padding:17px;border-radius:12px;border:none;font-size:17px;font-weight:800;cursor:pointer;margin-top:4px}.btn:active{opacity:.7}\n'
  + '.btn-done{background:#059669;color:#fff}\n'
  + '.done-info{padding:12px 14px;background:rgba(52,211,153,.08);border:1.5px solid rgba(52,211,153,.3);border-radius:12px;font-size:13px;line-height:1.8}\n'
  + '.toast{position:fixed;bottom:24px;left:16px;right:16px;background:#1a1a2e;border:2px solid #f59e0b;color:#f59e0b;border-radius:14px;padding:14px 18px;font-size:15px;font-weight:700;z-index:100;text-align:center}\n'
  + '.sync{position:fixed;top:10px;right:12px;font-size:10px;color:#484f58;z-index:20}\n'
  + '.empty{text-align:center;padding:60px 24px;color:#484f58}.empty-ic{font-size:52px;margin-bottom:12px}\n'
  + '.ts{background:#161b22;border:1.5px solid #30363d;border-radius:12px;overflow:hidden;margin-bottom:10px}\n'
  + '.ts-title{padding:10px 14px;font-size:10px;font-weight:800;color:#8b949e;letter-spacing:.07em;text-transform:uppercase;border-bottom:1px solid #21262d}\n'
  + '.wr{display:flex;align-items:center;gap:10px;padding:10px 14px;border-bottom:1px solid #21262d}.wr:last-child{border-bottom:none}\n'
  + '.wa{width:30px;height:30px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;color:#fff;flex-shrink:0}\n'
  + '.lr{display:flex;align-items:flex-start;gap:9px;padding:8px 14px;border-bottom:1px solid #21262d}.lr:last-child{border-bottom:none}\n'
  + '.li{width:22px;height:22px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;flex-shrink:0;margin-top:1px}\n'
  + '.lt{flex:1;font-size:12px;font-weight:600;color:#e6edf3;line-height:1.4}.ltime{font-size:10px;color:#484f58;margin-top:2px}\n'
  + '.exp{background:#161b22;border:2px solid #f59e0b;border-radius:12px;padding:13px 14px;margin-bottom:10px}\n'
  + '.exp-t{font-size:13px;font-weight:800;color:#f59e0b;margin-bottom:6px}\n'
  + '.exb{display:flex;gap:8px;margin-top:10px}\n'
  + '.ba{flex:1;padding:11px;border-radius:9px;border:none;background:#059669;color:#fff;font-size:14px;font-weight:800;cursor:pointer}\n'
  + '.br2{flex:1;padding:11px;border-radius:9px;border:1.5px solid rgba(248,113,113,.4);background:rgba(248,113,113,.08);color:#f87171;font-size:14px;font-weight:800;cursor:pointer}\n'
  + '.bt{width:100%;padding:12px 14px;border-radius:10px;border:1.5px solid rgba(99,102,241,.35);background:rgba(99,102,241,.08);color:#a5b4fc;font-size:13px;font-weight:800;cursor:pointer;margin-top:6px;text-align:left}\n'
  + '.ba:active,.br2:active,.bt:active{opacity:.7}\n'
  + '.vp{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.3);color:#f59e0b;font-size:12px;font-weight:700;margin:3px}\n'
  + '<\/style><\/head>\n'
  + '<body>\n'
  + '<div class="hdr"><div class="dot" id="dot"><\/div><div style="flex:1"><div class="hdr-name">' + workerName + '<\/div><div class="hdr-sub" id="dateLabel"><\/div><\/div><button id="notif-btn" onclick="askNotif()" style="background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.3);color:#a5b4fc;border-radius:8px;padding:5px 10px;font-size:18px;cursor:pointer;flex-shrink:0" title="W&#322;&#261;cz powiadomienia">&#128276;<\/button><\/div>\n'
  + '<div id="sync" class="sync"><\/div>\n'
  + '<div class="tabs">\n'
  + '  <button class="tab-btn active" data-tab="rooms" onclick="switchTab(this.dataset.tab)">&#127968; Moje pokój<\/button>\n'
  + '  <button class="tab-btn" data-tab="team" onclick="switchTab(this.dataset.tab)">&#128101; Zespół<\/button>\n'
  + '<\/div>\n'
  + '<div id="listView"><div class="rooms" id="rooms"><div class="empty"><div class="empty-ic">&#8987;<\/div><p>Pobieranie danych...</p><\/div><\/div><\/div>\n'
  + '<div id="roomView" class="room-screen">\n'
  + '<div class="rshdr"><button class="rshdr-back" onclick="goBack()">&#8592; Powrót<\/button><div class="rshdr-info"><div class="rshdr-no" id="rv-no"><\/div><div class="rshdr-type" id="rv-type"><\/div><\/div><\/div>\n'
  + '<div class="rs-body"><div id="rv-report" class="report-table"><div class="report-title">RAPORT POKOJU<\/div>\n'
  + '<div class="report-row"><span class="report-label">Poszwa<\/span><input class="report-input" id="r-poszwa" type="number" min="0" value="0"><\/div>\n'
  + '<div class="report-row"><span class="report-label">Poszewki<\/span><input class="report-input" id="r-poszewki" type="number" min="0" value="0"><\/div>\n'
  + '<div class="report-row"><span class="report-label">Preś. Śr.<\/span><input class="report-input" id="r-przes-sr" type="number" min="0" value="0"><\/div>\n'
  + '<div class="report-row"><span class="report-label">Preś. Duże<\/span><input class="report-input" id="r-przes-duze" type="number" min="0" value="0"><\/div>\n'
  + '<div class="report-row"><span class="report-label">Ręcz. Duży<\/span><input class="report-input" id="r-recz-duzy" type="number" min="0" value="0"><\/div>\n'
  + '<div class="report-row"><span class="report-label">Ręcz. Średnii<\/span><input class="report-input" id="r-recz-sredni" type="number" min="0" value="0"><\/div>\n'
  + '<div class="report-row"><span class="report-label">Dywanik<\/span><input class="report-input" id="r-dywanik" type="number" min="0" value="0"><\/div>\n'
  + '<div class="report-row"><span class="report-label">Narzuta<\/span><input class="report-input" id="r-narzuta" type="number" min="0" value="0"><\/div>\n'
  + '<div class="report-row"><span class="report-label">Kołdra<\/span><input class="report-input" id="r-koldra" type="number" min="0" value="0"><\/div>\n'
  + '<div class="report-row"><span class="report-label">Poduszka<\/span><input class="report-input" id="r-poduszka" type="number" min="0" value="0"><\/div>\n'
  + '<div class="report-row"><span class="report-label">Podkład<\/span><input class="report-input" id="r-podklad" type="number" min="0" value="0"><\/div><\/div>\n'
  + '<button onclick="addExtraRow()" style="width:100%;margin:8px 0;padding:10px;border-radius:9px;border:1.5px dashed #30363d;background:transparent;color:#8b949e;font-size:13px;font-weight:700;cursor:pointer;">+ Dodaj pozycję spoza listy<\/button>\n'
  + '<div id="rv-done-info" style="display:none" class="done-info"><\/div>\n'
  + '<button id="rv-btn-done" class="btn btn-done" onclick="submitDone()" style="display:none">✓ Gotowe!<\/button>\n'
  + '<\/div><\/div>\n'
  + '<div id="teamView" style="display:none;flex-direction:column;padding:12px;gap:0"><div style="padding:20px;text-align:center;color:#484f58">Wczytywanie...<\/div><\/div>\n'
  + '<script>\n'
  + 'var W=' + wJson + ';\n'
  + 'var _allRooms=[];var _currentRoom=null;var _curTab="rooms";var _seen={};var toastT=null;var _seenTasks={};var _tasksReady=false;var _notifGranted=false;var _sbCfg=null;var _today=new Date().toISOString().split("T")[0];\n'
  /* Tab switching */
  + 'function switchTab(t){_curTab=t;\n'
  + '  document.getElementById("listView").style.display=t==="rooms"?"":"none";\n'
  + '  document.getElementById("teamView").style.display=t==="team"?"flex":"none";\n'
  + '  document.querySelectorAll(".tab-btn").forEach(function(b){b.classList.toggle("active",b.dataset.tab===t);});\n'
  + '  if(t==="team")pollTeam();\n'
  + '}\n'
  /* Team polling — server-rendered HTML */
  + 'function pollTeam(){\n'
  + '  fetch("/hk/team-html?w="+encodeURIComponent(W))\n'
  + '    .then(function(r){return r.text();})\n'
  + '    .then(function(html){\n'
  + '      var tv=document.getElementById("teamView");\n'
  + '      tv.innerHTML=html;\n'
  + '      tv.querySelectorAll("[data-exid]").forEach(function(btn){\n'
  + '        btn.addEventListener("click",function(){\n'
  + '          var id=this.dataset.exid;\n'
  + '          var act=this.dataset.exaction;\n'
  + '          if(act==="accept")acceptEx(id);else rejectEx(id);\n'
  + '        });\n'
  + '      });\n'
  + '      tv.querySelectorAll("[data-transfer]").forEach(function(btn){\n'
  + '        btn.addEventListener("click",function(){requestEx(this.dataset.transfer);});\n'
  + '      });\n'
  + '      tv.querySelectorAll("[data-requestfrom]").forEach(function(btn){\n'
  + '        btn.addEventListener("click",function(){requestFromEx(this.dataset.requestfrom);});\n'
  + '      });\n'
  + '    }).catch(function(){});\n'
  + '}\n'
  + 'function acceptEx(id){fetch("/hk/exchange/accept/"+id,{method:"POST"}).then(function(){pollTeam();poll();}).catch(function(){});}\n'
  + 'function rejectEx(id){fetch("/hk/exchange/reject/"+id,{method:"POST"}).then(function(){pollTeam();}).catch(function(){});}\n'
  + 'function requestEx(toW){\n'
  + '  if(!confirm("Przekaza\u0107 wolne pok\u00f3j do "+toW+"?"))return;\n'
  + '  fetch("/hk/exchange/request",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({from:W,to:toW})})\n'
  + '    .then(function(r){return r.json();})\n'
  + '    .then(function(d){if(d.ok)showToast("Pro\u015bba wys\u0142ana do "+toW);else showToast(d.error||"B\u0142\u0105d");pollTeam();})\n'
  + '    .catch(function(){showToast("B\u0142\u0105d po\u0142\u0105czenia");});\n'
  + '}\n'
  + 'function requestFromEx(donor){\n'
  + '  if(!confirm("Popro\u015b "+donor+" o przekazanie wolnych pok\u00f3j?"))return;\n'
  + '  fetch("/hk/exchange/requestfrom",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({requester:W,donor:donor})})\n'
  + '    .then(function(r){return r.json();})\n'
  + '    .then(function(d){if(d.ok)showToast("Pro\u015bba wys\u0142ana do "+donor);else showToast(d.error||"B\u0142\u0105d");pollTeam();})\n'
  + '    .catch(function(){showToast("B\u0142\u0105d po\u0142\u0105czenia");});\n'
  + '}\n'
  /* Rooms list rendering */
  + 'function render(rooms){\n'
  + '  _allRooms=rooms;\n'
  + '  var c=document.getElementById("rooms");\n'
  + '  if(!rooms||!rooms.length){c.innerHTML=`<div class="empty"><div class="empty-ic">&#10003;</div><p>Brak pok\u00f3i</p></div>`;return;}\n'
  + '  var html="";\n'
  + '  for(var i=0;i<rooms.length;i++){\n'
  + '    var r=rooms[i];\n'
  + '    var done=r.status==="czyste";var cleaning=r.status==="czyszczenie";var vac=r.vacated&&r.status==="W";\n'
  + '    var cls="card"+(done?" done":cleaning?" cleaning":vac?" vacated":"");\n'
  + '    var rno="rno"+(done?" done":cleaning?" cleaning":vac?" vacated":" waiting");\n'
  + '    html+=`<div class="${cls}"><div class="${rno}">${r.no}</div>`;\n'
  + '    if(vac){html+=`<button class="btn-list" data-no="${r.no}">&nbsp;Zaczynam&nbsp;sprz\u0105ta\u0107&nbsp;</button>`;}\n'
  + '    else if(cleaning){html+=`<button class="btn-list" style="background:#1e3a5f" data-no="${r.no}">\ud83e\uddf9 Raport</button>`;}\n'
  + '    else if(done){html+=`<span style="font-size:28px;color:#34d399">&#10003;</span>`;}\n'
  + '    html+="</div>";\n'
  + '  }\n'
  + '  c.innerHTML=html;\n'
  + '  c.querySelectorAll("[data-no]").forEach(function(btn){btn.addEventListener("click",function(){openRoom(this.dataset.no);});});\n'
  + '}\n'
  + 'function openRoom(no){\n'
  + '  var r=_allRooms.find(function(x){return x.no===no;});if(!r)return;\n'
  + '  _currentRoom=r;\n'
  + '  document.getElementById("listView").style.display="none";\n'
  + '  document.getElementById("teamView").style.display="none";\n'
  + '  document.getElementById("roomView").classList.add("active");\n'
  + '  document.getElementById("rv-no").textContent="Pok\u00f3j "+r.no;\n'
  + '  document.getElementById("rv-type").textContent=r.type||"";\n'
  + '  var rpt=r.report||{};\n'
  + '  document.getElementById("r-poszwa").value=rpt.poszwa||0;\n'
  + '  document.getElementById("r-poszewki").value=rpt.poszewki||0;\n'
  + '  document.getElementById("r-przes-sr").value=rpt.przes_sr||0;\n'
  + '  document.getElementById("r-przes-duze").value=rpt.przes_duze||0;\n'
  + '  document.getElementById("r-recz-duzy").value=rpt.recz_duzy||0;\n'
  + '  document.getElementById("r-recz-sredni").value=rpt.recz_sredni||0;\n'
  + '  document.getElementById("r-dywanik").value=rpt.dywanik||0;\n'
  + '  document.getElementById("r-narzuta").value=rpt.narzuta||0;\n'
  + '  document.getElementById("r-koldra").value=rpt.koldra||0;\n'
  + '  document.getElementById("r-poduszka").value=rpt.poduszka||0;\n'
  + '  document.getElementById("r-podklad").value=rpt.podklad||0;\n'
  + '  initExtraRows(rpt);\n'
  + '  var btnD=document.getElementById("rv-btn-done");\n'
  + '  var doneInfo=document.getElementById("rv-done-info");\n'
  + '  var tbl=document.getElementById("rv-report");\n'
  + '  doneInfo.style.display="none";tbl.style.display="";\n'
  + '  if(r.status==="czyste"){btnD.style.display="none";doneInfo.style.display="block";doneInfo.innerHTML="\u2713 Raport zapisany";tbl.style.display="none";}\n'
  + '  else if(r.status==="czyszczenie"){btnD.style.display="block";}\n'
  + '  else if(r.vacated){btnD.style.display="block";act("start",r.no,null);}\n'
  + '  else{btnD.style.display="none";}\n'
  + '}\n'
  + 'function goBack(){\n'
  + '  _currentRoom=null;\n'
  + '  document.getElementById("roomView").classList.remove("active");\n'
  + '  document.getElementById("listView").style.display=_curTab==="rooms"?"":"none";\n'
  + '  document.getElementById("teamView").style.display=_curTab==="team"?"flex":"none";\n'
  + '}\n'
  + 'function addExtraRow(nv,cv){var t=document.getElementById("rv-report");var row=document.createElement("div");row.className="report-row extra-row";row.style.gap="8px";var ni=document.createElement("input");ni.type="text";ni.className="report-label";ni.placeholder="Nazwa (np. firanki)";ni.style.cssText="flex:1;background:#0d1117;border:1.5px solid #30363d;border-radius:8px;padding:6px 10px;color:#e6edf3;font-size:14px;min-width:0;";if(nv)ni.value=nv;var ci=document.createElement("input");ci.type="number";ci.className="report-input";ci.min="0";ci.value=cv||0;var db=document.createElement("button");db.textContent="\u00d7";db.style.cssText="background:none;border:none;color:#f87171;font-size:18px;cursor:pointer;padding:0 4px;flex-shrink:0;";db.onclick=function(){row.parentNode&&row.parentNode.removeChild(row);};row.appendChild(ni);row.appendChild(ci);row.appendChild(db);t.appendChild(row);}\n'
  + 'function initExtraRows(rpt){document.querySelectorAll(".extra-row").forEach(function(r){r.parentNode&&r.parentNode.removeChild(r);});((rpt&&rpt.extraItems)||[]).forEach(function(item){addExtraRow(item.name,item.count);});}\n'
  + 'function getReport(){var ex=[];document.querySelectorAll(".extra-row").forEach(function(row){var inp=row.querySelectorAll("input");if(inp.length>=2){var n=inp[0].value.trim();var c=parseInt(inp[1].value)||0;if(n)ex.push({name:n,count:c});}});return{poszwa:+document.getElementById("r-poszwa").value||0,poszewki:+document.getElementById("r-poszewki").value||0,przes_sr:+document.getElementById("r-przes-sr").value||0,przes_duze:+document.getElementById("r-przes-duze").value||0,recz_duzy:+document.getElementById("r-recz-duzy").value||0,recz_sredni:+document.getElementById("r-recz-sredni").value||0,dywanik:+document.getElementById("r-dywanik").value||0,narzuta:+document.getElementById("r-narzuta").value||0,koldra:+document.getElementById("r-koldra").value||0,poduszka:+document.getElementById("r-poduszka").value||0,podklad:+document.getElementById("r-podklad").value||0,extraItems:ex};}\n'
  + 'function submitDone(){if(!_currentRoom)return;act("done",_currentRoom.no,getReport());goBack();}\n'
  + 'function showToast(msg){clearTimeout(toastT);var old=document.querySelector(".toast");if(old)old.remove();var t=document.createElement("div");t.className="toast";t.textContent=msg;document.body.appendChild(t);toastT=setTimeout(function(){t.remove();},5000);}\n'
  + 'function act(action,room,extra){var body={action:action,room:room};if(extra!==null&&extra!==undefined)body.extra=extra;fetch("/hk/"+encodeURIComponent(W)+"/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(function(r){return r.json();}).then(function(){poll();}).catch(function(){});}\n'
  + 'function poll(){\n'
  + '  var dot=document.getElementById("dot");\n'
  + '  fetch("/api/state").then(function(r){return r.json();}).then(function(s){\n'
  + '    dot.className="dot";\n'
  + '    document.getElementById("sync").textContent=new Date().toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit",second:"2-digit"});\n'
  + '    var myRooms=(s.assignments[W]||[]).map(function(no){return Object.assign({no:no},s.rooms[no]||{status:"W",vacated:false});});\n'
  + '    myRooms.forEach(function(r){if(r.vacated&&r.status==="W"&&!_seen[r.no]){showToast("Pok\u00f3j "+r.no+" jest pusty!");_seen[r.no]=true;notif("Pok\u00f3j gotowy! \ud83d\udecf","Pok\u00f3j "+r.no+" jest pusty \u2014 zacznij sprz\u0105tanie");}});\n'
  + '    (s.exchanges||[]).filter(function(e){return e.status==="pending"&&e.to===W;}).forEach(function(e){if(!_seen["ex::"+e.id]){showToast("\u21c4 Wymiana od "+e.from+" ("+e.rooms.length+" pok.)");_seen["ex::"+e.id]=true;notif("\u21c4 Wymiana pok\u00f3j","od "+e.from+" ("+e.rooms.length+" pok.)");}});\n'
  + '    if(_curTab==="rooms")render(myRooms);\n'
  + '  }).catch(function(){dot.className="dot off";});\n'
  + '}\n'
  + 'function notif(t,b){if(_notifGranted){try{new Notification(t,{body:b});}catch(e){}}if("vibrate" in navigator){try{navigator.vibrate([200,100,200]);}catch(e){}}}\n'
  + 'function urlB64ToUint8(b64){var pad="=".repeat((4-b64.length%4)%4);var s=(b64+pad).replace(/-/g,"+").replace(/_/g,"/");var raw=atob(s);var arr=new Uint8Array(raw.length);for(var i=0;i<raw.length;i++)arr[i]=raw.charCodeAt(i);return arr;}\n'
  + 'function setupPush(){\n'
  + '  if(!("serviceWorker" in navigator)||!("PushManager" in window))return;\n'
  + '  navigator.serviceWorker.register("/sw.js").then(function(reg){\n'
  + '    return fetch("/push/vapid-public").then(function(r){return r.text();}).then(function(vapid){\n'
  + '      if(!vapid)return null;\n'
  + '      return reg.pushManager.getSubscription().then(function(sub){\n'
  + '        if(sub)return sub;\n'
  + '        return reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:urlB64ToUint8(vapid)});\n'
  + '      });\n'
  + '    });\n'
  + '  }).then(function(sub){\n'
  + '    if(!sub)return;\n'
  + '    return fetch("/push/subscribe",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({worker:W,subscription:sub.toJSON()})});\n'
  + '  }).then(function(){console.log("[push] subscribed");}).catch(function(e){console.warn("[push]",e);});\n'
  + '}\n'
  + 'function askNotif(){if(!("Notification" in window))return;if(Notification.permission==="granted"){_notifGranted=true;var b=document.getElementById("notif-btn");if(b)b.style.display="none";setupPush();}else if(Notification.permission==="default"){Notification.requestPermission().then(function(p){_notifGranted=p==="granted";var b=document.getElementById("notif-btn");if(b&&_notifGranted)b.style.display="none";if(_notifGranted)setupPush();});}}\n'
  + 'function pollTasks(){if(!_sbCfg||!_sbCfg.supabaseUrl||!_sbCfg.supabaseKey)return;fetch(_sbCfg.supabaseUrl+"/rest/v1/hk_tasks?date=eq."+_today+"&status=eq.open&select=id,text,target&order=created_at.desc",{headers:{"apikey":_sbCfg.supabaseKey,"Authorization":"Bearer "+_sbCfg.supabaseKey}}).then(function(r){return r.json();}).then(function(tasks){(tasks||[]).forEach(function(t){var ok=!t.target||t.target==="all"||t.target==="morning"||t.target===W;if(ok&&!_seenTasks[t.id]){_seenTasks[t.id]=true;if(_tasksReady){showToast("📋 Zadanie: "+(t.text||"").slice(0,80));notif("Zadanie HK 📋",(t.text||"").slice(0,100));}}});_tasksReady=true;}).catch(function(){});}\n'
  + 'document.getElementById("dateLabel").textContent=new Date().toLocaleDateString("pl-PL",{weekday:"long",day:"numeric",month:"long"});\n'
  + 'fetch("/config.json").then(function(r){return r.json();}).then(function(c){_sbCfg=c;pollTasks();}).catch(function(){});askNotif();document.addEventListener("click",function(){askNotif();},{once:true});poll();setInterval(poll,1000);setInterval(function(){if(_curTab==="team")pollTeam();},5000);setInterval(pollTasks,4000);\n'
  + '<\/script>\n'
  + '<\/body><\/html>';
}

// ─── Strona mobilna dla popołudniówki ────────────────────────────────────────
function mobilePagePM(workerName) {
  var wJson = JSON.stringify(workerName);
  return '<!DOCTYPE html>\n'
  + '<html lang="pl"><head>\n'
  + '<meta charset="UTF-8">\n'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">\n'
  + '<meta name="mobile-web-app-capable" content="yes">\n'
  + '<meta name="apple-mobile-web-app-capable" content="yes">\n'
  + '<title>PM \u2022 ' + workerName + '</title>\n'
  + '<style>\n'
  + '*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}\n'
  + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0d1117;color:#e6edf3;min-height:100vh;overscroll-behavior:none}\n'
  + '.hdr{background:#161b22;padding:12px 16px;display:flex;align-items:center;gap:10px;border-bottom:2px solid #30363d;position:sticky;top:0;z-index:10}\n'
  + '.dot{width:9px;height:9px;border-radius:50%;background:#34d399;flex-shrink:0}\n'
  + '.dot.off{background:#f87171}\n'
  + '.hdr-name{font-size:17px;font-weight:800}\n'
  + '.hdr-sub{font-size:11px;color:#8b949e;margin-top:1px}\n'
  + '.rooms{padding:12px;display:flex;flex-direction:column;gap:10px}\n'
  + '.card{background:#161b22;border:2px solid #30363d;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:12px}\n'
  + '.card.done{border-color:#34d399;background:#0d1a14}\n'
  + '.card.skipped{border-color:#f59e0b;background:#1a1600}\n'
  + '.rno{font-size:44px;font-weight:900;letter-spacing:-2px;line-height:1;min-width:70px}\n'
  + '.rno.waiting{color:#3a3f48}.rno.done{color:#34d399}.rno.skipped{color:#f59e0b}\n'
  + '.card-mid{flex:1;display:flex;flex-direction:column;gap:5px}\n'
  + '.type-badge{display:inline-block;font-size:13px;font-weight:900;padding:4px 10px;border-radius:8px;letter-spacing:1px;width:fit-content}\n'
  + '.type-badge.pgz{background:rgba(245,158,11,.2);color:#f59e0b;border:1.5px solid rgba(245,158,11,.4)}\n'
  + '.type-badge.pg{background:rgba(96,165,250,.2);color:#60a5fa;border:1.5px solid rgba(96,165,250,.4)}\n'
  + '.type-badge.br{background:rgba(167,139,250,.2);color:#a78bfa;border:1.5px solid rgba(167,139,250,.4)}\n'
  + '.type-badge.zs{background:rgba(52,211,153,.2);color:#34d399;border:1.5px solid rgba(52,211,153,.4)}\n'
  + '.type-badge.other{background:rgba(99,102,241,.2);color:#a5b4fc;border:1px solid rgba(99,102,241,.3)}\n'
  + '.card-state{font-size:12px;font-weight:700;color:#484f58}\n'
  + '.card-state.done{color:#34d399}.card-state.skipped{color:#f59e0b}\n'
  + '.btns{display:flex;flex-direction:column;gap:6px;flex-shrink:0}\n'
  + '.btn-done{padding:10px 16px;border-radius:9px;border:none;font-size:13px;font-weight:800;cursor:pointer;background:#059669;color:#fff;white-space:nowrap}\n'
  + '.btn-skip{padding:10px 16px;border-radius:9px;border:1.5px solid rgba(245,158,11,.4);font-size:13px;font-weight:800;cursor:pointer;background:#1e2430;color:#f59e0b;white-space:nowrap}\n'
  + '.btn-done:active,.btn-skip:active{opacity:.7}\n'
  + '.sync{position:fixed;top:10px;right:12px;font-size:10px;color:#484f58;z-index:20}\n'
  + '.empty{text-align:center;padding:60px 24px;color:#484f58}\n'
  + '.empty-ic{font-size:52px;margin-bottom:12px}\n'
  + '</style></head>\n'
  + '<body>\n'
  + '<div class="hdr"><div class="dot" id="dot"></div><div><div class="hdr-name">' + workerName + '</div><div class="hdr-sub" id="dateLabel"></div></div></div>\n'
  + '<div id="sync" class="sync"></div>\n'
  + '<div class="rooms" id="rooms"><div class="empty"><div class="empty-ic">&#8987;</div><p>Pobieranie danych...</p></div></div>\n'
  + '<script>\n'
  + 'var W=' + wJson + ';\n'
  + 'function render(rooms){\n'
  + '  var c=document.getElementById("rooms");\n'
  + '  if(!rooms||!rooms.length){c.innerHTML=\'<div class="empty"><div class="empty-ic">&#10003;</div><p>Brak pok\u00f3i</p></div>\';return;}\n'
  + '  var html="";\n'
  + '  for(var i=0;i<rooms.length;i++){\n'
  + '    var r=rooms[i];\n'
  + '    var done=r.status==="czyste";\n'
  + '    var skipped=r.status==="pomini\u0119te";\n'
  + '    var t=(r.type||"").toUpperCase();\n'
  + '    var pgz=t==="PGZ";\n'
  + '    var badgeCls="type-badge "+(t==="PGZ"?"pgz":t==="PG"?"pg":t==="BR"?"br":t==="ZS"?"zs":"other");\n'
  + '    var cls="card"+(done?" done":skipped?" skipped":"");\n'
  + '    var rnoCls="rno"+(done?" done":skipped?" skipped":" waiting");\n'
  + '    var stateTxt=done?"\u2713 Zrobione":skipped?"Go\u015bcie nie chcieli":"";\n'
  + '    var stateCls="card-state"+(done?" done":skipped?" skipped":"");\n'
  + '    html+="<div class=\\""+cls+"\\">";\n'
  + '    html+="<div class=\\""+rnoCls+"\\">"+r.no+"</div>";\n'
  + '    html+="<div class=\\"card-mid\\"><span class=\\""+badgeCls+"\\">"+t+"</span>"+(stateTxt?"<span class=\\""+stateCls+"\\">"+stateTxt+"</span>":"")+"</div>";\n'
  + '    if(!done&&!skipped){\n'
  + '      html+="<div class=\\"btns\\">";\n'
  + '      if(pgz){\n'
  + '        html+="<button class=\\"btn-done\\" onclick=\\"act(\'done\',\'"+r.no+"\')\\">\u2713 Sprz\u0105tane</button>";\n'
  + '        html+="<button class=\\"btn-skip\\" onclick=\\"act(\'skip\',\'"+r.no+"\')\\">\u2715 Nie chcieli</button>";\n'
  + '      } else {\n'
  + '        html+="<button class=\\"btn-done\\" onclick=\\"act(\'done\',\'"+r.no+"\')\\">\u2713 Zrobione</button>";\n'
  + '      }\n'
  + '      html+="</div>";\n'
  + '    }\n'
  + '    html+="</div>";\n'
  + '  }\n'
  + '  c.innerHTML=html;\n'
  + '}\n'
  + 'function act(action,room){\n'
  + '  fetch("/hk/"+encodeURIComponent(W)+"/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:action,room:room})}).then(function(){poll();}).catch(function(){});\n'
  + '}\n'
  + 'function poll(){\n'
  + '  var dot=document.getElementById("dot");\n'
  + '  fetch("/api/state").then(function(r){return r.json();}).then(function(s){\n'
  + '    dot.className="dot";\n'
  + '    document.getElementById("sync").textContent=new Date().toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit",second:"2-digit"});\n'
  + '    var myRooms=((s.pmAssignments||{})[W]||[]).map(function(no){return Object.assign({no:no},s.rooms[no]||{status:"W",vacated:false});});\n'
  + '    render(myRooms);\n'
  + '  }).catch(function(){dot.className="dot off";});\n'
  + '}\n'
  + 'document.getElementById("dateLabel").textContent=new Date().toLocaleDateString("pl-PL",{weekday:"long",day:"numeric",month:"long"});\n'
  + 'poll();\n'
  + 'setInterval(poll,1000);\n'
  + '</script>\n'
  + '</body></html>';
}

// ─── Strona "Wyjazdy PG/PGZ" — podgląd live dla managera HK ──────────────────
// Pokazuje na nadchodzące dni liczbę pokoi PG i PGZ z hk_plan (pm_room_types).
function wyjazdyPage() {
  return '<!DOCTYPE html>\n'
  + '<html lang="pl"><head>\n'
  + '<meta charset="UTF-8">\n'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">\n'
  + '<meta name="mobile-web-app-capable" content="yes">\n'
  + '<meta name="apple-mobile-web-app-capable" content="yes">\n'
  + '<meta name="theme-color" content="#161b22">\n'
  + '<title>Wyjazdy PG/PGZ • HK</title>\n'
  + '<style>\n'
  + '*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}\n'
  + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0d1117;color:#e6edf3;min-height:100vh;overscroll-behavior:none}\n'
  + '.hdr{background:#161b22;padding:14px 16px;border-bottom:2px solid #30363d;position:sticky;top:0;z-index:10;display:flex;align-items:center;gap:10px}\n'
  + '.dot{width:9px;height:9px;border-radius:50%;background:#34d399;flex-shrink:0}.dot.off{background:#f87171}\n'
  + '.hdr-title{font-size:17px;font-weight:800;flex:1}.hdr-sub{font-size:11px;color:#8b949e;margin-top:2px}\n'
  + '.sync{font-size:10px;color:#484f58}\n'
  + '.summary{padding:14px 16px;display:flex;gap:10px;border-bottom:1px solid #21262d;background:#0d1117}\n'
  + '.sbox{flex:1;background:#161b22;border:1.5px solid #30363d;border-radius:12px;padding:10px 12px;text-align:center}\n'
  + '.sbox .l{font-size:10px;font-weight:800;color:#8b949e;letter-spacing:.08em;text-transform:uppercase}\n'
  + '.sbox .v{font-size:26px;font-weight:900;margin-top:4px}\n'
  + '.sbox.pg .v{color:#f59e0b}.sbox.pgz .v{color:#a78bfa}.sbox.tot .v{color:#34d399}\n'
  + '.days{padding:12px;display:flex;flex-direction:column;gap:10px;padding-bottom:40px}\n'
  + '.day{background:#161b22;border:1.5px solid #30363d;border-radius:14px;padding:14px 16px;display:flex;align-items:center;gap:14px}\n'
  + '.day.today{border-color:#6366f1;background:#11142a}\n'
  + '.day.tomorrow{border-color:rgba(99,102,241,.4)}\n'
  + '.day.empty{opacity:.5}\n'
  + '.dleft{flex:1;min-width:0}\n'
  + '.ddow{font-size:11px;font-weight:800;color:#8b949e;letter-spacing:.08em;text-transform:uppercase}\n'
  + '.ddate{font-size:20px;font-weight:900;margin-top:2px;line-height:1.1}\n'
  + '.dlbl{font-size:11px;color:#6366f1;font-weight:800;margin-top:3px}\n'
  + '.dright{display:flex;gap:10px;flex-shrink:0}\n'
  + '.pill{min-width:60px;text-align:center;border-radius:10px;padding:8px 10px;border:1.5px solid}\n'
  + '.pill .pl{font-size:10px;font-weight:800;letter-spacing:.05em}\n'
  + '.pill .pv{font-size:22px;font-weight:900;line-height:1.1;margin-top:2px}\n'
  + '.pill.pg{border-color:rgba(245,158,11,.45);background:rgba(245,158,11,.08);color:#f59e0b}\n'
  + '.pill.pgz{border-color:rgba(167,139,250,.45);background:rgba(167,139,250,.08);color:#a78bfa}\n'
  + '.pill.zero{opacity:.4}\n'
  + '.foot{text-align:center;color:#484f58;font-size:11px;padding:10px}\n'
  + '.legend{padding:8px 16px 0;color:#8b949e;font-size:11px;line-height:1.6}\n'
  + '<\/style><\/head>\n'
  + '<body>\n'
  + '<div class="hdr"><div class="dot" id="dot"><\/div><div style="flex:1"><div class="hdr-title">🧳 Wyjazdy PG / PGZ<\/div><div class="hdr-sub" id="hdrSub">Podgląd live dla managera HK<\/div><\/div><div class="sync" id="sync"><\/div><\/div>\n'
  + '<div class="summary"><div class="sbox pg"><div class="l">PG łącznie<\/div><div class="v" id="sumPG">0<\/div><\/div><div class="sbox pgz"><div class="l">PGZ łącznie<\/div><div class="v" id="sumPGZ">0<\/div><\/div><div class="sbox tot"><div class="l">Razem<\/div><div class="v" id="sumTOT">0<\/div><\/div><\/div>\n'
  + '<div class="legend">Następne 14 dni • dane z planu HK (hk_plan). Pustą kartę oznacza brak zapisanego planu na ten dzień.<\/div>\n'
  + '<div id="days" class="days"><div class="foot">Pobieranie danych...<\/div><\/div>\n'
  + '<div class="foot" id="lastUpd"><\/div>\n'
  + '<script>\n'
  + 'var _sb=null;var DAYS=14;\n'
  + 'var DOW=["niedziela","poniedziałek","wtorek","środa","czwartek","piątek","sobota"];\n'
  + 'var MON=["stycznia","lutego","marca","kwietnia","maja","czerwca","lipca","sierpnia","września","października","listopada","grudnia"];\n'
  + 'function pad(n){return n<10?"0"+n:""+n;}\n'
  + 'function isoDate(d){return d.getFullYear()+"-"+pad(d.getMonth()+1)+"-"+pad(d.getDate());}\n'
  + 'function buildRange(){var out=[];var t=new Date();t.setHours(0,0,0,0);for(var i=0;i<DAYS;i++){var d=new Date(t.getTime()+i*86400000);out.push(isoDate(d));}return out;}\n'
  + 'function countTypes(pmRoomTypes){var pg=0,pgz=0;if(pmRoomTypes&&typeof pmRoomTypes==="object"){Object.keys(pmRoomTypes).forEach(function(k){var v=pmRoomTypes[k];if(v==="PG")pg++;else if(v==="PGZ")pgz++;});}return{pg:pg,pgz:pgz};}\n'
  + 'function fmtDate(iso){var p=iso.split("-");var d=new Date(+p[0],+p[1]-1,+p[2]);return{dow:DOW[d.getDay()],txt:(+p[2])+" "+MON[+p[1]-1]};}\n'
  + 'function fetchPlans(){\n'
  + '  if(!_sb||!_sb.supabaseUrl||!_sb.supabaseKey)return Promise.resolve({});\n'
  + '  var range=buildRange();var from=range[0];var to=range[range.length-1];\n'
  + '  var url=_sb.supabaseUrl+"/rest/v1/hk_plan?date=gte."+from+"&date=lte."+to+"&select=date,pm_room_types";\n'
  + '  return fetch(url,{headers:{"apikey":_sb.supabaseKey,"Authorization":"Bearer "+_sb.supabaseKey}})\n'
  + '    .then(function(r){return r.json();})\n'
  + '    .then(function(rows){var m={};(rows||[]).forEach(function(row){m[row.date]=row.pm_room_types||{};});return m;});\n'
  + '}\n'
  + 'function render(byDate){\n'
  + '  var range=buildRange();var todayIso=range[0];var tomorrowIso=range[1];\n'
  + '  var c=document.getElementById("days");c.innerHTML="";\n'
  + '  var sPG=0,sPGZ=0;\n'
  + '  range.forEach(function(iso){\n'
  + '    var counts=countTypes(byDate[iso]);sPG+=counts.pg;sPGZ+=counts.pgz;\n'
  + '    var labelClass=iso===todayIso?"today":(iso===tomorrowIso?"tomorrow":"");\n'
  + '    var empty=counts.pg===0&&counts.pgz===0&&!byDate[iso]?" empty":"";\n'
  + '    var lbl=iso===todayIso?"DZIŚ":(iso===tomorrowIso?"JUTRO":"");\n'
  + '    var d=fmtDate(iso);\n'
  + '    var pgZero=counts.pg===0?" zero":"";var pgzZero=counts.pgz===0?" zero":"";\n'
  + '    var div=document.createElement("div");\n'
  + '    div.className="day "+labelClass+empty;\n'
  + '    div.innerHTML='
  + '      \'<div class="dleft"><div class="ddow">\'+d.dow+\'<\\/div><div class="ddate">\'+d.txt+\'<\\/div>\'+(lbl?\'<div class="dlbl">\'+lbl+\'<\\/div>\':"")+\'<\\/div>\'+'
  + '      \'<div class="dright"><div class="pill pg\'+pgZero+\'"><div class="pl">PG<\\/div><div class="pv">\'+counts.pg+\'<\\/div><\\/div>\'+'
  + '      \'<div class="pill pgz\'+pgzZero+\'"><div class="pl">PGZ<\\/div><div class="pv">\'+counts.pgz+\'<\\/div><\\/div><\\/div>\';\n'
  + '    c.appendChild(div);\n'
  + '  });\n'
  + '  document.getElementById("sumPG").textContent=sPG;\n'
  + '  document.getElementById("sumPGZ").textContent=sPGZ;\n'
  + '  document.getElementById("sumTOT").textContent=sPG+sPGZ;\n'
  + '  document.getElementById("lastUpd").textContent="Aktualizacja: "+new Date().toLocaleTimeString("pl-PL");\n'
  + '}\n'
  + 'function tick(){\n'
  + '  var dot=document.getElementById("dot");\n'
  + '  fetchPlans().then(function(m){dot.className="dot";document.getElementById("sync").textContent=new Date().toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit",second:"2-digit"});render(m);}).catch(function(){dot.className="dot off";});\n'
  + '}\n'
  + 'fetch("/config.json").then(function(r){return r.json();}).then(function(c){_sb=c;tick();setInterval(tick,5000);}).catch(function(){document.getElementById("days").innerHTML=\'<div class="foot">B\\u0142\\u0105d konfiguracji Supabase<\\/div>\';});\n'
  + '<\/script>\n'
  + '<\/body><\/html>';
}

// ─── Strona mobilna konserwatora ─────────────────────────────────────────────
function konserwatorPage(workerName, faults) {
  var nameJson = JSON.stringify(workerName);
  var f = Array.isArray(faults) ? faults : [];
  var active = f.filter(function(x) { return x.status !== "done"; });

  var items = active.map(function(fault) {
    var urgent = fault.priority === "urgent";
    var inProgress = fault.status === "in_progress";
    var borderColor = urgent ? "#f87171" : "#30363d";
    var bgColor = urgent ? "rgba(248,113,113,.07)" : "#161b22";
    var badgeBg = urgent ? "#f87171" : "#30363d";
    var badgeText = urgent ? "#fff" : "#8b949e";
    var badgeLabel = urgent ? "PILNE" : "NORMALNE";
    var statusLabel = inProgress ? "W toku" : "Otwarte";
    var statusColor = inProgress ? "#60a5fa" : "#8b949e";
    var space = fault.space_id || "";
    var floor = fault.floor ? " · " + fault.floor : "";
    var cat = fault.category ? fault.category : "";
    return '<div style="background:' + bgColor + ';border:2px solid ' + borderColor + ';border-radius:14px;padding:16px;margin-bottom:10px">'
      + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">'
      + (space ? '<span style="font-size:22px;font-weight:900;color:#e6edf3;letter-spacing:-1px">' + escHtml(space) + '</span>' : '')
      + (space ? '<span style="font-size:11px;color:#8b949e">' + escHtml(floor) + '</span>' : '<span style="font-size:11px;color:#8b949e">' + escHtml(floor.slice(3)) + '</span>')
      + '<span style="margin-left:auto;background:' + badgeBg + ';color:' + badgeText + ';font-size:10px;font-weight:900;padding:3px 8px;border-radius:6px;letter-spacing:.5px">' + badgeLabel + '</span>'
      + '</div>'
      + (cat ? '<div style="font-size:11px;color:#8b949e;margin-bottom:6px;font-weight:600;text-transform:uppercase;letter-spacing:.4px">' + escHtml(cat) + '</div>' : '')
      + '<div style="font-size:14px;color:#e6edf3;line-height:1.5;margin-bottom:8px">' + escHtml(fault.description || "") + '</div>'
      + '<div style="font-size:11px;font-weight:700;color:' + statusColor + '">' + statusLabel + '</div>'
      + '</div>';
  }).join("");

  var emptyHtml = active.length === 0
    ? '<div style="text-align:center;padding:60px 24px;color:#484f58"><div style="font-size:52px;margin-bottom:12px">&#10003;</div><p>Brak aktywnych usterek</p></div>'
    : "";

  var dateStr = new Date().toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long" });

  return '<!DOCTYPE html>'
    + '<html lang="pl"><head>'
    + '<meta charset="UTF-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">'
    + '<title>Usterki • ' + workerName + '</title>'
    + '<style>*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}'
    + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0d1117;color:#e6edf3;min-height:100vh;overscroll-behavior:none}'
    + '.hdr{background:#161b22;padding:12px 16px;border-bottom:2px solid #30363d;position:sticky;top:0;z-index:10}'
    + '.hdr-title{font-size:17px;font-weight:800}'
    + '.hdr-sub{font-size:11px;color:#8b949e;margin-top:2px}'
    + '.cnt{font-size:11px;font-weight:700;display:inline-block;background:#f87171;color:#fff;padding:2px 8px;border-radius:99px;margin-left:8px;vertical-align:middle}'
    + '.body{padding:14px}'
    + '</style>'
    + '</head><body>'
    + '<div class="hdr">'
    + '<div class="hdr-title">' + escHtml(workerName) + (active.length ? '<span class="cnt">' + active.length + '</span>' : '') + '</div>'
    + '<div class="hdr-sub">Usterki do naprawy • ' + dateStr + '</div>'
    + '</div>'
    + '<div class="body">'
    + (emptyHtml || items)
    + '</div>'
    + '</body></html>';
}

function escHtml(s) {
  return String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ─── Service Worker (sw.js) ──────────────────────────────────────────────────
const SW_JS = `
self.addEventListener('install', function(e){ self.skipWaiting(); });
self.addEventListener('activate', function(e){ e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function(event){
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch(e) { data = { title: 'HK', body: event.data ? event.data.text() : '' }; }
  var title = data.title || 'HK';
  var opts = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: data.badge || '/icon-192.png',
    tag: data.tag || 'hk-' + Date.now(),
    renotify: true,
    requireInteraction: !!data.requireInteraction,
    vibrate: [200, 100, 200, 100, 200],
    data: { url: data.url || '/' }
  };
  event.waitUntil(self.registration.showNotification(title, opts));
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(list){
      for (var i = 0; i < list.length; i++) {
        if ('focus' in list[i]) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(target);
    })
  );
});
`;

function manifestJson(workerName) {
  const safe = String(workerName || "HK");
  return JSON.stringify({
    name: "HK • " + safe,
    short_name: safe.slice(0, 12),
    start_url: "/hk/" + encodeURIComponent(safe),
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0d1117",
    theme_color: "#161b22",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any maskable" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any maskable" }
    ]
  });
}

// Prosta ikona PNG (192x192) zakodowana w base64 — niebieski kwadrat z literą "H"
// Wystarcza do PWA install prompt; w produkcji można podmienić na właściwą ikonę.
const ICON_PNG_192_B64 = "iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAYAAABS3GwHAAAAQUlEQVR42u3PMQEAAAjDMK5/aWHgRwI6kzWLPx0gQEBAQEBAQECgGyAgICAgICAgINANEBAQEBAQEBAQ6AYI3OgFvqYBOoEHFvkAAAAASUVORK5CYII=";
const ICON_PNG_192 = Buffer.from(ICON_PNG_192_B64, "base64");

// ─── HTTP Server ──────────────────────────────────────────────────────────────
function start() {
  if (_server) return;
  _tryStart();
}

function _tryStart() {
  const srv = http.createServer((req, res) => {
    const parsed = urlMod.parse(req.url, true);
    const p = parsed.pathname;

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, apikey, x-secret");
    res.setHeader("Access-Control-Max-Age", "86400");

    if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }

    // GET /api/state
    if (req.method === "GET" && p === "/api/state") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(_state));
      return;
    }

    // GET /ping — test połączenia
    if (req.method === "GET" && p === "/ping") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true, ip: getLocalIP(), port: PORT, time: new Date().toISOString() }));
      return;
    }

    // GET / — prosta strona testowa (łatwa do sprawdzenia z telefonu)
    if (req.method === "GET" && p === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end('<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>HK Server</title></head>'
        + '<body style="font-family:sans-serif;background:#0d1117;color:#34d399;padding:40px;text-align:center">'
        + '<div style="font-size:64px">&#10003;</div>'
        + '<h2>Serwer HK działa!</h2>'
        + '<p style="color:#8b949e">IP: ' + getLocalIP() + ':' + PORT + '</p>'
        + '<p style="color:#8b949e">' + new Date().toLocaleTimeString("pl-PL") + '</p>'
        + '</body></html>');
      return;
    }

    // GET /reception/stream — SSE dla panelu recepcji
    if (req.method === "GET" && p === "/reception/stream") {
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
      res.write("\n");
      res.write(`data: ${JSON.stringify({ type: "state", state: _state })}\n\n`);
      if (!_clients["__reception__"]) _clients["__reception__"] = [];
      _clients["__reception__"].push(res);
      req.on("close", () => {
        _clients["__reception__"] = (_clients["__reception__"] || []).filter(r => r !== res);
      });
      return;
    }

    // GET /hk/wyjazdy — live podgląd PG/PGZ dla managera HK (następne 14 dni)
    if (req.method === "GET" && p === "/hk/wyjazdy") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(wyjazdyPage());
      return;
    }

    // GET /hk/:worker
    const mPage = p.match(/^\/hk\/([^/]+)$/);
    if (req.method === "GET" && mPage) {
      const w = decodeURIComponent(mPage[1]);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(mobilePage(w));
      return;
    }

    // GET /konserwator/:worker — strona z usterkami konserwatora
    const mKons = p.match(/^\/konserwator\/([^/]+)$/);
    if (req.method === "GET" && mKons) {
      const w = decodeURIComponent(mKons[1]);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(konserwatorPage(w, _konserwatorFaults[w]));
      return;
    }

    // GET /hkpm/:worker — strona popołudniówki
    const mPagePM = p.match(/^\/hkpm\/([^/]+)$/);
    if (req.method === "GET" && mPagePM) {
      const w = decodeURIComponent(mPagePM[1]);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(mobilePagePM(w));
      return;
    }

    // GET /hk/:worker/stream — SSE
    const mStream = p.match(/^\/hk\/([^/]+)\/stream$/);
    if (req.method === "GET" && mStream) {
      const w = decodeURIComponent(mStream[1]);
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" });
      res.write("\n");
      res.write(`data: ${JSON.stringify({ type: "state", rooms: getWorkerRooms(w) })}\n\n`);
      if (!_clients[w]) _clients[w] = [];
      _clients[w].push(res);
      req.on("close", () => { _clients[w] = (_clients[w] || []).filter(r => r !== res); });
      return;
    }

    // POST /hk/:worker/action
    const mAction = p.match(/^\/hk\/([^/]+)\/action$/);
    if (req.method === "POST" && mAction) {
      const w = decodeURIComponent(mAction[1]);
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const action = parsed.action;
          const room   = parsed.room;
          if (!_state.rooms[room]) _state.rooms[room] = { worker: w, status: "W", vacated: false };
          const now = new Date().toISOString();
          if (action === "start") {
            _state.rooms[room].status    = "czyszczenie";
            _state.rooms[room].startedAt = now;
            addLog(w, "start", room);
          } else if (action === "done") {
            _state.rooms[room].status = "czyste";
            _state.rooms[room].doneAt = now;
            if (parsed.extra && typeof parsed.extra === "object") _state.rooms[room].report = parsed.extra;
            const dur = _state.rooms[room].startedAt
              ? Math.round((new Date(now) - new Date(_state.rooms[room].startedAt)) / 60000) : null;
            addLog(w, "done", room, dur ? dur + "min" : null);
          } else if (action === "skip") {
            _state.rooms[room].status = "pominięte";
            _state.rooms[room].doneAt = now;
            addLog(w, "skip", room);
          }
          sendSSE(w, { type: "state", rooms: getWorkerRooms(w) });
          broadcastReception({ type: "state", state: _state });
          notifyChange();
        } catch {}
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
      });
      return;
    }

    // GET /hk/team — podsumowanie zespołu (dla zakładki "Zespół" na telefonach)
    if (req.method === "GET" && p === "/hk/team") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(getTeamSummary()));
      return;
    }

    // GET /hk/team-html — server-rendered HTML zakładki Zespół
    if (req.method === "GET" && p.startsWith("/hk/team-html")) {
      const wName = new URL("http://x" + req.url).searchParams.get("w") || "";
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(buildTeamHtml(wName));
      return;
    }

    // POST /hk/exchange/requestfrom — Kasia prosi Tetianę o pokoje
    if (req.method === "POST" && p === "/hk/exchange/requestfrom") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        try {
          const { requester, donor } = JSON.parse(body || "{}");
          if (!requester || !donor) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "Brak requester/donor" })); return; }
          const ex = requestExchangeFrom(requester, donor);
          if (!ex) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: false, error: "Donor nie ma wolnych pokoi" })); return; }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, exchange: ex }));
        } catch { res.writeHead(500); res.end(JSON.stringify({ ok: false })); }
      });
      return;
    }

    // POST /hk/exchange/request
    if (req.method === "POST" && p === "/hk/exchange/request") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        try {
          const { from, to } = JSON.parse(body || "{}");
          if (!from || !to) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "Brak from/to" })); return; }
          const ex = createExchange(from, to);
          if (!ex) { res.writeHead(400, { "Content-Type": "application/json" }); res.end(JSON.stringify({ ok: false, error: "Brak wolnych pokoi" })); return; }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true, exchange: ex }));
        } catch { res.writeHead(500); res.end(JSON.stringify({ ok: false })); }
      });
      return;
    }

    // POST /hk/exchange/accept/:id
    const mExAccept = p.match(/^\/hk\/exchange\/accept\/([^/]+)$/);
    if (req.method === "POST" && mExAccept) {
      const ok = resolveExchange(mExAccept[1], true);
      res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok }));
      return;
    }

    // POST /hk/exchange/reject/:id
    const mExReject = p.match(/^\/hk\/exchange\/reject\/([^/]+)$/);
    if (req.method === "POST" && mExReject) {
      const ok = resolveExchange(mExReject[1], false);
      res.writeHead(ok ? 200 : 404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok }));
      return;
    }

    // GET /config.json — konfiguracja Supabase dla stron mobilnych (hk-phone)
    if (req.method === "GET" && p === "/config.json") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        supabaseUrl: process.env.VITE_SUPABASE_URL || "",
        supabaseKey: process.env.VITE_SUPABASE_ANON_KEY || "",
      }));
      return;
    }

    // ─── Web Push endpoints ───────────────────────────────────────────────
    // GET /sw.js — Service Worker dla powiadomień push (tło)
    if (req.method === "GET" && p === "/sw.js") {
      res.writeHead(200, { "Content-Type": "application/javascript; charset=utf-8", "Service-Worker-Allowed": "/", "Cache-Control": "no-cache" });
      res.end(SW_JS);
      return;
    }

    // GET /manifest.json — PWA manifest (potrzebny dla iOS "Add to Home Screen")
    if (req.method === "GET" && p === "/manifest.json") {
      const w = parsed.query && parsed.query.w ? String(parsed.query.w) : "HK";
      res.writeHead(200, { "Content-Type": "application/manifest+json; charset=utf-8" });
      res.end(manifestJson(w));
      return;
    }

    // GET /icon-192.png, /icon-512.png — ikony PWA
    if (req.method === "GET" && (p === "/icon-192.png" || p === "/icon-512.png")) {
      res.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "public, max-age=3600" });
      res.end(ICON_PNG_192);
      return;
    }

    // GET /push/vapid-public — klucz publiczny VAPID dla subskrypcji
    if (req.method === "GET" && p === "/push/vapid-public") {
      const v = ensureVapid();
      res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(v ? v.publicKey : "");
      return;
    }

    // POST /push/subscribe — zapis subskrypcji push pracownika
    if (req.method === "POST" && p === "/push/subscribe") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        try {
          const { worker, subscription } = JSON.parse(body || "{}");
          if (!worker || !subscription) { res.writeHead(400); res.end(JSON.stringify({ ok: false, error: "Brak worker/subscription" })); return; }
          addSubscription(String(worker).slice(0, 80), subscription);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })); }
      });
      return;
    }

    // POST /push/task — recepcja powiadamia hkserver po dodaniu zadania w Supabase
    // Body: { task: { id, text, room, target }, workers: ["Tetiana", ...] (opcjonalne) }
    if (req.method === "POST" && p === "/push/task") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        try {
          const { task, workers } = JSON.parse(body || "{}");
          if (!task || !task.text) { res.writeHead(400); res.end(JSON.stringify({ ok: false })); return; }
          pushTaskToWorkers(task, workers);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })); }
      });
      return;
    }

    // POST /push/test — manualny test powiadomienia (do debugowania)
    if (req.method === "POST" && p === "/push/test") {
      let body = "";
      req.on("data", c => body += c);
      req.on("end", () => {
        try {
          const { worker, title, message } = JSON.parse(body || "{}");
          sendPushToWorker(String(worker || "").slice(0, 80), {
            title: title || "Test HK",
            body: message || "Powiadomienie testowe",
            tag: "test-" + Date.now(),
          }).catch(() => {});
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e) { res.writeHead(500); res.end(JSON.stringify({ ok: false, error: e.message })); }
      });
      return;
    }

    res.writeHead(404); res.end("Not found");
  });

  srv.listen(PORT, "0.0.0.0", () => {
    _server = srv;
    console.log(`[HKServer] Uruchomiony na ${getBaseURL()}`);
  });

  srv.on("error", err => {
    console.error("[HKServer] Błąd:", err.message);
    _server = null;
    if (err.code === "EADDRINUSE") {
      // Port zajęty — poczekaj chwilę i spróbuj ponownie
      console.log(`[HKServer] Port ${PORT} zajęty — próba ponownego uruchomienia za 3s...`);
      setTimeout(() => { _tryStart(); }, 3000);
    } else {
      // Inny błąd — restart za 5s
      setTimeout(() => { _tryStart(); }, 5000);
    }
  });
}

function stop() {
  if (_server) { _server.close(); _server = null; }
}

module.exports = { start, stop, getBaseURL, getLocalIP, getAllIPs, getQR, setAssignments, vacateRoom, getState, resetDay, setOnStateChange, mergeRemoteRooms, setKonserwatorFaults, pushTaskToWorkers, sendPushToWorker, sendPushToAll, ensureVapid };
