// Parser "Lista przyjazdów" / "Lista wyjazdów" (KWHotel) — w odróżnieniu od
// siatek (tygodniowy, dzienny, posiłki) to WOLNY TEKST: imiona, telefony,
// dowolne uwagi. Regex tu jest kruchy, więc ekstrakcję robi LLM (Groq) zamiast
// kolejnego ręcznego parsera pozycyjnego.
//
// Dwie role naraz:
//  1) wyciąga to, czego dotąd nie było: gość, telefon, nazwa/nr grupy, pełna
//     lista pokoi grupy, typ pokoja z uwag (TYLKO gdy uwaga opisuje KONKRETNIE
//     ten pokój — nie zbiorczy skład grupy typu "7 sgl + 8 dbl + ..."), czy to
//     rezerwacja biznesowa (firma/tour-operator → codzienne PG).
//  2) pełni funkcję "recepcja zapomniała wpisać ręcznie, ale KWHotel to ma w
//     uwagach" — wynik tej ekstrakcji nadpisuje braki, nie nadpisuje tego, co
//     pracownik już świadomie ustawił ręcznie (o tym decyduje kod wołający).

const ARRIVALS_HEADER_RE = /Lista\s+przyjazd/i;
const DEPARTURES_HEADER_RE = /Lista\s+wyjazd/i;

function isArrivalsReport(text, filename) {
  return ARRIVALS_HEADER_RE.test(text || "") || /arrival/i.test(filename || "");
}

function isDeparturesReport(text, filename) {
  return DEPARTURES_HEADER_RE.test(text || "") || /departure/i.test(filename || "");
}

// Siatka bezpieczeństwa niezależna od LLM — nawet gdyby model pominął flagę,
// jawny marker firmowy w tekście zawsze wymusza is_business=true.
const BUSINESS_MARKERS_RE = /rez\s*firmow|sp\.?\s*z\s*o\.?\s*o\.?|GMBH|S\.?R\.?L\.?\b|S\.?A\.?\b|LTD\b/i;

// Numer pokoju zawsze zaczyna się cyfrą (opcjonalnie 1-2 litery aneksu, np.
// "118A") — ten sam wzorzec co roomTok w parser-posilki.cjs, żeby oba parsery
// zgadzały się co jest "prawdziwym" numerem pokoju. LLM czasem (incydent
// 2026-07-28, grupa 5083G/Bąk Konrad) wpisuje w to pole opisowe słowo z uwag
// ("Apartament") zamiast numeru z KWHotel — taki token trafiał wprost do
// meal_plans.room i tworzył widmowy kafel zamiast prawdziwego pokoju (106).
const ROOM_TOKEN_RE = /^-?\d+[A-Za-z]{0,2}$/;

function cleanRoomToken(raw) {
  if (!raw) return null;
  const upper = String(raw).toUpperCase();
  return ROOM_TOKEN_RE.test(upper) ? upper : null;
}

// GROUNDING — najważniejsza bariera antyhalucynacyjna. LLM "wygładza" listy
// pokoi do ciągłych zakresów: incydent 2026-07-28, grupa 3550 (KOMPAS POLAND)
// dostała DOPISANE 226/306/308/311/313 (nie ma ich w raporcie) i ZGUBIŁA
// 208-215/301/302. Skutek na 30.07: 5 pokoi ze śniadaniem dla nikogo i 10
// realnych pokoi bez śniadania. Numer pokoju, który NIE występuje dosłownie
// w tekście źródłowym, jest zmyślony — odrzucamy go bez dyskusji. Sprawdzenie
// jest deterministyczne i darmowe (żadnych dodatkowych tokenów).
function roomAppearsInSource(room, sourceText) {
  if (!room) return false;
  return new RegExp(`(?<![0-9A-Za-z])${room}(?![0-9])`, "i").test(sourceText || "");
}

// Jeśli "per_room_type" wygląda jak zbiorczy skład grupy (kilka par
// liczba+typ połączonych "+"), to NIE jest typem TEGO pokoju — zeruj, żeby
// nie nadpisać typu pojedynczego pokoju bzdurą typu "7 sgl + 8 dbl + ...".
// Pojedynczy pokój ma zawsze dokładnie 1 sztukę danego typu łóżka (np.
// "1 dbl + 1 twin" = pokój rodzinny) — to NIE jest zbiorczy skład grupy,
// mimo że pasuje do wzorca "liczba+typ" ×2. Grupę poznajemy po tym, że
// którakolwiek liczba >1 (kilka pokoi danego typu) albo pozycji jest ≥3.
const ROOM_TYPE_COUNT_RE = /(\d+)\s*(sgl|dbl|twin|trpl)\b/gi;

function sanitizeRoomType(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  const matches = [...value.matchAll(ROOM_TYPE_COUNT_RE)];
  const looksLikeGroupBreakdown = matches.length >= 3 || matches.some((m) => Number(m[1]) > 1);
  if (matches.length >= 2 && looksLikeGroupBreakdown) return null;
  return value;
}

const SYSTEM_PROMPT = `Jesteś parserem raportów hotelowych KWHotel (Polska, format PDF->tekst).
Dostajesz tekst raportu "Lista przyjazdów" albo "Lista wyjazdów". Zwróć WYŁĄCZNIE jeden obiekt JSON
(bez markdown, bez komentarzy) w dokładnie takim kształcie:

{
  "individual": [
    {
      "room": "101",
      "guest_name": "Imię Nazwisko",
      "phone": "numer telefonu albo null",
      "arrival": "YYYY-MM-DD",
      "departure": "YYYY-MM-DD",
      "price": liczba albo null,
      "due_amount": liczba albo null,
      "source": "np. Booking.com / Expedia / walkin / e-mail rezerwacja własna",
      "notes": "surowe uwagi z rezerwacji, połączone spacją",
      "per_room_type": "dbl / sgl / twin / trpl / apartament / dbl+twin — TYLKO jeśli uwaga opisuje typ TEGO KONKRETNEGO pokoju, inaczej null",
      "reservation_id": "numer rezerwacji jeśli jest, inaczej null",
      "is_business": true/false (rezerwacja firmowa/korporacyjna, np. źródło \"E-mail - rez firmowa\" albo nazwa z GMBH/SRL/Sp. z o.o.)
    }
  ],
  "groups": [
    {
      "group_no": "numer grupy bez litery, np. 4963 z \"Gr. 4963\"",
      "group_name": "nazwa firmy/grupy, np. HELLO HOLIDAYS SRL",
      "rooms": ["lista", "wszystkich", "numerów", "pokoi", "tej", "grupy"],
      "arrival": "YYYY-MM-DD",
      "departure": "YYYY-MM-DD",
      "source": "źródło rezerwacji grupy",
      "notes": "surowe uwagi grupy (np. skład pokoi, parking)",
      "persons_from_list": liczba osób wg pola \"L. osób\"/\"Liczba osób\" w raporcie (może być niedokładna, informacyjnie),
      "is_business": true/false,
      "per_room_type": null
    }
  ],
  "warnings": ["dowolne niejasności napotkane przy czytaniu"]
}

Zasady:
- "individual" = pojedyncze rezerwacje (sekcja "Rezerwacje pojedyncze"). "groups" = rezerwacje grupowe
  (sekcja "Rezerwacje grupowe") — każda grupa RAZ, z pełną listą pokoi (nie osobny wpis per pokój).
- per_room_type ustawiaj TYLKO gdy uwaga jednoznacznie opisuje typ JEDNEGO pokoju (np. "dbl", "TWIN bez
  śniadania", "d+t+1sofa"). Jeśli uwaga to zbiorczy skład całej grupy (np. "7 sgl BB + 8 dbl BB + 8 twin BB
  + 1 trpl BB") — to NIE jest typem konkretnego pokoju, zostaw per_room_type: null.
- is_business = true dla rezerwacji firmowych/grupowych/tour-operatorów (źródło typu "E-mail - rez firmowa",
  nazwa firmy z GMBH/SRL/Sp. z o.o./LTD/S.A., grupa autokarowa). Zwykli goście indywidualni (Booking.com,
  Expedia, walk-in, os. fizyczna) = false.
- Daty zawsze jako YYYY-MM-DD. Jeśli czegoś nie da się ustalić, wstaw null (nie zgaduj).
- Nie pomijaj żadnego wiersza z tabeli — każdy pokój z sekcji pojedynczych i każda grupa z sekcji grupowych
  musi się pojawić w wyniku. Raport ma linię "Liczba pokoi: N" pod każdą sekcją/grupą — Twoja lista pokoi
  (indywidualne + wszystkie rooms[] razem) MUSI mieć dokładnie tyle pozycji ile tam podano. Jeśli grupa ma
  20+ pokoi, przejdź przez KAŻDY wiersz po kolei, nie skracaj listy i nie zatrzymuj się w połowie.
- "group_no" przepisz DOKŁADNIE tak jak jest wydrukowane po "Gr." w tekście (np. "Gr. 4963" → "4963").
  NIGDY nie wymyślaj własnego numeru grupy i nie dziel jednej grupy o jednym numerze na dwie różne grupy —
  jeśli w tekście widzisz ten sam "Gr. XXXX" powtórzony kilka razy (bo drukuje się przy każdym wierszu),
  to wciąż JEDNA grupa z jedną listą pokoi.`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Darmowy tier Groq dla tego modelu ma limit 12k tokenow/min — jeden raport
// z duza grupa (~20+ pokoi) potrafi zuzyc 8-9k, wiec DWA raporty tego typu
// w jednej paczce maila (typowe: przyjazdy+wyjazdy albo dwa pliki przyjazdow
// jak w praktyce sie zdarza) prawie zawsze traf w limit na drugim wywolaniu.
// Groq zwraca w komunikacie "Please try again in Xs" — czekamy dokladnie tyle
// (plus margines) i probujemy raz jeszcze, zamiast od razu poddawac sie i tracic dane.
async function callGroq({ apiKey, model, text, reportKind }, attempt = 1) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      max_completion_tokens: 4000,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Typ raportu: ${reportKind}.\n\nTekst raportu:\n${text}` },
      ],
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 429 && attempt < 3) {
      const waitMatch = body.match(/try again in ([\d.]+)s/i);
      const waitMs = Math.min(60000, Math.ceil((waitMatch ? Number(waitMatch[1]) : 20) * 1000) + 1500);
      await sleep(waitMs);
      return callGroq({ apiKey, model, text, reportKind }, attempt + 1);
    }
    throw new Error(`Groq HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq: pusta odpowiedź (brak choices[0].message.content).");
  return JSON.parse(content);
}

// Text raportów bywa bardzo długi przy dużych grupach — ucinamy, żeby nie
// wysadzić budżetu tokenów/kosztu jednego wywołania; ostrzeżenie trafia do logów.
const MAX_TEXT_CHARS = 18000;

async function extractGuestsWithLlm(text, { apiKey, model, reportKind, log } = {}) {
  const empty = { individual: [], groups: [], warnings: [] };
  if (!apiKey) {
    empty.warnings.push("LLM pominięty: brak klucza Groq API (config.llm.enabled=true wymaga klucza).");
    return empty;
  }

  let input = String(text || "");
  let truncated = false;
  if (input.length > MAX_TEXT_CHARS) {
    input = input.slice(0, MAX_TEXT_CHARS);
    truncated = true;
  }

  let raw;
  try {
    raw = await callGroq({ apiKey, model: model || "llama-3.3-70b-versatile", text: input, reportKind });
  } catch (e) {
    log?.warn?.(`LLM ekstrakcja gości nieudana: ${e.message}`);
    empty.warnings.push(`LLM ekstrakcja nieudana: ${e.message}`);
    return empty;
  }

  const individual = Array.isArray(raw.individual) ? raw.individual : [];
  const groups = Array.isArray(raw.groups) ? raw.groups : [];
  const warnings = Array.isArray(raw.warnings) ? raw.warnings.slice() : [];
  if (truncated) warnings.push("Tekst raportu ucięty przed wysłaniem do LLM (za długi) — sprawdź czy nic nie zgubiono.");

  const cleanIndividual = individual.map((row) => {
    const shapedRoom = cleanRoomToken(row.room);
    if (row.room && !shapedRoom) warnings.push(`Odrzucono nienumeryczny numer pokoju z LLM: "${row.room}" (gość: ${row.guest_name || "?"}) — nie wygląda jak prawdziwy numer.`);
    const room = shapedRoom && roomAppearsInSource(shapedRoom, input) ? shapedRoom : null;
    if (shapedRoom && !room) warnings.push(`HALUCYNACJA: pokoj "${shapedRoom}" (gość: ${row.guest_name || "?"}) NIE wystepuje w raporcie — odrzucony.`);
    return {
      room,
      guest_name: row.guest_name || null,
      phone: row.phone || null,
      arrival: row.arrival || null,
      departure: row.departure || null,
      price: typeof row.price === "number" ? row.price : null,
      due_amount: typeof row.due_amount === "number" ? row.due_amount : null,
      source: row.source || null,
      notes: row.notes || null,
      per_room_type: sanitizeRoomType(row.per_room_type),
      reservation_id: row.reservation_id ? String(row.reservation_id) : null,
      is_business: !!row.is_business || BUSINESS_MARKERS_RE.test(`${row.source || ""} ${row.guest_name || ""}`),
    };
  });

  const cleanGroups = groups.map((row) => {
    const rawRooms = Array.isArray(row.rooms) ? row.rooms : [];
    const shaped = rawRooms.map(cleanRoomToken).filter(Boolean);
    if (shaped.length < rawRooms.length) {
      warnings.push(`Grupa ${row.group_name || row.group_no || "?"}: odrzucono ${rawRooms.length - shaped.length} nienumerycznych "pokoi" z LLM (${rawRooms.filter((r) => !cleanRoomToken(r)).join(", ")}).`);
    }
    const rooms = shaped.filter((r) => roomAppearsInSource(r, input));
    const invented = shaped.filter((r) => !roomAppearsInSource(r, input));
    if (invented.length) {
      warnings.push(`HALUCYNACJA: grupa ${row.group_name || row.group_no || "?"} — LLM podał ${invented.length} pokoi, ktorych NIE MA w raporcie: ${invented.join(", ")}. Odrzucone.`);
    }
    return {
      group_no: row.group_no ? String(row.group_no) : null,
      group_name: row.group_name || null,
      rooms,
      arrival: row.arrival || null,
      departure: row.departure || null,
      source: row.source || null,
      notes: row.notes || null,
      persons_from_list: typeof row.persons_from_list === "number" ? row.persons_from_list : null,
      // Grupy niemal zawsze firmowe/tour-operator — domyślnie true, chyba że LLM
      // jawnie zaprzeczy I nie ma żadnego markera firmowego w tekście.
      is_business: row.is_business !== false || BUSINESS_MARKERS_RE.test(`${row.source || ""} ${row.group_name || ""}`),
      per_room_type: null,
    };
  });

  // Siatka bezpieczeństwa na recall: LLM przy dużych grupach (20+ pokoi) czasem
  // "leni się" i ucina listę pokoi w połowie bez ostrzeżenia. Raport sam podaje
  // "Liczba pokoi: N" pod każdą sekcją — jeśli suma wyciągniętych pokoi nie
  // zgadza się z NAJWIĘKSZĄ zadeklarowaną liczbą, flaguj to jawnie zamiast
  // cicho ufać niekompletnej liście (wpłynęłoby to na wymuszanie PG per pokój).
  const declaredCounts = [...String(text || "").matchAll(/Liczba\s+pokoi\s*:\s*(\d+)/gi)].map((m) => Number(m[1]));
  if (declaredCounts.length) {
    const maxDeclared = Math.max(...declaredCounts);
    const extractedTotal = cleanIndividual.length + cleanGroups.reduce((sum, g) => sum + g.rooms.length, 0);
    if (extractedTotal < maxDeclared) {
      warnings.push(`Raport deklaruje maks. ${maxDeclared} pokoi w jednej sekcji, ale LLM wyciągnął łącznie ${extractedTotal} (indywidualne+grupy) — możliwe pominięte wiersze, zwłaszcza w dużej grupie.`);
    }
  }

  return { individual: cleanIndividual, groups: cleanGroups, warnings };
}

// Konwertuje wynik ekstrakcji do kształtu "parsed" zgodnego z resztą pipeline'u
// (parser.cjs / mergeReports / computeStatuses) — reservations[] wystarczy,
// mergeReports sam dopisze eventsByDate z arrivalDate/departureDate.
function toParsedShape(extracted, { reportDate } = {}) {
  const reservations = [];
  const warnings = [...(extracted.warnings || [])];

  for (const row of extracted.individual || []) {
    if (!row.room || !row.arrival || !row.departure) {
      warnings.push(`Pominięto rezerwację indywidualną bez pokoju/dat: ${row.guest_name || "?"} (${row.room || "brak pokoju"}).`);
      continue;
    }
    reservations.push({
      room: row.room,
      arrivalDate: row.arrival,
      departureDate: row.departure,
      rawLine: `[GOŚĆ] ${row.room}: ${row.guest_name || "?"} (${row.source || "brak źródła"})`,
      notesStatus: row.is_business ? "PG" : undefined,
      guestMeta: row,
    });
  }

  for (const group of extracted.groups || []) {
    if (!group.arrival || !group.departure || !group.rooms?.length) {
      warnings.push(`Pominięto grupę bez dat/listy pokoi: ${group.group_name || group.group_no || "?"}.`);
      continue;
    }
    for (const room of group.rooms) {
      reservations.push({
        room,
        arrivalDate: group.arrival,
        departureDate: group.departure,
        rawLine: `[GRUPA ${group.group_name || group.group_no || "?"}] ${room}`,
        notesStatus: group.is_business ? "PG" : undefined,
        guestMeta: { ...group, room },
      });
    }
  }

  return {
    reservations,
    eventsByDate: {},
    warnings,
    stats: { lines: reservations.length, matchedLines: reservations.length },
    reportDate: reportDate || null,
  };
}

module.exports = {
  isArrivalsReport,
  isDeparturesReport,
  extractGuestsWithLlm,
  sanitizeRoomType,
  cleanRoomToken,
  roomAppearsInSource,
  toParsedShape,
  BUSINESS_MARKERS_RE,
};
