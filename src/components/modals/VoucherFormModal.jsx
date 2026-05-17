import React from "react";
import { motion } from "framer-motion";
import { FileText, X } from "lucide-react";

export default function VoucherFormModal({ onClose, onSave, employeeName }) {
  const [type, setType] = React.useState("voucher");
  const [code, setCode] = React.useState("");
  const [value, setValue] = React.useState("");
  const [guestName, setGuestName] = React.useState("");
  const [guestPhone, setGuestPhone] = React.useState("");
  const [reservationNo, setReservationNo] = React.useState("");
  const [kwNo, setKwNo] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [note, setNote] = React.useState("");

  const handleSave = () => {
    if (!code.trim()) { alert("Wpisz numer vouchera."); return; }
    if (!guestName.trim()) { alert("Wpisz imie i nazwisko goscia."); return; }
    if (!value || isNaN(Number(value)) || Number(value) <= 0) { alert("Wpisz prawidlowa kwote."); return; }
    onSave({
      id: crypto.randomUUID(),
      code: code.trim().toUpperCase(),
      type,
      value: Number(value),
      value_unit: "PLN",
      status: "issued",
      guest_name: guestName.trim(),
      guest_phone: guestPhone.trim(),
      reservation_no: reservationNo.trim(),
      kw_no: kwNo.trim(),
      recipient_name: guestName.trim(),
      recipient_type: "guest",
      note: note.trim(),
      issued_by: employeeName || "Recepcja",
      issued_at: new Date().toISOString(),
      expires_at: expiresAt || null,
      used_at: null,
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <motion.div initial={{ opacity: 0, y: 12, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="cc-preshift-modal" style={{ maxWidth: 540 }} onClick={e => e.stopPropagation()}>
        <div className="cc-preshift-header">
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--plum-soft)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <FileText size={20} style={{ color: "var(--plum)" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="cc-preshift-title">Nowy voucher</div>
            <div className="cc-preshift-sub">Wystawia: <strong>{employeeName || "Recepcja"}</strong></div>
          </div>
          <button className="cc-preshift-close" onClick={onClose}><X size={18} /></button>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* Typ — dwa przyciski */}
          <div>
            <label>Typ</label>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              {[["voucher", "Voucher"], ["cashback", "Cashback"]].map(([k, lbl]) => (
                <button key={k} type="button" onClick={() => setType(k)}
                  style={{ flex: 1, padding: "10px 0", borderRadius: 8, border: `2px solid ${type === k ? "var(--plum)" : "var(--border-medium)"}`, background: type === k ? "var(--plum-soft)" : "transparent", color: type === k ? "var(--plum)" : "var(--text-secondary)", fontWeight: type === k ? 700 : 500, fontSize: 14, cursor: "pointer", transition: "all .15s" }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {/* Numer vouchera + kwota */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label>Numer vouchera *</label>
              <input className="input" value={code} onChange={e => setCode(e.target.value)} placeholder="np. 001 lub VCH-2026-001" autoFocus style={{ fontFamily: "monospace", fontWeight: 700, letterSpacing: ".04em" }} />
            </div>
            <div>
              <label>Kwota (PLN) *</label>
              <input className="input" type="number" min="1" step="0.01" value={value} onChange={e => setValue(e.target.value)} placeholder="np. 150.00" />
            </div>
          </div>

          {/* Dane gościa */}
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--text-muted)", marginBottom: -6 }}>Dane goscia</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label>Imie i nazwisko goscia *</label>
              <input className="input" value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Jan Kowalski" />
            </div>
            <div>
              <label>Numer telefonu</label>
              <input className="input" type="tel" value={guestPhone} onChange={e => setGuestPhone(e.target.value)} placeholder="+48 000 000 000" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label>Nr rezerwacji</label>
              <input className="input" value={reservationNo} onChange={e => setReservationNo(e.target.value)} placeholder="np. RES-2026-1234" />
            </div>
            <div>
              <label>Nr KW (z ktorej dano voucher)</label>
              <input className="input" value={kwNo} onChange={e => setKwNo(e.target.value)} placeholder="np. KW/2026/04/001" />
            </div>
          </div>

          {/* Dodatkowe */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label>Data wygasniecia (opcjonalnie)</label>
              <input className="input" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} />
            </div>
            <div>
              <label>Notatka (opcjonalnie)</label>
              <input className="input" value={note} onChange={e => setNote(e.target.value)} placeholder="Uwagi..." />
            </div>
          </div>
        </div>

        <div className="cc-preshift-footer">
          <div style={{ fontSize: 11, color: "var(--text-muted)" }}>* — pola wymagane</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" onClick={onClose}>Anuluj</button>
            <button className="btn btn-rose" onClick={handleSave}>Wystaw voucher</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
