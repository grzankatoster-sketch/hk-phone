import React from "react";
import QRCode from "qrcode";
import { supabase, phoneUrl } from "../../lib/supabase";
import { HK_ALL, HK_FLOOR1, HK_FLOOR2, HK_FLOOR3, HK_LIVE_COLORS } from "../../lib/constants";
import { loadJson, saveJson } from "../../lib/storage";

const TODAY = () => new Date().toISOString().split("T")[0];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const workerColor = (i) => HK_LIVE_COLORS[i % HK_LIVE_COLORS.length];
const initial     = (name) => (name || "?").charAt(0).toUpperCase();

const textColorFor = (hex) => {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const lin = (c) => c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  const L = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return L > 0.179 ? "#111" : "#fff";
};

const STATUS_CFG = {
  W:           { label: "Czeka",       color: "#8b949e", bg: "transparent",             bc: "var(--border-light)" },
  czyszczenie: { label: "Sprząta",     color: "#60a5fa", bg: "rgba(96,165,250,.08)",    bc: "rgba(96,165,250,.3)" },
  czyste:      { label: "Czyste",      color: "#34d399", bg: "rgba(52,211,153,.08)",    bc: "rgba(52,211,153,.3)" },
  "pominięte": { label: "Pominięte",   color: "#a78bfa", bg: "rgba(167,139,250,.08)",   bc: "rgba(167,139,250,.3)" },
  vacated:     { label: "Pusty",       color: "#f59e0b", bg: "rgba(245,158,11,.08)",    bc: "rgba(245,158,11,.3)" },
};

const LOG_CFG = {
  start:            { color: "#60a5fa", bg: "rgba(96,165,250,.08)",   bc: "rgba(96,165,250,.25)",   icon: "▶", text: (l) => `${l.worker} zaczyna pokój ${l.room}` },
  done:             { color: "#34d399", bg: "rgba(52,211,153,.08)",   bc: "rgba(52,211,153,.25)",   icon: "✓", text: (l) => `${l.worker} skończyła pokój ${l.room}${l.extra ? " · " + l.extra : ""}` },
  skip:             { color: "#f59e0b", bg: "rgba(245,158,11,.08)",   bc: "rgba(245,158,11,.25)",   icon: "✕", text: (l) => `${l.worker} — goście nie chcieli (${l.room})` },
  vacate:           { color: "#a78bfa", bg: "rgba(167,139,250,.08)",  bc: "rgba(167,139,250,.25)",  icon: "🔔", text: (l) => `Recepcja: pokój ${l.room} pusty` },
  task_done:        { color: "#34d399", bg: "rgba(52,211,153,.08)",   bc: "rgba(52,211,153,.25)",   icon: "☑", text: (l) => `${l.worker}: zadanie — ${l.extra || ""}` },
  exchange_request: { color: "#f59e0b", bg: "rgba(245,158,11,.08)",   bc: "rgba(245,158,11,.25)",   icon: "⇄", text: (l) => l.extra || `${l.worker} proponuje wymianę` },
  exchange_accept:  { color: "#34d399", bg: "rgba(52,211,153,.08)",   bc: "rgba(52,211,153,.25)",   icon: "⇄", text: (l) => l.extra || `${l.worker} przyjęła wymianę` },
  exchange_reject:  { color: "#f87171", bg: "rgba(248,113,113,.08)",  bc: "rgba(248,113,113,.25)",  icon: "✕", text: (l) => l.extra || `${l.worker} odrzuciła wymianę` },
};

const LINEN_FIELDS = [
  { key: "poszwa",      label: "Poszwa" },
  { key: "poszewki",    label: "Poszewki" },
  { key: "przes_sr",    label: "Prześ. Śr." },
  { key: "przes_duze",  label: "Prześ. Duże" },
  { key: "recz_duzy",   label: "Ręcz. Duży" },
  { key: "recz_sredni", label: "Ręcz. Średni" },
  { key: "dywanik",     label: "Dywanik" },
  { key: "narzuta",     label: "Narzuta" },
  { key: "koldra",      label: "Kołdra" },
  { key: "poduszka",    label: "Poduszka" },
  { key: "podklad",     label: "Podkład" },
];

// ─── Component ────────────────────────────────────────────────────────────────
function HKLivePanel({ dark, hkData, setHkData, hkDate, showToast, isManager, employeeName }) {
  const date = hkDate || TODAY();

  // ─── Global state from Supabase ───────────────────────────────────────────
  const [workers,   setWorkers]   = React.useState([]);
  const [rooms,     setRooms]     = React.useState({});   // { roomNo: rowFromDB }
  const [tasks,     setTasks]     = React.useState([]);
  const [logs,      setLogs]      = React.useState([]);
  const [planData,  setPlanData]  = React.useState(null); // hk_plan row from Supabase
  const [qrCache,   setQrCache]   = React.useState(() => loadJson("hk-qr-cache-v2", {}));
  const qrCacheRef = React.useRef(qrCache);
  const [genFor,    setGenFor]    = React.useState(null);
  const [activeTab, setActiveTab] = React.useState("monitor");
  const [exchanges, setExchanges] = React.useState([]);

  // Assignments: hkData prop first, fallback to Supabase hk_plan when hkData is empty
  const assignments   = React.useMemo(() => {
    const m = {};
    if (hkData) {
      Object.entries(hkData).forEach(([no, rd]) => {
        if (!rd.person) return;
        if (rd.status === "PG" || rd.status === "PGZ" || rd.br || rd.zs) return;
        if (!m[rd.person]) m[rd.person] = [];
        m[rd.person].push(no);
      });
      if (Object.keys(m).length > 0) return m;
    }
    if (planData?.assignments) {
      Object.entries(planData.assignments).forEach(([w, rms]) => {
        if (Array.isArray(rms)) m[w] = rms;
      });
    }
    return m;
  }, [hkData, planData]);

  const pmAssignments = React.useMemo(() => {
    const m = {};
    if (hkData) {
      Object.entries(hkData).forEach(([no, rd]) => {
        if (!rd.person) return;
        if (rd.status === "PG" || rd.status === "PGZ" || rd.br || rd.zs) {
          if (!m[rd.person]) m[rd.person] = [];
          m[rd.person].push(no);
        }
      });
      if (Object.keys(m).length > 0) return m;
    }
    if (planData?.pm_assignments) {
      Object.entries(planData.pm_assignments).forEach(([w, rms]) => {
        if (Array.isArray(rms)) m[w] = rms;
      });
    }
    return m;
  }, [hkData, planData]);

  const pmRoomTypes = React.useMemo(() => {
    const m = {};
    if (hkData) {
      Object.entries(hkData).forEach(([no, rd]) => {
        if (rd.status === "W") m[no] = "W";
        else if (rd.status === "WP") m[no] = "WP";
        else if (rd.status === "PG") m[no] = "PG";
        else if (rd.status === "PGZ") m[no] = "PGZ";
        else if (rd.br) m[no] = "BR";
        else if (rd.zs) m[no] = "ZS";
      });
      if (Object.keys(m).length > 0) return m;
    }
    if (planData?.pm_room_types) return { ...planData.pm_room_types };
    return m;
  }, [hkData, planData]);

  // ─── Initial data fetch + 1s polling fallback (gdy Realtime padnie) ──────
  React.useEffect(() => {
    let active = true;
    let inFlight = false;
    let lastErrorAt = 0;

    const fetchInitial = async () => {
      const [
        { data: wData },
        { data: rData },
        { data: tData },
        { data: lData },
        { data: pData },
      ] = await Promise.all([
        supabase.from("hk_workers").select("*").order("id"),
        supabase.from("hk_rooms").select("*").eq("date", date),
        supabase.from("hk_tasks").select("*").eq("date", date).order("created_at"),
        supabase.from("hk_logs").select("*").eq("date", date).order("created_at"),
        supabase.from("hk_plan").select("*").eq("date", date).maybeSingle(),
      ]);
      if (!active) return;
      if (wData) setWorkers(wData.map(w => w.name));
      if (rData) {
        const m = {};
        rData.forEach(r => { m[r.room] = r; });
        setRooms(m);
      }
      if (tData) setTasks(tData);
      if (lData) setLogs(lData);
      if (pData) setPlanData(pData);
    };

    // Co 1s odśwież najważniejsze dane: pokoje + zadania + logi (workers/plan tylko initial + Realtime)
    const tick = async () => {
      if (inFlight || !active) return;
      inFlight = true;
      try {
        const [{ data: rData }, { data: tData }, { data: lData }] = await Promise.all([
          supabase.from("hk_rooms").select("*").eq("date", date),
          supabase.from("hk_tasks").select("*").eq("date", date).order("created_at"),
          supabase.from("hk_logs").select("*").eq("date", date).order("created_at"),
        ]);
        if (!active) return;
        if (rData) {
          const m = {};
          rData.forEach(r => { m[r.room] = r; });
          setRooms(m);
        }
        if (tData) setTasks(tData);
        if (lData) setLogs(lData);
      } catch (e) {
        const now = Date.now();
        if (now - lastErrorAt > 30000) { console.warn("[HK poll]", e?.message); lastErrorAt = now; }
      } finally {
        inFlight = false;
      }
    };

    fetchInitial();
    const id = setInterval(tick, 1000);
    return () => { active = false; clearInterval(id); };
  }, [date]);

  // ─── Poll hkserver for exchange state (only in Czat tab) ─────────────────
  React.useEffect(() => {
    const poll = () => {
      fetch("http://localhost:3737/hk/team")
        .then(r => r.json())
        .then(d => { if (d.exchanges) setExchanges(d.exchanges); })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 1000);
    return () => clearInterval(id);
  }, []);

  // ─── Sync plan to Supabase when hkData changes ───────────────────────────
  React.useEffect(() => {
    if (!hkData) return;
    // Only sync when hkData actually contains person assignments (Electron app data, not empty Railway state)
    if (!Object.values(hkData).some(rd => rd.person)) return;
    const sync = async () => {
      const rt = {};
      HK_ALL.forEach(r => { rt[r.no] = r.type; });
      const { error: planErr } = await supabase.from("hk_plan").upsert({
        date, assignments, pm_assignments: pmAssignments, room_types: rt, pm_room_types: pmRoomTypes, updated_at: new Date().toISOString(),
      }, { onConflict: "date" });
      if (planErr) { showToast("Błąd synchronizacji danych HK", "error"); return; }

      // Insert room rows for newly planned rooms (ignoreDuplicates: don't overwrite live status)
      const allPlanned = [
        ...Object.entries(assignments).flatMap(([worker, rms]) => rms.map(r => ({ date, room: r, worker, status: "W" }))),
        ...Object.entries(pmAssignments).flatMap(([worker, rms]) => rms.map(r => ({ date, room: r, worker, status: "W" }))),
      ];
      if (allPlanned.length) {
        const { error: roomsErr } = await supabase.from("hk_rooms").upsert(allPlanned, { onConflict: "date,room", ignoreDuplicates: true });
        if (roomsErr) showToast("Błąd synchronizacji danych HK", "error");
      }
    };
    sync();
  }, [hkData, date]);

  // ─── Realtime subscriptions ───────────────────────────────────────────────
  React.useEffect(() => {
    const channel = supabase.channel(`hk-live-${date}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "hk_rooms",    filter: `date=eq.${date}` }, ({ eventType, new: row, old }) => {
        setRooms(prev => eventType === "DELETE" ? (delete prev[old.room], { ...prev }) : { ...prev, [row.room]: row });
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "hk_tasks",   filter: `date=eq.${date}` }, ({ eventType, new: row, old }) => {
        setTasks(prev => eventType === "DELETE" ? prev.filter(t => t.id !== old.id) : eventType === "INSERT" ? [row, ...prev] : prev.map(t => t.id === row.id ? row : t));
      })
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "hk_logs", filter: `date=eq.${date}` }, ({ new: row }) => {
        setLogs(prev => [...prev, row]);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "hk_workers" }, ({ eventType, new: row, old }) => {
        setWorkers(prev => eventType === "INSERT" ? [...prev, row.name] : eventType === "DELETE" ? prev.filter(n => n !== old.name) : prev);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "hk_plan", filter: `date=eq.${date}` }, ({ new: row }) => {
        if (row) setPlanData(row);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [date]);

  // ─── Derived stats ────────────────────────────────────────────────────────
  const roomVals = Object.values(rooms);
  const stats = {
    W:           roomVals.filter(r => r.status === "W" && !r.vacated).length,
    czyszczenie: roomVals.filter(r => r.status === "czyszczenie").length,
    czyste:      roomVals.filter(r => r.status === "czyste").length,
    "pominięte": roomVals.filter(r => r.status === "pominięte").length,
  };

  const linenTotals = React.useMemo(() => {
    const totals = {};
    const extra  = {};
    LINEN_FIELDS.forEach(f => { totals[f.key] = 0; });
    roomVals.forEach(r => {
      if (!r.report) return;
      LINEN_FIELDS.forEach(f => { totals[f.key] = (totals[f.key] || 0) + (r.report[f.key] || 0); });
      (r.report.extraItems || []).forEach(it => {
        if (it.name) extra[it.name] = (extra[it.name] || 0) + (it.count || 0);
      });
    });
    return { totals, extra };
  }, [rooms]);

  // ─── Actions ─────────────────────────────────────────────────────────────
  const markVacated = async (room) => {
    const worker = hkData?.[room]?.person || rooms[room]?.worker || null;
    const { error } = await supabase.from("hk_rooms").upsert(
      { date, room, vacated: true, status: "W", ...(worker ? { worker } : {}) },
      { onConflict: "date,room" }
    );
    if (error) { showToast("Błąd Supabase: " + error.message, "error"); return; }
    await supabase.from("hk_logs").insert({ date, log_time: new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }), worker: "Recepcja", action: "vacate", room });
    showToast(`Pokój ${room} — oznaczono jako pusty`, "success");
  };

  const markSkipped = async (room) => {
    const worker = hkData?.[room]?.person || rooms[room]?.worker || null;
    const { error } = await supabase.from("hk_rooms").upsert(
      { date, room, status: "pominięte", ...(worker ? { worker } : {}) },
      { onConflict: "date,room" }
    );
    if (error) { showToast("Błąd Supabase: " + error.message, "error"); return; }
    await supabase.from("hk_logs").insert({ date, log_time: new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }), worker: worker || "HK", action: "skip", room });
    showToast(`Pokój ${room} — goście nie chcieli`, "info");
  };

  const addTask = async () => {
    if (!taskText.trim()) return;
    const text = taskText.trim();
    const room = taskRoom || null;
    const target = taskTarget;
    const { data, error } = await supabase.from("hk_tasks").insert({
      date, text, room, target, created_by: employeeName || "Recepcja",
    }).select().single();
    if (error) { showToast("Błąd: " + error.message, "error"); return; }
    setTaskText(""); setTaskRoom(""); setTaskTarget("all");
    showToast("Zadanie dodane", "success");

    // Wyślij push do telefonów pracownic (przez lokalny hkserver → Service Worker)
    let workersList = null;
    if (target !== "all" && target !== "morning" && target !== "pm") {
      workersList = [target];
    } else if (target === "morning") {
      workersList = Object.keys(assignments);
    } else if (target === "pm") {
      workersList = Object.keys(pmAssignments);
    }
    fetch("http://localhost:3737/push/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: { id: data?.id, text, room, target }, workers: workersList }),
    }).catch(() => {});
  };

  const doneTask = async (task) => {
    await supabase.from("hk_tasks").update({ status: "done", done_by: employeeName || "Recepcja", done_at: new Date().toISOString() }).eq("id", task.id);
    await supabase.from("hk_logs").insert({ date, log_time: new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }), worker: employeeName || "Recepcja", action: "task_done", extra: task.text });
  };

  const deleteTask = async (id) => {
    await supabase.from("hk_tasks").delete().eq("id", id);
  };

  const addWorker = async () => {
    if (!newWorkerInput.trim()) return;
    const name = newWorkerInput.trim();
    if (workers.includes(name)) { showToast("Pracownik już istnieje", "info"); return; }
    const { error } = await supabase.from("hk_workers").insert({ name });
    if (error) { showToast("Błąd: " + error.message, "error"); return; }
    setNewWorkerInput("");
    showToast(`Dodano: ${name}`, "success");
  };

  const removeWorker = async (name) => {
    if (!window.confirm(`Usunąć ${name} z listy pracowników HK?`)) return;
    await supabase.from("hk_workers").delete().eq("name", name);
    showToast(`Usunięto: ${name}`, "info");
  };

  const getQr = React.useCallback(async (name, force = false) => {
    const key = `qr::${name}`;
    if (!force && qrCacheRef.current[key]) return qrCacheRef.current[key];
    setGenFor(name);
    try {
      const dataURL = await QRCode.toDataURL(phoneUrl(name), {
        width: 280, margin: 2, color: { dark: "#000000", light: "#ffffff" },
      });
      if (dataURL) {
        qrCacheRef.current = { ...qrCacheRef.current, [key]: dataURL };
        saveJson("hk-qr-cache-v2", qrCacheRef.current);
        setQrCache({ ...qrCacheRef.current });
        return dataURL;
      }
    } catch (e) {
      console.error("[HKLivePanel] QR generation error:", e);
    } finally { setGenFor(null); }
    return null;
  }, []);

  // Pre-load QR for all workers on mount
  React.useEffect(() => {
    if (!workers.length) return;
    const missing = workers.filter(n => !qrCacheRef.current[`qr::${n}`]);
    if (!missing.length) return;
    (async () => { for (const n of missing) await getQr(n); })();
  }, [workers, getQr]);

  // ─── Local form state ─────────────────────────────────────────────────────
  const [taskText,   setTaskText]   = React.useState("");
  const [taskRoom,   setTaskRoom]   = React.useState("");
  const [taskTarget, setTaskTarget] = React.useState("all");
  const [newWorkerInput, setNewWorkerInput] = React.useState("");
  const [logDate,        setLogDate]        = React.useState(date);
  const [histLogs,       setHistLogs]       = React.useState(null);
  const [linenOpen,      setLinenOpen]      = React.useState(false);
  const [qrModal,        setQrModal]        = React.useState(null); // { name, dataURL }
  const [monitorPopover, setMonitorPopover] = React.useState(null); // roomNo | null

  const loadHistLogs = async () => {
    const { data } = await supabase.from("hk_logs").select("*").eq("date", logDate).order("created_at");
    setHistLogs(data || []);
  };

  // Grouped assignments for Monitor
  const allGroups = [
    ...Object.entries(assignments).map(([name, rms]) => ({ name, rooms: rms, pm: false })),
    ...Object.entries(pmAssignments).map(([name, rms]) => ({ name, rooms: rms, pm: true })),
  ];

  // ─── Styles ───────────────────────────────────────────────────────────────
  const card = {
    background: dark ? "var(--dark-card)" : "var(--bg-card)",
    border: `1px solid ${dark ? "var(--dark-border)" : "var(--border-light)"}`,
    borderRadius: 12,
  };
  const muted = dark ? "#484f58" : "var(--text-muted)";
  const text  = dark ? "#e6edf3" : "#111";

  const TABS = [
    { id: "monitor",     label: "Monitor",    icon: "📡" },
    { id: "zadania",     label: "Zadania",    icon: "✅" },
    { id: "pranie",      label: "Pranie",     icon: "🧺" },
    { id: "pracownicy",  label: "Pracownicy", icon: "👥" },
    { id: "historia",    label: "Historia",   icon: "📋" },
    { id: "czat",        label: "Czat/Zespół", icon: "💬" },
  ];

  // ─── Render helpers ───────────────────────────────────────────────────────
  const renderRoomRow = (no, pm, wi) => {
    const rs     = rooms[no] || {};
    const sCfg   = rs.vacated && rs.status === "W"
      ? STATUS_CFG.vacated
      : STATUS_CFG[rs.status] || STATUS_CFG.W;
    const dur    = rs.status === "czyste" && rs.started_at && rs.done_at
      ? Math.floor((new Date(rs.done_at) - new Date(rs.started_at)) / 60000) + "min" : null;
    const pmType = pmRoomTypes[no];
    const col    = sCfg.color;
    return (
      <div key={no} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, background: sCfg.bg, border: `1.5px solid ${sCfg.bc}`, minHeight: 46 }}>
        <span style={{ fontWeight: 900, fontSize: 19, minWidth: 42, color: col, letterSpacing: "-.02em" }}>{no}</span>
        {pm && <span style={{ fontSize: 10, padding: "1px 6px", borderRadius: 999, background: "rgba(167,139,250,.15)", color: "#a78bfa", fontWeight: 700 }}>{pmType || "PM"}</span>}
        <span style={{ fontSize: 12, fontWeight: 700, color: col, flex: 1, textTransform: "uppercase", letterSpacing: ".04em" }}>{sCfg.label}</span>
        {dur && <span style={{ fontSize: 11, color: "#34d399", fontWeight: 700 }}>{dur}</span>}
        {!pm && rs.status === "W" && !rs.vacated && (
          <button onClick={() => markVacated(no)} style={{ fontSize: 11, padding: "4px 9px", borderRadius: 6, border: "1px solid rgba(245,158,11,.4)", background: "rgba(245,158,11,.08)", color: "#f59e0b", cursor: "pointer", fontWeight: 700 }}>
            Pusty
          </button>
        )}
        {pm && pmRoomTypes[no] === "PGZ" && rs.status === "W" && (
          <button onClick={() => markSkipped(no)} style={{ fontSize: 11, padding: "4px 9px", borderRadius: 6, border: "1px solid rgba(167,139,250,.4)", background: "rgba(167,139,250,.08)", color: "#a78bfa", cursor: "pointer", fontWeight: 700 }}>
            Nie chcieli
          </button>
        )}
      </div>
    );
  };

  // ─── Tab: Monitor ─────────────────────────────────────────────────────────
  const renderMonitor = () => {
    const roomWorkerMap = {};
    Object.entries(assignments).forEach(([w, rms]) => rms.forEach(r => { roomWorkerMap[r] = { worker: w, pm: false }; }));
    Object.entries(pmAssignments).forEach(([w, rms]) => rms.forEach(r => { roomWorkerMap[r] = { worker: w, pm: true }; }));

    const allWNames = [...new Set([...Object.keys(assignments), ...Object.keys(pmAssignments)])];

    const wStats = allWNames.map((name, i) => {
      const rms = [...(assignments[name] || []), ...(pmAssignments[name] || [])];
      const done     = rms.filter(r => rooms[r]?.status === "czyste").length;
      const cleaning = rms.filter(r => rooms[r]?.status === "czyszczenie").length;
      const pct = rms.length ? Math.round((done / rms.length) * 100) : 0;
      return { name, total: rms.length, done, cleaning, pct, color: workerColor(i) };
    });

    const gDone    = roomVals.filter(r => r.status === "czyste").length;
    const gClean   = roomVals.filter(r => r.status === "czyszczenie").length;
    const gSkipped = roomVals.filter(r => r.status === "pominięte").length;
    const gTotal   = roomVals.length;

    const cellCfg = (no) => {
      const r = rooms[no] || {};
      if (r.vacated && r.status === "W") return { bg: "rgba(245,158,11,.2)",  bc: "rgba(245,158,11,.5)" };
      if (r.status === "czyszczenie")    return { bg: "rgba(96,165,250,.2)",  bc: "rgba(96,165,250,.5)" };
      if (r.status === "czyste")         return { bg: "rgba(52,211,153,.2)",  bc: "rgba(52,211,153,.5)" };
      if (r.status === "pominięte")      return { bg: "rgba(167,139,250,.2)", bc: "rgba(167,139,250,.5)" };
      return { bg: dark ? "rgba(255,255,255,.03)" : "rgba(0,0,0,.03)", bc: dark ? "#30363d" : "#d1d5db" };
    };

    const FLOORS = [
      { label: "I piętro",   rooms: HK_FLOOR1 },
      { label: "II piętro",  rooms: HK_FLOOR2 },
      { label: "III piętro", rooms: HK_FLOOR3 },
    ];

    // Pokoje W/WP z planu dnia — checkout flow
    const checkoutRooms = HK_ALL.filter(r =>
      hkData?.[r.no]?.status === "W" || hkData?.[r.no]?.status === "WP"
    );
    const vacateTimeFor = (no) => {
      const l = logs.find(lg => lg.action === "vacate" && lg.room === no);
      return l?.log_time || null;
    };

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }} onClick={() => setMonitorPopover(null)}>

        {/* ── Wymeldowania ─────────────────────────────────────────────────── */}
        {checkoutRooms.length > 0 && (() => {
          const pending = checkoutRooms.filter(r => !rooms[r.no]?.vacated);
          const done    = checkoutRooms.filter(r =>  rooms[r.no]?.vacated);
          return (
            <div style={{ ...card, padding: "12px 14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".07em", color: pending.length ? "#f59e0b" : "#34d399" }}>
                  Wymeldowania
                </span>
                {pending.length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#f59e0b", background: "rgba(245,158,11,.12)", padding: "1px 8px", borderRadius: 999 }}>
                    {pending.length} {pending.length === 1 ? "czeka" : "czekają"}
                  </span>
                )}
                {done.length > 0 && (
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#34d399", background: "rgba(52,211,153,.12)", padding: "1px 8px", borderRadius: 999 }}>
                    {done.length} przekazano HK
                  </span>
                )}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {checkoutRooms.map(r => {
                  const rs        = rooms[r.no] || {};
                  const isVacated = !!rs.vacated;
                  const worker    = hkData?.[r.no]?.person;
                  const status    = hkData?.[r.no]?.status;
                  const vt        = isVacated ? vacateTimeFor(r.no) : null;
                  return (
                    <div key={r.no} className="hk-checkout-pill" style={{
                      border:     `1.5px solid ${isVacated ? "rgba(52,211,153,.3)" : "rgba(245,158,11,.35)"}`,
                      background: isVacated ? "rgba(52,211,153,.06)" : "rgba(245,158,11,.06)",
                    }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 900, fontSize: 17, lineHeight: 1, color: isVacated ? "#34d399" : "#f59e0b" }}>{r.no}</div>
                        <div style={{ fontSize: 9, color: muted, fontWeight: 700, marginTop: 2, whiteSpace: "nowrap" }}>
                          {status}{worker ? ` · ${worker.split(" ")[0]}` : ""}
                        </div>
                      </div>
                      {isVacated ? (
                        <div style={{ textAlign: "right", flexShrink: 0 }}>
                          <div style={{ fontSize: 11, fontWeight: 800, color: "#34d399" }}>✓ HK</div>
                          {vt && <div style={{ fontSize: 9, color: muted }}>{vt}</div>}
                        </div>
                      ) : (
                        <button
                          onClick={(e) => { e.stopPropagation(); markVacated(r.no); }}
                          style={{
                            padding: "5px 10px", borderRadius: 6, border: "none", flexShrink: 0,
                            background: "rgba(245,158,11,.15)", color: "#f59e0b",
                            fontWeight: 800, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap",
                          }}>
                          Wymeld. →
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Stats strip */}
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { l: "Łącznie",   v: gTotal,                              c: text },
            { l: "Czyste",    v: gDone,                               c: "#34d399" },
            { l: "Sprząta",   v: gClean,                              c: "#60a5fa" },
            { l: "Pominięte", v: gSkipped,                            c: "#a78bfa" },
            { l: "Czeka",     v: gTotal - gDone - gClean - gSkipped,  c: "#8b949e" },
          ].map(s => (
            <div key={s.l} style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 9, background: dark ? "rgba(255,255,255,.04)" : "var(--bg-secondary)", border: `1px solid ${dark ? "#21262d" : "var(--border-light)"}` }}>
              <div style={{ fontSize: 20, fontWeight: 900, color: s.c, lineHeight: 1 }}>{s.v}</div>
              <div style={{ fontSize: 9, color: muted, fontWeight: 700, marginTop: 2, textTransform: "uppercase", letterSpacing: ".04em" }}>{s.l}</div>
            </div>
          ))}
        </div>

        {/* Worker scoreboard */}
        {wStats.length > 0 && (
          <div style={{ ...card, padding: "10px 12px" }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: ".07em", marginBottom: 8 }}>Postęp pracownic</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {wStats.map(s => (
                <div key={s.name}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", background: s.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 900, color: textColorFor(s.color), flexShrink: 0 }}>{initial(s.name)}</div>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: text }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: "#34d399", fontWeight: 700 }}>{s.done}/{s.total}</span>
                    {s.cleaning > 0 && <span style={{ fontSize: 10, color: "#60a5fa" }}>⋯{s.cleaning}</span>}
                    <span style={{ fontSize: 10, color: muted, minWidth: 28, textAlign: "right" }}>{s.pct}%</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 999, background: dark ? "#21262d" : "#e5e7eb" }}>
                    <div style={{ height: "100%", width: `${s.pct}%`, background: s.color, borderRadius: 999, transition: "width .3s" }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Floor grids */}
        {FLOORS.map(floor => {
          const assigned = floor.rooms.filter(r => roomWorkerMap[r.no] || rooms[r.no]);
          if (!assigned.length) return null;
          return (
            <div key={floor.label} style={{ ...card, overflow: "hidden" }}>
              <div style={{ padding: "7px 12px", fontSize: 10, fontWeight: 800, color: muted, textTransform: "uppercase", letterSpacing: ".08em", borderBottom: `1px solid ${dark ? "#21262d" : "var(--border-light)"}` }}>
                {floor.label} · {assigned.length} pokoi
              </div>
              <div style={{ padding: "8px 10px", display: "flex", flexWrap: "wrap", gap: 5 }}>
                {floor.rooms.map(({ no }) => {
                  if (!roomWorkerMap[no] && !rooms[no]) return null;
                  const { bg, bc } = cellCfg(no);
                  const wa = roomWorkerMap[no];
                  const wIdx = wa ? allWNames.indexOf(wa.worker) : -1;
                  const wColor = wIdx >= 0 ? workerColor(wIdx) : muted;
                  const wName = wa ? wa.worker : rooms[no]?.worker;
                  const rs = rooms[no] || {};
                  const canVacate = !wa?.pm && rs.status === "W" && !rs.vacated;
                  const canSkip = wa?.pm && pmRoomTypes[no] === "PGZ" && rs.status === "W";
                  const isSelected = monitorPopover === no;
                  return (
                    <div key={no} style={{ position: "relative" }}>
                      <div
                        onClick={(e) => { e.stopPropagation(); setMonitorPopover(isSelected ? null : no); }}
                        style={{ width: 44, height: 44, borderRadius: 7, background: isSelected ? (dark ? "rgba(176,101,160,.2)" : "rgba(176,101,160,.12)") : bg, border: `1.5px solid ${isSelected ? "#B065A0" : bc}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, cursor: "pointer", transition: "border-color .1s, background .1s" }}>
                        <span style={{ fontSize: 11, fontWeight: 900, color: text, lineHeight: 1 }}>{no}</span>
                        {wName && <span style={{ fontSize: 8, fontWeight: 900, color: wColor, lineHeight: 1 }}>{initial(wName)}</span>}
                      </div>
                      {isSelected && (
                        <div style={{ position: "absolute", top: 48, left: "50%", transform: "translateX(-50%)", zIndex: 10, background: dark ? "#1c2128" : "#fff", border: `1px solid ${dark ? "#30363d" : "var(--border-light)"}`, borderRadius: 9, padding: "8px 10px", boxShadow: "0 4px 20px rgba(0,0,0,.25)", minWidth: 130, display: "flex", flexDirection: "column", gap: 5 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: muted, marginBottom: 2 }}>Pokój {no}</div>
                          {canVacate && (
                            <button onClick={(e) => { e.stopPropagation(); markVacated(no); setMonitorPopover(null); }}
                              style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(245,158,11,.4)", background: "rgba(245,158,11,.1)", color: "#f59e0b", fontWeight: 700, fontSize: 11, cursor: "pointer", textAlign: "left" }}>
                              Pusty (wyjazd)
                            </button>
                          )}
                          {canSkip && (
                            <button onClick={(e) => { e.stopPropagation(); markSkipped(no); setMonitorPopover(null); }}
                              style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(167,139,250,.4)", background: "rgba(167,139,250,.1)", color: "#a78bfa", fontWeight: 700, fontSize: 11, cursor: "pointer", textAlign: "left" }}>
                              Nie chcieli
                            </button>
                          )}
                          {!canVacate && !canSkip && (
                            <div style={{ fontSize: 11, color: muted, padding: "2px 0" }}>Brak dostępnych akcji</div>
                          )}
                          <button onClick={(e) => { e.stopPropagation(); setMonitorPopover(null); }}
                            style={{ marginTop: 2, padding: "3px 8px", borderRadius: 5, border: `1px solid ${dark ? "#30363d" : "var(--border-light)"}`, background: "none", color: muted, fontSize: 10, cursor: "pointer" }}>
                            Zamknij
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {allGroups.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 24px", color: muted }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🧹</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Brak przypisanych pokoi</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>Przypisz pokoje w zakładce Housekeeping.</div>
          </div>
        )}
      </div>
    );
  };

  // ─── Tab: Zadania ─────────────────────────────────────────────────────────
  const renderZadania = () => {
    const open   = tasks.filter(t => t.status === "open");
    const done   = tasks.filter(t => t.status === "done");
    const targetLabel = { all: "Wszyscy rano", morning: "Rano", pm: "PM" };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {/* Formularz */}
        <div style={{ ...card, padding: 16 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: text, marginBottom: 10 }}>Nowe zadanie</div>
          <textarea value={taskText} onChange={e => setTaskText(e.target.value)} placeholder="Opisz zadanie dla HK…" rows={2}
            style={{ width: "100%", padding: "8px 10px", borderRadius: 8, border: `1px solid ${dark ? "#30363d" : "var(--border-light)"}`, background: dark ? "#161b22" : "#fff", color: text, fontSize: 13, resize: "vertical", fontFamily: "inherit", boxSizing: "border-box" }} />
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <input value={taskRoom} onChange={e => setTaskRoom(e.target.value)} placeholder="Pokój (opcja)" maxLength={6}
              style={{ padding: "7px 10px", borderRadius: 7, border: `1px solid ${dark ? "#30363d" : "var(--border-light)"}`, background: dark ? "#161b22" : "#fff", color: text, fontSize: 13, width: 110 }} />
            <select value={taskTarget} onChange={e => setTaskTarget(e.target.value)}
              style={{ padding: "7px 10px", borderRadius: 7, border: `1px solid ${dark ? "#30363d" : "var(--border-light)"}`, background: dark ? "#161b22" : "#fff", color: text, fontSize: 13, flex: 1 }}>
              <option value="all">Wszyscy rano</option>
              <option value="morning">Rano</option>
              <option value="pm">PM</option>
              {workers.map(w => <option key={w} value={w}>{w}</option>)}
            </select>
            <button onClick={addTask} disabled={!taskText.trim()} style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: "#B065A0", color: "#fff", fontWeight: 700, fontSize: 13, cursor: taskText.trim() ? "pointer" : "not-allowed", opacity: taskText.trim() ? 1 : 0.5 }}>
              Wyślij
            </button>
          </div>
        </div>

        {/* Otwarte */}
        {open.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: ".06em" }}>Aktywne ({open.length})</div>
            {open.map(t => (
              <div key={t.id} style={{ ...card, padding: "12px 14px", borderLeft: "3px solid #f59e0b" }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: text, marginBottom: 4 }}>{t.text}</div>
                <div style={{ fontSize: 11, color: muted }}>
                  {t.room && <span>🚪 {t.room} · </span>}
                  Do: <strong style={{ color: "#B065A0" }}>{targetLabel[t.target] || t.target}</strong> · {t.created_by} · {new Date(t.created_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
                </div>
                <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                  <button onClick={() => doneTask(t)} style={{ padding: "5px 12px", borderRadius: 6, border: "none", background: "rgba(52,211,153,.12)", color: "#34d399", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>✓ Gotowe</button>
                  {(isManager || t.created_by === (employeeName || "Recepcja")) && (
                    <button onClick={() => deleteTask(t.id)} style={{ padding: "5px 10px", borderRadius: 6, border: "1px solid rgba(248,113,113,.3)", background: "rgba(248,113,113,.07)", color: "#f87171", fontWeight: 700, fontSize: 12, cursor: "pointer" }}>Usuń</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Zakończone */}
        {done.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: ".06em" }}>Zakończone ({done.length})</div>
            {done.map(t => (
              <div key={t.id} style={{ ...card, padding: "10px 14px", borderLeft: "3px solid #34d399", opacity: 0.7 }}>
                <div style={{ fontWeight: 600, fontSize: 13, color: text }}>✓ {t.text}</div>
                <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>
                  {t.done_by} · {t.done_at ? new Date(t.done_at).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }) : ""}
                </div>
              </div>
            ))}
          </div>
        )}

        {tasks.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 20px", color: muted }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Brak zadań na dziś</div>
          </div>
        )}
      </div>
    );
  };

  // ─── Tab: Pranie ─────────────────────────────────────────────────────────
  const renderPranie = () => {
    // Collect rooms with linen reports, grouped by worker
    const byWorker = {};
    Object.entries(rooms).forEach(([no, r]) => {
      if (!r.report) return;
      const w = r.worker || "—";
      if (!byWorker[w]) byWorker[w] = [];
      byWorker[w].push({ no, report: r.report, status: r.status });
    });

    const sumReport = (list) => {
      const t = {};
      const ex = {};
      LINEN_FIELDS.forEach(f => { t[f.key] = 0; });
      list.forEach(({ report: rp }) => {
        LINEN_FIELDS.forEach(f => { t[f.key] = (t[f.key] || 0) + (rp[f.key] || 0); });
        (rp.extraItems || []).forEach(it => {
          if (it.name) ex[it.name] = (ex[it.name] || 0) + (it.count || 0);
        });
      });
      return { totals: t, extra: ex };
    };

    const workerList = Object.entries(byWorker);
    const allRooms   = Object.values(byWorker).flat();
    const grand      = sumReport(allRooms);
    const hasAny     = LINEN_FIELDS.some(f => grand.totals[f.key] > 0) || Object.keys(grand.extra).length > 0;

    const thStyle = { padding: "7px 10px", fontSize: 11, fontWeight: 700, color: muted, textAlign: "center", borderBottom: `1px solid ${dark ? "#21262d" : "var(--border-light)"}`, whiteSpace: "nowrap" };
    const tdStyle = { padding: "6px 10px", fontSize: 13, fontWeight: 700, textAlign: "center", borderBottom: `1px solid ${dark ? "#21262d" : "var(--border-light)"}` };
    const tdNum   = (v) => ({ ...tdStyle, color: v > 0 ? text : muted, opacity: v > 0 ? 1 : 0.35 });

    const LinenTable = ({ list }) => {
      const { totals: t, extra: ex } = sumReport(list);
      const activeCols = LINEN_FIELDS.filter(f => t[f.key] > 0);
      if (!activeCols.length && !Object.keys(ex).length) return (
        <div style={{ fontSize: 11, color: muted, padding: "8px 0" }}>Brak danych z tego pracownika.</div>
      );
      return (
        <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 300 }}>
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "left" }}>Pokój</th>
                {activeCols.map(f => <th key={f.key} style={thStyle}>{f.label}</th>)}
                {Object.keys(ex).map(k => <th key={k} style={{ ...thStyle, color: "#f59e0b" }}>{k}</th>)}
              </tr>
            </thead>
            <tbody>
              {list.map(({ no, report: rp }) => (
                <tr key={no}>
                  <td style={{ ...tdStyle, textAlign: "left", fontWeight: 900, color: "#B065A0", fontSize: 14 }}>{no}</td>
                  {activeCols.map(f => {
                    const v = rp[f.key] || 0;
                    return <td key={f.key} style={tdNum(v)}>{v}</td>;
                  })}
                  {Object.keys(ex).map(k => {
                    const v = (rp.extraItems || []).find(it => it.name === k)?.count || 0;
                    return <td key={k} style={{ ...tdNum(v), color: v > 0 ? "#f59e0b" : muted }}>{v}</td>;
                  })}
                </tr>
              ))}
              {/* Subtotal row */}
              {list.length > 1 && (
                <tr style={{ background: dark ? "rgba(176,101,160,.08)" : "rgba(176,101,160,.05)" }}>
                  <td style={{ ...tdStyle, textAlign: "left", fontWeight: 900, color: "#B065A0" }}>Σ</td>
                  {activeCols.map(f => <td key={f.key} style={{ ...tdStyle, fontWeight: 900, color: "#B065A0" }}>{t[f.key]}</td>)}
                  {Object.keys(ex).map(k => <td key={k} style={{ ...tdStyle, fontWeight: 900, color: "#f59e0b" }}>{ex[k]}</td>)}
                </tr>
              )}
            </tbody>
          </table>
        </div>
      );
    };

    if (!hasAny && workerList.length === 0) return (
      <div style={{ textAlign: "center", padding: "48px 24px", color: muted }}>
        <div style={{ fontSize: 40, marginBottom: 10 }}>🧺</div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>Brak raportów prania</div>
        <div style={{ fontSize: 12, marginTop: 4 }}>Pojawią się po tym jak pracownice zatwierdzą sprzątanie pokoi.</div>
      </div>
    );

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

        {/* Grand total summary cards */}
        {hasAny && (
          <div style={{ ...card, padding: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: text, marginBottom: 12 }}>Łącznie do prania — {allRooms.length} pokoi</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(90px,1fr))", gap: 8 }}>
              {LINEN_FIELDS.filter(f => grand.totals[f.key] > 0).map(f => (
                <div key={f.key} style={{ textAlign: "center", padding: "10px 8px", borderRadius: 10, background: dark ? "rgba(176,101,160,.1)" : "rgba(176,101,160,.06)", border: `1px solid rgba(176,101,160,.2)` }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "#B065A0", lineHeight: 1 }}>{grand.totals[f.key]}</div>
                  <div style={{ fontSize: 10, color: muted, fontWeight: 700, marginTop: 4 }}>{f.label}</div>
                </div>
              ))}
              {Object.entries(grand.extra).filter(([, v]) => v > 0).map(([name, cnt]) => (
                <div key={name} style={{ textAlign: "center", padding: "10px 8px", borderRadius: 10, background: "rgba(245,158,11,.07)", border: "1px solid rgba(245,158,11,.3)" }}>
                  <div style={{ fontSize: 28, fontWeight: 900, color: "#f59e0b", lineHeight: 1 }}>{cnt}</div>
                  <div style={{ fontSize: 10, color: "#f59e0b", fontWeight: 700, marginTop: 4 }}>{name}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Per-worker breakdown */}
        {workerList.map(([w, list]) => {
          const { totals: t } = sumReport(list);
          const totalItems = LINEN_FIELDS.reduce((s, f) => s + (t[f.key] || 0), 0);
          const doneCnt = list.filter(r => r.status === "czyste").length;
          return (
            <div key={w} style={{ ...card, overflow: "hidden" }}>
              <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${dark ? "#21262d" : "var(--border-light)"}` }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#B065A0", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 13, color: "#fff", flexShrink: 0 }}>
                  {initial(w)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 13, color: text }}>{w}</div>
                  <div style={{ fontSize: 11, color: muted }}>{list.length} pokoi · {doneCnt} czyste · {totalItems} szt. pościeli</div>
                </div>
              </div>
              <div style={{ padding: "10px 14px" }}>
                <LinenTable list={list} />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ─── Tab: Pracownicy ──────────────────────────────────────────────────────
  const renderPracownicy = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ── Dodaj pracownika — zawsze widoczny ── */}
      <div style={{ ...card, padding: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: muted, textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 10 }}>
          Dodaj pracownika HK
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            value={newWorkerInput}
            onChange={e => setNewWorkerInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && addWorker()}
            placeholder="Wpisz imię, np. Tetiana…"
            style={{
              flex: 1, padding: "9px 13px", borderRadius: 8,
              border: `1.5px solid ${dark ? "#30363d" : "var(--border-light)"}`,
              background: dark ? "#161b22" : "#fff", color: text,
              fontSize: 14, outline: "none", fontFamily: "inherit",
            }}
          />
          <button
            onClick={addWorker}
            disabled={!newWorkerInput.trim()}
            style={{
              padding: "9px 20px", borderRadius: 8, border: "none",
              background: newWorkerInput.trim() ? "#B065A0" : (dark ? "#21262d" : "#e5e7eb"),
              color: newWorkerInput.trim() ? "#fff" : muted,
              fontWeight: 700, fontSize: 13, cursor: newWorkerInput.trim() ? "pointer" : "not-allowed",
              whiteSpace: "nowrap", transition: "all .15s",
            }}
          >
            + Dodaj
          </button>
        </div>
        {workers.length > 0 && (
          <div style={{ fontSize: 11, color: muted, marginTop: 8 }}>
            {workers.length} pracowników w bazie · usuń przez przycisk na karcie (tylko kierownik)
          </div>
        )}
      </div>

      {/* ── Stan pusty ── */}
      {workers.length === 0 && (
        <div style={{ textAlign: "center", padding: "32px 24px", color: muted }}>
          <div style={{ fontSize: 36, marginBottom: 8 }}>👥</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: text, marginBottom: 4 }}>Brak pracowników</div>
          <div style={{ fontSize: 12 }}>Wpisz imię powyżej i kliknij „+ Dodaj" aby dodać pierwszego pracownika HK.</div>
        </div>
      )}

      {/* ── Karty pracowników ── */}
      {workers.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(165px,1fr))", gap: 10 }}>
          {workers.map((name, i) => {
            const color        = workerColor(i);
            const qrData       = qrCache[`qr::${name}`];
            const morningRooms = assignments[name]?.length || 0;
            const pmRooms      = pmAssignments[name]?.length || 0;
            const role         = pmRooms ? "PM" : morningRooms ? "Rano" : "Wolna";
            const roleColor    = pmRooms ? "#a78bfa" : morningRooms ? "#34d399" : muted;
            return (
              <div key={name} style={{ ...card, overflow: "hidden", borderTop: `3px solid ${color}`, display: "flex", flexDirection: "column", alignItems: "center", padding: "14px 12px", gap: 8, textAlign: "center" }}>
                <div style={{ width: 36, height: 36, borderRadius: "50%", background: color, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 16, color: textColorFor(color) }}>
                  {initial(name)}
                </div>
                <div style={{ fontWeight: 800, fontSize: 13, color: text }}>{name}</div>
                <div style={{ fontSize: 10, fontWeight: 700, color: roleColor, padding: "2px 8px", borderRadius: 999, background: `${roleColor}18` }}>
                  {role}{morningRooms + pmRooms > 0 ? ` · ${morningRooms + pmRooms} pok.` : ""}
                </div>

                {/* QR code */}
                {qrData ? (
                  <img
                    src={qrData} alt="QR"
                    onClick={() => setQrModal({ name, dataURL: qrData })}
                    style={{ width: 120, height: 120, borderRadius: 8, border: `2px solid ${dark ? "#30363d" : "var(--border-light)"}`, cursor: "pointer" }}
                    title="Kliknij aby powiększyć"
                  />
                ) : (
                  <div style={{ width: 120, height: 120, borderRadius: 8, background: dark ? "rgba(255,255,255,.03)" : "var(--bg-secondary)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: muted, flexDirection: "column", gap: 4 }}>
                    {genFor === name ? (
                      <><div style={{ fontSize: 18 }}>⏳</div><span>Generuję…</span></>
                    ) : (
                      <><div style={{ fontSize: 22 }}>📱</div><span>Ładowanie…</span></>
                    )}
                  </div>
                )}

                <div style={{ display: "flex", gap: 6, width: "100%" }}>
                  <button
                    onClick={() => getQr(name, true)}
                    disabled={genFor === name}
                    style={{ flex: 1, padding: "6px 0", borderRadius: 6, border: `1px solid ${dark ? "#30363d" : "var(--border-light)"}`, background: "none", color: muted, fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                  >
                    {genFor === name ? "…" : "↻ QR"}
                  </button>
                  {isManager && (
                    <button
                      onClick={() => removeWorker(name)}
                      style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid rgba(248,113,113,.35)", background: "rgba(248,113,113,.07)", color: "#f87171", fontSize: 11, cursor: "pointer", fontWeight: 600 }}
                    >
                      Usuń
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ─── Tab: Historia ────────────────────────────────────────────────────────
  const renderHistoria = () => {
    const displayLogs = histLogs !== null ? histLogs : logs;
    const workerSummary = displayLogs.filter(l => l.worker && l.worker !== "Recepcja").reduce((acc, l) => {
      if (!acc[l.worker]) acc[l.worker] = { done: 0, skip: 0, rooms: new Set() };
      if (l.action === "done") acc[l.worker].done++;
      if (l.action === "skip") acc[l.worker].skip++;
      if (l.room) acc[l.worker].rooms.add(l.room);
      return acc;
    }, {});

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {isManager && (
          <div style={{ ...card, padding: "12px 14px", display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: muted, marginBottom: 4 }}>DATA</div>
              <input type="date" value={logDate} onChange={e => setLogDate(e.target.value)}
                style={{ padding: "7px 10px", borderRadius: 7, border: `1px solid ${dark ? "#30363d" : "var(--border-light)"}`, background: dark ? "#161b22" : "#fff", color: text, fontSize: 13 }} />
            </div>
            <button onClick={loadHistLogs} style={{ padding: "8px 16px", borderRadius: 7, border: "none", background: "#B065A0", color: "#fff", fontWeight: 700, fontSize: 13, cursor: "pointer" }}>Załaduj</button>
            {histLogs !== null && histLogs.length !== logs.length && (
              <button onClick={() => setHistLogs(null)} style={{ padding: "7px 12px", borderRadius: 7, border: `1px solid ${dark ? "#30363d" : "var(--border-light)"}`, background: "none", color: muted, fontSize: 12, cursor: "pointer" }}>Wróć do dziś</button>
            )}
          </div>
        )}

        {displayLogs.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 20px", color: muted }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>💬</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Brak aktywności</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[...displayLogs].reverse().map((l, i) => {
                const cfg = LOG_CFG[l.action] || LOG_CFG.start;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 10, background: cfg.bg, border: `1px solid ${cfg.bc}` }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: cfg.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: "#fff", flexShrink: 0 }}>{cfg.icon}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, color: text }}>{cfg.text(l)}</div>
                      <div style={{ fontSize: 11, color: muted, marginTop: 2 }}>{l.log_time}</div>
                    </div>
                  </div>
                );
              })}
            </div>
            {Object.keys(workerSummary).length > 0 && (
              <div style={{ ...card, padding: "12px 16px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: text, marginBottom: 8 }}>Podsumowanie pracowników</div>
                {Object.entries(workerSummary).map(([name, s]) => (
                  <div key={name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 0", borderBottom: `1px solid ${dark ? "#21262d" : "var(--border-light)"}` }}>
                    <span style={{ fontWeight: 700, fontSize: 13, flex: 1, color: text }}>{name}</span>
                    <span style={{ fontSize: 11, color: "#34d399", fontWeight: 700 }}>✓ {s.done}</span>
                    {s.skip > 0 && <span style={{ fontSize: 11, color: "#f59e0b", fontWeight: 700 }}>✕ {s.skip}</span>}
                    <span style={{ fontSize: 11, color: muted }}>{s.rooms.size} pokoi</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    );
  };

  // ─── Zespół tab: transfer rooms via Supabase ─────────────────────────────
  const doTransfer = async (fromWorker, toWorker) => {
    const waitingNos = (assignments[fromWorker] || []).filter(no => {
      const r = rooms[no];
      return !r || r.status === "W";
    });
    if (!waitingNos.length) { showToast("Brak wolnych pokoi do przeniesienia", "error"); return; }

    const newAssignments = { ...assignments };
    newAssignments[fromWorker] = (assignments[fromWorker] || []).filter(no => !waitingNos.includes(no));
    newAssignments[toWorker]   = [...new Set([...(assignments[toWorker] || []), ...waitingNos])];

    const { error } = await supabase.from("hk_plan")
      .update({ assignments: newAssignments, updated_at: new Date().toISOString() })
      .eq("date", date);
    if (error) { showToast("Błąd przenoszenia: " + error.message, "error"); return; }

    await Promise.all(waitingNos.map(no =>
      supabase.from("hk_rooms").upsert({ date, room: no, worker: toWorker, status: "W" }, { onConflict: "date,room" })
    ));

    const logTime = new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
    await supabase.from("hk_logs").insert({
      date, log_time: logTime, worker: "Recepcja", action: "exchange_accept", room: null,
      extra: `${fromWorker} → ${toWorker} (${waitingNos.length} pok.)`
    });

    if (setHkData) {
      setHkData(prev => {
        const next = { ...prev };
        waitingNos.forEach(no => { if (next[no]) next[no] = { ...next[no], person: toWorker }; });
        return next;
      });
    }
    showToast(`Przeniesiono ${waitingNos.length} pokoi: ${fromWorker} → ${toWorker}`, "success");
  };

  // ─── Czat/Zespół tab ─────────────────────────────────────────────────────
  const renderCzat = () => {
    // Build stats per worker from assignments + rooms
    const workerList = Object.entries(assignments).map(([name, rms]) => {
      const total   = rms.length;
      const done    = rms.filter(no => rooms[no]?.status === "czyste").length;
      const cleaning= rms.filter(no => rooms[no]?.status === "czyszczenie").length;
      const waiting = rms.filter(no => { const r = rooms[no]; return !r || r.status === "W"; }).length;
      const pct     = total ? Math.round(done / total * 100) : 0;
      const startLog= logs.slice().reverse().find(l => l.worker === name && l.action === "start");
      return { name, total, done, cleaning, waiting, pct, startedAt: startLog?.log_time || null };
    }).sort((a, b) => b.waiting - a.waiting);

    // Auto-suggestions: worker with most waiting → worker with 0 waiting
    const suggestions = [];
    const withFree = workerList.filter(w => w.waiting > 0);
    const done100  = workerList.filter(w => w.waiting === 0 && w.total > 0 && w.done > 0);
    withFree.forEach(src => {
      done100.forEach(dst => {
        suggestions.push({ from: src.name, to: dst.name, count: src.waiting });
      });
    });

    const vacatedWaiting = Object.entries(rooms)
      .filter(([, r]) => r.vacated && r.status === "W").map(([no]) => no);
    const recentLogs = [...logs].reverse().slice(0, 20);

    const colors = ["#B065A0","#f59e0b","#34d399","#f87171","#60a5fa","#a78bfa","#fb923c","#2dd4bf"];
    const wc = (name) => colors[Math.abs([...name].reduce((s,c)=>s+c.charCodeAt(0),0)) % colors.length];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>

        {/* Auto-suggestions */}
        {suggestions.length > 0 && (
          <div style={{ ...card, padding: "12px 14px", border: "1.5px solid rgba(245,158,11,.4)", background: dark ? "rgba(245,158,11,.04)" : "rgba(245,158,11,.04)" }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#f59e0b", marginBottom: 10, letterSpacing: ".05em" }}>💡 SUGESTIE WYMIANY</div>
            {suggestions.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < suggestions.length - 1 ? `1px solid ${dark ? "#21262d" : "var(--border-light)"}` : "none" }}>
                <div style={{ flex: 1 }}>
                  <span style={{ fontWeight: 700, color: text, fontSize: 13 }}>{s.from}</span>
                  <span style={{ color: muted, fontSize: 12, margin: "0 6px" }}>ma {s.count} wolnych →</span>
                  <span style={{ fontWeight: 700, color: "#34d399", fontSize: 13 }}>{s.to}</span>
                  <span style={{ color: muted, fontSize: 12, marginLeft: 6 }}>skończył/a</span>
                </div>
                <button
                  onClick={() => { if (window.confirm(`Przenieść ${s.count} wolnych pokoi od ${s.from} do ${s.to}?`)) doTransfer(s.from, s.to); }}
                  style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#B065A0", color: "#fff", fontSize: 12, fontWeight: 800, cursor: "pointer", flexShrink: 0 }}>
                  ⇄ Przenieś
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Worker progress cards */}
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 800, color: muted, marginBottom: 10, letterSpacing: ".05em" }}>👥 POSTĘP PRACOWNIKÓW</div>
          {workerList.length === 0 && (
            <div style={{ textAlign: "center", padding: "16px 0", color: muted, fontSize: 12 }}>Brak przypisanych pracowników</div>
          )}
          {workerList.map((w, i) => (
            <div key={w.name} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderBottom: i < workerList.length - 1 ? `1px solid ${dark ? "#21262d" : "var(--border-light)"}` : "none" }}>
              <div style={{ width: 34, height: 34, borderRadius: "50%", background: wc(w.name), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 900, color: "#fff", flexShrink: 0 }}>
                {initial(w.name)}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: text }}>{w.name}</span>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <span style={{ fontSize: 12, fontWeight: 900, color: "#34d399" }}>✓ {w.done}</span>
                    {w.cleaning > 0 && <span style={{ fontSize: 12, fontWeight: 900, color: "#60a5fa" }}>⟳ {w.cleaning}</span>}
                    <span style={{ fontSize: 12, fontWeight: 900, color: w.waiting > 0 ? "#f59e0b" : muted }}>{w.waiting} wol.</span>
                  </div>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: dark ? "#21262d" : "#e5e7eb", overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${w.pct}%`, background: wc(w.name), borderRadius: 999, transition: "width .4s" }} />
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 3 }}>
                  <span style={{ fontSize: 10, color: muted }}>{w.startedAt ? `start: ${w.startedAt}` : "nie zaczęła"}</span>
                  <span style={{ fontSize: 10, color: muted }}>{w.done}/{w.total} ({w.pct}%)</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Manual transfer between any two workers */}
        {workerList.length >= 2 && (
          <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 800, color: muted, marginBottom: 10, letterSpacing: ".05em" }}>⇄ RĘCZNA WYMIANA POKOI</div>
            {workerList.filter(w => w.waiting > 0).map(src => (
              <div key={src.name} style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 11, color: muted, marginBottom: 4 }}>
                  Od: <strong style={{ color: text }}>{src.name}</strong> ({src.waiting} wolnych)
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {workerList.filter(dst => dst.name !== src.name).map(dst => (
                    <button key={dst.name}
                      onClick={() => { if (window.confirm(`Przenieść ${src.waiting} wolnych pokoi od ${src.name} do ${dst.name}?`)) doTransfer(src.name, dst.name); }}
                      style={{ padding: "6px 12px", borderRadius: 7, border: `1px solid ${dark ? "#30363d" : "var(--border-light)"}`, background: dark ? "#161b22" : "#f8fafc", color: text, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                      → {dst.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {workerList.every(w => w.waiting === 0) && (
              <div style={{ color: muted, fontSize: 12 }}>Wszyscy mają 0 wolnych pokoi</div>
            )}
          </div>
        )}

        {/* Vacated rooms */}
        {vacatedWaiting.length > 0 && (
          <div style={card}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#f59e0b", marginBottom: 8, letterSpacing: ".05em" }}>🔔 PUSTE POKOJE (czekają)</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {vacatedWaiting.map(no => (
                <div key={no} style={{ padding: "4px 12px", borderRadius: 999, background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.3)", color: "#f59e0b", fontSize: 13, fontWeight: 800 }}>{no}</div>
              ))}
            </div>
          </div>
        )}

        {/* Activity feed */}
        <div style={card}>
          <div style={{ fontSize: 11, fontWeight: 800, color: muted, marginBottom: 8, letterSpacing: ".05em" }}>📋 AKTYWNOŚĆ DZIŚ</div>
          {recentLogs.length === 0
            ? <div style={{ textAlign: "center", padding: "20px 0", color: muted, fontSize: 12 }}>Brak aktywności</div>
            : recentLogs.map((l, i) => {
                const cfg = LOG_CFG[l.action] || { color: "#8b949e", icon: "·", text: (ll) => `${ll.worker} ${ll.action}` };
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: i < recentLogs.length - 1 ? `1px solid ${dark ? "#21262d" : "var(--border-light)"}` : "none" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: cfg.color + "22", color: cfg.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, flexShrink: 0, marginTop: 1 }}>{cfg.icon}</div>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: text, lineHeight: 1.4 }}>{cfg.text(l)}</div>
                      <div style={{ fontSize: 10, color: muted, marginTop: 1 }}>{l.log_time}</div>
                    </div>
                  </div>
                );
              })
          }
        </div>
      </div>
    );
  };

  // ─── Main render (v2 layout) ──────────────────────────────────────────────
  const totalWorkersOnline = Object.keys(assignments).length + Object.keys(pmAssignments).length;
  const totalRooms = roomVals.length;
  const totalDone  = stats.czyste;
  const totalVacated = roomVals.filter(r => r.vacated && r.status === "W").length;
  const progressPct = totalRooms ? Math.round((totalDone / totalRooms) * 100) : 0;

  return (
    <div className="hk-live-wrap" style={{ background: dark ? "var(--dark-bg)" : "var(--bg-primary)" }}>

      {/* v2 TOPBAR — crumb + title + meta + live pill + status bar */}
      <div style={{ background: dark ? "var(--dark-bg2)" : "#fff", borderBottom: `1px solid ${dark ? "var(--dark-border)" : "var(--border-light)"}`, padding: "16px 22px 14px", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 11, color: muted, fontWeight: 500, marginBottom: 5, display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ color: "var(--plum)", fontWeight: 700, fontSize: 10, letterSpacing: ".1em", textTransform: "uppercase", fontFamily: "'DM Serif Display', serif" }}>Pokoje</span>
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
              <span>HK Live</span>
            </div>
            <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 22, fontWeight: 700, color: text, letterSpacing: "-.01em", display: "flex", alignItems: "center", gap: 10, lineHeight: 1.1, margin: 0 }}>
              Housekeeping na żywo
              <span className="v2-live-pill">Live · SSE 3737</span>
            </h1>
            <div style={{ display: "flex", gap: 14, fontSize: 12, color: muted, marginTop: 6, flexWrap: "wrap" }}>
              <span>Pracownice: <b style={{ color: text, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{totalWorkersOnline}</b></span>
              <span>Pokoje: <b style={{ color: text, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{totalDone}/{totalRooms}</b></span>
              <span>Postęp: <b style={{ color: "#34d399", fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{progressPct}%</b></span>
              <span>Data: <b style={{ color: text, fontWeight: 600, fontFamily: "'JetBrains Mono', monospace" }}>{date}</b></span>
            </div>
          </div>

          {/* v2 STATUS BAR — 5 stat cells */}
          <div style={{ display: "flex", gap: 0, flexWrap: "wrap", border: `1px solid ${dark ? "var(--dark-border)" : "var(--border-light)"}`, borderRadius: 10, overflow: "hidden" }}>
            {[
              ["Czeka",      stats.W,           "#A89DAE", "rgba(168,157,174,.10)", "rgba(168,157,174,.30)"],
              ["W trakcie",  stats.czyszczenie, "#60a5fa", "rgba(96,165,250,.10)",  "rgba(96,165,250,.30)"],
              ["Gotowe",     stats.czyste,      "#34d399", "rgba(52,211,153,.10)",  "rgba(52,211,153,.30)"],
              ["Puste",      totalVacated,      "#f59e0b", "rgba(245,158,11,.10)",  "rgba(245,158,11,.30)"],
              ["Pominięte",  stats["pominięte"],"#a78bfa", "rgba(167,139,250,.10)", "rgba(167,139,250,.30)"],
            ].map(([lbl, cnt, col, bg, bc], i, arr) => (
              <div key={lbl} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", borderRight: i < arr.length - 1 ? `1px solid ${dark ? "var(--dark-border)" : "var(--border-light)"}` : "none", background: dark ? "var(--dark-card)" : "transparent" }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: bg, border: `1px solid ${bc}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ color: col, fontWeight: 800, fontSize: 14 }}>{cnt}</span>
                </div>
                <div style={{ fontSize: 9.5, color: muted, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", fontFamily: "'DM Serif Display', serif" }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="hk-live-body">
        {/* v2 Sidebar — z aubergine active state + glow */}
        <div className="hk-live-sidebar" style={{ background: dark ? "var(--dark-bg)" : "#f8fafc", borderRight: `1px solid ${dark ? "var(--dark-border)" : "var(--border-light)"}` }}>
          {TABS.map(tab => {
            const pendingCheckouts = tab.id === "monitor"
              ? HK_ALL.filter(r => (hkData?.[r.no]?.status === "W" || hkData?.[r.no]?.status === "WP") && !rooms[r.no]?.vacated).length
              : 0;
            const openTasks = tab.id === "zadania" ? tasks.filter(t => t.status === "open").length : 0;
            const badge = pendingCheckouts > 0 ? pendingCheckouts : openTasks > 0 ? openTasks : 0;
            const badgeColor = tab.id === "monitor" ? "#f59e0b" : "var(--plum)";
            const badgeBg   = tab.id === "monitor" ? "rgba(245,158,11,.18)" : "var(--plum-bright-bg)";
            const isActive = activeTab === tab.id;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} className="hk-live-tab-btn"
                style={{
                  background: isActive ? (dark ? "var(--plum-bright-bg)" : "rgba(90,29,74,.08)") : "transparent",
                  color: isActive ? "var(--plum)" : muted,
                  fontWeight: isActive ? 800 : 600,
                  borderLeft: isActive ? `3px solid var(--plum)` : `3px solid transparent`,
                  boxShadow: isActive && dark ? "var(--plum-bright-glow)" : "none",
                  transition: "all .15s cubic-bezier(.4,0,.2,1)"
                }}>
                <span style={{ fontSize: 14 }}>{tab.icon}</span>
                <span className="hk-live-tab-label">{tab.label}</span>
                {badge > 0 && (
                  <span style={{ marginLeft: "auto", fontSize: 10, fontWeight: 900, color: badgeColor, background: badgeBg, borderRadius: 999, padding: "1px 6px", flexShrink: 0, border: `1px solid ${tab.id === "monitor" ? "rgba(245,158,11,.3)" : "var(--plum-bright-border)"}` }}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="hk-live-content">
          {activeTab === "monitor"    && renderMonitor()}
          {activeTab === "zadania"    && renderZadania()}
          {activeTab === "pranie"     && renderPranie()}
          {activeTab === "pracownicy" && renderPracownicy()}
          {activeTab === "historia"   && renderHistoria()}
          {activeTab === "czat"       && renderCzat()}
        </div>
      </div>

      {/* QR Modal */}
      {qrModal && (
        <div onClick={() => setQrModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 16, padding: 24, textAlign: "center", boxShadow: "0 20px 60px rgba(0,0,0,.4)" }}>
            <div style={{ fontWeight: 800, fontSize: 16, marginBottom: 12, color: "#111" }}>{qrModal.name}</div>
            <img src={qrModal.dataURL} alt="QR" style={{ width: 240, height: 240 }} />
            <div style={{ fontSize: 11, color: "#888", marginTop: 10 }}>Kliknij poza kodem aby zamknąć</div>
          </div>
        </div>
      )}
    </div>
  );
}

export default HKLivePanel;
