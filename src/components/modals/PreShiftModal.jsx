import React from "react";
import { motion } from "framer-motion";
import { X } from "lucide-react";
import { STORAGE_KEYS, loadJson } from "../../lib/storage";
import { parsePlDateTime } from "../../lib/dates";
import { SHIFT_LABELS_PL } from "../../lib/constants";
import Logo from "../../ui/Logo";

const transliterate = (s) =>
  (s || "").toLowerCase().replace(/[ąćęłńóśźż]/g, (c) => "acelnoszzz"["ąćęłńóśźż".indexOf(c)]);

export default function PreShiftModal({ employeeName, selectedShift, shiftLabel, onCancel, onConfirm }) {
  const now = new Date();
  const dayKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const ackName = transliterate(employeeName);
  const ackKeyBase = `ack-${ackName}-${dayKey}-${selectedShift}`;

  // ── Data loading (before hooks so lazy-init can use them) ──────────────────
  const alerts = loadJson(STORAGE_KEYS.managerAlerts, [])
    .filter(a => !a.expires_at || new Date(a.expires_at).getTime() > Date.now())
    .filter(a => !a.target_shift || a.target_shift === selectedShift)
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || new Date(b.created_at) - new Date(a.created_at));

  const reminders = loadJson(STORAGE_KEYS.standingReminders, []).filter(r => r.active !== false);

  const wikiEntries    = loadJson(STORAGE_KEYS.wiki, []);
  const wikiLastSeenKey = `${STORAGE_KEYS.wikiLastSeen}-${employeeName}`;
  const lastSeenMs     = parseInt(localStorage.getItem(wikiLastSeenKey) || "0");
  const newWiki        = wikiEntries.filter(w => parsePlDateTime(w.updatedAt) > lastSeenMs);

  // Hash po TREŚCI (tytuł+treść), nie po ID — ID są niestabilne (seed/sync Supabase),
  // a liczy się to, co pracownik potwierdza. Musi być identyczny jak w handleStartShift.
  const contentHash     = (arr) => arr.map(x => `${x.title || ""}|${x.body || ""}`).sort().join("||");
  // Permanent hash keys — standing reminders remembered across days
  const standingHash    = contentHash(reminders);
  const standingHashKey = `ack-sh-${ackName}-${standingHash}`;

  // Alert-set hash — ack powiązany z konkretnym zbiorem alertów (po treści).
  const alertsHash    = contentHash(alerts);
  const alertsHashKey = `ack-al-${ackName}-${alertsHash}`;

  const counts = { alerts: alerts.length, standing: reminders.length, wiki: newWiki.length };

  // ── Initial ack state ─────────────────────────────────────────────────────
  const initAcks = {
    alerts:  counts.alerts  === 0 || (alertsHash && localStorage.getItem(alertsHashKey) === "1"),
    standing: counts.standing === 0 || localStorage.getItem(`${ackKeyBase}-standing`) === "1"
              || (standingHash && localStorage.getItem(standingHashKey) === "1"),
    wiki:    counts.wiki    === 0 || localStorage.getItem(`${ackKeyBase}-wiki`)    === "1",
  };

  const [acks, setAcks] = React.useState(() => ({ ...initAcks }));

  // Auto-navigate to first unacked tab with content
  const [activeTab, setActiveTab] = React.useState(() => {
    if (counts.alerts   > 0 && !initAcks.alerts)   return "alerts";
    if (counts.standing > 0 && !initAcks.standing)  return "standing";
    if (counts.wiki     > 0 && !initAcks.wiki)       return "wiki";
    return "alerts";
  });

  const setAck = (key, val) => {
    setAcks(a => ({ ...a, [key]: val }));
    if (val) {
      localStorage.setItem(`${ackKeyBase}-${key}`, "1");
      // Save permanent hash for standing so same set doesn't require re-ack next day
      if (key === "standing" && standingHash) localStorage.setItem(standingHashKey, "1");
      // Save alert-set hash so the SAME set isn't re-prompted, but a new alert is.
      if (key === "alerts" && alertsHash) localStorage.setItem(alertsHashKey, "1");
    } else {
      localStorage.removeItem(`${ackKeyBase}-${key}`);
    }
  };

  const allAck = acks.alerts && acks.standing && acks.wiki;

  const handleStart = () => {
    localStorage.setItem(wikiLastSeenKey, String(Date.now()));
    onConfirm();
  };

  const renderEmpty = (msg) => (
    <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
      <div style={{ fontSize: 34, marginBottom: 10, opacity: .5 }}>📭</div>
      <div style={{ fontSize: 13.5, fontWeight: 600 }}>{msg}</div>
      {counts[activeTab === "alerts" ? "alerts" : activeTab === "standing" ? "standing" : "wiki"] === 0 ? (
        <div style={{ fontSize: 11.5, marginTop: 6, opacity: .7, color: "var(--cc-success)" }}>
          Sekcja pusta — zatwierdzona automatycznie.
        </div>
      ) : (
        <div style={{ fontSize: 11.5, marginTop: 6, opacity: .7 }}>
          Zaznacz &quot;Zapoznałem się&quot; aby kontynuować.
        </div>
      )}
    </div>
  );

  const tab = (id, label, count, color) => (
    <button
      key={id}
      onClick={() => setActiveTab(id)}
      className={`cc-preshift-tab${activeTab === id ? " cc-active" : ""}`}
      style={{ borderBottomColor: activeTab === id ? color : "transparent" }}>
      <span>{label}</span>
      {count > 0 && <span className="cc-preshift-tab-badge" style={{ background: color }}>{count}</span>}
      {acks[id === "alerts" ? "alerts" : id === "standing" ? "standing" : "wiki"] && (
        <span className="cc-preshift-tab-check">✓</span>
      )}
    </button>
  );

  return (
    <div className="modal-backdrop" style={{ zIndex: 1100 }} role="presentation">
      <motion.div
        initial={{ opacity: 0, y: 12, scale: .97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="cc-preshift-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cc-preshift-title-id"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="cc-preshift-header">
          <Logo variant="icon" tone="dark" width={36} height={36} />
          <div style={{ flex: 1 }}>
            <div className="cc-preshift-title" id="cc-preshift-title-id">Zanim rozpoczniesz zmianę</div>
            <div className="cc-preshift-sub">
              <strong>{employeeName}</strong> · {shiftLabel || SHIFT_LABELS_PL[selectedShift] || selectedShift}
            </div>
          </div>
          <button className="cc-preshift-close" onClick={onCancel} title="Anuluj">
            <X size={18} />
          </button>
        </div>

        {/* Tabs */}
        <div className="cc-preshift-tabs" role="tablist">
          {tab("alerts",   "Pilne informacje",    counts.alerts,   "var(--cc-danger)")}
          {tab("standing", "Stałe przypomnienia", counts.standing, "var(--cc-accent-gold)")}
          {tab("wiki",     "Nowe w Wiki",          counts.wiki,    "var(--cc-brand)")}
        </div>

        {/* Tab content */}
        <div className="cc-preshift-content">
          {activeTab === "alerts" && (
            <div className="cc-preshift-list">
              {alerts.length === 0 ? renderEmpty("Brak pilnych informacji od kierownika.") :
                alerts.map(a => (
                  <div key={a.id} className="cc-preshift-item" style={{ borderLeftColor: a.priority === "urgent" ? "var(--cc-danger)" : "var(--cc-accent-gold)" }}>
                    <div className="cc-preshift-item-head">
                      <div className="cc-preshift-item-title">{a.title || "Informacja"}</div>
                      {a.pinned && <span className="cc-preshift-pin">📌</span>}
                      {a.priority === "urgent" && <span className="cc-preshift-urgent">PILNE</span>}
                    </div>
                    <div className="cc-preshift-item-body">{a.body}</div>
                    <div className="cc-preshift-item-meta">{a.created_by} · {new Date(a.created_at).toLocaleDateString("pl-PL")}</div>
                  </div>
                ))
              }
            </div>
          )}
          {activeTab === "standing" && (
            <div className="cc-preshift-list">
              {reminders.length === 0 ? renderEmpty("Brak stałych przypomnień.") :
                reminders.map(r => (
                  <div key={r.id} className="cc-preshift-item" style={{ borderLeftColor: "var(--cc-accent-gold)" }}>
                    <div className="cc-preshift-item-head">
                      <div className="cc-preshift-item-title">{r.title || "Przypomnienie"}</div>
                      {r.category && <span className="cc-preshift-cat">{r.category}</span>}
                    </div>
                    <div className="cc-preshift-item-body">{r.body}</div>
                  </div>
                ))
              }
            </div>
          )}
          {activeTab === "wiki" && (
            <div className="cc-preshift-list">
              {newWiki.length === 0 ? renderEmpty("Brak nowych wpisów w Wiki od ostatniego logowania.") :
                newWiki.map(w => (
                  <div key={w.id} className="cc-preshift-item" style={{ borderLeftColor: "var(--cc-brand)" }}>
                    <div className="cc-preshift-item-head">
                      <div className="cc-preshift-item-title">{w.topic}</div>
                    </div>
                    <div className="cc-preshift-item-body" style={{ maxHeight: 160, overflow: "auto" }}>{w.content}</div>
                    <div className="cc-preshift-item-meta">Zaktualizowano: {w.updatedAt}</div>
                  </div>
                ))
              }
            </div>
          )}
        </div>

        {/* ACK checkbox */}
        <div className="cc-preshift-ack">
          <label className="cc-preshift-ack-label">
            <input
              type="checkbox"
              checked={acks[activeTab === "alerts" ? "alerts" : activeTab === "standing" ? "standing" : "wiki"]}
              onChange={e => setAck(activeTab === "alerts" ? "alerts" : activeTab === "standing" ? "standing" : "wiki", e.target.checked)}
            />
            <span>
              Zapoznałem się z sekcją &quot;{activeTab === "alerts" ? "Pilne informacje" : activeTab === "standing" ? "Stałe przypomnienia" : "Nowe w Wiki"}&quot;
              {activeTab === "standing" && acks.standing && counts.standing > 0 && (
                <span style={{ fontSize: 10, marginLeft: 6, opacity: .6 }}>
                  (zapamiętane, nie zapyta ponownie)
                </span>
              )}
            </span>
          </label>
        </div>

        {/* Footer */}
        <div className="cc-preshift-footer">
          <div className="cc-preshift-progress">
            <span className={acks.alerts ? "cc-done" : ""}>Pilne</span>
            <span style={{ opacity: .4 }}>›</span>
            <span className={acks.standing ? "cc-done" : ""}>Stałe</span>
            <span style={{ opacity: .4 }}>›</span>
            <span className={acks.wiki ? "cc-done" : ""}>Wiki</span>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn btn-outline" onClick={onCancel}>Anuluj</button>
            <button
              className="btn btn-rose"
              disabled={!allAck}
              onClick={handleStart}
              title={allAck ? "" : "Potwierdź wszystkie 3 kategorie aby kontynuować"}>
              {allAck ? "Rozpocznij zmianę →" : "Potwierdź wszystkie sekcje"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
