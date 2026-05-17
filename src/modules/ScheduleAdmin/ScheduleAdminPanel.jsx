import React, { useRef, useState, useEffect } from "react";
import { Calendar, ChevronLeft, ChevronRight, Download, Upload, Clock } from "lucide-react";
import {
  weekMonday, weekDays, dateKey, exportScheduleXlsx, importScheduleXlsx, SHIFT_CODE, normalizeToShift,
} from "../../lib/excel";
import { autoDetectShift, getScheduleDayEntry } from "../../lib/dates";
import { SHIFT_SHORT_LABELS, SHIFT_OPTIONS } from "../../lib/constants";

const SHIFT_COLORS = {
  poranna:      { bg: "#EFF6FF", color: "#1D4ED8", border: "#BFDBFE" },
  popoludniowa: { bg: "#FFF7ED", color: "#C2410C", border: "#FED7AA" },
  wieczorowa:   { bg: "#F5F3FF", color: "#6D28D9", border: "#DDD6FE" },
  dzienna:      { bg: "#F0FDF4", color: "#15803D", border: "#BBF7D0" },
  nocna:        { bg: "#0F172A", color: "#94A3B8", border: "#1E293B" },
};

const DAY_PL_FULL = ["Poniedzialek", "Wtorek", "Sroda", "Czwartek", "Piatek", "Sobota", "Niedziela"];
const DAY_PL_SHORT = ["Pon", "Wt", "Sr", "Cz", "Pt", "Sb", "Nd"];

function CellInput({ value, onCommit, colors, shiftCode }) {
  const [local, setLocal] = useState(value || "");
  useEffect(() => { setLocal(value || ""); }, [value]);
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
      <input
        type="text"
        value={local}
        onChange={e => setLocal(e.target.value)}
        onBlur={() => onCommit(local.trim())}
        onKeyDown={e => { if (e.key === "Enter") e.target.blur(); }}
        placeholder="7-15"
        style={{
          fontSize: 11.5,
          fontWeight: local ? 700 : 400,
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
      {shiftCode && (
        <span style={{ fontSize: 9.5, fontWeight: 700, color: colors?.color, lineHeight: 1 }}>
          {shiftCode}
        </span>
      )}
    </div>
  );
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

function displayScheduleValue(raw) {
  if (!raw || typeof raw !== "object") return raw || "";
  const start = raw.start ?? raw.startTime ?? raw.start_time ?? raw.from ?? raw.from_time;
  const end = raw.end ?? raw.endTime ?? raw.end_time ?? raw.to ?? raw.to_time;
  if (start || end) return [start, end].filter(Boolean).join("-");
  const shiftKey = normalizeToShift(raw);
  return shiftKey ? (SHIFT_CODE[shiftKey] || shiftKey) : "";
}

export default function ScheduleAdminPanel({ schedule, setSchedule, employees, dark, showToast }) {
  const [monday, setMonday] = useState(() => weekMonday());
  const fileRef = useRef(null);

  const days = weekDays(monday);
  const todayStr = dateKey(new Date());
  const activeShift = autoDetectShift();

  const getShiftEntry = (day, emp) => getScheduleDayEntry(schedule, emp, day);
  const getShift = (day, emp) => displayScheduleValue(getShiftEntry(day, emp)?.raw);

  const setShift = (day, emp, value) => {
    const dk = dateKey(day);
    const existingKey = getShiftEntry(day, emp)?.employeeKey;
    setSchedule(prev => {
      const nextDay = { ...(prev[dk] || {}) };
      if (existingKey && existingKey !== emp) delete nextDay[existingKey];
      nextDay[emp] = value || null;
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
      setSchedule(prev => {
        const merged = { ...prev };
        for (const [dk, dayData] of Object.entries(imported)) {
          merged[dk] = { ...(merged[dk] || {}), ...dayData };
        }
        return merged;
      });
      showToast && showToast("Grafik zaimportowany.", "success");
    } catch (err) {
      showToast && showToast("Blad importu: " + err.message, "error");
    }
    e.target.value = "";
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
                    const rawVal = getShift(d, emp);
                    const shiftKey = normalizeToShift(rawVal);
                    const c = shiftKey ? SHIFT_COLORS[shiftKey] : null;
                    return (
                      <td key={dk} style={cellStyle(dark, isToday, !!shiftKey)}>
                        <CellInput
                          value={rawVal}
                          onCommit={val => setShift(d, emp, val)}
                          colors={c}
                          shiftCode={shiftKey ? SHIFT_CODE[shiftKey] : null}
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
