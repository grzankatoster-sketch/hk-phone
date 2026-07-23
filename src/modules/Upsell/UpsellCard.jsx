import React from "react";
import { TrendingUp, Plus, Trash2 } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { todayKey } from "../../lib/dates";
import { fmtMoney } from "../../lib/format";

// Upsell tracker (WYKONANIE 4.12): dopłaty late-checkout / early check-in / dostawka
// jako OSOBNY rejestr — osobna linia w raporcie dobowym, ZERO wpływu na logikę KW/kasy
// (calculateShiftCash nietknięte). Wzorzec prosty; localStorage (do Supabase z 2.9).
const TYPES = ["Late check-out", "Early check-in", "Dostawka łóżka", "Inne"];

export default function UpsellCard({ employeeName, showToast }) {
  const [items, setItems] = React.useState(() => loadJson(STORAGE_KEYS.upsellCharges, []));
  const [type, setType] = React.useState(TYPES[0]);
  const [amount, setAmount] = React.useState("");
  const [room, setRoom] = React.useState("");

  const persist = (next) => { setItems(next); saveJson(STORAGE_KEYS.upsellCharges, next); };
  const today = todayKey();

  const add = () => {
    const amt = parseFloat(String(amount).replace(",", ".")) || 0;
    if (amt <= 0) { showToast?.("Podaj kwotę dopłaty.", "error"); return; }
    const it = { id: crypto.randomUUID(), date: today, type, amount: amt, room: room.trim(), by: employeeName || "recepcja", createdAt: new Date().toISOString() };
    persist([it, ...items]); setAmount(""); setRoom("");
    showToast?.(`Dopłata: ${type} ${fmtMoney(amt)} zł.`, "success");
  };
  const remove = (id) => persist(items.filter((i) => i.id !== id));

  const todays = items.filter((i) => i.date === today);
  const total = todays.reduce((s, i) => s + (i.amount || 0), 0);

  return (
    <div className="panel glass dark-panel">
      <div className="panel-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><TrendingUp size={16} /> Dopłaty (upsell)</span>
        {total > 0 ? <span style={{ fontSize: 13, fontWeight: 800, color: "#5acc94" }}>{fmtMoney(total)} zł</span> : null}
      </div>
      <div className="tiny muted-light" style={{ marginBottom: 10, marginTop: -6 }}>Late check-out, early check-in, dostawka. Osobna linia w raporcie dobowym — nie miesza się z kasą KW.</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <select className="input dark-input" value={type} onChange={(e) => setType(e.target.value)} style={{ width: 150 }}>
          {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <input className="input dark-input" style={{ width: 90 }} placeholder="Kwota" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <input className="input dark-input" style={{ width: 80 }} placeholder="Pokój" value={room} onChange={(e) => setRoom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn-gold" onClick={add}><Plus size={13} /> Dodaj</button>
      </div>
      {todays.length > 0 && (
        <div className="stack">
          {todays.map((i) => (
            <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 11px", background: "rgba(255,255,255,.04)", border: "1px solid var(--dark-border)", borderRadius: "var(--radius-md)" }}>
              <span style={{ flex: 1, fontSize: 12.5, color: "var(--dark-text)" }}>{i.type}{i.room ? ` · pok. ${i.room}` : ""}</span>
              <span style={{ fontWeight: 700, color: "var(--dark-text)" }}>{fmtMoney(i.amount)} zł</span>
              <button onClick={() => remove(i.id)} title="Usuń" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dark-text-muted)", display: "flex" }}><Trash2 size={13} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
