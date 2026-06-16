// Supabase Edge Function: `llm`
// Jedyny punkt styku aplikacji z LLM. Dostawca: Groq (darmowy tier, API zgodne z
// OpenAI). Klucz GROQ_API_KEY żyje wyłącznie jako secret Supabase — nigdy w kliencie.
//
// Wejście (POST):  { task: "wiki"|"triage"|"briefing", tenant_id: uuid, payload: {...} }
// Wyjście:         { text?: string, data?: object }   (triage zwraca data=JSON)
//
// Zasady:
//  - prompt budowany TUTAJ (klient nie steruje promptem → brak prompt-injection z UI),
//  - briefing: redakcja nazwisk PRZED wysłaniem do Groq (RODO),
//  - log zużycia do public.llm_usage (service_role),
//  - LLM nigdy nie jest źródłem liczb — to warstwa językowa (doradcza).
//
// Deploy:
//   supabase secrets set GROQ_API_KEY=gsk_...   (darmowy klucz z console.groq.com)
//   supabase functions deploy llm

const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

// Modele Groq (darmowe). 70B do RAG/briefingu (lepsze zrozumienie PL),
// 8B-instant do triage (proste zadanie JSON, szybkość).
// Wszystkie zadania na najmocniejszym darmowym Llama (Groq). Jedno miejsce zmiany.
const MODELS = {
  wiki: "llama-3.3-70b-versatile",
  triage: "llama-3.3-70b-versatile",
  briefing: "llama-3.3-70b-versatile",
  advisor: "llama-3.3-70b-versatile",
  history: "llama-3.3-70b-versatile",
  route: "llama-3.3-70b-versatile",
  polish: "llama-3.3-70b-versatile",
  weekly: "llama-3.3-70b-versatile",
  schedule: "llama-3.3-70b-versatile",
  search: "llama-3.3-70b-versatile",
  nudge: "llama-3.3-70b-versatile",
  reviews: "llama-3.3-70b-versatile",
  worker: "llama-3.3-70b-versatile",
  grafik: "llama-3.3-70b-versatile",
} as const;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "content-type": "application/json" },
  });

// ── Redakcja nazwisk (RODO) ────────────────────────────────────────────────
// Zamienia podane nazwiska (i pojedyncze imiona) na tokeny "Osoba 1" itd.
// we wszystkich polach tekstowych zanim cokolwiek opuści naszą infrastrukturę.
function buildRedactor(names: string[]) {
  const map = new Map<string, string>();
  const tokens: { re: RegExp; token: string }[] = [];
  let n = 0;
  for (const raw of names) {
    const name = String(raw || "").trim();
    if (name.length < 3) continue;
    if (!map.has(name.toLowerCase())) {
      n += 1;
      map.set(name.toLowerCase(), `Osoba ${n}`);
    }
    const token = map.get(name.toLowerCase())!;
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    tokens.push({ re: new RegExp(`\\b${esc}\\b`, "gi"), token });
  }
  const redactStr = (s: string) =>
    tokens.reduce((acc, t) => acc.replace(t.re, t.token), s);
  const redact = (v: unknown): unknown => {
    if (typeof v === "string") return redactStr(v);
    if (Array.isArray(v)) return v.map(redact);
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v)) o[k] = redact(val);
      return o;
    }
    return v;
  };
  return redact;
}

// ── Budowa promptu per zadanie ─────────────────────────────────────────────
function buildPrompt(task: string, payload: any): { system: string; user: string } {
  if (task === "wiki") {
    const entries = (payload?.entries ?? [])
      .map((e: any, i: number) => `### Wpis ${i + 1}: ${e.topic}\n${e.content}`)
      .join("\n\n");
    return {
      system:
        "Jesteś asystentem recepcji hotelu. Odpowiadasz po polsku, krótko i konkretnie, " +
        "na podstawie dostarczonych fragmentów Wiki. Jeśli KTÓRYKOLWIEK fragment dotyczy " +
        "pytania (także luźno, po słowie kluczowym, np. pytanie \"zamki\" a wpis \"Schematy " +
        "zamków\") — odpowiedz na jego podstawie: streść lub wyjaśnij to, co jest w tym wpisie. " +
        "Napisz dokładnie \"Nie ma tego w Wiki — zapytaj kierownika.\" TYLKO wtedy, gdy ŻADEN " +
        "fragment nie jest powiązany z pytaniem. Nie zmyślaj faktów spoza wpisów. " +
        "Na końcu podaj w nawiasie tytuł użytego wpisu.",
      user: `PYTANIE PRACOWNIKA:\n${payload?.question ?? ""}\n\nFRAGMENTY WIKI:\n${entries || "(brak)"}`,
    };
  }
  if (task === "worker") {
    // Krótki, kulturalny opis pracownika HK na podstawie liczb (panel menedżerski).
    // UWAGA: tempo przekazujemy jako etykietę jakościową (nie minuty) — czas sprzątania
    // jest mierzony, ale celowo nie ujawniamy konkretnych minut.
    const p = payload || {};
    return {
      system:
        "Jesteś asystentem menedżera housekeepingu w hotelu. Na podstawie podanych liczb piszesz " +
        "PO POLSKU bardzo krótki (1–2 zdania), rzeczowy i życzliwy opis pracy danej osoby. " +
        "Nie podawaj konkretnej liczby minut ani sekund (tempo opisuj słownie). Nie zmyślaj danych " +
        "spoza podanych. Bez oceniania charakteru — tylko praca. Bez nagłówków, sam opis.",
      user:
        `OSOBA: ${p.name ?? "—"}\n` +
        `Okres: ostatnie 7 dni\n` +
        `Posprzątane pokoje: ${p.rooms ?? 0}\n` +
        `Zgłoszone usterki: ${p.faults ?? 0}\n` +
        `Tempo pracy (etykieta): ${p.pace ?? "brak danych"}\n` +
        (p.availability ? `Najbliższa dyspozycyjność: ${p.availability}\n` : ""),
    };
  }
  if (task === "grafik") {
    // Propozycja grafiku z dyspozycyjności + życzeń godzinowych. Zwraca WYŁĄCZNIE JSON.
    const p = payload || {};
    const days = (p.days ?? []).join(", ");
    const persons = (p.persons ?? []).map((x: any) =>
      `- ${x.name}: chce ~${x.hours ?? "?"} h; może w dniach: ${(x.available ?? []).map((a: any)=>`${a.date}(${a.choice})`).join(", ") || "brak danych"}`
    ).join("\n");
    const shiftDef = p.dept === "hk"
      ? "Zmiany HK: dzien (07:00-15:00), popoludnie (15:00-21:00)."
      : "Zmiany recepcji: poranna (07:00-15:00), popoludniowa (15:00-23:00), nocna (23:00-07:00).";
    return {
      system:
        "Układasz grafik pracy w hotelu na podany okres. Zwracasz WYŁĄCZNIE poprawny JSON, bez komentarza, " +
        "w formacie: {\"schedule\": {\"RRRR-MM-DD\": {\"Imie\": {\"start\":\"07\",\"end\":\"15\",\"shift\":\"poranna\"}}}, \"note\": string}. " +
        "Zasady: przydzielaj osobę TYLKO w dniach, w których zaznaczyła dyspozycyjność (pole 'może w dniach'); " +
        "dąż do zbliżenia sumy godzin każdej osoby do jej życzenia; nie przydzielaj nikomu dwóch zmian tego samego dnia; " +
        "rozkładaj obciążenie sprawiedliwie. " + shiftDef + " " +
        "Pole shift użyj zgodnie z nazwą zmiany. W 'note' (1 zdanie po polsku) napisz, czego zabrakło lub na co uważać.",
      user: `OKRES: ${p.period_type ?? "tydzien"} od ${p.period_start ?? "?"}\nDNI: ${days}\nOSOBY:\n${persons || "(brak)"}`,
    };
  }
  if (task === "triage") {
    const cats = (payload?.categories ?? []).join(", ");
    const workers = (payload?.konserwatorzy ?? []).join(", ");
    const specs = payload?.specialties && typeof payload.specialties === "object" ? payload.specialties : {};
    const specLines = Object.entries(specs).map(([cat, name]) => `${cat} → ${name}`).join("; ");
    return {
      system:
        "Klasyfikujesz zgłoszenia usterek hotelowych. Zwracasz WYŁĄCZNIE poprawny JSON, bez " +
        "komentarza, w formacie: {\"category\": string|null, \"priority\": \"normal\"|\"urgent\", " +
        "\"assigned_to\": string|null, \"title\": string}. " +
        `Pole category musi pochodzić z listy: [${cats}] lub być null. ` +
        `Pole assigned_to musi pochodzić z listy konserwatorów: [${workers}] lub null. ` +
        (specLines
          ? `PRZYDZIAŁ wg specjalności (kategoria → osoba): ${specLines}. ` +
            "Jeśli wykryta kategoria pasuje do specjalności — assigned_to MUSI być tą osobą. "
          : "") +
        "Pole title to krótki (max 6 słów) tytuł po polsku. priority=urgent tylko dla zalania, " +
        "braku prądu, awarii bezpieczeństwa lub blokady pokoju.",
      user: `OPIS USTERKI:\n${payload?.description ?? ""}`,
    };
  }
  if (task === "weekly") {
    const ctx = JSON.stringify(payload ?? {}, null, 1);
    return {
      system:
        "Tworzysz PEŁNE tygodniowe sprawozdanie dla kierownika hotelu, po polsku — dokument gotowy " +
        "do wydruku (PDF). Rozpisz każdy dział szczegółowo, z konkretami: imiona osób, liczby, numery " +
        "pokoi, kwoty, dni. Nie streszczaj do samych liczb — pisz pełnymi zdaniami i listami. " +
        "Struktura (zachowaj kolejność i nagłówki):\n" +
        "1) KASA I FINANSE — przejdź kasę dzień po dniu (data, zmiana, osoba, stan końcowy, sejf z pola " +
        "kasaPoKolei). Wypisz korekty płatności (korektyPlatnosci). Zwróć uwagę na braki/rozbieżności " +
        "jeśli widoczne.\n" +
        "2) SPRZĄTANIE / HK — ile pokoi posprzątała każda osoba (sprzataniePokoiWgOsoby), kto " +
        "najwięcej, łączna liczba.\n" +
        "3) USTERKI — rozbicie: otwarte, w toku, naprawione; ile z HK, ile z recepcji; wypisz listę " +
        "usterek przydzielonych konserwatorom (pokój, opis, osoba, status z pola konserwatorzy).\n" +
        "4) ZADANIA I OBSŁUGA — dla każdej osoby: liczba zmian oraz zadania wykonane / łącznie " +
        "(praceWgOsoby). Przytocz najważniejsze notatki służbowe (notatkiSluzbowe) z dnia.\n" +
        "5) WNIOSKI I UWAGI — 3–5 konkretnych wniosków: kto się wyróżnił, gdzie są zaległości, co " +
        "wymaga uwagi kierownika.\n" +
        "Używaj WYŁĄCZNIE podanych danych — niczego nie wymyślaj; jeśli sekcja nie ma danych, napisz " +
        "krótko „Brak danych w tym tygodniu.\" NIE wymieniaj angielskich nazw pól ani technicznych " +
        "kluczy — pisz naturalnym językiem dla kierownika.",
      user: `DANE TYGODNIA:\n${ctx}`,
    };
  }
  if (task === "schedule") {
    return {
      system:
        "Odczytujesz grafik pracy recepcji z arkusza Excel podanego jako siatka komórek (tablica " +
        "wierszy). Rozpoznaj, który wiersz to nagłówek z datami, która kolumna to imiona pracowników, " +
        "i przypisz każdej osobie zmianę na każdy dzień. Zmiany kodowane: poranna|popoludniowa|" +
        "wieczorowa|dzienna|nocna (P=poranna, PP=popoludniowa, W=wieczorowa, D=dzienna, N=nocna; " +
        "godziny np. '7-15' też mapuj: 7/8→poranna lub dzienna gdy koniec≥18, 14/15/16→popoludniowa, " +
        "19/20→nocna, 21/22/23→wieczorowa). Zwróć WYŁĄCZNIE poprawny JSON: " +
        "{\"YYYY-MM-DD\": {\"Imię\": \"poranna\"}}. Tylko realne wpisy; puste komórki pomiń. " +
        "Daty wyłącznie w formacie YYYY-MM-DD. Jeśli nie da się rozczytać — zwróć {}.",
      user: `SIATKA ARKUSZA (wiersze):\n${JSON.stringify(payload?.grid ?? [], null, 0)}`,
    };
  }
  if (task === "search") {
    return {
      system:
        "Przeszukujesz zapisy operacyjne recepcji/HK hotelu (logi sprzątania, notatki zmian, " +
        "usterki, raporty, audyt). Każdy rekord ma: kiedy, kto, typ, treść. Na podstawie WYŁĄCZNIE " +
        "tych rekordów odpowiedz na pytanie: KTO, CO i KIEDY. Cytuj konkretne wpisy (data + osoba + " +
        "treść). Jeśli nic nie pasuje — napisz dokładnie „Brak wpisów pasujących do zapytania.\" " +
        "Nie zmyślaj. Po polsku, zwięźle, lista punktowana od najnowszych.",
      user: `PYTANIE: ${payload?.question ?? ""}\n\nREKORDY:\n${JSON.stringify(payload?.records ?? [], null, 0)}`,
    };
  }
  if (task === "polish") {
    return {
      system:
        "Poprawiasz i porządkujesz krótką notatkę recepcji hotelu po polsku. ZACHOWAJ wszystkie " +
        "fakty, liczby, numery pokoi, godziny i nazwiska bez zmian — nic nie dodawaj ani nie usuwaj " +
        "merytorycznie. Popraw ortografię, interpunkcję i styl, zrób zwięźle i czytelnie. " +
        "Zwróć WYŁĄCZNIE poprawiony tekst, bez komentarza, bez cudzysłowów.",
      user: String(payload?.text ?? ""),
    };
  }
  if (task === "route") {
    const workers = (payload?.workers ?? []).join(", ");
    const stats = JSON.stringify(payload?.stats ?? [], null, 1);
    return {
      system:
        "Przydzielasz pojedyncze zadanie sprzątania najlepszemu pracownikowi HK. Zwracasz " +
        "WYŁĄCZNIE JSON: {\"worker\": string, \"reason\": string}. Pole worker MUSI pochodzić " +
        `z listy: [${workers}]. Wybierz najmniej obciążonego (najwięcej gotowych / najmniej ` +
        "czekających pokoi). Jeśli podano numer pokoju — preferuj kogoś z pokojami na tym samym " +
        "piętrze (ten sam pierwszy znak numeru). reason: krótkie uzasadnienie po polsku.",
      user: `ZADANIE: ${payload?.text || ""}${payload?.room ? ` (pokój ${payload.room})` : ""}\nOBCIĄŻENIE PRACOWNIKÓW:\n${stats}`,
    };
  }
  if (task === "advisor") {
    const ctx = JSON.stringify(payload ?? {}, null, 1);
    return {
      system:
        "Jesteś asystentem recepcji nadzorującym sprzątanie pokoi. Na podstawie statystyk " +
        "obłożenia pracowników i proponowanych przeniesień napisz KRÓTKĄ uwagę po polsku " +
        "(maks. 2 zdania): kto skończył/jest wolny, kto przeciążony i które pokoje przenieść. " +
        "Używaj WYŁĄCZNIE podanych liczb i numerów pokoi — nie wymyślaj. Jeśli obciążenie jest " +
        "zrównoważone (brak sugestii), napisz krótko, że nie ma potrzeby zmian.",
      user: `STAN SPRZĄTANIA:\n${ctx}`,
    };
  }
  if (task === "history") {
    const ctx = JSON.stringify(payload ?? {}, null, 1);
    return {
      system:
        "Tworzysz zwięzłe podsumowanie dnia recepcji hotelu, po polsku, maks. 4 punkty. " +
        "Obejmij: ruch (zmiany/kasa), sprzątanie (ile pokoi gotowych), usterki (ile i czy pilne). " +
        "Używaj WYŁĄCZNIE podanych liczb — nie wymyślaj. Krótko, rzeczowo, lista punktowana.",
      user: `DANE DNIA:\n${ctx}`,
    };
  }
  if (task === "nudge") {
    const safeLine = payload?.safeRequired
      ? `Wpłata do sejfu zarejestrowana: ${payload?.safeDone ? "TAK" : "NIE — to KONIECZNE przed wyjściem"}. `
      : "";
    const missing = Array.isArray(payload?.missing) ? payload.missing.slice(0, 5) : [];
    return {
      system:
        "Jesteś asystentem recepcji hotelu. Napisz KRÓTKIE (1–2 zdania, po polsku) przyjazne, ale " +
        "stanowcze przypomnienie dla pracownika, któremu za chwilę kończy się zmiana. Przypomnij o " +
        "sprawdzeniu stanu kasy i zaznaczeniu wykonanych zadań. Jeśli wpłata do sejfu jest wymagana i " +
        "nie została zarejestrowana — wyraźnie podkreśl, że trzeba ją zarejestrować PRZED opuszczeniem " +
        "zmiany. Używaj WYŁĄCZNIE podanych liczb — nie wymyślaj kwot. Bez nagłówków i cudzysłowów.",
      user:
        `Zmiana: ${payload?.shiftLabel ?? "?"}. Do końca ~${payload?.minutesLeft ?? 20} min. ` +
        `KW końcowa wpisana: ${payload?.cashChecked ? "TAK" : "NIE"}. ${safeLine}` +
        `Zadania zaznaczone: ${payload?.tasksDone ?? 0}/${payload?.tasksTotal ?? 0}.` +
        (missing.length ? ` Niezaznaczone: ${missing.join(", ")}.` : ""),
    };
  }
  if (task === "reviews") {
    // payload.reviews: [{ score, positives, negatives, room_type }]
    const list = Array.isArray(payload?.reviews) ? payload.reviews : [];
    const lines = list
      .map((r: any, i: number) => {
        const plus = String(r?.positives ?? "").trim();
        const minus = String(r?.negatives ?? "").trim();
        const room = String(r?.room_type ?? "").trim();
        return `#${i + 1} [ocena ${r?.score ?? "?"}${room ? `, ${room}` : ""}] ` +
          `PLUSY: ${plus || "—"} | MINUSY: ${minus || "—"}`;
      })
      .join("\n");
    return {
      system:
        "Analizujesz opinie gości hotelu z Booking.com. Na podstawie WYŁĄCZNIE podanej listy " +
        "wyodrębnij powtarzające się tematy: za co goście CHWALĄ hotel (z pól PLUSY) i na co " +
        "ZGŁASZAJĄ PROBLEMY (z pól MINUSY). Grupuj synonimy w jeden temat (np. „czysto”, " +
        "„nieskazitelnie czysty” → „Czystość”). Każdy temat to krótka etykieta po polsku " +
        "(1–3 słowa) i liczba opinii, w których wystąpił. Sortuj malejąco po liczbie. " +
        "Maks. 8 tematów w każdej grupie, pomijaj tematy z count<1. Nie zmyślaj — jeśli żaden " +
        "gość czegoś nie wspomniał, nie dodawaj tematu. Zwróć WYŁĄCZNIE poprawny JSON w formacie: " +
        "{\"praised\":[{\"theme\":string,\"count\":number}],\"problems\":[{\"theme\":string," +
        "\"count\":number}],\"summary\":string}. Pole summary to jedno zdanie po polsku " +
        "podsumowujące, czego goście oczekują i co najczęściej kuleje.",
      user: `OPINIE (${list.length}):\n${lines || "(brak)"}`,
    };
  }
  if (task === "briefing") {
    const ctx = JSON.stringify(payload ?? {}, null, 1);
    return {
      system:
        "Tworzysz zwięzły briefing przekazania zmiany dla recepcji hotelu, po polsku. " +
        "Maksymalnie 5 punktów \"co musisz wiedzieć\". Tylko sprawy operacyjne wynikające z danych. " +
        "Nie wymyślaj faktów ani liczb. NIE wymieniaj nazw pól, list ani angielskich słów " +
        "(np. \"openFaults\", \"payload\"). NIE pisz, że czegoś brak, że lista jest pusta lub że " +
        "danych nie ma — po prostu POMIŃ taki punkt. Jeśli nie ma żadnych istotnych spraw, napisz " +
        "tylko jedno zdanie: \"Spokojna zmiana — brak pilnych spraw do przekazania.\" " +
        "DATY: przy każdej sprawie dotyczącej konkretnego terminu lub zdarzenia w czasie " +
        "(np. kurier, dostawa, odbiór, paczka, serwis, technik, wizyta, termin) ZACZNIJ punkt " +
        "od konkretnej daty w formacie DD.MM. Słowa względne (\"dziś\", \"jutro\", \"pojutrze\", " +
        "\"za X dni\", nazwa dnia tygodnia) PRZELICZ na konkretną datę względem pola \"kiedy\" " +
        "danej notatki (data jej zapisu) lub względem \"dataDzisiaj\". Jeśli termin wypada na " +
        "dziś — dopisz \"(DZIŚ)\"; jeśli już minął bez potwierdzenia — dopisz \"(zaległe)\". " +
        "Format: lista punktowana, każdy punkt jedno zdanie, naturalny język.",
      user: `DANE WEJŚCIOWE (zmiana ${payload?.shiftLabel ?? "?"}):\n${ctx}`,
    };
  }
  throw new Error("unknown_task");
}

async function logUsage(row: Record<string, unknown>) {
  if (!SUPABASE_URL || !SERVICE_ROLE) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/llm_usage`, {
      method: "POST",
      headers: {
        apikey: SERVICE_ROLE,
        Authorization: `Bearer ${SERVICE_ROLE}`,
        "content-type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify(row),
    });
  } catch (_) { /* log nie może wywrócić odpowiedzi */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!GROQ_API_KEY) return json({ error: "server_misconfigured" }, 500);

  let body: any;
  try { body = await req.json(); } catch { return json({ error: "bad_json" }, 400); }

  const task = String(body?.task ?? "");
  const tenant_id = body?.tenant_id ?? null;
  if (!(task in MODELS)) return json({ error: "unknown_task" }, 400);

  let payload = body?.payload ?? {};
  // RODO: dla briefingu redagujemy nazwiska zanim cokolwiek opuści naszą infrę.
  if (task === "briefing" && Array.isArray(payload?.redactNames) && payload.redactNames.length) {
    const redact = buildRedactor(payload.redactNames);
    const { redactNames, ...rest } = payload;
    payload = redact(rest);
  }

  const model = (MODELS as Record<string, string>)[task];
  const { system, user } = buildPrompt(task, payload);

  let resp: Response;
  try {
    resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: task === "weekly" ? 2000 : task === "briefing" ? 700 : 500,
        temperature: task === "triage" ? 0 : 0.3,
        // Tryb JSON dla zadań zwracających strukturę (triage, route, schedule).
        ...(task === "triage" || task === "route" || task === "schedule" || task === "reviews" || task === "grafik" ? { response_format: { type: "json_object" } } : {}),
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
  } catch (e) {
    return json({ error: "upstream_unreachable", detail: String(e) }, 502);
  }

  if (resp.status === 429) {
    const retryAfter = resp.headers.get("retry-after") || "";
    await logUsage({ tenant_id, task, model, ok: false });
    return json({ error: "rate_limited", retryAfter }, 429);
  }
  if (!resp.ok) {
    const detail = await resp.text();
    await logUsage({ tenant_id, task, model, ok: false });
    return json({ error: "upstream_error", status: resp.status, detail }, 502);
  }

  const data = await resp.json();
  const text = (data?.choices?.[0]?.message?.content ?? "").trim();
  const usage = data?.usage ?? {};
  await logUsage({
    tenant_id, task, model, ok: true,
    tokens_in: usage.prompt_tokens ?? 0,
    tokens_out: usage.completion_tokens ?? 0,
  });

  // triage/route/schedule: oczekujemy JSON — parsujemy, a gdy się nie uda, klient ma fallback.
  if (task === "triage" || task === "route" || task === "schedule" || task === "reviews" || task === "grafik") {
    let parsed: unknown = null;
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    } catch { parsed = null; }
    return json({ data: parsed, text });
  }

  return json({ text });
});
