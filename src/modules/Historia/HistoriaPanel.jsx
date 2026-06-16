import React from "react";
import { Calendar, AlertTriangle, Banknote, Home, Sparkles, Bell, ArrowLeftRight, ChevronDown } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { TENANT_ID, SHIFT_LABELS_PL, SHIFT_SHORT_LABELS } from "../../lib/constants";
import { fmtMoney } from "../../lib/format";
import { summarizeHistory, llmReady } from "../../lib/llm";
import { loadJson, STORAGE_KEYS } from "../../lib/storage";

const todayStr = () => new Date().toISOString().split("T")[0];
const money = (v) => (v === null || v === undefined || v === "" ? "—" : fmtMoney(Number(v) || 0));

// Lokalny klucz dnia (YYYY-MM-DD) z dowolnej daty ISO — by porównanie nie psuło się przez UTC.
function localDayKey(d) {
  const dt = new Date(d);
  if (isNaN(dt)) return "";
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

// Klucz dnia z polskiego formatu fmtA: "DD.MM.YYYY, HH:MM".
function plDayKey(s) {
  if (!s) return "";
  const datePart = String(s).split(",")[0].trim();
  const [d, m, y] = datePart.split(".");
  if (!d || !m || !y) return "";
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// Zwijana sekcja: nagłówek (ikona + tytuł + licznik) przełącza rozwinięcie po kliknięciu.
function Section({ icon, title, count, defaultOpen = true, children }) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="panel">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="panel-title"
        style={{ width: "100%", background: "none", border: "none", padding: 0, font: "inherit", color: "inherit", cursor: "pointer", textAlign: "left", marginBottom: open ? 14 : 0 }}
      >
        {icon}
        <span style={{ flex: 1 }}>{title}{typeof count === "number" ? ` (${count})` : ""}</span>
        <ChevronDown size={16} style={{ transition: "transform .2s", transform: open ? "rotate(180deg)" : "none", color: "var(--text-muted)", flexShrink: 0 }} />
      </button>
      {open && children}
    </div>
  );
}

// Zwięzłe podsumowanie raportu pokoju (pościel + dodatkowe) z pola report (jsonb).
function roomReportSummary(report) {
  if (!report || typeof report !== "object") return "";
  const parts = [];
  for (const [k, v] of Object.entries(report)) {
    if (k === "extraItems") continue;
    if (v === true) parts.push(k);
    else if (typeof v === "number" && v > 0) parts.push(`${k}: ${v}`);
    else if (typeof v === "string" && v.trim()) parts.push(`${k}: ${v}`);
  }
  const extra = Array.isArray(report.extraItems) ? report.extraItems : [];
  for (const e of extra) parts.push(typeof e === "string" ? e : (e?.text || e?.name || ""));
  return parts.filter(Boolean).join(" · ");
}

const ROOM_BADGE = {
  czyste: { t: "Posprzątany", c: "var(--emerald,#059669)" },
  czyszczenie: { t: "W trakcie", c: "var(--sky,#0284c7)" },
  "pominięte": { t: "Pominięty", c: "var(--plum,#7c3aed)" },
  W: { t: "Czeka", c: "var(--text-muted,#64748b)" },
};

export default function HistoriaPanel({ dark, canSeeCash = false }) {
  const [day, setDay] = React.useState(todayStr());
  const [reports, setReports] = React.useState([]);
  const [rooms, setRooms] = React.useState([]);
  const [faults, setFaults] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [summary, setSummary] = React.useState("");
  const [sumBusy, setSumBusy] = React.useState(false);
  const [sumErr, setSumErr] = React.useState("");

  React.useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let stop = false;
    setLoading(true); setSummary(""); setSumErr("");
    const dayStart = new Date(day + "T00:00:00").toISOString();
    const dayEnd = new Date(day + "T23:59:59").toISOString();
    Promise.all([
      supabase.from("shift_reports").select("*").eq("tenant_id", TENANT_ID).eq("day_key", day).order("saved_at"),
      supabase.from("hk_rooms").select("room,worker,status,report,done_at").eq("date", day),
      supabase.from("faults").select("*").eq("tenant_id", TENANT_ID).gte("reported_at", dayStart).lte("reported_at", dayEnd).order("reported_at"),
    ]).then(([r1, r2, r3]) => {
      if (stop) return;
      setReports(r1.data || []); setRooms(r2.data || []); setFaults(r3.data || []);
      setLoading(false);
    }).catch(() => { if (!stop) setLoading(false); });
    return () => { stop = true; };
  }, [day]);

  const runSummary = async () => {
    if (sumBusy) return;
    setSumBusy(true); setSumErr(""); setSummary("");
    try {
      const payload = {
        day,
        // Kasa trafia do podsumowania tylko dla kierownika.
        reports: reports.map(r => canSeeCash
          ? ({ shift: SHIFT_LABELS_PL[r.shift_key] || r.shift_key, employee: r.employee, cash_closing: r.cash_closing, safe_total: r.safe_total, tasks_done: r.tasks_done, tasks_total: r.tasks_total, handover: r.handover })
          : ({ shift: SHIFT_LABELS_PL[r.shift_key] || r.shift_key, employee: r.employee, tasks_done: r.tasks_done, tasks_total: r.tasks_total, handover: r.handover })),
        rooms_done: rooms.filter(r => r.status === "czyste").length,
        rooms_total: rooms.length,
        faults: faults.map(f => ({ room: f.room || f.space_id, source: f.source, status: f.status, desc: f.description })),
      };
      const t = await summarizeHistory(payload);
      setSummary(t || "Brak danych do podsumowania.");
    } catch (e) {
      setSumErr(e?.code === "rate_limited" ? "Limit zapytań — spróbuj za chwilę." : "Podsumowanie niedostępne.");
    } finally { setSumBusy(false); }
  };

  const cleaned = rooms.filter(r => r.status === "czyste").length;
  const hkFaults = faults.filter(f => f.source === "hk").length;
  const recFaults = faults.filter(f => f.source !== "hk").length;

  // Powiadomienia (alerty kierownictwa) i przekazania zadań z lokalnego logu — filtrowane po wybranym dniu.
  const dayAlerts = React.useMemo(
    () => loadJson(STORAGE_KEYS.managerAlerts, [])
      .filter(a => localDayKey(a.created_at) === day)
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at)),
    [day],
  );
  const dayHandover = React.useMemo(
    () => loadJson(STORAGE_KEYS.handoverLog, []).filter(h => plDayKey(h.createdAt) === day),
    [day],
  );

  if (!supabase) {
    return <div className="empty-box">Historia wymaga połączenia z Supabase.</div>;
  }

  return (
    <div className="stack">
      {/* Pasek: data + AI */}
      <div className="panel" style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div className="panel-title" style={{ marginBottom: 0, flex: 1 }}><Calendar size={16} /> Historia dnia</div>
        <input className="input" type="date" value={day} max={todayStr()} onChange={e => setDay(e.target.value)} style={{ width: 170 }} />
        {llmReady && (
          <button className="btn btn-gold" style={{ fontSize: 12.5 }} onClick={runSummary} disabled={sumBusy || loading}>
            <Sparkles size={14} /> {sumBusy ? "Podsumowuję…" : "Podsumuj dzień AI"}
          </button>
        )}
      </div>

      {sumErr && <div className="panel" style={{ color: "var(--rose)" }}>{sumErr}</div>}
      {summary && (
        <div className="panel" style={{ borderLeft: "4px solid var(--gold)", background: "var(--gold-bg)" }}>
          <div className="panel-title" style={{ marginBottom: 6 }}><Sparkles size={15} style={{ color: "var(--gold)" }} /> Podsumowanie dnia</div>
          <div style={{ fontSize: 13.5, lineHeight: 1.6, whiteSpace: "pre-wrap", color: "var(--text-primary)" }}>{summary}</div>
        </div>
      )}

      {loading && <div className="empty-box">Ładowanie…</div>}

      {!loading && (
        <>
          {/* Raporty zmian + kasa */}
          <Section icon={<Banknote size={16} />} title={`Raporty zmian${canSeeCash ? " — kasa" : ""}`} count={reports.length}>
            {reports.length === 0 ? <div className="tiny muted">Brak raportów zmian dla tego dnia.</div> : (
              <div className="stack" style={{ marginTop: 8 }}>
                {reports.map(r => (
                  <div key={r.id} className="simple-row" style={{ display: "grid", gap: 4 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <strong>{SHIFT_LABELS_PL[r.shift_key] || r.shift_key} · {r.employee || "—"}</strong>
                      <span className="tiny muted">Zadania: {r.tasks_done ?? "—"}/{r.tasks_total ?? "—"}</span>
                    </div>
                    {canSeeCash && (
                      <div className="tiny" style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                        <span>Kasa końcowa: <b>{money(r.cash_closing)}</b></span>
                        <span>W sejfie: <b>{money(r.safe_total)}</b></span>
                        <span>Na start: {money(r.cash_opening)}</span>
                      </div>
                    )}
                    {r.handover && <div className="tiny muted">📝 {r.handover}</div>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Sprzątanie — domyślnie zwinięte, rozwijane po kliknięciu */}
          <Section icon={<Home size={16} />} title={`Sprzątanie — raporty pokojowych (${cleaned}/${rooms.length})`} defaultOpen={false}>
            {rooms.length === 0 ? <div className="tiny muted">Brak danych sprzątania dla tego dnia.</div> : (
              <div className="stack" style={{ marginTop: 8 }}>
                {rooms.slice().sort((a, b) => String(a.room).localeCompare(String(b.room), "pl", { numeric: true })).map(r => {
                  const b = ROOM_BADGE[r.status] || ROOM_BADGE.W;
                  const sum = roomReportSummary(r.report);
                  return (
                    <div key={r.room} className="simple-row" style={{ display: "grid", gap: 3 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                        <strong>Pokój {r.room}{r.worker ? ` · ${r.worker}` : ""}</strong>
                        <span style={{ fontSize: 11, fontWeight: 800, color: b.c }}>{b.t}</span>
                      </div>
                      {sum && <div className="tiny muted">{sum}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* Powiadomienia (alerty kierownictwa) */}
          <Section icon={<Bell size={16} />} title="Powiadomienia" count={dayAlerts.length}>
            {dayAlerts.length === 0 ? <div className="tiny muted">Brak powiadomień z tego dnia.</div> : (
              <div className="stack" style={{ marginTop: 8 }}>
                {dayAlerts.map(a => (
                  <div key={a.id} className="simple-row" style={{ display: "grid", gap: 3 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <strong>{a.title || "Informacja"}</strong>
                      <span className="tiny" style={{ fontWeight: 700, color: a.priority === "urgent" ? "var(--rose)" : "var(--text-muted)" }}>
                        {a.priority === "urgent" ? "PILNE" : (a.created_by || "Kierownik")}
                      </span>
                    </div>
                    {a.body && <div className="tiny muted">{a.body}</div>}
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Przekazywanie zadań */}
          <Section icon={<ArrowLeftRight size={16} />} title="Przekazywanie zadań" count={dayHandover.length}>
            {dayHandover.length === 0 ? <div className="tiny muted">Brak przekazań z tego dnia.</div> : (
              <div className="stack" style={{ marginTop: 8 }}>
                {dayHandover.map(h => (
                  <div key={h.id} className="simple-row" style={{ display: "grid", gap: 3 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <strong>{h.from || "—"} → {SHIFT_SHORT_LABELS[h.toShift] || h.toShift || "wszystkie"}</strong>
                      <span className="tiny" style={{ fontWeight: 700, color: h.type === "reminder" ? "var(--sky,#0284c7)" : "var(--emerald,#059669)" }}>
                        {h.type === "reminder" ? "Przypomnienie" : "Zadanie"}
                      </span>
                    </div>
                    <div className="tiny muted">{h.text}</div>
                    <div className="tiny muted">Ze zmiany: {SHIFT_SHORT_LABELS[h.fromShift] || h.fromShift || "—"} · {h.createdAt}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Usterki */}
          <Section icon={<AlertTriangle size={16} />} title={`Usterki (${faults.length}) · HK: ${hkFaults} · recepcja: ${recFaults}`}>
            {faults.length === 0 ? <div className="tiny muted">Brak usterek zgłoszonych tego dnia.</div> : (
              <div className="stack" style={{ marginTop: 8 }}>
                {faults.map(f => (
                  <div key={f.id} className="simple-row" style={{ display: "grid", gap: 3 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}>
                      <strong>{f.room || f.space_id || "—"}</strong>
                      <span className="tiny" style={{ fontWeight: 700 }}>
                        {f.source === "hk" ? "HK" : "Recepcja"} · {f.status === "done" ? "naprawione" : f.status === "in_progress" ? "w toku" : "otwarte"}
                      </span>
                    </div>
                    <div className="tiny muted">{f.description}{f.reported_by ? ` — ${f.reported_by}` : ""}</div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
