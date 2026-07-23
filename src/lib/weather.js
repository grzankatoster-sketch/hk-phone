// Sygnał pogodowy dla silnika cen (WYKONANIE 4.22). Model hotelu = last-minute, więc
// pogoda na dziś/jutro realnie rusza popyt: burza/deszcz → lekko w dół, ciepło+słońce → lekko
// w górę. WAGA MAŁA (±2–4%) — to korektor, nie fundament.
//
// Źródło: Open-Meteo — darmowe, bez klucza. LICENCJA (LEG): darmowe tylko NIEKOMERCYJNIE
// (CC BY 4.0). Do własnego użytku hotelu OK; przy sprzedaży SaaS innym hotelom przejść na
// komercyjny plan Open-Meteo albo dostawcę z licencją komercyjną (OpenWeatherMap). Zmiana
// dostawcy = tylko ten plik.

export const KRAKOW = { lat: 50.0647, lon: 19.9450 };

function describe(code, tmax, precip) {
  const storm = code >= 95, snow = code >= 71 && code <= 77, rain = code >= 51 && code <= 82;
  let factor = 1, label = "pogodnie";
  if (storm) { factor = 0.96; label = "burza"; }
  else if (snow) { factor = 0.97; label = "śnieg"; }
  else if (rain || (precip != null && precip >= 60)) { factor = 0.98; label = "deszcz"; }
  else if (code === 0 && tmax != null && tmax >= 22) { factor = 1.02; label = "słonecznie"; }
  return { factor: Math.round(factor * 100) / 100, label };
}

export const weatherEmoji = (code) =>
  code == null ? "" : code >= 95 ? "⛈️" : code >= 71 && code <= 77 ? "❄️" : code >= 51 && code <= 82 ? "🌧️" : code >= 45 ? "🌫️" : code >= 1 ? "⛅" : "☀️";

// Zwraca { "YYYY-MM-DD": { code, tmax, precip, factor, label } } na najbliższe dni (max 16).
export async function fetchWeather({ lat = KRAKOW.lat, lon = KRAKOW.lon, days = 14 } = {}) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=weather_code,temperature_2m_max,precipitation_probability_max&timezone=Europe%2FWarsaw&forecast_days=${Math.min(16, days)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error("weather_unreachable");
  const d = (await res.json())?.daily || {};
  const out = {};
  (d.time || []).forEach((date, i) => {
    const code = d.weather_code?.[i] ?? null, tmax = d.temperature_2m_max?.[i] ?? null, precip = d.precipitation_probability_max?.[i] ?? null;
    out[date] = { code, tmax, precip, ...describe(code, tmax, precip) };
  });
  return out;
}
