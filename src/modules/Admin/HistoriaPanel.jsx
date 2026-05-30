import React from "react";
import { motion } from "framer-motion";
import { FileDown, Bell, ArrowLeftRight, AlertTriangle, Trash2 } from "lucide-react";
import { SHIFT_SHORT_LABELS } from "../../lib/constants";
import ManualDailyReportPanel from "./ManualDailyReportPanel";

export default function HistoriaPanel({
  incidentLog, setIncidentLog,
  carryOverTasks, setCarryOverTasks,
  handoverLog, setHandoverLog,
  askConfirm,
  currentManager,
  addAudit,
  showToast,
  saveJson,
  STORAGE_KEYS,
}) {
  const activeCarry = Object.values(carryOverTasks||{}).flat().filter(t=>t&&!t.done).length;
  const unresolvedInc = incidentLog.filter(i=>!i.resolved).length;
  return (
    <motion.div key="hist" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="stack">
      {/* ═══ KPI ROW v2 ═══ */}
      <div className="cc-kpi-row">
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Przekazane aktywne</div>
          <div className="cc-kpi-val cc-kpi-val--brand">{activeCarry}</div>
          <div className="cc-kpi-sub">zadań do wykonania</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Zmiany bez raportu</div>
          <div className={`cc-kpi-val${unresolvedInc>0?" cc-kpi-val--danger":" cc-kpi-val--success"}`}>{unresolvedInc}</div>
          <div className="cc-kpi-sub">{unresolvedInc>0?"wymaga wyjaśnienia":"wszystko OK"}</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Historia przekazań</div>
          <div className="cc-kpi-val">{handoverLog.length}</div>
          <div className="cc-kpi-sub">wpisów w logu</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Incydenty łącznie</div>
          <div className="cc-kpi-val cc-kpi-val--gold">{incidentLog.length}</div>
          <div className="cc-kpi-sub">{incidentLog.filter(i=>i.resolved).length} wyjaśnionych</div>
        </div>
      </div>

      {/* Ręczne generowanie raportu dobowego */}
      <div className="panel glass dark-panel">
        <div className="panel-title" style={{margin:0,marginBottom:12}}><FileDown size={16}/> Generuj raport dobowy</div>
        <div style={{fontSize:12.5,color:"#948e85",marginBottom:14,lineHeight:1.6}}>
          Raport dobowy generuje się automatycznie po zakończeniu zmiany wieczorowej lub nocnej. Możesz też wygenerować go ręcznie dla dowolnego dnia — zbiera wszystkie raporty zmian z wybranej daty.
        </div>
        <ManualDailyReportPanel showToast={showToast}/>
      </div>

      {/* Niezakończone zmiany */}
      {incidentLog.filter(i=>!i.resolved).length>0&&(
        <div className="panel" style={{borderLeft:"4px solid var(--rose)",background:"var(--rose-light)"}}>
          <div style={{fontSize:15,fontWeight:400,color:"var(--rose)",marginBottom:12,display:"flex",alignItems:"center",gap:8,fontFamily:"var(--cc-font-display)"}}>
            <AlertTriangle size={18}/> Niezakończone zmiany bez raportu ({incidentLog.filter(i=>!i.resolved).length})
          </div>
          <div style={{display:"grid",gap:8}}>
            {incidentLog.filter(i=>!i.resolved).map(inc=>(
              <div key={inc.id} style={{background:"var(--bg-card)",border:"1px solid var(--rose-border)",borderLeft:"3px solid var(--rose)",borderRadius:"var(--radius-md)",padding:"12px 15px",display:"flex",gap:12,alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:5,alignItems:"center"}}>
                    <span style={{fontSize:13.5,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--cc-font-display)"}}>{inc.employee}</span>
                    <span style={{fontSize:10.5,padding:"2px 9px",borderRadius:999,background:"var(--rose)",color:"#fff",fontWeight:800,letterSpacing:".04em",textTransform:"uppercase"}}>{SHIFT_SHORT_LABELS[inc.shift]||inc.shift}</span>
                  </div>
                  <div style={{fontSize:12,color:"var(--text-muted)"}}>Zalogował(a): {inc.startedAt} · Opuścił(a) bez raportu: {inc.abandonedAt}</div>
                  <div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>Aktywność: {inc.minutesActive} min · Zadania: {inc.tasksCompleted}/{inc.totalTasks}</div>
                </div>
                <button className="btn btn-outline" style={{fontSize:12,flexShrink:0}} onClick={()=>{
                  const u=incidentLog.map(i=>i.id===inc.id?{...i,resolved:true}:i);
                  setIncidentLog(u);saveJson(STORAGE_KEYS.incidentLog,u);
                }}>Wyjaśnione</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Aktywne zadania przekazane */}
      <div className="panel glass dark-panel">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div className="panel-title" style={{margin:0}}><ArrowLeftRight size={16}/> Aktywne zadania przekazane</div>
        </div>
        {(()=>{
          const allCarry=Object.entries(carryOverTasks).flatMap(([shift,tasks])=>(tasks||[]).map(t=>({...t,shift})));
          const active=allCarry.filter(t=>!t.done),done=allCarry.filter(t=>t.done);
          if(!allCarry.length)return <div className="empty-box empty-box-dark">Brak przekazanych zadań.</div>;
          const removeTask=(t)=>{const u={...carryOverTasks,[t.shift]:(carryOverTasks[t.shift]||[]).filter(x=>x.id!==t.id&&x.text!==t.text)};setCarryOverTasks(u);saveJson(STORAGE_KEYS.carry,u);showToast("Zadanie usunięte.","info");};
          return(
            <div style={{display:"grid",gap:8}}>
              {active.length>0&&<div style={{fontSize:11,color:"var(--dark-text-muted)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:2}}>Aktywne ({active.length})</div>}
              {active.map((t,i)=>(
                <div key={t.id||i} style={{display:"flex",gap:10,alignItems:"flex-start",background:"rgba(255,255,255,.04)",border:"1px solid rgba(45,106,79,.25)",borderRadius:"var(--radius-md)",padding:"10px 13px"}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:"var(--dark-text)",fontWeight:600,marginBottom:3}}>{t.text}</div>
                    <div style={{fontSize:11,color:"var(--dark-text-muted)"}}>Zmiana: {SHIFT_SHORT_LABELS[t.shift]||t.shift} · Dodane przez: {t.createdBy||"—"} · {t.createdAt||""}</div>
                  </div>
                  <button className="btn btn-danger-outline" style={{fontSize:11.5,flexShrink:0}} onClick={()=>removeTask(t)}>Usuń</button>
                </div>
              ))}
              {done.length>0&&<div style={{fontSize:11,color:"var(--dark-text-muted)",textTransform:"uppercase",letterSpacing:".07em",marginTop:6,marginBottom:2}}>Wykonane ({done.length})</div>}
              {done.map((t,i)=>(
                <div key={(t.id||i)+'d'} style={{display:"flex",gap:10,alignItems:"flex-start",background:"rgba(45,106,79,.06)",border:"1px solid rgba(45,106,79,.2)",borderRadius:"var(--radius-md)",padding:"10px 13px",opacity:.75}}>
                  <div style={{flex:1}}>
                    <div style={{fontSize:13,color:"var(--dark-text-muted)",textDecoration:"line-through"}}>{t.text}</div>
                    <div style={{fontSize:11,color:"var(--dark-text-muted)"}}>Zmiana: {SHIFT_SHORT_LABELS[t.shift]||t.shift} · {t.doneBy&&`Wykonane: ${t.doneBy}`}</div>
                  </div>
                  <button className="btn btn-danger-outline" style={{fontSize:11.5,flexShrink:0}} onClick={()=>removeTask(t)}>Usuń</button>
                </div>
              ))}
            </div>
          );
        })()}
      </div>

      {/* Historia przekazań */}
      <div className="panel glass dark-panel">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div className="panel-title" style={{margin:0}}><Bell size={16}/> Historia powiadomień i przypomnień</div>
          <div style={{display:"flex",gap:8,alignItems:"center"}}>
            <span style={{fontSize:12,color:"#635e57"}}>{handoverLog.length} wpisów</span>
            {handoverLog.length>0&&(
              <button className="btn btn-danger-outline" style={{fontSize:12}}
                onClick={()=>askConfirm("Wyczyścić historię przekazań?",()=>{setHandoverLog([]);saveJson(STORAGE_KEYS.handoverLog,[]);showToast("Historia wyczyszczona.","info");})}><Trash2 size={12}/> Wyczyść</button>
            )}
          </div>
        </div>
        {handoverLog.length===0?(
          <div className="empty-box empty-box-dark">Brak historii przekazań.</div>
        ):(
          <div style={{display:"grid",gap:8,maxHeight:520,overflowY:"auto"}}>
            {handoverLog.map(log=>(
              <div key={log.id} style={{background:log.type==="reminder"?"rgba(43,110,138,.07)":"rgba(45,106,79,.06)",border:`1px solid ${log.type==="reminder"?"rgba(43,110,138,.25)":"rgba(45,106,79,.2)"}`,borderRadius:"var(--radius-md)",padding:"11px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:6}}>
                  <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
                    <span style={{fontSize:10.5,padding:"2px 9px",borderRadius:999,background:log.type==="reminder"?"rgba(43,110,138,.2)":"rgba(45,106,79,.2)",color:log.type==="reminder"?"#6aabcc":"#5acc94",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em"}}>{log.type==="reminder"?"Przypomnienie":"Zadanie"}</span>
                    <span style={{fontSize:12.5,fontWeight:700,color:"var(--dark-text)"}}>{log.from}</span>
                    <span style={{fontSize:11.5,color:"#635e57"}}>→ {SHIFT_SHORT_LABELS[log.toShift]||log.toShift}</span>
                    {log.type==="reminder"&&log.targetDate&&<span style={{fontSize:11,padding:"1px 7px",borderRadius:999,background:"rgba(43,110,138,.15)",color:"#6aabcc",fontWeight:600}}>{log.targetDate}</span>}
                  </div>
                  <span style={{fontSize:11,color:"#5f5a54",flexShrink:0,whiteSpace:"nowrap"}}>{log.createdAt}</span>
                </div>
                <div style={{fontSize:13,color:"var(--dark-text)",lineHeight:1.55}}>{log.text}</div>
                <div style={{fontSize:11,color:"#5f5a54",marginTop:5}}>Ze zmiany: {SHIFT_SHORT_LABELS[log.fromShift]||log.fromShift||"—"}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Historia incydentów */}
      {incidentLog.length>0&&(
        <div className="panel glass dark-panel">
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
            <div className="panel-title" style={{margin:0,color:"#e07070"}}><AlertTriangle size={16}/> Historia incydentów</div>
            <button className="btn btn-danger-outline" style={{fontSize:12}}
              onClick={()=>askConfirm("Wyczyścić historię incydentów?",()=>{setIncidentLog([]);saveJson(STORAGE_KEYS.incidentLog,[]);showToast("Historia incydentów wyczyszczona.","info");})}><Trash2 size={12}/> Wyczyść</button>
          </div>
          <div style={{display:"grid",gap:7,maxHeight:320,overflowY:"auto"}}>
            {incidentLog.map(inc=>(
              <div key={inc.id} style={{background:inc.resolved?"rgba(45,106,79,.05)":"rgba(154,48,64,.07)",border:`1px solid ${inc.resolved?"rgba(45,106,79,.2)":"rgba(154,48,64,.25)"}`,borderRadius:"var(--radius-md)",padding:"10px 13px",display:"flex",alignItems:"flex-start",gap:10}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center",marginBottom:4}}>
                    <span style={{fontSize:12.5,fontWeight:700,color:"var(--dark-text)"}}>{inc.employee}</span>
                    <span style={{fontSize:11,padding:"2px 7px",borderRadius:999,background:"rgba(154,48,64,.2)",color:"#e07070",fontWeight:600}}>{SHIFT_SHORT_LABELS[inc.shift]||inc.shift}</span>
                    {inc.resolved&&<span style={{fontSize:11,padding:"2px 7px",borderRadius:999,background:"rgba(45,106,79,.2)",color:"#5acc94",fontWeight:600}}>&#10003; Wyjaśnione</span>}
                  </div>
                  <div style={{fontSize:11.5,color:"#948e85"}}>{inc.startedAt} → {inc.abandonedAt} · {inc.minutesActive} min · {inc.tasksCompleted}/{inc.totalTasks} zadań</div>
                </div>
                {!inc.resolved&&(
                  <button className="btn btn-outline-dark" style={{fontSize:11.5,flexShrink:0}} onClick={()=>{
                    const u=incidentLog.map(i=>i.id===inc.id?{...i,resolved:true}:i);
                    setIncidentLog(u);saveJson(STORAGE_KEYS.incidentLog,u);
                  }}>Wyjaśnione</button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
