const { compareDateKeys, diffDays, enumerateDateKeys, enumerateDateRange } = require("./dates.cjs");
const { ROOM_TYPE_BY_NO } = require("./rooms.cjs");

function reservationCoversDate(reservation, dateKey) {
  return reservation.arrivalDate < dateKey && dateKey < reservation.departureDate;
}

function chooseStayoverStatus(reservation, dateKey, config) {
  // Override z uwag KWHotel — np. rezerwacja grupowa z "PG" w uwagach
  // ma mieć PG na każdy dzień pobytu, nieprzerwany przez parytet.
  if (reservation.notesStatus === "PG") {
    return "PG";
  }
  const nightsFromArrival = diffDays(reservation.arrivalDate, dateKey);
  if (config?.stayoverMode === "threshold") {
    const threshold = Number(config?.pgzAfterStayNights || 0);
    return threshold && nightsFromArrival >= threshold ? "PGZ" : "PG";
  }
  return nightsFromArrival % 2 === 0 ? "PG" : "PGZ";
}

function dateKeysFromParsed(parsed, fallbackStartDate, fallbackDaysAhead) {
  const keys = new Set(Object.keys(parsed.eventsByDate || {}));
  const boundaries = [];

  for (const reservation of parsed.reservations || []) {
    if (!reservation.arrivalDate || !reservation.departureDate) continue;
    boundaries.push(reservation.arrivalDate, reservation.departureDate);
  }

  if (boundaries.length) {
    const sorted = boundaries.sort(compareDateKeys);
    enumerateDateRange(sorted[0], sorted[sorted.length - 1]).forEach((dateKey) => keys.add(dateKey));
  }

  if (!keys.size && fallbackStartDate) {
    enumerateDateKeys(fallbackStartDate, fallbackDaysAhead).forEach((dateKey) => keys.add(dateKey));
  }

  return [...keys].sort(compareDateKeys);
}

function computeStatuses(parsed, options = {}) {
  const startDate = options.startDate;
  const daysAhead = Number.isFinite(options.daysAhead) ? options.daysAhead : 5;
  const dateKeys = Array.isArray(options.dateKeys) && options.dateKeys.length
    ? [...options.dateKeys].sort(compareDateKeys)
    : dateKeysFromParsed(parsed, startDate, daysAhead);
  const statusLogic = options.statusLogic || {};
  const plansByDate = {};

  for (const dateKey of dateKeys) {
    const dayEvents = parsed.eventsByDate[dateKey] || {};
    const data = {};

    for (const [room, event] of Object.entries(dayEvents)) {
      if (event.departure && event.arrival) data[room] = { status: "WP" };
      else if (event.departure) data[room] = { status: "W" };
      else if (event.arrival) data[room] = { status: "P" };
      else if (event.stay) data[room] = { status: "PG" };
    }

    if (statusLogic.generateStayovers !== false) {
      for (const reservation of parsed.reservations) {
        if (!reservationCoversDate(reservation, dateKey)) continue;
        if (data[reservation.room]?.status) continue;
        data[reservation.room] = {
          status: chooseStayoverStatus(reservation, dateKey, statusLogic),
        };
      }
    }

    for (const [room, value] of Object.entries(data)) {
      value.roomType = ROOM_TYPE_BY_NO[room] || "";
      value.autoSource = "kwhotel-mail";
      value.autoUpdatedAt = options.generatedAt;
    }

    plansByDate[dateKey] = data;
  }

  return plansByDate;
}

module.exports = { computeStatuses };
