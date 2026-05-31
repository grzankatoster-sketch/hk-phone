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

  /* ═══ Inbox v2 wg v2/20-wiadomosci — avatar rows + type pills ═══ */
  const avatarGradient = (name) => {
    const palettes = [
      "linear-gradient(135deg, var(--cc-brand), var(--cc-brand-deep))",
      "linear-gradient(135deg, var(--cc-info), color-mix(in srgb, var(--cc-info) 55%, black))",
      "linear-gradient(135deg, var(--cc-success), color-mix(in srgb, var(--cc-success) 55%, black))",
      "linear-gradient(135deg, var(--cc-accent-gold), color-mix(in srgb, var(--cc-accent-gold) 60%, black))",
      "linear-gradient(135deg, var(--cc-danger), color-mix(in srgb, var(--cc-danger) 60%, black))",
      "linear-gradient(135deg, #7c3aed, #5b21b6)",
    ];
    const hash = [...(name||"?")].reduce((s,c)=>s+c.charCodeAt(0),0);
    return palettes[hash % palettes.length];
  };

  return(
    <div className="stack">
      <section className="cc-msgs-card" aria-labelledby="cc-msgs-title">
        <header className="cc-msgs-head">
          <div className="cc-msgs-head-info">
            <h2 id="cc-msgs-title" className="cc-msgs-head-title">
              <MessageSquare size={16}/> Skrzynka wiadomości
              {unread.length>0 && <span className="cc-msgs-unread-pill">{unread.length} nowych</span>}
            </h2>
            <div className="cc-msgs-head-sub">{messages.length} wiadomości łącznie</div>
          </div>
          {messages.length>0&&(
            <button type="button" className="btn btn-danger-outline" style={{fontSize:12}}
              onClick={()=>setMessages([])}>
              <Trash2 size={12}/> Wyczyść wszystkie
            </button>
          )}
        </header>
        {messages.length===0?(
          <div className="cc-msgs-empty">
            <div className="cc-msgs-empty-icon">📭</div>
            <div>Brak wiadomości od pracowników.</div>
          </div>
        ):(
          <ul className="cc-msgs-list" role="list">
            {messages.map(m=>{
              const isBug = m.type==="bug";
              // Wiadomości od pracownika mają {sender,sentAt}, a systemowe (np.
              // niezgodność kasy) {from,createdAt} — normalizujemy, by nie gubić
              // nadawcy ("?") ani godziny.
              const sender = m.sender||m.from||"";
              const sentAt = m.sentAt||m.createdAt||"";
              const initial = (sender||"?").charAt(0).toUpperCase();
              return (
                <li key={m.id} className={`cc-msg-row cc-msg-row--${isBug?"bug":"msg"}${!m.readByAdmin?" cc-msg-row--unread":""}`}>
                  <div className="cc-msg-avatar" style={{background:avatarGradient(sender)}}>{initial}</div>
                  <div className="cc-msg-body">
                    <div className="cc-msg-headline">
                      <span className="cc-msg-sender">{sender}</span>
                      <span className={`cc-msg-type cc-msg-type--${isBug?"bug":"msg"}`}>
                        {isBug?"🐛 Błąd":"💬 Wiadomość"}
                      </span>
                      <time className="cc-msg-time">{sentAt}</time>
                    </div>
                    <div className="cc-msg-text">{m.text}</div>
                  </div>
                  <button
                    type="button"
                    onClick={()=>deleteMsg(m.id)}
                    className="cc-msg-delete-btn"
                    title="Usuń wiadomość"
                    aria-label="Usuń wiadomość">
                    <X size={13}/>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export default AdminMessagesPanel;
