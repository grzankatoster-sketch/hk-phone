import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, Check, RotateCcw } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { TENANT_ID } from "../../lib/constants";
import { fmtMoney } from "../../lib/format";
import { todayKey } from "../../lib/dates";
import { loadJson, saveJson, STORAGE_KEYS } from "../../lib/storage";
import { CATEGORIES, DEFAULT_CONFIG } from "../../lib/pricing-calibration";
import { yieldPrice } from "../../lib/pricing";
import { holidayFactor } from "../../lib/holidays";
import { fetchWeather, weatherEmoji } from "../../lib/weather";
import { loadManualEvents, setManualEvent, fetchTicketmasterEvents, mergeEvents } from "../../lib/events";

const HORIZON = 14;
const DOW = ["nd", "pn", "wt", "śr", "cz", "pt", "sb"];
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// Pulpit cen (WYKONANIE 4.20–4.23) — yield last-minute: sufit (kotwica × święto × impreza)
// → zaniżanie bliżej terminu wg obłożenia; pogoda = mała korekta; konkurencja = ręczne
// odniesienie (legalnie, bez scrapingu). Aktualną cenę czytamy z YieldPlanet (tylko odczyt);
// zmianę wpisujesz na YP ręcznie — nic nie wysyłamy.
export default function PricingPanel({ showToast }) {
  const today = todayKey();
  const [cat, setCat] = React.useState(CATEGORIES[0]);
  const [config, setConfig] = React.useState(() => ({ ...DEFAULT_CONFIG, ...loadJson(STORAGE_KEYS.pricingConfig, {}) }));
  const [daily, setDaily] = React.useState({});          // { date: { occupancy, current, competitor, approved } }
  const [weather, setWeather] = React.useState({});      // { date: { code, factor, label } }
  const [autoEvents, setAutoEvents] = React.useState({});// { date: { boost, label } } z Ticketmaster
  const [manualEvents, setManualEvents] = React.useState(() => loadManualEvents());
  const [loading, setLoading] = React.useState(false);

  const cfg = config[cat] || DEFAULT_CONFIG[cat];
  const dates = React.useMemo(() => Array.from({ length: HORIZON }, (_, i) => addDays(today, i)), [today]);
  const events = React.useMemo(() => mergeEvents(autoEvents, manualEvents), [autoEvents, manualEvents]);

  const setCfg = (field, val) => {
    const next = { ...config, [cat]: { ...cfg, [field]: val } };
    setConfig(next); saveJson(STORAGE_KEYS.pricingConfig, next);
  };

  // Sygnały zewnętrzne: pogoda (Open-Meteo, bez klucza) + wydarzenia (Ticketmaster przez Edge).
  React.useEffect(() => {
    let alive = true;
    fetchWeather({ days: HORIZON }).then((w) => alive && setWeather(w)).catch(() => {});
    fetchTicketmasterEvents({ from: dates[0], to: dates[dates.length - 1] }).then((e) => alive && setAutoEvents(e)).catch(() => {});
    return () => { alive = false; };
  }, [dates]);

  const load = React.useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data } = await supabase.from("own_rates").select("stay_date,occupancy,current_price,competitor_price,approved_price")
        .eq("tenant_id", TENANT_ID).eq("room_type", cat).gte("stay_date", dates[0]).lte("stay_date", dates[dates.length - 1]);
      const map = {};
      (data || []).forEach((r) => { map[r.stay_date] = { occupancy: r.occupancy, current: r.current_price, competitor: r.competitor_price, approved: r.approved_price }; });
      setDaily(map);
    } catch { setDaily({}); } finally { setLoading(false); }
  }, [cat, dates]);
  React.useEffect(() => { load(); }, [load]);

  const propose = React.useCallback((category, date, occupancy = null) => {
    const cc = config[category] || DEFAULT_CONFIG[category];
    return yieldPrice({
      category, stayDate: date, today, occupancy,
      minPrice: Number(cc.min) || null, maxPrice: Number(cc.max) || null, avgLeadDays: Number(cc.avgLeadDays) || 1,
      eventBoost: events[date]?.boost ?? null, weatherFactor: weather[date]?.factor ?? null,
    });
  }, [config, events, weather, today]);

  const setDay = (date, field, val) => setDaily((d) => ({ ...d, [date]: { ...d[date], [field]: val } }));
  const onManualEvent = (date, pct) => {
    const boost = pct === "" ? 0 : 1 + (Math.max(0, parseInt(pct, 10) || 0) / 100);
    setManualEvents(setManualEvent(date, boost, "ręczne"));
  };

  const save = async (date, approvedPrice) => {
    if (!supabase) { showToast?.("Brak połączenia z bazą.", "error"); return; }
    const row = {
      tenant_id: TENANT_ID, stay_date: date, room_type: cat,
      occupancy: daily[date]?.occupancy ?? null, current_price: daily[date]?.current ?? null,
      competitor_price: daily[date]?.competitor ?? null,
      suggested_price: propose(cat, date, daily[date]?.occupancy ?? null)?.price ?? null,
      approved_price: approvedPrice, status: "approved", source: "manual", updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("own_rates").upsert(row, { onConflict: "tenant_id,stay_date,room_type" });
    if (error) { showToast?.("Błąd: " + error.message, "error"); return; }
    setDay(date, "approved", approvedPrice);
    showToast?.(`Zapisano ${fmtMoney(approvedPrice)} zł na ${date} — wpisz tę cenę na YieldPlanet.`, "success");
  };

  const inp = { padding: "3px 6px", borderRadius: 6, border: "1px solid var(--dark-border)", background: "var(--bg-input)", color: "var(--dark-text)", fontSize: 12.5 };

  return (
    <motion.div key="ceny" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="stack">
      <div className="panel glass dark-panel">
        <div className="panel-title"><TrendingUp size={16} /> Przegląd tygodnia — ceny wywoławcze</div>
        <div className="tiny muted-light" style={{ marginTop: -6, marginBottom: 10 }}>Ceny startowe (sufit) na 7 dni, wszystkie kategorie. ★ = święto / impreza. Szczegóły i zaniżanie — niżej.</div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, color: "var(--dark-text)" }}>
            <thead>
              <tr style={{ color: "var(--dark-text-muted)", fontSize: 11 }}>
                <th style={{ padding: "6px 8px", textAlign: "left" }}>Kategoria</th>
                {dates.slice(0, 7).map((d) => (
                  <th key={d} style={{ padding: "6px 8px", textAlign: "right", whiteSpace: "nowrap" }}>
                    {DOW[new Date(d + "T12:00:00").getDay()]} {d.slice(8, 10)}.{d.slice(5, 7)}
                    {(holidayFactor(d).label || events[d]) && <span style={{ color: "#f59e0b" }}> ★</span>}
                    <span style={{ marginLeft: 3 }}>{weatherEmoji(weather[d]?.code)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {CATEGORIES.map((c) => (
                <tr key={c} style={{ borderTop: "1px solid var(--dark-border)" }}>
                  <td style={{ padding: "6px 8px", fontWeight: 700, whiteSpace: "nowrap" }}>{c}</td>
                  {dates.slice(0, 7).map((d) => {
                    const r = propose(c, d);
                    return <td key={d} style={{ padding: "6px 8px", textAlign: "right", cursor: "pointer" }} onClick={() => setCat(c)}>{r ? fmtMoney(r.price) : "—"}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="panel glass dark-panel">
        <div className="panel-title"><TrendingUp size={16} /> Ceny — pulpit</div>
        <div className="tiny muted-light" style={{ marginTop: -6, marginBottom: 12 }}>
          Sufit → zaniżanie bliżej terminu, gdy pokoje stoją. Widełki twarde. Pogoda z Open-Meteo, imprezy z Ticketmaster + ręczne.
          Konkurencja = odniesienie (ręcznie, bez scrapingu). Aktualną cenę czytamy z YieldPlanet (odczyt) — zmianę wpisujesz na YP.
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCat(c)} className="btn btn-outline-dark"
              style={{ fontSize: 12, padding: "5px 12px", ...(c === cat ? { background: "var(--dark-accent,#2d8a70)", color: "#fff", borderColor: "transparent" } : {}) }}>{c}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <label className="tiny muted-light" style={{ display: "flex", gap: 6, alignItems: "center" }}>MIN <input style={{ ...inp, width: 64 }} value={cfg.min} onChange={(e) => setCfg("min", e.target.value)} /></label>
          <label className="tiny muted-light" style={{ display: "flex", gap: 6, alignItems: "center" }}>MAX (sufit) <input style={{ ...inp, width: 64 }} value={cfg.max} onChange={(e) => setCfg("max", e.target.value)} /></label>
          <label className="tiny muted-light" style={{ display: "flex", gap: 6, alignItems: "center" }}>Goście rezerwują ~<input style={{ ...inp, width: 44 }} value={cfg.avgLeadDays} onChange={(e) => setCfg("avgLeadDays", e.target.value)} /> dni przed</label>
        </div>
      </div>

      <div className="panel glass dark-panel">
        <div className="panel-title">{cat} — najbliższe {HORIZON} dni</div>
        {loading ? <div className="tiny muted-light">Wczytywanie…</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, color: "var(--dark-text)" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--dark-text-muted)", fontSize: 11 }}>
                  {["Data", "Pog.", "Sufit", "Proponowana", "Obł.%", "Event%", "Konk.", "Aktualna (YP)", ""].map((h) => <th key={h} style={{ padding: "6px 8px" }}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {dates.map((date) => {
                  const p = propose(cat, date, daily[date]?.occupancy ?? null);
                  const hol = holidayFactor(date), ev = events[date], w = weather[date];
                  const d = new Date(date + "T12:00:00"), rec = daily[date] || {};
                  const proposed = p?.price ?? null;
                  const evPct = manualEvents[date] ? Math.round((manualEvents[date].boost - 1) * 100) : "";
                  return (
                    <tr key={date} style={{ borderTop: "1px solid var(--dark-border)" }}>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        {DOW[d.getDay()]} {date.slice(8, 10)}.{date.slice(5, 7)}
                        {(hol.label || ev) && <span style={{ marginLeft: 5, fontSize: 9, color: "#f59e0b" }} title={hol.label || ev?.label || "wydarzenie"}>★</span>}
                        {rec.approved != null && <Check size={11} style={{ marginLeft: 5, color: "#34d399" }} />}
                      </td>
                      <td style={{ padding: "6px 8px" }} title={w ? `${w.label}${w.tmax != null ? ` ${Math.round(w.tmax)}°` : ""}` : ""}>{weatherEmoji(w?.code)}</td>
                      <td style={{ padding: "6px 8px", color: "var(--dark-text-muted)" }}>{p ? fmtMoney(p.ceil) : "—"}</td>
                      <td style={{ padding: "6px 8px", fontWeight: 800 }}>
                        {proposed != null ? `${fmtMoney(proposed)} zł` : "—"}
                        {p && p.discount > 0 && <span style={{ marginLeft: 5, fontSize: 10, color: "#f87171" }}>−{Math.round(p.discount * 100)}%</span>}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <input style={{ ...inp, width: 48 }} placeholder="%" value={rec.occupancy != null ? Math.round(rec.occupancy * 100) : ""}
                          onChange={(e) => setDay(date, "occupancy", e.target.value === "" ? null : Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) / 100)} />
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <input style={{ ...inp, width: 48 }} placeholder={ev && !manualEvents[date] ? `+${Math.round((ev.boost - 1) * 100)}` : "%"} value={evPct}
                          onChange={(e) => onManualEvent(date, e.target.value)} title={ev?.label || "podbicie za wydarzenie"} />
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <input style={{ ...inp, width: 60 }} placeholder="—" value={rec.competitor ?? ""}
                          onChange={(e) => setDay(date, "competitor", e.target.value === "" ? null : parseFloat(e.target.value))} />
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <input style={{ ...inp, width: 64 }} placeholder="—" value={rec.current ?? ""}
                          onChange={(e) => setDay(date, "current", e.target.value === "" ? null : parseFloat(e.target.value))} />
                      </td>
                      <td style={{ padding: "6px 8px", display: "flex", gap: 5 }}>
                        <button onClick={() => save(date, proposed)} disabled={proposed == null} className="btn btn-emerald" style={{ fontSize: 11, padding: "3px 8px" }}>Zmień</button>
                        {rec.current != null && <button onClick={() => save(date, rec.current)} className="btn btn-outline-dark" style={{ fontSize: 11, padding: "3px 8px" }} title="Zostaw aktualną"><RotateCcw size={12} /></button>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
}
