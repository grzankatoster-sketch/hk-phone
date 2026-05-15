// Copyright © 2026 Conrad Comfort. All rights reserved. UNLICENSED.
// ─── electron/hkAutomation.cjs ───────────────────────────────────────────────
// Wbudowany serwis automatyzacji HK: pobiera PDF-y z IMAP, parsuje raporty
// KWHotel i zapisuje plany do C:\zmiany i raporty\hk-automation\ — czytane
// potem przez hk-automation-get-plan / hk-automation-get-source.
// ─────────────────────────────────────────────────────────────────────────────

const fs   = require("fs");
const path = require("path");
const { app } = require("electron");
const log  = require("electron-log");

// ─── Reuse istniejących bibliotek demona ─────────────────────────────────────
// Te pliki są pakowane do asaru przez build.files (scripts/hk-automation/lib/**)
const LIB_DIR = path.join(__dirname, "..", "scripts", "hk-automation", "lib");
const { todayKey }              = require(path.join(LIB_DIR, "dates.cjs"));
const { fetchPdfAttachments }   = require(path.join(LIB_DIR, "mail.cjs"));
const { extractPdfText }        = require(path.join(LIB_DIR, "pdf.cjs"));
const { parseAnyKwhotelReport } = require(path.join(LIB_DIR, "parser.cjs"));
const { mergeReports }          = require(path.join(LIB_DIR, "merge-reports.cjs"));
const { computeStatuses }       = require(path.join(LIB_DIR, "status-logic.cjs"));
const { writePlans }            = require(path.join(LIB_DIR, "plans.cjs"));
const { writeSourceSnapshots }  = require(path.join(LIB_DIR, "source-snapshots.cjs"));
const { upsertPlansToSupabase } = require(path.join(LIB_DIR, "supabase-sync.cjs"));
const {
  loadReportHistory,
  mergeReportHistory,
  saveReportHistory,
} = require(path.join(LIB_DIR, "report-history.cjs"));

// ─── Stan ─────────────────────────────────────────────────────────────────────
let timer = null;
let running = false;
let lastRun = null;
let lastError = null;
let lastWritten = [];
let nextRunAt = null;

const DEFAULT_OUTPUT_DIR = "C:\\zmiany i raporty\\hk-automation";

// ─── Konfiguracja ─────────────────────────────────────────────────────────────
function defaultConfig() {
  return {
    mailbox: {
      host:                 "panel34.kki.pl",
      port:                 993,
      secure:               true,
      user:                 "raporty@conradcomfort.pl",
      passwordEnv:          "HK_AUTOMATION_MAIL_PASSWORD",
      folder:               "INBOX",
      unseenOnly:           false,
      rememberProcessed:    true,
      markSeenAfterSuccess: false,
      senderAllowList:      [],
      subjectIncludes:      [],
    },
    pollIntervalMinutes: 15,
    daysAhead:           14,
    dryRun:              false,
    writeEmptyPlans:     false,
    useReportHistory:    true,
    reportHistoryLimit:  120,
    outputDir:           DEFAULT_OUTPUT_DIR,
    statusLogic: {
      stayoverMode:        "parity",
      pgzAfterStayNights:  3,
      generateStayovers:   true,
    },
  };
}

function deepMerge(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === "object" && !Array.isArray(value) && base[key] && typeof base[key] === "object") {
      out[key] = deepMerge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function userConfigPath() {
  return path.join(app.getPath("userData"), "hk-automation-config.json");
}

function loadUserOverrides() {
  try {
    const file = userConfigPath();
    if (!fs.existsSync(file)) return {};
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    log.warn("[hk-auto] Nie udalo sie wczytac userConfig:", e.message);
    return {};
  }
}

function loadConfig() {
  const config = deepMerge(defaultConfig(), loadUserOverrides());
  config.outputDir = path.resolve(config.outputDir || DEFAULT_OUTPUT_DIR);
  return config;
}

// ─── Pojedynczy przebieg (mail → parser → plany) ─────────────────────────────
async function runOnce(config) {
  const generatedAt = new Date().toISOString();

  let pdfFiles = [];
  try {
    const attachments = await fetchPdfAttachments(config, config.outputDir);
    pdfFiles = attachments.map((item) => item.filePath);
    log.info(`[hk-auto] Pobrano zalacznikow PDF: ${pdfFiles.length}`);
  } catch (e) {
    log.error("[hk-auto] Blad IMAP:", e.message);
    throw e;
  }

  if (!pdfFiles.length) {
    log.info("[hk-auto] Brak nowych raportow PDF.");
    return [];
  }

  const incomingReports = [];
  for (const pdfPath of pdfFiles) {
    if (!fs.existsSync(pdfPath)) continue;
    try {
      const text = await extractPdfText(pdfPath);
      const parsed = parseAnyKwhotelReport(text, { fallbackYear: new Date().getFullYear() });
      incomingReports.push({
        id:         path.resolve(pdfPath),
        name:       path.basename(pdfPath),
        importedAt: new Date().toISOString(),
        parsed,
      });
    } catch (e) {
      log.warn(`[hk-auto] Pomijam ${path.basename(pdfPath)}: ${e.message}`);
    }
  }

  if (!incomingReports.length) {
    log.info("[hk-auto] Brak poprawnie sparsowanych raportow.");
    return [];
  }

  const reports = config.useReportHistory === false
    ? incomingReports
    : mergeReportHistory(loadReportHistory(config.outputDir), incomingReports, config.reportHistoryLimit);
  if (config.useReportHistory !== false) saveReportHistory(config.outputDir, reports);
  const combined = mergeReports(reports);
  const historyReportCount = reports.length;

  const plansByDate = computeStatuses(combined, {
    startDate:   config.startDate || todayKey(),
    daysAhead:   config.daysAhead,
    statusLogic: config.statusLogic,
    generatedAt,
  });

  const writeOpts = {
    generatedAt,
    dryRun:           config.dryRun,
    writeEmptyPlans:  config.writeEmptyPlans === true,
    pdfFiles,
    parserWarnings:   combined.warnings,
    historyReportCount,
  };
  const written       = writePlans(config.outputDir, plansByDate, writeOpts);
  const sourceWritten = writeSourceSnapshots(config.outputDir, combined, plansByDate, writeOpts);

  log.info(`[hk-auto] Zapisano plany: ${written.length ? written.map(i => `${i.dateKey}:${i.rooms}`).join(", ") : "brak zmian"}`);
  log.info(`[hk-auto] Zapisano zrodla: ${sourceWritten.length ? sourceWritten.map(i => `${i.dateKey}:${i.rooms}`).join(", ") : "brak zmian"}`);
  if (combined.warnings?.length) log.warn(`[hk-auto] Ostrzezenia parsera: ${combined.warnings.length}`);

  // Bezposredni upload do Supabase, zeby wyjazdy.html mial swieze dane na 7+
  // dni w przod, niezaleznie od tego czy renderer (App.jsx) jest aktywny.
  if (!config.dryRun) {
    try {
      await upsertPlansToSupabase(plansByDate, { generatedAt }, log);
    } catch (e) {
      log.warn(`[hk-auto] Supabase sync nie powiodl sie: ${e.message}`);
    }
  }

  return written;
}

// ─── Publiczne API ────────────────────────────────────────────────────────────
async function runNow() {
  if (running) {
    log.info("[hk-auto] runNow: poprzedni cykl jeszcze trwa, pomijam.");
    return { ok: false, busy: true };
  }
  running = true;
  lastError = null;
  try {
    const config = loadConfig();
    if (!config.mailbox.host || !config.mailbox.user) {
      lastError = "Brak konfiguracji IMAP (host/user).";
      log.warn(`[hk-auto] ${lastError}`);
      return { ok: false, error: lastError };
    }
    const password = process.env[config.mailbox.passwordEnv || "HK_AUTOMATION_MAIL_PASSWORD"] || config.mailbox.password || "";
    if (!password) {
      lastError = "Brak hasla IMAP w zmiennej srodowiskowej HK_AUTOMATION_MAIL_PASSWORD.";
      log.warn(`[hk-auto] ${lastError}`);
      return { ok: false, error: lastError };
    }
    const written = await runOnce(config);
    lastRun = new Date().toISOString();
    lastWritten = written;
    return { ok: true, written: written.length, lastRun };
  } catch (e) {
    lastError = e.message || String(e);
    log.error("[hk-auto] runNow BLAD:", e.stack || e.message);
    return { ok: false, error: lastError };
  } finally {
    running = false;
    scheduleNext();
  }
}

function scheduleNext() {
  if (timer) { clearTimeout(timer); timer = null; }
  const config = loadConfig();
  const minutes = Math.max(1, Number(config.pollIntervalMinutes || 15));
  const ms = minutes * 60_000;
  nextRunAt = new Date(Date.now() + ms).toISOString();
  timer = setTimeout(() => { runNow().catch(() => {}); }, ms);
}

function start() {
  log.info("[hk-auto] Start serwisu wbudowanego.");
  // Pierwsze uruchomienie z lekkim opoznieniem, zeby nie blokowac startu UI.
  setTimeout(() => { runNow().catch(() => {}); }, 8000);
}

function stop() {
  if (timer) { clearTimeout(timer); timer = null; }
  log.info("[hk-auto] Stop serwisu.");
}

function getStatus() {
  return {
    running,
    lastRun,
    lastError,
    nextRunAt,
    writtenLastCount: lastWritten.length,
    configPath: userConfigPath(),
    hasPassword: Boolean(process.env.HK_AUTOMATION_MAIL_PASSWORD),
  };
}

module.exports = { start, stop, runNow, getStatus, loadConfig };
