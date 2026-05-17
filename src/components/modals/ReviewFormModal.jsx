import React from "react";
import { motion } from "framer-motion";
import { Star, X } from "lucide-react";

const CATEGORIES = ["Ogolna", "Czystosc", "Komfort", "Lokalizacja", "Usluga", "Stosunek jakosci do ceny", "WiFi"];

export default function ReviewFormModal({ onClose, onSave, employeeName }) {
  const [guestName, setGuestName] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [score, setScore] = React.useState("");
  const [stayDate, setStayDate] = React.useState("");
  const [submittedAt, setSubmittedAt] = React.useState("");
  const [roomType, setRoomType] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [positives, setPositives] = React.useState("");
  const [negatives, setNegatives] = React.useState("");

  const handleSave = () => {
    const s = parseFloat(score);
    if (!guestName.trim()) { alert("Podaj imie goscia."); return; }
    if (isNaN(s) || s < 1 || s > 10) { alert("Ocena musi byc od 1 do 10."); return; }
    onSave({
      id: crypto.randomUUID(),
      platform: "booking.com",
      guest_name: guestName.trim(),
      country: country.trim() || null,
      stay_date: stayDate || null,
      submitted_at: submittedAt ? new Date(submittedAt).toISOString() : new Date().toISOString(),
      score: s,
      title: title.trim() || null,
      positives: positives.trim() || null,
      negatives: negatives.trim() || null,
      room_type: roomType.trim() || null,
      response_text: "",
      responded_at: null,
      responded_by: null,
      added_by: employeeName || "Recepcja",
      added_at: new Date().toISOString(),
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }}>
      <motion.div initial={{ opacity: 0, y: 12, scale: .97 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="cc-preshift-modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="cc-preshift-header">
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#FEF3C7", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Star size={20} style={{ color: "#D97706" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="cc-preshift-title">Dodaj opinie z Booking.com</div>
            <div className="cc-preshift-sub">Przepisz tresc opinii goscia do systemu</div>
          </div>
          <button className="cc-preshift-close" onClick={onClose}><X size={18} /></button>
        </div>
        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 10 }}>
            <div>
              <label>Imie goscia</label>
              <input className="input" value={guestName} onChange={e => setGuestName(e.target.value)} placeholder="Np. Jan K." autoFocus />
            </div>
            <div>
              <label>Kraj (opcjonalnie)</label>
              <input className="input" value={country} onChange={e => setCountry(e.target.value)} placeholder="Polska" />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div>
              <label>Ocena (1–10)</label>
              <input className="input" type="number" min="1" max="10" step="0.1" value={score} onChange={e => setScore(e.target.value)} placeholder="8.5" />
            </div>
            <div>
              <label>Data pobytu</label>
              <input className="input" type="date" value={stayDate} onChange={e => setStayDate(e.target.value)} />
            </div>
            <div>
              <label>Data opinii</label>
              <input className="input" type="date" value={submittedAt} onChange={e => setSubmittedAt(e.target.value)} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label>Typ pokoju (opcjonalnie)</label>
              <input className="input" value={roomType} onChange={e => setRoomType(e.target.value)} placeholder="Np. Pokoj dwuosobowy" />
            </div>
            <div>
              <label>Tytul opinii (opcjonalnie)</label>
              <input className="input" value={title} onChange={e => setTitle(e.target.value)} placeholder="Np. Swietny pobyt!" />
            </div>
          </div>
          <div>
            <label>Co sie podobalo (+)</label>
            <textarea className="input" rows={3} value={positives} onChange={e => setPositives(e.target.value)} placeholder="Tresc pozytywna opinii..." />
          </div>
          <div>
            <label>Co sie nie podobalo (–)</label>
            <textarea className="input" rows={2} value={negatives} onChange={e => setNegatives(e.target.value)} placeholder="Tresc negatywna opinii (jezeli brak — zostaw puste)..." />
          </div>
        </div>
        <div className="cc-preshift-footer">
          <div style={{ fontSize: 11.5, color: "var(--text-muted)" }}>Dodaje: <strong>{employeeName || "Recepcja"}</strong></div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" onClick={onClose}>Anuluj</button>
            <button className="btn btn-rose" onClick={handleSave}>Zapisz opinie</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
