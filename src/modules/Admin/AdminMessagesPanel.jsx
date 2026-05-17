import React from "react";
import { MessageSquare, Trash2, X } from "lucide-react";
import { pl } from "../../lib/format";
import { STORAGE_KEYS, saveJson } from "../../lib/storage";

function AdminMessagesPanel({messages,setMessages,dark}){
  const unread=messages.filter(m=>!m.readByAdmin);
  const markAllRead=()=>{
    const updated=messages.map(m=>({...m,readByAdmin:true}));
    setMessages(updated);
    saveJson(STORAGE_KEYS.messages,updated);
  };
  const deleteMsg=(id)=>{
    const updated=messages.filter(m=>m.id!==id);
    setMessages(updated);
    saveJson(STORAGE_KEYS.messages,updated);
  };
  // Mark as read when panel is opened
  React.useEffect(()=>{
    if(unread.length>0){
      const updated=messages.map(m=>({...m,readByAdmin:true}));
      setMessages(updated);
      saveJson(STORAGE_KEYS.messages,updated);
    }
  },[]);

  return(
    <div className="stack">
      <div className="panel glass dark-panel">
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:10}}>
          <div>
            <div className="panel-title" style={{margin:0,display:"flex",alignItems:"center",gap:8}}>
              <MessageSquare size={16}/> Skrzynka wiadomości
              {unread.length>0&&<span style={{fontSize:11,padding:"2px 10px",borderRadius:999,
                background:"var(--rose-light)",color:"var(--rose)",fontWeight:800,border:"1px solid var(--rose-border)"}}>{unread.length} nowych</span>}
            </div>
            <div style={{fontSize:12,color:"var(--text-muted)",marginTop:3}}>{messages.length} wiadomości łącznie</div>
          </div>
          {messages.length>0&&(
            <button className="btn btn-danger-outline" style={{fontSize:12}}
              onClick={()=>setMessages([])}>
              <Trash2 size={12}/> Wyczyść wszystkie
            </button>
          )}
        </div>
        {messages.length===0?(
          <div className="empty-box empty-box-dark">Brak wiadomości od pracowników.</div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {messages.map(m=>(
              <div key={m.id} style={{
                display:"flex",gap:12,padding:"13px 16px",borderRadius:"var(--radius-md)",
                border:"1px solid var(--border-light)",
                borderLeft:`3px solid ${m.type==="bug"?"var(--rose)":"var(--plum)"}`,
                background:"var(--bg-card)"}}>
                <div style={{fontSize:20,flexShrink:0,marginTop:2}}>{m.type==="bug"?"🐛":"💬"}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5,flexWrap:"wrap"}}>
                    <span style={{fontSize:13,fontWeight:700,color:dark?"var(--dark-text)":"var(--text-primary)"}}>
                      {m.sender}
                    </span>
                    <span style={{fontSize:10.5,padding:"2px 9px",borderRadius:999,fontWeight:700,letterSpacing:".04em",
                      background:m.type==="bug"?"var(--rose-light)":"var(--plum-soft)",
                      color:m.type==="bug"?"var(--rose)":"var(--plum)"}}>
                      {m.type==="bug"?"Błąd programu":"Wiadomość"}
                    </span>
                    <span style={{fontSize:11,color:"#5f5a54"}}>{m.sentAt}</span>
                  </div>
                  <div style={{fontSize:13.5,color:dark?"var(--dark-text)":"var(--text-primary)",
                               lineHeight:1.6,whiteSpace:"pre-wrap"}}>{m.text}</div>
                </div>
                <button onClick={()=>deleteMsg(m.id)}
                  style={{background:"none",border:"none",cursor:"pointer",color:"rgba(255,255,255,.25)",
                          padding:2,flexShrink:0,display:"flex",alignItems:"flex-start"}}>
                  <X size={13}/>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminMessagesPanel;
