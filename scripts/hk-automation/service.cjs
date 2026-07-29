#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { loadConfig, getGroqApiKey } = require("./lib/config.cjs");
const { todayKey } = require("./lib/dates.cjs");
const { fetchPdfAttachments, deleteOldMail } = require("./lib/mail.cjs");
const { extractPdfText, extractPdfPositions } = require("./lib/pdf.cjs");
const { parseAnyKwhotelReport, parseWeeklyGrid, isWeeklyReport } = require("./lib/parser.cjs");
const { mergeReports } = require("./lib/merge-reports.cjs");
const { computeStatuses } = require("./lib/status-logic.cjs");
const { writePlans } = require("./lib/plans.cjs");
const { writeSourceSnapshots } = require("./lib/source-snapshots.cjs");
const { loadReportHistory, mergeReportHistory, saveReportHistory } = require("./lib/report-history.cjs");
const { upsertPlansToSupabase } = require("./lib/supabase-sync.cjs");
const { isPosilkiReport, parsePosilkiGrid } = require("./lib/parser-posilki.cjs");
const { upsertMealsToSupabase, deleteStaleMealRows, detectCancelledMealReservations, deleteCancelledMealRows } = require("./lib/meals-sync.cjs");
const {
  isArrivalsReport,
  isDeparturesReport,
  extractGuestsWithLlm,
  toParsedShape,
} = require("./lib/parser-guests-llm.cjs");
const { writeGuestSnapshot, loadPersistedGroups, preferGroupWithRooms } = require("./lib/guest-snapshots.cjs");
const { expandGroupMealReservations } = require("./lib/meals-group-expand.cjs");
const { extractGroupRoomsFromPositions, loadGroupRoomsFromRecentPdfs } = require("./lib/parser-arrivals-groups.cjs");
const { recordMailFetchResult } = require("./lib/mail-health.cjs");

function getArg(name, fallback = "") {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] || fallback : fallback;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function log(message) {
  console.log(`[hk-auto] ${new Date().toISOString()} ${message}`);
}

async function processPdfFiles(pdfFiles, config) {
  const generatedAt = new Date().toISOString();
  const incomingReports = [];
  const mealsReservations = [];
  const posilkiFiles = [];
  const mealsWarnings = [];
  const guestIndividual = [];
  const guestGroups = [];
  const guestWarnings = [];
  const groqApiKey = config.llm?.enabled ? getGroqApiKey(config) : "";
  const llmTextSeen = new Set();
  const textHash = (t) => require("crypto").createHash("md5").update(String(t || "")).digest("hex");

  for (const pdfPath of pdfFiles) {
    log(`Czytam PDF: ${pdfPath}`);
    const text = await extractPdfText(pdfPath);
    const filename = path.basename(pdfPath);

    // "Raport Posiłków" (ReportThreeDayMeals) — zupełnie inne dane (posiłki, nie
    // status pokoi), zbierane osobno i wysyłane do meal_plans, NIE do hk_plan.
    if (isPosilkiReport(text, filename)) {
      const positions = await extractPdfPositions(pdfPath);
      const mealsParsed = parsePosilkiGrid(positions, { tenantId: config.tenantId });
      log(`  -> raport POSIŁKÓW: ${mealsParsed.reservations.length} rezerwacji, dni: ${mealsParsed.dates.filter(Boolean).join(", ")}`);
      if (mealsParsed.warnings.length) log(`  -> ostrzezenia posilkow: ${mealsParsed.warnings.length}`);
      mealsReservations.push(...mealsParsed.reservations);
      posilkiFiles.push({ file: filename, reservations: mealsParsed.reservations, dates: mealsParsed.dates });
      mealsWarnings.push(...mealsParsed.warnings);
      continue;
    }

    // "Lista przyjazdów"/"Lista wyjazdów" — wolny tekst (gość, telefon, grupa,
    // uwagi), inny charakter niż siatki powyżej. Ekstrakcja przez LLM (Groq),
    // bo regex tu jest kruchy (patrz komentarz w parser-guests-llm.cjs).
    if (isArrivalsReport(text, filename) || isDeparturesReport(text, filename)) {
      const reportKind = isArrivalsReport(text, filename) ? "przyjazdy" : "wyjazdy";

      // POKOJE GRUP — deterministycznie z pozycji, NIE z LLM. Numer pokoju to
      // dana strukturalna; model jezykowy "wygladzal" ja do ciaglych zakresow
      // (28.07.2026: grupa 3550 dostala 5 zmyslonych pokoi i stracila 10
      // prawdziwych). Liczone ZAWSZE, takze gdy LLM jest wylaczony albo padl
      // na limicie tokenow — dzieki temu rozbicie grupy na pokoje nie zalezy
      // juz od dostepnosci Groq.
      let positionalGroups = [];
      try {
        const positions = await extractPdfPositions(pdfPath);
        const pg = extractGroupRoomsFromPositions(positions);
        positionalGroups = pg.groups.filter((g) => g.group_no && g.rooms.length);
        if (positionalGroups.length) {
          log(`  -> pokoje grup (pozycyjnie, bez LLM): ${positionalGroups.map((g) => `${g.group_no}:${g.rooms.length}`).join(", ")}`);
        }
        pg.warnings.forEach((w) => { log(`  -> UWAGA grupy: ${w}`); guestWarnings.push(w); });
      } catch (e) {
        log(`  -> pozycyjna ekstrakcja pokoi grup nieudana: ${e.message}`);
      }
      const applyPositionalRooms = (llmGroups) => llmGroups.map((g) => {
        const truth = positionalGroups.find((p) => String(p.group_no) === String(g.group_no));
        if (!truth) return g;
        const invented = (g.rooms || []).filter((r) => !truth.rooms.includes(r));
        if (invented.length) {
          const msg = `Grupa ${g.group_no}: LLM podal pokoje spoza raportu (${invented.join(", ")}) — zastapione lista pozycyjna.`;
          log(`  -> ${msg}`); guestWarnings.push(msg);
        }
        return { ...g, rooms: truth.rooms };
      });
      const mergeLeftoverGroups = (llmGroups) => {
        const known = new Set(llmGroups.map((g) => String(g.group_no)));
        return positionalGroups
          .filter((p) => !known.has(String(p.group_no)))
          .map((p) => ({ group_no: p.group_no, group_name: p.group_name, rooms: p.rooms, is_business: true, per_room_type: null, persons_from_list: null }));
      };
      // WAZNE: NIE uzywac tu generycznego parseAnyKwhotelReport jako fallbacku.
      // Ten raport to wolny tekst z notatkami gosci (np. Booking.com Genius: "VAT:
      // 76.20 PLN") — extractDateTokens w parser.cjs lapie "76.20" jako date "dzien.
      // miesiac" i produkuje bzdurne dateKeys typu "2026-20-76", ktore trafily do
      // prawdziwych plikow planu w produkcji (2026-07-26). Zamiast zgadywac zepsutym
      // regexem, ten raport parsujemy WYLACZNIE przez LLM; bez klucza — pomijamy go
      // calkowicie i polegamy na raporcie tygodniowym/dziennym (pokoj+data i tak stamtad).
      if (!config.llm?.enabled) {
        log(`  -> raport ${reportKind.toUpperCase()}: LLM wylaczony w config — biore z niego TYLKO pokoje grup (pozycyjnie).`);
        guestGroups.push(...mergeLeftoverGroups([]));
      } else if (!groqApiKey) {
        log(`  -> raport ${reportKind.toUpperCase()}: brak klucza Groq API (${config.llm.apiKeyEnv}) — biore TYLKO pokoje grup (pozycyjnie).`);
        guestGroups.push(...mergeLeftoverGroups([]));
      } else if (llmTextSeen.has(textHash(text))) {
        // KWHotel wysyla ten sam raport wielokrotnie (rozne pliki, IDENTYCZNA
        // tresc po ekstrakcji). 2026-07-28: 13 plikow = 3 unikalne tresci, czyli
        // 12 wywolan LLM zamiast 2 — to wyczerpalo dzienny limit tokenow Groq
        // (100k TPD) i 4 raporty zostaly pominiete CALKOWICIE. Liczy sie tresc,
        // nie bajty pliku (PDF-y roznia sie metadanymi/timestampem).
        log(`  -> raport ${reportKind.toUpperCase()}: identyczna tresc juz przetworzona w tym cyklu — pomijam wywolanie LLM (oszczednosc tokenow).`);
      } else {
        llmTextSeen.add(textHash(text));
        const extracted = await extractGuestsWithLlm(text, {
          apiKey: groqApiKey,
          model: config.llm.model,
          reportKind,
          log: { warn: (m) => log(m) },
        });
        log(`  -> raport ${reportKind.toUpperCase()}: ${extracted.individual.length} indywidualnych, ${extracted.groups.length} grup (LLM).`);
        if (extracted.warnings.length) log(`  -> ostrzezenia LLM: ${extracted.warnings.length}`);
        if (extracted.individual.length || extracted.groups.length) {
          // Pokoje grup z LLM sa NADPISYWANE lista pozycyjna (zrodlo prawdy);
          // z LLM zostaja nazwy, uwagi i flagi biznesowe.
          const groups = applyPositionalRooms(extracted.groups);
          guestIndividual.push(...extracted.individual);
          guestGroups.push(...groups, ...mergeLeftoverGroups(groups));
          guestWarnings.push(...extracted.warnings);
          const parsed = toParsedShape({ ...extracted, groups }, { reportDate: null });
          incomingReports.push({ id: path.resolve(pdfPath), name: filename, importedAt: new Date().toISOString(), parsed });
        } else {
          // LLM padl (limit tokenow / blad) — pokoje grup i tak mamy z pozycji.
          log(`  -> raport ${reportKind.toUpperCase()}: LLM zwrocil pusty wynik — uzywam samych pokoi grup z parsera pozycyjnego.`);
          guestGroups.push(...mergeLeftoverGroups([]));
        }
      }
      continue;
    }

    let parsed;
    if (isWeeklyReport(text, filename)) {
      // Raport TYGODNIOWY = siatka pokoje × 7 dni → "drugi odczyt" po pozycjach (x,y).
      const positions = await extractPdfPositions(pdfPath);
      parsed = parseWeeklyGrid(positions, { fallbackYear: new Date().getFullYear() });
      log(`  -> raport TYGODNIOWY: ${parsed.stats.lines} pokoi, ${parsed.reservations.length} rezerwacji, dni: ${Object.keys(parsed.eventsByDate).sort().join(", ")}`);
    } else {
      parsed = parseAnyKwhotelReport(text, { fallbackYear: new Date().getFullYear() });
    }
    const importedAt = new Date().toISOString();
    incomingReports.push({
      id: path.resolve(pdfPath),
      name: filename,
      importedAt,
      parsed,
    });
  }

  // Anulowane w trakcie generowania paczki — patrz detectCancelledMealReservations
  // w meals-sync.cjs (incydent 2026-07-29). Filtrujemy PRZED dalszym uzyciem
  // mealsReservations, zeby anulowana rezerwacja nie zasilila tez licznika osob
  // w grupie (blok nizej) ani rozbicia na pokoje.
  const mealsCancelledIds = detectCancelledMealReservations(posilkiFiles, { warn: (m) => log(m) });
  if (mealsCancelledIds.size) {
    const before = mealsReservations.length;
    mealsReservations.splice(0, mealsReservations.length, ...mealsReservations.filter((r) => !mealsCancelledIds.has(r.reservation_id)));
    log(`  -> pominieto ${before - mealsReservations.length} pozycji anulowanych rezerwacji z tego wsadu.`);
  }

  // Liczba osób w grupie z Listy przyjazdów/wyjazdów bywa niedokładna (to samo
  // zjawisko co w Raporcie Posiłków) — jeśli ta sama grupa (po numerze) ma już
  // policzoną liczbę ze śniadań, ta wygrywa jako realny manifest gości.
  if (guestGroups.length && mealsReservations.length) {
    const breakfastPersonsByGroupNo = new Map();
    for (const meal of mealsReservations) {
      if (!meal.is_group) continue;
      const groupNo = String(meal.reservation_id || "").replace(/G$/i, "");
      if (groupNo) breakfastPersonsByGroupNo.set(groupNo, meal.persons);
    }
    for (const group of guestGroups) {
      const verified = group.group_no ? breakfastPersonsByGroupNo.get(String(group.group_no)) : null;
      if (verified != null) {
        log(`  -> grupa ${group.group_name || group.group_no}: liczba osob z listy=${group.persons_from_list}, ze sniadan=${verified} (uzyta).`);
        group.persons = verified;
      } else {
        group.persons = group.persons_from_list;
      }
    }
  } else {
    for (const group of guestGroups) group.persons = group.persons_from_list;
  }

  if (guestIndividual.length || guestGroups.length) {
    const guestFile = writeGuestSnapshot(config.outputDir, {
      individual: guestIndividual,
      groups: guestGroups,
      warnings: guestWarnings,
      generatedAt,
    });
    if (guestFile) log(`Zapisano dane gosci/grup (LLM): ${guestFile}`);
  }

  // Rozbicie kafla GRUPA na pojedyncze pokoje w posiłkach: Lista przyjazdów/
  // wyjazdów nie zawsze przychodzi w TEJ SAMEJ paczce co Raport Posiłków, więc
  // oprócz grup z bieżącego cyklu dociągamy też te z ostatnich zrzutów na dysku
  // (nadal aktualne, bo pobyt jeszcze trwa) — patrz komentarz w guest-snapshots.cjs.
  let mealsStaleAggregateRows = [];
  if (mealsReservations.length) {
    const persistedGroups = loadPersistedGroups(config.outputDir, { todayIso: todayKey() });
    const groupsByNo = new Map();
    for (const g of persistedGroups) if (g.group_no) groupsByNo.set(String(g.group_no), g);
    // Biezacy cykl nadpisuje starsze TYLKO gdy nie zgubil listy pokoi — patrz
    // preferGroupWithRooms (gorsza ekstrakcja LLM nie moze skasowac dobrej).
    for (const g of guestGroups) if (g.group_no) groupsByNo.set(String(g.group_no), preferGroupWithRooms(groupsByNo.get(String(g.group_no)), g));

    // OSTATNIE SLOWO ma odczyt POZYCYJNY z zarchiwizowanych PDF-ow. Zrzuty
    // guests-*.json zapisane wczesniej moga zawierac zahalucynowane przez LLM
    // listy pokoi i BEZ tego kroku reinfekowaly baze przy kazdym cyklu —
    // 28.07.2026 uzgodniona baza wrocila do blednych 38 pokoi grupy 3550 juz
    // po najblizszym uruchomieniu. PDF sie nie psuje, wiec czytamy go na nowo.
    const pdfGroups = await loadGroupRoomsFromRecentPdfs(path.join(config.outputDir, "mail-pdf"), {
      extractPositions: extractPdfPositions,
      log: (m) => log(m),
    });
    for (const g of pdfGroups) {
      const prev = groupsByNo.get(String(g.group_no));
      if (prev && prev.rooms?.length && prev.rooms.join() !== g.rooms.join()) {
        log(`  -> grupa ${g.group_no}: lista pokoi ze zrzutu (${prev.rooms.length}) zastapiona odczytem z PDF (${g.rooms.length}).`);
      }
      groupsByNo.set(String(g.group_no), { ...(prev || {}), ...g });
    }
    const expansion = expandGroupMealReservations(mealsReservations, [...groupsByNo.values()]);
    mealsStaleAggregateRows = expansion.staleAggregateRows;
    if (expansion.expandedGroups.length) {
      expansion.expandedGroups.forEach((g) => log(`  -> grupa ${g.group_name || g.reservation_id}: rozbita na ${g.rooms} pokoi (${g.persons} os. razem).`));
    }
    mealsReservations.splice(0, mealsReservations.length, ...expansion.reservations);
  }

  const reports = config.useReportHistory === false
    ? incomingReports
    : mergeReportHistory(loadReportHistory(config.outputDir), incomingReports, config.reportHistoryLimit);
  if (config.useReportHistory !== false) saveReportHistory(config.outputDir, reports);
  const combined = mergeReports(reports);
  const historyReportCount = reports.length;

  const plansByDate = computeStatuses(combined, {
    startDate: config.startDate || todayKey(),
    daysAhead: config.daysAhead,
    statusLogic: config.statusLogic,
    generatedAt,
  });

  const written = writePlans(config.outputDir, plansByDate, {
    generatedAt,
    dryRun: config.dryRun,
    writeEmptyPlans: config.writeEmptyPlans === true,
    pdfFiles,
    parserWarnings: combined.warnings,
    historyReportCount,
  });
  const sourceWritten = writeSourceSnapshots(config.outputDir, combined, plansByDate, {
    generatedAt,
    dryRun: config.dryRun,
    writeEmptyPlans: config.writeEmptyPlans === true,
    pdfFiles,
    parserWarnings: combined.warnings,
    historyReportCount,
  });

  log(`Zapisano plany: ${written.length ? written.map((item) => `${item.dateKey}:${item.rooms}`).join(", ") : "brak zmian"}`);
  log(`Zapisano zrodla: ${sourceWritten.length ? sourceWritten.map((item) => `${item.dateKey}:${item.rooms}`).join(", ") : "brak zmian"}`);
  log(`Historia raportow: ${historyReportCount}`);
  if (combined.warnings.length) log(`Ostrzezenia parsera: ${combined.warnings.length}`);

  // Upsert do Supabase, zeby wyjazdy.html mial swieze pm_room_types nawet gdy
  // Electron app nie jest uruchomiony (zadanie Windows odpala tylko ten plik).
  if (!config.dryRun) {
    try {
      const result = await upsertPlansToSupabase(plansByDate, { generatedAt }, {
        info: (msg) => log(msg.replace(/^\[hk-auto\]\s*/, "")),
        warn: (msg) => log(msg.replace(/^\[hk-auto\]\s*/, "")),
      });
      if (result.ok && result.uploaded > 0) log(`Supabase sync: zapisano ${result.uploaded} dni.`);
    } catch (e) {
      log(`Supabase sync BLAD: ${e.message}`);
    }
  }

  // Raport posiłków (jeśli był w tej paczce maili) — osobny upload do meal_plans.
  if (mealsWarnings.length) log(`Ostrzezenia posilkow: ${mealsWarnings.length}`);
  if (mealsReservations.length && !config.dryRun) {
    try {
      const upsertResult = await upsertMealsToSupabase(mealsReservations, {
        info: (msg) => log(msg.replace(/^\[hk-auto\]\s*/, "")),
        warn: (msg) => log(msg.replace(/^\[hk-auto\]\s*/, "")),
      });
      // Kasowanie starych zbiorczych wierszy grupy TYLKO gdy zapis rozbitych
      // pokoi naprawde sie udal - inaczej nieudany insert + udane kasowanie
      // razem = grupa znika calkowicie z listy posilkow (incydent 2026-07-27).
      if (mealsStaleAggregateRows.length && upsertResult.ok) {
        await deleteStaleMealRows(mealsStaleAggregateRows, {
          info: (msg) => log(msg.replace(/^\[hk-auto\]\s*/, "")),
          warn: (msg) => log(msg.replace(/^\[hk-auto\]\s*/, "")),
        });
      } else if (mealsStaleAggregateRows.length && !upsertResult.ok) {
        log(`UWAGA: zapis rozbitych pokoi nie powiodl sie (${upsertResult.reason}) - POMIJAM kasowanie starych zbiorczych wierszy, zeby nie zgubic danych.`);
      }
    } catch (e) {
      log(`Meals sync BLAD: ${e.message}`);
    }
  } else if (mealsReservations.length && config.dryRun) {
    log(`Meals sync pominiety (dryRun): ${mealsReservations.length} pozycji gotowych do wyslania.`);
  }

  // Kasowanie z bazy juz wczesniej zapisanych wierszy anulowanych rezerwacji
  // (np. z poprzedniego cyklu, zanim ta paczka zdazyla wykryc anulowanie) —
  // niezalezne od bloku wyzej, zeby zadzialalo nawet gdy w tym wsadzie nie
  // bylo juz nic innego do wyslania.
  if (mealsCancelledIds.size && !config.dryRun) {
    try {
      await deleteCancelledMealRows(mealsCancelledIds, {
        info: (msg) => log(msg.replace(/^\[hk-auto\]\s*/, "")),
        warn: (msg) => log(msg.replace(/^\[hk-auto\]\s*/, "")),
      });
    } catch (e) {
      log(`Kasowanie anulowanych posilkow BLAD: ${e.message}`);
    }
  } else if (mealsCancelledIds.size && config.dryRun) {
    log(`Kasowanie anulowanych posilkow pominiete (dryRun): ${mealsCancelledIds.size} rezerwacji.`);
  }

  return written;
}

async function runOnce(config) {
  const explicitPdf = getArg("--pdf");
  let pdfFiles = [];
  if (explicitPdf) {
    pdfFiles = [path.resolve(process.cwd(), explicitPdf)];
  } else {
    let attachments;
    try {
      attachments = await fetchPdfAttachments(config, config.outputDir);
      recordMailFetchResult(config.outputDir, { ok: true, count: attachments.length });
    } catch (e) {
      const health = recordMailFetchResult(config.outputDir, { ok: false, error: e });
      log(`Pobieranie maila BLAD (z rzedu: ${health.consecutiveFailures}): ${e.message}`);
      if (health.consecutiveFailures >= 3) {
        log(`UWAGA: pobieranie maila nie dziala od ${health.consecutiveFailures} prob pod rzad — sprawdz skrzynke recznie (mail-health.json).`);
      }
      throw e;
    }
    pdfFiles = attachments.map((item) => item.filePath);
    log(`Pobrano zalacznikow PDF: ${pdfFiles.length}`);

    if (!config.dryRun) {
      try {
        const { deleted } = await deleteOldMail(config, { logger: { log } });
        if (deleted) log(`Usunieto starych maili: ${deleted}`);
      } catch (e) {
        log(`Czyszczenie starych maili BLAD: ${e.message}`);
      }
    }
  }

  if (!pdfFiles.length) {
    log("Brak nowych raportow PDF.");
    return [];
  }

  const existing = pdfFiles.filter((file) => fs.existsSync(file));
  if (!existing.length) throw new Error("Nie znaleziono zadnego pliku PDF do przetworzenia.");
  return processPdfFiles(existing, config);
}

async function main() {
  const config = loadConfig(getArg("--config"));
  const outputDir = getArg("--output-dir");
  if (outputDir) config.outputDir = path.resolve(process.cwd(), outputDir);
  const daysAhead = getArg("--days-ahead");
  if (daysAhead) config.daysAhead = Number(daysAhead);
  const startDate = getArg("--start-date");
  if (startDate) config.startDate = startDate;
  if (hasArg("--no-remember-processed")) config.mailbox.rememberProcessed = false;
  if (hasArg("--apply")) config.dryRun = false;
  if (hasArg("--dry-run")) config.dryRun = true;
  const once = hasArg("--once") || hasArg("--pdf");
  await runOnce(config);
  if (once) return;

  const intervalMs = Math.max(1, Number(config.pollIntervalMinutes || 15)) * 60000;
  log(`Serwis dziala. Sprawdzanie co ${Math.round(intervalMs / 60000)} min.`);
  setInterval(() => {
    runOnce(config).catch((error) => log(`BLAD: ${error.stack || error.message}`));
  }, intervalMs);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`[hk-auto] BLAD: ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}

module.exports = { processPdfFiles };
