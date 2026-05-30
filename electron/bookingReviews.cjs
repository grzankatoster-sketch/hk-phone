const crypto = require("crypto");

const DEFAULT_BOOKING_REVIEWS_URL = "https://www.booking.com/reviews/pl/hotel/conrad-comfort.pl.html";
const ROWS_PER_PAGE = 25;
const MAX_PAGES = 20;

const MONTHS_PL = new Map([
  ["stycznia", 0], ["styczen", 0], ["styczniu", 0],
  ["lutego", 1], ["luty", 1], ["lutym", 1],
  ["marca", 2], ["marzec", 2], ["marcu", 2],
  ["kwietnia", 3], ["kwiecien", 3], ["kwietniu", 3],
  ["maja", 4], ["maj", 4],
  ["czerwca", 5], ["czerwiec", 5], ["czerwcu", 5],
  ["lipca", 6], ["lipiec", 6], ["lipcu", 6],
  ["sierpnia", 7], ["sierpien", 7], ["sierpniu", 7],
  ["wrzesnia", 8], ["wrzesien", 8], ["wrzesniu", 8],
  ["pazdziernika", 9], ["pazdziernik", 9], ["pazdzierniku", 9],
  ["listopada", 10], ["listopad", 10], ["listopadzie", 10],
  ["grudnia", 11], ["grudzien", 11], ["grudniu", 11],
]);

const SCORE_LABELS = new Set([
  "wyjatkowy", "znakomity", "bardzo dobry", "dobry", "przyjemny",
  "przecietny", "slaby", "excellent", "wonderful", "very good", "good",
]);

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function htmlDecode(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

function htmlToText(html) {
  return htmlDecode(String(html || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<(br|\/p|\/div|\/li|\/h\d|\/section|\/article)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " "))
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parsePolishDate(value) {
  const m = stripDiacritics(value).match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS_PL.get(m[2]);
  if (month == null) return null;
  return new Date(Number(m[3]), month, Number(m[1]), 12, 0, 0, 0);
}

function parseStayMonth(value) {
  const m = stripDiacritics(value).match(/pobyt:\s*([a-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS_PL.get(m[1]);
  if (month == null) return null;
  const d = new Date(Number(m[2]), month, 1, 12, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function toIsoNoon(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0).toISOString();
}

function sixMonthsAgo(now = new Date()) {
  const d = new Date(now);
  d.setMonth(d.getMonth() - 6);
  d.setHours(0, 0, 0, 0);
  return d;
}

function cleanLine(value) {
  return String(value || "")
    .replace(/^["'“”„]+|["'“”„]+$/g, "")
    .replace(/^[•\-\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseTotalAndScore(text) {
  const normalized = stripDiacritics(text).replace(/\s+/g, " ");
  const scoreMatch = normalized.match(/ocena\s+na\s+podstawie[\s\S]{0,120}?(\d+[,.]\d+)/)
    || normalized.match(/scored\s+(\d+[,.]\d+)/);
  const totalMatch = normalized.match(/na podstawie\s+([\d\s.]+)\s+opinii/)
    || normalized.match(/([\d\s,.]+)\s+reviews/);
  return {
    score: scoreMatch ? Number(scoreMatch[1].replace(",", ".")) : null,
    total: totalMatch ? Number(totalMatch[1].replace(/[^\d]/g, "")) : null,
  };
}

function looksLikeMeta(line) {
  const n = stripDiacritics(line);
  return !line
    || n.includes("wyslana przez urzadzenie")
    || n.includes("wyjazd ")
    || n.includes("podrozujacy")
    || n.includes("rodzina")
    || n.includes("w parze")
    || n.includes("nocleg")
    || /^\d+\s+(opini|pomocn)/.test(n)
    || n === "napisz opinie"
    || n === "image";
}

function looksLikeRoom(line) {
  const n = stripDiacritics(line);
  return /(pokoj|studio|apartament|room|triple|double|twin|budget|superior)/.test(n);
}

function parseReviewSection(section, cutoff) {
  const date = parsePolishDate(section.slice(0, 80));
  if (!date || date < cutoff) return null;

  const lines = section.split("\n").map(cleanLine).filter(Boolean);
  if (lines.length < 4) return null;

  const scoreIndex = lines.findIndex(line => /^\d{1,2}([,.]\d)?$/.test(line));
  if (scoreIndex < 2) return null;

  const guestName = lines[1] || "Gosc";
  const country = lines.slice(2, scoreIndex).find(line => !looksLikeMeta(line)) || null;
  const score = Number(lines[scoreIndex].replace(",", "."));
  const label = lines[scoreIndex + 1] || null;

  let title = null;
  let roomType = null;
  let stayDate = null;
  const bodyLines = [];

  for (let i = scoreIndex + 2; i < lines.length; i += 1) {
    const line = lines[i];
    const n = stripDiacritics(line);
    if (!title && /^["'“„]/.test(lines[i]) && !SCORE_LABELS.has(n)) {
      title = cleanLine(line);
      continue;
    }
    if (!stayDate && n.startsWith("pobyt:")) {
      stayDate = parseStayMonth(line);
      break;
    }
    if (!roomType && looksLikeRoom(line)) {
      roomType = line;
      continue;
    }
    if (!looksLikeMeta(line) && !SCORE_LABELS.has(n)) bodyLines.push(line);
  }

  const text = bodyLines.join(" ").trim() || null;
  const idSeed = `${guestName}|${date.toISOString().slice(0, 10)}|${score}|${text || ""}`;
  const id = `bcom-live-${crypto.createHash("sha1").update(idSeed).digest("hex").slice(0, 16)}`;

  return {
    id,
    platform: "booking.com",
    guest_name: guestName,
    country,
    score,
    stay_date: stayDate,
    submitted_at: toIsoNoon(date),
    room_type: roomType,
    title,
    positives: text,
    negatives: null,
    response_text: "",
    responded_at: null,
    responded_by: null,
    added_by: "booking-live",
    added_at: new Date().toISOString(),
    booking_label: label,
  };
}

function parseBookingReviews(html, cutoff) {
  const text = htmlToText(html);
  const meta = parseTotalAndScore(text);
  const marker = /Ocena dodana:/g;
  const starts = [];
  let match;
  while ((match = marker.exec(text)) !== null) starts.push(match.index);

  const reviews = [];
  for (let i = 0; i < starts.length; i += 1) {
    const section = text.slice(starts[i], starts[i + 1] || text.length);
    const review = parseReviewSection(section, cutoff);
    if (review) reviews.push(review);
  }
  return { reviews, meta, text };
}

function buildReviewsUrl(page) {
  const base = process.env.BOOKING_REVIEWS_URL || DEFAULT_BOOKING_REVIEWS_URL;
  const url = new URL(base);
  url.searchParams.set("r_lang", "all");
  url.searchParams.set("rows", String(ROWS_PER_PAGE));
  url.searchParams.set("offset", String((page - 1) * ROWS_PER_PAGE));
  url.searchParams.set("sort_by", "date_desc");
  return url.toString();
}

async function fetchBookingReviews() {
  const cutoff = sixMonthsAgo();
  const deduped = new Map();
  let officialScore = null;
  let officialTotal = null;
  let pagesRead = 0;
  let blocked = false;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = buildReviewsUrl(page);
    const res = await fetch(url, {
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
        "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
      },
    });
    if (!res.ok) throw new Error(`Booking.com zwrocil HTTP ${res.status}`);

    const html = await res.text();
    if (/not a robot|verify that you're not a robot|javascript is disabled/i.test(html)) {
      blocked = true;
      break;
    }

    const parsed = parseBookingReviews(html, cutoff);
    pagesRead += 1;
    if (parsed.meta.score) officialScore = parsed.meta.score;
    if (parsed.meta.total) officialTotal = parsed.meta.total;
    const sizeBeforePage = deduped.size;
    parsed.reviews.forEach(review => deduped.set(review.id, review));

    const newestOnPage = parsed.reviews[0] ? new Date(parsed.reviews[0].submitted_at) : null;
    const oldestOnPage = parsed.reviews.at(-1) ? new Date(parsed.reviews.at(-1).submitted_at) : null;
    if (page > 1 && deduped.size === sizeBeforePage) break;
    if (!parsed.reviews.length || (oldestOnPage && oldestOnPage < cutoff && newestOnPage && newestOnPage < cutoff)) break;
  }

  if (blocked) {
    return {
      ok: false,
      blocked: true,
      reviews: [...deduped.values()],
      officialScore,
      officialTotal,
      pagesRead,
      cutoff: cutoff.toISOString(),
      error: "Booking.com wymaga weryfikacji przegladarki i nie udostepnil listy opinii.",
    };
  }

  return {
    ok: true,
    reviews: [...deduped.values()].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at)),
    officialScore,
    officialTotal,
    pagesRead,
    cutoff: cutoff.toISOString(),
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { fetchBookingReviews };
