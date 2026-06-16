import React from "react";
import { Send, ArrowLeftRight, Check, X, Hash, Users, Wrench, Home } from "lucide-react";
import { loadJson, saveJson } from "../../lib/storage";
import { TENANT_ID } from "../../lib/constants";
import { supabase } from "../../lib/supabase";

const TABLE = "messages";
const LS_KEY = "reception-team-messages";
const SEEN_KEY = "reception-team-lastseen";

// Kanały czatu zespołowego. id = wartość kolumny `channel` w Supabase.
const CHANNELS = [
  { id: "team",        label: "Zespół",       icon: Users, hint: "Ogólny kanał całego zespołu" },
  { id: "hk",          label: "Housekeeping", icon: Home,  hint: "Recepcja ↔ pokojówki" },
  { id: "konserwator", label: "Konserwacja",  icon: Wrench, hint: "Recepcja ↔ konserwator" },
];

// Deterministyczny gradient awatara wg imienia.
function avatarGradient(name) {
  const palettes = [
    ["#B065A0", "#6E2B5C"], ["#5BA8E8", "#1e40af"], ["#2BD4A0", "#0f766e"],
    ["#F4C055", "#B58626"], ["#FF5471", "#9D2A40"], ["#B49AFF", "#5b21b6"],
    ["#dc2626", "#991b1b"], ["#C8A269", "#8A6E3F"],
  ];
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  const [a, b] = palettes[h % palettes.length];
  return `linear-gradient(135deg,${a},${b})`;
}
const initials = (name) => (name || "?").trim().slice(0, 1).toUpperCase();

function fmtTime(iso) {
  try { return new Date(iso).toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}
function dayLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const isSame = d.toDateString() === today.toDateString();
  const yest = new Date(today); yest.setDate(today.getDate() - 1);
  if (isSame) return "Dziś";
  if (d.toDateString() === yest.toDateString()) return "Wczoraj";
  return d.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" });
}

export default function TeamChat({ employeeName, isManager, showToast, hkStaff = [], onApplySwap, onSeen }) {
  const me = employeeName || "Recepcja";
  const [channel, setChannel] = React.useState("team");
  const [messages, setMessages] = React.useState(() => loadJson(LS_KEY, []));
  const [text, setText] = React.useState("");
  const [swapOpen, setSwapOpen] = React.useState(false);
  const [swapTo, setSwapTo] = React.useState("");
  const [swapRooms, setSwapRooms] = React.useState("");
  const threadRef = React.useRef(null);

  // ── Persist do localStorage ──
  React.useEffect(() => { saveJson(LS_KEY, messages); }, [messages]);

  // ── Supabase fetch + realtime (wzorzec VouchersPanel) ──
  const refetch = React.useCallback(() => {
    if (!supabase) return;
    supabase.from(TABLE).select("*").eq("tenant_id", TENANT_ID)
      .order("created_at", { ascending: true })
      .then(({ data, error }) => {
        if (error) { console.error("[team-chat] fetch:", error.message); return; }
        if (data) { setMessages(data); saveJson(LS_KEY, data); }
      });
  }, []);

  React.useEffect(() => {
    if (!supabase) return;
    refetch();
    const ch = supabase.channel("team-chat")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `tenant_id=eq.${TENANT_ID}` }, refetch)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [refetch]);

  // ── Oznacz kanał jako przeczytany przy wejściu ──
  React.useEffect(() => {
    const seen = loadJson(SEEN_KEY, {});
    seen[channel] = new Date().toISOString();
    saveJson(SEEN_KEY, seen);
    onSeen?.();
  }, [channel, messages.length, onSeen]);

  // ── Auto-scroll na dół przy nowych wiadomościach ──
  React.useEffect(() => {
    const el = threadRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [channel, messages]);

  const channelMsgs = React.useMemo(
    () => messages.filter(m => (m.channel || "team") === channel)
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at)),
    [messages, channel]
  );

  const unreadByChannel = React.useMemo(() => {
    const seen = loadJson(SEEN_KEY, {});
    const out = {};
    CHANNELS.forEach(c => {
      const since = seen[c.id] ? new Date(seen[c.id]).getTime() : 0;
      out[c.id] = messages.filter(m =>
        (m.channel || "team") === c.id &&
        m.sender !== me &&
        new Date(m.created_at).getTime() > since
      ).length;
    });
    return out;
  }, [messages, me]);

  const pushMessage = async (row) => {
    setMessages(prev => [...prev, row]);
    if (supabase) {
      const { error } = await supabase.from(TABLE).insert(row);
      if (error) showToast?.("Błąd Supabase: " + error.message, "warning");
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    await pushMessage({
      id: crypto.randomUUID(), tenant_id: TENANT_ID, channel,
      type: "text", sender: me, body,
      created_at: new Date().toISOString(),
    });
  };

  const sendSwap = async () => {
    const rooms = swapRooms.split(/[,\s]+/).map(r => r.trim()).filter(Boolean);
    if (!swapTo || rooms.length === 0) { showToast?.("Podaj osobę i pokoje.", "warning"); return; }
    setSwapOpen(false); setSwapTo(""); setSwapRooms("");
    await pushMessage({
      id: crypto.randomUUID(), tenant_id: TENANT_ID, channel,
      type: "swap", sender: me,
      body: `Propozycja zamiany: ${me} → ${swapTo} (pokoje: ${rooms.join(", ")})`,
      payload: { from: me, to: swapTo, rooms, status: "pending" },
      created_at: new Date().toISOString(),
    });
  };

  const resolveSwap = async (msg, status) => {
    const payload = { ...(msg.payload || {}), status, resolved_by: me, resolved_at: new Date().toISOString() };
    setMessages(prev => prev.map(m => m.id === msg.id ? { ...m, payload } : m));
    if (supabase) {
      const { error } = await supabase.from(TABLE).update({ payload }).eq("id", msg.id);
      if (error) showToast?.("Błąd Supabase: " + error.message, "warning");
    }
    if (status === "accepted") {
      try { await onApplySwap?.({ from: payload.from, to: payload.to, rooms: payload.rooms }); }
      catch (e) { showToast?.("Zamiana zapisana w czacie, ale nie udało się przepiąć HK: " + e.message, "warning"); }
      showToast?.(`Zamiana zaakceptowana: ${payload.from} → ${payload.to}`, "success");
    } else {
      showToast?.("Propozycja zamiany odrzucona.", "info");
    }
  };

  const activeChannel = CHANNELS.find(c => c.id === channel) || CHANNELS[0];

  return (
    <div className="cc-chat">
      {/* ── Kanały ── */}
      <aside className="cc-chat-channels">
        <div className="cc-chat-channels-title">Kanały</div>
        {CHANNELS.map(c => {
          const Icon = c.icon;
          const unread = unreadByChannel[c.id] || 0;
          return (
            <button
              key={c.id}
              type="button"
              className={`cc-chat-channel${channel === c.id ? " cc-chat-channel--on" : ""}`}
              onClick={() => setChannel(c.id)}>
              <Icon size={15} className="cc-chat-channel-ic" />
              <span className="cc-chat-channel-lbl">{c.label}</span>
              {unread > 0 && <span className="cc-chat-channel-badge">{unread}</span>}
            </button>
          );
        })}
      </aside>

      {/* ── Wątek ── */}
      <div className="cc-chat-thread-col">
        <header className="cc-chat-head">
          <div className="cc-chat-head-icon"><Hash size={16} /></div>
          <div>
            <div className="cc-chat-head-name">{activeChannel.label}</div>
            <div className="cc-chat-head-sub">{activeChannel.hint}</div>
          </div>
        </header>

        <div className="cc-chat-messages" ref={threadRef}>
          {channelMsgs.length === 0 ? (
            <div className="cc-chat-empty">
              <Hash size={40} strokeWidth={1.4} />
              <div>Brak wiadomości w kanale „{activeChannel.label}".</div>
              <div className="cc-chat-empty-sub">Napisz pierwszą wiadomość poniżej.</div>
            </div>
          ) : channelMsgs.map((m, i) => {
            const prev = channelMsgs[i - 1];
            const showDay = !prev || dayLabel(prev.created_at) !== dayLabel(m.created_at);
            const mine = m.sender === me;

            if (m.type === "swap") {
              const p = m.payload || {};
              const canResolve = !mine && (isManager || p.to === me) && p.status === "pending";
              return (
                <React.Fragment key={m.id}>
                  {showDay && <div className="cc-chat-day"><span>{dayLabel(m.created_at)}</span></div>}
                  <div className={`cc-chat-swap cc-chat-swap--${p.status || "pending"}`}>
                    <div className="cc-chat-swap-head">
                      <ArrowLeftRight size={14} /> Propozycja zamiany pokoi
                    </div>
                    <div className="cc-chat-swap-body">
                      <b>{p.from}</b> chce przekazać <b>{(p.rooms || []).join(", ")}</b> osobie <b>{p.to}</b>
                    </div>
                    {p.status === "pending" ? (
                      canResolve ? (
                        <div className="cc-chat-swap-actions">
                          <button type="button" className="cc-chat-swap-btn cc-chat-swap-btn--ok" onClick={() => resolveSwap(m, "accepted")}>
                            <Check size={13} /> Akceptuję
                          </button>
                          <button type="button" className="cc-chat-swap-btn cc-chat-swap-btn--no" onClick={() => resolveSwap(m, "declined")}>
                            <X size={13} /> Odrzucam
                          </button>
                        </div>
                      ) : (
                        <div className="cc-chat-swap-status">Oczekuje na decyzję: {p.to}</div>
                      )
                    ) : (
                      <div className={`cc-chat-swap-status cc-chat-swap-status--${p.status}`}>
                        {p.status === "accepted" ? "✓ Zaakceptowano" : "✕ Odrzucono"}
                        {p.resolved_by ? ` · ${p.resolved_by}` : ""}
                      </div>
                    )}
                    <div className="cc-chat-swap-time">{fmtTime(m.created_at)}</div>
                  </div>
                </React.Fragment>
              );
            }

            return (
              <React.Fragment key={m.id}>
                {showDay && <div className="cc-chat-day"><span>{dayLabel(m.created_at)}</span></div>}
                <div className={`cc-chat-msg${mine ? " cc-chat-msg--mine" : ""}`}>
                  <div className="cc-chat-msg-avatar" style={{ background: avatarGradient(m.sender) }}>
                    {initials(m.sender)}
                  </div>
                  <div className="cc-chat-msg-body">
                    <div className="cc-chat-msg-meta">
                      <b>{m.sender}</b> · {fmtTime(m.created_at)}
                    </div>
                    <div className="cc-chat-msg-bubble">{m.body}</div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>

        {/* ── Composer ── */}
        {swapOpen && (
          <div className="cc-chat-swap-form">
            <div className="cc-chat-swap-form-title"><ArrowLeftRight size={13} /> Zaproponuj zamianę pokoi</div>
            <div className="cc-chat-swap-form-row">
              <select className="input" value={swapTo} onChange={e => setSwapTo(e.target.value)}>
                <option value="">— komu przekazać —</option>
                {hkStaff.filter(n => n !== me).map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <input
                className="input"
                placeholder="Pokoje, np. 404 407"
                value={swapRooms}
                onChange={e => setSwapRooms(e.target.value)} />
              <button type="button" className="btn btn-primary" onClick={sendSwap}>Wyślij</button>
              <button type="button" className="btn btn-ghost" onClick={() => setSwapOpen(false)}>Anuluj</button>
            </div>
          </div>
        )}

        <div className="cc-chat-composer">
          <button
            type="button"
            className="cc-chat-composer-swap"
            title="Zaproponuj zamianę pokoi"
            onClick={() => setSwapOpen(v => !v)}>
            <ArrowLeftRight size={16} />
          </button>
          <textarea
            className="cc-chat-composer-input"
            placeholder={`Napisz w „${activeChannel.label}"...`}
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
          <button type="button" className="cc-chat-composer-send" onClick={send} disabled={!text.trim()}>
            <Send size={16} />
          </button>
        </div>
        <div className="cc-chat-composer-hint">Enter — wyślij · Shift+Enter — nowa linia</div>
      </div>
    </div>
  );
}
