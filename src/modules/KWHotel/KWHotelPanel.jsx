import React from "react";
import { TrendingUp, RefreshCw } from "lucide-react";
import { todayKey } from "../../lib/dates";
import { STORAGE_KEYS } from "../../lib/storage";

export default function KWHotelPanel({ dark, hkData, setHkData }) {
  const [arrivals, setArrivals] = React.useState(null);
  const [departures, setDepartures] = React.useState(null);
  const [rooms, setRooms] = React.useState(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState("");
  const [lastFetch, setLastFetch] = React.useState("");

  const hasElectron = !!window.electronAPI;

  const getCreds = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.kwhotelCreds) || "{}"); } catch { return {}; }
  };

  const refresh = async () => {
    const creds = getCreds();
    if (!creds.username || !creds.password) {
      setError("Brak danych logowania KWHotel — kierownik musi je ustawić w panelu KWHotel API.");
      return;
    }
    if (!hasElectron) {
      setError("Pobieranie danych KWHotel wymaga trybu Electron.");
      return;
    }
    setLoading(true);
    setError("");
    const date = todayKey();
    try {
      const [arr, dep, rm] = await Promise.allSettled([
        window.electronAPI.kwhotelArrivals({ date }),
        window.electronAPI.kwhotelDepartures({ date }),
        window.electronAPI.kwhotelRooms({ date }),
      ]);
      if (arr.status === "fulfilled") setArrivals(arr.value);
      if (dep.status === "fulfilled") setDepartures(dep.value);
      if (rm.status === "fulfilled") setRooms(rm.value);

      const anyOk = [arr, dep, rm].some(r => r.status === "fulfilled" && r.value?.ok);
      if (!anyOk) {
        setError("Nie udało się pobrać danych — sprawdź dane logowania w ustawieniach KWHotel.");
      }

      // Auto-update HK data from room status if available
      const roomData = rm.status === "fulfilled" ? rm.value?.data : null;
      if (roomData && Array.isArray(roomData) && setHkData) {
        let changed = 0;
        setHkData(prev => {
          const next = { ...prev };
          roomData.forEach(r => {
            const no = String(r.room_number || r.roomNumber || r.no || "");
            if (!no) return;
            const status = r.hk_status || r.housekeeping_status || r.status || "";
            const mapped = mapKWHStatus(status);
            if (mapped && next[no] && next[no].status !== mapped) {
              next[no] = { ...next[no], status: mapped };
              changed++;
            }
          });
          return next;
        });
        if (changed > 0) {
          // showToast is not available here — parent handles this
        }
      }

      setLastFetch(new Date().toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const mapKWHStatus = (s) => {
    const v = String(s || "").toLowerCase();
    if (v.includes("clean") || v.includes("czyste")) return "P";
    if (v.includes("dirty") || v.includes("brudne")) return "BR";
    if (v.includes("inspect")) return "PG";
    return null;
  };

  const hasCreds = !!getCreds().username;

  return (
    <div className="panel glass dark-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div className="panel-title" style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
          <TrendingUp size={16} /> KWHotel — dane na dziś
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {lastFetch && <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Ostatnia aktualizacja: {lastFetch}</span>}
          <button className="btn btn-outline" onClick={refresh} disabled={loading || !hasCreds} style={{ fontSize: 12 }}>
            <RefreshCw size={13} style={{ marginRight: 4 }} /> {loading ? "Pobieranie..." : "Odśwież"}
          </button>
        </div>
      </div>

      {!hasCreds && (
        <div style={{ fontSize: 13, color: "var(--amber)", padding: "10px 14px", background: "rgba(245,158,11,.09)", border: "1px solid rgba(245,158,11,.25)", borderRadius: 8 }}>
          Brak danych logowania KWHotel — kierownik musi je ustawić w panelu KWHotel API.
        </div>
      )}

      {error && (
        <div style={{ fontSize: 12, color: "var(--rose)", padding: "10px 14px", background: "rgba(255,84,113,.08)", border: "1px solid rgba(255,84,113,.25)", borderRadius: 8, marginTop: 8 }}>
          {error}
        </div>
      )}

      {!arrivals && !departures && !rooms && !error && hasCreds && (
        <div style={{ fontSize: 13, color: "var(--text-muted)", padding: "20px 0", textAlign: "center" }}>
          Kliknij Odśwież aby pobrać dane z KWHotel.
        </div>
      )}

      {arrivals?.ok && arrivals.data && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
            Przyjazdy ({Array.isArray(arrivals.data) ? arrivals.data.length : "?"})
          </div>
          {Array.isArray(arrivals.data) && arrivals.data.slice(0, 10).map((r, i) => (
            <div key={i} style={{ fontSize: 12.5, padding: "6px 10px", borderRadius: 6, background: "rgba(52,211,153,.06)", border: "1px solid rgba(52,211,153,.15)", marginBottom: 4 }}>
              {r.room_number || r.roomNumber || r.room || "?"} — {r.guest_name || r.guestName || r.name || "Gość"}
            </div>
          ))}
        </div>
      )}

      {departures?.ok && departures.data && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
            Wyjazdy ({Array.isArray(departures.data) ? departures.data.length : "?"})
          </div>
          {Array.isArray(departures.data) && departures.data.slice(0, 10).map((r, i) => (
            <div key={i} style={{ fontSize: 12.5, padding: "6px 10px", borderRadius: 6, background: "rgba(232,148,58,.06)", border: "1px solid rgba(232,148,58,.15)", marginBottom: 4 }}>
              {r.room_number || r.roomNumber || r.room || "?"} — {r.guest_name || r.guestName || r.name || "Gość"}
            </div>
          ))}
        </div>
      )}

      {rooms?.ok && rooms.data && Array.isArray(rooms.data) && (
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
            Status pokoi ({rooms.data.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {rooms.data.slice(0, 20).map((r, i) => (
              <div key={i} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 5, background: "var(--bg-card)", border: "1px solid var(--border-light)" }}>
                {r.room_number || r.roomNumber || r.no || "?"}: {r.hk_status || r.housekeeping_status || r.status || "?"}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
