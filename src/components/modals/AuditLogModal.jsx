import { useState, useMemo } from "react";
import { X, Cog } from "lucide-react";
import { STORAGE_KEYS, loadJson, getCustomManagers } from "../../lib/storage";
import { ADMIN_MANAGERS } from "../../lib/constants";
import { getFullName } from "../../lib/employees";

export default function AuditLogModal({onClose}){
  const [log]=useState(()=>loadJson(STORAGE_KEYS.adminAudit,[]));
  const [filter,setFilter]=useState("wszyscy");
  const managers=useMemo(()=>{const m=getCustomManagers();return m.length>0?m:ADMIN_MANAGERS;},[]);
  const filtered=filter==="wszyscy"?log:log.filter(e=>e.manager===filter);
  return(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal large-modal dark-modal" style={{maxWidth:720}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h2 style={{display:"flex",alignItems:"center",gap:10}}><Cog size={18}/> Dziennik działań kierownictwa</h2>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"none",borderRadius:8,color:"var(--dark-text)",cursor:"pointer",padding:"7px 10px",display:"flex"}}><X size={16}/></button>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {["wszyscy",...managers].map(m=>(
            <button key={m} onClick={()=>setFilter(m)}
              style={{padding:"6px 14px",borderRadius:8,border:"1px solid",fontWeight:700,fontSize:12.5,cursor:"pointer",
                      borderColor:filter===m?"var(--gold)":"var(--dark-border)",
                      background:filter===m?"rgba(201,153,80,.15)":"transparent",
                      color:filter===m?"var(--gold)":"var(--dark-text-muted)",textTransform:"capitalize"}}>{m}</button>
          ))}
        </div>
        <div style={{maxHeight:440,overflowY:"auto",display:"grid",gap:8}}>
          {filtered.length?filtered.map(entry=>(
            <div key={entry.id} style={{background:"rgba(255,255,255,.03)",borderRadius:"var(--radius-md)",padding:"12px 14px",border:"1px solid var(--dark-border)",borderLeft:"3px solid var(--gold)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:30,height:30,borderRadius:"50%",background:"var(--gold)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--plum-deep)",fontSize:12,fontWeight:800}}>{entry.manager?.[0]||"?"}</div>
                  <span style={{fontWeight:700,color:"var(--gold)",fontSize:13.5,fontFamily:"'DM Serif Display',serif"}}>{entry.manager}</span>
                </div>
                <span style={{fontSize:11,color:"var(--dark-text-muted)"}}>{entry.at}</span>
              </div>
              <div style={{color:"var(--dark-text-secondary)",fontSize:13,paddingLeft:40,lineHeight:1.5}}>{entry.action}</div>
            </div>
          )):<div style={{textAlign:"center",color:"var(--dark-text-muted)",padding:40,fontSize:13}}>Brak zapisanych działań.</div>}
        </div>
      </div>
    </div>
  );
}
