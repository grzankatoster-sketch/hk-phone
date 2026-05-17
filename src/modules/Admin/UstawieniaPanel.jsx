import React from "react";
import { motion } from "framer-motion";
import { Settings, Download, RefreshCw } from "lucide-react";
import UpdateBanner from "../../UpdateBanner";

function RailwaySettings() {
  const [url, setUrl] = React.useState("");
  const [status, setStatus] = React.useState("idle");
  React.useEffect(() => {
    window.electronAPI?.remoteGetUrl?.().then(r => { if (r) setUrl(r); }).catch(() => {});
  }, []);
  const save = async () => {
    if (!url.trim()) return;
    await window.electronAPI?.remoteSetUrl?.(url.trim());
    setStatus("checking");
    const r = await window.electronAPI?.remoteTest?.();
    setStatus(r?.ok ? "ok" : "error");
  };
  return (
    <div className="panel glass dark-panel">
      <div className="panel-title" style={{color:"#34d399"}}>&#127760; Serwer Railway (HK)</div>
      <div style={{fontSize:12,color:"#948e85",marginBottom:10}}>Adres serwera Railway — wymagany do działania QR kodów i aplikacji mobilnej pokojówek.</div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <input value={url} onChange={e=>setUrl(e.target.value)}
          placeholder="https://hk-server-production.up.railway.app"
          style={{flex:1,padding:"8px 10px",borderRadius:7,border:`1px solid ${status==="ok"?"rgba(52,211,153,.4)":status==="error"?"rgba(220,60,60,.4)":"var(--dark-border)"}`,background:"rgba(255,255,255,.04)",color:"#e6edf3",fontSize:12,fontFamily:"monospace"}}/>
        <button onClick={save} style={{padding:"8px 16px",borderRadius:7,border:"none",background:"var(--plum)",color:"#0B0810",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap",boxShadow:"var(--plum-bright-glow)"}}>Zapisz i testuj</button>
      </div>
      {status==="ok"&&<div style={{marginTop:8,fontSize:12,color:"#34d399",fontWeight:600}}>&#10003; Połączenie działa</div>}
      {status==="error"&&<div style={{marginTop:8,fontSize:12,color:"#f87171",fontWeight:600}}>&#10007; Nie można połączyć — sprawdź adres</div>}
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

      <div className="panel glass dark-panel">
        <div className="panel-title"><Download size={16}/> Backup i przywracanie danych</div>
        <div className="tiny muted-light" style={{marginBottom:12,marginTop:-6}}>Dane przechowywane w pamięci aplikacji. Backup = plik JSON na pendrive.</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
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

      {!!window.electronAPI && <RailwaySettings/>}
    </motion.div>
  );
}
