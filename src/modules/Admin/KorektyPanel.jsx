import React from "react";
import { motion } from "framer-motion";
import { FileText, FileDown, Trash2 } from "lucide-react";
import { SHIFT_SHORT_LABELS } from "../../lib/constants";
import { getFullName } from "../../lib/employees";
import { getCanonicalManagerName } from "../../lib/names";

function getApprovalForManager(approvals, manager) {
  const approvalMap = approvals || {};
  const key = getCanonicalManagerName(manager, Object.keys(approvalMap)) || manager;
  return approvalMap[manager] || approvalMap[key];
}

export default function KorektyPanel({
  paymentCorrections, setPaymentCorrections,
  pendingCorrections,
  correctionFilter, setCorrectionFilter,
  expandedCorrection, setExpandedCorrection,
  customManagers,
  askConfirm,
  setCorrectionApprovalModal,
  downloadCorrectionPDF,
  currentManager,
  showToast,
  saveJson,
  STORAGE_KEYS,
  setAdminTab,
  addAudit,
  setEmployeeActivityLog,
  employeeActivityLog,
}) {
  const filtered = paymentCorrections.filter(c =>
    correctionFilter === "wszystkie" ? true :
    correctionFilter === "nierozpatrzone" ? !c.done : c.done
  );

  const clearAll = () => askConfirm("Usunąć całą historię korekt?", () => {
    setPaymentCorrections([]);
    saveJson(STORAGE_KEYS.paymentCorrections, []);
    showToast("Historia wyczyszczona.", "info");
  });

  return (
    <motion.div key="ko" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="stack">
      {/* Lista korekt */}
      <div className="panel glass dark-panel">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
          <div>
            <div className="panel-title" style={{margin:0}}><FileText size={16}/> Korekty płatności</div>
            <div style={{fontSize:12.5,color:"var(--text-muted)",marginTop:3}}>
              {paymentCorrections.length} łącznie · <span style={{color:pendingCorrections.length>0?"var(--gold)":"var(--emerald)",fontWeight:700}}>{pendingCorrections.length} nierozpatrzonych</span>
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {pendingCorrections.length>0&&(
              <button className="btn btn-danger-outline" style={{fontSize:12.5}} onClick={clearAll}><Trash2 size={13}/> Wyczyść historię</button>
            )}
          </div>
        </div>

        {/* Filtry */}
        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {["wszystkie","nierozpatrzone","załatwione"].map(f=>(
            <button key={f} onClick={()=>setCorrectionFilter(f)}
              style={{padding:"6px 14px",borderRadius:9,border:"1px solid",fontWeight:700,fontSize:12.5,cursor:"pointer",
                      borderColor:correctionFilter===f?"var(--plum)":"var(--border-medium)",
                      background:correctionFilter===f?"var(--plum-soft)":"transparent",
                      color:correctionFilter===f?"var(--plum)":"var(--text-muted)",textTransform:"capitalize"}}>{f}
            </button>
          ))}
        </div>

        {filtered.length===0?(
          <div className="empty-box empty-box-dark">Brak korekt w wybranym filtrze.</div>
        ):(
          <div style={{display:"grid",gap:8}}>
            {filtered.map(c=>{
              const approvals = c.approvals||{};
              const isExpanded = expandedCorrection===c.id;
              return isExpanded ? (
                <div key={c.id} style={{borderRadius:"var(--radius-md)",overflow:"hidden",border:"1px solid var(--border-light)",borderLeft:`4px solid ${c.done?"var(--emerald)":"var(--gold)"}`,background:"var(--bg-card)",boxShadow:"var(--shadow-md)"}}>
                  <div style={{background:c.done?"var(--emerald-light)":"var(--gold-soft, var(--gold-bg))",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,borderBottom:"1px solid var(--border-light)"}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{fontSize:10.5,padding:"2px 10px",borderRadius:999,background:c.done?"var(--emerald)":"var(--gold)",color:"#fff",fontWeight:800,textTransform:"uppercase",letterSpacing:".06em"}}>{c.docType||"dokument"}</span>
                      <span style={{fontSize:14.5,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--cc-font-display)"}}>{c.reservation}</span>
                      {c.done&&Object.entries(c.approvals||{}).filter(([,v])=>v?.at).map(([mgr])=>(
                        <span key={mgr} style={{fontSize:10.5,padding:"2px 9px",borderRadius:999,background:"var(--emerald-light)",color:"var(--emerald)",fontWeight:700,border:"1px solid var(--emerald-border)"}}>&#10003; {mgr}</span>
                      ))}
                    </div>
                    <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                      {!c.done&&<button className="btn btn-emerald" style={{fontSize:12,padding:"5px 13px"}} onClick={()=>setCorrectionApprovalModal(c)}>&#10003; Rozpatrz i podpisz</button>}
                      <button className="btn btn-outline-dark" style={{fontSize:12,padding:"5px 11px"}} onClick={()=>downloadCorrectionPDF(c,currentManager)} title="Pobierz PDF dla księgowości">
                        <FileDown size={13}/> PDF dla księgowości
                      </button>
                    </div>
                  </div>
                  <div style={{padding:"12px 14px",background:"rgba(255,255,255,.02)"}}>
                    <div style={{marginBottom:10}}>
                      <div style={{fontSize:10,color:"#c8503a",textTransform:"uppercase",letterSpacing:".07em",fontWeight:700,marginBottom:3}}>Kto popełnił błąd</div>
                      <div style={{fontSize:13,fontWeight:600,color:"var(--dark-text)"}}>{getFullName(c.submittedBy)}</div>
                      <div style={{fontSize:11,color:"#635e57",marginTop:1}}>{SHIFT_SHORT_LABELS[c.shift]||c.shift||""}{c.shift?" · ":""}{c.submittedAt}</div>
                    </div>
                    <div style={{background:"rgba(30,40,80,.15)",borderRadius:8,padding:"10px 13px",borderLeft:"3px solid rgba(100,130,200,.4)",marginBottom:10}}>
                      <div style={{fontSize:10,color:"#6a8acc",textTransform:"uppercase",letterSpacing:".07em",marginBottom:5,fontWeight:700}}>Wyjaśnienie pracownika</div>
                      <div style={{fontSize:12.5,color:"var(--dark-text)",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{c.explanation||c.reason||"—"}</div>
                    </div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
                      {customManagers.map(mgr=>{
                        const ap=getApprovalForManager(approvals,mgr);
                        return ap?.at?(
                          <div key={mgr} style={{fontSize:11,padding:"3px 10px",borderRadius:999,background:"rgba(45,106,79,.15)",color:"#5acc94",border:"1px solid rgba(45,106,79,.25)",fontWeight:600}}>{getFullName(mgr)} — {ap.at}</div>
                        ):(
                          <div key={mgr} style={{fontSize:11,padding:"3px 10px",borderRadius:999,background:"rgba(255,255,255,.04)",color:"#5f5a54",border:"1px solid rgba(255,255,255,.08)"}}>oczekuje: {mgr}</div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{padding:"10px 16px",borderTop:"1px solid var(--border-light)",display:"flex",justifyContent:"flex-end"}}>
                    <button className="btn btn-outline" style={{fontSize:11.5}} onClick={()=>setExpandedCorrection(null)}>&#9652; Zwiń</button>
                  </div>
                </div>
              ) : (
                <div key={c.id}
                  onClick={()=>setExpandedCorrection(c.id)}
                  style={{cursor:"pointer",padding:"10px 16px",borderRadius:"var(--radius-md)",border:"1px solid var(--border-light)",borderLeft:`3px solid ${c.done?"var(--emerald)":"var(--gold)"}`,background:"var(--bg-card)",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",transition:"all .15s"}}
                  onMouseEnter={e=>{e.currentTarget.style.boxShadow="var(--shadow-sm)";e.currentTarget.style.borderLeftWidth="4px";}}
                  onMouseLeave={e=>{e.currentTarget.style.boxShadow="";e.currentTarget.style.borderLeftWidth="3px";}}>
                  <span style={{fontSize:13,color:c.done?"var(--emerald)":"var(--gold)",fontWeight:800}}>{c.done?"✓":"⚠"}</span>
                  <span style={{fontSize:10,padding:"2px 9px",borderRadius:999,background:c.done?"var(--emerald)":"var(--gold)",color:"#fff",fontWeight:800,textTransform:"uppercase",letterSpacing:".05em"}}>{c.docType||"dok"}</span>
                  <span style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--cc-font-display)",minWidth:120}}>{c.reservation||"—"}</span>
                  <span style={{fontSize:12,color:"var(--text-secondary)"}}>{getFullName(c.submittedBy)}</span>
                  <span style={{fontSize:11.5,color:"var(--text-muted)",marginLeft:"auto"}}>{(c.submittedAt||"").split(",")[0]}</span>
                  <span style={{fontSize:11,color:"var(--plum)",fontWeight:700}}>&#9658;</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reset danych */}
      <div className="panel glass dark-panel">
        <div className="panel-title"><Trash2 size={16}/> Reset danych</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {[
            {label:"Wyczyść korekty",sub:"Usuwa całą historię korekt płatności",action:()=>askConfirm("Usunąć całą historię korekt?",()=>{setPaymentCorrections([]);saveJson(STORAGE_KEYS.paymentCorrections,[]);showToast("Korekty wyczyszczone.","info");})},
            {label:"Reset ewidencji (miesiąc)",sub:"Przejdź do Ewidencji aby wybrać miesiąc",action:()=>setAdminTab("ewidencja")},
            {label:"Reset całej ewidencji",sub:"Usuwa wszystkie dane godzin pracy",action:()=>askConfirm("Usunąć CAŁĄ ewidencję godzin?",()=>{setEmployeeActivityLog([]);saveJson(STORAGE_KEYS.employeeLog,[]);addAudit(currentManager,"Reset CALEJ ewidencji");showToast("Cała ewidencja usunięta.","info");})},
            {label:"Reset statystyk",sub:"Ewidencja + korekty + raporty",action:()=>askConfirm("Zresetować wszystkie statystyki?",()=>{setEmployeeActivityLog([]);saveJson(STORAGE_KEYS.employeeLog,[]);setPaymentCorrections([]);saveJson(STORAGE_KEYS.paymentCorrections,[]);saveJson(STORAGE_KEYS.reports,[]);addAudit(currentManager,"Reset wszystkich statystyk");showToast("Statystyki zresetowane.","info");})},
          ].map(item=>(
            <button key={item.label} onClick={item.action}
              style={{background:"rgba(255,255,255,.04)",border:"1px solid var(--dark-border)",borderRadius:"var(--radius-md)",padding:"12px 14px",textAlign:"left",cursor:"pointer",transition:"background .15s"}}
              onMouseEnter={e=>e.currentTarget.style.background="rgba(154,48,64,.1)"}
              onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.04)"}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--dark-text)",marginBottom:3}}>{item.label}</div>
              <div style={{fontSize:11.5,color:"#635e57"}}>{item.sub}</div>
            </button>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
