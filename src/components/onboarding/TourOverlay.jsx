import React from "react";
import { motion } from "framer-motion";
import { ArrowRight, ArrowLeft, X } from "lucide-react";

// Prawdziwy tour krok-po-kroku: "Dalej" faktycznie przełącza zakładkę appki
// (przez onNavigate -> setWorkerTab), a nie tylko pokazuje statyczny opis.
// Część kreatora pierwszego uruchomienia (WYKONANIE 4.13, MVP).
export default function TourOverlay({ steps, onNavigate, onEnd }) {
  const [idx, setIdx] = React.useState(0);
  const step = steps[idx];

  React.useEffect(() => { onNavigate(steps[0].key); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (nextIdx) => {
    if (nextIdx < 0 || nextIdx >= steps.length) return;
    setIdx(nextIdx);
    onNavigate(steps[nextIdx].key);
  };

  if (!step) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
      style={{ position: "fixed", right: 20, bottom: 20, zIndex: 2000, width: 320, background: "var(--dark-panel-bg, #1a1220)", border: "1px solid var(--plum-bright, #c99950)", borderRadius: 14, padding: "16px 18px", boxShadow: "0 12px 40px rgba(0,0,0,.5)", color: "var(--dark-text, #f2ecf5)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--plum-bright, #c99950)" }}>Tour &middot; {idx + 1}/{steps.length}</span>
        <button onClick={onEnd} title="Zakończ tour" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dark-text-muted)", display: "flex" }}><X size={15} /></button>
      </div>
      <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 6 }}>{step.label}</div>
      <div style={{ fontSize: 12.5, color: "var(--dark-text-muted)", lineHeight: 1.5, marginBottom: 14 }}>{step.desc}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
        <button className="btn btn-outline" disabled={idx === 0} onClick={() => go(idx - 1)} style={{ opacity: idx === 0 ? .4 : 1, fontSize: 12.5 }}><ArrowLeft size={13} /> Wstecz</button>
        {idx === steps.length - 1
          ? <button className="btn btn-rose" onClick={onEnd} style={{ fontSize: 12.5 }}>Zakończ tour</button>
          : <button className="btn btn-rose" onClick={() => go(idx + 1)} style={{ fontSize: 12.5 }}>Dalej <ArrowRight size={13} /></button>}
      </div>
    </motion.div>
  );
}
