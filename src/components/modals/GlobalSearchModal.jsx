import React, { useState, useMemo, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { Search, X } from "lucide-react";
import { STORAGE_KEYS, loadJson } from "../../lib/storage";
import { emptyCarryOver, SHIFT_OPTIONS, SHIFT_SHORT_LABELS } from "../../lib/constants";

export default function GlobalSearchModal({onClose,dark}){
  const [q,setQ]=useState("");
  const [filter,setFilter]=useState("all"); // all | carry | note | notif | remind
  const inputRef=useRef(null);
  useEffect(()=>{setTimeout(()=>inputRef.current?.focus(),60);},[]);

  const allItems=useMemo(()=>{
    const items=[];
    const parseDate=(s)=>{
      if(!s)return 0;
      try{
        if(s.includes("T"))return new Date(s).getTime();
        const p=s.split(", ");
        if(p.length>=2){const d=p[0].split(".");return new Date(`${d[2]}-${d[1]}-${d[0]}T${p[1]}:00`).getTime();}
        return 0;
      }catch{return 0;}
    };

    const carry=loadJson(STORAGE_KEYS.carry,emptyCarryOver);
    SHIFT_OPTIONS.forEach(s=>(carry[s]||[]).forEach(t=>{
      items.push({
        id:t.id||crypto.randomUUID(),
        type:"carry",
        label:"Przekazane",
        title:t.text,
        sub:`${SHIFT_SHORT_LABELS[t.fromShift]||t.fromShift||"—"} → ${SHIFT_SHORT_LABELS[s]||s} · ${t.createdBy||""} · ${t.createdAt||""}`,
        ts:parseDate(t.createdAt),
        done:t.done,
      });
    }));

    const notes=loadJson(STORAGE_KEYS.handoverNotes,[]);
    notes.forEach(n=>{
      items.push({
        id:n.id||crypto.randomUUID(),
        type:"note",
        label:"Notatka przekazania",
        title:n.text,
        sub:`${n.employee} · ${SHIFT_SHORT_LABELS[n.shift]||n.shift} · ${n.createdAt}`,
        ts:parseDate(n.createdAt),
      });
    });

    const notifs=loadJson(STORAGE_KEYS.globalNotifications,[]);
    notifs.forEach(n=>{
      items.push({
        id:n.id||crypto.randomUUID(),
        type:"notif",
        label:"Powiadomienie",
        title:n.text,
        sub:`${n.targetShift==="all"?"Wszystkie zmiany":SHIFT_SHORT_LABELS[n.targetShift]||n.targetShift} · ${n.createdAt||""}`,
        ts:parseDate(n.createdAt),
      });
    });

    const rems=loadJson(STORAGE_KEYS.datedReminders,[]);
    rems.forEach(r=>{
      items.push({
        id:r.id||crypto.randomUUID(),
        type:"remind",
        label:"Przypomnienie",
        title:r.text,
        sub:`${r.targetDate} · ${SHIFT_SHORT_LABELS[r.targetShift]||r.targetShift} · ${r.createdBy||""}`,
        ts:parseDate(r.targetDate+"T00:00")||parseDate(r.createdAt),
      });
    });

    return items.sort((a,b)=>b.ts-a.ts);
  },[]);

  const filtered=useMemo(()=>{
    const raw=q.trim().toLowerCase();
    return allItems.filter(item=>{
      const matchFilter=filter==="all"||item.type===filter;
      if(!matchFilter)return false;
      if(raw.length<1)return true;
      return (item.title||"").toLowerCase().includes(raw)||(item.sub||"").toLowerCase().includes(raw);
    });
  },[allItems,q,filter]);

  const highlight=(text)=>{
    const value=String(text||"");
    const raw=q.trim();
    if(!raw||raw.length<1)return value;
    const re=new RegExp(`(${raw.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")})`,`gi`);
    return value.split(re).map((part,idx)=>
      part.toLowerCase()===raw.toLowerCase()
        ? <mark key={idx} style={{background:"#fde68a",borderRadius:2,padding:"0 1px"}}>{part}</mark>
        : <React.Fragment key={idx}>{part}</React.Fragment>
    );
  };

  const TYPE_ICONS={carry:"↔",note:"📝",notif:"🔔",remind:"📅"};
  const TYPE_LABELS={carry:"Przekazane",note:"Notatki",notif:"Powiadomienia",remind:"Przypomnienia"};
  const FILTERS=[
    {id:"all",label:"Wszystkie"},
    {id:"carry",label:"Przekazane"},
    {id:"note",label:"Notatki"},
    {id:"notif",label:"Powiadomienia"},
    {id:"remind",label:"Przypomnienia"},
  ];

  return(
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div initial={{opacity:0,scale:.96,y:-10}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0,scale:.96}} transition={{duration:.18}}
        className={`modal wide-modal ${dark?"dark-modal":""}`} style={{maxWidth:660,maxHeight:"82vh",display:"flex",flexDirection:"column",padding:0,overflow:"hidden"}} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"13px 16px",borderBottom:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`}}>
          <Search size={16} style={{color:"var(--text-muted)",flexShrink:0}}/>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)}
            placeholder="Szukaj w zadaniach, notatkach i powiadomieniach..."
            style={{flex:1,border:"none",outline:"none",fontSize:14,background:"transparent",color:dark?"var(--dark-text)":"var(--text-primary)"}}/>
          <kbd style={{fontSize:11,padding:"2px 7px",background:dark?"rgba(255,255,255,.08)":"var(--bg-secondary)",border:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,borderRadius:6,color:"var(--text-muted)"}}>Esc</kbd>
          <button onClick={onClose} style={{border:"none",background:"transparent",cursor:"pointer",color:"var(--text-muted)",display:"flex"}}><X size={15}/></button>
        </div>
        <div style={{display:"flex",gap:5,padding:"8px 16px",borderBottom:`0.5px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,flexWrap:"wrap"}}>
          {FILTERS.map(f=>{
            const cnt=f.id==="all"?allItems.length:allItems.filter(i=>i.type===f.id).length;
            const active=filter===f.id;
            return(
              <button key={f.id} onClick={()=>setFilter(f.id)}
                style={{fontSize:11.5,padding:"5px 12px",borderRadius:999,border:`1px solid ${active?"var(--plum)":(dark?"var(--dark-border)":"var(--border-medium)")}`,
                        background:active?"var(--plum-soft)":(dark?"transparent":"var(--bg-card)"),
                        color:active?"var(--plum)":(dark?"var(--dark-text-muted)":"var(--text-muted)"),
                        cursor:"pointer",fontWeight:active?700:500}}>
                {f.label} <span style={{opacity:.65,marginLeft:3}}>{cnt}</span>
              </button>
            );
          })}
        </div>
        <div style={{flex:1,overflowY:"auto",padding:"10px 12px"}}>
          {filtered.length===0&&(
            <div style={{textAlign:"center",color:"var(--text-faint)",fontSize:13,padding:"32px 0"}}>
              {q.length>0?`Brak wyników dla "${q}"`:"Brak wpisów w tej kategorii"}
            </div>
          )}
          {filtered.map((item,i)=>{
            const prev=filtered[i-1];
            const showDate=!prev||new Date(item.ts).toDateString()!==new Date(prev?.ts).toDateString();
            const dateLabel=item.ts?new Date(item.ts).toLocaleDateString("pl-PL",{weekday:"short",day:"numeric",month:"short",year:"numeric"}):"";
            return(
              <React.Fragment key={item.id}>
                {showDate&&item.ts>0&&(
                  <div style={{fontSize:10,fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",
                               color:"var(--text-faint)",margin:"10px 4px 5px",paddingBottom:4,
                               borderBottom:`0.5px solid ${dark?"var(--dark-border)":"var(--border-light)"}`}}>
                    {dateLabel}
                  </div>
                )}
                <div style={{display:"flex",alignItems:"flex-start",gap:9,padding:"8px 10px",borderRadius:"var(--radius-md)",
                             marginBottom:3,
                             background:dark?"rgba(255,255,255,.03)":"var(--bg-secondary)",
                             border:`0.5px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,
                             opacity:item.done?.7:1}}
                     onMouseEnter={e=>e.currentTarget.style.background=dark?"rgba(255,255,255,.07)":"var(--gold-bg)"}
                     onMouseLeave={e=>e.currentTarget.style.background=dark?"rgba(255,255,255,.03)":"var(--bg-secondary)"}>
                  <span style={{fontSize:13,flexShrink:0,marginTop:1,opacity:.8}}>{TYPE_ICONS[item.type]}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:13,fontWeight:600,color:item.done?"var(--text-muted)":(dark?"var(--dark-text)":"var(--text-primary)"),
                                  textDecoration:item.done?"line-through":"none",
                                  overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {highlight(item.title)}
                    </div>
                    <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {highlight(item.sub)}
                    </div>
                  </div>
                  <span style={{fontSize:10,padding:"2px 6px",borderRadius:999,flexShrink:0,
                                background:dark?"rgba(255,255,255,.06)":"rgba(0,0,0,.05)",
                                color:"var(--text-muted)",fontWeight:500}}>
                    {TYPE_LABELS[item.type]}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </div>
        <div style={{padding:"7px 16px",borderTop:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,fontSize:11,color:"var(--text-faint)",display:"flex",justifyContent:"space-between"}}>
          <span>{filtered.length} wynik{filtered.length===1?"":"ów"}</span>
          <span>Esc — zamknij</span>
        </div>
      </motion.div>
    </div>
  );
}
