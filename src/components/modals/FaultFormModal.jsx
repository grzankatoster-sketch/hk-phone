import React from "react";
import { motion } from "framer-motion";
import { AlertTriangle, X } from "lucide-react";
import { FAULT_CATEGORIES, KONSERWATOR_WORKERS } from "../../lib/constants";

export default function FaultFormModal({onClose,onSave,employeeName,floors,initialSpace,initialFloor}){
  const [floor,setFloor]=React.useState(initialFloor||"parter");
  const [spaceId,setSpaceId]=React.useState(initialSpace||"");
  const [description,setDescription]=React.useState("");
  const [priority,setPriority]=React.useState("normal");
  const [category,setCategory]=React.useState("");
  const [assignedTo,setAssignedTo]=React.useState("");
  const [dueAt,setDueAt]=React.useState("");
  const [photo,setPhoto]=React.useState(null);
  const fl=floors.find(f=>f.key===floor);
  const items=fl.key==="parter"?fl.spaces:fl.rooms||[];
  const handlePhoto=(e)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    if(file.size>2*1024*1024){alert("Zdjęcie większe niż 2MB — wybierz mniejsze.");return;}
    const reader=new FileReader();
    reader.onload=()=>setPhoto(reader.result);
    reader.readAsDataURL(file);
  };
  const handleSave=()=>{
    if(!spaceId||!description.trim()){alert("Wybierz pomieszczenie i opisz usterkę.");return;}
    onSave({
      id:crypto.randomUUID(),
      floor, space_id:spaceId,
      description:description.trim(), priority,
      category:category||null,
      assigned_to:assignedTo||null,
      status:"open",
      reported_by:employeeName||"Recepcja",
      reported_at:new Date().toISOString(),
      due_at:dueAt||null,
      photo_url:photo||null,
    });
    onClose();
  };
  return (
    <div className="modal-backdrop" style={{zIndex:1100}}>
      <motion.div initial={{opacity:0,y:12,scale:.97}} animate={{opacity:1,y:0,scale:1}} className="cc-preshift-modal" style={{maxWidth:560}} onClick={e=>e.stopPropagation()}>
        <div className="cc-preshift-header">
          <div style={{width:36,height:36,borderRadius:10,background:"var(--rose-light)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <AlertTriangle size={20} style={{color:"var(--rose)"}}/>
          </div>
          <div style={{flex:1}}>
            <div className="cc-preshift-title">Nowa usterka</div>
            <div className="cc-preshift-sub">Zgłoś problem do konserwatora</div>
          </div>
          <button className="cc-preshift-close" onClick={onClose}><X size={18}/></button>
        </div>
        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label>Piętro</label>
              <select className="input" value={floor} onChange={e=>{setFloor(e.target.value);setSpaceId("");}}>
                {floors.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label>Pomieszczenie / Pokój</label>
              <select className="input" value={spaceId} onChange={e=>setSpaceId(e.target.value)}>
                <option value="">— wybierz —</option>
                {items.map(it=>{const id=fl.key==="parter"?it.id:it.no;const lbl=fl.key==="parter"?it.label:it.no;return <option key={id} value={id}>{lbl}</option>;})}
              </select>
            </div>
          </div>
          <div>
            <label>Opis usterki</label>
            <textarea className="input" rows={4} placeholder="Np. Nie działa klimatyzacja, cieknie bateria w łazience..." value={description} onChange={e=>setDescription(e.target.value)}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label>Priorytet</label>
              <select className="input" value={priority} onChange={e=>setPriority(e.target.value)}>
                <option value="normal">Normalny</option>
                <option value="urgent">Pilne</option>
              </select>
            </div>
            <div>
              <label>Do wykonania (opcjonalnie)</label>
              <input className="input" type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/>
            </div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label>Kategoria (opcjonalnie)</label>
              <select className="input" value={category} onChange={e=>setCategory(e.target.value)}>
                <option value="">— brak —</option>
                {FAULT_CATEGORIES.map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label>Przypisz do (opcjonalnie)</label>
              <select className="input" value={assignedTo} onChange={e=>setAssignedTo(e.target.value)}>
                <option value="">— brak —</option>
                {KONSERWATOR_WORKERS.map(w=><option key={w} value={w}>{w}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label>Zdjęcie (opcjonalnie, do 2MB)</label>
            <input type="file" accept="image/*" onChange={handlePhoto} style={{fontSize:13}}/>
            {photo&&<img src={photo} alt="podgląd" style={{marginTop:8,maxWidth:"100%",maxHeight:120,borderRadius:8,border:"1px solid var(--border-light)"}}/>}
          </div>
        </div>
        <div className="cc-preshift-footer">
          <div style={{fontSize:11.5,color:"var(--text-muted)"}}>Zgłasza: <strong>{employeeName||"Recepcja"}</strong></div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-outline" onClick={onClose}>Anuluj</button>
            <button className="btn btn-rose" onClick={handleSave}>Zgłoś usterkę</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
