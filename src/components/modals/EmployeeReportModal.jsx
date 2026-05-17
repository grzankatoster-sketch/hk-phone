import { useState } from "react";
import { motion } from "framer-motion";
import { X, FileText, Download, AlertTriangle } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { todayKey, fmtA } from "../../lib/dates";
import { buildEmpFn } from "../../lib/format";

export default function EmployeeReportModal({employees,dark,onClose,currentEmployeeName="",onDownload}){
  const today=todayKey();
  const [author,setAuthor]=useState(currentEmployeeName||"");
  const [handoverTo,setHandoverTo]=useState("");
  const [subject,setSubject]=useState("");
  const [reportDate,setReportDate]=useState(today);
  const [content,setContent]=useState("");
  const [error,setError]=useState("");

  const handleDownload=()=>{
    if(!author||!handoverTo||!subject||!content.trim()){setError("Wypełnij wszystkie pola przed pobraniem raportu.");return;}
    setError("");
    const now=new Date();
    const filename=buildEmpFn(author,now);
    const reportData={author,handoverTo,subject,reportDate,content,createdAt:fmtA(now),filename};
    saveJson(STORAGE_KEYS.empReports,[{...reportData,id:crypto.randomUUID()},...loadJson(STORAGE_KEYS.empReports,[])]);
    try{onDownload(reportData);}catch(e){console.error(e);}
    onClose();
  };

  const inp="input "+(dark?"dark-input":"");
  const ta="textarea "+(dark?"dark-input":"");

  return(
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div initial={{opacity:0,scale:.96}} animate={{opacity:1,scale:1}} exit={{opacity:0}} className={"modal large-modal "+(dark?"dark-modal":"")} onClick={e=>e.stopPropagation()} style={{maxWidth:620}}>
        <div style={{background:"var(--plum)",borderRadius:"var(--radius-lg) var(--radius-lg) 0 0",margin:"-26px -26px 22px",padding:"18px 26px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{color:"#fff",fontWeight:400,fontSize:20,display:"flex",alignItems:"center",gap:10,fontFamily:"var(--cc-font-display)",letterSpacing:".005em"}}>
              <FileText size={18}/> Notatka służbowa
            </div>
            <div style={{color:"rgba(255,255,255,.7)",fontSize:12,marginTop:3}}>Wypełnij formularz i pobierz PDF</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.12)",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",padding:"7px 10px",display:"flex",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.2)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.12)"}><X size={16}/></button>
        </div>
        <div className="stack" style={{gap:14}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div><label>Pracownik (autor raportu)</label><select className={inp} value={author} onChange={e=>setAuthor(e.target.value)}><option value="">Wybierz z listy</option>{employees.map(e=><option key={e} value={e}>{e}</option>)}</select></div>
            <div><label>Przekazuje raport dla</label><input className={inp} placeholder="Np. Kierownik / Anna" value={handoverTo} onChange={e=>setHandoverTo(e.target.value)}/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:14}}>
            <div><label>Temat raportu</label><input className={inp} placeholder="Np. Reklamacja pokój 214..." value={subject} onChange={e=>setSubject(e.target.value)}/></div>
            <div><label>Data raportu</label><input className={inp} type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)}/></div>
          </div>
          <div><label>Treść raportu</label><textarea className={ta} placeholder="Opisz zdarzenie, podjęte działania..." value={content} onChange={e=>setContent(e.target.value)} style={{minHeight:190}}/><div style={{fontSize:11.5,color:"var(--text-faint)",marginTop:4,textAlign:"right"}}>{content.length} znaków</div></div>
          {error&&<div className="alert" style={{display:"flex",alignItems:"center",gap:8}}><AlertTriangle size={14}/> {error}</div>}
        </div>
        <div className="modal-footer">
          <button className={dark?"btn btn-outline-dark":"btn btn-outline"} onClick={onClose}>Anuluj</button>
          <button className="btn btn-indigo" onClick={handleDownload} disabled={!author||!handoverTo||!subject||!content.trim()}><Download size={14}/> Pobierz raport PDF</button>
        </div>
      </motion.div>
    </div>
  );
}
