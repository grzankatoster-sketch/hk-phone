import { describe, it, expect } from "vitest";
import { calculateSafeDeposit, calculateShiftCash, parseCashAmount, computeSafeDeposit } from "../src/lib/cash.mjs";

const money = value => Math.round(value * 100) / 100;

describe("parseCashAmount", () => {
  it("parsuje przecinek dziesiętny jak w PL", () => {
    expect(parseCashAmount("123,45")).toBe(123.45);
  });
  it("pusty string → 0", () => {
    expect(parseCashAmount("")).toBe(0);
  });
  it("liczba przechodzi bez zmian", () => {
    expect(parseCashAmount(42)).toBe(42);
  });
  it("śmieci/null/undefined → 0 (nigdy NaN)", () => {
    expect(parseCashAmount(null)).toBe(0);
    expect(parseCashAmount(undefined)).toBe(0);
    expect(parseCashAmount("abc")).toBe(0);
  });
});

describe("calculateShiftCash", () => {
  it("pierwsze KW na zmianie — przyrost = wpisana wartość", () => {
    const r = calculateShiftCash({ stalaKasowa: 500, kwTotal: 0, kwTotalInput: 120 });
    expect(r.kwIncrement).toBe(120);
    expect(r.endingCash).toBe(620);
    expect(r.nextKwTotal).toBe(120);
  });

  it("kolejna zmiana — przyrost to różnica względem poprzedniego KW", () => {
    const r = calculateShiftCash({ stalaKasowa: 620, kwTotal: 120, kwTotalInput: 180 });
    expect(r.kwIncrement).toBe(60);
    expect(r.endingCash).toBe(680);
    expect(r.nextKwTotal).toBe(180);
  });

  it("wpisane KW niższe niż poprzednie — przyrost nie schodzi poniżej 0", () => {
    const r = calculateShiftCash({ stalaKasowa: 620, kwTotal: 180, kwTotalInput: 150 });
    expect(r.kwIncrement).toBe(0);
    expect(r.endingCash).toBe(620);
    expect(r.nextKwTotal).toBe(150);
  });
});

describe("calculateSafeDeposit", () => {
  it("wpłata do sejfu pomniejsza gotówkę, KW resetuje się do post-deposit", () => {
    const r = calculateSafeDeposit({
      stalaKasowa: 680,
      kwTotal: 180,
      safeDepositKW: 260,
      safeDepositAmount: 220,
      postDepositKW: 35,
    });
    expect(r.kwIncrement).toBe(80);
    expect(r.totalBeforeDeposit).toBe(760);
    expect(r.endingCash).toBe(540);
    expect(r.nextKwTotal).toBe(35);
  });
});

describe("regresja: pusty / zaniżony Stan KW przy wpłacie do sejfu", () => {
  // Objaw zgłoszony: pracownik zatwierdza wpłatę, ale kasa się nie zmniejsza.
  it("puste Stan KW (0) → wpłata 0, kasa wraca do stałej bez zmian", () => {
    const r = calculateSafeDeposit({
      stalaKasowa: 680,
      kwTotal: 180,
      safeDepositKW: 0, // pole zostawione puste
      safeDepositAmount: 0,
      postDepositKW: 0,
    });
    expect(r.kwIncrement).toBe(0);
    expect(r.deposit).toBe(0);
    expect(r.endingCash).toBe(680); // brak spadku = obserwowany bug
  });

  it("Stan KW niższe niż poprzednie → przyrost 0 (clamp), wpłata 0", () => {
    const r = calculateSafeDeposit({
      stalaKasowa: 680,
      kwTotal: 180,
      safeDepositKW: 150, // niżej niż KW poprzedniej zmiany
      safeDepositAmount: 0,
      postDepositKW: 0,
    });
    expect(r.kwIncrement).toBe(0);
    expect(r.endingCash).toBe(680);
  });

  it("po pre-wypełnieniu KW końcową (260) → przyrost 80, kasa schodzi do stałej", () => {
    // Po poprawce safeDepositKW jest pre-wypełnione poprawnym odczytem z drukarki.
    const r = calculateSafeDeposit({
      stalaKasowa: 680,
      kwTotal: 180,
      safeDepositKW: 260,
      safeDepositAmount: 80, // domyślnie = przyrost KW
      postDepositKW: 0,
    });
    expect(r.kwIncrement).toBe(80);
    expect(r.totalBeforeDeposit).toBe(760);
    expect(r.endingCash).toBe(680); // kasa wraca do stałej — przyrost trafił do sejfu
  });
});

describe("sekwencja zmian (regresja całego dnia)", () => {
  it("zachowuje spójność endingCash i nextKwTotal przez 4 kroki", () => {
    const sequence = [
      calculateShiftCash({ stalaKasowa: 500, kwTotal: 0, kwTotalInput: 100 }),
      calculateShiftCash({ stalaKasowa: 600, kwTotal: 100, kwTotalInput: 180 }),
      calculateSafeDeposit({ stalaKasowa: 680, kwTotal: 180, safeDepositKW: 250, safeDepositAmount: 200, postDepositKW: 20 }),
      calculateShiftCash({ stalaKasowa: 550, kwTotal: 20, kwTotalInput: 90 }),
    ];
    expect(sequence.map(r => money(r.endingCash))).toEqual([600, 680, 550, 620]);
    expect(sequence.map(r => money(r.nextKwTotal))).toEqual([100, 180, 20, 90]);
  });
});

describe("edge case'y wejścia", () => {
  it("KW z przecinkiem dziesiętnym (format PL) liczy się poprawnie", () => {
    const r = calculateShiftCash({ stalaKasowa: 500, kwTotal: 0, kwTotalInput: "120,50" });
    expect(r.kwIncrement).toBe(120.5);
    expect(r.endingCash).toBe(620.5);
  });

  it("śmieciowa stała kasowa → 0 (nigdy NaN)", () => {
    const r = calculateShiftCash({ stalaKasowa: "abc", kwTotal: 0, kwTotalInput: 100 });
    expect(r.stala).toBe(0);
    expect(r.endingCash).toBe(100);
  });

  it("przyrost grosza bez artefaktów zmiennoprzecinkowych", () => {
    // Bez zaokrąglenia 180.57 - 120.42 = 60.150000000000006 zł.
    const r = calculateShiftCash({ stalaKasowa: 500, kwTotal: 120.42, kwTotalInput: 180.57 });
    expect(r.kwIncrement).toBe(60.15);
    expect(r.endingCash).toBe(560.15);
  });
});

describe("wpłata do sejfu — kwoty graniczne", () => {
  it("wpłata większa niż gotówka → endingCash poniżej zera (sygnał, nie clamp)", () => {
    // Celowo bez clampu: ujemna kasa = czerwona flaga (wpłacono więcej niż było).
    const r = calculateSafeDeposit({ stalaKasowa: 500, kwTotal: 0, safeDepositKW: 100, safeDepositAmount: 700, postDepositKW: 0 });
    expect(r.totalBeforeDeposit).toBe(600);
    expect(r.endingCash).toBe(-100);
  });

  it("kwoty z przecinkiem przy wpłacie — wynik zaokrąglony do grosza", () => {
    const r = calculateSafeDeposit({ stalaKasowa: 500, kwTotal: "120,42", safeDepositKW: "180,57", safeDepositAmount: "60,15", postDepositKW: "0" });
    expect(r.kwIncrement).toBe(60.15);
    expect(r.totalBeforeDeposit).toBe(560.15);
    expect(r.endingCash).toBe(500);
  });

  it("flaga overDeposit: wpłata > gotówki → true (kasa ujemna)", () => {
    const r = calculateSafeDeposit({ stalaKasowa: 500, kwTotal: 0, safeDepositKW: 100, safeDepositAmount: 700, postDepositKW: 0 });
    expect(r.overDeposit).toBe(true);
    expect(r.endingCash).toBe(-100);
  });

  it("flaga overDeposit: wpłata = gotówce → false (kasa = 0)", () => {
    const r = calculateSafeDeposit({ stalaKasowa: 500, kwTotal: 0, safeDepositKW: 100, safeDepositAmount: 600, postDepositKW: 0 });
    expect(r.overDeposit).toBe(false);
    expect(r.endingCash).toBe(0);
  });

  it("flaga overDeposit: typowa wpłata = przyrost KW → false", () => {
    const r = calculateSafeDeposit({ stalaKasowa: 680, kwTotal: 180, safeDepositKW: 260, safeDepositAmount: 80, postDepositKW: 0 });
    expect(r.overDeposit).toBe(false);
  });
});

describe("computeSafeDeposit (wydzielone z handleSafeDeposit — WYKONANIE 2.12)", () => {
  it("tryb match: deposit = przyrost KW, stała bez zmian", () => {
    const r = computeSafeDeposit({ mode: "match", safeDepositKW: "260", kwTotal: 180, safeCounted: "", stalaKasowa: 500, postDepositKW: "" });
    expect(r.kwIncrement).toBe(80);
    expect(r.deposit).toBe(80);
    expect(r.newStala).toBe(500);
    expect(r.totalBeforeDeposit).toBe(580);
    expect(r.postKW).toBe(0);
  });

  it("tryb zero: brak wpłaty, stała bez zmian (atestacja)", () => {
    const r = computeSafeDeposit({ mode: "zero", safeDepositKW: "260", kwTotal: 180, safeCounted: "", stalaKasowa: 500, postDepositKW: "" });
    expect(r.deposit).toBe(0);
    expect(r.newStala).toBe(500);
  });

  it("tryb reported: deposit = policzone, stała koryguje różnicę", () => {
    const r = computeSafeDeposit({ mode: "reported", safeDepositKW: "260", kwTotal: 180, safeCounted: "50", stalaKasowa: 500, postDepositKW: "" });
    expect(r.kwIncrement).toBe(80);
    expect(r.counted).toBe(50);
    expect(r.deposit).toBe(50);          // policzona kwota idzie do sejfu
    expect(r.newStala).toBe(530);        // 500 + 80 - 50
  });

  it("clamp: wpisane KW niższe niż poprzednie → przyrost 0", () => {
    const r = computeSafeDeposit({ mode: "match", safeDepositKW: "100", kwTotal: 180, safeCounted: "", stalaKasowa: 500, postDepositKW: "" });
    expect(r.kwIncrement).toBe(0);
    expect(r.deposit).toBe(0);
    expect(r.newStala).toBe(500);
  });

  it("semantyka parseFloat (NIE parseCashAmount): '260,50' → 260 (przecinek ucięty jak w oryginale)", () => {
    const r = computeSafeDeposit({ mode: "match", safeDepositKW: "260,50", kwTotal: 180, safeCounted: "", stalaKasowa: 500, postDepositKW: "" });
    expect(r.kwIncrement).toBe(80);      // parseFloat("260,50")=260 → 260-180=80
  });

  it("postDepositKW parsowane parseFloat||0", () => {
    const r = computeSafeDeposit({ mode: "match", safeDepositKW: "260", kwTotal: 180, safeCounted: "", stalaKasowa: 500, postDepositKW: "45" });
    expect(r.postKW).toBe(45);
  });

  it("puste/śmieciowe wejścia → 0 (nigdy NaN)", () => {
    const r = computeSafeDeposit({ mode: "match", safeDepositKW: "", kwTotal: 0, safeCounted: "x", stalaKasowa: "", postDepositKW: null });
    expect(r.kwIncrement).toBe(0);
    expect(r.deposit).toBe(0);
    expect(r.newStala).toBe(0);
    expect(r.counted).toBe(0);
    expect(r.postKW).toBe(0);
  });
});
