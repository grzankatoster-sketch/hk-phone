import React from "react";
import { Download } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { fmt, todayKey, parseDayKey } from "../../lib/dates";
import { fmtMoney } from "../../lib/format";
import { SHIFT_SHORT_LABELS, SHIFT_LABELS_PL } from "../../lib/constants";
import { downloadDailyReportPDF } from "../../lib/pdf-daily";

function ManualDailyReportPanel({showToast,askConfirm}){
  const [selDayKey,setSelDayKey]=React.useState(()=>todayKey());
  const [excluded,setExcluded]=React.useState({});

  const getDayReports=React.useCallback((dayKey)=>{
    const allFull=loadJson(STORAGE_KEYS.reportsFull,[]);
    return allFull.filter(r=>{
      if(r.dayKey)return r.dayKey===dayKey;
      if(r.savedAt){
        const rDate=new Date(r.savedAt);
        if(isNaN(rDate.getTime()))return false;
        const rShift=r.shiftKey||r.selectedShift;
        if(rShift==="nocna"){
          const d=new Date(rDate);d.setDate(d.getDate()-1);
          return todayKey(d)===dayKey;
        }
        return todayKey(rDate)===dayKey;
      }
      return false;
    });
  },[]);

  const [dayReports,setDayReports]=React.useState(()=>getDayReports(new Date().toISOString().split("T")[0]));

  React.useEffect(()=>{
    setDayReports(getDayReports(selDayKey));
    setExcluded({});
  },[selDayKey,getDayReports]);

  const deleteReport=(id)=>{
    askConfirm("Usunac te zmiane z historii? Tej operacji nie mozna cofnac.",()=>{
      const allFull=loadJson(STORAGE_KEYS.reportsFull,[]);
      saveJson(STORAGE_KEYS.reportsFull,allFull.filter(r=>r.id!==id));
      const allRep=loadJson(STORAGE_KEYS.reports,[]);
      saveJson(STORAGE_KEYS.reports,allRep.filter(r=>r.id!==id));
      setDayReports(prev=>prev.filter(r=>r.id!==id));
      showToast("Zmiana usunieta z historii.","info");
    });
  };

  const generate=()=>{
    try{
      const dayReportsFiltered=dayReports.filter(r=>!excluded[r.id]);
      if(!dayReportsFiltered.length){showToast("Brak zmian do raportu (wszystkie wykluczone lub brak danych).","warning");return;}
      const allEmpLog=loadJson(STORAGE_KEYS.employeeLog,[]);
      const dayShifts=allEmpLog.filter(e=>{
        if(!e.loginAt)return false;
        try{const p=e.loginAt.split(", ");const d=p[0].split(".");
          return`${d[2]}-${d[1].padStart(2,"0")}-${d[0].padStart(2,"0")}`===selDayKey;
        }catch{return false;}
      });
      const shiftOrder=["poranna","dzienna","popoludniowa","wieczorowa","nocna"];
      const shiftsData=shiftOrder.map(s=>{
        const emp=dayShifts.find(e=>e.shift===s);
        return emp?{label:SHIFT_LABELS_PL[s]||s,employee:emp.employee,
          time:`${emp.loginAt}${emp.logoutAt?" - "+emp.logoutAt:""}`,completed:!!emp.logoutAt}:null;
      }).filter(Boolean);
      const shiftOrder2=["poranna","dzienna","popoludniowa","wieczorowa","nocna"];
      const sortedDayReports=[...dayReportsFiltered].sort((a,b)=>shiftOrder2.indexOf(a.shiftKey||a.selectedShift)-shiftOrder2.indexOf(b.shiftKey||b.selectedShift));
      const allTasks=[],allCarry=[],cashRows=[],taskStatsList=[];
      sortedDayReports.forEach(r=>{
        const sl=SHIFT_SHORT_LABELS[r.shiftKey||r.selectedShift]||r.shiftKey||"";
        (r.baseTasks||[]).forEach(t=>allTasks.push({status:t.status,shift:sl,text:t.text}));
        (r.carryOver||[]).forEach(t=>allCarry.push({status:t.status,shift:sl,text:t.text}));
        if(r.safeTotal!=null)cashRows.push({label:`${r.employeeName} - ${sl}`,val:fmtMoney(r.safeTotal)});
        else if(r.cashOpeningAmount!=null)cashRows.push({label:`${r.employeeName} - ${sl}`,val:fmtMoney(parseFloat(r.cashOpeningAmount)||0)});
        if(r.taskStats){taskStatsList.push(r.taskStats);}
        else{const done=(r.baseTasks||[]).filter(t=>t.status==="[OK]"||t.status==="✓").length;const total=(r.baseTasks||[]).length;const missing=(r.baseTasks||[]).filter(t=>t.status==="[X]"||t.status==="✗").map(t=>t.text);taskStatsList.push({employee:r.employeeName,shiftKey:r.shiftKey||r.selectedShift,shiftLabel:SHIFT_LABELS_PL[r.shiftKey||r.selectedShift]||r.shiftKey||sl,done,total,missing});}
      });
      const allNotesList=loadJson(STORAGE_KEYS.handoverNotes,[]);
      const dayNotes=allNotesList.filter(n=>{
        try{const p=n.createdAt.split(", ");const d=p[0].split(".");
          return`${d[2]}-${d[1].padStart(2,"0")}-${d[0].padStart(2,"0")}`===selDayKey;
        }catch{return false;}
      }).map(n=>({status:"-",text:`[${SHIFT_SHORT_LABELS[n.shift]||n.shift}] ${n.employee}: ${n.text}`}));
      const allCorrections=loadJson(STORAGE_KEYS.paymentCorrections,[]);
      const dayCorrections=allCorrections.filter(c=>{
        if(!c.submittedAt)return false;
        try{const p=c.submittedAt.split(", ");const d=p[0].split(".");return`${d[2]}-${d[1].padStart(2,"0")}-${d[0].padStart(2,"0")}`===selDayKey;}catch{return false;}
      });
      const hasNocna=dayReports.some(r=>r.shiftKey==="nocna");
      const hasDzienna=dayReports.some(r=>r.shiftKey==="dzienna");
      const dayLabel=parseDayKey(selDayKey).toLocaleDateString("pl-PL",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
      const allEmpRep=loadJson(STORAGE_KEYS.empReports,[]);
      const dayEmpReports=allEmpRep.filter(r=>{
        if(!r.reportDate)return false;
        try{return r.reportDate===selDayKey;}catch{return false;}
      });
      const taskSummary=taskStatsList.map(ts=>({
        employee:ts.employee,
        shift:SHIFT_SHORT_LABELS[ts.shiftKey||ts.selectedShift]||ts.shiftKey||"",
        done:ts.done||0,
        missed:ts.missing?ts.missing.length:((ts.total||0)-(ts.done||0)),
      }));
      downloadDailyReportPDF({
        generatedAt:fmt(),dateLabel:dayLabel,
        shiftMode:hasDzienna||hasNocna?"Dzienna + Nocna":"Poranna + Popoludniowa + Wieczorowa",
        shifts:shiftsData.length?shiftsData:[],
        taskSummary,
        allNotes:dayNotes,cashRows,corrections:dayCorrections,
        empReports:dayEmpReports,
        filename:`raport_dobowy_${selDayKey}.pdf`,
      });
      showToast(`Raport dobowy (${dayReportsFiltered.length} zmian) wygenerowany.`,"success");
    }catch(e){showToast("Blad: "+e.message,"error");}
  };
  const activeCount=dayReports.filter(r=>!excluded[r.id]).length;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div>
          <label style={{display:"block",fontSize:11.5,fontWeight:600,color:"#948e85",marginBottom:5}}>Data dnia roboczego</label>
          <input type="date" value={selDayKey} onChange={e=>setSelDayKey(e.target.value)}
            style={{background:"rgba(255,255,255,.06)",border:"1px solid var(--dark-border)",borderRadius:"var(--radius-md)",
                    padding:"7px 12px",fontSize:13,color:"var(--dark-text)",outline:"none"}}/>
        </div>
        <button className="btn btn-emerald" onClick={generate} disabled={activeCount===0}>
          <Download size={14}/> Generuj raport dobowy {activeCount>0?`(${activeCount} zmian)`:""}
        </button>
      </div>

      {dayReports.length===0?(
        <div style={{fontSize:12.5,color:"#635e57",padding:"10px 0"}}>Brak zapisanych zmian dla tej daty.</div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <div style={{fontSize:11,fontWeight:700,color:"#948e85",textTransform:"uppercase",letterSpacing:".06em",marginBottom:2}}>
            Zmiany w raporcie &mdash; odznacz lub usun niepotrzebne
          </div>
          {dayReports.map(r=>{
            const isExcluded=!!excluded[r.id];
            const shiftLabel=SHIFT_SHORT_LABELS[r.shiftKey||r.selectedShift]||r.shiftKey||"?";
            const time=r.savedAtLabel||r.savedAt?.slice(11,16)||"";
            return(
              <div key={r.id||r.savedAt} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,
                background:isExcluded?"rgba(248,113,113,.05)":"rgba(52,211,153,.05)",
                border:`1px solid ${isExcluded?"rgba(248,113,113,.2)":"rgba(52,211,153,.15)"}`,
                opacity:isExcluded?.6:1}}>
                <input type="checkbox" checked={!isExcluded}
                  onChange={()=>setExcluded(prev=>({...prev,[r.id]:!prev[r.id]}))}
                  style={{width:16,height:16,cursor:"pointer",accentColor:"#34d399"}}/>
                <div style={{flex:1}}>
                  <span style={{fontWeight:700,fontSize:13,color:isExcluded?"#635e57":"#e8e4de"}}>{shiftLabel}</span>
                  <span style={{fontSize:12,color:"#635e57",marginLeft:8}}>{r.employeeName}</span>
                  {time&&<span style={{fontSize:11,color:"#766A7E",marginLeft:6}}>{time}</span>}
                </div>
                {isExcluded&&<span style={{fontSize:10.5,color:"#f87171",fontWeight:700}}>pominieta</span>}
                <button onClick={()=>deleteReport(r.id)}
                  style={{padding:"3px 8px",borderRadius:6,border:"1px solid rgba(248,113,113,.3)",background:"transparent",
                          color:"#f87171",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}
                  title="Usun te zmiane z historii (trwale)">
                  &times; Usun
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default ManualDailyReportPanel;
