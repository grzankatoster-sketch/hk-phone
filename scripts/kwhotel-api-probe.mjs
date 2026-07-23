// Diagnostyka jednorazowa: sprawdza czy speculative kod w electron/kwhotel.cjs
// (nigdy niewalidowane zgadywanie endpointów REST/formularza logowania na
// cloud.kwhotel.com) w ogóle działa. Hasło NIGDY nie trafia do czatu/pamięci —
// czytane wyłącznie ze zmiennych środowiskowych, uruchamiane lokalnie przez usera.
//
// Użycie (PowerShell):
//   $env:KWHOTEL_USER = "twoj_login"
//   $env:KWHOTEL_PASS = "twoje_haslo"
//   node scripts/kwhotel-api-probe.mjs
//
// Wynik jest bezpieczny do wklejenia z powrotem do czatu — hasło nigdzie się
// nie pojawia w wydruku (kod w kwhotel.cjs już filtruje pole "password" z logów).

import { createRequire } from "module";
const require = createRequire(import.meta.url);
const kwhotel = require("../electron/kwhotel.cjs");

const user = process.env.KWHOTEL_USER;
const pass = process.env.KWHOTEL_PASS;

if (!user || !pass) {
  console.error("Ustaw KWHOTEL_USER i KWHOTEL_PASS jako zmienne środowiskowe przed uruchomieniem.");
  process.exit(1);
}

const result = await kwhotel.testConnection(user, pass);
console.log(JSON.stringify(result, null, 2));
