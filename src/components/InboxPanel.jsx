import React from "react";
import { BellRing, Pin, Clock } from "lucide-react";
import { STORAGE_KEYS, loadJson } from "../lib/storage";

function EmptyState({icon,title,sub,action}){
  return(
    <div className="cc-inbox-empty">
      <svg width="52" height="52" viewBox="0 0 52 52" fill="none" className="cc-inbox-empty-svg" aria-hidden="true">
        {icon}
      </svg>
      <div className="cc-inbox-empty-title">{title}</div>
      {sub&&<div className="cc-inbox-empty-sub">{sub}</div>}
      {action}
    </div>
  );
}

const BELL_PATH=(
  <>
    <path d="M26 6a14 14 0 0 1 14 14v8l4 5H8l4-5v-8A14 14 0 0 1 26 6z" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M22 43a4 4 0 0 0 8 0" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round"/>
  </>
);
const CLIP_PATH=(
  <>
    <rect x="14" y="8" width="24" height="36" rx="4" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M20 20h12M20 28h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
    <path d="M20 14h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeDasharray="2 2"/>
  </>
);
const BOOK_PATH=(
  <>
    <rect x="8" y="8" width="36" height="36" rx="4" stroke="currentColor" strokeWidth="2" fill="none"/>
    <path d="M16 20h20M16 28h14M16 36h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </>
);

function expiresLabel(expires_at){
  if(!expires_at)return null;
  const ms=new Date(expires_at).getTime()-Date.now();
  if(ms<0)return null;
  const h=Math.floor(ms/3600000);
  if(h<1)return "< 1 godz.";
  if(h<24)return `${h} godz.`;
  return `${Math.floor(h/24)} dni`;
}

export default function InboxPanel({dark,employeeName,selectedShift,wikiEntries,onOpenWiki}){
  const [tab,setTab]=React.useState("alerts");
  const [tick,setTick]=React.useState(0);

  React.useEffect(()=>{
    const interval=setInterval(()=>setTick(t=>t+1),60000);
    const onStorage=(e)=>{
      if(e.key===STORAGE_KEYS.managerAlerts||e.key===STORAGE_KEYS.standingReminders)
        setTick(t=>t+1);
    };
    window.addEventListener("storage",onStorage);
    return ()=>{clearInterval(interval);window.removeEventListener("storage",onStorage);};
  },[]);

  const alerts=loadJson(STORAGE_KEYS.managerAlerts,[])
    .filter(a=>!a.expires_at||new Date(a.expires_at).getTime()>Date.now())
    .filter(a=>!a.target_shift||!selectedShift||a.target_shift===selectedShift)
    .sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||new Date(b.created_at)-new Date(a.created_at));
  const reminders=loadJson(STORAGE_KEYS.standingReminders,[]).filter(r=>r.active!==false);
  const wikiLastSeenKey=`${STORAGE_KEYS.wikiLastSeen}-${employeeName}`;
  const lastSeenMs=parseInt(localStorage.getItem(wikiLastSeenKey)||"0");
  const newWiki=(wikiEntries||[]).filter(w=>{
    const u=w.updatedAt?new Date(w.updatedAt).getTime():0;
    return u>lastSeenMs;
  });
  const markWikiSeen=()=>localStorage.setItem(wikiLastSeenKey,String(Date.now()));

  const tabBtn=(id,label,count,variant)=>(
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={tab===id}
      onClick={()=>setTab(id)}
      className={`cc-inbox-tab cc-inbox-tab--${variant}${tab===id?" cc-inbox-tab--active":""}`}>
      <span className="cc-inbox-tab-label">{label}</span>
      {count>0&&<span className="cc-inbox-tab-badge">{count}</span>}
    </button>
  );

  // Group alerts by creator
  const alertGroups=React.useMemo(()=>{
    const g={};
    alerts.forEach(a=>{
      const key=a.created_by||"Kierownik";
      if(!g[key])g[key]=[];
      g[key].push(a);
    });
    return Object.entries(g);
  },[alerts]);

  return (
    <section className="cc-inbox-card" aria-labelledby="cc-inbox-title">
      <header className="cc-inbox-head">
        <BellRing size={18} className="cc-inbox-head-icon" aria-hidden="true"/>
        <div className="cc-inbox-head-text">
          <h2 id="cc-inbox-title" className="cc-inbox-head-title">Informacje</h2>
          <div className="cc-inbox-head-sub">Pilne wiadomości, stałe przypomnienia i nowości w Wiki</div>
        </div>
      </header>
      <div className="cc-inbox-tabs" role="tablist" aria-label="Sekcje informacji">
        {tabBtn("alerts","Pilne",alerts.length,"rose")}
        {tabBtn("standing","Stałe",reminders.length,"gold")}
        {tabBtn("wiki","Nowe w Wiki",newWiki.length,"brand")}
      </div>
      <div className="cc-inbox-body">

        {tab==="alerts"&&(
          <div style={{display:"flex",flexDirection:"column",gap:14}}>
            {alerts.length===0?(
              <EmptyState
                icon={BELL_PATH}
                title="Brak pilnych informacji"
                sub="Wszystko spokojnie — nie ma nic nowego od kierownictwa."
              />
            ):alertGroups.map(([manager,items])=>(
              <div key={manager}>
                <div style={{fontSize:11,fontWeight:800,textTransform:"uppercase",letterSpacing:".06em",color:"var(--text-muted)",marginBottom:8,paddingBottom:6,borderBottom:"1px solid var(--border-light)",display:"flex",alignItems:"center",gap:6}}>
                  <span style={{width:18,height:18,borderRadius:"50%",background:"var(--plum-soft)",color:"var(--plum)",display:"inline-flex",alignItems:"center",justifyContent:"center",fontSize:9,fontWeight:900,flexShrink:0}}>K</span>
                  Od: {manager}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:8}}>
                  {items.map(a=>{
                    const exp=expiresLabel(a.expires_at);
                    return(
                      <div key={a.id} className="cc-preshift-item" style={{borderLeftColor:a.priority==="urgent"?"var(--rose)":"var(--gold)"}}>
                        <div className="cc-preshift-item-head" style={{flexWrap:"wrap",gap:6}}>
                          <div className="cc-preshift-item-title" style={{flex:1}}>{a.title||"Informacja"}</div>
                          {a.pinned&&<span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,padding:"2px 7px",borderRadius:999,background:"var(--plum-soft)",color:"var(--plum)",fontWeight:700}}><Pin size={8}/> Przypięte</span>}
                          {a.priority==="urgent"&&<span className="cc-preshift-urgent">PILNE</span>}
                          {exp&&<span style={{display:"inline-flex",alignItems:"center",gap:3,fontSize:10,padding:"2px 7px",borderRadius:999,background:"var(--amber-light,#fef3c7)",color:"var(--amber)",fontWeight:700,border:"1px solid var(--amber-border,#fcd34d)"}}><Clock size={8}/> {exp}</span>}
                        </div>
                        <div className="cc-preshift-item-body">{a.body}</div>
                        <div className="cc-preshift-item-meta">{new Date(a.created_at).toLocaleDateString("pl-PL")}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab==="standing"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {reminders.length===0?(
              <EmptyState
                icon={CLIP_PATH}
                title="Brak stalych przypomnien"
                sub="Nie ma zadnych aktywnych instrukcji stale obowiazujacych."
              />
            ):reminders.map(r=>(
              <div key={r.id} className="cc-preshift-item" style={{borderLeftColor:"var(--gold)"}}>
                <div className="cc-preshift-item-head">
                  <div className="cc-preshift-item-title">{r.title||"Przypomnienie"}</div>
                  {r.category&&<span className="cc-preshift-cat">{r.category}</span>}
                </div>
                <div className="cc-preshift-item-body">{r.body}</div>
              </div>
            ))}
          </div>
        )}

        {tab==="wiki"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {newWiki.length===0?(
              <EmptyState
                icon={BOOK_PATH}
                title="Brak nowosci w Wiki"
                sub="Nie ma nowych ani zmienionych tematow od ostatniego logowania."
                action={
                  <button type="button" onClick={onOpenWiki} className="cc-inbox-empty-action">
                    Otwórz Wiki →
                  </button>
                }
              />
            ):(
              <>
                <div className="cc-inbox-wiki-actions">
                  <button type="button" onClick={()=>{markWikiSeen();window.location.reload();}} className="cc-inbox-mark-read">
                    Oznacz wszystkie jako przeczytane
                  </button>
                </div>
                {newWiki.map(w=>(
                  <div key={w.id} className="cc-preshift-item" style={{borderLeftColor:"var(--cc-brand)"}}>
                    <div className="cc-preshift-item-head">
                      <div className="cc-preshift-item-title">{w.topic}</div>
                      <span className="cc-inbox-new-pill">NOWE</span>
                    </div>
                    <div className="cc-preshift-item-body" style={{maxHeight:200,overflow:"auto"}}>{w.content}</div>
                    <div className="cc-preshift-item-meta">Zaktualizowano: {w.updatedAt}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

      </div>
    </section>
  );
}
