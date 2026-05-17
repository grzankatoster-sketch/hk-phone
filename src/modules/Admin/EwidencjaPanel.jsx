import React from "react";
import { motion } from "framer-motion";
import { History, Download, Trash2 } from "lucide-react";
import { SHIFT_LABELS_PL } from "../../lib/constants";

export default function EwidencjaPanel({
  evidenceMonth, setEvidenceMonth,
  availableMonths,
  filteredEvidenceLog,
  exportEvidenceCSV,
  resetEvidenceMonth,
  resetAllEvidence,
}) {
  return (
    <motion.div key="ew" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
      <div className="panel glass dark-panel">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:12}}>
          <div className="panel-title" style={{margin:0}}><History size={16}/> Ewidencja godzin pracowników</div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <select value={evidenceMonth} onChange={e=>setEvidenceMonth(e.target.value)} className="input dark-input" style={{width:"auto",minWidth:140,padding:"7px 12px"}}>
              {availableMonths.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            <button className="btn btn-sky" style={{fontSize:12.5}} onClick={exportEvidenceCSV} disabled={!filteredEvidenceLog.length}><Download size={13}/> Eksportuj CSV</button>
            <button className="btn btn-danger-outline" style={{fontSize:12.5}} onClick={resetEvidenceMonth}><Trash2 size={13}/> Resetuj miesiąc</button>
            <button className="btn btn-danger-outline" style={{fontSize:12.5}} onClick={resetAllEvidence}><Trash2 size={13}/> Resetuj wszystko</button>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>Pracownik</th><th>Zmiana</th><th>Rozpoczęcie</th><th>Zakończenie</th></tr></thead>
            <tbody>
              {filteredEvidenceLog.length
                ? filteredEvidenceLog.map(item=>(
                    <tr key={item.id}>
                      <td>{item.employee}</td>
                      <td>{SHIFT_LABELS_PL[item.shift]||item.shift}</td>
                      <td>{item.loginAt}</td>
                      <td>{item.logoutAt||<span style={{color:"var(--gold)",fontWeight:700}}>&#9679; Trwa zmiana</span>}</td>
                    </tr>
                  ))
                : <tr><td colSpan={4} className="center muted">Brak ewidencji za wybrany miesiąc.</td></tr>
              }
            </tbody>
          </table>
        </div>
        {filteredEvidenceLog.length>0&&(
          <div style={{marginTop:12,fontSize:13,color:"var(--text-muted)"}}>
            Łącznie wpisów: <strong style={{color:"var(--text-primary)",fontFamily:"'DM Serif Display',serif",fontSize:15}}>{filteredEvidenceLog.length}</strong>
          </div>
        )}
      </div>
    </motion.div>
  );
}
