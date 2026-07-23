import React from "react";
import { KeyRound, Plus, Trash2, Undo2 } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { fmtMoney } from "../../lib/format";

// Rejestr kluczy / kart pokojowych (WYKONANIE 4.7). Wzorzec jak ParkingPanel:
// wydania/zwroty z historią + kaucja. localStorage (do Supabase z 2.9).
export default function KeysPanel({ employeeName, showToast }) {
  const [items, setItems] = React.useState(() => loadJson(STORAGE_KEYS.roomKeys, []));
  const [room, setRoom] = React.useState("");
  const [cardNo, setCardNo] = React.useState("");
  const [issuedTo, setIssuedTo] = React.useState("");
  const [deposit, setDeposit] = React.useState("");

  const persist = (next) => { setItems(next); saveJson(STORAGE_KEYS.roomKeys, next); };
  const fmtDT = (iso) => { try { return iso ? new Date(iso).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"; } catch { return "—"; } };

  const add = () => {
    if (!room.trim() && !cardNo.trim()) { showToast?.("Podaj pokój lub numer karty.", "error"); return; }
    const it = {
      id: crypto.randomUUID(), room: room.trim(), cardNo: cardNo.trim(), issuedTo: issuedTo.trim(),
      deposit: parseFloat(String(deposit).replace(",", ".")) || 0,
      issuedAt: new Date().toISOString(), issuedBy: employeeName || "recepcja", returnedAt: null, returnedBy: null,
    };
    persist([it, ...items]); setRoom(""); setCardNo(""); setIssuedTo(""); setDeposit("");
    showToast?.(`Wydano kartę${it.room ? " · pok. " + it.room : ""}.`, "success");
  };
  const markReturned = (id) => persist(items.map((i) => i.id === id ? { ...i, returnedAt: new Date().toISOString(), returnedBy: employeeName || "recepcja" } : i));
  const remove = (id) => persist(items.filter((i) => i.id !== id));

  const issued = items.filter((i) => !i.returnedAt);
  const returned = items.filter((i) => i.returnedAt).slice(0, 50);

  const row = (i) => (
    <div key={i.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "rgba(255,255,255,.04)", border: "1px solid var(--dark-border)", borderRadius: "var(--radius-md)", opacity: i.returnedAt ? 0.6 : 1 }}>
      <span style={{ fontWeight: 800, minWidth: 56, color: "var(--dark-text)" }}>{i.room ? `pok. ${i.room}` : "—"}</span>
      <span style={{ fontSize: 12.5, color: "var(--dark-text-muted)", minWidth: 80 }}>{i.cardNo ? `karta ${i.cardNo}` : ""}</span>
      <span style={{ flex: 1, fontSize: 12.5, color: "var(--dark-text)" }}>{i.issuedTo || ""}{i.deposit ? ` · kaucja ${fmtMoney(i.deposit)} zł` : ""}</span>
      <span style={{ fontSize: 11, color: "var(--dark-text-muted)" }}>{i.returnedAt ? `zwrot ${fmtDT(i.returnedAt)}` : `wyd. ${fmtDT(i.issuedAt)}`}</span>
      {!i.returnedAt ? (
        <button onClick={() => markReturned(i.id)} title="Zwrot" style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(52,211,153,.4)", background: "rgba(52,211,153,.1)", color: "#34d399", cursor: "pointer", fontWeight: 800, display: "flex", alignItems: "center", gap: 5 }}><Undo2 size={12} /> Zwrot</button>
      ) : (
        <button onClick={() => remove(i.id)} title="Usuń" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dark-text-muted)", display: "flex" }}><Trash2 size={13} /></button>
      )}
    </div>
  );

  return (
    <div className="panel glass dark-panel">
      <div className="panel-title"><KeyRound size={16} /> Klucze / karty pokojowe</div>
      <div className="tiny muted-light" style={{ marginBottom: 10, marginTop: -6 }}>Wydania i zwroty kart/kluczy z kaucją. Karta niezwrócona zostaje na liście „Wydane".</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        <input className="input dark-input" style={{ width: 80 }} placeholder="Pokój" value={room} onChange={(e) => setRoom(e.target.value)} />
        <input className="input dark-input" style={{ width: 90 }} placeholder="Nr karty" value={cardNo} onChange={(e) => setCardNo(e.target.value)} />
        <input className="input dark-input" style={{ flex: 1, minWidth: 120 }} placeholder="Komu wydano (gość)" value={issuedTo} onChange={(e) => setIssuedTo(e.target.value)} />
        <input className="input dark-input" style={{ width: 90 }} placeholder="Kaucja zł" value={deposit} onChange={(e) => setDeposit(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
        <button className="btn btn-gold" onClick={add}><Plus size={13} /> Wydaj</button>
      </div>
      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--dark-text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Wydane · {issued.length}</div>
      <div className="stack" style={{ marginBottom: returned.length ? 14 : 0 }}>
        {issued.length ? issued.map(row) : <div className="tiny muted-light">Brak wydanych kart.</div>}
      </div>
      {returned.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--dark-text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Zwrócone (historia) · {returned.length}</div>
          <div className="stack">{returned.map(row)}</div>
        </>
      )}
    </div>
  );
}
