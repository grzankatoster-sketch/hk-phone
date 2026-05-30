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
      {/* ═══ KPI ROW v2 (wspólny wzorzec) ═══ */}
      <div className="cc-kpi-row cc-kpi-row--5">
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Zmian w tygodniu</div>
          <div className="cc-kpi-val">{weeklyStats.totalShifts}</div>
          <div className="cc-kpi-sub">pon–nd</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Zakończonych</div>
          <div className="cc-kpi-val cc-kpi-val--success">{weeklyStats.completedShifts}</div>
          <div className="cc-kpi-sub">z raportem</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Wskaźnik zakończeń</div>
          <div className={`cc-kpi-val${weeklyStats.completionRate>=80?" cc-kpi-val--success":" cc-kpi-val--warn"}`}>{weeklyStats.completionRate}<span className="cc-kpi-unit">%</span></div>
          <div className="cc-kpi-sub">{weeklyStats.completionRate>=80?"dobry poziom":"do poprawy"}</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Raportów PDF</div>
          <div className="cc-kpi-val cc-kpi-val--brand">{weeklyStats.reportsCount}</div>
          <div className="cc-kpi-sub">wygenerowanych</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Korekty łącznie</div>
          <div className="cc-kpi-val cc-kpi-val--gold">{paymentCorrections.length}</div>
          <div className="cc-kpi-sub">płatności</div>
        </div>
      </div>

      <div className="panel glass dark-panel">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <div>
            <div className="panel-title" style={{margin:0}}><BarChart2 size={16}/> Statystyki tygodniowe</div>
            <div className="cc-vsub">bieżący tydzień · dane z ewidencji</div>
          </div>
          <button className="btn btn-danger-outline" style={{fontSize:12.5}} onClick={handleResetAll}><Trash2 size={13}/> Resetuj statystyki</button>
        </div>

        {weeklyStats.topEmp&&weeklyStats.topEmp.name&&(
          <div style={{background:"var(--plum-soft)",borderRadius:"var(--radius-md)",border:"1px solid var(--plum-border)",borderLeft:"4px solid var(--plum)",padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:14}}>
            <div style={{width:44,height:44,borderRadius:"50%",background:"var(--plum)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16,fontWeight:800,flexShrink:0}}>{(weeklyStats.topEmp.name||"?")[0]}</div>
            <div>
              <div style={{fontSize:11,color:"var(--plum)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:3,fontWeight:700}}>Najbardziej aktywny pracownik</div>
              <div style={{fontSize:17,fontWeight:400,color:"var(--text-primary)",fontFamily:"var(--cc-font-display)"}}>
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
          <div>
            {dayLog.map(item=>(
              <div key={item.id} className={`cc-vrow${item.logoutAt?" cc-vrow--success":" cc-vrow--warn"}`}>
                <div className="cc-vrow-dot" style={{background:item.logoutAt?"var(--cc-success)":"var(--cc-warning)"}}/>
                <div className="cc-vrow-main">
                  <div className="cc-vrow-title">{item.employee} — {SHIFT_SHORT_LABELS[item.shift]||item.shift}</div>
                  <div className="cc-vrow-sub">{item.loginAt}{item.logoutAt?` → ${item.logoutAt}`:""}</div>
                </div>
                <span className="cc-vrow-badge" style={{background:item.logoutAt?"color-mix(in srgb,var(--cc-success) 18%,transparent)":"color-mix(in srgb,var(--cc-warning) 18%,transparent)",color:item.logoutAt?"var(--cc-success)":"var(--cc-warning)"}}>
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
