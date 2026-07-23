import React from "react";
import { motion } from "framer-motion";
import { TrendingUp, Check, X, Save } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { TENANT_ID } from "../../lib/constants";
import { fmtMoney } from "../../lib/format";
import { todayKey } from "../../lib/dates";
import { generatePriceSuggestion, llmReady } from "../../lib/llm";

// Propozycje cen (WYKONANIE 4.20) — wariant manual-first: kierownik podaje cenę
// bazową + obłożenie, silnik (lib/pricing.js) proponuje, on zatwierdza/edytuje/odrzuca.
// Zapis do own_rates (0055). Źródła danych (YieldPlanet/KWHotel/Booking, trend miasta,
// imprezy) zautomatyzują WEJŚCIA później — silnik i UI zostają te same.
export default function PricingPanel({ showToast }) {
  const [date, setDate] = React.useState(todayKey());
  const [roomType, setRoomType] = React.useState("");
  const [base, setBase] = React.useState("");
  const [occ, setOcc] = React.useState("");
  const [preview, setPreview] = React.useState(null);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [calcLoading, setCalcLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!supabase) return;
    setLoading(true);
    try {
      const { data } = await supabase.from("own_rates").select("*").eq("tenant_id", TENANT_ID).eq("stay_date", date).order("room_type");
      setRows(Array.isArray(data) ? data : []);
    } catch { setRows([]); } finally { setLoading(false); }
  }, [date]);
  React.useEffect(() => { load(); }, [load]);

  const calc = async () => {
    const basePrice = parseFloat(String(base).replace(",", ".")) || 0;
    if (basePrice <= 0) { showToast?.("Podaj cenę bazową.", "error"); return; }
    const occupancy = occ === "" ? null : Math.max(0, Math.min(1, (parseFloat(occ) || 0) / 100));
    setCalcLoading(true);
    try {
      // AI-sędzia w granicach reguł (fallback do czystej matematyki, gdy AI niedostępne).
      const res = await generatePriceSuggestion({ basePrice, stayDate: date, roomType, occupancy });
      setPreview(res);
    } catch { showToast?.("Błąd liczenia ceny.", "error"); }
    finally { setCalcLoading(false); }
  };

  const save = async (status) => {
    if (!preview) { showToast?.("Najpierw policz sugestię.", "error"); return; }
    if (!roomType.trim()) { showToast?.("Podaj typ pokoju.", "error"); return; }
    if (!supabase) { showToast?.("Brak połączenia z bazą.", "error"); return; }
    const row = {
      tenant_id: TENANT_ID, stay_date: date, room_type: roomType.trim(),
      base_price: preview.base, suggested_price: preview.price,
      suggested_reason: { reason: preview.reason, factors: preview.factors, source: preview.source, baseline: preview.baseline },
      approved_price: status === "approved" ? preview.price : null,
      status, updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("own_rates").upsert(row, { onConflict: "tenant_id,stay_date,room_type" });
    if (error) { showToast?.("Błąd: " + error.message, "error"); return; }
    setPreview(null); setRoomType(""); setBase(""); setOcc("");
    showToast?.(status === "approved" ? "Cena zatwierdzona." : "Propozycja zapisana.", "success");
    load();
  };

  const setRowStatus = async (r, status, approvedPrice) => {
    const { error } = await supabase.from("own_rates").update({
      status, approved_price: status === "approved" ? (approvedPrice ?? r.suggested_price) : null, updated_at: new Date().toISOString(),
    }).eq("tenant_id", TENANT_ID).eq("stay_date", r.stay_date).eq("room_type", r.room_type);
    if (error) { showToast?.("Błąd: " + error.message, "error"); return; }
    load();
  };

  const statusPill = (s) => {
    const map = { approved: ["#34d399", "Zatwierdzona"], rejected: ["#f87171", "Odrzucona"], proposed: ["#f59e0b", "Propozycja"] };
    const [c, l] = map[s] || map.proposed;
    return <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", background: c + "22", color: c }}>{l}</span>;
  };

  return (
    <motion.div key="ceny" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="stack">
      <div className="panel glass dark-panel">
        <div className="panel-title"><TrendingUp size={16} /> Propozycje cen</div>
        <div className="tiny muted-light" style={{ marginBottom: 12, marginTop: -6 }}>Silnik proponuje cenę z ceny bazowej, dnia tygodnia i obłożenia. Zatwierdzasz lub edytujesz — nic nie zmienia się samo.</div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input className="input dark-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 150 }} />
          <input className="input dark-input" placeholder="Typ pokoju" value={roomType} onChange={(e) => setRoomType(e.target.value)} style={{ width: 130 }} />
          <input className="input dark-input" placeholder="Cena bazowa" value={base} onChange={(e) => setBase(e.target.value)} style={{ width: 110 }} />
          <input className="input dark-input" placeholder="Obłożenie %" value={occ} onChange={(e) => setOcc(e.target.value)} style={{ width: 110 }} />
          <button className="btn btn-outline-dark" onClick={calc} disabled={calcLoading}>{calcLoading ? "Liczę…" : (llmReady ? "Zaproponuj cenę (AI)" : "Policz sugestię")}</button>
        </div>
        {preview && (
          <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: "var(--radius-md)", background: "rgba(45,138,112,.1)", border: "1px solid rgba(45,138,112,.3)" }}>
            <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span style={{ fontSize: 22, fontWeight: 900, color: "var(--dark-text)" }}>{fmtMoney(preview.price)} zł</span>
              <span className="tiny muted-light">(baza {fmtMoney(preview.base)} zł{preview.source === "ai" && preview.baseline !== preview.price ? `, reguły ${fmtMoney(preview.baseline)}` : ""})</span>
              <span style={{ fontSize: 10, fontWeight: 800, padding: "2px 8px", borderRadius: 999, textTransform: "uppercase", background: preview.source === "ai" ? "#8b5cf622" : "#64748b22", color: preview.source === "ai" ? "#a78bfa" : "#94a3b8" }}>{preview.source === "ai" ? "AI" : "reguły"}</span>
            </div>
            <div className="tiny muted-light" style={{ marginTop: 4 }}>{preview.reason}</div>
            <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
              <button className="btn btn-emerald" onClick={() => save("approved")}><Check size={13} /> Zatwierdź</button>
              <button className="btn btn-outline-dark" onClick={() => save("proposed")}><Save size={13} /> Zapisz propozycję</button>
            </div>
          </div>
        )}
      </div>

      <div className="panel glass dark-panel">
        <div className="panel-title">Ceny na {date}</div>
        {loading ? <div className="tiny muted-light">Wczytywanie…</div>
          : !rows.length ? <div className="tiny muted-light">Brak propozycji na ten dzień.</div>
          : (
            <div className="stack">
              {rows.map((r) => (
                <div key={r.room_type} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", background: "rgba(255,255,255,.04)", border: "1px solid var(--dark-border)", borderRadius: "var(--radius-md)" }}>
                  <span style={{ fontWeight: 800, minWidth: 100, color: "var(--dark-text)" }}>{r.room_type}</span>
                  <span style={{ minWidth: 90, color: "var(--dark-text)" }}>{fmtMoney(r.approved_price ?? r.suggested_price)} zł</span>
                  <span style={{ flex: 1, fontSize: 11.5, color: "var(--dark-text-muted)" }}>{r.suggested_reason?.reason || ""}</span>
                  {statusPill(r.status)}
                  {r.status !== "approved" && <button onClick={() => setRowStatus(r, "approved")} title="Zatwierdź" style={{ background: "none", border: "none", cursor: "pointer", color: "#34d399", display: "flex" }}><Check size={15} /></button>}
                  {r.status !== "rejected" && <button onClick={() => setRowStatus(r, "rejected")} title="Odrzuć" style={{ background: "none", border: "none", cursor: "pointer", color: "#f87171", display: "flex" }}><X size={15} /></button>}
                </div>
              ))}
            </div>
          )}
      </div>
    </motion.div>
  );
}
