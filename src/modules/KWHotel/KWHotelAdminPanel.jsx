import React from "react";
import { TrendingUp, Eye, EyeOff } from "lucide-react";
import { STORAGE_KEYS } from "../../lib/storage";

export default function KWHotelAdminPanel({ dark, showToast }) {
  const [user, setUser] = React.useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.kwhotelCreds) || "{}").username || ""; } catch { return ""; }
  });
  const [pass, setPass] = React.useState("");
  const [showPass, setShowPass] = React.useState(false);
  const [status, setStatus] = React.useState("idle"); // idle | testing | ok | error
  const [detail, setDetail] = React.useState("");

  const hasElectron = !!window.electronAPI;

  const saveAndTest = async () => {
    if (!user.trim()) { showToast("Wpisz login KWHotel.", "error"); return; }
    if (!pass.trim()) { showToast("Wpisz hasło KWHotel.", "error"); return; }
    const creds = { username: user.trim(), password: pass.trim() };
    localStorage.setItem(STORAGE_KEYS.kwhotelCreds, JSON.stringify(creds));
    if (!hasElectron) { showToast("Zapisano dane logowania.", "success"); setStatus("ok"); return; }
    setStatus("testing");
    setDetail("");
    try {
      const r = await window.electronAPI.kwhotelTest(creds);
      if (r?.ok) {
        setStatus("ok");
        showToast("Połączenie KWHotel — OK!", "success");
        setDetail(`Endpoint: ${r.endpoint || "?"}`);
      } else {
        setStatus("error");
        const hint = r?.hint || r?.loginResult?.hint || "Sprawdź dane logowania.";
        setDetail(hint);
        showToast("Błąd połączenia KWHotel.", "error");
      }
    } catch (e) {
      setStatus("error");
      setDetail(e.message);
      showToast("Błąd połączenia KWHotel.", "error");
    }
  };

  const inp = "input " + (dark ? "dark-admin-entry" : "");

  return (
    <div className="panel glass dark-panel">
      <div className="panel-title" style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <TrendingUp size={16} /> KWHotel — dane logowania API
      </div>
      <div style={{ fontSize: 12, color: "var(--text-muted)", marginBottom: 14 }}>
        Podaj dane logowania do panelu KWHotel Cloud. Hasło jest przechowywane tylko lokalnie na tym komputerze.
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 400 }}>
        <div>
          <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Login / e-mail</label>
          <input
            className={inp}
            placeholder="np. recepcja@hotel.pl"
            value={user}
            onChange={e => setUser(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div>
          <label style={{ fontSize: 12, color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Hasło</label>
          <div style={{ position: "relative" }}>
            <input
              className={inp}
              type={showPass ? "text" : "password"}
              placeholder="••••••••"
              value={pass}
              onChange={e => setPass(e.target.value)}
              autoComplete="new-password"
              style={{ paddingRight: 36 }}
            />
            <button
              type="button"
              onClick={() => setShowPass(v => !v)}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--text-muted)", padding: 2, display: "flex" }}
            >
              {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>
        <button
          className="btn btn-outline"
          onClick={saveAndTest}
          disabled={status === "testing"}
          style={{ alignSelf: "flex-start" }}
        >
          {status === "testing" ? "Testuję..." : "Zapisz i testuj"}
        </button>
      </div>

      {status === "ok" && (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--emerald)", fontWeight: 600 }}>
          ✓ Połączenie działa{detail ? ` — ${detail}` : ""}
        </div>
      )}
      {status === "error" && (
        <div style={{ marginTop: 12, fontSize: 12, color: "var(--rose)", fontWeight: 600, maxWidth: 500, lineHeight: 1.5 }}>
          ✗ {detail || "Nie udało się połączyć z KWHotel."}
        </div>
      )}
      {!hasElectron && (
        <div style={{ marginTop: 10, fontSize: 11, color: "var(--amber)" }}>
          Aplikacja webowa — test połączenia wymaga trybu Electron.
        </div>
      )}
    </div>
  );
}
