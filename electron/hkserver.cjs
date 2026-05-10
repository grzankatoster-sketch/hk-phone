// ─── electron/hkserver.cjs ───────────────────────────────────────────────────
// Lokalny serwer HTTP dla pokojówek — dostępny przez WiFi w obiekcie
// Każda pokojówka skanuje QR i widzi swoje pokoje na telefonie (real-time SSE)
// ─────────────────────────────────────────────────────────────────────────────

const http   = require("http");
const os     = require("os");
const fs     = require("fs");
const urlMod = require("url");
const QRCode = require("qrcode");

const PORT = 3737;
let _server = null;

// ─── Stan ─────────────────────────────────────────────────────────────────────
let _state = {
  date:          new Date().toISOString().split("T")[0],
  assignments:   {},
  pmAssignments: {},
  rooms:         {},
  roomTypes:     {},
  logs:          [],
};

function addLog(worker, action, room, extra) {
  const time = new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
  _state.logs.push({ time, worker, action, room, extra: extra || null });
  if (_state.logs.length > 200) _state.logs = _state.logs.slice(-200);
}

const STATE_FILE = require("path").join(os.homedir(), ".hkserver-state.json");

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
  }
  notifyChange();
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

// ─── Mobilna strona HTML dla pokojówki ───────────────────────────────────────
function mobilePage(workerName) {
  var wJson = JSON.stringify(workerName);
  return '<!DOCTYPE html>\n'
  + '<html lang="pl"><head>\n'
  + '<meta charset="UTF-8">\n'
  + '<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">\n'
  + '<meta name="mobile-web-app-capable" content="yes">\n'
  + '<meta name="apple-mobile-web-app-capable" content="yes">\n'
  + '<title>HK \u2022 ' + workerName + '</title>\n'
  + '<style>\n'
  + '*{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}\n'
  + 'body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:#0d1117;color:#e6edf3;min-height:100vh;overscroll-behavior:none}\n'
  + '.hdr{background:#161b22;padding:12px 16px;display:flex;align-items:center;gap:10px;border-bottom:2px solid #30363d;position:sticky;top:0;z-index:10}\n'
  + '.dot{width:9px;height:9px;border-radius:50%;background:#34d399;flex-shrink:0}\n'
  + '.dot.off{background:#f87171}\n'
  + '.hdr-name{font-size:17px;font-weight:800}\n'
  + '.hdr-sub{font-size:11px;color:#8b949e;margin-top:1px}\n'
  /* Lista */
  + '.rooms{padding:12px;display:flex;flex-direction:column;gap:10px}\n'
  + '.card{background:#161b22;border:2px solid #30363d;border-radius:14px;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px}\n'
  + '.card.vacated{border-color:#f59e0b;background:#1a1600}\n'
  + '.card.cleaning{border-color:#3b82f6;background:#0d1626}\n'
  + '.card.done{border-color:#34d399;background:#0d1a14}\n'
  + '.rno{font-size:48px;font-weight:900;letter-spacing:-2px;line-height:1}\n'
  + '.rno.vacated{color:#f59e0b}.rno.cleaning{color:#3b82f6}.rno.done{color:#34d399}.rno.waiting{color:#3a3f48}\n'
  + '.btn-list{padding:12px 20px;border-radius:10px;border:none;font-size:15px;font-weight:800;cursor:pointer;background:#1d4ed8;color:#fff}\n'
  + '.btn-list:active{opacity:.7}\n'
  /* Widok szczegółowy */
  + '.room-screen{display:none;flex-direction:column;min-height:100vh}\n'
  + '.room-screen.active{display:flex}\n'
  + '.rshdr{background:#161b22;padding:12px 16px;display:flex;align-items:center;gap:12px;border-bottom:2px solid #30363d}\n'
  + '.rshdr-back{background:none;border:1px solid #30363d;color:#60a5fa;padding:7px 14px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer}\n'
  + '.rshdr-info{flex:1;text-align:center}\n'
  + '.rshdr-no{font-size:22px;font-weight:900}\n'
  + '.rshdr-type{font-size:13px;color:#8b949e;margin-top:2px}\n'
  + '.rs-body{padding:16px;flex:1;display:flex;flex-direction:column;gap:14px}\n'
  /* Tabelka */
  + '.report-table{background:#161b22;border-radius:12px;overflow:hidden;border:1.5px solid #30363d}\n'
  + '.report-title{padding:10px 14px;font-size:13px;font-weight:800;color:#8b949e;border-bottom:1px solid #21262d;letter-spacing:.5px}\n'
  + '.report-row{display:flex;align-items:center;padding:11px 14px;border-bottom:1px solid #21262d;gap:10px}\n'
  + '.report-row:last-child{border-bottom:none}\n'
  + '.report-label{flex:1;font-size:14px;font-weight:600;color:#e6edf3}\n'
  + '.report-input{width:64px;padding:7px 10px;border-radius:8px;border:1.5px solid #30363d;background:#0d1117;color:#e6edf3;font-size:16px;font-weight:800;text-align:center;outline:none}\n'
  + '.report-input:focus{border-color:#3b82f6}\n'
  + '.report-notes{width:100%;padding:10px 12px;border-radius:10px;border:1.5px solid #30363d;background:#0d1117;color:#e6edf3;font-size:14px;resize:none;outline:none;font-family:inherit;margin-top:4px}\n'
  + '.report-notes:focus{border-color:#3b82f6}\n'
  /* Przyciski */
  + '.btn{display:block;width:100%;padding:17px;border-radius:12px;border:none;font-size:17px;font-weight:800;cursor:pointer;margin-top:4px}\n'
  + '.btn:active{opacity:.7}\n'
  + '.btn-done{background:#059669;color:#fff}\n'
  + '.done-info{padding:12px 14px;background:rgba(52,211,153,.08);border:1.5px solid rgba(52,211,153,.3);border-radius:12px;font-size:13px;line-height:1.8}\n'
  /* Toast */
  + '.toast{position:fixed;bottom:24px;left:16px;right:16px;background:#1a1a2e;border:2px solid #f59e0b;color:#f59e0b;border-radius:14px;padding:14px 18px;font-size:15px;font-weight:700;z-index:100;text-align:center}\n'
  + '.sync{position:fixed;top:10px;right:12px;font-size:10px;color:#484f58;z-index:20}\n'
  + '.empty{text-align:center;padding:60px 24px;color:#484f58}\n'
  + '.empty-ic{font-size:52px;margin-bottom:12px}\n'
  + '</style></head>\n'
  + '<body>\n'
  /* ── Widok lista ── */
  + '<div id="listView">\n'
  + '<div class="hdr"><div class="dot" id="dot"></div><div><div class="hdr-name">' + workerName + '</div><div class="hdr-sub" id="dateLabel"></div></div></div>\n'
  + '<div id="sync" class="sync"></div>\n'
  + '<div class="rooms" id="rooms"><div class="empty"><div class="empty-ic">&#8987;</div><p>Pobieranie danych...</p></div></div>\n'
  + '</div>\n'
  /* ── Widok szczegółowy ── */
  + '<div id="roomView" class="room-screen">\n'
  + '<div class="rshdr">\n'
  + '  <button class="rshdr-back" onclick="goBack()">&#8592; Powr\u00f3t</button>\n'
  + '  <div class="rshdr-info"><div class="rshdr-no" id="rv-no"></div><div class="rshdr-type" id="rv-type"></div></div>\n'
  + '</div>\n'
  + '<div class="rs-body">\n'
  + '  <div id="rv-report" class="report-table">\n'
  + '    <div class="report-title">RAPORT POKOJU</div>\n'
  + '    <div class="report-row"><span class="report-label">Poszwa</span><input class="report-input" id="r-poszwa" type="number" min="0" value="0"></div>\n'
  + '    <div class="report-row"><span class="report-label">Poszewki</span><input class="report-input" id="r-poszewki" type="number" min="0" value="0"></div>\n'
  + '    <div class="report-row"><span class="report-label">Prze\u015b. \u015ar.</span><input class="report-input" id="r-przes-sr" type="number" min="0" value="0"></div>\n'
  + '    <div class="report-row"><span class="report-label">Prze\u015b. Du\u017ce</span><input class="report-input" id="r-przes-duze" type="number" min="0" value="0"></div>\n'
  + '    <div class="report-row"><span class="report-label">Recz. Du\u017cy</span><input class="report-input" id="r-recz-duzy" type="number" min="0" value="0"></div>\n'
  + '    <div class="report-row"><span class="report-label">Recz. \u015aredni</span><input class="report-input" id="r-recz-sredni" type="number" min="0" value="0"></div>\n'
  + '    <div class="report-row"><span class="report-label">Dywanik</span><input class="report-input" id="r-dywanik" type="number" min="0" value="0"></div>\n'
  + '    <div class="report-row"><span class="report-label">Narzuta</span><input class="report-input" id="r-narzuta" type="number" min="0" value="0"></div>\n'
  + '    <div class="report-row"><span class="report-label">Ko\u0142dra</span><input class="report-input" id="r-koldra" type="number" min="0" value="0"></div>\n'
  + '    <div class="report-row"><span class="report-label">Poduszka</span><input class="report-input" id="r-poduszka" type="number" min="0" value="0"></div>\n'
  + '    <div class="report-row"><span class="report-label">Podk\u0142ad</span><input class="report-input" id="r-podklad" type="number" min="0" value="0"></div>\n'
  + '  </div>\n'
  + '  <button onclick="addExtraRow()" style="width:100%;margin:8px 0;padding:10px;border-radius:9px;border:1.5px dashed #30363d;background:transparent;color:#8b949e;font-size:13px;font-weight:700;cursor:pointer;">+ Dodaj pozycj\u0119 spoza listy</button>\n'
  + '  <div id="rv-done-info" style="display:none" class="done-info"></div>\n'
  + '  <button id="rv-btn-done" class="btn btn-done" onclick="submitDone()" style="display:none">\u2713 Gotowe!</button>\n'
  + '</div></div>\n'
  /* ── JavaScript ── */
  + '<script>\n'
  + 'var W=' + wJson + ';\n'
  + 'var _allRooms=[];\n'
  + 'var _currentRoom=null;\n'
  + 'var lastVacated={};\n'
  + 'var toastT=null;\n'
  + 'function fmtDur(s,e){if(!s||!e)return"";var ms=new Date(e)-new Date(s);return Math.floor(ms/60000)+"min "+Math.floor((ms%60000)/1000)+"s";}\n'
  + 'function render(rooms){\n'
  + '  _allRooms=rooms;\n'
  + '  var c=document.getElementById("rooms");\n'
  + '  if(!rooms||!rooms.length){c.innerHTML=\'<div class="empty"><div class="empty-ic">&#10003;</div><p>Brak pok\u00f3i</p></div>\';return;}\n'
  + '  var html="";\n'
  + '  for(var i=0;i<rooms.length;i++){\n'
  + '    var r=rooms[i];\n'
  + '    var done=r.status==="czyste";\n'
  + '    var cleaning=r.status==="czyszczenie";\n'
  + '    var vacated=r.vacated&&r.status==="W";\n'
  + '    var cls="card"+(done?" done":cleaning?" cleaning":vacated?" vacated":"");\n'
  + '    var rnoCls="rno"+(done?" done":cleaning?" cleaning":vacated?" vacated":" waiting");\n'
  + '    html+="<div class=\\""+cls+"\\">";\n'
  + '    html+="<div class=\\""+rnoCls+"\\">"+r.no+"</div>";\n'
  + '    if(vacated){\n'
  + '      html+="<button class=\\"btn-list\\" onclick=\\"openRoom(\'"+r.no+"\')\\">&nbsp;Zaczynam&nbsp;sprz\u0105ta\u0107&nbsp;</button>";\n'
  + '    } else if(cleaning){\n'
  + '      html+="<button class=\\"btn-list\\" style=\\"background:#1e3a5f\\" onclick=\\"openRoom(\'"+r.no+"\')\\">\ud83e\uddf9 Raport</button>";\n'
  + '    } else if(done){\n'
  + '      html+="<span style=\\"font-size:28px;color:#34d399\\">&#10003;</span>";\n'
  + '    }\n'
  + '    html+="</div>";\n'
  + '  }\n'
  + '  c.innerHTML=html;\n'
  + '}\n'
  + 'function openRoom(no){\n'
  + '  var r=null;\n'
  + '  for(var i=0;i<_allRooms.length;i++){if(_allRooms[i].no===no){r=_allRooms[i];break;}}\n'
  + '  if(!r)return;\n'
  + '  _currentRoom=r;\n'
  + '  document.getElementById("listView").style.display="none";\n'
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
  + '  var reportTable=document.getElementById("rv-report");\n'
  + '  doneInfo.style.display="none";\n'
  + '  reportTable.style.display="";\n'
  + '  if(r.status==="czyste"){\n'
  + '    btnD.style.display="none";\n'
  + '    doneInfo.style.display="block";\n'
  + '    doneInfo.innerHTML="\u2713 Raport zapisany";\n'
  + '    reportTable.style.display="none";\n'
  + '  } else if(r.status==="czyszczenie"){\n'
  + '    btnD.style.display="block";\n'
  + '  } else if(r.vacated){\n'
  + '    btnD.style.display="block";\n'
  + '    act("start",r.no,null);\n'
  + '  } else {\n'
  + '    btnD.style.display="none";\n'
  + '  }\n'
  + '}\n'
  + 'function goBack(){\n'
  + '  _currentRoom=null;\n'
  + '  document.getElementById("listView").style.display="";\n'
  + '  document.getElementById("roomView").classList.remove("active");\n'
  + '}\n'
  + 'function addExtraRow(nameVal,countVal){\n'
  + '  var table=document.getElementById("rv-report");\n'
  + '  var row=document.createElement("div");\n'
  + '  row.className="report-row extra-row";\n'
  + '  row.style.gap="8px";\n'
  + '  var nameInp=document.createElement("input");\n'
  + '  nameInp.type="text";nameInp.className="report-label";nameInp.placeholder="Nazwa (np. firanki)";\n'
  + '  nameInp.style.cssText="flex:1;background:#0d1117;border:1.5px solid #30363d;border-radius:8px;padding:6px 10px;color:#e6edf3;font-size:14px;min-width:0;";\n'
  + '  if(nameVal)nameInp.value=nameVal;\n'
  + '  var cntInp=document.createElement("input");\n'
  + '  cntInp.type="number";cntInp.className="report-input";cntInp.min="0";cntInp.value=countVal||0;\n'
  + '  var delBtn=document.createElement("button");\n'
  + '  delBtn.textContent="\u00d7";delBtn.style.cssText="background:none;border:none;color:#f87171;font-size:18px;cursor:pointer;padding:0 4px;flex-shrink:0;";\n'
  + '  delBtn.onclick=function(){row.parentNode&&row.parentNode.removeChild(row);};\n'
  + '  row.appendChild(nameInp);row.appendChild(cntInp);row.appendChild(delBtn);\n'
  + '  table.appendChild(row);\n'
  + '}\n'
  + 'function initExtraRows(rpt){\n'
  + '  document.querySelectorAll(".extra-row").forEach(function(r){r.parentNode&&r.parentNode.removeChild(r);});\n'
  + '  var extras=(rpt&&rpt.extraItems)||[];\n'
  + '  extras.forEach(function(item){addExtraRow(item.name,item.count);});\n'
  + '}\n'
  + 'function getReport(){\n'
  + '  var extraItems=[];\n'
  + '  document.querySelectorAll(".extra-row").forEach(function(row){\n'
  + '    var inputs=row.querySelectorAll("input");\n'
  + '    if(inputs.length>=2){\n'
  + '      var name=inputs[0].value.trim();\n'
  + '      var count=parseInt(inputs[1].value)||0;\n'
  + '      if(name)extraItems.push({name:name,count:count});\n'
  + '    }\n'
  + '  });\n'
  + '  return{poszwa:parseInt(document.getElementById("r-poszwa").value)||0,poszewki:parseInt(document.getElementById("r-poszewki").value)||0,przes_sr:parseInt(document.getElementById("r-przes-sr").value)||0,przes_duze:parseInt(document.getElementById("r-przes-duze").value)||0,recz_duzy:parseInt(document.getElementById("r-recz-duzy").value)||0,recz_sredni:parseInt(document.getElementById("r-recz-sredni").value)||0,dywanik:parseInt(document.getElementById("r-dywanik").value)||0,narzuta:parseInt(document.getElementById("r-narzuta").value)||0,koldra:parseInt(document.getElementById("r-koldra").value)||0,poduszka:parseInt(document.getElementById("r-poduszka").value)||0,podklad:parseInt(document.getElementById("r-podklad").value)||0,extraItems:extraItems};\n'
  + '}\n'
  + 'function submitDone(){if(!_currentRoom)return;act("done",_currentRoom.no,getReport());goBack();}\n'
  + 'function showToast(msg){clearTimeout(toastT);var old=document.querySelector(".toast");if(old)old.remove();var t=document.createElement("div");t.className="toast";t.textContent=msg;document.body.appendChild(t);toastT=setTimeout(function(){t.remove();},5000);}\n'
  + 'function act(action,room,extra){\n'
  + '  var body={action:action,room:room};\n'
  + '  if(extra!==null&&extra!==undefined)body.extra=extra;\n'
  + '  fetch("/hk/"+encodeURIComponent(W)+"/action",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)}).then(function(r){return r.json();}).then(function(){poll();}).catch(function(){});\n'
  + '}\n'
  + 'function poll(){\n'
  + '  var dot=document.getElementById("dot");\n'
  + '  fetch("/api/state").then(function(r){return r.json();}).then(function(s){\n'
  + '    dot.className="dot";\n'
  + '    document.getElementById("sync").textContent=new Date().toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit",second:"2-digit"});\n'
  + '    var myRooms=(s.assignments[W]||[]).map(function(no){return Object.assign({no:no},s.rooms[no]||{status:"W",vacated:false});});\n'
  + '    myRooms.forEach(function(r){if(r.vacated&&r.status==="W"&&!lastVacated[r.no]){showToast("Pok\u00f3j "+r.no+" jest pusty!");lastVacated[r.no]=true;}});\n'
  + '    render(myRooms);\n'
  + '  }).catch(function(){dot.className="dot off";});\n'
  + '}\n'
  + 'document.getElementById("dateLabel").textContent=new Date().toLocaleDateString("pl-PL",{weekday:"long",day:"numeric",month:"long"});\n'
  + 'poll();\n'
  + 'setInterval(poll,3000);\n'
  + '</script>\n'
  + '</body></html>';
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
  + 'setInterval(poll,3000);\n'
  + '</script>\n'
  + '</body></html>';
}

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

    // GET /hk/:worker
    const mPage = p.match(/^\/hk\/([^/]+)$/);
    if (req.method === "GET" && mPage) {
      const w = decodeURIComponent(mPage[1]);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(mobilePage(w));
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

module.exports = { start, stop, getBaseURL, getLocalIP, getAllIPs, getQR, setAssignments, vacateRoom, getState, resetDay, setOnStateChange, mergeRemoteRooms };
