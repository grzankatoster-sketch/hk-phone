// Symulacja: porównuje renderowanie kolumny "Typ" raportu indywidualnego HK
// dla pokoi APT — przed i po poprawce w src/lib/pdf-hk.js.
//
// Uruchom: node scripts/sim-hk-apt-report.mjs

const APT_DESC_DEFAULTS = {106:"D+T",206:"D+T+SOFA 1",218:"D+D",306:"D+T",318:"D+T"};

// Stara logika (przed poprawką) — z linii 339
function typOld(room, rd) {
  const showTyp = rd.status === "W" || rd.status === "WP" || rd.zs;
  if (!showTyp) return "(puste)";
  return (rd.roomType || room.type) + (rd.zs ? " ZS" : "");
}

// Nowa logika (po poprawce)
function aptDesc(room, rd) {
  return rd.apartmentNote || rd.roomType || APT_DESC_DEFAULTS[room.no] || room.type;
}
function typNew(room, rd) {
  const showTyp = rd.status === "W" || rd.status === "WP" || rd.zs;
  if (!showTyp) return "(puste)";
  const base = room.apt ? aptDesc(room, rd) : (rd.roomType || room.type);
  return base + (rd.zs ? " ZS" : "");
}

// Co pokazuje raport pokoi (downloadHKRoomList — wzorzec, który teraz dorownujemy)
function typRoomList(room, rd) {
  if (!room.apt) return rd.roomType || room.type;
  return rd.apartmentNote || rd.roomType || APT_DESC_DEFAULTS[room.no] || room.type;
}

const apt218 = { no: "218", type: "APT", apt: true };
const apt106 = { no: "106", type: "APT", apt: true };
const apt206 = { no: "206", type: "APT", apt: true };
const reg104 = { no: "104", type: "SGL" };

const scenarios = [
  { label: "APT 218 z notatka 'D+D 1+SOFA'",   room: apt218, rd: { person: "Anna", status: "W",  apartmentNote: "D+D 1+SOFA" } },
  { label: "APT 218 z roomType 'TWIN' bez notatki", room: apt218, rd: { person: "Anna", status: "W",  roomType: "TWIN" } },
  { label: "APT 106 bez notatki i bez roomType",   room: apt106, rd: { person: "Ewa",  status: "W"  } },
  { label: "APT 206 status PG",                     room: apt206, rd: { person: "Ewa",  status: "PG" } },
  { label: "APT 218 status WP + ZS",                room: apt218, rd: { person: "Ewa",  status: "WP", zs: true, apartmentNote: "D+T+SOFA" } },
  { label: "Pokoj zwykly 104 (kontrola, status W)", room: reg104, rd: { person: "Ewa",  status: "W"  } },
];

const pad = (s, n) => String(s).padEnd(n);

console.log("\nSymulacja kolumny 'Typ' w raporcie indywidualnym (downloadHKStatus)");
console.log("=".repeat(110));
console.log(pad("Scenariusz", 46) + pad("Raport Pokoje", 18) + pad("Stare (BUG)", 18) + pad("Nowe (FIX)", 18) + "Zgodne?");
console.log("-".repeat(110));

let diffs = 0, fixed = 0;
for (const s of scenarios) {
  const ref = typRoomList(s.room, s.rd);
  const oldV = typOld(s.room, s.rd);
  const newV = typNew(s.room, s.rd);
  const okOld = ref === oldV;
  const okNew = ref === newV;
  if (s.room.apt && s.rd.status) {
    if (!okOld) diffs++;
    if (okNew && !okOld) fixed++;
  }
  const mark = okNew ? "OK" : (s.room.apt ? "ROZNIE" : "ok");
  console.log(pad(s.label, 46) + pad(ref, 18) + pad(oldV, 18) + pad(newV, 18) + mark);
}
console.log("-".repeat(110));
console.log(`Wyniki: APT/status -> przed poprawka rozbieznosci: ${diffs}, naprawione: ${fixed}`);
console.log(`Wniosek: ${fixed === diffs && diffs > 0 ? "POPRAWKA DZIALA - kolumna Typ pokazuje teraz ten sam opis co raport pokoi." : "Sprawdz logike."}`);
console.log("");
