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
  const doneCount = filteredEvidenceLog.filter(i=>i.logoutAt).length;
  const activeCount = filteredEvidenceLog.length - doneCount;
  return (
    <motion.div key="ew" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
      {/* ═══ KPI ROW v2 ═══ */}
      <div className="cc-kpi-row cc-kpi-row--3">
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Wpisy ({evidenceMonth})</div>
          <div className="cc-kpi-val">{filteredEvidenceLog.length}</div>
          <div className="cc-kpi-sub">zmian w miesiącu</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Zakończone</div>
          <div className="cc-kpi-val cc-kpi-val--success">{doneCount}</div>
          <div className="cc-kpi-sub">z wylogowaniem</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Trwające</div>
          <div className={`cc-kpi-val${activeCount>0?" cc-kpi-val--gold":""}`}>{activeCount}</div>
          <div className="cc-kpi-sub">{activeCount>0?"bez wylogowania":"brak otwartych"}</div>
        </div>
      </div>

      <div className="panel glass dark-panel">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:12}}>
          <div>
            <div className="panel-title" style={{margin:0}}><History size={16}/> Ewidencja godzin pracowników</div>
            <div className="cc-vsub">{filteredEvidenceLog.length} wpisów · {evidenceMonth}</div>
          </div>
          <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <select value={evidenceMonth} onChange={e=>setEvidenceMonth(e.target.value)} className="input dark-input" style={{width:"auto",minWidth:140,padding:"7px 12px"}}>
              {availableMonths.map(m=><option key={m} value={m}>{m}</option>)}
            </select>
            <button className="btn btn-sky" style={{fontSize:12.5}} onClick={exportEvidenceCSV} disabled={!filteredEvidenceLog.length}><Download size={13}/> Eksportuj CSV</button>
            <button className="btn btn-danger-outline" style={{fontSize:12.5}} onClick={resetEvidenceMonth}><Trash2 size={13}/> Resetuj miesiąc</button>
            <button className="btn btn-danger-outline" style={{fontSize:12.5}} onClick={resetAllEvidence}><Trash2 size={13}/> Resetuj wszystko</button>
          </div>
        </div>
        {filteredEvidenceLog.length ? (
          <div>
            {filteredEvidenceLog.map(item=>(
              <div key={item.id} className={`cc-vrow${item.logoutAt?"":" cc-vrow--warn"}`}>
                <div className="cc-vrow-dot" style={{background:item.logoutAt?"var(--cc-success)":"var(--cc-warning)"}}/>
                <div className="cc-vrow-main">
                  <div className="cc-vrow-title">{item.employee} <span style={{fontWeight:400,color:"var(--cc-text-muted)",fontSize:12}}>· {SHIFT_LABELS_PL[item.shift]||item.shift}</span></div>
                  <div className="cc-vrow-sub">{item.loginAt}{item.logoutAt?` → ${item.logoutAt}`:""}</div>
                </div>
                {item.logoutAt
                  ? <span className="cc-vrow-badge" style={{background:"color-mix(in srgb,var(--cc-success) 18%,transparent)",color:"var(--cc-success)"}}>Zakończona</span>
                  : <span className="cc-vrow-badge" style={{background:"color-mix(in srgb,var(--cc-warning) 18%,transparent)",color:"var(--cc-warning)"}}>● Trwa</span>}
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-box empty-box-dark">Brak ewidencji za wybrany miesiąc.</div>
        )}
      </div>
    </motion.div>
  );
}
