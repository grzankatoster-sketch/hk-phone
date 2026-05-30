import React from "react";
import { motion } from "framer-motion";
import { Settings, Download, RefreshCw } from "lucide-react";
import UpdateBanner from "../../UpdateBanner";

// Panel "Serwer Railway (HK)" usunięty — synchronizacja HK działa przez Supabase.

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
    </motion.div>
  );
}
