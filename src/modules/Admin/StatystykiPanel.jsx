import React from "react";
import { motion } from "framer-motion";
import { BarChart2, Trash2 } from "lucide-react";
import { SHIFT_SHORT_LABELS } from "../../lib/constants";
import { todayKey } from "../../lib/dates";

export default function StatystykiPanel({
  weeklyStats,
  employeeActivityLog,
  paymentCorrections,
  activityDay, setActivityDay,
  askConfirm,
  currentManager,
  setEmployeeActivityLog,
  setPaymentCorrections,
  addAudit,
  showToast,
  saveJson,
  STORAGE_KEYS,
}) {
  const handleResetAll = () =>
    askConfirm("Zresetować wszystkie statystyki? (ewidencja, korekty, raporty)", () => {
      setEmployeeActivityLog([]);
      saveJson(STORAGE_KEYS.employeeLog, []);
      setPaymentCorrections([]);
      saveJson(STORAGE_KEYS.paymentCorrections, []);
      saveJson(STORAGE_KEYS.reports, []);
      addAudit(currentManager, "Reset wszystkich statystyk");
      showToast("Statystyki zresetowane.", "info");
    });

  const dayLog = employeeActivityLog.filter(item => {
    if(!item.loginAt)return false;
    const p=item.loginAt.split(".");
    if(p.length<3)return false;
    const y=p[2]?.split(",")[0]?.trim();
    const m=p[1]?.padStart(2,"0");
    const d=p[0]?.padStart(2,"0");
    return`${y}-${m}-${d}`===activityDay;
  });

  return (
    <motion.div key="st" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
      <div className="panel glass dark-panel">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <div className="panel-title" style={{margin:0}}><BarChart2 size={16}/> Statystyki tygodniowe</div>
          <button className="btn btn-danger-outline" style={{fontSize:12.5}} onClick={handleResetAll}><Trash2 size={13}/> Resetuj statystyki</button>
        </div>

        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14,marginBottom:20}}>
          {[
            {label:"Zmian w tym tygodniu",value:weeklyStats.totalShifts,accent:"var(--plum)"},
            {label:"Zakończonych zmian",value:weeklyStats.completedShifts,accent:"var(--emerald)"},
            {label:"Wskaźnik zakończeń",value:weeklyStats.completionRate+"%",accent:weeklyStats.completionRate>=80?"var(--emerald)":"var(--rose)"},
            {label:"Raportów PDF",value:weeklyStats.reportsCount,accent:"var(--plum)"},
            {label:"Korekty łącznie",value:paymentCorrections.length,accent:"var(--gold)"},
          ].map(s=>(
            <div key={s.label} style={{background:"var(--bg-card)",borderRadius:"var(--radius-md)",border:"1px solid var(--border-light)",borderLeft:`4px solid ${s.accent}`,padding:"16px 18px"}}>
              <div style={{fontSize:11,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:8,fontWeight:700}}>{s.label}</div>
              <div style={{fontSize:32,fontWeight:400,color:"var(--text-primary)",lineHeight:1,fontFamily:"'DM Serif Display',serif"}}>{s.value}</div>
            </div>
          ))}
        </div>

        {weeklyStats.topEmp&&weeklyStats.topEmp.name&&(
          <div style={{background:"var(--plum-soft)",borderRadius:"var(--radius-md)",border:"1px solid var(--plum-border)",borderLeft:"4px solid var(--plum)",padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:"var(--plum)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16,fontWeight:800,flexShrink:0}}>{(weeklyStats.topEmp.name||"?")[0]}</div>
            <div>
              <div style={{fontSize:11,color:"var(--plum)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:3,fontWeight:700}}>Najbardziej aktywny pracownik</div>
              <div style={{fontSize:17,fontWeight:400,color:"var(--text-primary)",fontFamily:"'DM Serif Display',serif"}}>
                {weeklyStats.topEmp.name} <span style={{fontSize:12,color:"var(--text-muted)",fontWeight:400,fontFamily:"Inter"}}>({weeklyStats.topEmp.count} zmian)</span>
              </div>
            </div>
          </div>
        )}

        <div style={{fontSize:11.5,color:"var(--text-muted)",marginTop:4}}>
          Statystyki dotyczą bieżącego tygodnia (pon–nd). Dane na podstawie ewidencji w localStorage.
        </div>

        {/* Aktywność dnia */}
        <div style={{marginTop:22,paddingTop:18,borderTop:"1px solid var(--border-light)"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:12}}>
            <div style={{fontSize:12,fontWeight:800,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:".08em"}}>Aktywność dnia</div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <button style={{background:"var(--bg-card)",border:"1px solid var(--border-medium)",borderRadius:7,color:"var(--text-secondary)",padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:600}}
                onClick={()=>{const d=new Date(activityDay);d.setDate(d.getDate()-1);setActivityDay(todayKey(d));}}>&#8249; Wcześniej</button>
              <input type="date" value={activityDay} onChange={e=>setActivityDay(e.target.value)}
                style={{background:"var(--bg-card)",border:"1px solid var(--border-medium)",borderRadius:7,padding:"5px 10px",fontSize:12,color:"var(--text-primary)",outline:"none"}}/>
              <button style={{background:"var(--bg-card)",border:"1px solid var(--border-medium)",borderRadius:7,color:"var(--text-secondary)",padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:600}}
                onClick={()=>{const d=new Date(activityDay);d.setDate(d.getDate()+1);setActivityDay(todayKey(d));}}>Później &#8250;</button>
              <button style={{background:"var(--plum-soft)",border:"1px solid var(--plum-border)",borderRadius:7,color:"var(--plum)",padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:700}}
                onClick={()=>setActivityDay(todayKey())}>Dziś</button>
            </div>
          </div>
          <div className="stack">
            {dayLog.map(item=>(
              <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",borderRadius:"var(--radius-md)",padding:"9px 12px"}}>
                <div style={{width:8,height:8,borderRadius:"50%",background:item.logoutAt?"#2d8659":"#d4a83a",flexShrink:0}}/>
                <div style={{flex:1}}>
                  <div style={{fontSize:13,fontWeight:600,color:"#e8e4de"}}>{item.employee} — {SHIFT_SHORT_LABELS[item.shift]||item.shift}</div>
                  <div style={{fontSize:11,color:"#5f5a54"}}>{item.loginAt}{item.logoutAt?` → ${item.logoutAt}`:""}</div>
                </div>
                <span style={{fontSize:11,padding:"2px 8px",borderRadius:999,background:item.logoutAt?"rgba(45,134,89,.2)":"rgba(212,168,58,.15)",color:item.logoutAt?"#2d8659":"#d4a83a",fontWeight:600}}>
                  {item.logoutAt?"Zakończona":"Trwa"}
                </span>
              </div>
            ))}
            {!dayLog.length&&<div className="empty-box empty-box-dark">Brak aktywności dla wybranego dnia.</div>}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
