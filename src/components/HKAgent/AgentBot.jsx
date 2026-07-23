// Globalny bot agenta AI.
// • W sekcji HK (inHK) chowa się do małego UCHWYTU w prawym-dolnym rogu. Klik w róg
//   „wyskakuje" bota (FAB + popover) — w popoverze są bieżące zdarzenia/propozycje
//   ORAZ HISTORIA tego, co bot pisał. Zamknięcie chowa go z powrotem.
// • W KAŻDYM innym oknie aplikacji wyskakuje tylko chwilowy dymek („mowa" bota)
//   na nowe zdarzenie i sam znika — z przyciskiem „Pokaż" prowadzącym do HK.
// Agent NIGDY nie przenosi sam — zawsze pyta recepcję o zgodę.
import React from "react";
import AgentIcon from "./AgentIcon";

const sugKey = (s) => `${s.from}->${s.to}:${s.rooms.join(",")}`;
const BUBBLE_MS = 9000;
const HIST_KEY = (d) => `hk-agent-history-${d || "x"}`;
const HIST_MAX = 150;

function loadHistory(dateKey) {
  try { return JSON.parse(localStorage.getItem(HIST_KEY(dateKey)) || "[]"); }
  catch { return []; }
}
function saveHistory(dateKey, list) {
  try { localStorage.setItem(HIST_KEY(dateKey), JSON.stringify(list)); } catch {}
}
// ISO/`YYYY-MM-DDTHH:mm` → "HH:mm" (PL). Bez/niepoprawny czas → teraz.
const tsToTime = (ts) => {
  const d = ts ? new Date(ts) : new Date();
  const ok = !isNaN(d.getTime());
  return (ok ? d : new Date()).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" });
};

export default function AgentBot({
  inHK = false,
  dateKey = "",
  suggestions = [],
  requests = [],        // [{ log, suggestion }]
  notices = [],         // [{ id, kind, text, ts }]
  attention = null,     // { kind, text } — sygnał nowego zdarzenia (dymek)
  dark = false,
  openSignal = 0,
  onApplySwap,
  onDismissSwap,
  onApplyRequest,
  onDismissRequest,
  onDismissNotice,
  onGoToHK,
}) {
  const [revealed, setRevealed] = React.useState(false); // bot wyskoczył z ukrycia?
  const [open, setOpen] = React.useState(false);         // popover otwarty?
  const [showHist, setShowHist] = React.useState(false); // zakładka Historia
  const [bubble, setBubble] = React.useState(null);
  const bubbleTimer = React.useRef(null);

  // Historia tego, co bot zgłaszał dziś. Trwała per data. Źródłem jest REALNY strumień
  // zdarzeń (notices/requests/suggestions), nie ulotny `attention` — dzięki temu wpisy
  // pojawiają się od razu po wejściu do apki (też te sprzed otwarcia okna) i nie giną.
  // Dedup po stabilnym `id`; czas z prawdziwego znacznika zdarzenia, nie z momentu zapisu.
  const [history, setHistory] = React.useState(() => loadHistory(dateKey));
  React.useEffect(() => { setHistory(loadHistory(dateKey)); }, [dateKey]);
  React.useEffect(() => {
    const events = [
      ...notices.map(n => ({ id: n.id, text: n.text, kind: n.kind, ts: n.ts })),
      ...requests.map(r => ({
        id: "req:" + r.log.id,
        text: r.suggestion?.reason || `🙋 ${r.log.worker} prosi o pokój`,
        kind: "request",
        ts: r.log.created_at || r.log.ts || null,
      })),
      ...suggestions.map(s => ({
        id: "swap:" + sugKey(s),
        text: `Propozycja zamiany: ${s.from} → ${s.to} (${s.rooms.length} pok.)`,
        kind: "swap",
        ts: null, // brak czasu — użyj momentu pierwszego zobaczenia
      })),
    ].filter(e => e.id && e.text);
    if (!events.length) return;
    setHistory(prev => {
      const seen = new Set(prev.map(h => h.id));
      const fresh = events.filter(e => !seen.has(e.id));
      if (!fresh.length) return prev;
      const entries = fresh.map(e => ({
        id: e.id, text: e.text, kind: e.kind || "swap",
        time: tsToTime(e.ts), ts: e.ts || new Date().toISOString(),
      }));
      const next = [...entries, ...prev]
        .sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
        .slice(0, HIST_MAX);
      saveHistory(dateKey, next);
      return next;
    });
  }, [notices, requests, suggestions, dateKey]);

  const actionable = suggestions.length + requests.filter(r => r.suggestion).length;
  const count = suggestions.length + requests.length + notices.length;
  const hasItems = count > 0;

  // Klik powiadomienia Windows / dymka („Pokaż") → wyskocz i otwórz (tylko w HK).
  React.useEffect(() => { if (openSignal && inHK) { setRevealed(true); setOpen(true); } }, [openSignal, inHK]);

  // Dymek: wyskakuje na nowe zdarzenie (attention) w KAŻDYM oknie, znika sam.
  React.useEffect(() => {
    if (!attention) return;
    setBubble(attention);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
    bubbleTimer.current = setTimeout(() => setBubble(null), BUBBLE_MS);
    return () => { if (bubbleTimer.current) clearTimeout(bubbleTimer.current); };
  }, [attention]);

  // Poza HK i bez dymka — nic nie renderuj (bot dostępny tylko w HK).
  if (!inHK && !bubble) return null;

  const closeBubble = () => {
    setBubble(null);
    if (bubbleTimer.current) clearTimeout(bubbleTimer.current);
  };
  const goHK = () => { closeBubble(); onGoToHK?.(); };
  // Zatwierdź/odrzuć propozycję wprost z dymka — bez opuszczania bieżącego panelu.
  const actBubble = (apply) => {
    const a = bubble?.action;
    closeBubble();
    if (!a) return;
    if (a.type === "swap") (apply ? onApplySwap : onDismissSwap)?.(a.swap);
    else if (a.type === "request") (apply ? onApplyRequest : onDismissRequest)?.(a.request);
  };
  const reveal = () => { setRevealed(true); setOpen(true); };       // „wyskocz z ukrycia"
  const hide = () => { setOpen(false); setRevealed(false); setShowHist(false); }; // schowaj

  return (
    <div className={`cc-agent-root${dark ? " cc-agent-root--dark" : ""}`}>
      {/* ── Dymek „mowy" bota — nad uchwytem w HK, floating w innych oknach ── */}
      {bubble && (
        <div className={`cc-agent-bubble${inHK ? "" : " cc-agent-bubble--float"}${!inHK && bubble.action ? " cc-agent-bubble--act" : ""}`} role="status">
          <span className="cc-agent-bubble-icon" aria-hidden="true"><AgentIcon size={18} /></span>
          <div className="cc-agent-bubble-text">{bubble.text}</div>
          <div className="cc-agent-bubble-actions">
            {!inHK && bubble.action ? (
              <>
                <button className="cc-agent-bubble-btn cc-agent-bubble-btn--ghost" onClick={() => actBubble(false)}>Odrzuć</button>
                <button className="cc-agent-bubble-btn cc-agent-bubble-btn--go" onClick={() => actBubble(true)}>Zastosuj</button>
              </>
            ) : (
              !inHK && <button className="cc-agent-bubble-btn" onClick={goHK}>Pokaż</button>
            )}
            <button className="cc-agent-bubble-x" onClick={closeBubble} aria-label="Zamknij">✕</button>
          </div>
        </div>
      )}

      {/* ── Popover (tylko w HK, po wyskoczeniu) ── */}
      {inHK && revealed && open && (
        <div className="cc-agent-pop" role="dialog" aria-label="Agent AI — zdarzenia, propozycje, historia">
          <div className="cc-agent-pop-head">
            <span className="cc-agent-pop-title"><AgentIcon size={15} style={{verticalAlign:"-2px"}} /> Agent AI</span>
            <div className="cc-agent-pop-tabs">
              <button className={`cc-agent-pop-tab${!showHist ? " is-active" : ""}`} onClick={() => setShowHist(false)}>
                Teraz{count > 0 ? ` (${count})` : ""}
              </button>
              <button className={`cc-agent-pop-tab${showHist ? " is-active" : ""}`} onClick={() => setShowHist(true)}>
                Historia
              </button>
            </div>
            <button className="cc-agent-pop-close" onClick={hide} aria-label="Schowaj">✕</button>
          </div>

          {showHist ? (
            <div className="cc-agent-pop-body">
              {history.length === 0
                ? <div className="cc-agent-empty">Brak historii — bot jeszcze nic nie zgłosił dziś.</div>
                : history.map((h, i) => (
                    <div key={h.id || i} className="cc-agent-hist-row">
                      <span className="cc-agent-hist-time">{h.time}</span>
                      <span className="cc-agent-hist-text">{h.text}</span>
                    </div>
                  ))
              }
            </div>
          ) : (
            <div className="cc-agent-pop-body">
              {!hasItems && (
                <div className="cc-agent-empty">Czuwam 👀 — brak nowych zdarzeń.</div>
              )}

              {/* Zdarzenia informacyjne (usterki, pilne pokoje, odpowiedzi) — bez „OK":
                  znikają same po 5 min i zostają w Historii. Tylko przypomnienia o
                  zadaniach recepcji (kind="task") trzeba odhaczyć, by nie wracały. */}
              {notices.map((n) => (
                <div key={n.id} className={`cc-agent-card cc-agent-card--note cc-agent-card--${n.kind}`}>
                  <div className="cc-agent-card-q">{n.text}</div>
                  {n.kind === "task" && (
                    <div className="cc-agent-card-actions">
                      <button className="cc-agent-btn cc-agent-btn--ghost" onClick={() => onDismissNotice?.(n.id)}>OK</button>
                    </div>
                  )}
                </div>
              ))}

              {/* Propozycje zamian */}
              {suggestions.map((s) => (
                <div key={"s-" + sugKey(s)} className="cc-agent-card">
                  <div className="cc-agent-card-q">
                    Czy mogę przenieść <b>{s.rooms.length}</b> pok. ({s.rooms.join(", ")}):{" "}
                    <b>{s.from}</b> → <b>{s.to}</b>?
                  </div>
                  <div className="cc-agent-card-why">{s.reason}</div>
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
          )}
        </div>
      )}

      {/* ── FAB po wyskoczeniu — klik otwiera/zamyka popover ── */}
      {inHK && revealed && (
        <button
          className={`cc-agent-fab${hasItems ? " cc-agent-fab--alert" : ""}`}
          onClick={() => setOpen(o => !o)}
          aria-label={hasItems ? `Agent AI — ${count} zdarzeń` : "Agent AI"}
          title={hasItems ? "Agent ma nowe zdarzenia" : "Agent AI"}
        >
          <span className="cc-agent-fab-icon" aria-hidden="true"><AgentIcon size={22} /></span>
          {count > 0 && <span className="cc-agent-badge">{count}</span>}
        </button>
      )}

      {/* ── Uchwyt w rogu (bot ukryty) — klik „wyskakuje" bota ── */}
      {inHK && !revealed && (
        <button
          className={`cc-agent-handle${hasItems ? " cc-agent-handle--alert" : ""}`}
          onClick={reveal}
          aria-label={hasItems ? `Pokaż agenta AI — ${count} zdarzeń` : "Pokaż agenta AI"}
          title="Agent AI — kliknij, by pokazać"
        >
          <span className="cc-agent-handle-icon" aria-hidden="true"><AgentIcon size={20} /></span>
          {count > 0 && <span className="cc-agent-handle-dot">{count}</span>}
        </button>
      )}
    </div>
  );
}
