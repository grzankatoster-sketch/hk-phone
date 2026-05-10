// ─── electron/kwhotel.cjs ─────────────────────────────────────────────────────
// Klient KWHotel Cloud — logowanie przez formularz HTML (jak przeglądarka)
// Dane logowania NIGDY nie trafiają do kodu — tylko localStorage na komputerze
// ─────────────────────────────────────────────────────────────────────────────

const https = require("https");
const http  = require("http");

const BASE = "https://cloud.kwhotel.com";

// ─── Sesja ────────────────────────────────────────────────────────────────────
let _cookies = {}; // klucz → wartość

function cookieHeader() {
  return Object.entries(_cookies).map(([k,v])=>`${k}=${v}`).join("; ");
}

function parseCookies(headers) {
  const raw = headers["set-cookie"];
  if (!raw) return;
  const list = Array.isArray(raw) ? raw : [raw];
  list.forEach(c => {
    const part = c.split(";")[0].trim();
    const eq   = part.indexOf("=");
    if (eq > 0) _cookies[part.slice(0, eq).trim()] = part.slice(eq+1).trim();
  });
}

// ─── HTTP fetch z obsługą przekierowań ───────────────────────────────────────
function nodeFetch(url, options = {}, _redirects = 0) {
  return new Promise((resolve, reject) => {
    if (_redirects > 8) return reject(new Error("Too many redirects"));
    let parsed;
    try { parsed = new URL(url); } catch(e) { return reject(e); }

    const lib = parsed.protocol === "https:" ? https : http;
    const headers = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept":     "text/html,application/xhtml+xml,application/json,*/*",
      ...options.headers,
    };
    if (_cookies && Object.keys(_cookies).length) {
      headers["Cookie"] = cookieHeader();
    }

    const reqOpts = {
      hostname: parsed.hostname,
      port:     parsed.port || (parsed.protocol === "https:" ? 443 : 80),
      path:     parsed.pathname + parsed.search,
      method:   options.method || "GET",
      headers,
    };

    const req = lib.request(reqOpts, (res) => {
      parseCookies(res.headers);

      // Obsłuż przekierowania
      if ([301, 302, 303, 307, 308].includes(res.statusCode)) {
        let loc = res.headers["location"];
        if (!loc) { resolve({ status: res.statusCode, headers: res.headers, body: "" }); return; }
        if (!loc.startsWith("http")) loc = `${parsed.protocol}//${parsed.hostname}${loc}`;
        // Po POST 302 → GET
        const nextMethod = (res.statusCode === 307 || res.statusCode === 308) ? (options.method||"GET") : "GET";
        return nodeFetch(loc, { ...options, method: nextMethod, headers: options.headers, body: undefined }, _redirects + 1)
          .then(resolve).catch(reject);
      }

      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => resolve({
        status:  res.statusCode,
        headers: res.headers,
        body:    data,
        ok:      res.statusCode >= 200 && res.statusCode < 300,
        url,
      }));
    });
    req.on("error", reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

// ─── Wyciągnij wartość tagu <input name="X"> z HTML ──────────────────────────
function extractInputValue(html, name) {
  const re = new RegExp(`<input[^>]+name=["']?${name}["']?[^>]+value=["']([^"']*)["']`, "i");
  const re2= new RegExp(`<input[^>]+value=["']([^"']*)[" '][^>]+name=["']?${name}["']?`, "i");
  const m  = html.match(re) || html.match(re2);
  return m ? m[1] : null;
}

// ─── Wyciągnij action formularza logowania ───────────────────────────────────
function extractFormAction(html, base) {
  const m = html.match(/<form[^>]+action=["']([^"']+)["'][^>]*>/i)
         || html.match(/<form[^>]*>/i);
  if (!m || !m[1]) return `${base}/login`;
  const action = m[1];
  if (action.startsWith("http")) return action;
  return `${base}${action.startsWith("/") ? "" : "/"}${action}`;
}

// ─── Możliwe strony logowania ─────────────────────────────────────────────────
const LOGIN_PAGES = [
  `${BASE}/login`,
  `${BASE}/auth/login`,
  `${BASE}/user/login`,
  `${BASE}/account/login`,
  `${BASE}/`,
];

// ─── Główna funkcja logowania ─────────────────────────────────────────────────
async function login(username, password) {
  _cookies = {}; // reset sesji
  const attempts = [];

  for (const loginPage of LOGIN_PAGES) {
    try {
      // Krok 1: pobierz stronę logowania (zdobądź CSRF + ciasteczka sesji)
      const getResp = await nodeFetch(loginPage, { method: "GET" });

      if (!getResp.ok && getResp.status !== 200) {
        attempts.push({ url: loginPage, step: "GET", status: getResp.status, body: getResp.body.slice(0,200) });
        continue;
      }

      const html = getResp.body;

      // Wyciągnij token CSRF (różne nazwy)
      const csrf =
        extractInputValue(html, "_token")    ||
        extractInputValue(html, "csrf_token") ||
        extractInputValue(html, "_csrf")      ||
        extractInputValue(html, "csrfmiddlewaretoken") ||
        extractInputValue(html, "authenticity_token");

      // Wyciągnij action formularza
      const action = extractFormAction(html, BASE);

      // Buduj ciało POST — próbuj różne nazwy pól
      const fieldSets = [
        { username, password, ...(csrf ? { _token: csrf } : {}) },
        { email: username, password, ...(csrf ? { _token: csrf } : {}) },
        { login: username, password, ...(csrf ? { _token: csrf } : {}) },
        { user: username, password, ...(csrf ? { _token: csrf } : {}) },
      ];

      for (const fields of fieldSets) {
        const body = Object.entries(fields)
          .map(([k,v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v||"")}`)
          .join("&");

        const postResp = await nodeFetch(action, {
          method: "POST",
          headers: {
            "Content-Type":   "application/x-www-form-urlencoded",
            "Content-Length": Buffer.byteLength(body).toString(),
            "Referer":        loginPage,
            "Origin":         BASE,
          },
          body,
        });

        attempts.push({
          url:    action,
          fields: Object.keys(fields).filter(k=>k!=="password").join(","),
          status: postResp.status,
          ok:     postResp.ok,
          body:   postResp.body.slice(0, 300),
          finalUrl: postResp.url,
          csrf: !!csrf,
        });

        // Sukces — zalogowany jeśli przekierował na coś innego niż login
        const finalUrl = postResp.url || "";
        const isLoggedIn = postResp.ok && !finalUrl.includes("login");
        if (isLoggedIn) {
          return {
            ok:       true,
            endpoint: action,
            fields:   Object.keys(fields).filter(k=>k!=="password").join(","),
            csrf:     !!csrf,
            cookies:  {..._cookies},
            attempts,
          };
        }
        // Próbuj dalej z innym zestawem pól
      }
    } catch(e) {
      attempts.push({ url: loginPage, error: e.message });
    }
  }

  // Jeśli żadna strona formularza nie zadziałała — spróbuj jeszcze JSON REST API
  const restAttempts = await tryRestLogin(username, password);
  attempts.push(...restAttempts.attempts);
  if (restAttempts.ok) return restAttempts;

  return {
    ok:       false,
    step:     "login",
    attempts,
    hint:     "Nie udało się zalogować przez formularz ani REST API. Sprawdź odpowiedź serwera poniżej.",
  };
}

// ─── Próba REST API jako fallback ─────────────────────────────────────────────
async function tryRestLogin(username, password) {
  const endpoints = [
    `${BASE}/api/v1/auth/login`,
    `${BASE}/api/v1/login`,
    `${BASE}/api/auth/login`,
  ];
  const attempts = [];
  for (const url of endpoints) {
    for (const body of [
      JSON.stringify({ username, password }),
      JSON.stringify({ email: username, password }),
    ]) {
      try {
        const r = await nodeFetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(body).toString() },
          body,
        });
        const json = tryParse(r.body);
        const token = json?.token||json?.access_token||json?.accessToken||json?.data?.token;
        attempts.push({ url, status: r.status, ok: r.ok, token: !!token, body: r.body.slice(0,300) });
        if (r.ok && token) {
          _cookies["_api_token"] = token; // przechowaj jako pseudo-cookie
          return { ok: true, endpoint: url, token, attempts };
        }
      } catch(e) {
        attempts.push({ url, error: e.message });
      }
    }
  }
  return { ok: false, attempts };
}

// ─── Zapytanie z sesją ────────────────────────────────────────────────────────
async function authFetch(path, opts = {}) {
  return nodeFetch(`${BASE}${path}`, opts);
}

// ─── Pobierz przyjazdy ────────────────────────────────────────────────────────
async function getArrivals(date) {
  // Próbuj REST API
  const endpoints = [
    `/api/v1/reservations/arrivals?date=${date}`,
    `/api/v1/arrivals?date=${date}`,
    `/api/v1/reservations?checkIn=${date}`,
    `/api/v1/reservations?arrival_date=${date}`,
  ];
  for (const ep of endpoints) {
    const r = await authFetch(ep);
    if (r.ok) return { ok: true, endpoint: ep, data: tryParse(r.body), raw: r.body.slice(0, 2000) };
  }
  // Spróbuj scrape strony HTML
  const scrape = await scrapeHtmlPage(`/arrivals?date=${date}`, "arrival");
  if (scrape) return scrape;

  const r = await authFetch(endpoints[0]);
  return { ok: false, endpoint: endpoints[0], status: r.status, raw: r.body.slice(0, 1000) };
}

// ─── Pobierz wyjazdy ──────────────────────────────────────────────────────────
async function getDepartures(date) {
  const endpoints = [
    `/api/v1/reservations/departures?date=${date}`,
    `/api/v1/departures?date=${date}`,
    `/api/v1/reservations?checkOut=${date}`,
    `/api/v1/reservations?departure_date=${date}`,
  ];
  for (const ep of endpoints) {
    const r = await authFetch(ep);
    if (r.ok) return { ok: true, endpoint: ep, data: tryParse(r.body), raw: r.body.slice(0, 2000) };
  }
  const scrape = await scrapeHtmlPage(`/departures?date=${date}`, "departure");
  if (scrape) return scrape;

  const r = await authFetch(endpoints[0]);
  return { ok: false, endpoint: endpoints[0], status: r.status, raw: r.body.slice(0, 1000) };
}

// ─── Status pokoi ─────────────────────────────────────────────────────────────
async function getRoomStatus(date) {
  const endpoints = [
    `/api/v1/rooms/status?date=${date}`,
    `/api/v1/housekeeping?date=${date}`,
    `/api/v1/rooms?date=${date}`,
  ];
  for (const ep of endpoints) {
    const r = await authFetch(ep);
    if (r.ok) return { ok: true, endpoint: ep, data: tryParse(r.body), raw: r.body.slice(0, 2000) };
  }
  const r = await authFetch(endpoints[0]);
  return { ok: false, endpoint: endpoints[0], status: r.status, raw: r.body.slice(0, 1000) };
}

// ─── Scrape strony HTML po zalogowaniu ───────────────────────────────────────
async function scrapeHtmlPage(path, type) {
  try {
    const r = await authFetch(path);
    if (!r.ok) return null;
    // Jeśli dostaliśmy JSON — zwróć normalnie
    const json = tryParse(r.body);
    if (json) return { ok: true, endpoint: path, data: json, raw: r.body.slice(0, 2000) };
    // HTML — zwróć surowy do diagnostyki
    return { ok: true, endpoint: path, data: null, raw: r.body.slice(0, 2000), isHtml: true };
  } catch { return null; }
}

// ─── Test połączenia ──────────────────────────────────────────────────────────
async function testConnection(username, password) {
  const loginResult = await login(username, password);
  if (!loginResult.ok) return { ok: false, step: "login", loginResult };

  const probes = [
    "/api/v1/rooms",
    "/api/v1/reservations",
    "/api/v1/hotel",
    "/api/v1/me",
    "/dashboard",
    "/reservations",
  ];
  const results = [];
  for (const p of probes) {
    const r = await authFetch(p);
    results.push({
      path:    p,
      status:  r.status,
      ok:      r.ok,
      isJson:  !!tryParse(r.body),
      snippet: r.body.slice(0, 300),
    });
  }
  return { ok: true, loginResult, probes: results };
}

function tryParse(str) {
  try { return JSON.parse(str); } catch { return null; }
}

module.exports = { login, getArrivals, getDepartures, getRoomStatus, testConnection };
