const fs = require("fs");
const path = require("path");

function historyPath(outputDir) {
  return path.join(outputDir, "history", "kwhotel-report-history.json");
}

function loadReportHistory(outputDir) {
  try {
    const file = historyPath(outputDir);
    if (!fs.existsSync(file)) return [];
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(raw?.reports) ? raw.reports.filter((report) => report?.parsed) : [];
  } catch {
    return [];
  }
}

function saveReportHistory(outputDir, reports) {
  const file = historyPath(outputDir);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify({ updatedAt: new Date().toISOString(), reports }, null, 2), "utf8");
}

function mergeReportHistory(existingReports, incomingReports, limit = 120) {
  const byId = new Map();
  for (const report of existingReports || []) {
    if (!report?.id) continue;
    byId.set(report.id, report);
  }
  for (const report of incomingReports || []) {
    if (!report?.id) continue;
    byId.set(report.id, report);
  }
  return [...byId.values()]
    .sort((a, b) => String(a.importedAt || "").localeCompare(String(b.importedAt || "")))
    .slice(-Math.max(1, Number(limit) || 120));
}

module.exports = { historyPath, loadReportHistory, saveReportHistory, mergeReportHistory };
