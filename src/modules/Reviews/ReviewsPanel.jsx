import React from "react";
import { AnimatePresence } from "framer-motion";
import { Plus, Copy, Check, MessageSquare, Trash2, ChevronDown, ChevronUp, Sparkles, KeyRound, Eye, EyeOff, RefreshCw, Wifi } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { REVIEWS_SEED } from "./reviewsSeed";
import ReviewFormModal from "../../components/modals/ReviewFormModal";

const THIS_YEAR = new Date().getFullYear();
const REVIEW_RANGE_LAST_6_MONTHS = "last6m";
const REVIEW_RANGE_ALL = "all";
const BOOKING_SYNC_INTERVAL_MS = 15 * 60 * 1000;

// Oficjalna srednia z Booking.com (wyswietlana u gory, nie liczona z naszych danych)
const BCOM_SCORE = 8.7;
const BCOM_TOTAL = 2746;

function scoreColor(s) {
  if (s >= 8)  return { bg: "#D1FAE5", color: "#065F46", border: "#6EE7B7" };
  if (s >= 6)  return { bg: "#FEF3C7", color: "#92400E", border: "#FCD34D" };
  return              { bg: "#FEE2E2", color: "#991B1B", border: "#FCA5A5" };
}

function scoreLabel(s) {
  if (s >= 9)   return "Wyjątkowy";
  if (s >= 8)   return "Bardzo dobry";
  if (s >= 7)   return "Dobry";
  if (s >= 6)   return "Przyjemny";
  if (s >= 5)   return "Przeciętny";
  return              "Słaby";
}

const REPLY_TEMPLATES = {
  positive: (name, score) =>
    `Szanowny Gościu ${name},\n\nDziękujemy serdecznie za wystawienie nam oceny ${score}/10 i za miłe słowa! Cieszymy się, że pobyt w Conrad Comfort spełnił Państwa oczekiwania. Będzie nam miło gościć Państwa ponownie.\n\nZ poważaniem,\nZespół Conrad Comfort`,
  neutral: (name) =>
    `Szanowny Gościu ${name},\n\nDziękujemy za opinię i za wybranie Conrad Comfort. Cieszymy się z pozytywnych spostrzeżeń i przyjmujemy do wiadomości uwagi. Pracujemy stale nad poprawą jakości usług. Zapraszamy ponownie.\n\nZ poważaniem,\nZespół Conrad Comfort`,
  negative: (name) =>
    `Szanowny Gościu ${name},\n\nDziękujemy za szczerość w opinii. Przepraszamy za wszelkie niedogodności, jakie napotkali Państwo podczas pobytu. Państwa uwagi zostały przekazane odpowiednim działom i prosimy o kontakt bezpośredni — chcemy to naprawić. Mamy nadzieję na kolejną szansę.\n\nZ poważaniem,\nZespół Conrad Comfort`,
};

function generateReply(review) {
  if (review.score >= 8) return REPLY_TEMPLATES.positive(review.guest_name, review.score);
  if (review.score >= 6) return REPLY_TEMPLATES.neutral(review.guest_name);
  return REPLY_TEMPLATES.negative(review.guest_name);
}

const SEED_VERSION = 2;

function loadOrSeed() {
  const stored = loadJson(STORAGE_KEYS.reviews, null);
  const seedVer = loadJson(STORAGE_KEYS.reviewsSeedVer, 0);

  if (!stored || stored.length === 0) {
    saveJson(STORAGE_KEYS.reviews, REVIEWS_SEED);
    saveJson(STORAGE_KEYS.reviewsSeedVer, SEED_VERSION);
    return REVIEWS_SEED;
  }

  if (seedVer < SEED_VERSION) {
    // Zachowaj recznie dodane opinie, zastap zaimportowane nowym seedem
    const manual = stored.filter(r => r.added_by !== "import");
    const merged = [...REVIEWS_SEED, ...manual];
    saveJson(STORAGE_KEYS.reviews, merged);
    saveJson(STORAGE_KEYS.reviewsSeedVer, SEED_VERSION);
    return merged;
  }

  return stored;
}

function normalizedReviewText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function reviewDate(review) {
  const d = new Date(review?.submitted_at || 0);
  return Number.isNaN(d.getTime()) ? null : d;
}

function lastSixMonthsCutoff() {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  d.setHours(0, 0, 0, 0);
  return d;
}

function reviewRangeLabel(range) {
  if (range === REVIEW_RANGE_LAST_6_MONTHS) return "ostatnie 6 mies.";
  if (range === REVIEW_RANGE_ALL) return "wszystkie";
  if (String(range).startsWith("year:")) return String(range).slice(5);
  return "wszystkie";
}

function matchesReviewRange(review, range) {
  const d = reviewDate(review);
  if (!d) return false;
  if (range === REVIEW_RANGE_LAST_6_MONTHS) return d >= lastSixMonthsCutoff();
  if (range === REVIEW_RANGE_ALL) return true;
  if (String(range).startsWith("year:")) return d.getFullYear() === Number(String(range).slice(5));
  return true;
}

function reviewMergeKey(review) {
  const d = reviewDate(review);
  const dateKey = d ? d.toISOString().slice(0, 10) : "";
  return [
    normalizedReviewText(review?.guest_name),
    dateKey,
    Number(review?.score || 0).toFixed(1),
  ].join("|");
}

function mergeBookingReviews(existing, incoming) {
  const byId = new Map(existing.map(review => [review.id, review]));
  const byKey = new Map(existing.map(review => [reviewMergeKey(review), review]));
  const result = new Map();

  incoming.forEach(review => {
    const previous = byId.get(review.id) || byKey.get(reviewMergeKey(review));
    result.set(review.id, {
      ...previous,
      ...review,
      response_text: previous?.response_text || review.response_text || "",
      responded_at: previous?.responded_at || review.responded_at || null,
      responded_by: previous?.responded_by || review.responded_by || null,
    });
  });

  existing.forEach(review => {
    const key = reviewMergeKey(review);
    const replaced = incoming.some(next => next.id === review.id || reviewMergeKey(next) === key);
    if (!replaced) result.set(review.id, review);
  });

  return [...result.values()].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
}

function ReviewsPanel({ dark, employeeName, isManager, showToast }) {
  const [reviews, setReviews] = React.useState(loadOrSeed);
  const [showForm, setShowForm] = React.useState(false);
  const [rangeFilter, setRangeFilter] = React.useState(REVIEW_RANGE_LAST_6_MONTHS);
  const [filter, setFilter]         = React.useState("all");
  const [expandedId, setExpandedId] = React.useState(null);
  const [replyDrafts, setReplyDrafts] = React.useState({});
  const [copiedId, setCopiedId]       = React.useState(null);
  const [lastRefresh, setLastRefresh] = React.useState(new Date());
  const [bookingMeta, setBookingMeta] = React.useState(() => loadJson(STORAGE_KEYS.bookingMeta, null));
  const [syncState, setSyncState] = React.useState(window.electronAPI?.syncBookingReviews ? "idle" : "local");
  const [syncMessage, setSyncMessage] = React.useState("");
  const [openaiKey, setOpenaiKey] = React.useState(() => sessionStorage.getItem(STORAGE_KEYS.openaiKey) || "");
  const [showKeyPanel, setShowKeyPanel] = React.useState(false);
  const [keyDraft, setKeyDraft]         = React.useState("");
  const [showKeyText, setShowKeyText]   = React.useState(false);
  const [aiLoading, setAiLoading]       = React.useState({});
  const syncInFlight = React.useRef(false);

  const applyLocalRefresh = React.useCallback(() => {
    const fresh = loadJson(STORAGE_KEYS.reviews, null);
    if (fresh && fresh.length > 0) setReviews(fresh);
    setLastRefresh(new Date());
  }, []);

  const syncBookingReviews = React.useCallback(async ({ manual = false } = {}) => {
    if (syncInFlight.current) return;
    const api = window.electronAPI?.syncBookingReviews;
    if (!api) {
      applyLocalRefresh();
      setSyncState("local");
      setSyncMessage("");
      if (manual) showToast && showToast("Odświeżono zapisane opinie.", "info");
      return;
    }

    syncInFlight.current = true;
    setSyncState("syncing");
    setSyncMessage("");
    try {
      const res = await api();
      const incoming = Array.isArray(res?.reviews) ? res.reviews : [];

      if (incoming.length) {
        setReviews(prev => mergeBookingReviews(prev, incoming));
      } else {
        applyLocalRefresh();
      }

      const meta = {
        officialScore: res?.officialScore || bookingMeta?.officialScore || null,
        officialTotal: res?.officialTotal || bookingMeta?.officialTotal || null,
        fetchedAt: res?.fetchedAt || new Date().toISOString(),
        cutoff: res?.cutoff || null,
        pagesRead: res?.pagesRead || 0,
      };
      setBookingMeta(meta);
      saveJson(STORAGE_KEYS.bookingMeta, meta);
      setLastRefresh(new Date());

      if (res?.ok) {
        setSyncState("online");
        setSyncMessage(`Pobrano ${incoming.length} opinii z ostatnich 6 mies.`);
        if (manual) showToast && showToast(`Booking.com: pobrano ${incoming.length} opinii.`, "success");
      } else {
        setSyncState("local");
        setSyncMessage("Pokazuję zapisane opinie — automatyczne odświeżanie co 15 min.");
        // bez alarmującego toastu; status widać w nagłówku panelu
      }
    } catch (err) {
      applyLocalRefresh();
      setSyncState("local");
      setSyncMessage("Pokazuję zapisane opinie — automatyczne odświeżanie co 15 min.");
    } finally {
      syncInFlight.current = false;
    }
  }, [applyLocalRefresh, bookingMeta?.officialScore, bookingMeta?.officialTotal, showToast]);

  // Live Booking: start + polling co 15 min. Storage event zostaje dla zmian z innych okien.
  React.useEffect(() => {
    syncBookingReviews();
    const onStorage = (e) => {
      if (e.key === STORAGE_KEYS.reviews) applyLocalRefresh();
    };
    window.addEventListener("storage", onStorage);
    const id = setInterval(() => syncBookingReviews(), BOOKING_SYNC_INTERVAL_MS);
    return () => {
      window.removeEventListener("storage", onStorage);
      clearInterval(id);
    };
  }, [applyLocalRefresh, syncBookingReviews]);

  React.useEffect(() => { saveJson(STORAGE_KEYS.reviews, reviews); }, [reviews]);

  const addReview = (r) => {
    const next = [r, ...reviews];
    setReviews(next);
    showToast && showToast("Opinia dodana.", "success");
  };
  const saveReply = (id) => {
    const text = replyDrafts[id] || "";
    if (!text.trim()) return;
    setReviews(prev => prev.map(r => r.id === id
      ? { ...r, response_text: text.trim(), responded_at: new Date().toISOString(), responded_by: employeeName || "Recepcja" }
      : r
    ));
    showToast && showToast("Odpowiedz zapisana.", "success");
  };
  const copyReply = (text, id) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id);
      showToast && showToast("Skopiowano do schowka.", "info");
      setTimeout(() => setCopiedId(null), 2000);
    });
  };
  const deleteReview = (id) => {
    if (!confirm("Usunac te opinie?")) return;
    setReviews(prev => prev.filter(r => r.id !== id));
    showToast && showToast("Opinia usunieta.", "info");
  };
  const autoReply = (id) => {
    const review = reviews.find(r => r.id === id);
    if (!review) return;
    setReplyDrafts(prev => ({ ...prev, [id]: generateReply(review) }));
    setExpandedId(id);
  };

  const saveKey = () => {
    const k = keyDraft.trim();
    setOpenaiKey(k);
    localStorage.removeItem(STORAGE_KEYS.openaiKey);
    if (k) sessionStorage.setItem(STORAGE_KEYS.openaiKey, k);
    else sessionStorage.removeItem(STORAGE_KEYS.openaiKey);
    setShowKeyPanel(false);
    setKeyDraft("");
    showToast && showToast(k ? "Klucz OpenAI zapisany." : "Klucz OpenAI usuniety.", "success");
  };

  const generateAIReply = async (id) => {
    if (!openaiKey) {
      setKeyDraft("");
      setShowKeyPanel(true);
      showToast && showToast("Najpierw ustaw klucz OpenAI API.", "info");
      return;
    }
    const review = reviews.find(r => r.id === id);
    if (!review) return;
    setAiLoading(prev => ({ ...prev, [id]: true }));
    setExpandedId(id);
    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${openaiKey}` },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages: [
            { role: "system", content: "Jestes menedzerem hotelu Conrad Comfort w Krakowie. Odpowiadaj na opinie gosci profesjonalnie, cieplo i po polsku. Odpowiedz powinna miec 3-4 zdania, uzywaj formy Pan/Pani, konczac: Z powazaniem, Zespol Conrad Comfort." },
            { role: "user", content: `GoĹ›Ä‡: ${review.guest_name} (${review.country || ""}), ocena ${review.score}/10.\nPozytywy: ${review.positives || "brak komentarza"}\nNegatywy: ${review.negatives || "brak"}\nNapisz odpowiedz na Booking.com.` }
          ],
          max_tokens: 350,
          temperature: 0.7,
        })
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || "Blad API");
      const reply = data.choices?.[0]?.message?.content?.trim() || "";
      if (!reply) throw new Error("Pusta odpowiedź AI");
      setReplyDrafts(prev => ({ ...prev, [id]: reply }));
      showToast && showToast("Odpowiedz AI wygenerowana.", "success");
    } catch (err) {
      showToast && showToast(`Blad AI: ${err.message}`, "error");
    } finally {
      setAiLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleManualRefresh = () => syncBookingReviews({ manual: true });

  // Lata dostepne w danych
  const availableYears = [...new Set(reviews.map(r => new Date(r.submitted_at).getFullYear()))].sort((a,b)=>b-a);

  const visible = reviews
    .filter(r => matchesReviewRange(r, rangeFilter))
    .filter(r => {
      if (filter === "unanswered") return !r.responded_at;
      if (filter === "positive")   return r.score >= 8;
      if (filter === "negative")   return r.score < 6;
      return true;
    })
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

  // Statystyki lokalne dla aktualnego zakresu.
  const forStats = reviews.filter(r => matchesReviewRange(r, rangeFilter));
  const unansweredCount = forStats.filter(r => !r.responded_at).length;
  const bookingScore = bookingMeta?.officialScore || BCOM_SCORE;
  const bookingTotal = bookingMeta?.officialTotal || BCOM_TOTAL;
  const syncColor = syncState === "online" ? "var(--emerald)" : syncState === "syncing" ? "var(--sky)" : "var(--text-muted)";
  const syncLabel = syncState === "online" ? "Booking live" : syncState === "syncing" ? "Pobieranie..." : "Zapisane opinie";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* â”€â”€ Oficjalny wynik B.com â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      {/* ═══ HERO v2 wg v2/05-reviews — Score card + Meta info ═══ */}
      <div className="cc-reviews-hero">
        <div className="cc-reviews-score-card">
          <div className="cc-reviews-score-top">
            <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
            Średnia Booking.com
          </div>
          <div className="cc-reviews-score-val">
            {bookingScore}<span className="cc-reviews-score-max">/10</span>
          </div>
          <div className="cc-reviews-score-stars" aria-hidden="true">
            {[1,2,3,4,5].map(i=>{
              const filled=Math.round(bookingScore/2)>=i;
              return (
                <svg key={i} className={filled?"":"cc-reviews-star-empty"} width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              );
            })}
          </div>
          <div className="cc-reviews-score-sub">
            Na podstawie <b>{bookingTotal.toLocaleString("pl-PL")} opinii</b>
            {unansweredCount > 0 && (<><br/><b style={{color:"var(--cc-danger)"}}>{unansweredCount} bez odpowiedzi</b></>)}
          </div>
          <div className="cc-reviews-sync">
            <span className="cc-reviews-sync-label" style={{color:syncColor}}>
              <Wifi size={10}/>{syncLabel}
            </span>
            <button type="button" disabled={syncState === "syncing"} onClick={handleManualRefresh} className="cc-reviews-sync-btn">
              <RefreshCw size={10}/> Odśwież
            </button>
          </div>
        </div>

        <div className="cc-reviews-meta-card">
          <div className="cc-reviews-meta-head">
            <div className="cc-reviews-meta-info">
              <h2 className="cc-reviews-meta-title">Opinie gości</h2>
              <div className="cc-reviews-meta-sub">
                Zakres: <b>{reviewRangeLabel(rangeFilter)}</b> · <b>{forStats.length}</b> w systemie
                {" "}· ost. odśw. {lastRefresh.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" })}
                {syncMessage && <> · {syncMessage}</>}
              </div>
            </div>
            {isManager && (
              <div className="cc-reviews-meta-actions">
                <button className="btn btn-outline" style={{ fontSize: 12, padding: "7px 12px", color: openaiKey ? "var(--cc-success)" : "var(--cc-text-muted)", borderColor: openaiKey ? "color-mix(in srgb, var(--cc-success) 35%, transparent)" : "var(--cc-border-strong)" }}
                  onClick={() => { setKeyDraft(openaiKey); setShowKeyPanel(v => !v); }}>
                  <KeyRound size={13} /> {openaiKey ? "AI aktywne" : "Klucz AI"}
                </button>
                <button className="btn btn-rose" onClick={() => setShowForm(true)}>
                  <Plus size={15} /> Dodaj opinię
                </button>
              </div>
            )}
          </div>
          <select className="input cc-reviews-range-select"
            value={rangeFilter} onChange={e => setRangeFilter(e.target.value)}>
            <option value={REVIEW_RANGE_LAST_6_MONTHS}>Ostatnie 6 mies.</option>
            <option value={`year:${THIS_YEAR}`}>{THIS_YEAR}</option>
            {availableYears.filter(y => y !== THIS_YEAR).map(y => <option key={y} value={`year:${y}`}>{y}</option>)}
            <option value={REVIEW_RANGE_ALL}>Wszystkie lata</option>
          </select>
        </div>
      </div>

      {/* Manager-only: AI key panel */}
      {isManager && showKeyPanel && (
        <div className="panel" style={{ padding: "14px 18px" }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--cc-text-muted)", textTransform: "uppercase", letterSpacing: ".07em", display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
            <Sparkles size={11} style={{ color: "var(--cc-brand)" }} /> OpenAI API Key (GPT-4o mini)
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div style={{ position: "relative", flex: 1 }}>
              <input className="input" type={showKeyText ? "text" : "password"}
                value={keyDraft} onChange={e => setKeyDraft(e.target.value)}
                placeholder="sk-..." style={{ fontFamily: "var(--cc-font-mono)", fontSize: 12, paddingRight: 36 }} />
              <button onClick={() => setShowKeyText(v => !v)}
                style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--cc-text-muted)", padding: 0, display: "flex" }}>
                {showKeyText ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
            <button className="btn btn-rose" style={{ fontSize: 12, whiteSpace: "nowrap" }} onClick={saveKey}>Zapisz</button>
            {openaiKey && <button className="btn btn-outline" style={{ fontSize: 12 }} onClick={() => { setOpenaiKey(""); localStorage.removeItem(STORAGE_KEYS.openaiKey); sessionStorage.removeItem(STORAGE_KEYS.openaiKey); setKeyDraft(""); setShowKeyPanel(false); showToast && showToast("Klucz OpenAI usunięty.", "info"); }}>Usuń klucz</button>}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--cc-text-muted)", marginTop: 8 }}>
            Klucz przechowywany do zamknięcia sesji.
          </div>
        </div>
      )}

      {/* â”€â”€ Lista â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€ */}
      <div className="panel" style={{ padding: "14px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            Lista opinii <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>({visible.length})</span>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
            {/* Filtr zakresu */}
            <select className="input" style={{ fontSize: 12, padding: "5px 10px", height: "auto" }}
              value={rangeFilter} onChange={e => setRangeFilter(e.target.value)}>
              <option value={REVIEW_RANGE_LAST_6_MONTHS}>Ostatnie 6 mies.</option>
              <option value={`year:${THIS_YEAR}`}>{THIS_YEAR}</option>
              {availableYears.filter(y => y !== THIS_YEAR).map(y => <option key={y} value={`year:${y}`}>{y}</option>)}
              <option value={REVIEW_RANGE_ALL}>Wszystkie lata</option>
            </select>
            {/* Filtr statusu */}
            <div style={{ display: "flex", gap: 4, background: "var(--bg-secondary)", padding: 3, borderRadius: 8 }}>
              {[["all","Wszystkie"],["unanswered","Bez odp."],["positive","Pozytywne"],["negative","Negatywne"]].map(([k, lbl]) => (
                <button key={k} onClick={() => setFilter(k)}
                  style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: filter === k ? "var(--bg-card)" : "transparent", color: filter === k ? "var(--plum)" : "var(--text-muted)", fontWeight: filter === k ? 700 : 500, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
                  {lbl}
                </button>
              ))}
            </div>
          </div>
        </div>

        {visible.length === 0 ? (
          <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>â­</div>
            <div style={{ fontSize: 13.5, fontWeight: 600 }}>Brak opinii w wybranym filtrze.</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {visible.map(r => {
              const { bg, color, border } = scoreColor(r.score);
              const isExpanded = expandedId === r.id;
              const draft = replyDrafts[r.id] ?? r.response_text ?? "";
              return (
                <div key={r.id} className="cc-preshift-item" style={{ borderLeftColor: color }}>
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                    {/* Ocena */}
                    <div style={{ padding: "6px 12px", borderRadius: 10, background: bg, border: `1px solid ${border}`, textAlign: "center", flexShrink: 0 }}>
                      <div style={{ fontSize: 22, fontWeight: 900, color, fontFamily: "'DM Serif Display',serif", lineHeight: 1 }}>{r.score}</div>
                      <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: ".04em" }}>{scoreLabel(r.score)}</div>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Naglowek */}
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{r.guest_name}</div>
                        {r.country && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.country}</span>}
                        {r.title && <span style={{ fontSize: 12, fontStyle: "italic", color: "var(--text-secondary)" }}>"{r.title}"</span>}
                        {r.responded_at
                          ? <span className="cc-review-pill cc-review-pill--ok">Odpowiedziano</span>
                          : <span className="cc-review-pill cc-review-pill--err">Bez odpowiedzi</span>
                        }
                      </div>
                      {/* Meta */}
                      <div className="cc-preshift-item-meta" style={{ marginTop: 3 }}>
                        {r.stay_date && <>Pobyt: {new Date(r.stay_date + "T12:00:00").toLocaleDateString("pl-PL", { month: "short", year: "numeric" })} Â· </>}
                        {r.room_type && <>{r.room_type} Â· </>}
                        Opinia: {new Date(r.submitted_at).toLocaleDateString("pl-PL")}
                      </div>
                      {/* Tekst + / - z emoji dla pustych */}
                      <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                          <span style={{ color: "#059669", fontWeight: 700 }}>+ </span>
                          {r.positives
                            ? r.positives
                            : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>đźŠ Brak komentarza</span>
                          }
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                          <span style={{ color: "var(--rose)", fontWeight: 700 }}>â€“ </span>
                          {r.negatives
                            ? r.negatives
                            : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>đźŠ Nic negatywnego</span>
                          }
                        </div>
                      </div>
                    </div>
                    <button onClick={() => setExpandedId(isExpanded ? null : r.id)}
                      style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 4, flexShrink: 0 }}>
                      {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                  </div>

                  {/* Rozwiniety: odpowiedz */}
                  {isExpanded && (
                    <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid var(--border-light)" }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 6, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <MessageSquare size={11} /> Odpowiedz na opinie
                        {!draft && (
                          <button className="btn btn-outline" style={{ fontSize: 10, padding: "3px 10px" }} onClick={() => autoReply(r.id)}>
                            Generuj szablon
                          </button>
                        )}
                        <button className="btn btn-outline" style={{ fontSize: 10, padding: "3px 10px", color: "var(--plum)", borderColor: "var(--plum)", opacity: aiLoading[r.id] ? 0.6 : 1 }}
                          disabled={aiLoading[r.id]}
                          onClick={() => generateAIReply(r.id)}>
                          <Sparkles size={9} /> {aiLoading[r.id] ? "Generuje..." : "Generuj AI (ChatGPT)"}
                        </button>
                      </div>
                      <textarea className="input" rows={5} style={{ fontSize: 12.5, resize: "vertical" }}
                        value={draft}
                        onChange={e => setReplyDrafts(prev => ({ ...prev, [r.id]: e.target.value }))}
                        placeholder="Wpisz lub wygeneruj odpowiedź do skopiowania na Booking.com..." />
                      {r.responded_at && (
                        <div style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>
                          Zapisano: {new Date(r.responded_at).toLocaleDateString("pl-PL")} Â· {r.responded_by}
                        </div>
                      )}
                      <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                        {draft && (
                          <>
                            <button className="btn btn-outline" style={{ fontSize: 11 }} onClick={() => copyReply(draft, r.id)}>
                              {copiedId === r.id ? <><Check size={11} /> Skopiowano!</> : <><Copy size={11} /> Kopiuj do schowka</>}
                            </button>
                            <button className="btn btn-emerald" style={{ fontSize: 11 }} onClick={() => saveReply(r.id)}>
                              <Check size={11} /> Zapisz odpowiedz
                            </button>
                          </>
                        )}
                        {isManager && (
                          <button className="btn btn-outline" style={{ fontSize: 11, color: "var(--rose)", borderColor: "var(--rose)", marginLeft: "auto" }} onClick={() => deleteReview(r.id)}>
                            <Trash2 size={11} /> Usun
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showForm && <ReviewFormModal key="rf" employeeName={employeeName} onClose={() => setShowForm(false)} onSave={addReview} />}
      </AnimatePresence>
    </div>
  );
}

export default ReviewsPanel;
