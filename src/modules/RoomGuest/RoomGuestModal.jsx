import React from "react";
import { motion } from "framer-motion";
import { Contact, X, Plus, Check, Trash2, AlarmClock, TrendingUp } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { todayKey } from "../../lib/dates";
import { fmtMoney } from "../../lib/format";
import { getRoomGuest, saveRoomGuest, emptyRoomGuest } from "../../lib/roomGuests";

const UPSELL_TYPES = ["Late check-out", "Early check-in", "Dostawka łóżka", "Inne"];

// Karta gościa dla pokoju (WYKONANIE: HK guest card). Tożsamość (nazwisko, do
// kiedy) docelowo z raportu KWHotel — dziś wpisywana ręcznie do czasu podpięcia
// importu. Preferencje operacyjne napędzają HK (plakietka SC) i Budziki.
export default function RoomGuestModal({ room, dark, employeeName, showToast, onClose, onSaved }) {
  const existing = React.useMemo(() => getRoomGuest(room) || emptyRoomGuest(), [room]);
  const [guestName, setGuestName] = React.useState(existing.guestName);
  const [checkOutDate, setCheckOutDate] = React.useState(existing.checkOutDate);
  const [dailyCleaning, setDailyCleaning] = React.useState(existing.dailyCleaning);
  const [meal, setMeal] = React.useState(existing.meal || "none");
  const [wakeUpEnabled, setWakeUpEnabled] = React.useState(!!existing.wakeUp?.enabled);
  const [wakeUpTime, setWakeUpTime] = React.useState(existing.wakeUp?.time || "");
  const [laterRequests, setLaterRequests] = React.useState(existing.laterRequests || []);
  const [newRequest, setNewRequest] = React.useState("");

  const loadWakeUpsForRoom = () => loadJson(STORAGE_KEYS.wakeUps, []).filter(i => i.room === room && i.date === todayKey());
  const [roomWakeUps, setRoomWakeUps] = React.useState(loadWakeUpsForRoom);

  const loadUpsellsForRoom = () => loadJson(STORAGE_KEYS.upsellCharges, []).filter(i => i.room === room && i.date === todayKey());
  const [roomUpsells, setRoomUpsells] = React.useState(loadUpsellsForRoom);
  const [upsellType, setUpsellType] = React.useState(UPSELL_TYPES[0]);
  const [upsellAmount, setUpsellAmount] = React.useState("");

  const addRequest = () => {
    if (!newRequest.trim()) return;
    setLaterRequests(prev => [{ id: crypto.randomUUID(), text: newRequest.trim(), date: todayKey(), done: false }, ...prev]);
    setNewRequest("");
  };
  const toggleRequest = (id) => setLaterRequests(prev => prev.map(r => r.id === id ? { ...r, done: !r.done } : r));
  const removeRequest = (id) => setLaterRequests(prev => prev.filter(r => r.id !== id));

  // Budzenia i dopłaty żyją tylko w stanie lokalnym do momentu "Zapisz" (jak
  // laterRequests) — wcześniej pisały od razu do localStorage, więc "Anuluj"
  // ich nie cofał (budzenie/dopłata zostawały mimo kliknięcia Anuluj).
  const createWakeUp = () => {
    if (!wakeUpTime) { showToast?.("Podaj godzinę budzenia.", "error"); return; }
    const already = roomWakeUps.some(i => i.time === wakeUpTime && !i.done);
    if (already) { showToast?.("Budzenie na tę godzinę już jest w liście.", "info"); return; }
    const it = { id: crypto.randomUUID(), date: todayKey(), time: wakeUpTime, room, guest: guestName.trim(), done: false, notified: false, createdBy: employeeName || "recepcja", createdAt: new Date().toISOString() };
    setRoomWakeUps(prev => [it, ...prev]);
    showToast?.(`Budzenie ${wakeUpTime} dodane do listy budzików.`, "success");
  };
  const toggleWakeUpDone = (id) => setRoomWakeUps(prev => prev.map(i => i.id === id ? { ...i, done: !i.done } : i));
  const removeWakeUp = (id) => setRoomWakeUps(prev => prev.filter(i => i.id !== id));

  const addUpsell = () => {
    const amt = parseFloat(String(upsellAmount).replace(",", ".")) || 0;
    if (amt <= 0) { showToast?.("Podaj kwotę dopłaty.", "error"); return; }
    const it = { id: crypto.randomUUID(), date: todayKey(), type: upsellType, amount: amt, room, by: employeeName || "recepcja", createdAt: new Date().toISOString() };
    setRoomUpsells(prev => [it, ...prev]);
    setUpsellAmount("");
    showToast?.(`Dopłata: ${upsellType} ${fmtMoney(amt)} zł.`, "success");
  };
  const removeUpsell = (id) => setRoomUpsells(prev => prev.filter(i => i.id !== id));

  // Zapisuje lokalną listę budzeń/dopłat tego pokoju na dziś, nie ruszając
  // wpisów innych pokoi/dni w tym samym kluczu localStorage.
  const commitRoomList = (storageKey, localList) => {
    const others = loadJson(storageKey, []).filter(i => !(i.room === room && i.date === todayKey()));
    saveJson(storageKey, [...localList, ...others]);
  };

  const handleSave = () => {
    saveRoomGuest(room, {
      guestName: guestName.trim(),
      checkOutDate,
      dailyCleaning,
      meal,
      wakeUp: { enabled: wakeUpEnabled, time: wakeUpEnabled ? wakeUpTime : "" },
      laterRequests,
    });
    commitRoomList(STORAGE_KEYS.wakeUps, roomWakeUps);
    commitRoomList(STORAGE_KEYS.upsellCharges, roomUpsells);
    onSaved?.();
    onClose();
  };

  const label = { fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", color: dark ? "var(--dark-text-muted)" : "var(--text-muted)", display: "block", marginBottom: 5 };
  const inp = dark ? "input dark-input" : "input";

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }} onClick={onClose}>
      <motion.div initial={{ opacity: 0, y: 12, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="cc-preshift-modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
        <div className="cc-preshift-header">
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--plum-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Contact size={20} style={{ color: "var(--plum)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="cc-preshift-title">Karta gościa — pokój {room}</div>
            <div className="cc-preshift-sub">Tożsamość ręcznie do czasu podpięcia importu z KWHotel</div>
          </div>
          <button className="cc-preshift-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14, maxHeight: "60vh", overflowY: "auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={label}>Gość</label>
              <input className={inp} value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Imię i nazwisko" autoFocus />
            </div>
            <div>
              <label style={label}>Do kiedy</label>
              <input className={inp} type="date" value={checkOutDate} onChange={e => setCheckOutDate(e.target.value)} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, alignItems: "end" }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              <input type="checkbox" checked={dailyCleaning} onChange={e => setDailyCleaning(e.target.checked)} />
              Codzienne sprzątanie (SC)
            </label>
            <div>
              <label style={label}>Wyżywienie</label>
              <select className={inp} value={meal} onChange={e => setMeal(e.target.value)}>
                <option value="none">Bez wyżywienia</option>
                <option value="breakfast">Śniadanie</option>
                <option value="hb">HB (śniadanie + kolacja)</option>
              </select>
            </div>
          </div>

          <div>
            <label style={{ ...label, display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={wakeUpEnabled} onChange={e => setWakeUpEnabled(e.target.checked)} style={{ marginRight: 2 }} />
              <AlarmClock size={13} /> Budzenie
            </label>
            {wakeUpEnabled && (
              <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                <input className={inp} type="time" value={wakeUpTime} onChange={e => setWakeUpTime(e.target.value)} style={{ maxWidth: 130 }} />
                <button type="button" className="btn btn-outline" onClick={createWakeUp} style={{ fontSize: 12 }}>Dodaj do budzików na dziś</button>
              </div>
            )}
            {roomWakeUps.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {roomWakeUps.map(w => (
                  <div key={w.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, opacity: w.done ? 0.55 : 1 }}>
                    <button type="button" onClick={() => toggleWakeUpDone(w.id)} title={w.done ? "Cofnij" : "Zrobione"}
                      style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${w.done ? "#34d399" : "var(--border-medium)"}`, background: w.done ? "rgba(52,211,153,.15)" : "transparent", color: "#34d399", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {w.done && <Check size={12} />}
                    </button>
                    <span style={{ flex: 1, textDecoration: w.done ? "line-through" : "none" }}>Budzenie {w.time}</span>
                    <button type="button" onClick={() => removeWakeUp(w.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={{ ...label, display: "flex", alignItems: "center", gap: 8 }}><TrendingUp size={13} /> Dopłaty (upsell)</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
              <select className={inp} value={upsellType} onChange={e => setUpsellType(e.target.value)} style={{ width: 150 }}>
                {UPSELL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input className={inp} style={{ width: 90 }} placeholder="Kwota" value={upsellAmount}
                onChange={e => setUpsellAmount(e.target.value)} onKeyDown={e => e.key === "Enter" && addUpsell()} />
              <button type="button" className="btn btn-outline" onClick={addUpsell}><Plus size={14} /> Dodaj</button>
            </div>
            {roomUpsells.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {roomUpsells.map(u => (
                  <div key={u.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5 }}>
                    <span style={{ flex: 1 }}>{u.type}</span>
                    <span style={{ fontWeight: 700 }}>{fmtMoney(u.amount)} zł</span>
                    <button type="button" onClick={() => removeUpsell(u.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <label style={label}>Prośby na później (nie: preferencje pokoju — te idą przez KWHotel)</label>
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input className={inp} value={newRequest} onChange={e => setNewRequest(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addRequest(); } }}
                placeholder="np. dodatkowy ręcznik jutro rano" style={{ flex: 1 }} />
              <button type="button" className="btn btn-outline" onClick={addRequest}><Plus size={14} /></button>
            </div>
            {laterRequests.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {laterRequests.map(r => (
                  <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, opacity: r.done ? 0.55 : 1 }}>
                    <button type="button" onClick={() => toggleRequest(r.id)} title={r.done ? "Cofnij" : "Zrobione"}
                      style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${r.done ? "#34d399" : "var(--border-medium)"}`, background: r.done ? "rgba(52,211,153,.15)" : "transparent", color: "#34d399", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {r.done && <Check size={12} />}
                    </button>
                    <span style={{ flex: 1, textDecoration: r.done ? "line-through" : "none" }}>{r.text}</span>
                    <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>{r.date}</span>
                    <button type="button" onClick={() => removeRequest(r.id)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><Trash2 size={12} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="cc-preshift-footer">
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>Karta znika automatycznie 2 dni po dacie wyjazdu.</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" onClick={onClose}>Anuluj</button>
            <button className="btn btn-rose" onClick={handleSave}>Zapisz</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
