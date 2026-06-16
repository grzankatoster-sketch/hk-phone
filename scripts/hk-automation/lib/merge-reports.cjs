function emptyParsed() {
  return { reservations: [], eventsByDate: {}, warnings: [], stats: { lines: 0, matchedLines: 0 } };
}

function rangesOverlap(a, b) {
  if (!a?.arrivalDate || !a?.departureDate || !b?.arrivalDate || !b?.departureDate) return false;
  return a.arrivalDate < b.departureDate && b.arrivalDate < a.departureDate;
}

function sameStay(a, b) {
  if (!a || !b) return false;
  return a.room === b.room && (
    a.arrivalDate === b.arrivalDate ||
    a.departureDate === b.departureDate ||
    rangesOverlap(a, b)
  );
}

function addEvent(target, dateKey, room, type, rawLine) {
  if (!dateKey || !room || !type) return;
  target.eventsByDate[dateKey] ||= {};
  target.eventsByDate[dateKey][room] ||= { arrival: false, departure: false, stay: false, rawLines: [] };
  target.eventsByDate[dateKey][room][type] = true;
  if (rawLine) target.eventsByDate[dateKey][room].rawLines.push(rawLine);
}

function reservationRawLines(parsed) {
  return new Set((parsed.reservations || []).map((reservation) => reservation.rawLine).filter(Boolean));
}

function collectExplicitEvents(parsed, reportName) {
  const reservationLines = reservationRawLines(parsed);
  const events = [];
  for (const [dateKey, rooms] of Object.entries(parsed.eventsByDate || {})) {
    for (const [room, event] of Object.entries(rooms || {})) {
      const rawLines = (event.rawLines || []).filter((line) => !reservationLines.has(line));
      if (!rawLines.length) continue;
      for (const type of ["arrival", "departure", "stay"]) {
        if (!event[type]) continue;
        events.push({
          dateKey,
          room,
          type,
          rawLine: `${reportName}: ${rawLines.join(" | ")}`,
        });
      }
    }
  }
  return events;
}

// Sprawdza, czy rezerwacja z raportu source jest "stale future" — czyli była
// tentatywną przyszłą rezerwacją w czasie source, a żaden późniejszy raport z
// reportDate >= arrivalDate już jej nie potwierdza (anulowana w KWHotel).
function isStaleFutureReservation(reservation, sourceReportDate, laterReports) {
  if (!sourceReportDate || !reservation.arrivalDate) return false;
  if (reservation.arrivalDate <= sourceReportDate) return false; // nie jest future
  for (const later of laterReports) {
    if (!later.reportDate) continue;
    if (later.reportDate < reservation.arrivalDate) continue; // nie pokrywa
    const hasSame = (later.parsed?.reservations || []).some((r) =>
      r.room === reservation.room && r.arrivalDate === reservation.arrivalDate
    );
    if (!hasSame) return true; // późniejszy raport pokrywa datę, ale rezerwacja zniknęła
  }
  return false;
}

function mergeReports(reports) {
  const combined = emptyParsed();
  const resolvedReservations = [];
  const explicitEvents = [];

  const reportDateFor = (r) =>
    r.parsed?.reportDate || (r.importedAt ? String(r.importedAt).slice(0, 10) : null);

  reports.forEach((report, index) => {
    const parsed = report.parsed || emptyParsed();
    const reportName = report.name || `report-${index + 1}`;
    const sourceReportDate = reportDateFor(report);
    const laterReports = reports.slice(index + 1).map((r) => ({
      reportDate: reportDateFor(r),
      parsed: r.parsed,
    }));
    combined.warnings.push(...(parsed.warnings || []).map((warning) => `${reportName}: ${warning}`));
    combined.stats.lines += parsed.stats?.lines || 0;
    combined.stats.matchedLines += parsed.stats?.matchedLines || 0;

    for (const reservation of parsed.reservations || []) {
      if (isStaleFutureReservation(reservation, sourceReportDate, laterReports)) {
        continue; // anulowana w KWHotel — nie scalaj
      }
      const next = {
        ...reservation,
        source: reportName,
        sourceIndex: index,
        rawLine: reservation.rawLine ? `${reportName}: ${reservation.rawLine}` : reportName,
      };
      for (let i = resolvedReservations.length - 1; i >= 0; i -= 1) {
        const current = resolvedReservations[i];
        if (current.room === next.room && current.sourceIndex <= next.sourceIndex && sameStay(current, next)) {
          resolvedReservations.splice(i, 1);
        }
      }
      resolvedReservations.push(next);
    }

    explicitEvents.push(...collectExplicitEvents(parsed, reportName).map((event) => ({ ...event, sourceIndex: index })));
  });

  resolvedReservations
    .sort((a, b) => a.sourceIndex - b.sourceIndex || String(a.room).localeCompare(String(b.room), "pl", { numeric: true }))
    .forEach((reservation) => {
      combined.reservations.push(reservation);
      addEvent(combined, reservation.arrivalDate, reservation.room, "arrival", reservation.rawLine);
      addEvent(combined, reservation.departureDate, reservation.room, "departure", reservation.rawLine);
    });

  explicitEvents
    .sort((a, b) => a.sourceIndex - b.sourceIndex)
    .forEach((event) => addEvent(combined, event.dateKey, event.room, event.type, event.rawLine));

  return combined;
}

module.exports = { mergeReports };
