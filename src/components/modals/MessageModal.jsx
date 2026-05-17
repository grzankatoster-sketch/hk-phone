import React from "react";
import { motion } from "framer-motion";
import { X, AlertCircle, Send } from "lucide-react";

export default function MessageModal({onClose,employeeName,employees,messages,setMessages,dark}){
  const [sender,setSender]=React.useState(employeeName||"");
  const [msgType,setMsgType]=React.useState("msg"); // msg | bug
  const [text,setText]=React.useState("");

  const send=()=>{
    if(!sender.trim()||!text.trim())return;
    const m={id:crypto.randomUUID(),sender:sender.trim(),type:msgType,text:text.trim(),
              sentAt:new Date().toLocaleString("pl-PL",{day:"2-digit",month:"2-digit",year:"numeric",hour:"2-digit",minute:"2-digit"}),
              readByAdmin:false};
    const updated=[m,...messages];
    setMessages(updated);
    localStorage.setItem("reception-messages",JSON.stringify(updated));
    setText("");
    onClose();
  };

  const inp=dark?"input dark-input":"input";
  return(
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div initial={{opacity:0,scale:.96,y:-8}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0}}
        className={`modal${dark?" dark-modal":""}`} style={{maxWidth:460}}
        onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:20,paddingBottom:14,borderBottom:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`}}>
          <div style={{width:40,height:40,borderRadius:10,background:"var(--plum-soft)",
                       display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            <AlertCircle size={20} style={{color:"var(--plum)"}}/>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:18,fontWeight:400,color:dark?"var(--dark-text)":"var(--text-primary)",fontFamily:"'DM Serif Display',serif",letterSpacing:".005em"}}>
              Wiadomość do kierownika
            </div>
            <div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>
              Trafi bezpośrednio do skrzynki kierownika
            </div>
          </div>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",
                                            color:"var(--text-muted)",display:"flex",padding:6,borderRadius:6}}>
            <X size={18}/>
          </button>
        </div>

        <div style={{display:"flex",gap:8,marginBottom:16}}>
          {[["msg","💬","Wiadomość","Informacja dla kierownika"],
            ["bug","🐛","Błąd programu","Coś nie działa"]].map(([v,ic,lbl,sub])=>(
            <button key={v} onClick={()=>setMsgType(v)}
              style={{flex:1,padding:"12px 14px",borderRadius:"var(--radius-md)",cursor:"pointer",
                      textAlign:"left",
                      border:`1.5px solid ${msgType===v?
                        (v==="bug"?"var(--rose)":"var(--plum)"):
                        (dark?"var(--dark-border)":"var(--border-light)")}`,
                      background:msgType===v?
                        (v==="bug"?"var(--rose-light)":"var(--plum-soft)"):
                        "transparent",
                      color:msgType===v?(v==="bug"?"var(--rose)":"var(--plum)"):(dark?"var(--dark-text-muted)":"var(--text-muted)")}}>
              <div style={{fontSize:18,marginBottom:4}}>{ic}</div>
              <div style={{fontSize:13,fontWeight:700}}>{lbl}</div>
              <div style={{fontSize:11,opacity:.75,marginTop:1}}>{sub}</div>
            </button>
          ))}
        </div>

        {!employeeName&&(
          <div style={{marginBottom:12}}>
            <label>Twoje imię</label>
            <select className={inp} value={sender} onChange={e=>setSender(e.target.value)} style={{marginTop:4}}>
              <option value="">— wybierz —</option>
              {employees.map(e=><option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        )}

        <div style={{marginBottom:16}}>
          <label>{msgType==="bug"?"Opisz problem":"Treść wiadomości"}</label>
          <textarea className={inp}
            placeholder={msgType==="bug"?
              "Np. Po kliknięciu X program się zawiesza, nie można zapisać zmiany...":
              "Np. Gość z pokoju 214 prosi o dodatkowe ręczniki"}
            value={text} onChange={e=>setText(e.target.value)}
            style={{minHeight:100,marginTop:4,resize:"vertical"}}
            onKeyDown={e=>e.key==="Enter"&&e.ctrlKey&&send()}/>
          <div style={{fontSize:11,color:"var(--text-faint)",marginTop:3}}>Ctrl+Enter aby wysłać</div>
        </div>

        <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
          <button className={dark?"btn btn-outline-dark":"btn btn-outline"} onClick={onClose}>Anuluj</button>
          <button onClick={send}
            disabled={!sender.trim()||!text.trim()}
            style={{display:"flex",alignItems:"center",gap:7,padding:"8px 18px",borderRadius:"var(--radius-md)",
                    border:"none",cursor:"pointer",fontWeight:700,fontSize:13,
                    background:msgType==="bug"?"var(--rose)":"var(--sky)",
                    color:"#fff",opacity:(!sender.trim()||!text.trim())?0.5:1}}>
            <Send size={14}/> Wyślij
          </button>
        </div>
      </motion.div>
    </div>
  );
}
