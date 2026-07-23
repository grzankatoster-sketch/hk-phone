import React from "react";
import { AlarmClock, Plus, Check, Trash2 } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { todayKey } from "../../lib/dates";

// Budziki / wake-up calls (WYKONANIE 4.6). Luka recepcji nocnej — nic tego nie
// pokrywa. Wzorzec jak datedReminders (localStorage-first; wjedzie do Supabase z 2.9).
// Czas krytyczny → gdy budzenie nadejdzie, odpalamy natywne powiadomienie Windows
// (window.electronAPI.notify) raz na pozycję, plus wizualne „⏰ TERAZ".
const nowHM = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
const toMin = (hm) => { const [h, m] = String(hm || "").split(":").map(Number); return (h || 0) * 60 + (m || 0); };

export default function WakeUpsCard({ employeeName, showToast }) {
  const [items, setItems] = React.useState(() => loadJson(STORAGE_KEYS.wakeUps, []));
  const [room, setRoom] = React.useState("");
  const [time, setTime] = React.useState("");
  const [guest, setGuest] = React.useState("");
  const [, tick] = React.useReducer((x) => x + 1, 0);
  const itemsRef = React.useRef(items);
  itemsRef.current = items;

  const persist = (next) => { setItems(next); saveJson(STORAGE_KEYS.wakeUps, next); };

  // Co 30s: odśwież widok („TERAZ") i odpal natywne powiadomienie dla budzeń,
  // które właśnie nadeszły (czas ≤ teraz), jeszcze niewykonanych i niepowiadomionych.
  React.useEffect(() => {
    const check = () => {
      tick();
      const today = todayKey();
      const cur = nowHM();
      let changed = false;
      const next = itemsRef.current.map((i) => {
        if (i.date === today && !i.done && !i.notified && toMin(i.time) <= cur) {
          changed = true;
          try { window.electronAPI?.notify?.({ title: "⏰ Budzenie", body: `Pokój ${i.room}${i.guest ? " · " + i.guest : ""} — godz. ${i.time}` }); } catch { /* brak desktopu */ }
          return { ...i, notified: true };
        }
        return i;
      });
      if (changed) persist(next);
    };
    check();
    const t = setInterval(check, 30000);
    return () => clearInterval(t);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const add = () => {
    if (!room.trim() || !time) return;
    const it = { id: crypto.randomUUID(), date: todayKey(), time, room: room.trim(), guest: guest.trim(), done: false, notified: false, createdBy: employeeName || "recepcja", createdAt: new Date().toISOString() };
    persist([it, ...items]); setRoom(""); setTime(""); setGuest("");
    showToast?.(`Budzenie dodane: pokój ${it.room} o ${it.time}.`, "success");
  };
  const toggle = (id) => persist(items.map((i) => i.id === id ? { ...i, done: !i.done, doneBy: !i.done ? (employeeName || "recepcja") : null, doneAt: !i.done ? new Date().toISOString() : null } : i));
  const remove = (id) => persist(items.filter((i) => i.id !== id));

  const today = todayKey();
  const todays = items.filter((i) => i.date === today).sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0) || toMin(a.time) - toMin(b.time));
  const cur = nowHM();

  return (
    <div className="panel glass dark-panel">
      <div className="panel-title"><AlarmClock size={16} /> Budziki (wake-up)</div>
      <div className="tiny muted-light" style={{ marginBottom: 10, marginTop: -6 }}>Budzenia na dziś. Odhacz po wykonaniu — zapisze kto i kiedy. O ustalonej godzinie wyskoczy powiadomienie.</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input className="input dark-input" style={{ width: 90 }} placeholder="Pokój" value={room} onChange={(e) => setRoom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <input className="input dark-input" style={{ width: 120 }} type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        <input className="input dark-input" style={{ flex: 1, minWidth: 120 }} placeholder="Gość (opcjonalnie)" value={guest} onChange={(e) => setGuest(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn-gold" onClick={add}><Plus size={13} /> Dodaj</button>
      </div>
      {!todays.length ? (
        <div className="tiny muted-light">Brak budzeń na dziś.</div>
      ) : (
        <div className="stack">
          {todays.map((i) => {
            const due = !i.done && toMin(i.time) - cur <= 15;
            return (
              <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: "var(--radius-md)", opacity: i.done ? 0.55 : 1, background: i.done ? "rgba(255,255,255,.03)" : due ? "rgba(220,38,38,.12)" : "rgba(255,255,255,.05)", border: `1px solid ${due && !i.done ? "rgba(220,38,38,.32)" : "var(--dark-border)"}` }}>
                <button onClick={() => toggle(i.id)} title="Odhacz" style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 6, cursor: "pointer", border: "1px solid var(--dark-border)", background: i.done ? "#2d8a70" : "transparent", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}>{i.done ? <Check size={13} /> : null}</button>
                <span style={{ fontWeight: 800, fontSize: 15, minWidth: 52, color: "var(--dark-text)" }}>{i.time}</span>
                <span style={{ fontWeight: 700, minWidth: 60, color: "var(--dark-text)" }}>pok. {i.room}</span>
                <span style={{ flex: 1, fontSize: 12.5, color: "var(--dark-text-muted)" }}>{i.guest || ""}{i.done && i.doneBy ? ` · ✓ ${i.doneBy}` : ""}</span>
                {due && !i.done ? <span style={{ fontSize: 11, fontWeight: 800, color: "#f87171" }}>⏰ TERAZ</span> : null}
                <button onClick={() => remove(i.id)} title="Usuń" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dark-text-muted)", display: "flex" }}><Trash2 size={13} /></button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
