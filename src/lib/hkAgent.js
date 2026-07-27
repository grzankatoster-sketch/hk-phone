// Regułowy (deterministyczny) agent rekomendacji zamian pokoi w HK.
// Czysta funkcja — bez side-effectów, w pełni testowalna symulacją.
// Recepcja zatwierdza lub odrzuca sugestie; pracownicy nie zamieniają się sami.

import { hkW } from "./hk";

// Akcje w hk_logs wykonywane PRZEZ sprzątające (z telefonu HK). Tylko one
// kwalifikują autora logu jako pracownika HK obecnego dziś. Akcje recepcji
// (reassign, priority, priority_off, info_request, vacate) NIE wchodzą — inaczej
// imię zalogowanej recepcji (employeeName) przeciekałoby do puli HK i agent
// proponowałby przypisanie jej pokoi.
export const HK_WORKER_ACTIONS = new Set([
  "start", "done", "skip", "task_done",
  "exchange_request", "exchange_accept", "exchange_reject",
  "room_request", "info_reply",
]);

// Bierze z listy pokoi (w kolejności) tyle, aż skumulowana waga (hkW) osiągnie
// targetWeight — zamiast liczby pokoi. Dzięki temu "przenieś połowę różnicy"
// działa poprawnie także wtedy, gdy wśród przenoszonych są apartamenty
// (1 apartament = HK_APT_WEIGHT zwykłych pokoi pod względem nakładu pracy).
function takeByWeight(rooms, targetWeight) {
  const picked = [];
  let acc = 0;
  for (const no of rooms) {
    if (acc >= targetWeight) break;
    picked.push(no);
    acc += hkW(no);
  }
  return picked;
}

// Statystyki obciążenia per pracownik na podstawie przypisań i statusów pokoi.
// roomStates: { [roomNo]: { status: 'W'|'czyszczenie'|'czyste'|'pominięte', ... } }
// presentWorkers: lista osób obecnych dziś — dzięki niej do puli trafiają też osoby
// z 0 pokoi (idle), które inaczej byłyby niewidoczne (brak ich w `assignments`).
export function workerStats(assignments, roomStates, presentWorkers = []) {
  const stats = {};
  const names = new Set([...Object.keys(assignments || {}), ...(presentWorkers || [])]);
  for (const w of names) {
    const rooms = (assignments || {})[w];
    const list = Array.isArray(rooms) ? rooms : [];
    let done = 0, cleaning = 0, waiting = 0, waitingWeight = 0, cleaningWeight = 0;
    const waitingRooms = [];
    for (const no of list) {
      const st = roomStates?.[no]?.status;
      if (st === "czyste" || st === "pominięte") done++;
      else if (st === "czyszczenie") { cleaning++; cleaningWeight += hkW(no); }
      else { waiting++; waitingRooms.push(no); waitingWeight += hkW(no); } // 'W' lub brak wpisu = czeka, nietknięty
    }
    // waitingWeight/cleaningWeight = to samo co waiting/cleaning, ale ważone przez hkW
    // (apartament = HK_APT_WEIGHT, zwykły pokój = 1) — używane w load() niżej, żeby
    // rebalansowanie liczyło realną robotę tak samo jak autoAssign w HKPanel.jsx,
    // a nie samą liczbę pokoi (apartament ≠ zwykły pokój pod względem nakładu pracy).
    stats[w] = { worker: w, total: list.length, done, cleaning, waiting, waitingRooms, waitingWeight, cleaningWeight };
  }
  return stats;
}

// Zwraca listę sugestii przeniesień: [{ from, to, rooms:[...], reason }].
// Reguła (balansowanie wg RÓŻNICY wolnych pokoi): przenieś wolne pokoje od osoby
// z największą liczbą czekających do osoby najmniej obciążonej (też z 0 pokoi),
// ale TYLKO gdy różnica jest znacząca (>= minGap). Małe nierówności (np. 3 vs 8)
// zostawiamy w spokoju. presentWorkers włącza do puli osoby idle bez pokoi.
export function suggestReassignments({ assignments, roomStates, presentWorkers = [], excludeTo = [], excludeFrom = [] } = {}, opts = {}) {
  const minGap = opts.minGap ?? 6;             // min. różnica wolnych, by sugerować
  const minBusy = opts.minBusy ?? 6;           // przeciążona musi mieć min. tyle czekających
  const maxSuggestions = opts.maxSuggestions ?? 3;
  // excludeTo = osoby, które NIE mają dostawać pokoi rano (np. zmiana popołudniowa:
  // obsługuje tylko pobyty PG/PGZ + BR/ZS, nie wyjazdy). Bez tego idle popołudniówka
  // wyglądała na „wolną" i agent proponował zrzucanie jej wyjazdów przeciążonej osoby.
  // excludeFrom = te same osoby jako DAWCY — bez tego popołudniówka z zaległymi
  // pobytami (PG/PGZ) wyglądała na „przeciążoną" i agent zrzucał jej pokoje na
  // ranną zmianę, mimo że to inny rodzaj pracy (bug: rano dostawało zamiany
  // dotyczące pokoi realnie sprzątanych po południu, i odwrotnie).
  const noTo = new Set(excludeTo || []);
  const noFrom = new Set(excludeFrom || []);

  // Bramka: sugeruj DOPIERO, gdy zmiana wystartowała (ktoś już sprząta/skończył).
  // W fazie planowania (recepcja układa obsadę, wszystko jeszcze „W") agent milczy,
  // żeby NIE przeszkadzać w ręcznym przypisywaniu pokoi. opts.requireStarted=false wyłącza.
  const started = opts.requireStarted === false
    || Object.values(roomStates || {}).some(r => r && (r.status === "czyszczenie" || r.status === "czyste" || r.status === "pominięte"));
  if (!started) return [];

  const stats = workerStats(assignments, roomStates, presentWorkers);
  const pool = Object.values(stats).map(w => ({ ...w }));
  if (pool.length < 2) return [];

  const load = (w) => w.waitingWeight + w.cleaningWeight;  // realna pozostała robota, ważona (apartament ≠ zwykły pokój)

  const suggestions = [];
  for (let i = 0; i < maxSuggestions; i++) {
    // przeciążona = najwięcej czekających, i NIE z puli wykluczonych dawców
    // (np. zmiana popołudniowa — jej zaległość to inny rodzaj pracy).
    const busy = pool
      .filter(w => !noFrom.has(w.worker))
      .sort((a, b) => b.waiting - a.waiting)[0];
    // najmniej obciążona (wg pozostałej roboty), różna od przeciążonej
    // i NIE z puli wykluczonych odbiorców (np. zmiana popołudniowa).
    const idle = pool
      .filter(w => w.worker !== busy?.worker && !noTo.has(w.worker))
      .sort((a, b) => load(a) - load(b))[0];
    if (!busy || !idle) break;
    if (busy.waiting < minBusy) break;

    // diff w jednostkach WAGI (nie liczby pokoi) — spójnie z load() powyżej,
    // inaczej mieszalibyśmy policzone i ważone wartości w jednym równaniu.
    const diff = load(busy) - load(idle);
    if (diff < minGap) break;                  // za mała różnica → nic nie zmieniaj

    const moveWeight = diff / 2;
    const rooms = takeByWeight(busy.waitingRooms, moveWeight);
    if (!rooms.length) break;

    suggestions.push({
      from: busy.worker,
      to: idle.worker,
      rooms,
      reason: `${idle.worker} ma ${idle.waiting} wolnych, a ${busy.worker} ma ${busy.waiting} — przenieś ${rooms.length}, żeby wyrównać.`,
    });

    // zaktualizuj pulę, by kolejne sugestie były spójne (nie dublowały pokoi)
    const movedWeight = rooms.reduce((s, no) => s + hkW(no), 0);
    busy.waiting -= rooms.length;
    busy.waitingWeight -= movedWeight;
    busy.waitingRooms = busy.waitingRooms.slice(rooms.length);
    idle.waiting += rooms.length;
    idle.waitingWeight += movedWeight;
    idle.total += rooms.length;
  }
  return suggestions;
}

// Sugestia dla KONKRETNEJ prośby o pokój (pracownik X prosi o pracę).
// Wybiera dawcę = osobę z największą liczbą czekających (≠ proszący) i typuje
// ~połowę różnicy, by oboje wyrównali obciążenie. Zwraca obiekt zgodny z
// applySuggestion ({ from, to, rooms, reason }) lub null, gdy nie ma czego oddać.
export function suggestForRequest({ requester, assignments, roomStates } = {}, opts = {}) {
  if (!requester) return null;
  const minDonor = opts.minDonor ?? 2;   // dawca musi mieć min. tyle czekających
  const stats = workerStats(assignments, roomStates);
  const me = stats[requester] || { worker: requester, waiting: 0 };
  const donor = Object.values(stats)
    .filter(w => w.worker !== requester && w.waiting >= minDonor)
    .sort((a, b) => b.waiting - a.waiting)[0];
  if (!donor) return null;
  if (donor.waiting <= me.waiting + 1) return null; // już zrównoważone
  const move = Math.max(1, Math.ceil((donor.waiting - me.waiting) / 2));
  const rooms = donor.waitingRooms.slice(0, move);
  if (!rooms.length) return null;
  return {
    from: donor.worker,
    to: requester,
    rooms,
    reason: `${requester} prosi o pokój — wybrałem ${rooms.join(", ")} od ${donor.worker}.`,
  };
}
