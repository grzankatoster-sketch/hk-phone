import { motion } from "framer-motion";
import { UserCheck, Clock } from "lucide-react";

// Shown when a worker logs in shortly BEFORE their scheduled shift start
// (within 30 min). Guards against picking the wrong name at the shift boundary.
export default function IdentityConfirmModal({ employeeName, shiftLabel, startLabel, nowLabel, onConfirm, onCancel }) {
  return (
    <div className="modal-backdrop" style={{ zIndex: 1200 }} onClick={onCancel}>
      <motion.div
        initial={{ opacity: 0, scale: .96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="modal"
        style={{ maxWidth: 440 }}
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header" style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 38, height: 38, borderRadius: "50%", flexShrink: 0,
            background: "var(--plum, #6D28D9)", color: "#fff",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <UserCheck size={20} />
          </div>
          <h2 style={{ margin: 0 }}>Czy to na pewno Ty?</h2>
        </div>

        <p style={{ color: "var(--text-secondary)", lineHeight: 1.65, margin: "8px 0 12px" }}>
          Logujesz się jako <strong>{employeeName}</strong>, ale Twoja zmiana
          {shiftLabel ? <> (<strong>{shiftLabel}</strong>)</> : null} zaczyna się dopiero o{" "}
          <strong>{startLabel}</strong>. Potwierdź, że to naprawdę Ty rozpoczynasz zmianę wcześniej.
        </p>

        <div style={{
          display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap",
          padding: "10px 14px", marginBottom: 4,
          background: "var(--plum-soft, rgba(109,40,217,.08))",
          border: "1px solid var(--plum-border, rgba(109,40,217,.25))",
          borderRadius: "var(--radius-md, 10px)",
        }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
            <Clock size={14} style={{ opacity: .7 }} /> Teraz: <strong>{nowLabel}</strong>
          </span>
          <span style={{ fontSize: 13 }}>Start zmiany: <strong>{startLabel}</strong></span>
        </div>

        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onCancel}>To nie ja</button>
          <button className="btn btn-rose" onClick={onConfirm}>Tak, to ja — dalej</button>
        </div>
      </motion.div>
    </div>
  );
}
