// Lokalny zrzut danych gości/grup wyciągniętych przez LLM z Listy przyjazdów/
// wyjazdów — NIE wchodzi (jeszcze) do hk_plan/Supabase, bo to wymaga nowej
// tabeli (schemat do ustalenia). Na razie tylko do wglądu/debugowania, żeby
// dało się sprawdzić co model wyciągnął, zanim to popłynie dalej.
const fs = require("fs");
const path = require("path");
const { cleanRoomToken } = require("./parser-guests-llm.cjs");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function guestSnapshotPath(outputDir, generatedAt) {
  const stamp = String(generatedAt || new Date().toISOString()).replace(/[:.]/g, "-");
  return path.join(outputDir, "guests", `guests-${stamp}.json`);
}

function writeGuestSnapshot(outputDir, { individual, groups, warnings, generatedAt }) {
  if ((!individual || !individual.length) && (!groups || !groups.length)) return null;
  const file = guestSnapshotPath(outputDir, generatedAt);
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify({ version: 1, generatedAt, individual, groups, warnings }, null, 2), "utf8");
  return file;
}

// Lista przyjazdów/wyjazdów (z listą pokoi grupy) nie zawsze wpada w tę samą
// paczkę maili co Raport Posiłków — bez tego dociągnięcia rozbicie grupy na
// pokoje (meals-group-expand.cjs) działałoby tylko w cyklu, w którym oba
// raporty przyszły razem, i cofałoby się do jednego zbiorczego wiersza w
// każdym kolejnym cyklu bez listy przyjazdów. Czytamy więc kilka ostatnich
// zrzutów (nazwy plików sortują się chronologicznie — znacznik czasu w ISO),
// scalamy grupy po numerze (nowszy plik nadpisuje starszy) i odrzucamy te,
// których pobyt już się skończył, żeby lista nie rosła bez końca.
const RECENT_SNAPSHOT_LIMIT = 20;

// "Nowszy wygrywa" jest złą zasadą, gdy nowszy odczyt zgubił pokoje: ekstrakcja
// LLM bywa gorsza w jednym cyklu (ucięta lista, opisowe słowo zamiast numeru —
// incydent 2026-07-28, grupa 5083G) i kasowała wtedy poprawną listę z wcześniej-
// szego raportu. Numery pokoi mamy z KILKU raportów w czasie, więc przy scalaniu
// wygrywa ten wpis, który faktycznie ma pokoje; przy remisie decyduje nowszy.
function preferGroupWithRooms(existing, incoming) {
  if (!existing) return incoming;
  // Lista pozycyjna (z PDF) zawsze bije liste od LLM — niezaleznie od dlugosci.
  // Bez tego zahalucynowana lista wygrywalaby sama liczba pozycji: 28.07.2026
  // grupa 3550 miala od LLM 27 pokoi, z czego 5 zmyslonych, a prawdziwa lista
  // tez ma 27 — porownanie po dlugosci nie rozstrzyga, po zrodle owszem.
  const authoritative = (g) => g?.rooms_source === "positional" && (g.rooms?.length || 0) > 0;
  if (authoritative(incoming) && !authoritative(existing)) return incoming;
  if (authoritative(existing) && !authoritative(incoming)) return existing;
  const had = existing.rooms?.length || 0;
  const has = incoming.rooms?.length || 0;
  return has >= had ? incoming : existing;
}

function loadPersistedGroups(outputDir, { todayIso } = {}) {
  const dir = path.join(outputDir, "guests");
  let files;
  try {
    files = fs.readdirSync(dir).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
  const recent = files.slice(-RECENT_SNAPSHOT_LIMIT);
  const byNo = new Map();
  for (const name of recent) {
    try {
      const raw = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      for (const g of raw?.groups || []) {
        if (!g?.group_no) continue;
        // Walidacja TAKZE przy odczycie: zrzuty zapisane przed poprawka moga
        // zawierac smieci z LLM (np. "APARTAMENT" jako pokoj) i bez tego
        // wracalyby do bazy przy kazdym kolejnym cyklu.
        const clean = { ...g, rooms: (g.rooms || []).map(cleanRoomToken).filter(Boolean) };
        byNo.set(String(clean.group_no), preferGroupWithRooms(byNo.get(String(clean.group_no)), clean));
      }
    } catch {
      /* plik uszkodzony/niekompletny — pomiń, kolejne wciąż się liczą */
    }
  }
  const cutoff = todayIso || new Date().toISOString().slice(0, 10);
  return [...byNo.values()].filter((g) => !g.departure || g.departure >= cutoff);
}

module.exports = { writeGuestSnapshot, guestSnapshotPath, loadPersistedGroups, preferGroupWithRooms };
