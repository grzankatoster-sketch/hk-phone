import React, { useState, useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, X, Sparkles, BookOpen } from "lucide-react";
import { STORAGE_KEYS, loadJson } from "../../lib/storage";
import { emptyCarryOver, SHIFT_OPTIONS, SHIFT_SHORT_LABELS, TENANT_ID } from "../../lib/constants";
import { searchRecords, llmReady } from "../../lib/llm";
import { supabase } from "../../lib/supabase";
import { todayKey } from "../../lib/dates";

// Wyszukiwarka AI „gdzie to znajdę / kto / co / kiedy". Po otwarciu: puste pole —
// wpisujesz pytanie, AI przeszukuje WIEDZĘ (Wikirecepcja — instrukcje, procedury,
// schematy) oraz historię operacyjną (logi HK, notatki, usterki, raporty, przekazania)
// i odpowiada. Wyniki (źródła) pojawiają się dopiero po wyszukaniu.
export default function GlobalSearchModal({ onClose, dark, wikiEntries = [], onOpenWiki }) {
  const [q, setQ] = useState("");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiHits, setAiHits] = useState([]);
  const [aiBusy, setAiBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 60); }, []);

  // Lokalne zapisy (przekazania, notatki, powiadomienia, przypomnienia)
  const allItems = useMemo(() => {
    const items = [];
    const parseDate = (s) => {
      if (!s) return 0;
      try {
        if (s.includes("T")) return new Date(s).getTime();
        const p = s.split(", ");
        if (p.length >= 2) { const d = p[0].split("."); return new Date(`${d[2]}-${d[1]}-${d[0]}T${p[1]}:00`).getTime(); }
        return 0;
      } catch { return 0; }
    };
    const carry = loadJson(STORAGE_KEYS.carry, emptyCarryOver);
    SHIFT_OPTIONS.forEach(s => (carry[s] || []).forEach(t => items.push({
      kiedy: t.createdAt || "", kto: t.createdBy || "—", typ: "przekazane",
      tresc: `${t.text || ""} (${SHIFT_SHORT_LABELS[t.fromShift] || t.fromShift || "—"} → ${SHIFT_SHORT_LABELS[s] || s})`, ts: parseDate(t.createdAt),
    })));
    loadJson(STORAGE_KEYS.handoverNotes, []).forEach(n => items.push({
      kiedy: n.createdAt || "", kto: n.employee || "—", typ: "notatka przekazania",
      tresc: n.text || "", ts: parseDate(n.createdAt),
    }));
    loadJson(STORAGE_KEYS.globalNotifications, []).forEach(n => items.push({
      kiedy: n.createdAt || "", kto: n.createdBy || "—", typ: "powiadomienie",
      tresc: n.text || "", ts: parseDate(n.createdAt),
    }));
    loadJson(STORAGE_KEYS.datedReminders, []).forEach(r => items.push({
      kiedy: r.targetDate || r.createdAt || "", kto: r.createdBy || "—", typ: "przypomnienie",
      tresc: r.text || "", ts: parseDate((r.targetDate || "") + "T00:00") || parseDate(r.createdAt),
    }));
    return items;
  }, []);

  // Dane operacyjne z Supabase (logi sprzątania, usterki, raporty zmian) — korpus dla AI
  const [sbRecords, setSbRecords] = useState([]);
  useEffect(() => {
    if (!supabase) return; let stop = false;
    (async () => {
      try {
        const fromKey = todayKey(new Date(Date.now() - 60 * 86400000));
        const fromIso = new Date(Date.now() - 60 * 86400000).toISOString();
        const [logs, faults, reps] = await Promise.all([
          supabase.from("hk_logs").select("date,log_time,worker,action,room,extra").gte("date", fromKey).order("date", { ascending: false }).limit(500),
          supabase.from("faults").select("reported_at,reported_by,room,space_id,description,status,assigned_to").eq("tenant_id", TENANT_ID).gte("reported_at", fromIso).limit(300),
          supabase.from("shift_reports").select("day_key,employee,handover").eq("tenant_id", TENANT_ID).gte("day_key", fromKey).limit(300),
        ]);
        if (stop) return;
        const recs = [];
        (logs.data || []).forEach(l => recs.push({ kiedy: `${l.date} ${l.log_time || ""}`.trim(), kto: l.worker || "—", typ: "sprzątanie", tresc: `${l.action || ""} ${l.room ? "pok. " + l.room : ""} ${l.extra || ""}`.trim() }));
        (faults.data || []).forEach(f => recs.push({ kiedy: (f.reported_at || "").slice(0, 16).replace("T", " "), kto: f.reported_by || "—", typ: "usterka", tresc: `${f.room || f.space_id || ""} ${f.description || ""} (${f.status}${f.assigned_to ? ", " + f.assigned_to : ""})`.trim() }));
        (reps.data || []).forEach(r => { if (r.handover) recs.push({ kiedy: r.day_key, kto: r.employee || "—", typ: "notatka zmiany", tresc: r.handover }); });
        setSbRecords(recs);
      } catch { /* AI działa też na samych danych lokalnych */ }
    })();
    return () => { stop = true; };
  }, []);

  // Baza wiedzy (Wikirecepcja) — instrukcje, procedury, schematy. To pierwszy punkt
  // dla kogoś, kto „nie wie, gdzie coś znaleźć". Zachowujemy wikiId, by ze źródła
  // dało się jednym kliknięciem otworzyć temat w Wiki.
  const wikiItems = useMemo(() => (wikiEntries || []).map(w => ({
    kiedy: w.updatedAt || "", kto: "Wikirecepcja", typ: "wiki",
    tresc: `${w.topic}: ${w.content || ""}`.trim(), wikiId: w.id, topic: w.topic,
  })), [wikiEntries]);

  const aiCorpus = useMemo(() => [
    ...wikiItems,
    ...sbRecords,
    ...allItems.map(i => ({ kiedy: i.kiedy, kto: i.kto, typ: i.typ, tresc: i.tresc })),
  ], [allItems, sbRecords, wikiItems]);

  const runAiSearch = async () => {
    const query = q.trim();
    if (query.length < 2 || aiBusy) return;
    setSearched(true); setAiAnswer(""); setAiHits([]);
    // Prefiltr po słowach kluczowych liczymy ZAWSZE — nawet bez AI pokazujemy źródła
    // (wiki + historia), żeby ktoś, kto nie wie gdzie szukać, od razu trafił na temat.
    const strip = s => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");
    const qWords = [...new Set(strip(query).split(/[^a-z0-9]+/).filter(w => w.length > 2))];
    const scored = aiCorpus.map(r => { const hay = strip(`${r.kto} ${r.typ} ${r.tresc}`); const score = qWords.reduce((n, w) => n + (hay.includes(w) || hay.includes(w.slice(0, 4)) ? 1 : 0), 0); return { r, score }; });
    // Wiki dostaje lekki bonus — to baza wiedzy, najczęściej szukana „gdzie to jest".
    const hits = scored.filter(s => s.score > 0).sort((a, b) => (b.score + (b.r.typ === "wiki" ? 0.5 : 0)) - (a.score + (a.r.typ === "wiki" ? 0.5 : 0))).slice(0, 40).map(s => s.r);
    setAiHits(hits);
    if (!hits.length) { setAiAnswer("Brak wpisów ani tematów Wiki pasujących do zapytania."); return; }
    if (!llmReady) { setAiAnswer("Asystent AI niedostępny — poniżej dopasowane źródła (Wiki i historia)."); return; }
    setAiBusy(true);
    try {
      const text = await searchRecords(query, hits);
      setAiAnswer(text || "Brak odpowiedzi.");
    } catch (e) {
      setAiAnswer(e?.code === "rate_limited" ? "Limit zapytań — spróbuj za chwilę." : "Wyszukiwarka niedostępna.");
    } finally { setAiBusy(false); }
  };

  const EXAMPLES = ["jak działają zamki", "procedura zameldowania gościa", "co robić przy reklamacji", "kiedy Grzegorz sprzątał pokój 304", "ostatnie usterki elektryczne", "co działo się na nocnej zmianie"];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div initial={{ opacity: 0, scale: .96, y: -10 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: .96 }} transition={{ duration: .18 }}
        className={`modal wide-modal ${dark ? "dark-modal" : ""}`} style={{ maxWidth: 660, maxHeight: "82vh", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }} onClick={e => e.stopPropagation()}>
        {/* Pasek wpisywania */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "13px 16px", borderBottom: `1px solid ${dark ? "var(--dark-border)" : "var(--border-light)"}` }}>
          <Sparkles size={16} style={{ color: "#6366f1", flexShrink: 0 }} />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => e.key === "Enter" && runAiSearch()}
            placeholder="Szukaj wszędzie: instrukcje, procedury, kto/co/kiedy…"
            style={{ flex: 1, border: "none", outline: "none", fontSize: 14, background: "transparent", color: dark ? "var(--dark-text)" : "var(--text-primary)" }} />
          <button onClick={runAiSearch} disabled={aiBusy || q.trim().length < 2}
            style={{ border: "none", borderRadius: 8, padding: "7px 14px", fontSize: 13, fontWeight: 700, cursor: (aiBusy || q.trim().length < 2) ? "not-allowed" : "pointer", opacity: (aiBusy || q.trim().length < 2) ? .5 : 1, background: "#6366f1", color: "#fff", flexShrink: 0 }}>
            {aiBusy ? "Szukam…" : "Szukaj"}
          </button>
          <button onClick={onClose} style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--text-muted)", display: "flex" }}><X size={15} /></button>
        </div>

        {/* Treść */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px" }}>
          {!searched && (
            <div style={{ textAlign: "center", color: "var(--text-faint)", padding: "26px 10px" }}>
              <Sparkles size={26} style={{ color: "#6366f1", opacity: .7, marginBottom: 10 }} />
              <div style={{ fontSize: 14, fontWeight: 600, color: dark ? "var(--dark-text-muted)" : "var(--text-muted)", marginBottom: 4 }}>Nie wiesz, gdzie to znaleźć? Zapytaj tutaj</div>
              <div style={{ fontSize: 12.5, marginBottom: 16 }}>Wpisz pytanie i naciśnij Enter. Przeszukam Wikirecepcję (instrukcje, procedury, schematy) oraz historię: sprzątanie, usterki, notatki i raporty.</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
                {EXAMPLES.map(ex => (
                  <button key={ex} onClick={() => { setQ(ex); setTimeout(runAiSearch, 0); }}
                    style={{ fontSize: 12, padding: "6px 12px", borderRadius: 999, cursor: "pointer", border: `1px solid ${dark ? "var(--dark-border)" : "var(--border-medium)"}`, background: dark ? "transparent" : "var(--bg-card)", color: dark ? "var(--dark-text-muted)" : "var(--text-muted)" }}>
                    {ex}
                  </button>
                ))}
              </div>
            </div>
          )}

          {searched && (
            <>
              <div style={{ padding: "12px 14px", borderRadius: "var(--radius-md)", background: dark ? "rgba(99,102,241,.12)" : "rgba(99,102,241,.07)", border: `1px solid ${dark ? "rgba(99,102,241,.4)" : "rgba(99,102,241,.3)"}` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: ".04em", color: "#6366f1", marginBottom: aiAnswer ? 8 : 0 }}>
                  🔮 Odpowiedź AI {aiBusy && <span style={{ fontWeight: 500, textTransform: "none", opacity: .7 }}>· szukam…</span>}
                </div>
                {aiAnswer && <div style={{ fontSize: 13.5, lineHeight: 1.65, whiteSpace: "pre-wrap", color: dark ? "var(--dark-text)" : "var(--text-primary)" }}>{aiAnswer}</div>}
              </div>

              {aiHits.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--text-faint)", margin: "0 2px 7px" }}>
                    Źródła ({aiHits.length})
                  </div>
                  {aiHits.map((r, i) => {
                    const isWiki = r.typ === "wiki";
                    const clickable = isWiki && typeof onOpenWiki === "function";
                    return (
                      <div key={i} onClick={clickable ? () => onOpenWiki(r.wikiId) : undefined}
                        style={{ display: "flex", gap: 9, padding: "8px 10px", borderRadius: "var(--radius-md)", marginBottom: 3, cursor: clickable ? "pointer" : "default",
                          background: isWiki ? (dark ? "rgba(212,175,55,.10)" : "rgba(212,175,55,.10)") : (dark ? "rgba(255,255,255,.03)" : "var(--bg-secondary)"),
                          border: `0.5px solid ${isWiki ? "rgba(212,175,55,.4)" : (dark ? "var(--dark-border)" : "var(--border-light)")}` }}>
                        {isWiki && <BookOpen size={14} style={{ color: "var(--gold)", flexShrink: 0, marginTop: 1 }} />}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, color: dark ? "var(--dark-text)" : "var(--text-primary)" }}>{r.tresc}</div>
                          <div style={{ fontSize: 10.5, color: "var(--text-muted)", marginTop: 2 }}>{isWiki ? "Wikirecepcja — kliknij, aby otworzyć" : r.typ}{!isWiki && r.kto && r.kto !== "—" ? ` · ${r.kto}` : ""}{!isWiki && r.kiedy ? ` · ${r.kiedy}` : ""}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "7px 16px", borderTop: `1px solid ${dark ? "var(--dark-border)" : "var(--border-light)"}`, fontSize: 11, color: "var(--text-faint)", display: "flex", justifyContent: "space-between" }}>
          <span>{searched && aiHits.length ? `${aiHits.length} pasujących wpisów` : "Enter — szukaj"}</span>
          <span>Esc — zamknij</span>
        </div>
      </motion.div>
    </div>
  );
}
