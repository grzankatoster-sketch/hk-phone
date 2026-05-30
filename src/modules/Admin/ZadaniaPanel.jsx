import React from "react";
import { motion } from "framer-motion";
import { Settings, Bell, Plus, Trash2 } from "lucide-react";
import { SHIFT_OPTIONS, SHIFT_LABELS_PL, SHIFT_SHORT_LABELS } from "../../lib/constants";
import { normTask } from "../../lib/format";

export default function ZadaniaPanel({
  tasks,
  taskShiftTarget, setTaskShiftTarget,
  newTaskText, setNewTaskText,
  newTaskTime, setNewTaskTime,
  newTaskUrgent, setNewTaskUrgent,
  newTaskWeekdaysOnly, setNewTaskWeekdaysOnly,
  addTask,
  removeTask,
  adminNotifType, setAdminNotifType,
  newGlobalNote, setNewGlobalNote,
  newGlobalNoteShift, setNewGlobalNoteShift,
  newGlobalNoteDate, setNewGlobalNoteDate,
  globalNotifications,
  addGlobalNotification,
  addManagerTask,
  removeGlobalNotification,
}) {
  const allTasks = SHIFT_OPTIONS.flatMap(s=>(tasks[s]||[])).filter(Boolean);
  const urgentTasks = allTasks.filter(t=>t.urgent).length;
  return (
    <motion.div key="za" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
      {/* ═══ KPI ROW v2 ═══ */}
      <div className="cc-kpi-row cc-kpi-row--3">
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Zadania zmian</div>
          <div className="cc-kpi-val">{allTasks.length}</div>
          <div className="cc-kpi-sub">na {SHIFT_OPTIONS.length} zmianach</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Pilne</div>
          <div className={`cc-kpi-val${urgentTasks>0?" cc-kpi-val--danger":""}`}>{urgentTasks}</div>
          <div className="cc-kpi-sub">czerwona ramka u pracownika</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Powiadomienia globalne</div>
          <div className="cc-kpi-val cc-kpi-val--gold">{globalNotifications.length}</div>
          <div className="cc-kpi-sub">na ekranie startowym</div>
        </div>
      </div>

      {/* Zarządzanie zadaniami zmian */}
      <div className="panel glass dark-panel">
        <div className="panel-title"><Settings size={16}/> Zarządzanie zadaniami zmian</div>
        <div className="task-form-grid">
          <div>
            <label>Zmiana</label>
            <select className="input dark-input" value={taskShiftTarget} onChange={e=>setTaskShiftTarget(e.target.value)}>
              {SHIFT_OPTIONS.map(s=><option key={s} value={s}>{SHIFT_LABELS_PL[s]}</option>)}
            </select>
          </div>
          <div>
            <label>Nowe zadanie</label>
            <input className="input dark-admin-entry" placeholder="Np. potwierdź rezerwacje VIP"
              value={newTaskText} onChange={e=>setNewTaskText(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&addTask()}/>
          </div>
          <div>
            <label>Godzina</label>
            <input className="input dark-input" type="time" value={newTaskTime} onChange={e=>setNewTaskTime(e.target.value)}/>
          </div>
          <div className="align-end">
            <button className="btn btn-rose full" onClick={addTask}><Plus size={14}/> Dodaj</button>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10,padding:"9px 13px",background:"rgba(154,48,64,.08)",border:"1px solid rgba(154,48,64,.2)",borderRadius:"var(--radius-md)"}}>
          <input type="checkbox" id="urgChk" checked={newTaskUrgent} onChange={e=>setNewTaskUrgent(e.target.checked)} style={{width:16,height:16,flexShrink:0}}/>
          <label htmlFor="urgChk" style={{textTransform:"none",fontSize:13,color:"#e07070",fontWeight:600,margin:0,cursor:"pointer",letterSpacing:0}}>Oznacz jako pilne (czerwona ramka na liście zadań pracownika)</label>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8,padding:"9px 13px",background:"rgba(43,110,138,.08)",border:"1px solid rgba(43,110,138,.2)",borderRadius:"var(--radius-md)"}}>
          <input type="checkbox" id="wdChk" checked={newTaskWeekdaysOnly} onChange={e=>setNewTaskWeekdaysOnly(e.target.checked)} style={{width:16,height:16,flexShrink:0}}/>
          <label htmlFor="wdChk" style={{textTransform:"none",fontSize:13,color:"#6aabcc",fontWeight:600,margin:0,cursor:"pointer",letterSpacing:0}}>Tylko dni robocze — Pon–Pt (zadanie nie pojawia się w sobotę i niedzielę)</label>
        </div>
        <div className="tabs">
          <div className="tab-head">
            {SHIFT_OPTIONS.map(s=>(
              <button key={s} className={`tab-btn ${taskShiftTarget===s?"tab-btn-active":""}`} onClick={()=>setTaskShiftTarget(s)}>{SHIFT_SHORT_LABELS[s]}</button>
            ))}
          </div>
          <div className="stack">
            {(tasks[taskShiftTarget]||[]).map((task,index)=>{
              if(!task)return null;
              const t=normTask(task,`${taskShiftTarget}-${index}`);
              return(
                <div key={`${taskShiftTarget}-${t.id}`} className={`task-row dark-row ${t.urgent?"task-row-urgent":""}`}>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                      {t.urgent&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:999,background:"rgba(154,48,64,.25)",color:"#e07070",fontWeight:700,flexShrink:0}}>PILNE</span>}
                      {t.weekdaysOnly&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:999,background:"rgba(43,110,138,.25)",color:"#6aabcc",fontWeight:700,flexShrink:0}}>Pn–Pt</span>}
                      <div>{t.text}</div>
                    </div>
                    {t.scheduledTime&&<div className="tiny muted-light">Godzina: {t.scheduledTime}</div>}
                  </div>
                  <button className="icon-btn icon-btn-danger" onClick={()=>removeTask(taskShiftTarget,index)}><Trash2 size={14}/></button>
                </div>
              );
            })}
            {!(tasks[taskShiftTarget]||[]).length&&<div className="empty-box empty-box-dark">Brak zadań dla tej zmiany.</div>}
          </div>
        </div>
      </div>

      {/* Powiadomienia globalne */}
      <div className="panel glass dark-panel">
        <div className="panel-title" style={{marginBottom:12}}><Bell size={16}/> Powiadomienia dla wszystkich zmian</div>
        <div style={{fontSize:12.5,color:"var(--dark-text-secondary)",marginBottom:14,lineHeight:1.6}}>Widoczne na ekranie startowym pracownika przed rozpoczęciem zmiany. Każdy może zamknąć u siebie — usunięcia dokonuje kierownik.</div>
        <div style={{display:"flex",gap:0,marginBottom:10,borderRadius:"var(--radius-md)",overflow:"hidden",border:"1px solid rgba(255,255,255,.12)"}}>
          {[["notif","&#128276; Powiadomienie"],["task","&#10003; Zadanie dla zmiany"]].map(([v,l])=>(
            <button key={v} onClick={()=>setAdminNotifType(v)}
              style={{flex:1,padding:"8px",border:"none",cursor:"pointer",fontSize:12.5,fontWeight:600,
                      background:adminNotifType===v?"rgba(245,158,11,.18)":"rgba(255,255,255,.05)",
                      color:adminNotifType===v?"#fbbf24":"#948e85"}}
              dangerouslySetInnerHTML={{__html:l}}/>
          ))}
        </div>
        <div style={{display:"grid",gap:10,marginBottom:14}}>
          <input className="input dark-admin-entry"
            placeholder={adminNotifType==="notif"?"Treść powiadomienia — np. Coś leży na dole recepcji":"Treść zadania — np. Sprawdzić rezerwacje na jutro"}
            value={newGlobalNote} onChange={e=>setNewGlobalNote(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&(adminNotifType==="notif"?addGlobalNotification():addManagerTask())}/>
          <div style={{display:"flex",gap:10,alignItems:"center"}}>
            <select className="input dark-input" style={{flex:1}} value={newGlobalNoteShift} onChange={e=>setNewGlobalNoteShift(e.target.value)}>
              <option value="">{adminNotifType==="notif"?"Wszystkie zmiany (ogólne)":"— Wybierz zmianę —"}</option>
              {SHIFT_OPTIONS.map(s=><option key={s} value={s}>{SHIFT_LABELS_PL[s]}</option>)}
            </select>
            {(adminNotifType==="task"||newGlobalNoteShift)&&(
              <input className="input dark-input" type="date" value={newGlobalNoteDate}
                onChange={e=>setNewGlobalNoteDate(e.target.value)}
                style={{width:140,flexShrink:0}} title="Data (dla zadań i przypomnień na konkretny dzień)"/>
            )}
            <button className="btn btn-amber"
              onClick={adminNotifType==="notif"?addGlobalNotification:addManagerTask}
              disabled={!newGlobalNote.trim()||(adminNotifType==="task"&&!newGlobalNoteShift)}>
              <Plus size={14}/> {adminNotifType==="notif"?"Dodaj powiadomienie":"Dodaj zadanie"}
            </button>
          </div>
        </div>
        {globalNotifications.length===0?(
          <div className="empty-box empty-box-dark">Brak aktywnych powiadomień.</div>
        ):(
          <div style={{display:"grid",gap:7}}>
            {globalNotifications.map(n=>(
              <div key={n.id} style={{display:"flex",alignItems:"flex-start",gap:10,background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.2)",borderRadius:"var(--radius-md)",padding:"10px 13px"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",gap:7,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                    {n.targetShift
                      ?<span style={{fontSize:10.5,padding:"1px 8px",borderRadius:999,background:"rgba(245,158,11,.2)",color:"#fbbf24",fontWeight:700}}>{SHIFT_SHORT_LABELS[n.targetShift]||n.targetShift}</span>
                      :<span style={{fontSize:10.5,padding:"1px 8px",borderRadius:999,background:"rgba(255,255,255,.1)",color:"var(--dark-text-muted)",fontWeight:600}}>Wszystkie zmiany</span>
                    }
                  </div>
                  <div style={{fontSize:13,color:"var(--dark-text)",lineHeight:1.5}}>{n.text}</div>
                  <div style={{fontSize:11,color:"var(--dark-text-muted)",marginTop:3}}>{n.createdBy} · {n.createdAt}</div>
                </div>
                <button className="btn btn-danger-outline" style={{fontSize:12,flexShrink:0}} onClick={()=>removeGlobalNotification(n.id)}>Usuń</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}
