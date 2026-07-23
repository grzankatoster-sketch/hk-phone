#!/usr/bin/env node
const fs = require("fs");
const path = require("path");
const { loadConfig } = require("./lib/config.cjs");
const { todayKey } = require("./lib/dates.cjs");
const { fetchPdfAttachments } = require("./lib/mail.cjs");
const { extractPdfText, extractPdfPositions } = require("./lib/pdf.cjs");
const { parseAnyKwhotelReport, parseWeeklyGrid, isWeeklyReport } = require("./lib/parser.cjs");
const { mergeReports } = require("./lib/merge-reports.cjs");
const { computeStatuses } = require("./lib/status-logic.cjs");
const { writePlans } = require("./lib/plans.cjs");
const { writeSourceSnapshots } = require("./lib/source-snapshots.cjs");
const { loadReportHistory, mergeReportHistory, saveReportHistory } = require("./lib/report-history.cjs");
const { upsertPlansToSupabase } = require("./lib/supabase-sync.cjs");
const { isPosilkiReport, parsePosilkiGrid } = require("./lib/parser-posilki.cjs");
const { upsertMealsToSupabase } = require("./lib/meals-sync.cjs");

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
  const mealsWarnings = [];

  for (const pdfPath of pdfFiles) {
    log(`Czytam PDF: ${pdfPath}`);
    const text = await extractPdfText(pdfPath);

    // "Raport Posiłków" (ReportThreeDayMeals) — zupełnie inne dane (posiłki, nie
    // status pokoi), zbierane osobno i wysyłane do meal_plans, NIE do hk_plan.
    if (isPosilkiReport(text, path.basename(pdfPath))) {
      const positions = await extractPdfPositions(pdfPath);
      const mealsParsed = parsePosilkiGrid(positions, { tenantId: config.tenantId });
      log(`  -> raport POSIŁKÓW: ${mealsParsed.reservations.length} rezerwacji, dni: ${mealsParsed.dates.filter(Boolean).join(", ")}`);
      if (mealsParsed.warnings.length) log(`  -> ostrzezenia posilkow: ${mealsParsed.warnings.length}`);
      mealsReservations.push(...mealsParsed.reservations);
      mealsWarnings.push(...mealsParsed.warnings);
      continue;
    }

    let parsed;
    if (isWeeklyReport(text, path.basename(pdfPath))) {
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
      name: path.basename(pdfPath),
      importedAt,
      parsed,
    });
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
      await upsertMealsToSupabase(mealsReservations, {
        info: (msg) => log(msg.replace(/^\[hk-auto\]\s*/, "")),
        warn: (msg) => log(msg.replace(/^\[hk-auto\]\s*/, "")),
      });
    } catch (e) {
      log(`Meals sync BLAD: ${e.message}`);
    }
  } else if (mealsReservations.length && config.dryRun) {
    log(`Meals sync pominiety (dryRun): ${mealsReservations.length} pozycji gotowych do wyslania.`);
  }

  return written;
}

async function runOnce(config) {
  const explicitPdf = getArg("--pdf");
  let pdfFiles = [];
  if (explicitPdf) {
    pdfFiles = [path.resolve(process.cwd(), explicitPdf)];
  } else {
    const attachments = await fetchPdfAttachments(config, config.outputDir);
    pdfFiles = attachments.map((item) => item.filePath);
    log(`Pobrano zalacznikow PDF: ${pdfFiles.length}`);
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

main().catch((error) => {
  console.error(`[hk-auto] BLAD: ${error.stack || error.message}`);
  process.exitCode = 1;
});
