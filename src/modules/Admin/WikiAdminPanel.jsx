import React from "react";
import { motion } from "framer-motion";
import { BookOpen } from "lucide-react";

export default function WikiAdminPanel({ wikiEntries, startEditWiki, setShowWiki }) {
  const recent = wikiEntries.filter(e=>{ const t=e.updatedAt?new Date(e.updatedAt).getTime():0; return t&&(Date.now()-t)<7*86400000; }).length;
  const totalChars = wikiEntries.reduce((s,e)=>s+(e.content?.length||0),0);
  return (
    <motion.div key="wiki-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
      {/* ═══ KPI ROW v2 ═══ */}
      <div className="cc-kpi-row cc-kpi-row--3">
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Wpisy Wiki</div>
          <div className="cc-kpi-val">{wikiEntries.length}</div>
          <div className="cc-kpi-sub">tematów w bazie</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Zaktualizowane</div>
          <div className="cc-kpi-val cc-kpi-val--success">{recent}</div>
          <div className="cc-kpi-sub">w ostatnich 7 dniach</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Objętość</div>
          <div className="cc-kpi-val cc-kpi-val--brand">{(totalChars/1000).toFixed(1)}<span className="cc-kpi-unit"> tys. zn.</span></div>
          <div className="cc-kpi-sub">łącznie treści</div>
        </div>
      </div>

      <div className="panel glass dark-panel">
        <div>
          <div className="panel-title" style={{margin:0}}><BookOpen size={16}/> Wiki recepcji</div>
          <div className="cc-vsub">baza wiedzy dla pracowników · edycja w panelu Wiki (ikona w górnym pasku)</div>
        </div>
        <div style={{marginTop:14}}>
          {wikiEntries.map(e=>(
            <div key={e.id} className="cc-vrow cc-vrow--accent" style={{alignItems:"flex-start"}}>
              <div className="cc-vrow-main">
                <div className="cc-vrow-title">{e.topic}</div>
                <div style={{fontSize:12,color:"var(--cc-text-muted)",margin:"4px 0 5px",lineHeight:1.5,maxHeight:48,overflow:"hidden"}}>{e.content}</div>
                <div className="cc-vrow-sub">Aktualizacja: {e.updatedAt}</div>
              </div>
              <button className="btn btn-outline-dark" style={{fontSize:12,flexShrink:0}}
                onClick={()=>{startEditWiki(e);setShowWiki(true);}}>Edytuj</button>
            </div>
          ))}
          {!wikiEntries.length&&<div className="empty-box empty-box-dark">Brak wpisów wiki.</div>}
        </div>
      </div>
    </motion.div>
  );
}
