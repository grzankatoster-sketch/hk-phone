// Animowana, interaktywna ikonka agenta AI w Monitorze HK.
// Gdy agent wyłapie propozycję zamiany lub prośbę o pokój — pulsuje i pokazuje
// w popoverze konkretne sugestie z przyciskami Zastosuj/Odrzuć. Agent NIGDY nie
// przenosi sam — zawsze pyta recepcję o zgodę.
import React from "react";
import AgentIcon from "./AgentIcon";

const sugKey = (s) => `${s.from}->${s.to}:${s.rooms.join(",")}`;

export default function AgentWidget({
  suggestions = [],
  requests = [],        // [{ log, suggestion }]
  aiNote = "",
  dark = false,
  openSignal = 0,
  onApplySwap,
  onDismissSwap,
  onApplyRequest,
  onDismissRequest,
}) {
  const [open, setOpen] = React.useState(false);

  const actionable = suggestions.length + requests.filter(r => r.suggestion).length;
  const count = suggestions.length + requests.length;

  // Auto-otwórz po kliknięciu powiadomienia Windows / bannera.
  React.useEffect(() => { if (openSignal) setOpen(true); }, [openSignal]);
  // Domknij, gdy nie ma już nic do pokazania.
  React.useEffect(() => { if (count === 0) setOpen(false); }, [count]);

  const hasItems = count > 0;

  return (
    <div className={`cc-agent-root${dark ? " cc-agent-root--dark" : ""}`}>
      {open && hasItems && (
        <div className="cc-agent-pop" role="dialog" aria-label="Agent AI — propozycje">
          <div className="cc-agent-pop-head">
            <span className="cc-agent-pop-title"><AgentIcon size={15} style={{verticalAlign:"-2px"}} /> Agent AI</span>
            <button className="cc-agent-pop-close" onClick={() => setOpen(false)} aria-label="Zamknij">✕</button>
          </div>

          <div className="cc-agent-pop-body">
            {/* Propozycje zamian */}
            {suggestions.map((s) => (
              <div key={"s-" + sugKey(s)} className="cc-agent-card">
                <div className="cc-agent-card-q">
                  Czy mogę przenieść <b>{s.rooms.length}</b> pok. ({s.rooms.join(", ")}):{" "}
                  <b>{s.from}</b> → <b>{s.to}</b>?
                </div>
                <div className="cc-agent-card-why">{aiNote || s.reason}</div>
                <div className="cc-agent-card-actions">
                  <button className="cc-agent-btn cc-agent-btn--ghost" onClick={() => onDismissSwap?.(s)}>Odrzuć</button>
                  <button className="cc-agent-btn cc-agent-btn--go" onClick={() => onApplySwap?.(s)}>Zastosuj</button>
                </div>
              </div>
            ))}

            {/* Prośby o pokój */}
            {requests.map(({ log, suggestion }) => (
              <div key={"r-" + log.id} className="cc-agent-card cc-agent-card--req">
                <div className="cc-agent-card-q">
                  🙋 <b>{log.worker}</b> prosi o pokój
                </div>
                <div className="cc-agent-card-why">
                  {suggestion
                    ? suggestion.reason
                    : `${log.worker} prosi o pokój, ale teraz nie ma czego oddać (wszyscy zrównoważeni).`}
                </div>
                <div className="cc-agent-card-actions">
                  <button className="cc-agent-btn cc-agent-btn--ghost" onClick={() => onDismissRequest?.({ log, suggestion })}>
                    {suggestion ? "Odrzuć" : "OK"}
                  </button>
                  {suggestion && (
                    <button className="cc-agent-btn cc-agent-btn--go" onClick={() => onApplyRequest?.({ log, suggestion })}>
                      Zastosuj
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <button
        className={`cc-agent-fab${hasItems ? " cc-agent-fab--alert" : ""}`}
        onClick={() => setOpen(o => !o)}
        aria-label={hasItems ? `Agent AI — ${actionable} propozycji` : "Agent AI"}
        title={hasItems ? "Agent ma propozycje" : "Agent AI — czuwa"}
      >
        <span className="cc-agent-fab-icon" aria-hidden="true"><AgentIcon size={22} /></span>
        {actionable > 0 && <span className="cc-agent-badge">{actionable}</span>}
      </button>
    </div>
  );
}
