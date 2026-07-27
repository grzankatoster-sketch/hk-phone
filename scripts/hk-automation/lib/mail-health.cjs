// Trwały ślad stanu pobierania maila — bez tego błąd fetchPdfAttachments()
// znika w logu konsoli (który nikt nie czyta na żywo) i Harmonogram Zadań
// dalej pokazuje "sukces", bo proces jako całość nie pada. Ten plik pozwala
// sprawdzić jednym spojrzeniem, czy ostatnia próba się udała i jak dawno.
const fs = require("fs");
const path = require("path");

function healthPath(outputDir) {
  return path.join(outputDir, "mail-health.json");
}

function recordMailFetchResult(outputDir, { ok, error, count } = {}) {
  const file = healthPath(outputDir);
  let state = { consecutiveFailures: 0 };
  try {
    state = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {}

  const now = new Date().toISOString();
  if (ok) {
    state.lastSuccessAt = now;
    state.lastSuccessCount = count ?? null;
    state.consecutiveFailures = 0;
    state.lastError = null;
  } else {
    state.lastFailureAt = now;
    state.lastError = String(error?.message || error || "nieznany blad");
    state.consecutiveFailures = (state.consecutiveFailures || 0) + 1;
  }
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(state, null, 2), "utf8");
  } catch {}
  return state;
}

module.exports = { recordMailFetchResult, healthPath };
