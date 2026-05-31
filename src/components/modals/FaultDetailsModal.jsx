import React from "react";
import { motion } from "framer-motion";
import { X, AlertTriangle } from "lucide-react";
import { KONSERWATOR_WORKERS } from "../../lib/constants";

export default function FaultDetailsModal({fault,floors,onClose,onUpdate,employeeName,isManager}){
  const [note,setNote]=React.useState(fault.completion_note||"");
  const [assignedTo,setAssignedTo]=React.useState(fault.assigned_to||"");
  const fl=floors.find(f=>f.key===fault.floor);
  const label=fl?.key==="parter"?(fl.spaces.find(s=>s.id===fault.space_id)?.label||fault.space_id):(fault.room||fault.space_id);
  const photos=[...(fault.photos||[]),...(fault.photo_url&&!(fault.photos||[]).includes(fault.photo_url)?[fault.photo_url]:[])];
  const statusLabel={open:"Nowa",in_progress:"W trakcie",done:"Zakończona"}[fault.status];
  const statusColor={open:"var(--rose)",in_progress:"var(--amber)",done:"var(--emerald)"}[fault.status];
  return (
    <div className="modal-backdrop" style={{zIndex:1100}} onClick={onClose}>
      <motion.div initial={{opacity:0,y:12,scale:.97}} animate={{opacity:1,y:0,scale:1}} className="cc-preshift-modal" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
        <div className="cc-preshift-header">
          <div style={{width:36,height:36,borderRadius:10,background:"var(--rose-light)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <AlertTriangle size={20} style={{color:statusColor}}/>
          </div>
          <div style={{flex:1}}>
            <div className="cc-preshift-title">{label} · {fl?.label}</div>
            <div className="cc-preshift-sub">
              <span style={{color:statusColor,fontWeight:700}}>{statusLabel}</span>
              {fault.priority==="urgent"&&<span className="cc-preshift-urgent" style={{marginLeft:8}}>PILNE</span>}
            </div>
          </div>
          <button className="cc-preshift-close" onClick={onClose}><X size={18}/></button>
        </div>
        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:12,maxHeight:"60vh",overflowY:"auto"}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Opis</div>
            <div style={{fontSize:14,lineHeight:1.5,color:"var(--text-primary)"}}>{fault.description}</div>
          </div>
          {photos.length>0&&(
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Zdjęcia ({photos.length})</div>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                {photos.map((p,i)=>(
                  <a key={i} href={p} target="_blank" rel="noreferrer">
                    <img src={p} alt={`usterka ${i+1}`} style={{width:120,height:120,objectFit:"cover",borderRadius:10,border:"1px solid var(--border-light)"}}/>
                  </a>
                ))}
              </div>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,fontSize:12}}>
            <div><strong>Zgłoszone:</strong><br/>{fault.reported_by}<br/>{new Date(fault.reported_at).toLocaleString("pl-PL")}</div>
            {fault.due_at&&<div><strong>Do wykonania:</strong><br/>{new Date(fault.due_at).toLocaleString("pl-PL")}</div>}
            {fault.started_at&&<div><strong>Rozpoczęto:</strong><br/>{new Date(fault.started_at).toLocaleString("pl-PL")}</div>}
            {fault.completed_at&&<div><strong>Zakończono:</strong><br/>{new Date(fault.completed_at).toLocaleString("pl-PL")}</div>}
            {fault.category&&<div><strong>Kategoria:</strong><br/>{fault.category}</div>}
            <div>
              <strong>Przypisano do:</strong><br/>
              {isManager?(
                <select className="input" style={{marginTop:4,fontSize:12}} value={assignedTo} onChange={e=>{setAssignedTo(e.target.value);onUpdate(fault.id,{assigned_to:e.target.value||null});}}>
                  <option value="">— brak —</option>
                  {KONSERWATOR_WORKERS.map(w=><option key={w} value={w}>{w}</option>)}
                </select>
              ):(assignedTo||"—")}
            </div>
          </div>
          {fault.status!=="open"&&(
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Notatka konserwatora</div>
              <textarea className="input" rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Opisz co zostało naprawione..."/>
            </div>
          )}
        </div>
        <div className="cc-preshift-footer">
          <div style={{fontSize:11,color:"var(--text-muted)"}}>Usterek nie można usuwać — zapis trwały.</div>
          <div style={{display:"flex",gap:8}}>
            {fault.status==="open"&&(
              <button className="btn btn-amber" onClick={()=>{onUpdate(fault.id,{status:"in_progress",started_at:new Date().toISOString()});onClose();}}>
                Rozpocznij →
              </button>
            )}
            {fault.status==="in_progress"&&(
              <button className="btn btn-emerald" onClick={()=>{onUpdate(fault.id,{status:"done",completed_at:new Date().toISOString(),completion_note:note.trim()});onClose();}}>
                ✓ Zakończ
              </button>
            )}
            {fault.status==="done"&&(
              <button className="btn btn-outline" onClick={()=>{onUpdate(fault.id,{completion_note:note.trim()});onClose();}}>
                Zapisz notatkę
              </button>
            )}
            <button className="btn btn-outline" onClick={onClose}>Zamknij</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
