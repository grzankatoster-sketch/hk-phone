import { describe, it, expect } from "vitest";
import { workerStats, suggestReassignments } from "../src/lib/hkAgent.js";

describe("workerStats", () => {
  it("klasyfikuje statusy pokoi (czeka/w trakcie/gotowe)", () => {
    const stats = workerStats(
      { Ala: [101, 102, 103] },
      { 101: { status: "czyste" }, 102: { status: "czyszczenie" }, 103: { status: "W" } },
    );
    expect(stats.Ala).toMatchObject({ total: 3, done: 1, cleaning: 1, waiting: 1 });
    expect(stats.Ala.waitingRooms).toEqual([103]);
  });

  it("brak wpisu = pokój czeka (nietknięty)", () => {
    const stats = workerStats({ Ala: [201, 202] }, {});
    expect(stats.Ala.waiting).toBe(2);
    expect(stats.Ala.waitingRooms).toEqual([201, 202]);
  });

  it("'pominięte' liczone jako gotowe", () => {
    const stats = workerStats({ Ala: [301] }, { 301: { status: "pominięte" } });
    expect(stats.Ala.done).toBe(1);
    expect(stats.Ala.waiting).toBe(0);
  });

  it("pusty/niezdefiniowany wkład → pusty obiekt", () => {
    expect(workerStats(undefined, undefined)).toEqual({});
    expect(workerStats({}, {})).toEqual({});
  });
});

describe("suggestReassignments", () => {
  it("nie sugeruje gdy mniej niż 2 pracowników", () => {
    const out = suggestReassignments({ assignments: { Ala: [1, 2, 3, 4] }, roomStates: {} });
    expect(out).toEqual([]);
  });

  it("nie sugeruje gdy nikt nie skończył", () => {
    const out = suggestReassignments({
      assignments: { Ala: [1, 2, 3, 4], Ola: [5, 6, 7, 8] },
      roomStates: {},
    });
    expect(out).toEqual([]);
  });

  it("przenosi ~połowę nietkniętych od przeciążonego do wolnego", () => {
    const out = suggestReassignments({
      assignments: { Ala: [1, 2, 3, 4, 5, 6], Ola: [7, 8] },
      roomStates: {
        7: { status: "czyste" }, 8: { status: "czyste" }, // Ola skończyła
        // Ala: 6 pokoi czeka
      },
    });
    expect(out.length).toBe(1);
    expect(out[0]).toMatchObject({ from: "Ala", to: "Ola" });
    expect(out[0].rooms).toEqual([1, 2, 3]); // floor(6/2) = 3, pierwsze nietknięte
  });

  it("respektuje minGap — zaległość poniżej progu nie wywołuje sugestii", () => {
    const out = suggestReassignments(
      {
        assignments: { Ala: [1, 2], Ola: [3] },
        roomStates: { 3: { status: "czyste" } },
      },
      { minGap: 3 },
    );
    expect(out).toEqual([]);
  });

  it("excludeTo — popołudniówka nie jest odbiorcą wyjazdów (bug Kamil/Viktoria)", () => {
    // Viktoria przeciążona (6 wyjazdów czeka), Kamil idle bo na popołudnie (PG/PGZ/BR/ZS,
    // brak rannych pokoi). Bez excludeTo agent zrzucałby jej wyjazdy na Kamila.
    const base = {
      assignments: { Viktoria: [1, 2, 3, 4, 5, 6, 7, 8], Ola: [9, 10, 11, 12] },
      // Ola częściowo zrobiona (load 2), Viktoria 8 wyjazdów czeka, Kamil 0 (popołudnie)
      roomStates: { 9: { status: "czyste" }, 10: { status: "czyste" } },
      presentWorkers: ["Viktoria", "Ola", "Kamil"], // Kamil obecny, 0 rannych pokoi
    };
    const withKamil = suggestReassignments({ ...base });
    expect(withKamil.some(s => s.to === "Kamil")).toBe(true); // bez wykluczenia trafia do Kamila (najmniej obciążony)

    const out = suggestReassignments({ ...base, excludeTo: ["Kamil"] });
    expect(out.every(s => s.to !== "Kamil")).toBe(true); // popołudniówka pominięta
    expect(out[0]).toMatchObject({ to: "Ola" }); // odbiorcą zostaje ranna obsada
  });

  it("excludeFrom — popołudniówka nie jest dawcą (rewers buga Kamil/Viktoria)", () => {
    // Kamil ma dużo czekających (zaległość PG/PGZ z popołudnia), Ola trochę mniej —
    // bez wykluczenia agent uznaje Kamila za "przeciążonego" i zrzuca jego pokoje
    // na Olę, choć to inny rodzaj pracy niż poranne wyjazdy (bug: rano dostawało
    // zamiany dotyczące pokoi realnie sprzątanych po południu).
    const base = {
      assignments: { Kamil: [1, 2, 3, 4, 5, 6, 7, 8], Ola: [9, 10, 11, 12] },
      roomStates: { 9: { status: "czyste" }, 10: { status: "czyste" } },
    };
    const withoutExclude = suggestReassignments({ ...base });
    expect(withoutExclude.some(s => s.from === "Kamil")).toBe(true); // bez wykluczenia Kamil trafia jako dawca

    const out = suggestReassignments({ ...base, excludeFrom: ["Kamil"] });
    expect(out.every(s => s.from !== "Kamil")).toBe(true); // popołudniówka pominięta jako dawca
    expect(out).toEqual([]); // jedyny pozostały kandydat (Ola) poniżej progu minBusy — brak sugestii
  });

  it("nie dubluje pokoi między kolejnymi sugestiami", () => {
    const out = suggestReassignments({
      assignments: {
        Ala: [1, 2, 3, 4, 5, 6, 7, 8],
        Ola: [9],
        Ewa: [10],
      },
      roomStates: { 9: { status: "czyste" }, 10: { status: "czyste" } },
    });
    const allRooms = out.flatMap(s => s.rooms);
    expect(new Set(allRooms).size).toBe(allRooms.length); // bez duplikatów
  });
});
