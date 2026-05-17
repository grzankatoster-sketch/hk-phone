import React from "react";
import { motion } from "framer-motion";
import { X, FileText, FileDown } from "lucide-react";
import { ADMIN_MANAGERS, SHIFT_SHORT_LABELS } from "../../lib/constants";
import { fmtA } from "../../lib/dates";
import { displayValue } from "../../lib/format";
import { getFullName } from "../../lib/employees";
import { getCustomManagers } from "../../lib/storage";
import SignatureCanvas from "../SignatureCanvas";

export default function CorrectionApprovalModal({correction:c,currentManager,onClose,onApprove,onDownload}){
  const managers=React.useMemo(()=>{const m=getCustomManagers();return m.length>0?m:ADMIN_MANAGERS;},[]);
  const [note,setNote]=React.useState("");
  const [mgrSig,setMgrSig]=React.useState(null);
  const approvals=c.approvals||{};
  const alreadyApprovedByMe=approvals[currentManager]?.at;

  return(
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div initial={{opacity:0,scale:.97,y:8}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0}}
        className="modal large-modal dark-modal"
        style={{maxWidth:600,maxHeight:"90vh",overflowY:"auto"}}
        onClick={e=>e.stopPropagation()}>
        <div style={{background:"linear-gradient(135deg,#1a1612,#221c14)",borderRadius:"14px 14px 0 0",
                     margin:"-24px -24px 20px",padding:"18px 24px",
                     display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{color:"#e4e0da",fontWeight:800,fontSize:16,display:"flex",alignItems:"center",gap:8}}>
              <FileText size={16} style={{color:"#c8a050"}}/> Rozpatrz korektę płatności
            </div>
            <div style={{color:"#635e57",fontSize:11.5,marginTop:2}}>
              Kierownik: <span style={{color:"#c8a050",fontWeight:600}}>{getFullName(currentManager)}</span>
            </div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"none",borderRadius:8,
                                            color:"#e4e0da",cursor:"pointer",padding:"6px 8px",display:"flex"}}>
            <X size={14}/>
          </button>
        </div>

        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:"#c8503a",textTransform:"uppercase",letterSpacing:".07em",fontWeight:700,marginBottom:6}}>Kto popełnił błąd</div>
          <div style={{background:"rgba(200,80,58,.08)",border:"1px solid rgba(200,80,58,.2)",borderRadius:10,padding:"11px 14px"}}>
            <div style={{fontSize:14,fontWeight:700,color:"#e4e0da"}}>{getFullName(c.submittedBy)}</div>
            <div style={{fontSize:11.5,color:"#635e57",marginTop:2}}>
              {SHIFT_SHORT_LABELS[c.shift]||c.shift||""}{c.shift?" · ":""}{c.submittedAt}
            </div>
          </div>
        </div>

        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          <div style={{flex:1,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:10,padding:"10px 13px",minWidth:120}}>
            <div style={{fontSize:9.5,color:"#635e57",textTransform:"uppercase",letterSpacing:".07em",marginBottom:3}}>Typ dokumentu</div>
            <div style={{fontSize:13,fontWeight:700,color:"#c8a050",textTransform:"uppercase"}}>{c.docType||"dokument"}</div>
          </div>
          <div style={{flex:2,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:10,padding:"10px 13px"}}>
            <div style={{fontSize:9.5,color:"#635e57",textTransform:"uppercase",letterSpacing:".07em",marginBottom:3}}>Nr dokumentu / rezerwacji</div>
            <div style={{fontSize:13,fontWeight:700,color:"#e4e0da"}}>{displayValue(c.reservation)}</div>
          </div>
        </div>

        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:"#6a8acc",textTransform:"uppercase",letterSpacing:".07em",fontWeight:700,marginBottom:6}}>Wyjaśnienie pracownika</div>
          <div style={{background:"rgba(30,40,80,.2)",border:"1px solid rgba(100,130,200,.2)",borderRadius:10,padding:"12px 14px",
                       fontSize:13,color:"#d0ccC6",lineHeight:1.7,whiteSpace:"pre-wrap"}}>
            {displayValue(c.explanation||c.reason)}
          </div>
        </div>

        {c.employeeSignature&&(
          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,color:"#948e85",textTransform:"uppercase",letterSpacing:".07em",fontWeight:700,marginBottom:6}}>Podpis pracownika</div>
            <div style={{background:"#fff",borderRadius:8,padding:6,display:"inline-block",border:"1px solid rgba(255,255,255,.15)"}}>
              <img src={c.employeeSignature} alt="podpis" style={{height:60,display:"block"}}/>
            </div>
          </div>
        )}

        {alreadyApprovedByMe?(
          <div style={{background:"rgba(45,106,79,.15)",border:"1px solid rgba(45,106,79,.3)",borderRadius:10,padding:"12px 14px",marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:600,color:"#5acc94"}}>✓ Już zatwierdzono przez Ciebie — {approvals[currentManager].at}</div>
            {approvals[currentManager].note&&<div style={{fontSize:12,color:"#948e85",marginTop:4}}>Notatka: {approvals[currentManager].note}</div>}
          </div>
        ):(
          <>
            <div style={{marginBottom:16}}>
              <label style={{display:"block",fontSize:11.5,fontWeight:600,color:"#948e85",marginBottom:6,textTransform:"uppercase",letterSpacing:".05em"}}>
                Twoja notatka / korekta (opcjonalnie)
              </label>
              <textarea value={note} onChange={e=>setNote(e.target.value)}
                placeholder="Np. korekta wystawiona 25.03.2026, kwota różnicy +100 zł..."
                style={{width:"100%",minHeight:80,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.12)",
                        borderRadius:8,padding:"9px 12px",fontSize:12.5,color:"#e4e0da",resize:"vertical",lineHeight:1.6}}/>
            </div>
            <div style={{marginBottom:20}}>
              <SignatureCanvas
                label={`Podpis kierownika: ${getFullName(currentManager)}`}
                onSave={setMgrSig}
                height={80}
                dark={true}
              />
            </div>
          </>
        )}

        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
          {managers.map(mgr=>{
            const ap=(c.approvals||{})[mgr];
            return(
              <div key={mgr} style={{fontSize:11.5,padding:"4px 12px",borderRadius:999,fontWeight:600,
                                      background:ap?.at?"rgba(45,106,79,.15)":"rgba(255,255,255,.05)",
                                      border:`1px solid ${ap?.at?"rgba(45,106,79,.3)":"rgba(255,255,255,.1)"}`,
                                      color:ap?.at?"#5acc94":"#5f5a54"}}>
                {ap?.at?`[OK] ${getFullName(mgr)}`:`oczekuje: ${mgr}`}
              </div>
            );
          })}
        </div>

        <div style={{display:"flex",gap:9,justifyContent:"flex-end",flexWrap:"wrap"}}>
          <button className="btn btn-outline-dark" onClick={onClose}>Anuluj</button>
          <button className="btn btn-outline-dark" style={{fontSize:12}}
            onClick={()=>onDownload({...c,approvals:{...(c.approvals||{}),[currentManager]:{at:fmtA(),note,signature:mgrSig}}})}>
            <FileDown size={13}/> Pobierz PDF
          </button>
          {!alreadyApprovedByMe&&(
            <button className="btn btn-emerald" onClick={()=>onApprove(c.id,note,mgrSig)}>
              Zatwierdz i zapisz podpis
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}
