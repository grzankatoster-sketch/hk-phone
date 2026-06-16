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
      {/* ═══ KPI ROW v2 ═══ */}
      {(()=>{const doneCount=paymentCorrections.filter(c=>c.done).length;return(
        <div className="cc-kpi-row cc-kpi-row--3">
          <div className="cc-kpi">
            <div className="cc-kpi-lbl">Korekty łącznie</div>
            <div className="cc-kpi-val">{paymentCorrections.length}</div>
            <div className="cc-kpi-sub">w historii</div>
          </div>
          <div className="cc-kpi">
            <div className="cc-kpi-lbl">Nierozpatrzone</div>
            <div className={`cc-kpi-val${pendingCorrections.length>0?" cc-kpi-val--gold":" cc-kpi-val--success"}`}>{pendingCorrections.length}</div>
            <div className="cc-kpi-sub">{pendingCorrections.length>0?"wymaga podpisu":"wszystko podpisane"}</div>
          </div>
          <div className="cc-kpi">
            <div className="cc-kpi-lbl">Załatwione</div>
            <div className="cc-kpi-val cc-kpi-val--success">{doneCount}</div>
            <div className="cc-kpi-sub">z podpisem kierownika</div>
          </div>
        </div>
      );})()}

      {/* Lista korekt */}
      <div className="panel glass dark-panel">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
          <div>
            <div className="panel-title" style={{margin:0}}><FileText size={16}/> Korekty płatności</div>
            <div className="cc-vsub">{paymentCorrections.length} łącznie · {pendingCorrections.length} nierozpatrzonych</div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {pendingCorrections.length>0&&(
              <button className="btn btn-danger-outline" style={{fontSize:12.5}} onClick={clearAll}><Trash2 size={13}/> Wyczyść historię</button>
            )}
          </div>
        </div>

        {/* Filtry v2 */}
        <div className="cc-vtabs" style={{marginBottom:16}}>
          {[["wszystkie","Wszystkie",paymentCorrections.length],["nierozpatrzone","Nierozpatrzone",pendingCorrections.length],["załatwione","Załatwione",paymentCorrections.filter(c=>c.done).length]].map(([f,lbl,cnt])=>(
            <button key={f} type="button" onClick={()=>setCorrectionFilter(f)} className={`cc-vtab${correctionFilter===f?" cc-vtab--on":""}`}>
              <span>{lbl}</span><span className="cc-vtab-cnt">{cnt}</span>
            </button>
          ))}
        </div>

        {filtered.length===0?(
          <div className="empty-box empty-box-dark">Brak korekt w wybranym filtrze.</div>
        ):(
          <div style={{display:"grid",gap:8}}>
            {filtered.map(c=>{
              const approvals = c.approvals||{};
              const isRejected = c.decision==="rejected"; // decyzja "odrzuć" z panelu menedżerskiego
              const isExpanded = expandedCorrection===c.id;
              return isExpanded ? (
                <div key={c.id} style={{borderRadius:"var(--radius-md)",overflow:"hidden",border:"1px solid var(--border-light)",borderLeft:`4px solid ${c.done?"var(--emerald)":"var(--gold)"}`,background:"var(--bg-card)",boxShadow:"var(--shadow-md)"}}>
                  <div style={{background:c.done?"var(--emerald-light)":"var(--gold-soft, var(--gold-bg))",padding:"11px 16px",display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,borderBottom:"1px solid var(--border-light)"}}>
                    <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                      <span style={{fontSize:10.5,padding:"2px 10px",borderRadius:999,background:isRejected?"#c2415a":c.done?"var(--emerald)":"var(--gold)",color:"#fff",fontWeight:800,textTransform:"uppercase",letterSpacing:".06em"}}>{c.docType||"dokument"}</span>
                      <span style={{fontSize:14.5,fontWeight:700,color:"var(--text-primary)",fontFamily:"var(--cc-font-display)"}}>{c.reservation}</span>
                      {isRejected&&<span style={{fontSize:10.5,padding:"2px 9px",borderRadius:999,background:"rgba(194,65,90,.15)",color:"#c2415a",fontWeight:800,border:"1px solid rgba(194,65,90,.35)"}}>&#10007; Odrzucona w panelu</span>}
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
                <div key={c.id} onClick={()=>setExpandedCorrection(c.id)} style={{cursor:"pointer",marginBottom:0}}
                  className={`cc-vrow ${c.done?"cc-vrow--success":"cc-vrow--warn"}`}>
                  <span style={{fontSize:10,padding:"2px 9px",borderRadius:999,background:c.done?"var(--cc-success)":"var(--cc-warning)",color:"#fff",fontWeight:800,textTransform:"uppercase",letterSpacing:".05em",flexShrink:0}}>{c.docType||"dok"}</span>
                  <div className="cc-vrow-main">
                    <div className="cc-vrow-title">{c.reservation||"—"} <span style={{fontWeight:400,color:"var(--cc-text-muted)",fontSize:12}}>· {getFullName(c.submittedBy)}</span></div>
                    <div className="cc-vrow-sub">{(c.submittedAt||"").split(",")[0]}</div>
                  </div>
                  <span className="cc-vrow-badge" style={{background:isRejected?"color-mix(in srgb,#c2415a 18%,transparent)":c.done?"color-mix(in srgb,var(--cc-success) 18%,transparent)":"color-mix(in srgb,var(--cc-warning) 18%,transparent)",color:isRejected?"#c2415a":c.done?"var(--cc-success)":"var(--cc-warning)"}}>{isRejected?"✕ Odrzucona":c.done?"✓ Załatwione":"⚠ Czeka"}</span>
                  <span style={{fontSize:11,color:"var(--cc-brand)",fontWeight:700,flexShrink:0}}>&#9658;</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reset danych */}
      <div className="panel glass dark-panel">
        <div className="panel-title"><Trash2 size={16}/> Reset danych</div>
        <div className="cc-form-grid cc-form-grid-2">
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
