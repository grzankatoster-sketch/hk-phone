const crypto = require("crypto");

// Opinie Booking pobieramy przez Apify (aktor „voyager/booking-reviews-scraper").
// Powód: Booking wyłączył publiczny endpoint reviewlist.html (404) i renderuje
// listę JS-em z anty-botem — własny scraper przestał działać („1 na 100").
// Aktor voyager zwraca WSZYSTKIE opinie (w tym bez tekstu — samo imię + ocena),
// pełny zakres ocen 1–10, oficjalną średnią + liczbę opinii oraz oceny kategorii
// (Staff, Czystość, Lokalizacja…). Pola są czyste (daty ISO, imiona, kraje),
// więc tylko mapujemy je na nasz obiekt opinii (kształt zgodny z dawnym).
const DEFAULT_ACTOR = "voyager~booking-reviews-scraper";
const DEFAULT_HOTEL_URL = "https://www.booking.com/hotel/pl/conrad-comfort.pl.html";
// Górny limit bezpieczeństwa — realnie pobieranie zatrzymuje cutoffDate (okno czasu).
// Aktor nalicza $0.002 za opinię. 12 mies. ≈ ~780 opinii ≈ ~$1.55 (pełny backfill).
const DEFAULT_MAX_REVIEWS = 2000;
const DEFAULT_MONTHS_BACK = 12;

// Frazy „grzecznościowe" w polu plusów/minusów = brak treści (nie zaśmiecaj analizy AI).
// Uwaga: nie filtrujemy każdego „brak ..." — „brak ciepłej wody" to realna skarga.
const NOOP_TEXT = new Set([
  "brak", "brak uwag", "brak zastrzezen", "bez uwag", "bez zastrzezen",
  "nic", "nie dotyczy", "n/a", "na", "wszystko ok", "wszystko w porzadku",
  "wszystko bylo ok", "wszystko swietnie", "-", "--", "---",
  "nothing", "none", "n a", "all good", "everything was great", "everything ok",
]);

function stripDiacritics(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

// Treść plusa/minusa/tytułu. Puste i „grzecznościowe" frazy → null (brak treści).
function cleanBody(text) {
  const t = String(text || "").replace(/\s+/g, " ").trim();
  if (!t) return null;
  const norm = stripDiacritics(t).replace(/[.!]+$/, "").trim();
  if (NOOP_TEXT.has(norm)) return null;
  return t;
}

function toIso(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function mapReview(item) {
  // Pobieramy WYŁĄCZNIE opinie z oceną liczbową (1–10); resztę pomijamy.
  const score = Number.isFinite(Number(item.rating)) ? Number(item.rating) : null;
  if (score == null) return null;
  const submittedAt = toIso(item.reviewDate);
  if (!submittedAt) return null;

  // Opinie bez tekstu (samo imię + ocena) celowo ZACHOWUJEMY — positives/negatives = null.
  const positives = cleanBody(item.likedText);
  const negatives = cleanBody(item.dislikedText);

  // Stabilne ID od aktora; fallback na hash, gdyby kiedyś go zabrakło.
  const id = item.id
    ? `bcom-${item.id}`
    : `bcom-${crypto.createHash("sha1").update(`${item.userName}|${submittedAt}|${score}`).digest("hex").slice(0, 16)}`;

  return {
    id,
    platform: "booking.com",
    guest_name: String(item.userName || "").trim() || "Gość",
    country: String(item.userLocation || "").trim() || null,
    score,
    stay_date: item.checkInDate ? String(item.checkInDate).slice(0, 10) : null,
    submitted_at: submittedAt,
    room_type: item.roomInfo || null,
    title: cleanBody(item.reviewTitle),
    positives,
    negatives,
    response_text: item.propertyResponse || "",
    responded_at: null,
    responded_by: null,
    added_by: "booking-apify",
    added_at: new Date().toISOString(),
    booking_label: item.travelerType || null,
    language: item.reviewLanguage || null,
    nights: Number.isFinite(Number(item.numberOfNights)) ? Number(item.numberOfNights) : null,
  };
}

async function runApifyActor({ token, actor, hotelUrl, maxReviews, monthsBack }) {
  const url = `https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      startUrls: [{ url: hotelUrl }],
      maxReviewsPerHotel: maxReviews,
      sortReviewsBy: "f_recent_desc",
      reviewScores: ["ALL"],
      // Okno czasu — aktor zatrzymuje pobieranie na pierwszej starszej opinii.
      cutoffDate: `${monthsBack} months`,
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Apify zwrocil HTTP ${res.status}${detail ? `: ${detail.slice(0, 200)}` : ""}`);
  }
  const data = await res.json();
  if (!Array.isArray(data)) throw new Error("Apify zwrocil nieoczekiwany format (brak tablicy opinii).");
  return data;
}

// Agregaty są zdenormalizowane na każdym rekordzie — bierzemy z pierwszego.
function extractMeta(items) {
  const first = items.find(x => x && (x.hotelRating != null || x.hotelReviews != null)) || {};
  const categories = Array.isArray(first.hotelRatingScores)
    ? first.hotelRatingScores.map(c => ({ name: c.name, score: Math.round(Number(c.score) * 100) / 100 }))
    : [];
  return {
    officialScore: Number.isFinite(Number(first.hotelRating)) ? Number(first.hotelRating) : null,
    officialTotal: Number.isFinite(Number(first.hotelReviews)) ? Number(first.hotelReviews) : null,
    categoryScores: categories,
  };
}

async function fetchBookingReviews() {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    return {
      ok: false,
      reviews: [],
      officialScore: null,
      officialTotal: null,
      categoryScores: [],
      pagesRead: 0,
      error: "Brak APIFY_TOKEN w .env — opinie Booking nie zostana pobrane.",
    };
  }

  const actor = process.env.APIFY_REVIEWS_ACTOR || DEFAULT_ACTOR;
  const hotelUrl = process.env.BOOKING_HOTEL_URL || DEFAULT_HOTEL_URL;
  const maxReviews = Number(process.env.BOOKING_MAX_REVIEWS) || DEFAULT_MAX_REVIEWS;
  const monthsBack = Number(process.env.BOOKING_MONTHS_BACK) || DEFAULT_MONTHS_BACK;

  const items = await runApifyActor({ token, actor, hotelUrl, maxReviews, monthsBack });
  const meta = extractMeta(items);

  const deduped = new Map();
  for (const item of items) {
    const review = mapReview(item);
    if (review) deduped.set(review.id, review);
  }

  return {
    ok: true,
    reviews: [...deduped.values()].sort((a, b) => new Date(b.submitted_at) - new Date(a.submitted_at)),
    officialScore: meta.officialScore,
    officialTotal: meta.officialTotal,
    categoryScores: meta.categoryScores,
    pagesRead: 1,
    source: "apify",
    rawCount: items.length,
    monthsBack,
    fetchedAt: new Date().toISOString(),
  };
}

module.exports = { fetchBookingReviews };
