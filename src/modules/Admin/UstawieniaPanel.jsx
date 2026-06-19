import React, { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Settings, Download, RefreshCw, Mail, CheckCircle2, AlertTriangle, KeyRound } from "lucide-react";
import UpdateBanner from "../../UpdateBanner";

// Panel "Serwer Railway (HK)" usunięty — synchronizacja HK działa przez Supabase.

// ─── Agent poczty (automatyzacja HK) ─────────────────────────────────────────
// Hasło IMAP trzymane jest zaszyfrowane w userData (safeStorage) i przeżywa
// auto-update — wcześniej ginęło z .env obok exe przy każdej aktualizacji.
function AutomationCard() {
  const api = window.electronAPI;
  const [status, setStatus] = useState(null);
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  const refresh = useCallback(async () => {
    try { setStatus(await api.hkAutomationStatus()); } catch { /* offline */ }
  }, [api]);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const savePassword = async () => {
    if (!pw.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await api.hkAutomationSetPassword(pw.trim());
      if (res?.ok) { setPw(""); setMsg({ ok: true, text: "Hasło zapisane i zaszyfrowane. Agent ruszył." }); }
      else setMsg({ ok: false, text: res?.error || "Nie udało się zapisać hasła." });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); setTimeout(refresh, 1500); }
  };

  const runNow = async () => {
    setBusy(true); setMsg(null);
    try {
      const res = await api.hkAutomationRunNow();
      setMsg(res?.ok ? { ok: true, text: `Pobrano. Zapisane plany: ${res.written ?? 0}.` }
                     : { ok: false, text: res?.error || "Cykl nie powiódł się." });
    } catch (e) { setMsg({ ok: false, text: e.message }); }
    finally { setBusy(false); refresh(); }
  };

  const has = status?.hasPassword;
  const fmt = (iso) => { try { return iso ? new Date(iso).toLocaleString("pl-PL") : "—"; } catch { return "—"; } };

  return (
    <div className="panel glass dark-panel">
      <div className="panel-title"><Mail size={16}/> Automatyzacja HK (poczta)</div>
      <div className="tiny muted-light" style={{marginBottom:12,marginTop:-6}}>
        Agent pobiera raporty PDF z poczty IMAP i buduje plany sprzątań. Hasło wpisujesz raz — jest szyfrowane i przeżywa aktualizacje aplikacji.
      </div>

      <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 13px",borderRadius:"var(--radius-md)",marginBottom:12,
        background: has ? "rgba(45,106,79,.12)" : "rgba(192,90,90,.12)",
        border: `1px solid ${has ? "rgba(45,106,79,.3)" : "rgba(192,90,90,.3)"}`}}>
        {has ? <CheckCircle2 size={16} color="#5acc94"/> : <AlertTriangle size={16} color="#e08a8a"/>}
        <div style={{fontSize:12.5,fontWeight:700,color: has ? "#5acc94" : "#e08a8a"}}>
          {has ? "Hasło ustawione — agent aktywny" : "Brak hasła — agent nie pobiera poczty"}
        </div>
      </div>

      <div style={{display:"grid",gap:6,fontSize:12,color:"var(--dark-text-muted)",marginBottom:12}}>
        <div>Ostatni pobór: <b style={{color:"var(--dark-text)"}}>{fmt(status?.lastRun)}</b></div>
        <div>Następny pobór: <b style={{color:"var(--dark-text)"}}>{fmt(status?.nextRunAt)}</b></div>
        {status?.lastError && <div style={{color:"#e08a8a"}}>Ostatni błąd: {status.lastError}</div>}
      </div>

      <div className="cc-form-grid cc-form-grid-2" style={{alignItems:"end"}}>
        <div>
          <div style={{fontSize:11.5,fontWeight:700,color:"var(--dark-text)",marginBottom:5,display:"flex",alignItems:"center",gap:5}}>
            <KeyRound size={13}/> Hasło skrzynki IMAP
          </div>
          <input className="input" type="password" placeholder={has ? "•••••••• (zapisane)" : "Wpisz hasło"} value={pw}
            onChange={e=>setPw(e.target.value)} autoComplete="off"/>
        </div>
        <div style={{display:"flex",gap:8}}>
          <button className="btn btn-emerald full" disabled={busy||!pw.trim()} onClick={savePassword}>Zapisz hasło</button>
          <button className="btn btn-outline-dark full" disabled={busy} onClick={runNow}><RefreshCw size={13}/> Pobierz teraz</button>
        </div>
      </div>

      {msg && (
        <div style={{marginTop:10,fontSize:12,fontWeight:600,color: msg.ok ? "#5acc94" : "#e08a8a"}}>{msg.text}</div>
      )}
    </div>
  );
}

export default function UstawieniaPanel({
  adminDark, setAdminDark,
  soundEnabled, setSoundEnabled,
  handleExportBackup,
  handleImportBackup,
}) {
  return (
    <motion.div key="stb" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="stack">
      {!!window.electronAPI && (
        <div className="panel glass dark-panel">
          <div className="panel-title"><RefreshCw size={16}/> Aktualizacje aplikacji</div>
          <UpdateBanner dark={adminDark}/>
        </div>
      )}

      {!!window.electronAPI && <AutomationCard/>}

      <div className="panel glass dark-panel">
        <div className="panel-title"><Download size={16}/> Backup i przywracanie danych</div>
        <div className="tiny muted-light" style={{marginBottom:12,marginTop:-6}}>Dane przechowywane w pamięci aplikacji. Backup = plik JSON na pendrive.</div>
        <div className="cc-form-grid cc-form-grid-2">
          <div style={{background:"rgba(45,106,79,.1)",border:"1px solid rgba(45,106,79,.25)",borderRadius:"var(--radius-md)",padding:"12px"}}>
            <div style={{fontSize:12.5,fontWeight:700,color:"#5acc94",marginBottom:6}}>&#128230; Eksport backup</div>
            <div style={{fontSize:11.5,color:"#635e57",marginBottom:10,lineHeight:1.5}}>Pobierz plik JSON ze wszystkimi danymi recepcji.</div>
            <button className="btn btn-emerald full" onClick={handleExportBackup}><Download size={13}/> Pobierz backup</button>
          </div>
          <div style={{background:"rgba(90,74,192,.1)",border:"1px solid rgba(90,74,192,.25)",borderRadius:"var(--radius-md)",padding:"12px"}}>
            <div style={{fontSize:12.5,fontWeight:700,color:"#9b8fe8",marginBottom:6}}>&#128194; Import backup</div>
            <div style={{fontSize:11.5,color:"#635e57",marginBottom:10,lineHeight:1.5}}>Przywróć dane z pliku backup. Aplikacja się odświeży.</div>
            <button className="btn btn-outline-dark full" onClick={handleImportBackup}>&#128194; Wybierz plik</button>
          </div>
        </div>
      </div>

      <div className="panel glass dark-panel">
        <div className="panel-title"><Settings size={16}/> Ustawienia</div>
        <div className="stack">
          {[
            {label:"Dźwięki powiadomień",sub:"Sygnał przy przeterminowanym zadaniu i przypomnieniu",val:soundEnabled,toggle:()=>setSoundEnabled(v=>!v)},
            {label:"Motyw ciemny — panel kierownictwa",sub:"Przełącz jasny / ciemny",val:adminDark,toggle:()=>setAdminDark(v=>!v)},
          ].map(s=>(
            <div key={s.label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 13px",background:"rgba(255,255,255,.04)",border:"1px solid var(--dark-border)",borderRadius:"var(--radius-md)"}}>
              <div>
                <div style={{fontSize:13,fontWeight:600,color:"var(--dark-text)"}}>{s.label}</div>
                <div style={{fontSize:11.5,color:"var(--dark-text-muted)",marginTop:2}}>{s.sub}</div>
              </div>
              <button onClick={s.toggle} style={{width:44,height:24,borderRadius:999,border:"none",cursor:"pointer",position:"relative",flexShrink:0,background:s.val?"#a07428":"#524f4b",transition:"background .2s"}}>
                <span style={{position:"absolute",top:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left .2s",left:s.val?"22px":"3px"}}/>
              </button>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
