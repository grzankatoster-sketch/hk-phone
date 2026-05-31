// Regułowy (deterministyczny) agent rekomendacji zamian pokoi w HK.
// Czysta funkcja — bez side-effectów, w pełni testowalna symulacją.
// Recepcja zatwierdza lub odrzuca sugestie; pracownicy nie zamieniają się sami.

// Statystyki obciążenia per pracownik na podstawie przypisań i statusów pokoi.
// roomStates: { [roomNo]: { status: 'W'|'czyszczenie'|'czyste'|'pominięte', ... } }
export function workerStats(assignments, roomStates) {
  const stats = {};
  for (const [w, rooms] of Object.entries(assignments || {})) {
    const list = Array.isArray(rooms) ? rooms : [];
    let done = 0, cleaning = 0, waiting = 0;
    const waitingRooms = [];
    for (const no of list) {
      const st = roomStates?.[no]?.status;
      if (st === "czyste" || st === "pominięte") done++;
      else if (st === "czyszczenie") cleaning++;
      else { waiting++; waitingRooms.push(no); } // 'W' lub brak wpisu = czeka, nietknięty
    }
    stats[w] = { worker: w, total: list.length, done, cleaning, waiting, waitingRooms };
  }
  return stats;
}

// Zwraca listę sugestii przeniesień: [{ from, to, rooms:[...], reason }].
// Reguła: gdy ktoś SKOŃCZYŁ (0 czeka, 0 w trakcie), a inny ma zaległość ≥ minGap,
// przenieś ~połowę nietkniętych pokoi od najbardziej obciążonego do wolnego.
export function suggestReassignments({ assignments, roomStates } = {}, opts = {}) {
  const minGap = opts.minGap ?? 3;             // min. liczba czekających, by sugerować
  const maxSuggestions = opts.maxSuggestions ?? 3;
  const stats = workerStats(assignments, roomStates);
  const pool = Object.values(stats).map(w => ({ ...w }));
  if (pool.length < 2) return [];

  const suggestions = [];
  for (let i = 0; i < maxSuggestions; i++) {
    // wolny = skończył wszystko, ma jakieś przypisania; preferuj najmniej obciążonego
    const free = pool
      .filter(w => w.waiting === 0 && w.cleaning === 0 && w.total > 0)
      .sort((a, b) => a.total - b.total)[0];
    // przeciążony = najwięcej czekających
    const busy = pool.slice().sort((a, b) => b.waiting - a.waiting)[0];
    if (!free || !busy || free.worker === busy.worker) break;
    if (busy.waiting < minGap) break;

    const move = Math.max(1, Math.floor(busy.waiting / 2));
    const rooms = busy.waitingRooms.slice(0, move);
    if (!rooms.length) break;

    suggestions.push({
      from: busy.worker,
      to: free.worker,
      rooms,
      reason: `${free.worker} skończył(a), a ${busy.worker} ma jeszcze ${busy.waiting} pokoi — przenieś ${rooms.length}.`,
    });

    // zaktualizuj pulę, by kolejne sugestie były spójne (nie dublowały pokoi)
    busy.waiting -= rooms.length;
    busy.waitingRooms = busy.waitingRooms.slice(rooms.length);
    free.waiting += rooms.length;
    free.total += rooms.length;
  }
  return suggestions;
}
