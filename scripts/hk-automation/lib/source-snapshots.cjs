const fs = require("fs");
const path = require("path");
const { ROOM_NUMBERS } = require("./rooms.cjs");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function sourcePath(outputDir, dateKey) {
  return path.join(outputDir, "sources", `kwhotel-source-${dateKey}.json`);
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2), "utf8");
}

function eventKind(event) {
  if (event?.arrival && event?.departure) return "arrival-departure";
  if (event?.departure) return "departure";
  if (event?.arrival) return "arrival";
  if (event?.stay) return "stay";
  return "unknown";
}

function reservationTouchesDate(reservation, dateKey) {
  return reservation.arrivalDate <= dateKey && dateKey <= reservation.departureDate;
}

function makeSourceSnapshot(dateKey, parsed, planData, meta) {
  const dayEvents = parsed.eventsByDate?.[dateKey] || {};
  const rows = Object.entries(dayEvents)
    .map(([room, event]) => ({
      room,
      event: eventKind(event),
      arrival: !!event.arrival,
      departure: !!event.departure,
      stay: !!event.stay,
      status: planData?.[room]?.status || "",
      roomType: planData?.[room]?.roomType || "",
      rawLines: event.rawLines || [],
    }))
    .sort((a, b) => String(a.room).localeCompare(String(b.room), "pl", { numeric: true }));

  const coveredReservations = (parsed.reservations || [])
    .filter((reservation) => reservationTouchesDate(reservation, dateKey))
    .map((reservation) => ({
      room: reservation.room,
      arrivalDate: reservation.arrivalDate,
      departureDate: reservation.departureDate,
      status: planData?.[reservation.room]?.status || "",
      rawLine: reservation.rawLine || "",
    }))
    .sort((a, b) => String(a.room).localeCompare(String(b.room), "pl", { numeric: true }));

  const summary = {
    arrivals: rows.filter((row) => row.arrival && !row.departure).length,
    departures: rows.filter((row) => row.departure && !row.arrival).length,
    turnarounds: rows.filter((row) => row.arrival && row.departure).length,
    stays: rows.filter((row) => row.stay).length,
    generatedStayovers: Object.values(planData || {}).filter((room) => room.status === "PG" || room.status === "PGZ").length,
    plannedRooms: Object.keys(planData || {}).length,
    emptyRooms: ROOM_NUMBERS.filter((room) => !planData?.[room]?.status).length,
  };

  return {
    version: 1,
    savedAt: meta.generatedAt,
    source: "kwhotel-mail-source",
    targetDate: dateKey,
    dryRun: !!meta.dryRun,
    pdfFiles: meta.pdfFiles || [],
    historyReportCount: meta.historyReportCount || 0,
    parserWarnings: meta.parserWarnings || [],
    stats: parsed.stats || {},
    summary,
    rows,
    reservations: coveredReservations,
    emptyRooms: ROOM_NUMBERS.filter((room) => !planData?.[room]?.status),
  };
}

function writeSourceSnapshots(outputDir, parsed, plansByDate, meta) {
  const written = [];
  for (const [dateKey, planData] of Object.entries(plansByDate || {})) {
    if (!meta.writeEmptyPlans && Object.keys(planData || {}).length === 0) continue;
    const snapshot = makeSourceSnapshot(dateKey, parsed, planData, meta);
    const file = sourcePath(outputDir, dateKey);
    writeJson(file, snapshot);
    written.push({ dateKey, file, rooms: snapshot.summary.plannedRooms });
  }
  return written;
}

module.exports = { makeSourceSnapshot, sourcePath, writeSourceSnapshots };
