// Klient warstwy LLM — woła Edge Function `llm` (proxy Claude).
// Klucz API nigdy nie jest tutaj: invoke dokłada anon key, prompt powstaje na serwerze.
// LLM = warstwa językowa (doradcza). Nigdy źródło liczb (kasa, liczenie pokoi).
import { supabase } from "./supabase";
import { TENANT_ID } from "./constants";

export const llmReady = Boolean(supabase);

// Surowe wywołanie. Zwraca { text } albo { data, text } (triage).
export async function callLLM(task, payload) {
  if (!supabase) throw new Error("LLM niedostępny — brak połączenia z Supabase.");
  const { data, error } = await supabase.functions.invoke("llm", {
    body: { task, tenant_id: TENANT_ID, payload },
  });
  if (error) {
    // Błąd HTTP (np. 429) — wyciągnij kod aplikacyjny z ciała odpowiedzi funkcji.
    let code = "";
    try { code = (await error.context?.json())?.error || ""; } catch { /* brak ciała */ }
    const e = new Error(code || error.message || "llm_error");
    e.code = code;
    throw e;
  }
  if (data?.error) { const e = new Error(data.error); e.code = data.error; throw e; }
  return data;
}

// ── RAG Wiki ────────────────────────────────────────────────────────────────
const strip = (s) =>
  String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/ł/g, "l");

// Prefiltr: wybiera wpisy najbardziej pasujące do pytania (overlap słów >3 znaki).
// Mała baza Wiki → bez wektorów; wrzucamy do kontekstu top-N wpisów.
function selectEntries(question, entries, limit = 4) {
  const qWords = [...new Set(strip(question).split(/[^a-z0-9]+/).filter((w) => w.length > 3))];
  if (!qWords.length) return entries.slice(0, limit);
  // Dopasowanie po rdzeniu (4 znaki) — radzi sobie z polską odmianą (zamki↔zamków).
  const stem = (w) => w.slice(0, 4);
  const scored = entries.map((e) => {
    const hay = strip(`${e.topic} ${e.content}`);
    const score = qWords.reduce((n, w) => n + (hay.includes(w) || hay.includes(stem(w)) ? 1 : 0), 0);
    return { e, score };
  });
  const hits = scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score);
  const chosen = (hits.length ? hits : scored.slice(0, limit)).slice(0, limit);
  return chosen.map((s) => s.e);
}

export async function askWiki(question, wikiEntries) {
  const entries = selectEntries(question, wikiEntries || [])
    .map((e) => ({ topic: e.topic, content: String(e.content || "").slice(0, 2500) }));
  const { text } = await callLLM("wiki", { question, entries });
  return text;
}

// ── Triaging usterek ─────────────────────────────────────────────────────────
// Zwraca { category, priority, assigned_to, title } lub {} (fallback → formularz ręczny).
export async function triageFault(description, { categories = [], konserwatorzy = [], specialties = {} } = {}) {
  const { data } = await callLLM("triage", { description, categories, konserwatorzy, specialties });
  return data && typeof data === "object" ? data : {};
}

// ── Asystent przydziału pokoi (uwagi na recepcji) ────────────────────────────
// stats: [{worker,total,done,cleaning,waiting}], suggestions: [{from,to,rooms,reason}]
// Liczby liczone deterministycznie po stronie aplikacji — LLM tylko formułuje uwagę.
export async function roomAdvisor({ stats, suggestions }) {
  const { text } = await callLLM("advisor", { stats, suggestions });
  return text;
}

// ── Routing zadań: kogo przypisać ────────────────────────────────────────────
// Zwraca { worker, reason } lub {} (fallback → ręczny wybór). worker liczony z listy.
export async function suggestAssignee({ text, room, workers = [], stats = [] }) {
  const { data } = await callLLM("route", { text, room, workers, stats });
  return data && typeof data === "object" ? data : {};
}

// ── Briefing przekazania zmiany ──────────────────────────────────────────────
// context: { shiftLabel, handoverNote, carryTasks, openFaults, vouchers, reminders, alerts, redactNames }
export async function generateBriefing(context) {
  const { text } = await callLLM("briefing", context);
  return text;
}

// ── Redakcja tekstu notatki (AI „Zredaguj") ─────────────────────────────────
export async function polishText(text) {
  const { text: out } = await callLLM("polish", { text });
  return out;
}

// ── Podsumowanie dnia (Historia) ─────────────────────────────────────────────
export async function summarizeHistory(context) {
  const { text } = await callLLM("history", context);
  return text;
}

// ── Tygodniowe sprawozdanie dla kierownika ───────────────────────────────────
export async function generateWeeklyReport(context) {
  const { text } = await callLLM("weekly", context);
  return text;
}

// ── Wyszukiwarka „kto/co/kiedy" po zapisach operacyjnych ─────────────────────
// records: [{kiedy, kto, typ, tresc}] — prefiltr po stronie klienta, AI odpowiada.
export async function searchRecords(question, records) {
  const { text } = await callLLM("search", { question, records });
  return text;
}

// ── AI-odczyt grafiku z Excela (fallback gdy deterministyczny parser zawiedzie)
// grid: tablica wierszy (z XLSX sheet_to_json header:1). Zwraca { 'YYYY-MM-DD': { Imię: shift } }.
export async function parseScheduleWithAI(grid) {
  const { data } = await callLLM("schedule", { grid });
  return data && typeof data === "object" ? data : {};
}

// ── Analiza opinii gości: co chwalą / na co narzekają ────────────────────────
// reviews: [{ score, positives, negatives, room_type }] — analiza po stronie LLM.
// Zwraca { praised:[{theme,count}], problems:[{theme,count}], summary }.
// LLM tylko grupuje tematy; liczby pochodzą z realnych opinii. Best-effort:
// błąd/parsowanie → {} (klient pokazuje komunikat, zostaje przy cache).
// Limit opinii wysyłanych do LLM — przy 400+ opiniach surowy payload przekracza
// okno kontekstu modelu i wywołanie pada. Bierzemy tylko opinie z treścią
// (puste nic nie wnoszą do tematów) i ostatnie MAX_ANALYZE wg kolejności wejścia
// (panel podaje je posortowane malejąco po dacie).
const MAX_ANALYZE_REVIEWS = 150;
export async function analyzeReviews(reviews) {
  const compact = (Array.isArray(reviews) ? reviews : [])
    .filter((r) => String(r.positives || "").trim() || String(r.negatives || "").trim())
    .slice(0, MAX_ANALYZE_REVIEWS)
    .map((r) => ({
      score: r.score,
      positives: r.positives || "",
      negatives: r.negatives || "",
      room_type: r.room_type || "",
    }));
  const { data } = await callLLM("reviews", { reviews: compact });
  return data && typeof data === "object" ? data : {};
}

// ── Przypomnienie końca zmiany (redaktor) ────────────────────────────────────
// facts: { shiftLabel, minutesLeft, cashChecked, safeRequired, safeDone, tasksDone, tasksTotal, missing:[...] }
// Wszystkie liczby/flagi liczone deterministycznie w aplikacji — LLM tylko składa
// 1–2 zdania przypomnienia. Wywołanie best-effort: błąd → klient zostaje przy tekście sztywnym.
export async function nudgeShiftEnd(facts) {
  const { text } = await callLLM("nudge", facts);
  return text;
}
