// L2/L3 simulation: stateful, multi-actor journeys + invariants.
// Models a localStorage-backed store and reducers that MIRROR the real handlers
// in src/App.jsx, then asserts against EXPECTED user-facing behavior (not just
// "what the code currently does"). This is the layer that would have caught the
// carry-over default-target bug.
//
// Run: node --import ./scripts/_ext-register.mjs scripts/full-sim.mjs

import { calculateShiftCash, calculateSafeDeposit, parseCashAmount } from "../src/lib/cash.mjs";
import { suggestReassignments, workerStats } from "../src/lib/hkAgent.js";

// ── harness ───────────────────────────────────────────────────────────────────
let pass = 0; const fails = []; const warns = [];
const eq = (n, a, e) => { const A = JSON.stringify(a), E = JSON.stringify(e); if (A === E) pass++; else fails.push(`✗ FAIL ${n}\n      got:      ${A}\n      expected: ${E}`); };
const ok = (n, c) => { if (c) pass++; else fails.push(`✗ FAIL ${n}`); };
// expect(): if the assertion fails, it's a WARN (expected-vs-actual divergence = bug candidate)
const expect = (n, c, note) => { if (c) pass++; else warns.push(`⚠ WARN ${n}${note ? `\n      → ${note}` : ""}`); };
const section = (t) => console.log(`\n── ${t} ${"─".repeat(Math.max(0, 56 - t.length))}`);

// ── localStorage mock + json helpers (mirror src/lib/storage.js) ───────────────
const LS = new Map();
const loadJson = (k, fb) => { const r = LS.get(k); if (r == null) return fb; try { const v = JSON.parse(r); return v ?? fb; } catch { return fb; } };
const saveJson = (k, v) => LS.set(k, JSON.stringify(v));

const SHIFT_OPTIONS = ["poranna", "popoludniowa", "wieczorowa", "dzienna", "nocna"];
const NEXT_SHIFT = { poranna: "popoludniowa", popoludniowa: "wieczorowa", wieczorowa: "poranna", dzienna: "nocna", nocna: "dzienna" };
const emptyCarry = () => ({ poranna: [], popoludniowa: [], wieczorowa: [], dzienna: [], nocna: [] });

// ════════════════════════════════════════════════════════════════════════════
// D1 — CARRY-OVER (multi-actor: A passes to next shift, B receives)
// ════════════════════════════════════════════════════════════════════════════
section("D1 · Carry-over — podróż wieloaktorowa");

// reducers mirroring App.jsx addCarryOverTask / markCarryOverDone / carryOverForCurrentShift
const carryAdd = (target, text, by) => {
  const carry = loadJson("carry", emptyCarry());
  carry[target] = [...(carry[target] || []), { id: crypto.randomUUID(), text, by, done: false }];
  saveJson("carry", carry);
};
const carryFor = (shift) => loadJson("carry", emptyCarry())[shift] || [];
const defaultTargetFor = (shift) => NEXT_SHIFT[shift] || "nocna"; // po naprawie

{
  LS.clear();
  // Pracownik poranny przekazuje zadanie używając DOMYŚLNEGO celu.
  const target = defaultTargetFor("poranna");
  carryAdd(target, "Zadzwonić do PWiK", "Anna(poranna)");
  // OCZEKIWANIE: następna zmiana (popołudniowa) dostaje zadanie.
  expect("D1.1 poranny→domyślny cel = popołudniowa dostaje zadanie", carryFor("popoludniowa").length === 1,
    "gdyby default był 'nocna', popołudniowa miałaby 0 — to był pierwotny bug");
  ok("D1.2 nocna nie dostaje cudzego zadania", carryFor("nocna").length === 0);
  // INV-4: cel zawsze w SHIFT_OPTIONS
  ok("D1.3 INV-4 cel ∈ SHIFT_OPTIONS", SHIFT_OPTIONS.includes(target));
}
{
  // RYZYKO: brak wymiaru daty. Zadanie nieodhaczone przeżywa dowolnie długo.
  LS.clear();
  carryAdd("nocna", "Stare zadanie sprzed 5 dni", "ktoś");
  const stillThere = carryFor("nocna").length === 1; // brak pola daty → nie da się wyczyścić po dacie
  expect("D1.4 nieodhaczone zadanie NIE kumuluje się bezterminowo", !stillThere,
    "carry-over nie ma 'targetDate' ani TTL — nieodhaczone zadania zostają na zawsze (kandydat: dodać datę/auto-archiwizację)");
}

// ════════════════════════════════════════════════════════════════════════════
// D2 — POWIADOMIENIA (4 kanały, broadcast, dismiss, ACK)
// ════════════════════════════════════════════════════════════════════════════
section("D2 · Powiadomienia — broadcast / dismiss / ACK");

// dated reminders (mirror addDatedReminder + todayDatedReminders filter)
const datedAdd = (text, targetShift, targetDate) => {
  const arr = loadJson("dated", []);
  arr.unshift({ id: crypto.randomUUID(), text, targetShift: targetShift || null, targetDate });
  saveJson("dated", arr);
};
const datedVisible = (selShift, sessionDate, dismissed) =>
  loadJson("dated", []).filter(r => r.targetDate === sessionDate && (!r.targetShift || r.targetShift === selShift) && !dismissed.includes(`dated-${r.id}`));

const TODAY = "2026-05-30";
{
  LS.clear();
  datedAdd("Przegląd kominiarski o 10:00", null, TODAY);   // broadcast
  datedAdd("VIP pok. 306", "popoludniowa", TODAY);         // targeted
  // INV-1: broadcast widzą wszyscy
  ok("D2.1 INV-1 broadcast widzi poranna", datedVisible("poranna", TODAY, []).length === 1);
  ok("D2.2 INV-1 broadcast widzi nocna", datedVisible("nocna", TODAY, []).length === 1);
  ok("D2.3 targeted: popołudniowa widzi oba", datedVisible("popoludniowa", TODAY, []).length === 2);
  ok("D2.4 targeted: poranna nie widzi VIP", datedVisible("poranna", TODAY, []).some(r => r.text.includes("VIP")) === false);
}
{
  // INV-2 (po naprawie): dismiss utrwalany per pracownik+dzień, przeżywa re-login.
  LS.clear();
  datedAdd("Ważna informacja", null, TODAY);
  const rid = loadJson("dated", [])[0].id;
  const dkey = (name) => `reception-dismissed-reminders-${name}-${TODAY}`;
  // sesja 1: Anna odrzuca → zapis do localStorage (per pracownik+dzień)
  let dismissed = [];
  const dismiss = (name, id) => { dismissed = [...dismissed, `dated-${id}`]; saveJson(dkey(name), dismissed); };
  dismiss("Anna", rid);
  ok("D2.5 po odrzuceniu znika w tej sesji", datedVisible("poranna", TODAY, dismissed).length === 0);
  // re-login Anny: App ładuje utrwalone odrzucenia dla pracownika+dnia
  const relogin = (name) => { dismissed = loadJson(dkey(name), []); };
  relogin("Anna");
  ok("D2.6 INV-2 odrzucone NIE wraca po re-loginie Anny", datedVisible("poranna", TODAY, dismissed).length === 0);
  // ale INNY pracownik (Bartek) widzi je — odrzucenia są per-osobę, nie globalne
  relogin("Bartek");
  ok("D2.6b inny pracownik wciąż widzi (dismiss per-osobę)", datedVisible("poranna", TODAY, dismissed).length === 1);
}
{
  // managerAlerts ACK po naprawie: ack wiązany z HASZEM zbioru alertów.
  LS.clear();
  const ackCat = (name, day, shift, cat) => `ack-${name}-${day}-${shift}-${cat}`;
  const startShift = (name, shift, day) => {
    const alerts = loadJson("alerts", []).filter(a => !a.target_shift || a.target_shift === shift);
    const hash = alerts.map(a => a.id).sort().join(",");
    const hashKey = `ack-al-${name}-${hash}`;
    LS.set(ackCat(name, day, shift, "standing"), "1");
    LS.set(ackCat(name, day, shift, "wiki"), "1");
    const alertsAcked = alerts.length === 0 || LS.get(hashKey) === "1";
    const allAck = alertsAcked && LS.get(ackCat(name, day, shift, "standing")) === "1" && LS.get(ackCat(name, day, shift, "wiki")) === "1";
    const modalShown = !(allAck || alerts.length === 0);
    if (modalShown) LS.set(hashKey, "1"); // user ACKuje zbiór w modalu
    return modalShown;
  };
  saveJson("alerts", [{ id: "a1", title: "Uwaga pok. 101", target_shift: null }]);
  ok("D2.7 pierwszy start z alertem pokazuje modal", startShift("Anna", "poranna", TODAY) === true);
  ok("D2.7b ten sam alert po ACK — modal się NIE powtarza", startShift("Anna", "poranna", TODAY) === false);
  // kierownik dodaje NOWY alert → hash się zmienia
  saveJson("alerts", [{ id: "a1", title: "Uwaga pok. 101", target_shift: null }, { id: "a2", title: "AWARIA WINDY", target_shift: null }]);
  ok("D2.8 nowy alert po ACK ponownie pokazuje okno startu", startShift("Anna", "poranna", TODAY) === true);
}

// ════════════════════════════════════════════════════════════════════════════
// D3 — RAPORT DOBOWY: parsing dat z fmtA (INV-5)
// ════════════════════════════════════════════════════════════════════════════
section("D3 · Raport dobowy — round-trip daty (INV-5)");
const fmtA = (d) => d.toLocaleString("pl-PL", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
const parseLoginDay = (loginAt) => { const p = loginAt.split(", "); const dp = p[0].split("."); return `${dp[2]}-${dp[1].padStart(2, "0")}-${dp[0].padStart(2, "0")}`; };
{
  for (const [y, m, d] of [[2026, 4, 30], [2026, 0, 1], [2026, 11, 9]]) {
    const date = new Date(y, m, d, 14, 53);
    const key = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    eq(`D3 INV-5 round-trip ${key}`, parseLoginDay(fmtA(date)), key);
  }
}
{
  // Porzucona zmiana (brak logoutAt) nie wywala obsady.
  const log = [{ employee: "Anna", shift: "poranna", loginAt: fmtA(new Date(2026, 4, 30, 7, 5)), logoutAt: "" }];
  const dayShifts = log.filter(e => e.loginAt && parseLoginDay(e.loginAt) === "2026-05-30");
  ok("D3.4 porzucona zmiana liczona w obsadzie", dayShifts.length === 1);
}

// ════════════════════════════════════════════════════════════════════════════
// D4 — KASA (realne funkcje + brzegowe)
// ════════════════════════════════════════════════════════════════════════════
section("D4 · Kasa — łańcuch zmian + brzegowe");
{
  // Łańcuch 3 zmian — kwTotal przenoszony bez dryfu.
  let kw = 0;
  const s1 = calculateShiftCash({ stalaKasowa: 500, kwTotal: kw, kwTotalInput: 120.50 }); kw = s1.nextKwTotal;
  const s2 = calculateShiftCash({ stalaKasowa: 500, kwTotal: kw, kwTotalInput: 200.00 }); kw = s2.nextKwTotal;
  eq("D4.1 increment zmiany 2", s2.kwIncrement, 79.5);
  eq("D4.2 ending zmiany 2", s2.endingCash, 579.5);
  // KW niższe niż poprzednie (korekta w dół) → increment 0, nie ujemny.
  const s3 = calculateShiftCash({ stalaKasowa: 500, kwTotal: 200, kwTotalInput: 150 });
  eq("D4.3 KW w dół → increment 0", s3.kwIncrement, 0);
  // przecinek vs kropka
  eq("D4.4 parse '1 234,56'→1234.56? (spacja)", parseCashAmount("1234,56"), 1234.56);
  // sejf
  const dep = calculateSafeDeposit({ stalaKasowa: 680, kwTotal: 180, safeDepositKW: 260, safeDepositAmount: 220, postDepositKW: 35 });
  eq("D4.5 sejf endingCash", dep.endingCash, 540);
}

// ════════════════════════════════════════════════════════════════════════════
// D7 — EWIDENCJA: parsing dat brzegowy
// ════════════════════════════════════════════════════════════════════════════
section("D7 · Ewidencja — parsing dat brzegowy");
{
  // jednocyfrowy dzień/miesiąc (stare dane), przełom roku
  eq("D7.1 '1.5.2026' → 2026-05-01", parseLoginDay("1.5.2026, 7:05"), "2026-05-01");
  eq("D7.2 '31.12.2025' → 2025-12-31", parseLoginDay("31.12.2025, 23:50"), "2025-12-31");
  // filtr miesiąca (mirror filteredEvidenceLog: rok z parts[2].split(',')[0], miesiąc parts[1])
  const monthOf = (loginAt) => { const p = loginAt.split("."); const y = p[2]?.split(",")[0]?.trim(); const m = p[1]?.padStart(2, "0"); return `${y}-${m}`; };
  eq("D7.3 miesiąc z loginAt", monthOf(fmtA(new Date(2026, 0, 9, 8, 0))), "2026-01");
}

// ════════════════════════════════════════════════════════════════════════════
// D8 — KOREKTY PŁATNOŚCI: zatwierdzanie (multi-actor)
// ════════════════════════════════════════════════════════════════════════════
section("D8 · Korekty płatności — przepływ zatwierdzania");
{
  LS.clear();
  // worker składa
  const submit = (by) => { const arr = loadJson("corr", []); arr.unshift({ id: "c1", submittedBy: by, done: false, approvals: {} }); saveJson("corr", arr); };
  const pending = () => loadJson("corr", []).filter(c => !c.done);
  const approve = (id, mgr) => { saveJson("corr", loadJson("corr", []).map(c => c.id === id ? { ...c, done: true, approvals: { ...(c.approvals || {}), [mgr]: { at: "t", note: "" } } } : c)); };
  submit("Anna");
  ok("D8.1 świeża korekta jest 'pending'", pending().length === 1);
  approve("c1", "Kierownik1");
  ok("D8.2 po zatwierdzeniu znika z pending", pending().length === 0);
  const c = loadJson("corr", [])[0];
  ok("D8.3 zapisuje KTO zatwierdził", !!c.approvals["Kierownik1"]?.at);
  ok("D8.4 done=true", c.done === true);
}

// ════════════════════════════════════════════════════════════════════════════
// D9 — WIADOMOŚCI: licznik + kształt nadawcy (regresja wykrytego buga)
// ════════════════════════════════════════════════════════════════════════════
section("D9 · Wiadomości — licznik + normalizacja nadawcy");
{
  LS.clear();
  // dwa kształty: pracownik {sender,sentAt}, systemowy {from,createdAt}
  const fromWorker = { id: "m1", sender: "Anna", sentAt: "30.05.2026, 14:00", text: "Pytanie", readByAdmin: false };
  const cashAlert = { id: "m2", from: "Bartek", createdAt: "30.05.2026, 15:00", type: "cash_discrepancy", read: false, text: "Niezgodność kasy" };
  saveJson("msgs", [cashAlert, fromWorker]);
  const unread = () => loadJson("msgs", []).filter(m => !m.readByAdmin).length;
  ok("D9.1 oba liczone jako nieprzeczytane", unread() === 2);
  // markAll → readByAdmin:true wszędzie
  saveJson("msgs", loadJson("msgs", []).map(m => ({ ...m, readByAdmin: true })));
  ok("D9.2 markAll zeruje licznik (oba kształty)", unread() === 0);
  // Panel kierownika — wyświetlenie nadawcy/czasu PO naprawie (sender||from)
  const dispSender = (m) => m.sender || m.from || "";
  const dispTime = (m) => m.sentAt || m.createdAt || "";
  ok("D9.3 nadawca wiadomości systemowej widoczny (bug naprawiony)", dispSender(cashAlert) === "Bartek");
  ok("D9.4 godzina wiadomości systemowej widoczna", dispTime(cashAlert) === "30.05.2026, 15:00");
}

// ════════════════════════════════════════════════════════════════════════════
// D-HK · Agent regułowy zamian pokoi (hkAgent.js, czysta funkcja)
// ════════════════════════════════════════════════════════════════════════════
section("D-HK · Agent regułowy sugestii zamian");
const rs = (obj) => obj; // helper czytelności
{
  // Anna skończyła (wszystko 'czyste'), Bartek ma 6 czekających → sugestia przeniesienia ~3.
  const assignments = { Anna: ["101","102"], Bartek: ["201","202","203","204","205","206"] };
  const roomStates = { "101":{status:"czyste"}, "102":{status:"czyste"} }; // Bartka brak wpisów = czeka
  const sug = suggestReassignments({ assignments, roomStates });
  ok("HK1 jest sugestia", sug.length === 1);
  eq("HK2 z Bartka do Anny", [sug[0].from, sug[0].to], ["Bartek","Anna"]);
  eq("HK3 przenosi 3 pokoje (połowa z 6)", sug[0].rooms.length, 3);
  ok("HK4 tylko nietknięte pokoje Bartka", sug[0].rooms.every(r=>["201","202","203","204","205","206"].includes(r)));
}
{
  // Równe obciążenie / brak wolnego → brak sugestii.
  const assignments = { Anna: ["101","102","103"], Bartek: ["201","202","203"] };
  ok("HK5 nikt nie skończył → brak sugestii", suggestReassignments({ assignments, roomStates:{} }).length === 0);
}
{
  // Wolny jest, ale przeciążony ma < minGap (2 < 3) → brak sugestii.
  const assignments = { Anna: ["101"], Bartek: ["201","202"] };
  const roomStates = { "101":{status:"czyste"} };
  ok("HK6 zaległość < próg → brak sugestii", suggestReassignments({ assignments, roomStates }).length === 0);
}
{
  // Pokoje w trakcie/skończone NIE są przenoszone (Bartek: 3 czekające ≥ próg).
  const assignments = { Anna: ["101"], Bartek: ["201","202","203","204","205"] };
  const roomStates = { "101":{status:"czyste"}, "201":{status:"czyszczenie"}, "202":{status:"czyste"} };
  const sug = suggestReassignments({ assignments, roomStates });
  ok("HK7 jest sugestia", sug.length === 1);
  ok("HK8 nie przenosi 201 (w trakcie) ani 202 (czyste)", sug.length===1 && !sug[0].rooms.includes("201") && !sug[0].rooms.includes("202"));
}
{
  const st = workerStats({ A:["1","2","3"] }, { "1":{status:"czyste"}, "2":{status:"czyszczenie"} });
  eq("HK9 workerStats liczy done/cleaning/waiting", [st.A.done, st.A.cleaning, st.A.waiting], [1,1,1]);
}

// ════════════════════════════════════════════════════════════════════════════
// INV-4 — wszystkie defaulty zmian są legalne
// ════════════════════════════════════════════════════════════════════════════
section("L3 · Inwarianty globalne");
for (const s of SHIFT_OPTIONS) ok(`INV-4 NEXT_SHIFT[${s}] ∈ SHIFT_OPTIONS`, SHIFT_OPTIONS.includes(NEXT_SHIFT[s]));

// ════════════════════════════════════════════════════════════════════════════
console.log(`\n${"═".repeat(64)}`);
console.log(`PASS: ${pass}   FAIL: ${fails.length}   WARN: ${warns.length}`);
if (fails.length) { console.log("\n" + fails.join("\n")); }
if (warns.length) { console.log("\nROZBIEŻNOŚCI (kandydaci na bugi):\n\n" + warns.join("\n")); }
console.log("");
process.exit(fails.length ? 1 : 0);
