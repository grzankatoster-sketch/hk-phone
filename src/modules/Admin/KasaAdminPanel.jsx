import React from "react";
import { motion } from "framer-motion";
import { Settings, History, AlertTriangle } from "lucide-react";
import { SHIFT_SHORT_LABELS } from "../../lib/constants";
import { loadJson } from "../../lib/storage";
import { fmtMoney } from "../../lib/format";

export default function KasaAdminPanel({
  stalaKasowa,
  managerNewStala, setManagerNewStala,
  setStalaKasowaByManager,
  messages,
}) {
  const kasaLog = loadJson("reception-kasa-log", []);
  const stalaLog = loadJson("reception-stala-kasowa-log", []);
  const discrepancies = messages.filter(m => m.type === "cash_discrepancy");

  return (
    <motion.div key="kasa-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="stack">
      {/* Stała kasowa */}
      <div className="panel glass dark-panel">
        <div className="panel-title"><Settings size={16}/> Stała kasowa — zarządzanie</div>
        <div style={{textAlign:"center",padding:"20px 0 12px",background:"var(--plum-soft)",borderRadius:"var(--radius-md)",margin:"0 -4px 18px",border:"1px solid var(--plum-border)"}}>
          <div style={{fontSize:11,color:"var(--plum)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8,fontWeight:800}}>Aktualna stała kasowa</div>
          <div style={{fontSize:46,fontWeight:400,color:"var(--plum)",letterSpacing:"-1.5px",lineHeight:1,fontFamily:"var(--cc-font-display)"}}>{fmtMoney(stalaKasowa)}</div>
        </div>
        <div style={{display:"grid",gap:10,marginTop:4}}>
          <div style={{fontSize:12.5,color:"var(--text-muted)"}}>Zmień stałą kasową (tylko kierownik):</div>
          <div style={{display:"flex",gap:10}}>
            <input className="input dark-admin-entry" type="number" min="0" step="0.01"
              placeholder="Nowa wartość stałej kasowej"
              value={managerNewStala} onChange={e=>setManagerNewStala(e.target.value)}
              style={{flex:1}}/>
            <button className="btn btn-amber" onClick={()=>setStalaKasowaByManager(managerNewStala)} disabled={!managerNewStala.trim()}>Zapisz</button>
          </div>
        </div>
      </div>

      {/* Log operacji kasowych */}
      <div className="panel glass dark-panel">
        <div className="panel-title"><History size={16}/> Operacje kasowe</div>
        {kasaLog.length===0?(
          <div className="empty-box empty-box-dark">Brak operacji.</div>
        ):(
          <div style={{display:"grid",gap:6,maxHeight:280,overflowY:"auto"}}>
            {kasaLog.slice(0,20).map(e=>(
              <div key={e.id} style={{background:e.type==="post_wplata"?"rgba(160,116,40,.08)":"rgba(255,255,255,.04)",border:"1px solid var(--dark-border)",borderRadius:"var(--radius-md)",padding:"9px 13px"}}>
                <div style={{fontSize:12.5,color:"var(--dark-text)",lineHeight:1.5}}>{e.text}</div>
                <div style={{fontSize:11,color:"#635e57",marginTop:2}}>{e.from} · {SHIFT_SHORT_LABELS[e.shift]||e.shift} · {e.createdAt}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historia zmian stałej kasowej */}
      <div className="panel glass dark-panel">
        <div className="panel-title"><History size={16}/> Historia zmian stałej kasowej</div>
        {stalaLog.length===0?(
          <div className="empty-box empty-box-dark">Brak historii zmian.</div>
        ):(
          <div style={{display:"grid",gap:7,maxHeight:320,overflowY:"auto"}}>
            {stalaLog.slice(0,10).map(entry=>(
              <div key={entry.id} style={{background:"rgba(255,255,255,.04)",border:"1px solid var(--dark-border)",borderRadius:"var(--radius-md)",padding:"10px 13px",display:"flex",alignItems:"center",gap:12}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,color:"var(--dark-text)",fontWeight:600}}>{fmtMoney(entry.from)} → {fmtMoney(entry.to)}</div>
                  <div style={{fontSize:11,color:"#635e57",marginTop:2}}>{entry.changedBy} · {entry.changedAt}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Zgłoszone niezgodności kasowe */}
      <div className="panel glass dark-panel">
        <div className="panel-title" style={{color:"#e07070"}}><AlertTriangle size={16}/> Zgłoszone niezgodności kasowe</div>
        {discrepancies.length===0?(
          <div className="empty-box empty-box-dark">Brak zgłoszonych niezgodności.</div>
        ):(
          <div style={{display:"grid",gap:8,maxHeight:400,overflowY:"auto"}}>
            {discrepancies.map(m=>(
              <div key={m.id} style={{background:"rgba(154,48,64,.07)",border:"1px solid rgba(154,48,64,.25)",borderRadius:"var(--radius-md)",padding:"11px 14px"}}>
                <div style={{fontSize:13,color:"var(--dark-text)",lineHeight:1.55,marginBottom:4}}>{m.text}</div>
                <div style={{fontSize:11,color:"#635e57"}}>{m.from} · {SHIFT_SHORT_LABELS[m.shift]||m.shift} · {m.createdAt}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
