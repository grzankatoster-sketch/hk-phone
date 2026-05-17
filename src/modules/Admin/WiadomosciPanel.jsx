import React from "react";
import { motion } from "framer-motion";
import AdminMessagesPanel from "./AdminMessagesPanel";

export default function WiadomosciPanel({
  weeklyStats,
  employeeActivityLog,
  pendingCorrections,
  paymentCorrections,
  messages, setMessages,
  setAdminTab,
  adminDark,
}) {
  const unreadCount = messages.filter(m => !m.readByAdmin).length;

  return (
    <motion.div key="wiad" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="stack">
      {/* Bento KPI */}
      <div className="cc-bento-grid">
        <div className="cc-bento-card cc-bento-2x" style={{borderLeft:"4px solid var(--plum)"}}>
          <div className="cc-bento-label">Zmian w tygodniu</div>
          <div className="cc-bento-value-xl">{weeklyStats.totalShifts}</div>
          <div className="cc-bento-sub">{weeklyStats.completedShifts} zakończonych · {weeklyStats.completionRate}% wskaźnik</div>
          <div className="cc-kpi-bar" style={{marginTop:12}}><div className="cc-kpi-bar-fill" style={{width:`${weeklyStats.completionRate}%`}}/></div>
        </div>

        <div className="cc-bento-card" style={{borderLeft:"4px solid var(--emerald)"}}>
          <div className="cc-bento-label">Aktywni pracownicy</div>
          <div className="cc-bento-value">{employeeActivityLog.filter(i=>!i.logoutAt).length}</div>
          <div className="cc-bento-sub">teraz na zmianie</div>
        </div>

        <div className="cc-bento-card" style={{borderLeft:`4px solid ${pendingCorrections.length>0?"var(--rose)":"var(--emerald)"}`,cursor:"pointer"}}
          onClick={()=>setAdminTab("korekty")}>
          <div className="cc-bento-label">Korekty</div>
          <div className="cc-bento-value" style={{color:pendingCorrections.length>0?"var(--rose)":undefined}}>
            {pendingCorrections.length}
            {pendingCorrections.length>0&&<span style={{fontSize:14,marginLeft:6,verticalAlign:"middle"}}>nowych!</span>}
          </div>
          <div className="cc-bento-sub">{paymentCorrections.length} łącznie</div>
        </div>

        {weeklyStats.topEmp&&weeklyStats.topEmp.name&&(
          <div className="cc-bento-card" style={{borderLeft:"4px solid var(--gold)"}}>
            <div className="cc-bento-label">Najbardziej aktywny</div>
            <div style={{display:"flex",alignItems:"center",gap:10,marginTop:6}}>
              <div style={{width:36,height:36,borderRadius:"50%",background:"var(--plum)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,flexShrink:0}}>{(weeklyStats.topEmp.name||"?")[0]}</div>
              <div>
                <div style={{fontFamily:"'DM Serif Display',serif",fontSize:17,color:"var(--dark-text)"}}>{weeklyStats.topEmp.name}</div>
                <div style={{fontSize:11,color:"var(--text-muted)",marginTop:1}}>{weeklyStats.topEmp.count} zmian</div>
              </div>
            </div>
          </div>
        )}

        <div className="cc-bento-card cc-bento-2x" style={{borderLeft:`4px solid ${unreadCount>0?"var(--rose)":"var(--plum)"}`}}>
          <div className="cc-bento-label">
            Wiadomości
            {unreadCount>0&&<span style={{marginLeft:8,fontSize:10,padding:"2px 8px",borderRadius:999,background:"var(--rose)",color:"#fff",fontWeight:800}}>{unreadCount} NOWYCH</span>}
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:10,maxHeight:140,overflowY:"auto"}}>
            {messages.length===0?(
              <div style={{fontSize:12,color:"var(--text-muted)",fontStyle:"italic"}}>Brak wiadomości.</div>
            ):messages.slice(0,4).map(m=>(
              <div key={m.id} style={{padding:"7px 10px",fontSize:12,background:m.readByAdmin?"transparent":"var(--rose-light)",borderRadius:6,borderLeft:`2px solid ${m.type==="bug"?"var(--rose)":"var(--plum)"}`}}>
                <strong>{m.sender}</strong>: {m.text.slice(0,60)}{m.text.length>60?"…":""}
              </div>
            ))}
          </div>
        </div>
      </div>

      <AdminMessagesPanel messages={messages} setMessages={setMessages} dark={adminDark}/>
    </motion.div>
  );
}
