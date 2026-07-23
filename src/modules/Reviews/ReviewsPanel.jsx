import React from "react";
import { ChevronDown, ChevronUp, Sparkles, RefreshCw, Wifi, ThumbsUp, ThumbsDown } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { REVIEWS_SEED } from "./reviewsSeed";
import { analyzeReviews, llmReady, generateReviewReply } from "../../lib/llm";
import { stripDiacritics } from "../../lib/names";

const THIS_YEAR = new Date().getFullYear();
const REVIEW_RANGE_LAST_6_MONTHS = "last6m";
const REVIEW_RANGE_ALL = "all";
// Auto-pobieranie opinii z Booking.com co 5 minut.
const BOOKING_SYNC_INTERVAL_MS = 5 * 60 * 1000;

// Oficjalna srednia z Booking.com (wyswietlana u gory, nie liczona z naszych danych)
const BCOM_SCORE = 8.7;
const BCOM_TOTAL = 2746;

// Nazwy kategorii ocen z Booking (hotelRatingScores) → polskie etykiety.
const CATEGORY_LABELS = {
  "Staff": "Personel",
  "Facilities": "Udogodnienia",
  "Cleanliness": "Czystość",
  "Comfort": "Komfort",
  "Value for money": "Stosunek jakości do ceny",
  "Location": "Lokalizacja",
  "Free WiFi": "WiFi",
  "WiFi": "WiFi",
};
const categoryLabel = (name) => CATEGORY_LABELS[name] || name;

// Draft AI odpowiedzi na pojedynczą opinię (WYKONANIE 4.4). Human-in-the-loop:
// generuje edytowalny tekst do ręcznego wklejenia na Booking (brak API do publikacji).
function ReviewReplyDraft({ review }) {
  const [draft, setDraft] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  const [prepared, setPrepared] = React.useState(false);
  // 4.19: jeśli AI przygotowało draft wcześniej (przy nowej krytycznej opinii) — pokaż od razu.
  React.useEffect(() => {
    const pre = (loadJson(STORAGE_KEYS.reviewDrafts, {}) || {})[String(review.id || reviewMergeKey(review))];
    if (pre) { setDraft(pre); setOpen(true); setPrepared(true); }
  }, [review]);
  if (!llmReady) return null;
  const lang = (review.country && !/pol/i.test(review.country)) ? "en" : "pl";
  const gen = async () => {
    setLoading(true);
    try {
      const text = await generateReviewReply({ score: review.score, positives: review.positives, negatives: review.negatives, guest_name: review.guest_name, language: lang });
      setDraft(text || "(pusty draft)"); setOpen(true);
    } catch (e) { setDraft("Nie udało się wygenerować odpowiedzi: " + (e.message || "błąd")); setOpen(true); }
    finally { setLoading(false); }
  };
  const btn = { fontSize: 12, padding: "5px 10px", borderRadius: 7, border: "1px solid var(--border-light)", background: "var(--bg-card)", color: "var(--text-secondary)", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 600 };
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button style={btn} onClick={gen} disabled={loading}><Sparkles size={12} /> {loading ? "Generuję…" : draft ? "Przegeneruj" : "Wygeneruj odpowiedź"}</button>
        {open && draft && <button style={btn} onClick={() => navigator.clipboard?.writeText(draft)}>Kopiuj</button>}
        {prepared && <span style={{ fontSize: 10, fontWeight: 800, padding: "3px 8px", borderRadius: 999, background: "#8b5cf622", color: "#a78bfa", alignSelf: "center" }}>AI przygotował</span>}
      </div>
      {open && (
        <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={4}
          style={{ marginTop: 6, width: "100%", fontSize: 12.5, padding: 8, borderRadius: 8, border: "1px solid var(--border-light)", resize: "vertical", fontFamily: "inherit", color: "var(--text-primary)", background: "var(--bg-input)" }}
          placeholder="Draft odpowiedzi — sprawdź i wklej na Booking." />
      )}
    </div>
  );
}

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

// stripDiacritics (WYKONANIE 1.6) + scalenie białych znaków/trim. Klucz do
// scalania opinii (reviewMergeKey) — symetryczny po obu stronach, więc mapowanie
// ł→l tylko poprawia dopasowanie tego samego gościa.
function normalizedReviewText(value) {
  return stripDiacritics(value).replace(/\s+/g, " ").trim();
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
    result.set(review.id, { ...previous, ...review });
  });

  existing.forEach(review => {
    const key = reviewMergeKey(review);
    const replaced = incoming.some(next => next.id === review.id || reviewMergeKey(next) === key);
    if (!replaced) result.set(review.id, review);
  });

  return [...result.values()].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));
}

// Najwyzsza liczba wystapien w aktualnej grupie — do skalowania pasków.
function maxCount(items) {
  return items.reduce((m, it) => Math.max(m, Number(it?.count) || 0), 0) || 1;
}

function ReviewsPanel({ dark, isManager, showToast }) {
  const [reviews, setReviews] = React.useState(loadOrSeed);
  const [rangeFilter, setRangeFilter] = React.useState(REVIEW_RANGE_LAST_6_MONTHS);
  const [filter, setFilter]         = React.useState("all");
  const [showList, setShowList]     = React.useState(false);
  const [lastRefresh, setLastRefresh] = React.useState(new Date());
  const [bookingMeta, setBookingMeta] = React.useState(() => loadJson(STORAGE_KEYS.bookingMeta, null));
  const [syncState, setSyncState] = React.useState(window.electronAPI?.syncBookingReviews ? "idle" : "local");
  const [syncMessage, setSyncMessage] = React.useState("");
  const [insights, setInsights] = React.useState(() => loadJson(STORAGE_KEYS.reviewsInsights, null));
  const [insightsLoading, setInsightsLoading] = React.useState(false);
  const syncInFlight = React.useRef(false);

  const applyLocalRefresh = React.useCallback(() => {
    const fresh = loadJson(STORAGE_KEYS.reviews, null);
    if (fresh && fresh.length > 0) setReviews(fresh);
    setLastRefresh(new Date());
  }, []);

  // 4.18/4.19: wykryj NOWE opinie względem trwałego zbioru „widzianych", powiadom w aplikacji
  // i dla krytycznych (≤4/10) przygotuj z góry draft odpowiedzi AI (gotowy, gdy otworzysz opinię).
  const notifyNewReviews = React.useCallback((incoming) => {
    const idOf = (r) => String(r.id || reviewMergeKey(r));
    const seen = loadJson(STORAGE_KEYS.reviewsSeen, null);
    const seenSet = new Set(Array.isArray(seen) ? seen : []);
    const fresh = incoming.filter((r) => !seenSet.has(idOf(r)));
    saveJson(STORAGE_KEYS.reviewsSeen, incoming.map(idOf));
    if (!seen || !fresh.length) return;            // pierwszy załadunek → nie powiadamiaj o historii
    const critical = fresh.filter((r) => Number(r.score) <= 4);
    const word = fresh.length === 1 ? "nowa opinia" : "nowych opinii";
    showToast && showToast(`Booking: ${fresh.length} ${word}${critical.length ? ` — ${critical.length} wymaga odpowiedzi` : ""}.`, critical.length ? "warning" : "info");
    if (!llmReady || !critical.length) return;
    (async () => {                                  // 4.19: drafty AI dla krytycznych, zapisane lokalnie
      const store = loadJson(STORAGE_KEYS.reviewDrafts, {}) || {};
      for (const r of critical) {
        if (store[idOf(r)]) continue;
        try {
          const lang = (r.country && !/pol/i.test(r.country)) ? "en" : "pl";
          store[idOf(r)] = await generateReviewReply({ score: r.score, positives: r.positives, negatives: r.negatives, guest_name: r.guest_name, language: lang });
        } catch { /* pomiń — draft można wygenerować ręcznie */ }
      }
      saveJson(STORAGE_KEYS.reviewDrafts, store);
    })();
  }, [showToast]);

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
        notifyNewReviews(incoming);   // 4.18/4.19: powiadom o nowych + przygotuj draft AI
      } else {
        applyLocalRefresh();
      }

      const meta = {
        officialScore: res?.officialScore || bookingMeta?.officialScore || null,
        officialTotal: res?.officialTotal || bookingMeta?.officialTotal || null,
        categoryScores: (Array.isArray(res?.categoryScores) && res.categoryScores.length)
          ? res.categoryScores : (bookingMeta?.categoryScores || []),
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
        setSyncMessage("Pokazuję zapisane opinie — automatyczne odświeżanie co 5 min.");
        if (manual) showToast && showToast("Booking.com niedostępny — pokazuję zapisane opinie.", "warning");
      }
    } catch (err) {
      console.error("[booking-sync]", err);
      applyLocalRefresh();
      setSyncState("local");
      setSyncMessage("Pokazuję zapisane opinie — automatyczne odświeżanie co 5 min.");
      if (manual) showToast && showToast("Nie udało się odświeżyć z Booking — pokazuję zapisane opinie.", "warning");
    } finally {
      syncInFlight.current = false;
    }
  }, [applyLocalRefresh, bookingMeta?.officialScore, bookingMeta?.officialTotal, showToast, notifyNewReviews]);

  // Live Booking: start + polling co 5 min. Storage event zostaje dla zmian z innych okien.
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

  // Opinie pochodzą wyłącznie z synchronizacji Booking (Apify) — nie wprowadza się
  // ich ręcznie, więc nie udostępniamy też usuwania (i tak wróciłyby przy mergeBookingReviews).

  // Lata dostepne w danych
  const availableYears = [...new Set(reviews.map(r => new Date(r.submitted_at).getFullYear()))].sort((a,b)=>b-a);

  const forStats = reviews.filter(r => matchesReviewRange(r, rangeFilter));

  const visible = forStats
    .filter(r => {
      if (filter === "positive") return r.score >= 8;
      if (filter === "negative") return r.score < 6;
      return true;
    })
    .sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at));

  const bookingScore = bookingMeta?.officialScore || BCOM_SCORE;
  const bookingTotal = bookingMeta?.officialTotal || BCOM_TOTAL;
  const syncColor = syncState === "online" ? "var(--emerald)" : syncState === "syncing" ? "var(--sky)" : "var(--text-muted)";
  const syncLabel = syncState === "online" ? "Booking live" : syncState === "syncing" ? "Pobieranie..." : "Zapisane opinie";

  // ── Analiza LLM: co goscie chwala / na co narzekaja ─────────────────────────
  const insightsStale = insights && (insights.range !== rangeFilter || insights.reviewCount !== forStats.length);

  const generateInsights = React.useCallback(async () => {
    if (insightsLoading) return;
    if (!llmReady) {
      showToast && showToast("Analiza AI niedostępna — brak połączenia z serwerem.", "info");
      return;
    }
    if (forStats.length === 0) {
      showToast && showToast("Brak opinii do analizy w wybranym zakresie.", "info");
      return;
    }
    setInsightsLoading(true);
    try {
      const data = await analyzeReviews(forStats);
      const praised = Array.isArray(data?.praised) ? data.praised : [];
      const problems = Array.isArray(data?.problems) ? data.problems : [];
      if (!praised.length && !problems.length) throw new Error("Pusta analiza");
      const next = {
        praised, problems,
        summary: data?.summary || "",
        range: rangeFilter,
        reviewCount: forStats.length,
        generatedAt: new Date().toISOString(),
      };
      setInsights(next);
      saveJson(STORAGE_KEYS.reviewsInsights, next);
      showToast && showToast("Analiza opinii zaktualizowana.", "success");
    } catch (err) {
      showToast && showToast(`Błąd analizy AI: ${err.message || err}`, "error");
    } finally {
      setInsightsLoading(false);
    }
  }, [forStats, insightsLoading, rangeFilter, showToast]);

  // Pierwsze uruchomienie: jesli nie ma jeszcze zadnej analizy, wygeneruj raz.
  const autoRan = React.useRef(false);
  React.useEffect(() => {
    if (autoRan.current) return;
    if (!insights && llmReady && forStats.length > 0) {
      autoRan.current = true;
      generateInsights();
    }
  }, [insights, forStats.length, generateInsights]);

  const praised = insights?.praised || [];
  const problems = insights?.problems || [];
  const maxPraised = maxCount(praised);
  const maxProblems = maxCount(problems);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {/* ═══ HERO: Srednia Booking.com + meta ═══ */}
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
          </div>
          <div className="cc-reviews-sync">
            <span className="cc-reviews-sync-label" style={{color:syncColor}}>
              <Wifi size={10}/>{syncLabel}
            </span>
            <button type="button" disabled={syncState === "syncing"} onClick={() => syncBookingReviews({ manual: true })} className="cc-reviews-sync-btn">
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

      {/* ═══ Oceny per kategoria (z Booking) ═══ */}
      {Array.isArray(bookingMeta?.categoryScores) && bookingMeta.categoryScores.length > 0 && (
        <div className="panel" style={{ padding: "16px 18px" }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12 }}>
            Oceny gości wg kategorii <span style={{ fontSize: 11.5, fontWeight: 500, color: "var(--text-muted)" }}>· oficjalne z Booking.com</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "10px 22px" }}>
            {bookingMeta.categoryScores.map(c => {
              const val = Number(c.score);
              const pct = Math.max(0, Math.min(100, (val / 10) * 100));
              return (
                <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                      <span style={{ color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{categoryLabel(c.name)}</span>
                      <b style={{ color: "var(--text-primary)", marginLeft: 8 }}>{val.toFixed(1)}</b>
                    </div>
                    <div style={{ height: 6, borderRadius: 999, background: "var(--border-light, rgba(0,0,0,.08))", overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%", borderRadius: 999, background: "var(--plum)" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Analiza AI: czego oczekują goście ═══ */}
      <div className="panel" style={{ padding: "16px 18px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)", display: "flex", alignItems: "center", gap: 7 }}>
              <Sparkles size={15} style={{ color: "var(--plum)" }} /> Czego oczekują goście
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text-muted)", marginTop: 2 }}>
              {insights
                ? <>Analiza AI z {forStats.length} opinii ({reviewRangeLabel(insights.range)}) · {new Date(insights.generatedAt).toLocaleString("pl-PL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {insightsStale && <b style={{ color: "var(--amber, #B45309)" }}> · dane się zmieniły — odśwież</b>}
                  </>
                : <>Sztuczna inteligencja grupuje opinie na mocne strony i problemy.</>
              }
            </div>
          </div>
          <button className="btn btn-outline" style={{ fontSize: 12, padding: "7px 12px", color: "var(--plum)", borderColor: "var(--plum)", opacity: insightsLoading ? 0.6 : 1 }}
            disabled={insightsLoading} onClick={generateInsights}>
            <Sparkles size={13} /> {insightsLoading ? "Analizuję..." : insights ? "Odśwież analizę" : "Analizuj opinie"}
          </button>
        </div>

        {!insights ? (
          <div style={{ padding: "28px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: 13 }}>
            {insightsLoading
              ? "AI analizuje opinie gości..."
              : llmReady
                ? "Kliknij „Analizuj opinie”, aby zobaczyć, co goście chwalą i na co narzekają."
                : "Analiza AI niedostępna (brak połączenia z serwerem)."}
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
              {/* Co chwala */}
              <div style={{ background: "color-mix(in srgb, var(--emerald) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--emerald) 25%, transparent)", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--emerald)", textTransform: "uppercase", letterSpacing: ".05em", display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <ThumbsUp size={13} /> Co goście chwalą
                </div>
                {praised.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>Brak powtarzających się pochwał.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {praised.map((it, i) => (
                      <div key={i}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>
                          <span>{it.theme}</span><span style={{ color: "var(--emerald)", fontWeight: 800 }}>{it.count}×</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: "color-mix(in srgb, var(--emerald) 14%, transparent)" }}>
                          <div style={{ height: "100%", borderRadius: 3, background: "var(--emerald)", width: `${Math.round((Number(it.count) || 0) / maxPraised * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Na co narzekaja */}
              <div style={{ background: "color-mix(in srgb, var(--rose) 7%, transparent)", border: "1px solid color-mix(in srgb, var(--rose) 25%, transparent)", borderRadius: 12, padding: "12px 14px" }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "var(--rose)", textTransform: "uppercase", letterSpacing: ".05em", display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
                  <ThumbsDown size={13} /> Na co zgłaszają problemy
                </div>
                {problems.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--text-muted)", fontStyle: "italic" }}>Brak powtarzających się problemów.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {problems.map((it, i) => (
                      <div key={i}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, fontWeight: 600, color: "var(--text-primary)", marginBottom: 3 }}>
                          <span>{it.theme}</span><span style={{ color: "var(--rose)", fontWeight: 800 }}>{it.count}×</span>
                        </div>
                        <div style={{ height: 5, borderRadius: 3, background: "color-mix(in srgb, var(--rose) 14%, transparent)" }}>
                          <div style={{ height: "100%", borderRadius: 3, background: "var(--rose)", width: `${Math.round((Number(it.count) || 0) / maxProblems * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {insights.summary && (
              <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--bg-secondary)", borderRadius: 10, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                <b style={{ color: "var(--plum)" }}>Wniosek: </b>{insights.summary}
              </div>
            )}
          </>
        )}
      </div>

      {/* ═══ Lista pojedynczych opinii (zwijana, read-only) ═══ */}
      <div className="panel" style={{ padding: "14px 18px" }}>
        <button onClick={() => setShowList(v => !v)}
          style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>
            {showList ? "Ukryj opinie" : "Pokaż wszystkie opinie"} <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text-muted)" }}>({forStats.length})</span>
          </span>
          {showList ? <ChevronUp size={18} style={{ color: "var(--text-muted)" }} /> : <ChevronDown size={18} style={{ color: "var(--text-muted)" }} />}
        </button>

        {showList && (
          <div style={{ marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
              <select className="input" style={{ fontSize: 12, padding: "5px 10px", height: "auto" }}
                value={rangeFilter} onChange={e => setRangeFilter(e.target.value)}>
                <option value={REVIEW_RANGE_LAST_6_MONTHS}>Ostatnie 6 mies.</option>
                <option value={`year:${THIS_YEAR}`}>{THIS_YEAR}</option>
                {availableYears.filter(y => y !== THIS_YEAR).map(y => <option key={y} value={`year:${y}`}>{y}</option>)}
                <option value={REVIEW_RANGE_ALL}>Wszystkie lata</option>
              </select>
              <div style={{ display: "flex", gap: 4, background: "var(--bg-secondary)", padding: 3, borderRadius: 8 }}>
                {[["all","Wszystkie"],["positive","Pozytywne"],["negative","Negatywne"]].map(([k, lbl]) => (
                  <button key={k} onClick={() => setFilter(k)}
                    style={{ padding: "5px 10px", borderRadius: 6, border: "none", background: filter === k ? "var(--bg-card)" : "transparent", color: filter === k ? "var(--plum)" : "var(--text-muted)", fontWeight: filter === k ? 700 : 500, fontSize: 11, cursor: "pointer", whiteSpace: "nowrap" }}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>

            {visible.length === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>Brak opinii w wybranym filtrze.</div>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {visible.map(r => {
                  const { bg, color, border } = scoreColor(r.score);
                  return (
                    <div key={r.id} className="cc-preshift-item" style={{ borderLeftColor: color }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                        <div style={{ padding: "6px 12px", borderRadius: 10, background: bg, border: `1px solid ${border}`, textAlign: "center", flexShrink: 0 }}>
                          <div style={{ fontSize: 22, fontWeight: 900, color, fontFamily: "'DM Serif Display',serif", lineHeight: 1 }}>{r.score}</div>
                          <div style={{ fontSize: 9, fontWeight: 700, color, textTransform: "uppercase", letterSpacing: ".04em" }}>{scoreLabel(r.score)}</div>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                            <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text-primary)" }}>{r.guest_name}</div>
                            {r.country && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{r.country}</span>}
                            {r.title && <span style={{ fontSize: 12, fontStyle: "italic", color: "var(--text-secondary)" }}>"{r.title}"</span>}
                          </div>
                          <div className="cc-preshift-item-meta" style={{ marginTop: 3 }}>
                            {r.stay_date && <>Pobyt: {new Date(r.stay_date + "T12:00:00").toLocaleDateString("pl-PL", { month: "short", year: "numeric" })} · </>}
                            {r.room_type && <>{r.room_type} · </>}
                            Opinia: {new Date(r.submitted_at).toLocaleDateString("pl-PL")}
                          </div>
                          <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
                            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                              <span style={{ color: "#059669", fontWeight: 700 }}>+ </span>
                              {r.positives
                                ? r.positives
                                : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Brak komentarza</span>}
                            </div>
                            <div style={{ fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                              <span style={{ color: "var(--rose)", fontWeight: 700 }}>– </span>
                              {r.negatives
                                ? r.negatives
                                : <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>Nic negatywnego</span>}
                            </div>
                          </div>
                          <ReviewReplyDraft review={r} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReviewsPanel;
