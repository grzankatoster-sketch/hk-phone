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
  pendingCorrections=0, faultsCount=0, voucherCount=0, chatCount=0, showToast,
}){
  const tabToGroup={
    wiadomosci:"dashboard", statystyki:"dashboard",
    pracownicy:"zespol", ewidencja:"zespol", historia:"zespol", grafik:"zespol",
    usterki:"pokoje", goscie:"pokoje", parking:"pokoje", opinie:"pokoje",
    alerty:"komunikacja", przypomnienia:"komunikacja", czat:"komunikacja",
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
    komunikacja: chatCount,
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
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={activeTab===id}
      className={`wsb-item${activeTab===id?" wsb-active":""}`}
      onClick={()=>setActiveTab(id)}>
      <span className="wsb-icon" aria-hidden="true">{icon}</span><span className="wsb-label">{label}</span>
      {badge>0&&<span className="wsb-badge">{badge}</span>}
    </button>
  );
  const soon=(icon,label)=>(
    <button
      type="button"
      aria-disabled="true"
      className="wsb-item wsb-disabled"
      onClick={()=>showToast&&showToast(`Moduł "${label}" — wkrótce dostępny.`,"info")}>
      <span className="wsb-icon" aria-hidden="true">{icon}</span><span className="wsb-label">{label}</span>
      <span className="wsb-soon">Wkrótce</span>
    </button>
  );
  const detailsTitle={
    dashboard:"Dashboard", zespol:"Zespół", pokoje:"Pokoje",
    komunikacja:"Komunikacja", finanse:"Finanse",
    konfig:"Konfiguracja", system:"System",
  }[activeGroup];

  return(
    <aside className={`worker-sidebar-rail${adminDark?" worker-sidebar-dark":""}`} aria-label="Panel kierownictwa — nawigacja">
      <div className="wsb-rail">
        <div className="wsb-rail-logo" title="Conrad Comfort — panel kierownictwa" aria-hidden="true"><Logo variant="icon" tone="dark"/></div>
        <div className="wsb-rail-groups" role="tablist" aria-label="Grupy paneli">
          {groups.map(g=>(
            <button key={g.id}
              type="button"
              role="tab"
              aria-selected={activeGroup===g.id}
              className={`wsb-rail-btn${activeGroup===g.id?" wsb-rail-active":""}`}
              onClick={()=>setActiveGroup(g.id)}
              title={g.label}>
              <span aria-hidden="true">{g.icon}</span>
              {groupBadge[g.id]>0&&<span className="wsb-rail-dot" aria-hidden="true"/>}
              <span className="visually-hidden">{g.label}</span>
            </button>
          ))}
        </div>
        <div className="wsb-rail-spacer"/>
        <button type="button" className="wsb-rail-btn" onClick={()=>setShowSearch(true)} title="Szukaj"><Search size={22} aria-hidden="true"/><span className="visually-hidden">Szukaj</span></button>
        <button type="button" className={`wsb-rail-btn wsb-rail-update wsb-rail-update--${updateState||"idle"}`} onClick={onCheckUpdate} title="Sprawdź aktualizacje"><RefreshCw size={22} aria-hidden="true"/><span className="visually-hidden">Sprawdź aktualizacje</span></button>
        <button type="button" className="wsb-rail-btn" onClick={()=>setAdminDark(v=>!v)} title={adminDark?"Tryb jasny":"Tryb ciemny"}>
          {adminDark?<Sun size={22} aria-hidden="true"/>:<Moon size={22} aria-hidden="true"/>}
          <span className="visually-hidden">{adminDark?"Tryb jasny":"Tryb ciemny"}</span>
        </button>
        <button type="button" className="wsb-rail-btn" onClick={handleAdminLogout} title="Wyloguj"><LogOut size={22} aria-hidden="true"/><span className="visually-hidden">Wyloguj</span></button>
      </div>

      <div className="wsb-details">
        <div className="wsb-details-header">
          <div className="wsb-details-title">{detailsTitle}</div>
          <div className="wsb-details-sub">Kierownik: <strong>{currentManager}</strong></div>
        </div>
        {updateState==="available"&&updateInfo&&(
          <div className="cc-update-banner cc-update-banner--info" role="status">
            <div className="cc-update-banner-title">Dostępna v{updateInfo.version}</div>
            <button type="button" onClick={onDownloadUpdate} className="cc-update-banner-btn cc-update-banner-btn--info">Pobierz aktualizację</button>
          </div>
        )}
        {updateState==="downloading"&&(
          <div className="cc-update-banner cc-update-banner--progress" role="status" aria-live="polite">
            <RefreshCw size={13} aria-hidden="true"/>
            <span>Pobieranie {updateProgress}%</span>
          </div>
        )}
        {updateState==="downloaded"&&(
          <div className="cc-update-banner cc-update-banner--ready" role="status">
            <div className="cc-update-banner-title">Aktualizacja gotowa</div>
            <button type="button" onClick={onInstallUpdate} className="cc-update-banner-btn cc-update-banner-btn--ready">Zaktualizuj teraz</button>
          </div>
        )}
        <div className="wsb-details-items" role="tablist" aria-label={`Panele: ${detailsTitle}`}>
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
            {/* Czat między działami — tymczasowo ukryty (kod pozostaje, można przywrócić). */}
            {/* {nb("czat",<MessageSquare size={14}/>,"Czat zespołu",chatCount)} */}
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
