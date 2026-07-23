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

const HORIZON = 14;
const DOW = ["nd", "pn", "wt", "śr", "cz", "pt", "sb"];
const addDays = (iso, n) => { const d = new Date(iso + "T12:00:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };

// Pulpit cen (WYKONANIE 4.20) — model yield last-minute: sufit (cena wywoławcza z kalibracji)
// → zaniżanie bliżej terminu wg obłożenia. Kierownik ustawia MIN/MAX + typowy lead-time,
// widzi propozycję per dzień i zapisuje (Zmień) lub zostawia aktualną. BEZ wysyłania na YP —
// aktualną cenę pobieramy z YieldPlanet TYLKO do odczytu; zmianę wpisujesz na YP ręcznie.
export default function PricingPanel({ showToast }) {
  const today = todayKey();
  const [cat, setCat] = React.useState(CATEGORIES[0]);
  const [config, setConfig] = React.useState(() => ({ ...DEFAULT_CONFIG, ...loadJson(STORAGE_KEYS.pricingConfig, {}) }));
  const [daily, setDaily] = React.useState({});   // { "YYYY-MM-DD": { occupancy, current, approved } }
  const [loading, setLoading] = React.useState(false);

  const cfg = config[cat] || DEFAULT_CONFIG[cat];
  const dates = React.useMemo(() => Array.from({ length: HORIZON }, (_, i) => addDays(today, i)), [today]);

  const setCfg = (field, val) => {
    const next = { ...config, [cat]: { ...cfg, [field]: val } };
    setConfig(next); saveJson(STORAGE_KEYS.pricingConfig, next);
  };

  const load = React.useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data } = await supabase.from("own_rates").select("stay_date,occupancy,current_price,approved_price")
        .eq("tenant_id", TENANT_ID).eq("room_type", cat).gte("stay_date", dates[0]).lte("stay_date", dates[dates.length - 1]);
      const map = {};
      (data || []).forEach((r) => { map[r.stay_date] = { occupancy: r.occupancy, current: r.current_price, approved: r.approved_price }; });
      setDaily(map);
    } catch { setDaily({}); } finally { setLoading(false); }
  }, [cat, dates]);
  React.useEffect(() => { load(); }, [load]);

  const propose = (date) => yieldPrice({
    category: cat, stayDate: date, today,
    occupancy: daily[date]?.occupancy ?? null,
    minPrice: Number(cfg.min) || null, maxPrice: Number(cfg.max) || null,
    avgLeadDays: Number(cfg.avgLeadDays) || 1,
  });

  const setDay = (date, field, val) => setDaily((d) => ({ ...d, [date]: { ...d[date], [field]: val } }));

  const save = async (date, approvedPrice) => {
    if (!supabase) { showToast?.("Brak połączenia z bazą.", "error"); return; }
    const row = {
      tenant_id: TENANT_ID, stay_date: date, room_type: cat,
      occupancy: daily[date]?.occupancy ?? null,
      current_price: daily[date]?.current ?? null,
      suggested_price: propose(date)?.price ?? null,
      approved_price: approvedPrice, status: "approved",
      source: "manual", updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("own_rates").upsert(row, { onConflict: "tenant_id,stay_date,room_type" });
    if (error) { showToast?.("Błąd: " + error.message, "error"); return; }
    setDay(date, "approved", approvedPrice);
    showToast?.(`Zapisano ${fmtMoney(approvedPrice)} zł na ${date} — wpisz tę cenę na YieldPlanet.`, "success");
  };

  const input = { width: 64, padding: "3px 6px", borderRadius: 6, border: "1px solid var(--dark-border)", background: "var(--bg-input)", color: "var(--dark-text)", fontSize: 12.5 };

  return (
    <motion.div key="ceny" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="stack">
      <div className="panel glass dark-panel">
        <div className="panel-title"><TrendingUp size={16} /> Ceny — pulpit</div>
        <div className="tiny muted-light" style={{ marginTop: -6, marginBottom: 12 }}>
          Model: start od ceny wywoławczej (sufit), zaniżanie bliżej terminu, gdy pokoje stoją. Widełki twarde —
          cena nigdy poza nie wyjdzie. Aktualną cenę czytamy z YieldPlanet (tylko odczyt); zmianę wpisujesz na YP ręcznie.
        </div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
          {CATEGORIES.map((c) => (
            <button key={c} onClick={() => setCat(c)} className="btn btn-outline-dark"
              style={{ fontSize: 12, padding: "5px 12px", ...(c === cat ? { background: "var(--dark-accent,#2d8a70)", color: "#fff", borderColor: "transparent" } : {}) }}>{c}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center" }}>
          <label className="tiny muted-light" style={{ display: "flex", gap: 6, alignItems: "center" }}>MIN <input style={input} value={cfg.min} onChange={(e) => setCfg("min", e.target.value)} /></label>
          <label className="tiny muted-light" style={{ display: "flex", gap: 6, alignItems: "center" }}>MAX (sufit) <input style={input} value={cfg.max} onChange={(e) => setCfg("max", e.target.value)} /></label>
          <label className="tiny muted-light" style={{ display: "flex", gap: 6, alignItems: "center" }}>Goście rezerwują ~<input style={{ ...input, width: 44 }} value={cfg.avgLeadDays} onChange={(e) => setCfg("avgLeadDays", e.target.value)} /> dni przed</label>
        </div>
      </div>

      <div className="panel glass dark-panel">
        <div className="panel-title">{cat} — najbliższe {HORIZON} dni</div>
        {loading ? <div className="tiny muted-light">Wczytywanie…</div> : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5, color: "var(--dark-text)" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "var(--dark-text-muted)", fontSize: 11 }}>
                  <th style={{ padding: "6px 8px" }}>Data</th>
                  <th style={{ padding: "6px 8px" }}>Sufit</th>
                  <th style={{ padding: "6px 8px" }}>Proponowana</th>
                  <th style={{ padding: "6px 8px" }}>Obłożenie</th>
                  <th style={{ padding: "6px 8px" }}>Aktualna (YP)</th>
                  <th style={{ padding: "6px 8px" }}></th>
                </tr>
              </thead>
              <tbody>
                {dates.map((date) => {
                  const p = propose(date);
                  const hol = holidayFactor(date);
                  const d = new Date(date + "T12:00:00");
                  const rec = daily[date] || {};
                  const proposed = p?.price ?? null;
                  return (
                    <tr key={date} style={{ borderTop: "1px solid var(--dark-border)" }}>
                      <td style={{ padding: "6px 8px", whiteSpace: "nowrap" }}>
                        {DOW[d.getDay()]} {date.slice(8, 10)}.{date.slice(5, 7)}
                        {hol.label && <span style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: "#f59e0b" }} title={hol.label}>★</span>}
                        {rec.approved != null && <Check size={11} style={{ marginLeft: 5, color: "#34d399" }} />}
                      </td>
                      <td style={{ padding: "6px 8px", color: "var(--dark-text-muted)" }}>{p ? `${fmtMoney(p.ceil)}` : "—"}</td>
                      <td style={{ padding: "6px 8px", fontWeight: 800 }}>
                        {proposed != null ? `${fmtMoney(proposed)} zł` : "—"}
                        {p && p.discount > 0 && <span style={{ marginLeft: 5, fontSize: 10, color: "#f87171" }}>−{Math.round(p.discount * 100)}%</span>}
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <input style={{ ...input, width: 52 }} placeholder="%" value={rec.occupancy != null ? Math.round(rec.occupancy * 100) : ""}
                          onChange={(e) => setDay(date, "occupancy", e.target.value === "" ? null : Math.max(0, Math.min(100, parseInt(e.target.value, 10) || 0)) / 100)} />
                      </td>
                      <td style={{ padding: "6px 8px" }}>
                        <input style={input} placeholder="—" value={rec.current ?? ""}
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
