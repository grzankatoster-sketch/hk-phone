const fs = require("fs");
const path = require("path");
const assert = require("assert");
const { parseKwhotelText } = require("./lib/parser.cjs");
const { mergeReports } = require("./lib/merge-reports.cjs");
const { computeStatuses } = require("./lib/status-logic.cjs");

const text = fs.readFileSync(path.join(__dirname, "test-fixtures", "sample-report.txt"), "utf8");
const parsed = parseKwhotelText(text, { fallbackYear: 2026 });
const plans = computeStatuses(parsed, {
  startDate: "2026-05-03",
  daysAhead: 3,
  statusLogic: { stayoverMode: "parity", pgzAfterStayNights: 3, generateStayovers: true },
  generatedAt: "2026-05-04T00:00:00.000Z",
});

assert.strictEqual(plans["2026-05-03"]["306"].status, "W");
assert.strictEqual(plans["2026-05-04"]["202"].status, "W");
assert.strictEqual(plans["2026-05-05"]["101"].status, "PG");
assert.strictEqual(plans["2026-05-06"]["101"].status, "W");

const arrivalOnlyText = `
Raport przyjazdow i wyjazdow
Przyjazdy
102 Arrival Only 08.05.2026
`;
const arrivalOnlyParsed = parseKwhotelText(arrivalOnlyText, { fallbackYear: 2026 });
const arrivalOnlyPlans = computeStatuses(arrivalOnlyParsed, {
  startDate: "2026-05-04",
  daysAhead: 1,
  statusLogic: { stayoverMode: "parity", generateStayovers: true },
  generatedAt: "2026-05-04T00:00:00.000Z",
});

assert.strictEqual(arrivalOnlyPlans["2026-05-08"]["102"].status, "P");

const futureText = `
Raport przyjazdow i wyjazdow
Przyjazdy
102 Test Future 10.05.2026 15.05.2026
103 Same Day 12.05.2026 14.05.2026
Wyjazdy
103 Same Day 10.05.2026 12.05.2026
`;
const futureParsed = parseKwhotelText(futureText, { fallbackYear: 2026 });
const futurePlans = computeStatuses(futureParsed, {
  startDate: "2026-05-04",
  daysAhead: 1,
  statusLogic: { stayoverMode: "parity", pgzAfterStayNights: 3, generateStayovers: true },
  generatedAt: "2026-05-04T00:00:00.000Z",
});

assert.strictEqual(futurePlans["2026-05-12"]["103"].status, "WP");
assert.strictEqual(futurePlans["2026-05-11"]["102"].status, "PGZ");
assert.strictEqual(futurePlans["2026-05-13"]["102"].status, "PGZ");
assert.strictEqual(futurePlans["2026-05-14"]["102"].status, "PG");
assert.strictEqual(futurePlans["2026-05-15"]["102"].status, "W");

const spacedCompactText = `
Raport KWHotel
05.05.2026 101 05.05.2026 3
`;
const spacedCompactParsed = parseKwhotelText(spacedCompactText, { fallbackYear: 2026 });
const spacedCompactPlans = computeStatuses(spacedCompactParsed, {
  startDate: "2026-05-05",
  daysAhead: 3,
  statusLogic: { stayoverMode: "parity", generateStayovers: true },
  generatedAt: "2026-05-04T00:00:00.000Z",
});

assert.strictEqual(spacedCompactPlans["2026-05-05"]["101"].status, "WP");
assert.strictEqual(spacedCompactPlans["2026-05-06"]["101"].status, "PGZ");
assert.strictEqual(spacedCompactPlans["2026-05-07"]["101"].status, "PG");
assert.strictEqual(spacedCompactPlans["2026-05-08"]["101"].status, "W");

const stayOnlyText = `
Pobyty
05.05.2026 102
`;
const stayOnlyParsed = parseKwhotelText(stayOnlyText, { fallbackYear: 2026 });
const stayOnlyPlans = computeStatuses(stayOnlyParsed, {
  startDate: "2026-05-05",
  daysAhead: 1,
  statusLogic: { stayoverMode: "parity", generateStayovers: true },
  generatedAt: "2026-05-04T00:00:00.000Z",
});

assert.strictEqual(stayOnlyPlans["2026-05-05"]["102"].status, "PG");

const oldReport = parseKwhotelText(`
Raport przyjazdow i wyjazdow
Przyjazdy
201 Test Extension 01.05.2026 05.05.2026
`, { fallbackYear: 2026 });
const correctionReport = parseKwhotelText(`
Raport przyjazdow i wyjazdow
Wyjazdy
201 Test Extension 01.05.2026 06.05.2026
`, { fallbackYear: 2026 });
const mergedCorrection = mergeReports([
  { name: "old.pdf", parsed: oldReport },
  { name: "correction.pdf", parsed: correctionReport },
]);
const correctionPlans = computeStatuses(mergedCorrection, {
  dateKeys: ["2026-05-05", "2026-05-06"],
  statusLogic: { stayoverMode: "parity", generateStayovers: true },
  generatedAt: "2026-05-04T00:00:00.000Z",
});

assert.strictEqual(correctionPlans["2026-05-05"]["201"].status, "PG");
assert.strictEqual(correctionPlans["2026-05-06"]["201"].status, "W");

// Uwagi "PG" w wierszu rezerwacji wymuszają PG na każdy dzień pobytu
// (rezerwacja grupowa — bez naprzemienności PG/PGZ).
const groupNotesText = `
Raport przyjazdow i wyjazdow
Przyjazdy
204 Grupa Wesele 10.05.2026 15.05.2026 PG
`;
const groupNotesParsed = parseKwhotelText(groupNotesText, { fallbackYear: 2026 });
const groupNotesPlans = computeStatuses(groupNotesParsed, {
  startDate: "2026-05-10",
  daysAhead: 5,
  statusLogic: { stayoverMode: "parity", generateStayovers: true },
  generatedAt: "2026-05-10T00:00:00.000Z",
});

assert.strictEqual(groupNotesPlans["2026-05-10"]["204"].status, "P",   "P nie powinno być nadpisane przez uwagi");
assert.strictEqual(groupNotesPlans["2026-05-11"]["204"].status, "PG",  "stayover diff=1: parytet→PGZ, uwagi forcują PG");
assert.strictEqual(groupNotesPlans["2026-05-12"]["204"].status, "PG",  "stayover diff=2: parytet też PG");
assert.strictEqual(groupNotesPlans["2026-05-13"]["204"].status, "PG",  "stayover diff=3: parytet→PGZ, uwagi forcują PG");
assert.strictEqual(groupNotesPlans["2026-05-14"]["204"].status, "PG",  "stayover diff=4: parytet też PG");
assert.strictEqual(groupNotesPlans["2026-05-15"]["204"].status, "W",   "W nie powinno być nadpisane przez uwagi");

// Male "pg" w uwagach dziala tak samo. "PGZ" nie jest markerem specjalnym
// i ma zostawic zwykle zasady PG/PGZ.
const lowerPgNotesText = `
Raport przyjazdow i wyjazdow
Przyjazdy
206 Grupa Sportowa 10.05.2026 15.05.2026 pg
`;
const lowerPgNotesPlans = computeStatuses(parseKwhotelText(lowerPgNotesText, { fallbackYear: 2026 }), {
  startDate: "2026-05-10",
  daysAhead: 5,
  statusLogic: { stayoverMode: "parity", generateStayovers: true },
  generatedAt: "2026-05-10T00:00:00.000Z",
});

assert.strictEqual(lowerPgNotesPlans["2026-05-11"]["206"].status, "PG", "male pg forczuje PG");
assert.strictEqual(lowerPgNotesPlans["2026-05-13"]["206"].status, "PG", "male pg forczuje PG takze w dni PGZ");

const pgzNotesText = `
Raport przyjazdow i wyjazdow
Przyjazdy
207 Bez Override 10.05.2026 15.05.2026 PGZ
`;
const pgzNotesPlans = computeStatuses(parseKwhotelText(pgzNotesText, { fallbackYear: 2026 }), {
  startDate: "2026-05-10",
  daysAhead: 5,
  statusLogic: { stayoverMode: "parity", generateStayovers: true },
  generatedAt: "2026-05-10T00:00:00.000Z",
});

assert.strictEqual(pgzNotesPlans["2026-05-11"]["207"].status, "PGZ", "PGZ w uwagach nie forczuje PG");
assert.strictEqual(pgzNotesPlans["2026-05-12"]["207"].status, "PG",  "PGZ w uwagach zostawia parytet");

// Bez uwag — parytet PG/PGZ działa jak wcześniej (regresja).
const noNotesText = `
Raport przyjazdow i wyjazdow
Przyjazdy
205 Goscie Bez Uwag 10.05.2026 15.05.2026
`;
const noNotesParsed = parseKwhotelText(noNotesText, { fallbackYear: 2026 });
const noNotesPlans = computeStatuses(noNotesParsed, {
  startDate: "2026-05-10",
  daysAhead: 5,
  statusLogic: { stayoverMode: "parity", generateStayovers: true },
  generatedAt: "2026-05-10T00:00:00.000Z",
});

assert.strictEqual(noNotesPlans["2026-05-11"]["205"].status, "PGZ", "bez uwag: diff=1 → PGZ");
assert.strictEqual(noNotesPlans["2026-05-12"]["205"].status, "PG",  "bez uwag: diff=2 → PG");
assert.strictEqual(noNotesPlans["2026-05-13"]["205"].status, "PGZ", "bez uwag: diff=3 → PGZ");
assert.strictEqual(noNotesPlans["2026-05-14"]["205"].status, "PG",  "bez uwag: diff=4 → PG");

console.log("HK automation parser tests OK");
