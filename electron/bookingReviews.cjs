const crypto = require("crypto");

// Booking.com serwuje pełną, paginowalną listę opinii pod AJAX-owym endpointem
// `reviewlist.html` (publiczna strona /reviews/ ładuje tylko ~24 opinie i resztę
// dociąga JS-em — parametr offset jest tam ignorowany). reviewlist.html zwraca
// ustrukturyzowany HTML z osobnymi blokami plusów (zielony prefix „Podobało się")
// i minusów („Nie podobało się"), dzięki czemu nie trzeba zgadywać po ocenie.
const DEFAULT_PAGENAME = "conrad-comfort";
const DEFAULT_CC1 = "pl";
const ROWS_PER_PAGE = 25;
const MAX_PAGES = 30;

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

// Frazy, które goście wpisują w pole minusów/plusów, gdy nie mają nic do dodania.
// Uwaga: nie filtrujemy każdego „brak ..." — „brak ciepłej wody" to realna skarga.
const NOOP_TEXT = new Set([
  "brak", "brak uwag", "brak zastrzezen", "brak uwag.", "bez uwag", "bez zastrzezen",
  "nic", "nie dotyczy", "n/a", "na", "wszystko ok", "wszystko w porzadku",
  "wszystko bylo ok", "wszystko swietnie", "-", "--", "---",
]);

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function htmlDecode(value) {
  return String(value || "")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

// Wytnij tagi i znormalizuj białe znaki w obrębie jednego fragmentu HTML.
function stripTags(html) {
  return htmlDecode(String(html || "").replace(/<[^>]+>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

function parsePolishDate(value) {
  const m = stripDiacritics(value).match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS_PL.get(m[2]);
  if (month == null) return null;
  return new Date(Number(m[3]), month, Number(m[1]), 12, 0, 0, 0);
}

// „czerwiec 2026" → pierwszy dzień miesiąca (data pobytu, bez dnia).
function parseStayMonth(value) {
  const m = stripDiacritics(value).match(/([a-z]+)\s+(\d{4})/);
  if (!m) return null;
  const month = MONTHS_PL.get(m[1]);
  if (month == null) return null;
  return new Date(Number(m[2]), month, 1, 12, 0, 0, 0).toISOString().slice(0, 10);
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

// Treść plusa/minusa. Puste „grzecznościowe" frazy traktujemy jako brak treści,
// żeby nie zaśmiecały analizy AI (np. minus = „brak uwag").
function cleanBody(html) {
  const text = stripTags(html);
  if (!text) return null;
  const norm = stripDiacritics(text).replace(/[.!]+$/, "").trim();
  if (NOOP_TEXT.has(norm)) return null;
  return text;
}

function parseTotalAndScore(html) {
  const text = stripTags(html);
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

function firstMatch(block, regex) {
  const m = block.match(regex);
  return m ? stripTags(m[1]) : null;
}

// Jeden blok <... itemprop="review" ...> z reviewlist.html.
function parseReviewBlock(block, cutoff) {
  const dates = [...block.matchAll(/c-review-block__date">([\s\S]*?)<\/span>/g)].map(m => stripTags(m[1]));
  const reviewDateText = dates.find(d => /oceniono|ocena dodana/i.test(stripDiacritics(d))) || dates.at(-1);
  const date = parsePolishDate(reviewDateText || "");
  if (!date || date < cutoff) return null;

  const stayText = dates.find(d => !/oceniono|ocena dodana/i.test(stripDiacritics(d)));
  const stayDate = stayText ? parseStayMonth(stayText) : null;

  const guestName = firstMatch(block, /bui-avatar-block__title">([\s\S]*?)<\/span>/) || "Gość";
  const country = firstMatch(block, /bui-avatar-block__subtitle">([\s\S]*?)<\/span><\/div>/) || null;
  const scoreRaw = (block.match(/bui-review-score__badge"[^>]*>\s*([\d,]+)/) || [])[1];
  const score = scoreRaw ? Number(scoreRaw.replace(",", ".")) : null;

  // Plusy = zielony prefix („Podobało się"), minusy = pozostały prefix („Nie podobało się").
  let positives = null;
  let negatives = null;
  const prefixRe = /c-review__prefix( c-review__prefix--color-green)?"[\s\S]*?sr-only">([\s\S]*?)<\/span>[\s\S]*?c-review__body[^>]*>([\s\S]*?)<\/span>/g;
  let pm;
  while ((pm = prefixRe.exec(block)) !== null) {
    const body = cleanBody(pm[3]);
    if (!body) continue;
    if (pm[1]) positives = body;
    else negatives = body;
  }

  const roomType = firstMatch(block, /c-review-block__room-link[^>]*>([\s\S]*?)<\/a>/) || null;
  const response = firstMatch(block, /c-review-block__response__body(?:\s+bui-u-hidden)?">([\s\S]*?)<\/(?:span|p|div)>/) || "";

  const text = [positives, negatives].filter(Boolean).join(" ");
  const idSeed = `${guestName}|${date.toISOString().slice(0, 10)}|${score}|${text}`;
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
    title: null,
    positives,
    negatives,
    response_text: response,
    responded_at: null,
    responded_by: null,
    added_by: "booking-live",
    added_at: new Date().toISOString(),
    booking_label: null,
  };
}

function parseBookingReviews(html, cutoff) {
  const meta = parseTotalAndScore(html);
  const blocks = html.split('itemprop="review"').slice(1);
  const reviews = [];
  for (const block of blocks) {
    const review = parseReviewBlock(block, cutoff);
    if (review) reviews.push(review);
  }
  return { reviews, meta };
}

function buildReviewsUrl(offset) {
  const pagename = process.env.BOOKING_REVIEW_PAGENAME || DEFAULT_PAGENAME;
  const cc1 = process.env.BOOKING_REVIEW_CC1 || DEFAULT_CC1;
  const url = new URL("https://www.booking.com/reviewlist.html");
  url.searchParams.set("cc1", cc1);
  url.searchParams.set("pagename", pagename);
  url.searchParams.set("type", "total");
  url.searchParams.set("rows", String(ROWS_PER_PAGE));
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("sort", "f_recent_desc");
  url.searchParams.set("r_lang", "all");
  return url.toString();
}

async function fetchBookingReviews() {
  const cutoff = sixMonthsAgo();
  const deduped = new Map();
  let officialScore = null;
  let officialTotal = null;
  let pagesRead = 0;
  let blocked = false;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const url = buildReviewsUrl(page * ROWS_PER_PAGE);
    const res = await fetch(url, {
      headers: {
        "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "pl-PL,pl;q=0.9,en-US;q=0.8,en;q=0.7",
        "x-requested-with": "XMLHttpRequest",
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

    // Brak (świeżych) opinii na stronie albo same duplikaty = koniec listy / okno 6 mies.
    if (!parsed.reviews.length) break;
    if (page > 0 && deduped.size === sizeBeforePage) break;
    const oldestOnPage = parsed.reviews.at(-1) ? new Date(parsed.reviews.at(-1).submitted_at) : null;
    if (oldestOnPage && oldestOnPage < cutoff) break;
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
