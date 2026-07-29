// Wysyła rozpoznane rezerwacje z "Raportu Posiłków" (PDF, mail) do tabeli
// meal_plans w Supabase. Wzorem upsertPlansToSupabase w supabase-sync.cjs —
// ten sam mechanizm (REST + on_conflict merge-duplicates), inna tabela.

async function upsertMealsToSupabase(reservations, log) {
  const url = process.env.VITE_SUPABASE_URL || "";
  const key = process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!url || !key) {
    log?.info?.("[hk-auto] Meals sync pominiety: brak VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY w env.");
    return { ok: false, reason: "no-config", uploaded: 0 };
  }
  if (!Array.isArray(reservations) || !reservations.length) {
    log?.info?.("[hk-auto] Meals sync: brak rezerwacji do uploadu.");
    return { ok: true, uploaded: 0 };
  }
  // Ten sam pokoj tej samej rezerwacji moze trafic tu DWA razy w jednym
  // wsadzie - np. ta sama grupa wystepuje w dwoch zachodzacych na siebie
  // oknami dat "Raportach Posilkow" i rozbija sie za kazdym razem osobno.
  // Postgres ON CONFLICT DO UPDATE nie pozwala dwa razy trafic w ten sam
  // wiersz w JEDNYM poleceniu (HTTP 500, "cannot affect row a second time")
  // i pada CALY wsad - deduplikacja po kluczu konfliktu ratuje resztę.
  //
  // BUG znaleziony 2026-07-28: gdy w jednym wsadzie przyjdzie kilka raportow
  // z PRZESUNIETYM oknem 3 dni (user ustawil kilka wysylek dziennie), węższe
  // okno moze nie widziec nocy z kolacja i policzyc HB jako BB. "Ostatni
  // wygrywa" wtedy NADPISUJE poprawne HB blednym BB (potwierdzone na
  // realnym imporcie: pokoje 103/116 straciy HB, bo plik z oknem 29-31
  // przetworzony po pliku z oknem 28-30 zgasil kolacje z nocy 28->29).
  // Fix: merge zamiast "ostatni wygrywa" - kategoria HB jest "lepka" (OR),
  // daty biora najszerszy zakres ze wszystkich duplikatow. Kierunek
  // bezpieczny domyslnie: falszywe HB to drobna niedogodnosc (dodatkowe
  // przypomnienie o kolacji), falszywe BB to brak kolacji dla platacego HB gościa.
  const seen = new Map();
  for (const r of reservations) {
    const key = `${r.tenant_id}|${r.reservation_id}|${r.room}`;
    const existing = seen.get(key);
    if (!existing) { seen.set(key, r); continue; }
    seen.set(key, {
      ...r,
      category: existing.category === "HB" || r.category === "HB" ? "HB" : r.category,
      arrival: existing.arrival && (!r.arrival || existing.arrival < r.arrival) ? existing.arrival : r.arrival,
      departure: existing.departure && (!r.departure || existing.departure > r.departure) ? existing.departure : r.departure,
    });
  }
  const deduped = [...seen.values()];
  if (deduped.length !== reservations.length) {
    log?.info?.(`[hk-auto] Meals sync: zdeduplikowano ${reservations.length - deduped.length} powielonych wierszy (ten sam pokoj/rezerwacja).`);
  }
  try {
    const res = await fetch(`${url}/rest/v1/meal_plans?on_conflict=tenant_id,reservation_id,room`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(deduped),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      log?.warn?.(`[hk-auto] Meals sync HTTP ${res.status}: ${text.slice(0, 200)}`);
      return { ok: false, reason: `http-${res.status}`, uploaded: 0 };
    }
    log?.info?.(`[hk-auto] Meals sync: zapisano ${deduped.length} pozycji (${deduped.map((r) => r.room).join(", ")}).`);
    return { ok: true, uploaded: deduped.length };
  } catch (e) {
    log?.warn?.(`[hk-auto] Meals sync BLAD: ${e.message}`);
    return { ok: false, reason: "exception", uploaded: 0, error: e.message };
  }
}

// Kasuje stare zbiorcze wiersze grupy (room="4963G" itp.) po tym, jak rozbicie
// na pokoje (meals-group-expand.cjs) zastąpiło je pozycjami per pokój — inaczej
// upsert (merge-duplicates) tylko DOPISAŁBY nowe wiersze obok starego blob-a,
// podwajając policzone śniadania w podsumowaniu.
async function deleteStaleMealRows(rows, log) {
  const url = process.env.VITE_SUPABASE_URL || "";
  const key = process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!url || !key) return { ok: false, reason: "no-config", deleted: 0 };
  if (!Array.isArray(rows) || !rows.length) return { ok: true, deleted: 0 };

  let deleted = 0;
  for (const row of rows) {
    if (!row?.reservation_id || !row?.room) continue;
    try {
      const q = `${url}/rest/v1/meal_plans?tenant_id=eq.${encodeURIComponent(row.tenant_id || "00000000-0000-0000-0000-000000000001")}&reservation_id=eq.${encodeURIComponent(row.reservation_id)}&room=eq.${encodeURIComponent(row.room)}`;
      const res = await fetch(q, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (res.ok) deleted += 1;
      else log?.warn?.(`[hk-auto] Kasowanie starego wiersza grupy HTTP ${res.status}: ${row.reservation_id}/${row.room}`);
    } catch (e) {
      log?.warn?.(`[hk-auto] Kasowanie starego wiersza grupy BLAD: ${e.message}`);
    }
  }
  if (deleted) log?.info?.(`[hk-auto] Skasowano ${deleted} starych zbiorczych wierszy grup (rozbite na pokoje).`);
  return { ok: true, deleted };
}

// Wykrywa rezerwacje, ktore w JEDNEJ paczce maili byly widoczne w ktoryms z
// wczesniejszych "pelnych" Raportow Posilkow, a znikly z ostatniego i juz nie
// wrocily. Sygnal anulowania w trakcie generowania paczki — incydent
// 2026-07-29: grupa 5083G "bak konrad" (8 os., pokoje 105+106) byla obecna w
// 5 z 6 pelnych raportow tej samej dostawy (05:08), zniknela od pewnego
// momentu i juz sie nie pojawila; KWHotel potwierdzil anulowanie. Automatyzacja
// tylko DOPISUJE/scala wiersze (nigdy nie kasuje po prostu nieobecnosci), wiec
// taki wiersz zostawal w bazie na zawsze bez tej detekcji.
// "Pelny" raport = min. 60% pozycji najwiekszego pliku w paczce — odsiewa
// waskie/czastkowe eksporty (np. 12 pozycji przy max 39), ktore nie sa
// wiarygodnym dowodem nieobecnosci.
//
// WAZNE: samo "zniknal z ostatniego pliku" to za slaby sygnal — kazdy
// normalny wyjazd tez znika, bo okno dat raportu (3 dni) przesuwa sie do
// przodu miedzy kolejnymi eksportami tego samego dnia (np. plik 1 pokazuje
// 28-30, plik 6 pokazuje 29-31; gosc wyjezdzajacy 28.07 poprawnie wypada z
// okna, to nie anulowanie). Dlatego liczy sie TYLKO rezerwacja, ktorej pobyt
// nadal pokrywa sie z ktorymkolwiek dniem z okna OSTATNIEGO pelnego pliku —
// czyli powinna byla sie w nim pojawic, a jej nie ma.
function detectCancelledMealReservations(posilkiFiles, log) {
  if (!Array.isArray(posilkiFiles) || posilkiFiles.length < 2) return new Set();
  const maxCount = Math.max(...posilkiFiles.map((pf) => pf.reservations.length));
  const fullFiles = posilkiFiles.filter((pf) => pf.reservations.length >= maxCount * 0.6);
  if (fullFiles.length < 2) return new Set();
  const last = fullFiles[fullFiles.length - 1];
  const lastIds = new Set(last.reservations.map((r) => r.reservation_id));
  const lastDates = Array.isArray(last.dates) ? last.dates.filter(Boolean) : [];
  const coveredByLast = (r) => lastDates.some((d) => r.arrival && r.departure && r.arrival < d && d <= r.departure);
  const cancelled = new Set();
  for (let i = 0; i < fullFiles.length - 1; i++) {
    for (const r of fullFiles[i].reservations) {
      if (!r.reservation_id || lastIds.has(r.reservation_id)) continue;
      if (!coveredByLast(r)) continue;
      cancelled.add(r.reservation_id);
    }
  }
  if (cancelled.size) {
    log?.warn?.(`[hk-auto] Posilki: ${cancelled.size} rezerwacji zniknelo z ostatniego pelnego raportu w tej paczce mimo ze ich pobyt pokrywa sie z jego oknem dat (prawdopodobnie anulowane): ${[...cancelled].join(", ")}`);
  }
  return cancelled;
}

// Kasuje wiersze meal_plans dla anulowanych rezerwacji — TYLKO pobyty jeszcze
// trwajace/przyszle (departure >= dzis), zeby nie przepisywac historii juz
// wydanych posilkow. Kasuje po reservation_id (bez room), bo grupa rozbita na
// pokoje ma po kilka wierszy z tym samym reservation_id — jedno DELETE usuwa
// wszystkie naraz, tak jak reczna korekta incydentu 2026-07-29.
async function deleteCancelledMealRows(reservationIds, log) {
  const url = process.env.VITE_SUPABASE_URL || "";
  const key = process.env.VITE_SUPABASE_ANON_KEY || "";
  if (!url || !key) return { ok: false, reason: "no-config", deleted: 0 };
  if (!reservationIds || !reservationIds.size) return { ok: true, deleted: 0 };
  const today = new Date().toISOString().slice(0, 10);
  let deleted = 0;
  for (const reservationId of reservationIds) {
    try {
      const q = `${url}/rest/v1/meal_plans?reservation_id=eq.${encodeURIComponent(reservationId)}&departure=gte.${today}`;
      const res = await fetch(q, { method: "DELETE", headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (res.ok) deleted += 1;
      else log?.warn?.(`[hk-auto] Kasowanie anulowanej rezerwacji posilkow HTTP ${res.status}: ${reservationId}`);
    } catch (e) {
      log?.warn?.(`[hk-auto] Kasowanie anulowanej rezerwacji posilkow BLAD: ${e.message}`);
    }
  }
  if (deleted) log?.info?.(`[hk-auto] Posilki: skasowano ${deleted} anulowanych rezerwacji z bazy (poza historia).`);
  return { ok: true, deleted };
}

module.exports = { upsertMealsToSupabase, deleteStaleMealRows, detectCancelledMealReservations, deleteCancelledMealRows };
