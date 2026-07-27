// Rozbija zbiorczy wiersz grupy z Raportu Posiłków (is_group=true, jeden wiersz
// bez numeru pokoju) na osobne pozycje per pokój, gdy znamy pełną listę pokoi
// tej grupy z "Listy przyjazdów/wyjazdów" (ekstrakcja LLM, parser-guests-llm.cjs).
// Dopasowanie po numerze rezerwacji (bez końcowego "G").
//
// Liczba osób per pokój nie jest znana z żadnego z dwóch raportów (oba dają
// tylko sumę grupy) — rozkładamy równo (+1 dla pierwszych pokoi z reszty z
// dzielenia), żeby SUMA zawsze zgadzała się z realnym manifestem ze śniadań.
// Personel i tak koryguje pojedyncze kafle stepperem, jeśli konkretny pokój ma
// więcej osób niż domyślnie przydzielono.

function splitEvenly(total, count) {
  if (!count || count <= 0) return [];
  const safeTotal = Math.max(0, Number(total) || 0);
  const base = Math.floor(safeTotal / count);
  const remainder = safeTotal - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < remainder ? 1 : 0));
}

function groupNoFromReservationId(reservationId) {
  return String(reservationId || "").replace(/G$/i, "");
}

// mealsReservations: wynik parsePosilkiGrid (reservations[]).
// guestGroups: grupy z "Lista przyjazdów/wyjazdów" (bieżący cykl + ew. dociągnięte z historii),
// każda z pełną listą rooms[].
// Zwraca { reservations, staleAggregateRows } — staleAggregateRows to klucze starych
// zbiorczych wierszy do skasowania z Supabase (zastąpione rozbiciem na pokoje).
function expandGroupMealReservations(mealsReservations, guestGroups) {
  const groupsByNo = new Map();
  for (const g of guestGroups || []) {
    if (g?.group_no && Array.isArray(g.rooms) && g.rooms.length) {
      groupsByNo.set(String(g.group_no), g);
    }
  }

  const reservations = [];
  const staleAggregateRows = [];
  const expandedGroups = [];

  for (const meal of mealsReservations || []) {
    if (!meal.is_group) {
      reservations.push(meal);
      continue;
    }
    const guestGroup = groupsByNo.get(groupNoFromReservationId(meal.reservation_id));
    if (!guestGroup) {
      reservations.push(meal);
      continue;
    }
    const rooms = guestGroup.rooms;
    const counts = splitEvenly(meal.persons, rooms.length);
    rooms.forEach((room, i) => {
      reservations.push({
        ...meal,
        room,
        guest_name: guestGroup.group_name || meal.guest_name,
        persons: counts[i],
        is_group: false,
      });
    });
    staleAggregateRows.push({ tenant_id: meal.tenant_id, reservation_id: meal.reservation_id, room: meal.room });
    expandedGroups.push({ reservation_id: meal.reservation_id, group_name: guestGroup.group_name, rooms: rooms.length, persons: meal.persons });
  }

  return { reservations, staleAggregateRows, expandedGroups };
}

module.exports = { splitEvenly, groupNoFromReservationId, expandGroupMealReservations };
