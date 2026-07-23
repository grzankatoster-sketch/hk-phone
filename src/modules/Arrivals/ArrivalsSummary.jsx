import React from "react";
import { LogIn, LogOut } from "lucide-react";
import { todayKey } from "../../lib/dates";

// Kompaktowy licznik przyjazdów/wyjazdów dnia (WYKONANIE 4.3, wariant „tylko liczniki").
// NIE dubluje KWHotel ani widoku HK — daje recepcji szybki nagłówek obłożenia zmiany.
// Liczba = długość tablicy rezerwacji (odporne na zmienny format danych KWHotel).
// Gdy KWHotel niepodłączony / brak danych → karta się nie pokazuje (bez zaśmiecania).
function countRows(payload) {
  if (!payload?.ok) return null;
  const d = payload.data ?? payload;
  const arr = Array.isArray(d) ? d
    : Array.isArray(d?.reservations) ? d.reservations
    : Array.isArray(d?.items) ? d.items
    : Array.isArray(d?.results) ? d.results
    : Array.isArray(d?.rows) ? d.rows
    : null;
  return Array.isArray(arr) ? arr.length : null;
}

export default function ArrivalsSummary() {
  const api = typeof window !== "undefined" ? window.electronAPI : null;
  const [data, setData] = React.useState(null); // { arr, dep } | null

  React.useEffect(() => {
    if (!api?.kwhotelArrivals) return;
    let alive = true;
    (async () => {
      try {
        const date = todayKey();
        const [a, d] = await Promise.all([api.kwhotelArrivals({ date }), api.kwhotelDepartures({ date })]);
        if (!alive) return;
        const arr = countRows(a), dep = countRows(d);
        setData(arr === null && dep === null ? null : { arr, dep });
      } catch { if (alive) setData(null); }
    })();
    return () => { alive = false; };
  }, [api]);

  if (!data) return null;
  const Cell = ({ icon, label, n, color }) => (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ color, display: "inline-flex" }}>{icon}</span>
      <span style={{ fontSize: 20, fontWeight: 800, color: "var(--text-primary)" }}>{n ?? "—"}</span>
      <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{label}</span>
    </div>
  );
  return (
    <div className="panel" style={{ marginBottom: 12, padding: "12px 16px", display: "flex", gap: 28, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: ".06em", textTransform: "uppercase", color: "var(--text-muted)" }}>Dziś</span>
      <Cell icon={<LogIn size={18} />} label="przyjazdów" n={data.arr} color="#2d8a70" />
      <Cell icon={<LogOut size={18} />} label="wyjazdów" n={data.dep} color="#c47a20" />
    </div>
  );
}
