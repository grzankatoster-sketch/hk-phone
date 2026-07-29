import React from "react";
import QRCode from "qrcode";
import {
  Radio, ListChecks, WashingMachine, Users, PackageSearch, Search, History,
  Play, Check, X, DoorOpen, SquareCheck, ArrowLeftRight, Hand, Zap, Circle,
  HelpCircle, MessageCircle, BellOff, BellRing,
} from "lucide-react";
import { supabase, phoneUrl } from "../../lib/supabase";
import { HK_ALL, HK_FLOOR1, HK_FLOOR2, HK_FLOOR3, HK_LIVE_COLORS, TENANT_ID } from "../../lib/constants";
import { loadJson, saveJson } from "../../lib/storage";
import { suggestReassignments, workerStats, suggestForRequest, HK_WORKER_ACTIONS } from "../../lib/hkAgent";
import { markRequestHandled, getDismissedSwaps, markSwapDismissed } from "../../lib/useHKAgent";
import { roomAdvisor, suggestAssignee, llmReady } from "../../lib/llm";

// Data LOKALNA (nie UTC) — musi zgadzać się z panelem menedżera, telefonami HK
// i resztą stacka, które kluczują dane po lokalnym dniu (todayKey/isoDate).
const TODAY = () => { const d = new Date(); const p = n => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; };
const sugKey = (s) => `${s.from}->${s.to}:${s.rooms.join(",")}`;

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

// Kolory statusów: --cc-progress/--cc-alt-accent to muted, marka-spójne warianty
// niebieskiego/fioletu (NIE Tailwind blue-400/violet-400) — trzymają odrębność
// wizualną "sprząta" vs "pominięte", której --sky/--violet nie dają (oba = plum).
const STATUS_CFG = {
  W:           { label: "Czeka",       color: "var(--cc-text-muted)", bg: "transparent",                                              bc: "var(--border-light)" },
  czyszczenie: { label: "Sprząta",     color: "var(--cc-progress)",   bg: "color-mix(in srgb, var(--cc-progress) 8%, transparent)",   bc: "color-mix(in srgb, var(--cc-progress) 30%, transparent)" },
  czyste:      { label: "Czyste",      color: "var(--emerald)",       bg: "color-mix(in srgb, var(--emerald) 8%, transparent)",       bc: "color-mix(in srgb, var(--emerald) 30%, transparent)" },
  "pominięte": { label: "Pominięte",   color: "var(--cc-alt-accent)", bg: "color-mix(in srgb, var(--cc-alt-accent) 8%, transparent)", bc: "color-mix(in srgb, var(--cc-alt-accent) 30%, transparent)" },
  vacated:     { label: "Pusty",       color: "var(--amber)",         bg: "color-mix(in srgb, var(--amber) 8%, transparent)",         bc: "color-mix(in srgb, var(--amber) 30%, transparent)" },
};

const logCfgEntry = (color, icon, text) => ({
  color, icon, text,
  bg: `color-mix(in srgb, ${color} 8%, transparent)`,
  bc: `color-mix(in srgb, ${color} 25%, transparent)`,
});
const LOG_CFG = {
  start:            logCfgEntry("var(--cc-progress)",   Play,           (l) => `${l.worker} zaczyna pokój ${l.room}`),
  done:             logCfgEntry("var(--emerald)",        Check,          (l) => `${l.worker} skończyła pokój ${l.room}${l.extra ? " · " + l.extra : ""}`),
  skip:             logCfgEntry("var(--amber)",          X,              (l) => `${l.worker} — goście nie chcieli (${l.room})`),
  vacate:           logCfgEntry("var(--cc-alt-accent)",  DoorOpen,       (l) => `Recepcja: pokój ${l.room} pusty`),
  task_done:        logCfgEntry("var(--emerald)",        SquareCheck,    (l) => `${l.worker}: zadanie — ${l.extra || ""}`),
  exchange_request: logCfgEntry("var(--amber)",          ArrowLeftRight, (l) => l.extra || `${l.worker} proponuje wymianę`),
  exchange_accept:  logCfgEntry("var(--emerald)",        ArrowLeftRight, (l) => l.extra || `${l.worker} przyjęła wymianę`),
  exchange_reject:  logCfgEntry("var(--rose)",           X,              (l) => l.extra || `${l.worker} odrzuciła wymianę`),
  room_request:     logCfgEntry("var(--cc-progress)",    Hand,           (l) => l.extra || `${l.worker} prosi o pokój`),
  reassign:         logCfgEntry("var(--cc-alt-accent)",  ArrowLeftRight, (l) => l.extra ? `Recepcja: ${l.extra}` : `${l.worker} — zmiana przydziału`),
  priority:         logCfgEntry("var(--amber)",          Zap,            (l) => l.extra || `Recepcja: pokój ${l.room} w pierwszej kolejności`),
  priority_off:     logCfgEntry("var(--cc-text-muted)",  Circle,         (l) => l.extra || `Recepcja: anulowano priorytet pokoju ${l.room}`),
  info_request:     logCfgEntry("var(--cc-progress)",    HelpCircle,     (l) => l.extra || `Recepcja pyta o status pokoju ${l.room}`),
  info_reply:       logCfgEntry("var(--emerald)",        MessageCircle,  (l) => `Pokój ${l.room} · ${l.worker}: ${l.extra || ""}`),
  dnd:              logCfgEntry("var(--rose)",           BellOff,        (l) => `${l.worker} — pokój ${l.room} oznaczony "nie przeszkadzać"`),
  dnd_off:          logCfgEntry("var(--cc-text-muted)",  BellRing,       (l) => `${l.worker} — zdjęto "nie przeszkadzać" z pokoju ${l.room}`),
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
];

// ─── Component ────────────────────────────────────────────────────────────────
function HKLivePanel({ dark, hkData, setHkData, hkDate, showToast, askConfirm, askPrompt, isManager, employeeName }) {
  const date = hkDate || TODAY();

  // ─── Global state from Supabase ───────────────────────────────────────────
  const [workers,   setWorkers]   = React.useState([]);
  const [rooms,     setRooms]     = React.useState({});   // { roomNo: rowFromDB }
  const [tasks,     setTasks]     = React.useState([]);
  const [logs,      setLogs]      = React.useState([]);
  const [planData,  setPlanData]  = React.useState(null); // hk_plan row from Supabase
  const [roster,    setRoster]    = React.useState([]);   // hk_roster: [{name, role}] — kto ma dyżur/popołudnie
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

  // Pracownicy obecni dziś = mają przydzielone pokoje (rano + PM); fallback: cała lista HK.
  const presentToday = React.useMemo(() => {
    const set = new Set([...Object.keys(assignments), ...Object.keys(pmAssignments)]);
    return set.size ? [...set] : workers;
  }, [assignments, pmAssignments, workers]);

  // Role z grafiku (hk_roster): kto ma dyżur, kto zmianę popołudniową (tydz. 10–18, weekend 12–20).
  const dutyPerson      = React.useMemo(() => roster.find(r => r.role === "dyzur")?.name || "", [roster]);
  const afternoonPerson = React.useMemo(
    () => roster.find(r => r.role === "popoludnie")?.name || Object.keys(pmAssignments)[0] || "",
    [roster, pmAssignments]
  );
  // Domyślni odbiorcy, gdy AI nie wie kogo przypisać: dyżur + popołudnie (oboje dostają).
  const dutyPmTargets = React.useMemo(() => {
    const out = [];
    if (dutyPerson) out.push(dutyPerson);
    if (afternoonPerson && afternoonPerson !== dutyPerson) out.push(afternoonPerson);
    return out;
  }, [dutyPerson, afternoonPerson]);

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
        { data: rosterRow },
      ] = await Promise.all([
        supabase.from("hk_workers").select("*").order("id"),
        supabase.from("hk_rooms").select("*").eq("date", date),
        supabase.from("hk_tasks").select("*").eq("date", date).order("created_at"),
        supabase.from("hk_logs").select("*").eq("date", date).order("created_at"),
        supabase.from("hk_plan").select("*").eq("date", date).order("updated_at", { ascending:false }).limit(1).maybeSingle(),
        supabase.from("hk_roster").select("roster").eq("tenant_id", TENANT_ID).eq("date", date).maybeSingle(),
      ]);
      if (!active) return;
      if (wData) setWorkers(wData.map(w => w.name));
      setRoster(Array.isArray(rosterRow?.roster) ? rosterRow.roster : []);
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

  // ─── Sync plan to Supabase when hkData changes ───────────────────────────
  React.useEffect(() => {
    if (!hkData) return;
    // Only sync when hkData actually contains person assignments (Electron app data, not empty Supabase state)
    if (!Object.values(hkData).some(rd => rd.person)) return;
    const sync = async () => {
      const rt = {};
      HK_ALL.forEach(r => { rt[r.no] = hkData[r.no]?.roomType || r.type; });
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

  // ─── Rzeczy znalezione (zgłoszenia z telefonów HK; nie są kluczowane po dniu) ──
  // Kontrole jakości pokoi (WYKONANIE 4.11) — read-only podgląd dla koordynatora.
  // Tworzone przez push-send po sprzątaniu (losowo), wypełniane przez pracownice na
  // telefonach; tu desktop tylko MONITORUJE wyniki (kto, pokój, checklista, status).
  const [qualityChecks, setQualityChecks] = React.useState([]);
  React.useEffect(() => {
    let active = true;
    const today = TODAY();
    const fetchQC = async () => {
      const { data } = await supabase.from("hk_quality_checks").select("*").eq("tenant_id", TENANT_ID).eq("date", today).order("created_at", { ascending: false });
      if (active && data) setQualityChecks(data);
    };
    fetchQC();
    const channel = supabase.channel("hk-quality-checks")
      .on("postgres_changes", { event: "*", schema: "public", table: "hk_quality_checks", filter: `date=eq.${today}` }, () => fetchQC())
      .subscribe();
    const poll = setInterval(fetchQC, 60000); // realtime pokrywa zmiany; poll = siatka bezpieczeństwa
    return () => { active = false; supabase.removeChannel(channel); clearInterval(poll); };
  }, []);

  const [foundItems, setFoundItems] = React.useState([]);
  React.useEffect(() => {
    let active = true;
    const fetchFound = async () => {
      const { data } = await supabase.from("found_items").select("*").eq("tenant_id", TENANT_ID).order("reported_at", { ascending: false }).limit(200);
      if (active && data) setFoundItems(data);
    };
    fetchFound();
    const channel = supabase.channel("hk-found-items")
      .on("postgres_changes", { event: "*", schema: "public", table: "found_items", filter: `tenant_id=eq.${TENANT_ID}` }, ({ eventType, new: row, old }) => {
        setFoundItems(prev => {
          if (eventType === "INSERT") return [row, ...prev.filter(i => i.id !== row.id)];
          if (eventType === "UPDATE") return prev.map(i => i.id === row.id ? row : i);
          if (eventType === "DELETE") return prev.filter(i => i.id !== old.id);
          return prev;
        });
        if (eventType === "INSERT") showToast(`Nowy znaleziony przedmiot${row.room ? " · pokój " + row.room : ""}`, "info");
      })
      .subscribe();
    const poll = setInterval(fetchFound, 60000); // realtime pokrywa zmiany; poll = rzadka siatka bezpieczeństwa (WYKONANIE 3.6)
    return () => { active = false; supabase.removeChannel(channel); clearInterval(poll); };
  }, []);

  // Dodanie znalezionego przedmiotu Z RECEPCJI (source 'recepcja') — gdy gość zostawi
  // coś przy ladzie / zadzwoni o zgubie. HK dodaje z telefonu; to domyka pętlę. WYKONANIE 4.5.
  const [newFoundDesc, setNewFoundDesc] = React.useState("");
  const [newFoundRoom, setNewFoundRoom] = React.useState("");
  const addFoundItem = async () => {
    if (!newFoundDesc.trim()) { showToast("Podaj opis przedmiotu.", "error"); return; }
    const { error } = await supabase.from("found_items").insert({
      tenant_id: TENANT_ID, source: "recepcja", room: newFoundRoom.trim() || null,
      description: newFoundDesc.trim(), reported_by: employeeName || "Recepcja", status: "open", photos: [],
    });
    if (error) { showToast("Błąd: " + error.message, "error"); return; }
    setNewFoundDesc(""); setNewFoundRoom("");
    showToast("Dodano znaleziony przedmiot.", "success"); // realtime doda go do listy
  };

  // Oznacz przedmiot jako oddany (komu/uwaga opcjonalnie). Zgłoszenie pozostaje niezmienne.
  const markReturned = (item) => {
    askPrompt("Komu oddano / uwaga (opcjonalnie):", async (note) => {
      const { error } = await supabase.from("found_items").update({
        status: "returned", returned_by: employeeName || "Recepcja", returned_at: new Date().toISOString(), returned_note: note || null,
      }).eq("id", item.id);
      if (error) { showToast("Błąd: " + error.message, "error"); return; }
      showToast("Oznaczono jako oddane", "success");
    }, { okLabel: "Oznacz" });
  };

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
    if (target === "all") {
      workersList = presentToday;          // wszyscy obecni dziś (rano + PM)
    } else if (target === "duty_pm") {
      workersList = dutyPmTargets.length ? dutyPmTargets : presentToday; // dyżur + popołudnie
    } else if (target === "morning") {
      workersList = Object.keys(assignments);
    } else if (target === "pm") {
      workersList = Object.keys(pmAssignments);
    } else {
      workersList = [target];              // konkretny pracownik
    }
    fetch("http://localhost:3737/push/task", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: { id: data?.id, text, room, target }, workers: workersList }),
    }).catch(() => {});
  };

  // Fallback gdy AI nie wskaże jednej osoby: kieruj do dyżuru + popołudnia (oboje dostają),
  // a gdy ról brak w grafiku — do wszystkich obecnych dziś.
  const applyDutyPmFallback = (reason) => {
    if (dutyPmTargets.length) {
      setTaskTarget("duty_pm");
      setRouteNote(`${reason} — przypisuję dyżur + popołudnie: ${dutyPmTargets.join(" + ")}.`);
    } else {
      setTaskTarget("all");
      const n = presentToday.length;
      setRouteNote(`${reason} — wyślę do wszystkich obecnych dziś${n ? ` (${n})` : ""}.`);
    }
  };

  // Routing zadania przez LLM: podpowiada KOMU przypisać (wg obciążenia/piętra).
  const suggestWho = async () => {
    if (routeBusy || !taskText.trim()) return;
    setRouteBusy(true); setRouteNote("");
    try {
      const stats = Object.values(workerStats(assignments, rooms))
        .map(w => ({ worker: w.worker, total: w.total, done: w.done, cleaning: w.cleaning, waiting: w.waiting }));
      const r = await suggestAssignee({ text: taskText.trim(), room: taskRoom.trim(), workers, stats });
      if (r.worker && workers.includes(r.worker)) {
        setTaskTarget(r.worker);
        setRouteNote(`AI proponuje: ${r.worker}${r.reason ? " — " + r.reason : ""}`);
      } else {
        // AI nie umie wskazać jednej osoby → przypisz dyżur + popołudnie (oboje dostają).
        applyDutyPmFallback("AI nie wskazał jednej osoby");
      }
    } catch (e) {
      // Asystent niedostępny/limit — też nie blokuj wysyłki, ten sam fallback.
      applyDutyPmFallback(e?.code === "rate_limited" ? "Limit zapytań" : "Asystent niedostępny");
    } finally { setRouteBusy(false); }
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

  const removeWorker = (name) => {
    askConfirm(`Usunąć ${name} z listy pracowników HK?`, async () => {
      await supabase.from("hk_workers").delete().eq("name", name);
      showToast(`Usunięto: ${name}`, "info");
    });
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
  const [routeBusy, setRouteBusy] = React.useState(false);
  const [routeNote, setRouteNote] = React.useState("");
  const [newWorkerInput, setNewWorkerInput] = React.useState("");
  const [logDate,        setLogDate]        = React.useState(date);
  const [histLogs,       setHistLogs]       = React.useState(null);
  const [linenOpen,      setLinenOpen]      = React.useState(false);
  const [qrModal,        setQrModal]        = React.useState(null); // { name, dataURL }
  const [monitorPopover, setMonitorPopover] = React.useState(null); // roomNo | null
  // Widok Monitora — każdy użytkownik wybiera swój (Lista/Kafelki/Po osobie).
  // Wybór zapamiętany w localStorage per imię recepcjonisty.
  const MON_VIEW_KEY = `hk-monitor-view-${employeeName || "default"}`;
  const [monView, setMonView] = React.useState(() => {
    try { const v = localStorage.getItem(MON_VIEW_KEY) || "lista"; return v === "tablica" ? "lista" : v; } catch { return "lista"; }
  });
  React.useEffect(() => {
    try { const v = localStorage.getItem(MON_VIEW_KEY); if (v) setMonView(v === "tablica" ? "lista" : v); } catch {}
  }, [MON_VIEW_KEY]);
  const changeMonView = (v) => {
    setMonView(v);
    try { localStorage.setItem(MON_VIEW_KEY, v); } catch {}
  };

  const loadHistLogs = async () => {
    const { data } = await supabase.from("hk_logs").select("*").eq("date", logDate).order("created_at");
    setHistLogs(data || []);
  };

  // ─── Styles ───────────────────────────────────────────────────────────────
  const card = {
    background: dark ? "var(--dark-card)" : "var(--bg-card)",
    border: `1px solid ${dark ? "var(--dark-border)" : "var(--border-light)"}`,
    borderRadius: 12,
  };
  const muted = dark ? "#484f58" : "var(--text-muted)";
  const text  = dark ? "#e6edf3" : "#111";

  const TABS = [
    { id: "monitor",     label: "Monitor",    icon: Radio },
    { id: "zadania",     label: "Zadania",    icon: ListChecks },
    { id: "pranie",      label: "Pranie",     icon: WashingMachine },
    { id: "pracownicy",  label: "Pracownicy", icon: Users },
    { id: "znalezione",  label: "Znalezione", icon: PackageSearch },
    { id: "kontrole",    label: "Kontrole",   icon: Search },
    { id: "historia",    label: "Historia",   icon: History },
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

    // Kontrola jakości oczekująca (hk_quality_checks, już fetchowane dla zakładki
    // Kontrole) — cross-referencujemy na kafelek pokoju, żeby było widać bez
    // przełączania zakładki.
    const qcPendingRooms = new Set(
      qualityChecks.filter(c => (c.status || "pending") !== "done").map(c => c.room)
    );

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

    // Filtr siatki wg klikniętego kafelka. "Czyste" pokazuje też sprzątane.
    const matchMon = (no) => {
      if (!monFilter) return true;
      const st = rooms[no]?.status;
      if (monFilter === "czyste") return st === "czyste" || st === "czyszczenie";
      if (monFilter === "sprzata") return st === "czyszczenie";
      if (monFilter === "czeka") return !st || st === "W";
      return true;
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

    // ── Ujednolicona lista aktywnych pokoi — wspólne źródło dla wszystkich 4 widoków ──
    const floorOf = {};
    HK_FLOOR1.forEach(r => { floorOf[r.no] = "I piętro"; });
    HK_FLOOR2.forEach(r => { floorOf[r.no] = "II piętro"; });
    HK_FLOOR3.forEach(r => { floorOf[r.no] = "III piętro"; });

    const activeNos = new Set([
      ...Object.keys(roomWorkerMap),
      ...Object.keys(rooms),
      ...checkoutRooms.map(r => r.no),
    ]);
    const roomNum = (no) => parseInt(String(no), 10) || 0;
    const cfgOf = (rs) => (rs.vacated && (rs.status === "W" || !rs.status))
      ? STATUS_CFG.vacated
      : (STATUS_CFG[rs.status] || STATUS_CFG.W);
    const statusKeyOf = (rs) => {
      if (rs.vacated && (rs.status === "W" || !rs.status)) return "pusty";
      if (rs.status === "czyszczenie") return "sprzata";
      if (rs.status === "czyste" || rs.status === "pominięte") return "gotowe";
      return "czeka";
    };
    const activeRooms = [...activeNos]
      .filter(no => matchMon(no))
      .map(no => {
        const rs = rooms[no] || {};
        const wa = roomWorkerMap[no];
        return {
          no, rs,
          worker: wa?.worker || rs.worker || null,
          pm: wa?.pm || false,
          floor: floorOf[no] || "Inne",
          statusKey: statusKeyOf(rs),
          vt: rs.vacated ? vacateTimeFor(no) : null,
        };
      })
      .sort((a, b) => roomNum(a.no) - roomNum(b.no) || String(a.no).localeCompare(String(b.no)));

    // Akcja na pokoju: "Pusty" (wyjazd) dla pokoi rannych W, "Nie chcieli" dla PM/PGZ.
    const actionBtn = (r) => {
      if (!r.pm && (r.rs.status === "W" || !r.rs.status) && !r.rs.vacated) {
        return (
          <button onClick={(e) => { e.stopPropagation(); markVacated(r.no); }}
            style={{ fontSize: 11, padding: "4px 9px", borderRadius: 6, border: "1px solid rgba(245,158,11,.4)", background: "rgba(245,158,11,.1)", color: "#f59e0b", cursor: "pointer", fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}>
            Pusty →
          </button>
        );
      }
      if (r.pm && pmRoomTypes[r.no] === "PGZ" && r.rs.status === "W") {
        return (
          <button onClick={(e) => { e.stopPropagation(); markSkipped(r.no); }}
            style={{ fontSize: 11, padding: "4px 9px", borderRadius: 6, border: "1px solid rgba(167,139,250,.4)", background: "rgba(167,139,250,.1)", color: "#a78bfa", cursor: "pointer", fontWeight: 800, whiteSpace: "nowrap", flexShrink: 0 }}>
            Nie chcieli
          </button>
        );
      }
      return null;
    };
    const softBg = (c) => c.bg === "transparent" ? (dark ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.04)") : c.bg;

    // ── WIDOK 1 — Lista (od góry do dołu, grupowana piętrami) ───────────────────
    const listaRow = (r) => {
      const c = cfgOf(r.rs);
      return (
        <div key={r.no} style={{ ...card, display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderLeft: `3px solid ${c.color}` }}>
          <span style={{ fontWeight: 900, fontSize: 18, minWidth: 40, color: c.color, letterSpacing: "-.02em" }}>{r.no}</span>
          <span style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 700, color: text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.worker ? r.worker.split(" ")[0] : "—"}</span>
          {r.pm && <span style={{ fontSize: 9, padding: "1px 6px", borderRadius: 999, background: "rgba(167,139,250,.15)", color: "#a78bfa", fontWeight: 700, flexShrink: 0 }}>{pmRoomTypes[r.no] || "PM"}</span>}
          {qcPendingRooms.has(r.no) && <span title="Oczekuje kontrola jakości" style={{ fontSize: 9, padding: "1px 6px", borderRadius: 999, background: "rgba(96,165,250,.15)", color: "#60a5fa", fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap" }}>🔍 kontrola</span>}
          <span style={{ fontSize: 10, fontWeight: 800, color: c.color, textTransform: "uppercase", letterSpacing: ".04em", padding: "2px 8px", borderRadius: 999, background: softBg(c), border: `1px solid ${c.bc}`, whiteSpace: "nowrap", flexShrink: 0 }}>{c.label}</span>
          {r.vt && <span style={{ fontSize: 10, color: muted, flexShrink: 0 }}>{r.vt}</span>}
          {actionBtn(r)}
        </div>
      );
    };
    const renderViewLista = () => {
      const FLOOR_ORDER = ["I piętro", "II piętro", "III piętro", "Inne"];
      const byFloor = {};
      activeRooms.forEach(r => { (byFloor[r.floor] = byFloor[r.floor] || []).push(r); });
      const floors = FLOOR_ORDER.filter(f => byFloor[f]?.length);
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {floors.map(f => (
            <div key={f} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ fontSize: 10, fontWeight: 800, color: muted, textTransform: "uppercase", letterSpacing: ".08em", padding: "0 2px" }}>{f} · {byFloor[f].length} pokoi</div>
              {byFloor[f].map(listaRow)}
            </div>
          ))}
        </div>
      );
    };

    // ── WIDOK 2 — Kafelki (mapa pięter, większe, z legendą + popover akcji) ─────
    const renderViewKafelki = () => (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: "0 2px" }}>
          {[["Czeka", "#8b949e"], ["Pusty", "#f59e0b"], ["Sprząta", "#60a5fa"], ["Gotowe", "#34d399"]].map(([l, c]) => (
            <span key={l} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 11, color: muted, fontWeight: 600 }}>
              <span style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />{l}
            </span>
          ))}
        </div>
        {FLOORS.map(floor => {
          const rs = floor.rooms.filter(r => activeNos.has(r.no) && matchMon(r.no));
          if (!rs.length) return null;
          return (
            <div key={floor.label} style={{ ...card }}>
              <div style={{ padding: "7px 12px", fontSize: 10, fontWeight: 800, color: muted, textTransform: "uppercase", letterSpacing: ".08em", borderBottom: `1px solid ${dark ? "#21262d" : "var(--border-light)"}` }}>{floor.label} · {rs.length} pokoi</div>
              <div style={{ padding: "10px", display: "flex", flexWrap: "wrap", gap: 7 }}>
                {rs.map(({ no }) => {
                  const { bg, bc } = cellCfg(no);
                  const wa = roomWorkerMap[no];
                  const wName = wa?.worker || rooms[no]?.worker;
                  const cfg = cfgOf(rooms[no] || {});
                  const isSelected = monitorPopover === no;
                  const rsr = rooms[no] || {};
                  const canVacate = !wa?.pm && rsr.status === "W" && !rsr.vacated;
                  const canSkip = wa?.pm && pmRoomTypes[no] === "PGZ" && rsr.status === "W";
                  return (
                    <div key={no} style={{ position: "relative" }}>
                      <div onClick={(e) => { e.stopPropagation(); setMonitorPopover(isSelected ? null : no); }}
                        style={{ width: 72, minHeight: 58, borderRadius: 9, background: isSelected ? (dark ? "rgba(176,101,160,.2)" : "rgba(176,101,160,.12)") : bg, border: `1.5px solid ${isSelected ? "#B065A0" : bc}`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, padding: "6px 4px", cursor: "pointer", transition: "border-color .1s, background .1s" }}>
                        <span style={{ fontSize: 16, fontWeight: 900, color: text, lineHeight: 1 }}>{no}</span>
                        {wName && <span style={{ fontSize: 10, fontWeight: 700, color: muted, lineHeight: 1, maxWidth: 66, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wName.split(" ")[0]}</span>}
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: cfg.color, marginTop: 1 }} />
                      </div>
                      {qcPendingRooms.has(no) && (
                        <span title="Oczekuje kontrola jakości" style={{ position: "absolute", top: -5, right: -5, width: 17, height: 17, borderRadius: "50%", background: "#60a5fa", color: "#fff", fontSize: 9, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, boxShadow: "0 1px 4px rgba(0,0,0,.35)" }}>🔍</span>
                      )}
                      {isSelected && (
                        <div style={{ position: "absolute", top: 64, left: "50%", transform: "translateX(-50%)", zIndex: 10, background: dark ? "#1c2128" : "#fff", border: `1px solid ${dark ? "#30363d" : "var(--border-light)"}`, borderRadius: 9, padding: "8px 10px", boxShadow: "0 4px 20px rgba(0,0,0,.25)", minWidth: 130, display: "flex", flexDirection: "column", gap: 5 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: muted, marginBottom: 2 }}>Pokój {no}{wName ? ` · ${wName}` : ""}</div>
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
      </div>
    );

    // ── WIDOK 3 — Po osobie (sekcje pracownic + ich pokoje) ────────────────────
    const renderViewOsoby = () => {
      // Stabilny indeks koloru per pracownik — unia obecnych dziś + pełnej listy HK
      // (spójne z kolorowaniem w zakładce Pracownicy). Bez tego: ReferenceError.
      const allWNames = [...new Set([...presentToday, ...workers])];
      const byWorker = {};
      const noWorker = [];
      activeRooms.forEach(r => {
        if (r.worker) (byWorker[r.worker] = byWorker[r.worker] || []).push(r);
        else noWorker.push(r);
      });
      const workerCards = Object.entries(byWorker).map(([name, rms]) => {
        const done = rms.filter(r => r.statusKey === "gotowe").length;
        const waiting = rms.filter(r => r.statusKey === "czeka" || r.statusKey === "pusty").length;
        const pct = rms.length ? Math.round(done / rms.length * 100) : 0;
        const idx = allWNames.indexOf(name);
        return { name, rms, done, waiting, pct, color: idx >= 0 ? workerColor(idx) : "#8b949e" };
      }).sort((a, b) => b.waiting - a.waiting || a.name.localeCompare(b.name));
      const chip = (r) => {
        const c = cfgOf(r.rs);
        return (
          <div key={r.no} style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 8, background: softBg(c), border: `1.5px solid ${c.bc}` }}>
            <span style={{ fontSize: 14, fontWeight: 900, color: c.color }}>{r.no}</span>
            {qcPendingRooms.has(r.no) && <span title="Oczekuje kontrola jakości" style={{ fontSize: 11 }}>🔍</span>}
            {actionBtn(r)}
          </div>
        );
      };
      return (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {workerCards.map(w => (
            <div key={w.name} style={{ ...card, overflow: "hidden" }}>
              <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10, borderBottom: `1px solid ${dark ? "#21262d" : "var(--border-light)"}` }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", background: w.color, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: textColorFor(w.color), flexShrink: 0 }}>{initial(w.name)}</div>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 800, color: text }}>{w.name}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#34d399" }}>{w.done}/{w.rms.length}</span>
                <div style={{ width: 80, height: 6, borderRadius: 999, background: dark ? "#21262d" : "#e5e7eb", overflow: "hidden", flexShrink: 0 }}>
                  <div style={{ height: "100%", width: `${w.pct}%`, background: w.color, borderRadius: 999, transition: "width .3s" }} />
                </div>
              </div>
              <div style={{ padding: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {w.rms.map(chip)}
              </div>
            </div>
          ))}
          {noWorker.length > 0 && (
            <div style={{ ...card, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", fontSize: 10, fontWeight: 800, color: muted, textTransform: "uppercase", letterSpacing: ".08em", borderBottom: `1px solid ${dark ? "#21262d" : "var(--border-light)"}` }}>Nieprzypisane · {noWorker.length}</div>
              <div style={{ padding: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                {noWorker.map(chip)}
              </div>
            </div>
          )}
        </div>
      );
    };

    const VIEWS = [
      { id: "lista",   n: "1", label: "Lista" },
      { id: "kafelki", n: "2", label: "Kafelki" },
      { id: "osoby",   n: "3", label: "Po osobie" },
    ];

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }} onClick={() => setMonitorPopover(null)}>

        {/* Stats strip — klikalne filtry (klik = filtruj siatkę, klik ponownie = wyczyść) */}
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { l: "Łącznie", v: gTotal,                      c: text,      key: null },
            { l: "Czyste",  v: gDone,                       c: "#34d399", key: "czyste" },
            { l: "Sprząta", v: gClean,                      c: "#60a5fa", key: "sprzata" },
            { l: "Czeka",   v: gTotal - gDone - gClean - gSkipped, c: "#8b949e", key: "czeka" },
          ].map(s => {
            const active = monFilter === s.key && s.key !== null;
            return (
              <button key={s.l} type="button"
                onClick={() => setMonFilter(s.key === null ? null : (monFilter === s.key ? null : s.key))}
                style={{ flex: 1, textAlign: "center", padding: "8px 4px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
                  background: active ? (dark ? "rgba(99,102,241,.15)" : "var(--plum-soft,#f3e8f1)") : (dark ? "rgba(255,255,255,.04)" : "var(--bg-secondary)"),
                  border: `1px solid ${active ? "#6366f1" : (dark ? "#21262d" : "var(--border-light)")}` }}>
                <div style={{ fontSize: 20, fontWeight: 900, color: s.c, lineHeight: 1 }}>{s.v}</div>
                <div style={{ fontSize: 9, color: muted, fontWeight: 700, marginTop: 2, textTransform: "uppercase", letterSpacing: ".04em" }}>{s.l}</div>
              </button>
            );
          })}
        </div>

        {/* Przełącznik widoku — każdy wybiera swój (zapamiętany per osoba) */}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="tablist" aria-label="Widok monitora">
          {VIEWS.map(v => {
            const active = monView === v.id;
            return (
              <button key={v.id} type="button" role="tab" aria-selected={active}
                onClick={() => changeMonView(v.id)}
                style={{ flex: "1 1 0", minWidth: 96, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, padding: "9px 8px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit", fontSize: 12.5, fontWeight: 800,
                  color: active ? "#fff" : text,
                  background: active ? "#B065A0" : (dark ? "rgba(255,255,255,.04)" : "var(--bg-secondary)"),
                  border: `1px solid ${active ? "#B065A0" : (dark ? "#21262d" : "var(--border-light)")}` }}>
                <span style={{ opacity: active ? 0.8 : 0.45, fontWeight: 900 }}>{v.n}</span>{v.label}
              </button>
            );
          })}
        </div>

        {/* Ciało wybranego widoku */}
        {activeRooms.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 24px", color: muted }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🧹</div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>{monFilter ? "Brak pokoi dla tego filtra" : "Brak przypisanych pokoi"}</div>
            <div style={{ fontSize: 12, marginTop: 4 }}>{monFilter ? "Kliknij ponownie kafelek statystyk, by wyczyścić filtr." : "Przypisz pokoje w zakładce Housekeeping."}</div>
          </div>
        ) : monView === "kafelki" ? renderViewKafelki()
          : monView === "osoby" ? renderViewOsoby()
          : renderViewLista()}
      </div>
    );
  };

  // ─── Tab: Zadania ─────────────────────────────────────────────────────────
  const renderZadania = () => {
    const open   = tasks.filter(t => t.status === "open");
    const done   = tasks.filter(t => t.status === "done");
    const targetLabel = { all: "Wszyscy obecni dziś", duty_pm: "Dyżur + Popołudnie", morning: "Rano", pm: "PM" };
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
              {dutyPerson && <option value={dutyPerson}>Dyżur ({dutyPerson})</option>}
              {afternoonPerson && afternoonPerson !== dutyPerson && <option value={afternoonPerson}>Popołudnie ({afternoonPerson})</option>}
              <option value="duty_pm">Dyżur + Popołudnie{dutyPmTargets.length ? ` (${dutyPmTargets.join(" + ")})` : ""}</option>
              <option value="all">Wszyscy</option>
              {/* Gdy „🔮 Komu?" wskaże konkretną osobę spoza powyższych — pokaż ją, by była widoczna w polu */}
              {taskTarget && !["all", "duty_pm", dutyPerson, afternoonPerson].includes(taskTarget) && (
                <option value={taskTarget}>{taskTarget}</option>
              )}
            </select>
            {llmReady && (
              <button onClick={suggestWho} disabled={routeBusy || !taskText.trim()} title="LLM podpowie komu przypisać"
                style={{ padding: "7px 12px", borderRadius: 7, border: `1px solid ${dark ? "#30363d" : "var(--border-light)"}`, background: "transparent", color: text, fontWeight: 700, fontSize: 13, cursor: (routeBusy || !taskText.trim()) ? "not-allowed" : "pointer", opacity: (routeBusy || !taskText.trim()) ? 0.5 : 1 }}>
                {routeBusy ? "…" : "🔮 Komu?"}
              </button>
            )}
            <button onClick={addTask} disabled={!taskText.trim()} style={{ padding: "7px 18px", borderRadius: 7, border: "none", background: "#B065A0", color: "#fff", fontWeight: 700, fontSize: 13, cursor: taskText.trim() ? "pointer" : "not-allowed", opacity: taskText.trim() ? 1 : 0.5 }}>
              Wyślij
            </button>
          </div>
          {routeNote && <div style={{ marginTop: 8, fontSize: 12, color: dark ? "#8b949e" : "var(--text-muted)" }}>{routeNote}</div>}
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

  // ─── Tab: Kontrole (jakości pokoi — read-only podgląd wyników) ────────────
  const renderKontrole = () => {
    const pending = qualityChecks.filter(c => (c.status || "pending") !== "done");
    const done = qualityChecks.filter(c => (c.status || "pending") === "done");
    const checkCard = (c) => {
      const isDone = (c.status || "pending") === "done";
      const items = Array.isArray(c.items) ? c.items : [];
      const okCount = items.filter(i => i.checked).length;
      const accent = isDone ? "#34d399" : "#f59e0b";
      return (
        <details key={c.id} className="cc-found-det" style={{ ...card, padding: "9px 12px", borderLeft: `3px solid ${accent}`, opacity: isDone ? 0.9 : 1 }}>
          <summary style={{ cursor: "pointer" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "calc(100% - 22px)", verticalAlign: "middle" }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: text, whiteSpace: "nowrap" }}>Pokój {c.room}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>kontroluje: {c.target_worker || "—"}{c.cleaned_by ? ` · sprzątał/a: ${c.cleaned_by}` : ""}</span>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: ".04em", flexShrink: 0, background: isDone ? "rgba(52,211,153,.12)" : "rgba(245,158,11,.12)", color: accent }}>{isDone ? `Sprawdzone ${okCount}/${items.length}` : "Oczekuje"}</span>
            </span>
          </summary>
          {items.length > 0 && (
            <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
              {items.map((it, k) => (
                <div key={k} style={{ fontSize: 12.5, color: it.checked ? text : muted, display: "flex", gap: 8 }}><span>{it.checked ? "✓" : "○"}</span><span>{it.q}</span></div>
              ))}
            </div>
          )}
        </details>
      );
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ fontSize: 11, fontWeight: 800, color: muted, textTransform: "uppercase", letterSpacing: ".06em" }}>Oczekuje · {pending.length}</div>
        {pending.length ? pending.map(checkCard) : <div style={{ textAlign: "center", padding: "20px", color: muted, fontSize: 13 }}>Brak kontroli oczekujących na dziś.</div>}
        {done.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, color: muted, textTransform: "uppercase", letterSpacing: ".06em", marginTop: 6 }}>Sprawdzone · {done.length}</div>
            {done.map(checkCard)}
          </>
        )}
      </div>
    );
  };

  // ─── Tab: Znalezione (rzeczy znalezione zgłoszone z telefonów HK) ─────────
  const renderZnalezione = () => {
    const fmt = (iso) => { try { return new Date(iso).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
    const open     = foundItems.filter(i => (i.status || "open") !== "returned");
    const returned = foundItems.filter(i => (i.status || "open") === "returned");
    const itemCard = (i) => {
      const isRet = (i.status || "open") === "returned";
      const photos = Array.isArray(i.photos) ? i.photos : [];
      const accent = isRet ? "#34d399" : "#f59e0b";
      const d = (i.description || "").replace(/\s+/g, " ").trim();
      const preview = d.length > 42 ? d.slice(0, 42) + "…" : d;
      return (
        <details key={i.id} className="cc-found-det" style={{ ...card, padding: "9px 12px", borderLeft: `3px solid ${accent}`, opacity: isRet ? 0.75 : 1 }}>
          <summary style={{ cursor: "pointer" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8, width: "calc(100% - 22px)", verticalAlign: "middle" }}>
              <span style={{ fontSize: 14, fontWeight: 900, color: text, whiteSpace: "nowrap" }}>{i.room ? `Pokój ${i.room}` : "—"}</span>
              <span style={{ flex: 1, minWidth: 0, fontSize: 13, color: muted, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{preview || "(bez opisu)"}</span>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", letterSpacing: ".04em", flexShrink: 0,
                background: isRet ? "rgba(52,211,153,.12)" : "rgba(245,158,11,.12)", color: accent }}>
                {isRet ? "Oddane" : "W depozycie"}
              </span>
            </span>
          </summary>
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 14, color: text, lineHeight: 1.45, marginBottom: 6, whiteSpace: "pre-wrap" }}>{i.description}</div>
            <div style={{ fontSize: 11.5, color: muted, marginBottom: photos.length ? 8 : 0 }}>
              {(i.reported_by || "—")} · {fmt(i.reported_at || i.created_at)} · {i.source === "hk" ? "HK" : "recepcja"}
              {isRet && i.returned_by ? ` · oddał: ${i.returned_by}${i.returned_note ? ` (${i.returned_note})` : ""}` : ""}
            </div>
            {photos.length > 0 && (
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: isRet ? 0 : 8 }}>
                {photos.map((u, k) => (
                  <a key={k} href={u} target="_blank" rel="noopener noreferrer" style={{ display: "block", width: 64, height: 64, borderRadius: 8, overflow: "hidden", border: `1px solid ${dark ? "#30363d" : "var(--border-light)"}` }}>
                    <img src={u} alt="" loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </a>
                ))}
              </div>
            )}
            {!isRet && (
              <button onClick={() => markReturned(i)} style={{ fontSize: 12, padding: "6px 12px", borderRadius: 7, border: "1px solid rgba(52,211,153,.4)", background: "rgba(52,211,153,.1)", color: "#34d399", cursor: "pointer", fontWeight: 800 }}>
                ✓ Oznacz: oddane
              </button>
            )}
          </div>
        </details>
      );
    };
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ ...card, padding: "10px 12px", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input value={newFoundRoom} onChange={e => setNewFoundRoom(e.target.value)} placeholder="Pokój"
            style={{ width: 80, padding: "7px 10px", borderRadius: 7, border: `1px solid ${dark ? "#30363d" : "var(--border-light)"}`, background: dark ? "#0d1117" : "#fff", color: text, fontSize: 13 }} />
          <input value={newFoundDesc} onChange={e => setNewFoundDesc(e.target.value)} onKeyDown={e => e.key === "Enter" && addFoundItem()} placeholder="Co znaleziono (np. czarny parasol przy ladzie)"
            style={{ flex: 1, minWidth: 160, padding: "7px 10px", borderRadius: 7, border: `1px solid ${dark ? "#30363d" : "var(--border-light)"}`, background: dark ? "#0d1117" : "#fff", color: text, fontSize: 13 }} />
          <button onClick={addFoundItem} style={{ fontSize: 12, padding: "7px 14px", borderRadius: 7, border: "1px solid rgba(245,158,11,.4)", background: "rgba(245,158,11,.12)", color: "#f59e0b", cursor: "pointer", fontWeight: 800 }}>+ Dodaj</button>
        </div>
        <div style={{ fontSize: 11, fontWeight: 800, color: muted, textTransform: "uppercase", letterSpacing: ".06em" }}>W depozycie · {open.length}</div>
        {open.length ? open.map(itemCard) : (
          <div style={{ textAlign: "center", padding: "30px 20px", color: muted }}>
            <div style={{ fontSize: 34, marginBottom: 8 }}>📦</div>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Brak rzeczy w depozycie.</div>
          </div>
        )}
        {returned.length > 0 && (
          <>
            <div style={{ fontSize: 11, fontWeight: 800, color: muted, textTransform: "uppercase", letterSpacing: ".06em", marginTop: 6 }}>Oddane · {returned.length}</div>
            {returned.map(itemCard)}
          </>
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
            <MessageCircle size={28} style={{ marginBottom: 8, opacity: .5 }}/>
            <div style={{ fontSize: 13, fontWeight: 700 }}>Brak aktywności</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[...displayLogs].reverse().map((l, i) => {
                const cfg = LOG_CFG[l.action] || LOG_CFG.start;
                const Ic = cfg.icon;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 10, background: cfg.bg, border: `1px solid ${cfg.bc}` }}>
                    <div style={{ width: 32, height: 32, borderRadius: "50%", background: cfg.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", flexShrink: 0 }}><Ic size={16}/></div>
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
                  onClick={() => askConfirm(`Przenieść ${s.count} wolnych pokoi od ${s.from} do ${s.to}?`, () => doTransfer(s.from, s.to))}
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
                      onClick={() => askConfirm(`Przenieść ${src.waiting} wolnych pokoi od ${src.name} do ${dst.name}?`, () => doTransfer(src.name, dst.name))}
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
                const cfg = LOG_CFG[l.action] || logCfgEntry("var(--cc-text-muted)", Circle, (ll) => `${ll.worker} ${ll.action}`);
                const Ic = cfg.icon;
                return (
                  <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 0", borderBottom: i < recentLogs.length - 1 ? `1px solid ${dark ? "#21262d" : "var(--border-light)"}` : "none" }}>
                    <div style={{ width: 22, height: 22, borderRadius: "50%", background: cfg.bg, color: cfg.color, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 1 }}><Ic size={12}/></div>
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

  // Filtr monitora — klik w kafelek statystyk filtruje siatkę pokoi.
  const [monFilter, setMonFilter] = React.useState(null); // null|'czyste'|'czeka'|'sprzata'
  // ─── Liczba pokoi z maila (raport KWHotel) — z lokalnego źródła Electron ────
  const [mailRooms, setMailRooms] = React.useState(null);
  React.useEffect(() => {
    const api = window.electronAPI;
    if (!api?.hkAutomationGetSource) { setMailRooms(null); return; }
    let stop = false;
    const fetchSrc = async () => {
      try {
        const r = await api.hkAutomationGetSource(date);
        if (stop) return;
        const src = r?.ok ? r.source : null;
        if (!src) { setMailRooms(null); return; }
        const n = Array.isArray(src.rows) ? src.rows.filter(x => x?.status).length
          : (src.summary?.plannedRooms ?? null);
        setMailRooms(n);
      } catch { if (!stop) setMailRooms(null); }
    };
    fetchSrc();
    const id = setInterval(fetchSrc, 60000);
    return () => { stop = true; clearInterval(id); };
  }, [date]);

  // ─── Agent regułowy: sugestie zamian pokoi (recepcja zatwierdza) ───────────
  // Odrzucenia są TRWAŁE i wspólne z watcherem (localStorage per data) — odrzucona
  // 1:1 propozycja nie wraca, nawet po przełączeniu zakładek.
  const [dismissedSug, setDismissedSug] = React.useState(() => getDismissedSwaps(date));
  React.useEffect(() => { setDismissedSug(getDismissedSwaps(date)); }, [date]);
  React.useEffect(() => {
    const onDismissed = () => setDismissedSug(getDismissedSwaps(date));
    window.addEventListener("cc-agent-dismissed", onDismissed);
    return () => window.removeEventListener("cc-agent-dismissed", onDismissed);
  }, [date]);
  const dismissSwap = React.useCallback((s) => {
    markSwapDismissed(date, sugKey(s));
    setDismissedSug(prev => prev.includes(sugKey(s)) ? prev : [...prev, sugKey(s)]);
  }, [date]);
  // Osoby obecne dziś (też idle bez pokoi) = przydziały ∪ grafik ∪ autorzy logów HK.
  // Ta sama reguła co w useHKAgent — by popover/Uwaga AI zgadzały się z bannerem.
  // Z logów tylko akcje sprzątających (HK_WORKER_ACTIONS) — akcje recepcji zapisane
  // pod imieniem recepcjonisty są pomijane, by recepcja nie była kandydatem do pokoi.
  const presentWorkers = React.useMemo(() => {
    const set = new Set(presentToday);
    (Array.isArray(roster) ? roster : []).forEach(r => { if (r?.name) set.add(r.name); });
    (logs || []).forEach(l => {
      if (l?.worker && HK_WORKER_ACTIONS.has(l.action) && !["Recepcja", "HK", "System"].includes(l.worker)) set.add(l.worker);
    });
    return [...set];
  }, [presentToday, roster, logs]);
  // Popołudniówka obsługuje tylko pobyty (PG/PGZ) + BR/ZS, nie wyjazdy — wyklucz ją
  // z odbiorców rannego balansowania, by agent nie zrzucał jej cudzych wyjazdów.
  const excludeTo = React.useMemo(
    () => (afternoonPerson ? [afternoonPerson] : []),
    [afternoonPerson],
  );
  const agentSuggestions = React.useMemo(
    () => suggestReassignments({ assignments, roomStates: rooms, presentWorkers, excludeTo }).filter(s => !dismissedSug.includes(sugKey(s))),
    [assignments, rooms, presentWorkers, excludeTo, dismissedSug],
  );

  // Warstwa LLM: słowna uwaga do sugestii. Liczby liczone deterministycznie powyżej —
  // LLM tylko formułuje czytelną poradę. Pyta tylko, gdy zmieni się sytuacja (nie co render).
  const [aiNote, setAiNote] = React.useState("");
  const [aiNoteBusy, setAiNoteBusy] = React.useState(false);
  const aiNoteKeyRef = React.useRef("");
  React.useEffect(() => {
    if (!llmReady || agentSuggestions.length === 0) { setAiNote(""); aiNoteKeyRef.current = ""; return; }
    const key = agentSuggestions.map(sugKey).join("|");
    if (key === aiNoteKeyRef.current) return;
    aiNoteKeyRef.current = key;
    let cancelled = false;
    setAiNoteBusy(true);
    const stats = Object.values(workerStats(assignments, rooms, presentWorkers))
      .map(w => ({ worker: w.worker, total: w.total, done: w.done, cleaning: w.cleaning, waiting: w.waiting }));
    const sugg = agentSuggestions.map(s => ({ from: s.from, to: s.to, rooms: s.rooms }));
    roomAdvisor({ stats, suggestions: sugg })
      .then(t => { if (!cancelled) setAiNote(t || ""); })
      .catch(() => { if (!cancelled) setAiNote(""); })
      .finally(() => { if (!cancelled) setAiNoteBusy(false); });
    return () => { cancelled = true; };
  }, [agentSuggestions, assignments, rooms, presentWorkers]);
  const applySuggestion = async (s) => {
    const fromRooms = (assignments[s.from] || []).filter(r => !s.rooms.includes(r));
    const toRooms   = [...new Set([...(assignments[s.to] || []), ...s.rooms])];
    const newAssignments = { ...assignments, [s.from]: fromRooms, [s.to]: toRooms };
    const { error } = await supabase.from("hk_plan")
      .update({ assignments: newAssignments, updated_at: new Date().toISOString() }).eq("date", date);
    if (error) { showToast("Błąd zamiany: " + error.message, "error"); return; }
    await Promise.all(s.rooms.map(no =>
      supabase.from("hk_rooms").upsert({ date, room: no, worker: s.to, status: "W" }, { onConflict: "date,room" })));
    await supabase.from("hk_logs").insert({
      date, log_time: new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }),
      worker: employeeName || "Recepcja", action: "reassign", room: null, extra: `${s.from}→${s.to}: ${s.rooms.join(", ")}`,
    });
    // Zaktualizuj też lokalne źródło prawdy desktopu (hkData → localStorage), inaczej
    // okresowy sync App.jsx (co 5 min) nadpisałby hk_plan starym przydziałem i cofnął zamianę.
    if (setHkData && hkData && Object.keys(hkData).length > 0) {
      setHkData(prev => {
        const next = { ...prev };
        s.rooms.forEach(no => { if (next[no]) next[no] = { ...next[no], person: s.to }; });
        return next;
      });
    }
    dismissSwap(s);
    showToast(`Przeniesiono ${s.rooms.length} pok.: ${s.from} → ${s.to}`, "success");
  };

  // ─── Agent: prośby o pokój z telefonów (room_request) ──────────────────────
  // Z logów panelu wyłuskujemy nierozpatrzone prośby i typujemy zamianę (dawca →
  // proszący). markRequestHandled gasi też banner App-level (wspólny localStorage).
  const [handledReqTick, setHandledReqTick] = React.useState(0);
  const agentRequests = React.useMemo(() => {
    let handled = new Set();
    try { handled = new Set(JSON.parse(localStorage.getItem(`hk-agent-handled-${date}`) || "[]")); } catch {}
    return logs
      .filter(l => l.action === "room_request" && !handled.has(String(l.id)))
      .map(log => ({ log, suggestion: suggestForRequest({ requester: log.worker, assignments, roomStates: rooms }) }));
  }, [logs, assignments, rooms, date, handledReqTick]);

  const applyRequest = async ({ log, suggestion }) => {
    if (suggestion) await applySuggestion(suggestion);
    markRequestHandled(date, log.id);
    setHandledReqTick(t => t + 1);
  };
  const dismissRequest = ({ log }) => {
    markRequestHandled(date, log.id);
    setHandledReqTick(t => t + 1);
  };

  // ─── Otwarcie widgetu po kliknięciu powiadomienia Windows / bannera ────────
  const [agentOpenSignal, setAgentOpenSignal] = React.useState(0);
  React.useEffect(() => {
    const onFocus = () => { setActiveTab("monitor"); setAgentOpenSignal(s => s + 1); };
    window.addEventListener("cc-agent-focus", onFocus);
    return () => window.removeEventListener("cc-agent-focus", onFocus);
  }, []);

  return (
    <div className="hk-live-wrap cc-hkl-wrap">

      {/* ═══ TOPBAR — wg design-preview/v2/01-hk-live.html ═══ */}
      <header className="cc-hkl-topbar">
        <div className="cc-hkl-topbar-info">
          <div className="cc-hkl-crumb">
            <span className="cc-hkl-crumb-pill">Pokoje</span>
            <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
            <span>HK Live</span>
          </div>
          <h1 className="cc-hkl-title">
            Housekeeping na żywo
            <span className="v2-live-pill">Live · SSE 3737</span>
          </h1>
          <div className="cc-hkl-meta">
            <span>Pracownice: <b>{totalWorkersOnline}</b></span>
            <span>Pokoje: <b>{totalDone}/{totalRooms}</b></span>
            <span>Postęp: <b className="cc-hkl-meta-success">{progressPct}%</b></span>
            <span>Data: <b>{date}</b></span>
          </div>
        </div>

        {/* ═══ STATUS BAR — 5 stat cells na cc-* tokens ═══ */}
        <div className="cc-hkl-statbar" role="list" aria-label="Statystyki pokoi">
          {[
            ...(mailRooms != null ? [["Z maila", mailRooms, "info"]] : []),
            ["Czeka",      stats.W,            "wait"],
            ["W trakcie",  stats.czyszczenie,  "info"],
            ["Gotowe",     stats.czyste,       "success"],
            ["Puste",      totalVacated,       "warning"],
          ].map(([lbl, cnt, variant]) => (
            <div key={lbl} className={`cc-hkl-statcell cc-hkl-statcell--${variant}`} role="listitem">
              <div className="cc-hkl-statcell-badge" aria-hidden="true">
                <span className="cc-hkl-statcell-num">{cnt}</span>
              </div>
              <div className="cc-hkl-statcell-lbl">{lbl}</div>
            </div>
          ))}
        </div>
      </header>

      {/* Uwaga AI — słowne podsumowanie nierównowagi (liczby z agenta regułowego).
          „Analizuję…" celowo ukryte — LLM liczy w tle, karta pojawia się dopiero z gotowym tekstem. */}
      {llmReady && agentSuggestions.length > 0 && aiNote && (
        <div style={{ margin: "0 0 10px", padding: "10px 14px", borderRadius: 10, background: "var(--gold-bg, rgba(245,158,11,.08))", border: "1px solid var(--gold-border, rgba(245,158,11,.3))", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span aria-hidden="true" style={{ fontSize: 15 }}>🔮</span>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", color: "var(--amber, #b45309)", marginBottom: 2 }}>Uwaga AI</div>
            <div style={{ fontSize: 13.5, lineHeight: 1.5, color: "var(--text-primary)" }}>
              {aiNote}
            </div>
          </div>
        </div>
      )}

      {/* Sugestie zamian pokoi NIE renderują się tu jako osobny baner — pojawiają się
          wyłącznie w oknie bota (AgentBot popover/dymek). Logika agentSuggestions zostaje,
          bo zasila „Uwagę AI" powyżej oraz applySuggestion (zatwierdzanie z bota). */}

      {/* Body */}
      <div className="hk-live-body">
        {/* Sidebar — aubergine active state + glow */}
        <nav className="hk-live-sidebar cc-hkl-sidebar" role="tablist" aria-label="HK Live nawigacja">
          {TABS.map(tab => {
            const pendingCheckouts = tab.id === "monitor"
              ? HK_ALL.filter(r => (hkData?.[r.no]?.status === "W" || hkData?.[r.no]?.status === "WP") && !rooms[r.no]?.vacated).length
              : 0;
            const openTasks = tab.id === "zadania" ? tasks.filter(t => t.status === "open").length : 0;
            const openFound = tab.id === "znalezione" ? foundItems.filter(i => (i.status || "open") !== "returned").length : 0;
            const badge = pendingCheckouts > 0 ? pendingCheckouts : openTasks > 0 ? openTasks : openFound > 0 ? openFound : 0;
            const badgeVariant = tab.id === "monitor" ? "warning" : "brand";
            const isActive = activeTab === tab.id;
            const TabIc = tab.icon;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveTab(tab.id)}
                className={`hk-live-tab-btn cc-hkl-tab${isActive ? " cc-hkl-tab--active" : ""}`}>
                <span className="cc-hkl-tab-icon" aria-hidden="true"><TabIc size={15}/></span>
                <span className="hk-live-tab-label">{tab.label}</span>
                {badge > 0 && (
                  <span className={`cc-hkl-tab-badge cc-hkl-tab-badge--${badgeVariant}`}>{badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        {/* Content */}
        <div className="hk-live-content">
          {activeTab === "monitor"    && renderMonitor()}
          {activeTab === "zadania"    && renderZadania()}
          {activeTab === "pranie"     && renderPranie()}
          {activeTab === "pracownicy" && renderPracownicy()}
          {activeTab === "znalezione" && renderZnalezione()}
          {activeTab === "kontrole"   && renderKontrole()}
          {activeTab === "historia"   && renderHistoria()}
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

      {/* Bot agenta AI (FAB + popover) jest globalny — renderowany w App.jsx,
          stale widoczny w całym HK. Tu zostają tylko inline karty sugestii. */}
    </div>
  );
}

export default HKLivePanel;
