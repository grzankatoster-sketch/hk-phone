import React, { useRef, useState, useEffect } from "react";
import { Calendar, ChevronLeft, ChevronRight, Download, Upload, Clock } from "lucide-react";
import {
  weekMonday, weekDays, dateKey, exportScheduleXlsx, importScheduleXlsx, readScheduleGrid, SHIFT_CODE, parseHoursToShift,
} from "../../lib/excel";
import { parseScheduleWithAI, llmReady } from "../../lib/llm";
import { autoDetectShift, getScheduleDayEntry } from "../../lib/dates";
import { SHIFT_SHORT_LABELS, SHIFT_OPTIONS, TENANT_ID } from "../../lib/constants";
import { supabase } from "../../lib/supabase";

const SHIFT_COLORS = {
  poranna:      { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" },
  popoludniowa: { bg: "#FFF7ED", color: "#C2410C", border: "#FED7AA" },
  wieczorowa:   { bg: "#F5F3FF", color: "#6D28D9", border: "#DDD6FE" },
  dzienna:      { bg: "#F0FDF4", color: "#15803D", border: "#BBF7D0" },
  nocna:        { bg: "#0F172A", color: "#94A3B8", border: "#1E293B" },
};

const DAY_PL_FULL = ["Poniedzialek", "Wtorek", "Sroda", "Czwartek", "Piatek", "Sobota", "Niedziela"];
const DAY_PL_SHORT = ["Pon", "Wt", "Sr", "Cz", "Pt", "Sb", "Nd"];

// Hours + manual shift selection. The manager types the working hours and picks
// the shift type from the dropdown (the type is suggested from the hours but the
// manager always has the final say — morning shifts can be 7-14, 7-15, 7-16, …).
function CellInput({ hours, shiftKey, onCommit, colors }) {
  const [h, setH] = useState(hours || "");
  const [s, setS] = useState(shiftKey || "");
  useEffect(() => { setH(hours || ""); }, [hours]);
  useEffect(() => { setS(shiftKey || ""); }, [shiftKey]);

  const handleHoursBlur = () => {
    const trimmed = h.trim();
    let nextShift = s;
    // Suggest a shift only when the manager hasn't chosen one yet.
    if (!s && trimmed) {
      const guess = parseHoursToShift(trimmed);
      if (guess) { nextShift = guess; setS(guess); }
    }
    onCommit(trimmed, nextShift);
  };

  const handleShiftChange = (e) => {
    setS(e.target.value);
    onCommit(h.trim(), e.target.value);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 3 }}>
      <input
        type="text"
        value={h}
        onChange={e => setH(e.target.value)}
        onBlur={handleHoursBlur}
        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
        placeholder="7-15"
        style={{
          fontSize: 11.5,
          fontWeight: h ? 700 : 400,
          border: `1px solid ${colors ? colors.border : "var(--border-light)"}`,
          borderRadius: 6,
          background: colors ? colors.bg : "transparent",
          color: colors ? colors.color : "var(--text-muted)",
          padding: "3px 5px",
          width: "100%",
          outline: "none",
          textAlign: "center",
          minWidth: 62,
        }}
      />
      <select
        value={s}
        onChange={handleShiftChange}
        title="Wybierz zmianę"
        style={{
          fontSize: 10,
          fontWeight: s ? 700 : 400,
          border: `1px solid ${colors ? colors.border : "var(--border-light)"}`,
          borderRadius: 6,
          background: colors ? colors.bg : "var(--bg-card)",
          color: colors ? colors.color : "var(--text-muted)",
          padding: "2px 3px",
          width: "100%",
          outline: "none",
          textAlign: "center",
          cursor: "pointer",
        }}
      >
        <option value="">— zmiana —</option>
        {SHIFT_OPTIONS.map(opt => (
          <option key={opt} value={opt}>{SHIFT_CODE[opt]} · {opt}</option>
        ))}
      </select>
    </div>
  );
}

// Extracts the working-hours text ("15-22") from a raw schedule entry, ignoring
// entries that only store a shift key/code.
function rawHours(raw) {
  if (!raw) return "";
  if (typeof raw === "object") {
    const start = raw.start ?? raw.startTime ?? raw.start_time ?? raw.from ?? raw.from_time;
    const end = raw.end ?? raw.endTime ?? raw.end_time ?? raw.to ?? raw.to_time;
    return [start, end].filter(Boolean).join("-");
  }
  const s = String(raw);
  return /\d\s*[-–—]\s*\d/.test(s) ? s : "";
}

function shiftBadge(shift) {
  if (!shift) return null;
  const c = SHIFT_COLORS[shift] || {};
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, padding: "1px 7px", borderRadius: 999,
      background: c.bg, color: c.color, border: `1px solid ${c.border}`,
      letterSpacing: ".04em",
    }}>
      {SHIFT_CODE[shift] || shift}
    </span>
  );
}

export default function ScheduleAdminPanel({ schedule, setSchedule, employees, dark, showToast }) {
  const [monday, setMonday] = useState(() => weekMonday());
  const fileRef = useRef(null);

  const days = weekDays(monday);
  const todayStr = dateKey(new Date());
  const activeShift = autoDetectShift();

  const getShiftEntry = (day, emp) => getScheduleDayEntry(schedule, emp, day);

  const setShift = (day, emp, hours, shift) => {
    const dk = dateKey(day);
    const existingKey = getShiftEntry(day, emp)?.employeeKey;
    setSchedule(prev => {
      const nextDay = { ...(prev[dk] || {}) };
      if (existingKey && existingKey !== emp) delete nextDay[existingKey];
      const h = (hours || "").trim();
      if (!h && !shift) {
        nextDay[emp] = null;
      } else {
        const parts = h.split(/\s*[-–—]\s*/);
        nextDay[emp] = { start: parts[0] || "", end: parts[1] || "", shift: shift || null };
      }
      return {
        ...prev,
        [dk]: nextDay,
      };
    });
  };

  const prevWeek = () => {
    const d = new Date(monday);
    d.setDate(d.getDate() - 7);
    setMonday(d);
  };
  const nextWeek = () => {
    const d = new Date(monday);
    d.setDate(d.getDate() + 7);
    setMonday(d);
  };
  const goToday = () => setMonday(weekMonday());

  const handleExport = () => {
    try {
      exportScheduleXlsx(monday, schedule, employees);
      showToast && showToast("Grafik wyeksportowany.", "success");
    } catch {
      showToast && showToast("Blad eksportu.", "error");
    }
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importScheduleXlsx(file);
      let result = imported;
      // Fallback AI: gdy standardowy parser nic nie rozczytał (niestandardowy format),
      // odczytaj siatkę przez AI. Wynik ZAWSZE do weryfikacji przez kierownika.
      if (Object.keys(imported).length === 0 && llmReady) {
        showToast && showToast("Niestandardowy format — czytam grafik przez AI…", "info");
        try {
          const grid = await readScheduleGrid(file);
          const ai = await parseScheduleWithAI(grid);
          if (ai && Object.keys(ai).length) {
            result = ai;
            showToast && showToast("Grafik odczytany przez AI — ZWERYFIKUJ poprawność godzin!", "warning");
          }
        } catch { /* zostaje pusty wynik standardowego parsera */ }
      }
      setSchedule(prev => {
        const merged = { ...prev };
        for (const [dk, dayData] of Object.entries(result)) {
          merged[dk] = { ...(merged[dk] || {}), ...dayData };
        }
        return merged;
      });
      if (Object.keys(result).length) showToast && showToast("Grafik zaimportowany.", "success");
      else showToast && showToast("Nie udało się rozczytać grafiku.", "error");
    } catch (err) {
      showToast && showToast("Blad importu: " + err.message, "error");
    }
    e.target.value = "";
  };

  // Pobierz propozycję grafiku przygotowaną w panelu menedżerów (AI) i scal z grafikiem.
  const importFromPanel = async () => {
    if (!supabase) { showToast && showToast("Brak połączenia z chmurą.", "error"); return; }
    try {
      const { data } = await supabase.from("panel_mirror").select("data")
        .eq("tenant_id", TENANT_ID).eq("kind", "proposed_schedule").maybeSingle();
      const prop = data && data.data;
      if (!prop || !Object.keys(prop).length) { showToast && showToast("Brak propozycji z panelu.", "info"); return; }
      setSchedule(prev => {
        const merged = { ...prev };
        for (const [dk, day] of Object.entries(prop)) merged[dk] = { ...(merged[dk] || {}), ...day };
        return merged;
      });
      showToast && showToast("Wczytano propozycję grafiku z panelu — zweryfikuj i zapisz.", "success");
    } catch {
      showToast && showToast("Nie udało się pobrać propozycji.", "error");
    }
  };

  // Today summary — who works each shift today
  const todayByShift = {};
  for (const emp of employees) {
    const shiftKey = getShiftEntry(new Date(), emp)?.shift;
    if (!shiftKey) continue;
    if (!todayByShift[shiftKey]) todayByShift[shiftKey] = [];
    todayByShift[shiftKey].push(emp);
  }
  const activeEmps = todayByShift[activeShift] || [];

  const mondayEnd = days[6];
  const weekLabel = `${dateKey(monday)} – ${dateKey(mondayEnd)}`;

  return (
    <div className="stack">
      {/* Today card */}
      <div className="panel glass dark-panel" style={{ padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Clock size={15} style={{ color: "var(--plum)" }} />
            <span style={{ fontSize: 13, fontWeight: 700 }}>Teraz aktywna zmiana:</span>
            {shiftBadge(activeShift)}
            <span style={{ fontSize: 12.5, color: "var(--text-muted)" }}>
              {SHIFT_SHORT_LABELS[activeShift]}
            </span>
          </div>
          <div style={{ fontSize: 12.5, color: "var(--text-muted)" }}>Dzisiaj: {todayStr}</div>
        </div>
        {activeEmps.length > 0 ? (
          <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
            <span style={{ fontSize: 12, color: "var(--text-muted)", alignSelf: "center" }}>Na zmianie:</span>
            {activeEmps.map(emp => (
              <span key={emp} style={{
                fontSize: 12.5, fontWeight: 700, padding: "3px 10px", borderRadius: 999,
                background: "var(--plum-soft)", color: "var(--plum)", border: "1px solid var(--plum-border)",
              }}>{emp}</span>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 10, fontSize: 12, color: "var(--text-muted)" }}>
            Brak przypisanych pracownikow na aktywna zmiane w harmonogramie.
          </div>
        )}
      </div>

      {/* Week nav + actions */}
      <div className="panel glass dark-panel" style={{ padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
          <div className="panel-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            <Calendar size={15} /> Grafik tygodniowy
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginLeft: "auto", flexWrap: "wrap", justifyContent: "flex-end" }}>
            <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 12 }} onClick={prevWeek}>
              <ChevronLeft size={13} />
            </button>
            <span style={{ fontSize: 12.5, fontWeight: 600, minWidth: "clamp(8.5rem, 24vw, 11.875rem)", textAlign: "center" }}>{weekLabel}</span>
            <button className="btn btn-outline" style={{ padding: "4px 10px", fontSize: 12 }} onClick={nextWeek}>
              <ChevronRight size={13} />
            </button>
            <button className="btn btn-outline" style={{ fontSize: 12, marginLeft: 4 }} onClick={goToday}>
              Dzisiaj
            </button>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={handleExport}>
              <Download size={12} /> Export XLSX
            </button>
            <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => fileRef.current?.click()}>
              <Upload size={12} /> Import XLSX
            </button>
            <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={importFromPanel} title="Wczytaj propozycję grafiku z panelu menedżerów">
              <Download size={12} /> Pobierz z panelu
            </button>
            <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: "none" }} onChange={handleImport} />
          </div>
        </div>

        {/* Schedule table */}
          <div style={{ overflowX: "auto" }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
            <thead>
              <tr>
                <th style={thStyle(dark, false)}>Pracownik</th>
                {days.map((d, i) => {
                  const dk = dateKey(d);
                  const isToday = dk === todayStr;
                  return (
                    <th key={dk} style={thStyle(dark, isToday)}>
                      <div style={{ fontWeight: 700, fontSize: 11.5 }}>{DAY_PL_SHORT[i]}</div>
                      <div style={{ fontWeight: 400, fontSize: 10.5, opacity: .75 }}>{dk.slice(5)}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {employees.map((emp, ri) => (
                <tr key={emp}>
                  <td style={empCellStyle(dark, ri)}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{emp}</span>
                  </td>
                  {days.map((d) => {
                    const dk = dateKey(d);
                    const isToday = dk === todayStr;
                    const entry = getShiftEntry(d, emp);
                    const shiftKey = entry?.shift || null;
                    const hours = rawHours(entry?.raw);
                    const c = shiftKey ? SHIFT_COLORS[shiftKey] : null;
                    return (
                      <td key={dk} style={cellStyle(dark, isToday, !!shiftKey)}>
                        <CellInput
                          hours={hours}
                          shiftKey={shiftKey}
                          onCommit={(hh, ss) => setShift(d, emp, hh, ss)}
                          colors={c}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div style={{ marginTop: 12, display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Legenda:</span>
          {SHIFT_OPTIONS.map(s => {
            const c = SHIFT_COLORS[s] || {};
            return (
              <span key={s} style={{
                fontSize: 10.5, padding: "2px 8px", borderRadius: 999, fontWeight: 600,
                background: c.bg, color: c.color, border: `1px solid ${c.border}`,
              }}>
                {SHIFT_CODE[s]} — {s}
              </span>
            );
          })}
        </div>
      </div>

      {/* All shifts today summary */}
      <div className="panel glass dark-panel" style={{ padding: "14px 18px" }}>
        <div className="panel-title" style={{ margin: 0, marginBottom: 12, fontSize: 13 }}>
          <Calendar size={14} /> Rozpisanie dzisiaj ({todayStr})
        </div>
        {SHIFT_OPTIONS.some(s => todayByShift[s]?.length) ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {SHIFT_OPTIONS.map(s => {
              const emps = todayByShift[s];
              if (!emps?.length) return null;
              const c = SHIFT_COLORS[s] || {};
              const isActive = s === activeShift;
              return (
                <div key={s} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "8px 12px",
                  borderRadius: 8, border: `1px solid ${c.border}`,
                  background: isActive ? c.bg : "transparent",
                  boxShadow: isActive ? `0 0 0 2px ${c.border}` : "none",
                }}>
                  <span style={{
                    fontSize: 11, fontWeight: 800, padding: "2px 8px", borderRadius: 999,
                    background: c.bg, color: c.color, border: `1px solid ${c.border}`, minWidth: 28, textAlign: "center",
                  }}>{SHIFT_CODE[s]}</span>
                  <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 140 }}>{SHIFT_SHORT_LABELS[s]}</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                    {emps.map(emp => (
                      <span key={emp} style={{
                        fontSize: 12, fontWeight: 600, padding: "2px 9px", borderRadius: 999,
                        background: "var(--bg-card)", border: "1px solid var(--border-light)",
                      }}>{emp}</span>
                    ))}
                  </div>
                  {isActive && (
                    <span style={{ marginLeft: "auto", fontSize: 10.5, color: c.color, fontWeight: 700 }}>
                      TERAZ AKTYWNA
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="empty-box empty-box-dark">Brak przypisanych zmian na dzisiaj.</div>
        )}
      </div>
    </div>
  );
}

function thStyle(dark, isToday) {
  return {
    padding: "8px 10px",
    fontSize: 12,
    textAlign: "center",
    fontWeight: 600,
    borderBottom: "2px solid var(--border-light)",
    background: isToday
      ? "var(--plum-soft, rgba(109,40,217,.10))"
      : "transparent",
    color: isToday ? "var(--plum)" : "var(--text-muted)",
    whiteSpace: "nowrap",
  };
}

function empCellStyle(dark, ri) {
  return {
    padding: "8px 12px",
    borderBottom: "1px solid var(--border-light)",
    background: ri % 2 === 0 ? "transparent" : "rgba(0,0,0,.03)",
    whiteSpace: "nowrap",
    minWidth: 110,
  };
}

function cellStyle(dark, isToday, hasShift) {
  return {
    padding: "6px 6px",
    textAlign: "center",
    borderBottom: "1px solid var(--border-light)",
    borderLeft: isToday ? "2px solid var(--plum-border, #c4b5fd)" : "none",
    borderRight: isToday ? "2px solid var(--plum-border, #c4b5fd)" : "none",
    background: isToday
      ? "var(--plum-soft, rgba(109,40,217,.06))"
      : "transparent",
    minWidth: 100,
  };
}
