import React from "react";
import {
  BarChart2, Users, Cog, MessageSquare, FileText, Settings, ShieldCheck,
  Search, RefreshCw, Sun, Moon, LogOut, Bell, History, CheckSquare,
  ArrowLeftRight, AlertTriangle, AlertCircle, BellRing, BookOpen,
  Calendar, Star,
  Car,
} from "lucide-react";
import Logo from "../../ui/Logo";

export default function AdminSidebarRail({
  activeTab, setActiveTab, setShowWiki, setShowAuditLog, handleAdminLogout, setShowSearch,
  adminDark, setAdminDark, onCheckUpdate, currentManager, unreadMsgCount=0,
  updateState, updateInfo, updateProgress, onDownloadUpdate, onInstallUpdate,
  pendingCorrections=0, faultsCount=0, voucherCount=0, showToast,
}){
  const tabToGroup={
    wiadomosci:"dashboard", statystyki:"dashboard",
    pracownicy:"zespol", ewidencja:"zespol", historia:"zespol", grafik:"zespol",
    usterki:"pokoje", goscie:"pokoje", parking:"pokoje", opinie:"pokoje",
    alerty:"komunikacja", przypomnienia:"komunikacja",
    korekty:"finanse", kasa:"finanse", vouchery:"finanse",
    zadania:"konfig", wiki:"konfig",
    ustawienia:"system",
  };
  const [activeGroup,setActiveGroup]=React.useState(tabToGroup[activeTab]||"dashboard");
  React.useEffect(()=>{
    if(tabToGroup[activeTab]&&tabToGroup[activeTab]!==activeGroup) setActiveGroup(tabToGroup[activeTab]);
  },[activeTab]);
  const groupBadge={
    dashboard: unreadMsgCount,
    pokoje: faultsCount,
    finanse: pendingCorrections + voucherCount,
  };
  const groups=[
    {id:"dashboard", label:"Dashboard",  icon:<BarChart2 size={22}/>},
    {id:"zespol",    label:"Zespół",     icon:<Users size={22}/>},
    {id:"pokoje",    label:"Pokoje",     icon:<Cog size={22}/>},
    {id:"komunikacja",label:"Komunikacja",icon:<MessageSquare size={22}/>},
    {id:"finanse",   label:"Finanse",    icon:<FileText size={22}/>},
    {id:"konfig",    label:"Konfiguracja",icon:<Settings size={22}/>},
    {id:"system",    label:"System",     icon:<ShieldCheck size={22}/>},
  ];
  const nb=(id,icon,label,badge=0)=>(
    <button key={id} className={`wsb-item${activeTab===id?" wsb-active":""}`} onClick={()=>setActiveTab(id)}>
      <span className="wsb-icon">{icon}</span><span className="wsb-label">{label}</span>
      {badge>0&&<span className="wsb-badge">{badge}</span>}
    </button>
  );
  const soon=(icon,label)=>(
    <button className="wsb-item wsb-disabled" onClick={()=>showToast&&showToast(`Moduł "${label}" — wkrótce dostępny.`,"info")}>
      <span className="wsb-icon">{icon}</span><span className="wsb-label">{label}</span>
      <span className="wsb-soon">Wkrótce</span>
    </button>
  );
  const detailsTitle={
    dashboard:"Dashboard", zespol:"Zespół", pokoje:"Pokoje",
    komunikacja:"Komunikacja", finanse:"Finanse",
    konfig:"Konfiguracja", system:"System",
  }[activeGroup];

  return(
    <aside className={`worker-sidebar-rail${adminDark?" worker-sidebar-dark":""}`}>
      <div className="wsb-rail">
        <div className="wsb-rail-logo" title="Conrad Comfort — panel kierownictwa"><Logo variant="icon" tone="dark"/></div>
        <div className="wsb-rail-groups">
          {groups.map(g=>(
            <button key={g.id}
              className={`wsb-rail-btn${activeGroup===g.id?" wsb-rail-active":""}`}
              onClick={()=>setActiveGroup(g.id)}
              title={g.label}>
              {g.icon}
              {groupBadge[g.id]>0&&<span className="wsb-rail-dot"/>}
            </button>
          ))}
        </div>
        <div className="wsb-rail-spacer"/>
        <button className="wsb-rail-btn" onClick={()=>setShowSearch(true)} title="Szukaj"><Search size={22}/></button>
        <button className="wsb-rail-btn" onClick={onCheckUpdate}
          style={{color:updateState==="available"?"#60a5fa":updateState==="error"?"#f87171":undefined}}
          title="Sprawdź aktualizacje"><RefreshCw size={22}/></button>
        <button className="wsb-rail-btn" onClick={()=>setAdminDark(v=>!v)} title={adminDark?"Tryb jasny":"Tryb ciemny"}>
          {adminDark?<Sun size={22}/>:<Moon size={22}/>}
        </button>
        <button className="wsb-rail-btn" onClick={handleAdminLogout} title="Wyloguj"><LogOut size={22}/></button>
      </div>

      <div className="wsb-details">
        <div className="wsb-details-header">
          <div className="wsb-details-title">{detailsTitle}</div>
          <div className="wsb-details-sub">Kierownik: <strong>{currentManager}</strong></div>
        </div>
        {updateState==="available"&&updateInfo&&(
          <div style={{margin:"10px 12px",padding:"10px 12px",background:"rgba(56,189,248,.12)",border:"1px solid rgba(56,189,248,.35)",borderRadius:8,fontSize:12}}>
            <div style={{color:"#38bdf8",fontWeight:700,marginBottom:6}}>Dostępna v{updateInfo.version}</div>
            <button onClick={onDownloadUpdate} className="btn btn-sky" style={{fontSize:11,padding:"4px 10px",width:"100%"}}>Pobierz aktualizację</button>
          </div>
        )}
        {updateState==="downloading"&&(
          <div style={{margin:"10px 12px",padding:"10px 12px",background:"rgba(56,189,248,.08)",border:"1px solid rgba(56,189,248,.25)",borderRadius:8,fontSize:12,color:"#38bdf8",display:"flex",alignItems:"center",gap:8}}>
            <RefreshCw size={13}/> Pobieranie {updateProgress}%
          </div>
        )}
        {updateState==="downloaded"&&(
          <div style={{margin:"10px 12px",padding:"10px 12px",background:"rgba(52,211,153,.12)",border:"1px solid rgba(52,211,153,.35)",borderRadius:8,fontSize:12}}>
            <div style={{color:"#34d399",fontWeight:700,marginBottom:6}}>Aktualizacja gotowa</div>
            <button onClick={onInstallUpdate} className="btn btn-emerald" style={{fontSize:11,padding:"4px 10px",width:"100%"}}>Zaktualizuj teraz</button>
          </div>
        )}
        <div className="wsb-details-items">
          {activeGroup==="dashboard"&&<>
            {nb("wiadomosci",<Bell size={14}/>,"Wiadomości",unreadMsgCount)}
            {nb("statystyki",<BarChart2 size={14}/>,"Statystyki")}
          </>}
          {activeGroup==="zespol"&&<>
            {nb("pracownicy",<Users size={14}/>,"Pracownicy")}
            {nb("ewidencja",<History size={14}/>,"Ewidencja godzin")}
            {nb("historia",<ArrowLeftRight size={14}/>,"Historia przekazań")}
            {nb("grafik",<Calendar size={14}/>,"Grafik zmian")}
          </>}
          {activeGroup==="pokoje"&&<>
            {nb("usterki",<AlertTriangle size={14}/>,"Usterki",faultsCount)}
            {nb("goscie",<Users size={14}/>,"Stali goście")}
            {nb("parking",<Car size={14}/>,"Parking")}
            {nb("opinie",<Star size={14}/>,"Opinie gosci")}
          </>}
          {activeGroup==="komunikacja"&&<>
            {nb("alerty",<AlertCircle size={14}/>,"Pilne informacje")}
            {nb("przypomnienia",<BellRing size={14}/>,"Stale przypomnienia")}
          </>}
          {activeGroup==="finanse"&&<>
            {nb("korekty",<FileText size={14}/>,"Korekty płatności",pendingCorrections)}
            {nb("kasa",<Settings size={14}/>,"Kasa")}
            {nb("vouchery",<FileText size={14}/>,"Vouchery",voucherCount)}
          </>}
          {activeGroup==="konfig"&&<>
            {nb("zadania",<CheckSquare size={14}/>,"Zadania zmian")}
            <button className="wsb-item" onClick={()=>setShowWiki(true)}><span className="wsb-icon"><BookOpen size={14}/></span><span className="wsb-label">Wiki</span></button>
            <button className="wsb-item" onClick={()=>setShowAuditLog(true)}><span className="wsb-icon"><History size={14}/></span><span className="wsb-label">Log audytowy</span></button>
          </>}
          {activeGroup==="system"&&<>
            {nb("ustawienia",<Cog size={14}/>,"Ustawienia")}
          </>}
        </div>
        <div className="wsb-spacer"/>
      </div>
    </aside>
  );
}
