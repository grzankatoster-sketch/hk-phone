import React from "react";
import { motion } from "framer-motion";
import { BookOpen } from "lucide-react";

export default function WikiAdminPanel({ wikiEntries, startEditWiki, setShowWiki }) {
  return (
    <motion.div key="wiki-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
      <div className="panel glass dark-panel">
        <div className="panel-title"><BookOpen size={16}/> Wiki recepcji</div>
        <div style={{fontSize:12.5,color:"#948e85",marginBottom:14}}>
          Baza wiedzy widoczna dla pracowników. Dodaj lub edytuj tematy w panelu Wiki (ikonka w górnym pasku).
        </div>
        <div style={{display:"grid",gap:8}}>
          {wikiEntries.map(e=>(
            <div key={e.id} style={{background:"rgba(255,255,255,.04)",border:"1px solid var(--dark-border)",borderRadius:"var(--radius-md)",padding:"12px 14px",display:"flex",alignItems:"flex-start",gap:12}}>
              <div style={{flex:1}}>
                <div style={{fontSize:13.5,fontWeight:700,color:"var(--dark-text)",marginBottom:3}}>{e.topic}</div>
                <div style={{fontSize:12,color:"#635e57",marginBottom:6,lineHeight:1.5,maxHeight:48,overflow:"hidden"}}>{e.content}</div>
                <div style={{fontSize:11,color:"#5f5a54"}}>Aktualizacja: {e.updatedAt}</div>
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
