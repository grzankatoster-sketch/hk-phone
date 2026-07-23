import React from "react";
import jsPDF from "jspdf";
import { Package, Plus, Trash2, FileDown, Undo2 } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { HOTEL_NAME } from "../../lib/constants";
import SignatureCanvas from "../../components/SignatureCanvas";

// Depozyty gości z podpisem (WYKONANIE 4.8). Reużywa SignatureCanvas (przyjęcie +
// odbiór) i generuje PDF pokwitowania z obydwoma podpisami. localStorage (do 2.9).
export default function DepositsPanel({ employeeName, showToast, dark }) {
  const [items, setItems] = React.useState(() => loadJson(STORAGE_KEYS.guestDeposits, []));
  const [guestName, setGuestName] = React.useState("");
  const [room, setRoom] = React.useState("");
  const [itemDesc, setItemDesc] = React.useState("");
  const [sigIn, setSigIn] = React.useState(null);
  const [returningId, setReturningId] = React.useState(null);
  const [sigOut, setSigOut] = React.useState(null);

  const persist = (next) => { setItems(next); saveJson(STORAGE_KEYS.guestDeposits, next); };
  const fmtDT = (iso) => { try { return iso ? new Date(iso).toLocaleString("pl-PL") : "—"; } catch { return "—"; } };

  const add = () => {
    if (!guestName.trim() || !itemDesc.trim()) { showToast?.("Podaj gościa i opis przedmiotu.", "error"); return; }
    const it = {
      id: crypto.randomUUID(), guestName: guestName.trim(), room: room.trim(), itemDesc: itemDesc.trim(),
      depositedAt: new Date().toISOString(), depositedBy: employeeName || "recepcja", signatureIn: sigIn || null,
      returnedAt: null, returnedBy: null, signatureOut: null,
    };
    persist([it, ...items]); setGuestName(""); setRoom(""); setItemDesc(""); setSigIn(null);
    showToast?.("Depozyt przyjęty.", "success");
  };
  const confirmReturn = (id) => {
    persist(items.map((i) => i.id === id ? { ...i, returnedAt: new Date().toISOString(), returnedBy: employeeName || "recepcja", signatureOut: sigOut || null } : i));
    setReturningId(null); setSigOut(null);
    showToast?.("Depozyt wydany.", "success");
  };
  const remove = (id) => persist(items.filter((i) => i.id !== id));

  const printReceipt = (i) => {
    const doc = new jsPDF({ unit: "mm", format: "a5" });
    const pw = doc.internal.pageSize.getWidth();
    doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.text(HOTEL_NAME, 14, 18);
    doc.setFontSize(12); doc.text("Pokwitowanie depozytu", 14, 27);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10);
    let y = 40;
    const line = (l, v) => { doc.setFont("helvetica", "bold"); doc.text(l, 14, y); doc.setFont("helvetica", "normal"); doc.text(String(v || "—"), 55, y); y += 8; };
    line("Gosc:", i.guestName); line("Pokoj:", i.room || "—"); line("Przedmiot:", i.itemDesc);
    line("Przyjeto:", fmtDT(i.depositedAt)); line("Przyjal:", i.depositedBy);
    if (i.returnedAt) { line("Wydano:", fmtDT(i.returnedAt)); line("Wydal:", i.returnedBy); }
    y += 4;
    doc.setFont("helvetica", "bold");
    doc.text("Podpis (przyjecie):", 14, y); doc.text("Podpis (odbior):", pw / 2 + 4, y); y += 4;
    if (i.signatureIn) { try { doc.addImage(i.signatureIn, "PNG", 14, y, 60, 20); } catch { /* zły format */ } }
    if (i.signatureOut) { try { doc.addImage(i.signatureOut, "PNG", pw / 2 + 4, y, 60, 20); } catch { /* zły format */ } }
    doc.save(`depozyt_${String(i.guestName || "gosc").replace(/\s+/g, "_")}.pdf`);
  };

  const held = items.filter((i) => !i.returnedAt);
  const returned = items.filter((i) => i.returnedAt).slice(0, 50);

  const row = (i) => (
    <div key={i.id} style={{ padding: "9px 12px", background: "rgba(255,255,255,.04)", border: "1px solid var(--dark-border)", borderRadius: "var(--radius-md)", opacity: i.returnedAt ? 0.7 : 1 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ fontWeight: 800, color: "var(--dark-text)" }}>{i.guestName}</span>
        {i.room ? <span style={{ fontSize: 12, color: "var(--dark-text-muted)" }}>pok. {i.room}</span> : null}
        <span style={{ flex: 1, fontSize: 12.5, color: "var(--dark-text)" }}>{i.itemDesc}</span>
        <button onClick={() => printReceipt(i)} title="Pokwitowanie PDF" style={{ background: "none", border: "none", cursor: "pointer", color: "#9b8fe8", display: "flex" }}><FileDown size={14} /></button>
        {!i.returnedAt ? (
          <button onClick={() => { setReturningId(returningId === i.id ? null : i.id); setSigOut(null); }} style={{ fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid rgba(52,211,153,.4)", background: "rgba(52,211,153,.1)", color: "#34d399", cursor: "pointer", fontWeight: 800, display: "flex", alignItems: "center", gap: 5 }}><Undo2 size={12} /> Wydaj</button>
        ) : (
          <button onClick={() => remove(i.id)} title="Usuń" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dark-text-muted)", display: "flex" }}><Trash2 size={13} /></button>
        )}
      </div>
      <div style={{ fontSize: 11, color: "var(--dark-text-muted)", marginTop: 4 }}>
        przyjęto {fmtDT(i.depositedAt)} · {i.depositedBy}{i.returnedAt ? ` · wydano ${fmtDT(i.returnedAt)} · ${i.returnedBy}` : ""}
      </div>
      {returningId === i.id && !i.returnedAt && (
        <div style={{ marginTop: 8 }}>
          <SignatureCanvas onSave={setSigOut} label="Podpis gościa przy odbiorze" dark={dark} />
          <button className="btn btn-emerald" style={{ marginTop: 6 }} onClick={() => confirmReturn(i.id)}>Potwierdź wydanie</button>
        </div>
      )}
    </div>
  );

  return (
    <div className="panel glass dark-panel">
      <div className="panel-title"><Package size={16} /> Depozyty gości</div>
      <div className="tiny muted-light" style={{ marginBottom: 10, marginTop: -6 }}>Przyjęcie i wydanie rzeczy gościa z podpisem. Pokwitowanie PDF z obydwoma podpisami.</div>
      <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
        <input className="input dark-input" style={{ width: 140 }} placeholder="Gość" value={guestName} onChange={(e) => setGuestName(e.target.value)} />
        <input className="input dark-input" style={{ width: 80 }} placeholder="Pokój" value={room} onChange={(e) => setRoom(e.target.value)} />
        <input className="input dark-input" style={{ flex: 1, minWidth: 140 }} placeholder="Co (np. walizka, laptop)" value={itemDesc} onChange={(e) => setItemDesc(e.target.value)} />
      </div>
      <div style={{ marginBottom: 8 }}><SignatureCanvas onSave={setSigIn} label="Podpis gościa przy przyjęciu" dark={dark} /></div>
      <button className="btn btn-gold" onClick={add} style={{ marginBottom: 14 }}><Plus size={13} /> Przyjmij depozyt</button>

      <div style={{ fontSize: 11, fontWeight: 800, color: "var(--dark-text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>W depozycie · {held.length}</div>
      <div className="stack" style={{ marginBottom: returned.length ? 14 : 0 }}>
        {held.length ? held.map(row) : <div className="tiny muted-light">Brak depozytów.</div>}
      </div>
      {returned.length > 0 && (
        <>
          <div style={{ fontSize: 11, fontWeight: 800, color: "var(--dark-text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>Wydane (historia) · {returned.length}</div>
          <div className="stack">{returned.map(row)}</div>
        </>
      )}
    </div>
  );
}
