// Copyright © 2026 Conrad Comfort. All rights reserved. UNLICENSED.
import React from "react";
import { Download, Trash2, Plus, Users, MessageSquare, X, RefreshCw } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import {
  HK_FLOOR1, HK_FLOOR2, HK_FLOOR3, HK_ALL, HK_APTS,
  HK_STATUS_COLORS, HK_STATUS_COLORS_LIGHT, HK_SPECIAL_ROOMS, HK_ROOMS_SGL_TWIN_ONLY, TENANT_ID,
} from "../../lib/constants";
import {
  downloadHKMain, downloadHKRoomList, downloadHKStatus,
  downloadHKCleaningList,
} from "../../lib/pdf-hk";
import HKLivePanel from "./HKLivePanel";
import { supabase } from "../../lib/supabase";

// Paleta kolorów dla chipów pracowników
const CHIP_COLORS = [
  "#5a1d4a","#1e3a8a","#0891b2","#15803d","#a16207",
  "#be123c","#7c3aed","#0f766e","#c2410c","#475569",
];

const HK_STATUS_LABELS = {
  W: "Wyjazd",
  WP: "Wyjazd/Przyjazd",
  P: "Przyjazd",
  PG: "PG",
  PGZ: "PGZ",
  BR: "BR",
  ZS: "ZS",
};

const HK_PLAN_PREFIX = "reception-hk-plan";
const HK_PRIORITY_PREFIX = "reception-hk-priority";
const priorityKey = (date) => `${HK_PRIORITY_PREFIX}-${date}`;
const HK_LEGACY_DATA_PREFIX = "hk-data";
const HK_PLAN_RETENTION_DAYS = 31;
// Obsada (lista pracowników) wysyłana z telefonu (wyjazdy.html → hk_roster).
// Hierarchia: nowszy wysłany roster jest prawidłowy i nadpisuje starszy/lokalny.
// Retencja: roster starszy niż 2 dni jest traktowany jako nieaktualny (nie nadpisuje automatycznie).
const ROSTER_APPLIED_PREFIX = "reception-hk-roster-last";
const ROSTER_MAX_AGE_DAYS = 2;
const isRosterStale = (updatedAt) => {
  const t = Date.parse(updatedAt || "");
  if (Number.isNaN(t)) return false;
  return Date.now() - t > ROSTER_MAX_AGE_DAYS * 86400000;
};

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
const emptyPlan = () => ({
  data: {},
  staff: [],
  dutyPerson: "",
  afternoonPerson: "",
  brMode: false,
  zsMode: false,
  exists: false,
});
const planKey = (date) => `${HK_PLAN_PREFIX}-${date}`;
const legacyDataKey = (date) => `${HK_LEGACY_DATA_PREFIX}-${date}`;
const parseDateKey = (date) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return null;
  const d = new Date(`${date}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
};
const isOlderThanRetention = (date) => {
  const d = parseDateKey(date);
  if (!d) return false;
  const cutoff = new Date();
  cutoff.setHours(12, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - HK_PLAN_RETENTION_DAYS);
  return d < cutoff;
};
const normalizePlan = (raw, exists = true) => ({
  data: isObj(raw?.data) ? raw.data : {},
  staff: Array.isArray(raw?.staff) ? raw.staff : [],
  dutyPerson: raw?.dutyPerson || "",
  afternoonPerson: raw?.afternoonPerson || "",
  brMode: !!raw?.modes?.brMode,
  zsMode: !!raw?.modes?.zsMode,
  exists,
});
const loadHkPlan = (date) => {
  if (!date || isOlderThanRetention(date)) return emptyPlan();
  const saved = loadJson(planKey(date), null);
  if (isObj(saved)) return normalizePlan(saved, true);
  const legacyData = loadJson(legacyDataKey(date), null);
  if (isObj(legacyData) && Object.keys(legacyData).length > 0) {
    return { ...emptyPlan(), data: legacyData, exists: true };
  }
  return emptyPlan();
};
const saveHkPlan = (date, { hkData, hkStaff, dutyPerson, afternoonPerson, brMode, zsMode }) => {
  if (!date || isOlderThanRetention(date)) return;
  saveJson(planKey(date), {
    version: 1,
    savedAt: new Date().toISOString(),
    data: isObj(hkData) ? hkData : {},
    staff: Array.isArray(hkStaff) ? hkStaff : [],
    dutyPerson: dutyPerson || "",
    afternoonPerson: afternoonPerson || "",
    modes: { brMode: !!brMode, zsMode: !!zsMode },
  });
};
const pruneOldHkPlans = () => {
  try {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i));
    keys.filter(Boolean).forEach((key) => {
      const date = key.startsWith(`${HK_PLAN_PREFIX}-`)
        ? key.slice(HK_PLAN_PREFIX.length + 1)
        : key.startsWith(`${HK_LEGACY_DATA_PREFIX}-`)
          ? key.slice(HK_LEGACY_DATA_PREFIX.length + 1)
          : "";
      if (date && isOlderThanRetention(date)) localStorage.removeItem(key);
    });
  } catch {}
};

const RoomRow = React.memo(function RoomRow({
  room,rdStatus,rdPerson,rdType,rdBR,rdZS,rdAptNote,
  brMode,zsMode,editMode,dark,hkStaff,setRoom,setAssignModal,
}){
  const isApt=!!room.apt;
  const isSglTwinOnly=HK_ROOMS_SGL_TWIN_ONLY.includes(room.no);
  const [localType,setLocalType]=React.useState(rdType||room.type);
  const [localStatus,setLocalStatus]=React.useState(rdStatus||"");
  const [localBR,setLocalBR]=React.useState(rdBR||false);
  const [localZS,setLocalZS]=React.useState(rdZS||false);
  const [localAptNote,setLocalAptNote]=React.useState(rdAptNote||"");

  const prevStatus=React.useRef(rdStatus);
  React.useEffect(()=>{if(rdStatus!==prevStatus.current){setLocalStatus(rdStatus||"");prevStatus.current=rdStatus;}},[rdStatus]);
  const prevBR=React.useRef(rdBR);
  React.useEffect(()=>{if(rdBR!==prevBR.current){setLocalBR(rdBR||false);prevBR.current=rdBR;}},[rdBR]);
  const prevZS=React.useRef(rdZS);
  React.useEffect(()=>{if(rdZS!==prevZS.current){setLocalZS(rdZS||false);prevZS.current=rdZS;}},[rdZS]);
  const prevType=React.useRef(rdType);
  React.useEffect(()=>{if(rdType!==prevType.current){setLocalType(rdType||room.type);prevType.current=rdType;}},[rdType,room.type]);
  const prevAptNote=React.useRef(rdAptNote);
  React.useEffect(()=>{if(rdAptNote!==prevAptNote.current){setLocalAptNote(rdAptNote||"");prevAptNote.current=rdAptNote;}},[rdAptNote]);

  const handleTypeChange=React.useCallback((e)=>{const val=e.target.value;setLocalType(val);setRoom(room.no,"roomType",val);},[room.no,setRoom]);
  const handleBR=React.useCallback(()=>{const next=!localBR;setLocalBR(next);setRoom(room.no,"br",next);},[room.no,localBR,setRoom]);
  const handleZS=React.useCallback(()=>{const next=!localZS;setLocalZS(next);setRoom(room.no,"zs",next);},[room.no,localZS,setRoom]);
  const handleAptNoteChange=React.useCallback((e)=>{setLocalAptNote(e.target.value);},[]);
  const handleAptNoteBlur=React.useCallback((e)=>{setRoom(room.no,"apartmentNote",e.target.value);},[room.no,setRoom]);
  const stopShortcutPropagation=React.useCallback((e)=>{e.stopPropagation();},[]);
  const handleRoomModeClick=React.useCallback((e)=>{
    if(!brMode&&!zsMode)return;
    if(e.target.closest("button,select,input,textarea"))return;
    e.preventDefault();
    if(brMode){
      const next=!localBR;
      setLocalBR(next);
      setRoom(room.no,"br",next);
      return;
    }
    const next=!localZS;
    setLocalZS(next);
    setRoom(room.no,"zs",next);
  },[brMode,zsMode,localBR,localZS,room.no,setRoom]);

  const typeOptions=isApt
    ?["DBL","2xDBL","TWIN","2xTWIN","D+T","D+T+SOFA","D+T+SOFA 1","D+T+SOFA 2","5xSGL","2xTWIN+SOFA 1","SGL"]
    :isSglTwinOnly?["SGL","TWIN"]
    :HK_SPECIAL_ROOMS.includes(room.no)?["DBL","SGL","TWIN","TRPL","D+S"]
    :["DBL","SGL","TWIN","TRPL"];

  const personIdx=hkStaff.findIndex(s=>s.name===rdPerson);
  const chipColor=personIdx>=0?CHIP_COLORS[personIdx%CHIP_COLORS.length]:"#94a3b8";
  const textColor=dark?"var(--dark-text)":"var(--text-primary)";
  const mutedColor=dark?"var(--dark-text-muted)":"var(--text-muted)";
  const selectBg=dark?"rgba(255,255,255,.07)":"#f8fafc";
  const selectBorder=dark?"var(--dark-border)":"#e2e8f0";

  const statusActions=[
    {key:"BR",label:"BR",handler:handleBR,active:localBR},
    {key:"ZS",label:"ZS",handler:handleZS,active:localZS},
  ];

  const sc=dark?HK_STATUS_COLORS:HK_STATUS_COLORS_LIGHT;
  const statusBadge=localStatus?(()=>{
    const c=sc[localStatus]||sc.W;
    return (
      <span className="hkd-auto-status"
        style={{background:c.bg,color:c.color,boxShadow:`0 0 0 1px ${c.border}`}}>
        {HK_STATUS_LABELS[localStatus]||localStatus}
      </span>
    );
  })():null;

  // Plakietki BR/ZS — widoczne obok statusu (np. Przyjazd + BR jednocześnie)
  const flagBadges=(localBR||localZS)?(
    <span className="hkd-flag-badges">
      {localBR&&<span className="hkd-flag-badge br" title="Brak ręczników">BR</span>}
      {localZS&&<span className="hkd-flag-badge zs" title="Zmiana pościeli">ZS</span>}
    </span>
  ):null;

  const statusGroup=statusActions.length?(
    <div className="hkd-status-group" style={dark?{background:"rgba(255,255,255,.04)",borderColor:"var(--dark-border)"}:undefined}>
      {statusActions.map(({key,label,handler,active})=>{
        const c=sc[key]||sc.W;
        return(
          <button key={key} className="hkd-status-btn"
            style={active?{background:c.bg,color:c.color,boxShadow:`0 0 0 1px ${c.border}`}:undefined}
            onMouseDown={e=>{e.preventDefault();e.stopPropagation();handler();}}>
            {label}
          </button>
        );
      })}
    </div>
  ):null;

  const assignControl=editMode?(
    <select className="hkd-assign-select" value={rdPerson||""} onChange={e=>setRoom(room.no,"person",e.target.value)}
      style={{height:22,padding:"0 18px 0 7px",borderRadius:6,fontSize:11,fontWeight:500,
              border:`1px solid ${dark?"#c8a050":"#c8a050"}`,background:dark?"rgba(255,255,255,.08)":"#fff",
              color:textColor,cursor:"pointer",fontFamily:"inherit",
              appearance:"none",WebkitAppearance:"none"}}>
      <option value="">— brak —</option>
      {hkStaff.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
    </select>
  ):(
    <button className={`hkd-assign-pill${rdPerson?" assigned":""}`}
      style={rdPerson?{borderColor:chipColor}:undefined}
      onMouseDown={e=>{e.preventDefault();e.stopPropagation();setAssignModal(room.no);}}>
      {rdPerson?(
        <>
          <span style={{width:6,height:6,borderRadius:"50%",background:chipColor,flexShrink:0,display:"inline-block"}}/>
          <span className="hkd-assign-name">{rdPerson.split(" ")[0]}</span>
        </>
      ):(
        <span style={{color:mutedColor,fontWeight:400}}>—</span>
      )}
    </button>
  );

  const numStyle={fontWeight:700,fontSize:12.5,color:textColor,fontVariantNumeric:"tabular-nums",flexShrink:0};
  const rowActions=(
    <div className="hkd-room-actions">
      {assignControl}
      {statusBadge}
      {flagBadges}
      {statusGroup}
    </div>
  );

  if(isApt){
    return(
      <div className="hkd-room" onMouseDown={handleRoomModeClick}
        style={brMode||zsMode?{cursor:"pointer"}:undefined}>
        <div style={{display:"grid",gridTemplateColumns:"40px minmax(0,1fr) minmax(0,auto)",alignItems:"center",gap:5}}>
          <span style={numStyle}>{room.no}</span>
          <input type="text" value={localAptNote}
            onChange={handleAptNoteChange}
            onKeyDown={stopShortcutPropagation}
            onBlur={e=>{handleAptNoteBlur(e);e.currentTarget.style.borderColor=dark?"var(--dark-border)":"#dde3f0";}}
            placeholder="D+T, D+D, SOFA…"
            style={{height:22,padding:"0 7px",borderRadius:6,fontSize:11,
                    border:`1px solid ${dark?"var(--dark-border)":"#dde3f0"}`,
                    background:dark?"rgba(255,255,255,.05)":"#fafbff",
                    color:textColor,fontFamily:"inherit",outline:"none",minWidth:0}}
            onFocus={e=>e.currentTarget.style.borderColor="#5a1d4a"}
          />
          {rowActions}
        </div>
      </div>
    );
  }

  const statusClass=(rd)=>{
    if(rd?.zs)return "donotdisturb";
    if(rd?.br)return "dirty";
    if(rd?.status==="W"||rd?.status==="WP")return "checkout";
    if(rd?.status==="P")return "inprogress";
    if(rd?.status==="PG"||rd?.status==="PGZ")return "clean";
    if(rd?.person)return "inprogress";
    return "vacant";
  };
  const toggleRoomFlag=(roomNo,flag)=>setRoom(roomNo,flag,!hkData[roomNo]?.[flag]);
  const handleRoomCardClick=(roomNo,e)=>{
    if(e.target.closest("button,select,input"))return;
    if(brMode){toggleRoomFlag(roomNo,"br");return;}
    if(zsMode){toggleRoomFlag(roomNo,"zs");return;}
    setAssignModal(roomNo);
  };
  const renderRoomCard=(room)=>{
    const rd=hkData[room.no]||{};
    const cls=statusClass(rd);
    const type=rd.roomType||room.type||rd.apartmentNote||"";
    return(
      <div key={room.no} className={`room-card ${cls}`} onClick={(e)=>handleRoomCardClick(room.no,e)}>
        <div className={`room-status-dot ${cls}`}/>
        <div className="room-num">{room.no}</div>
        <div className={`room-worker${rd.person?" assigned":""}`}>{rd.person?rd.person.split(" ")[0]:"wolny"}</div>
        <div className="room-type">{type}{room.apt?" · APT":""}</div>
        <div className="room-card-actions">
          <select value={rd.roomType||room.type||""} onChange={e=>setRoom(room.no,"roomType",e.target.value)} onClick={e=>e.stopPropagation()} style={{flex:1,minWidth:0}}>
            {(room.apt?["DBL","2xDBL","TWIN","2xTWIN","D+T","D+T+SOFA","SGL"]:["DBL","SGL","TWIN","TRPL","D+S"]).map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          <button className={rd.br?"active":""} onClick={e=>{e.stopPropagation();toggleRoomFlag(room.no,"br");}}>BR</button>
          <button className={rd.zs?"active":""} onClick={e=>{e.stopPropagation();toggleRoomFlag(room.no,"zs");}}>ZS</button>
        </div>
      </div>
    );
  };
  const renderFloorCards=(rooms,label,range)=>(
    <div className="floor-section" key={label}>
      <div className="floor-label">
        <span>{label}</span>
        <div className="floor-label-line"/>
        <span>{range}</span>
      </div>
      <div className="room-grid">{rooms.map(renderRoomCard)}</div>
    </div>
  );

  return(
    <div className="hkd-room" onMouseDown={handleRoomModeClick}
      style={brMode||zsMode?{cursor:"pointer"}:undefined}>
      <div style={{display:"grid",gridTemplateColumns:"40px 66px minmax(0,1fr)",alignItems:"center",gap:5}}>
        <span style={numStyle}>{room.no}</span>
        <select value={localType} onChange={handleTypeChange}
          style={{height:22,padding:"0 3px 0 5px",borderRadius:6,fontSize:10.5,
                  border:`1px solid ${selectBorder}`,background:selectBg,
                  color:dark?"var(--dark-text-muted)":mutedColor,fontFamily:"inherit",cursor:"pointer",
                  appearance:"none",WebkitAppearance:"none"}}>
          {typeOptions.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        {rowActions}
      </div>
    </div>
  );
},(prev,next)=>
  prev.room===next.room&&
  prev.rdStatus===next.rdStatus&&
  prev.rdPerson===next.rdPerson&&
  prev.rdType===next.rdType&&
  prev.rdBR===next.rdBR&&
  prev.rdZS===next.rdZS&&
  prev.rdAptNote===next.rdAptNote&&
  prev.brMode===next.brMode&&
  prev.zsMode===next.zsMode&&
  prev.editMode===next.editMode&&
  prev.dark===next.dark&&
  prev.hkStaff===next.hkStaff&&
  prev.setRoom===next.setRoom&&
  prev.setAssignModal===next.setAssignModal
);

function HKPanel({dark,hkDate,setHkDate,hkStaff,setHkStaff,hkData,setHkData,showToast,askConfirm,isManager,employeeName}){
  const [hkTab,setHkTab]=React.useState("plan");
  // Agent AI: po kliknięciu powiadomienia/bannera przełącz na Monitor (HK Live).
  React.useEffect(()=>{
    const onFocus=()=>setHkTab("live");
    window.addEventListener("cc-agent-focus",onFocus);
    return ()=>window.removeEventListener("cc-agent-focus",onFocus);
  },[]);
  const [hkNotes,setHkNotes]=React.useState(()=>loadJson(STORAGE_KEYS.hkNotes,{}));
  const [noteRoom,setNoteRoom]=React.useState("");
  const [noteText,setNoteText]=React.useState("");
  const [dutyPerson,setDutyPerson]=React.useState("");
  const [afternoonPerson,setAfternoonPerson]=React.useState("");
  const [staffEdit,setStaffEdit]=React.useState(false);   // tryb edycji obsady („w razie czego")
  const [rosterFrom,setRosterFrom]=React.useState("");    // źródło obsady: znacznik z telefonu

  // Wczytaj obsadę wysłaną z telefonu (wyjazdy.html → „Wyślij") dla wybranego dnia.
  // Hierarchia: nowszy roster (po updated_at) jest prawidłowy i nadpisuje lokalną obsadę.
  // Realtime: gdy menadżer wyśle zmianę przy otwartym panelu — podbija się sama.
  React.useEffect(()=>{
    if(!supabase||!hkDate)return;
    let stop=false;
    setRosterFrom("");
    const appliedKey=`${ROSTER_APPLIED_PREFIX}-${hkDate}`;
    // Zwraca true gdy faktycznie nadpisaliśmy obsadę.
    const applyRoster=(data,{force=false}={})=>{
      if(!data||!Array.isArray(data.roster)||!data.roster.length)return false;
      const updIso=data.updated_at||"";
      const upd=updIso?new Date(updIso).toLocaleString("pl-PL",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
      setRosterFrom(upd?`telefon · ${upd}`:"telefon");
      if(!force){
        if(isRosterStale(updIso))return false;              // starszy niż 2 dni — nie nadpisuj automatycznie
        if(updIso&&localStorage.getItem(appliedKey)===updIso)return false; // ten roster już zastosowany
      }
      setHkStaff(data.roster.map(r=>({name:r.name})));
      const duty=data.roster.find(r=>r.role==="dyzur"); setDutyPerson(duty?duty.name:"");
      const pm=data.roster.find(r=>r.role==="popoludnie"); setAfternoonPerson(pm?pm.name:"");
      if(updIso)localStorage.setItem(appliedKey,updIso);
      return true;
    };
    const fetchRoster=async({force=false}={})=>{
      const{data}=await supabase.from("hk_roster").select("roster,updated_at").eq("tenant_id",TENANT_ID).eq("date",hkDate).maybeSingle();
      if(stop)return false;
      const applied=applyRoster(data,{force});
      if(applied)showToast?.(force?"Wczytano najnowszą obsadę z telefonu — sprawdź Auto-przypisz.":"Zaktualizowano obsadę z telefonu — sprawdź Auto-przypisz.","info");
      else if(force)showToast?.("Brak nowszej obsady z telefonu dla tej daty.","info");
      return applied;
    };
    forceRosterSyncRef.current=()=>fetchRoster({force:true});
    fetchRoster({force:false});
    const ch=supabase.channel(`hk-roster-${hkDate}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"hk_roster",filter:`date=eq.${hkDate}`},()=>fetchRoster({force:false}))
      .subscribe();
    return()=>{stop=true;forceRosterSyncRef.current=null;supabase.removeChannel(ch);};
  },[hkDate]);
  const [brMode,setBrMode]=React.useState(false);
  const [zsMode,setZsMode]=React.useState(false);
  const [wMode,setWMode]=React.useState(false);
  const [editMode,setEditMode]=React.useState(false);
  const [floorFilter,setFloorFilter]=React.useState("all");
  const [assignModal,setAssignModal]=React.useState(null); // roomNo lub null
  const [autoSource,setAutoSource]=React.useState(null);
  const [vacatedRooms,setVacatedRooms]=React.useState({}); // { roomNo: { vacated:true, time:string } }
  const [priorityRooms,setPriorityRooms]=React.useState(()=>loadJson(priorityKey(hkDate),{})); // { roomNo: { at:number } } — recepcja poprosiła HK o pilne
  const [priorityMenu,setPriorityMenu]=React.useState(null); // roomNo|null — otwarte menu „!" (Pilne / Zapytaj o status)
  const [priorityMenuSide,setPriorityMenuSide]=React.useState("right"); // strona otwarcia menu (flip przy krawędzi okna)
  const [liveStatus,setLiveStatus]=React.useState({});     // { roomNo: "czyszczenie"|"czyste"|"pominięte" } — postęp HK z telefonów
  const didLoadInitialPlan=React.useRef(false);
  const skipFirstPlanSave=React.useRef(true);
  const autoImportInFlight=React.useRef(false);
  const lastAutoError=React.useRef(null);
  const forceSyncRef=React.useRef(null);
  const forceRosterSyncRef=React.useRef(null);
  // Po pobraniu NOWEGO planu z maila ustawiamy ten znacznik, by efekt rozpisał pokoje
  // automatycznie (zastępuje dawny guzik „Auto‑przypisz").
  const autoAssignPending=React.useRef(false);

  const applyPlan=React.useCallback((plan)=>{
    setHkData(plan.data || {});
    setHkStaff(plan.staff || []);
    setDutyPerson(plan.dutyPerson || "");
    setAfternoonPerson(plan.afternoonPerson || "");
    setBrMode(!!plan.brMode);
    setZsMode(!!plan.zsMode);
    setEditMode(false);
    setAssignModal(null);
  },[setHkData,setHkStaff]);

  const saveCurrentPlan=React.useCallback((date=hkDate)=>{
    saveHkPlan(date,{hkData,hkStaff,dutyPerson,afternoonPerson,brMode,zsMode});
  },[hkDate,hkData,hkStaff,dutyPerson,afternoonPerson,brMode,zsMode]);

  React.useEffect(()=>{pruneOldHkPlans();},[]);

  // Fetch + realtime vacated rooms from Supabase dla bieżącej daty
  React.useEffect(()=>{
    if(!hkDate)return;
    let active=true;
    const LIVE=["czyszczenie","czyste","pominięte"];
    const fetchVacated=async()=>{
      const{data}=await supabase.from("hk_rooms").select("room,vacated,status,updated_at").eq("date",hkDate);
      if(!active||!data)return;
      const m={};const ls={};
      data.forEach(r=>{
        if(r.vacated)m[r.room]={vacated:true,updatedAt:r.updated_at};
        if(LIVE.includes(r.status))ls[r.room]=r.status;
      });
      setVacatedRooms(m);setLiveStatus(ls);
    };
    fetchVacated();
    const ch=supabase.channel(`hk-plan-vacated-${hkDate}`)
      .on("postgres_changes",{event:"*",schema:"public",table:"hk_rooms",filter:`date=eq.${hkDate}`},({new:row})=>{
        if(!active||!row)return;
        setVacatedRooms(prev=>{
          if(row.vacated)return{...prev,[row.room]:{vacated:true,updatedAt:row.updated_at}};
          const next={...prev};delete next[row.room];return next;
        });
        setLiveStatus(prev=>{
          if(LIVE.includes(row.status))return{...prev,[row.room]:row.status};
          const next={...prev};delete next[row.room];return next;
        });
      }).subscribe();
    return()=>{active=false;supabase.removeChannel(ch);};
  },[hkDate]);

  // Recepcja prosi HK o pilne sprzątnięcie pokoju (W/WP) w pierwszej kolejności.
  // Klik wysyła powiadomienie push na telefon przypisanej osoby (lub wszystkich, gdy brak przypisania)
  // i loguje zdarzenie do Supabase, by pojawiło się w Monitorze HK. Ponowny klik anuluje priorytet.
  const requestPriority=React.useCallback((roomNo)=>{
    const isOn=!!priorityRooms[roomNo];
    const worker=hkData[roomNo]?.person||null;
    if(isOn){
      setPriorityRooms(prev=>{const n={...prev};delete n[roomNo];saveJson(priorityKey(hkDate),n);return n;});
      // Log anulowania → telefon zgasi baner „w pierwszej kolejności"
      supabase.from("hk_logs").insert({
        date:hkDate,
        log_time:new Date().toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"}),
        worker:worker||"HK",action:"priority_off",room:roomNo,
        extra:`Recepcja: anulowano priorytet pokoju ${roomNo}`,
      }).then(()=>{},()=>{});
      showToast(`Pokój ${roomNo} — anulowano priorytet`,"info");
      return;
    }
    setPriorityRooms(prev=>{const n={...prev,[roomNo]:{at:Date.now()}};saveJson(priorityKey(hkDate),n);return n;});
    // Pilny push na telefon HK: produkcyjnie przez Supabase Edge Function (telefony z GitHub Pages),
    // dodatkowo lokalny hkserver dla urządzeń w LAN. Unikalny tag, by nie nadpisał pytania o status.
    supabase.functions.invoke("push-send",{body:{role:"hk",worker,tag:`priority-${roomNo}`,title:`⚡ Pilne — pokój ${roomNo}`,body:`Recepcja prosi o pokój ${roomNo} w pierwszej kolejności`,url:"./index.html"}}).then(()=>{},()=>{});
    fetch("http://localhost:3737/push/priority",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({room:roomNo,workers:worker?[worker]:[]}),
    }).catch(()=>{});
    supabase.from("hk_logs").insert({
      date:hkDate,
      log_time:new Date().toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"}),
      worker:worker||"HK",action:"priority",room:roomNo,
      extra:`Recepcja: pokój ${roomNo} w pierwszej kolejności`,
    }).then(()=>{},()=>{});
    showToast(`Pokój ${roomNo} — wysłano pilne do HK${worker?` (${worker.split(" ")[0]})`:""}`,"success");
  },[hkDate,hkData,priorityRooms,showToast]);

  // Recepcja pyta przypisaną osobę o status pokoju. Pracownik dostaje powiadomienie
  // i odpowiada z telefonu (np. „myję podłogę") — odpowiedź wraca jako log info_reply
  // i pojawia się w historii Monitora HK.
  const askStatus=React.useCallback((roomNo)=>{
    const worker=hkData[roomNo]?.person||null;
    supabase.functions.invoke("push-send",{body:{role:"hk",worker,tag:`info-${roomNo}`,title:`💬 Pytanie o pokój ${roomNo}`,body:`Recepcja pyta o status pokoju ${roomNo} — otwórz i odpowiedz`,url:"./index.html"}}).then(()=>{},()=>{});
    fetch("http://localhost:3737/push/info",{
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({room:roomNo,workers:worker?[worker]:[]}),
    }).catch(()=>{});
    supabase.from("hk_logs").insert({
      date:hkDate,
      log_time:new Date().toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"}),
      worker:worker||"HK",action:"info_request",room:roomNo,
      extra:`Recepcja pyta o status pokoju ${roomNo}`,
    }).then(()=>{},()=>{});
    showToast(`Pokój ${roomNo} — wysłano pytanie o status${worker?` (${worker.split(" ")[0]})`:""}`,"info");
  },[hkDate,hkData,showToast]);

  // Zamknij menu „!" po kliknięciu poza nim
  React.useEffect(()=>{
    if(!priorityMenu)return;
    const close=()=>setPriorityMenu(null);
    document.addEventListener("click",close);
    return()=>document.removeEventListener("click",close);
  },[priorityMenu]);

  React.useEffect(()=>{ setPriorityRooms(loadJson(priorityKey(hkDate),{})); },[hkDate]);

  React.useEffect(()=>{
    if(didLoadInitialPlan.current)return;
    didLoadInitialPlan.current=true;
    const plan=loadHkPlan(hkDate);
    if(plan.exists)applyPlan(plan);
  },[hkDate,applyPlan]);

  React.useEffect(()=>{
    if(skipFirstPlanSave.current){
      skipFirstPlanSave.current=false;
      return;
    }
    saveCurrentPlan();
  },[saveCurrentPlan]);

  React.useEffect(()=>{
    const api=window.electronAPI;
    if(!api?.hkAutomationGetPlan)return;
    let stopped=false;
    setAutoSource(null);
    const sync=async(force=false)=>{
      if(autoImportInFlight.current)return;
      autoImportInFlight.current=true;
      try{
        const res=await api.hkAutomationGetPlan(hkDate);
        if(api.hkAutomationGetSource){
          const sourceRes=await api.hkAutomationGetSource(hkDate);
          if(!stopped&&sourceRes?.ok)setAutoSource(sourceRes.source||null);
        }
        if(stopped)return;
        if(!res?.ok){
          const errKey=`${hkDate}:${res?.error||"?"}`;
          if(lastAutoError.current!==errKey){
            lastAutoError.current=errKey;
            if(!stopped)showToast(`Auto HK: ${res?.error||"błąd pobierania planu"}`,"error");
          }
          return;
        }
        lastAutoError.current=null;
        if(!res.plan?.data||res.plan.meta?.dryRun)return;
        const generatedAt=res.plan.meta?.generatedAt||res.plan.savedAt||"";
        const appliedKey=`reception-hk-auto-last-${hkDate}`;
        // force = ręczne "Pobierz teraz": omiń blokadę, która normalnie zapobiega
        // wielokrotnemu zastosowaniu tego samego planu (np. po przypadkowym resecie).
        if(!force&&(!generatedAt||localStorage.getItem(appliedKey)===generatedAt))return;
        const entries=Object.entries(res.plan.data).filter(([,rd])=>rd?.status);
        if(!entries.length){
          if(generatedAt)localStorage.setItem(appliedKey,generatedAt);
          if(force)showToast("Pobierz teraz: brak pokoi w aktualnym mailu KWHotel.","info");
          return;
        }
        const planRooms=new Set(entries.map(([no])=>no));
        let changedCount=0;
        setHkData(prev=>{
          const next={...prev};
          entries.forEach(([no,autoRoom])=>{
            const current=next[no]||{};
            if(current.manualOverride)return;
            if(current.status===autoRoom.status&&current.autoUpdatedAt===generatedAt)return;
            changedCount+=1;
            next[no]={
              ...current,
              roomType:current.roomType||autoRoom.roomType||"",
              status:autoRoom.status,
              autoSource:"kwhotel-mail",
              autoUpdatedAt:generatedAt,
            };
          });
          // Rekoncyliacja: pokoje wcześniej ustawione AUTOMATYCZNIE, których NIE MA
          // już w świeżym planie (gość zmienił rezerwację) -> wyczyść status, by nie
          // zawyżały licznika. Ręczne nadpisania (manualOverride) zostają nietknięte.
          Object.keys(next).forEach(no=>{
            const cur=next[no];
            if(cur&&cur.status&&cur.autoSource==="kwhotel-mail"&&!cur.manualOverride&&!planRooms.has(no)){
              // Czyść też person — przydział do pokoju, który wypadł z planu, jest
              // bezprzedmiotowy i bez tego pokój zostawał z osobą bez statusu (sierota).
              next[no]={...cur,status:undefined,person:undefined,autoSource:undefined,autoUpdatedAt:undefined};
              changedCount+=1;
            }
          });
          return changedCount?next:prev;
        });
        if(generatedAt)localStorage.setItem(appliedKey,generatedAt);
        if(changedCount>0){
          showToast(`Auto HK: zaktualizowano ${changedCount} pokoi z raportu KWHotel.`,"success",7000);
          autoAssignPending.current=true; // nowa lista → rozpisz automatycznie
        }
        else if(force)showToast("Pobierz teraz: dane HK już zgodne z mailem.","info");
      }catch{}
      finally{autoImportInFlight.current=false;}
    };
    forceSyncRef.current=()=>sync(true);
    sync();
    const id=setInterval(()=>sync(false),60000);
    return()=>{stopped=true;clearInterval(id);forceSyncRef.current=null;};
  },[hkDate,setHkData,showToast]);

  const autoSourceCheck=React.useMemo(()=>{
    const rows=Array.isArray(autoSource?.rows)?autoSource.rows.filter(r=>r.status):[];
    if(!rows.length)return null;
    const mismatches=rows.filter(r=>(hkData[r.room]?.status||"")!==r.status);
    return {total:rows.length,ok:rows.length-mismatches.length,mismatches:mismatches.slice(0,5)};
  },[autoSource,hkData]);

  const changeHkDate=React.useCallback((nextDate)=>{
    if(!nextDate||nextDate===hkDate)return;
    saveCurrentPlan(hkDate);
    const nextPlan=loadHkPlan(nextDate);
    setHkDate(nextDate);
    applyPlan(nextPlan);
    if(nextPlan.exists){
      showToast(`Data zmieniona — załadowano dane z ${nextDate}.`,"info");
    }else if(isOlderThanRetention(nextDate)){
      showToast(`Data ${nextDate} jest starsza niż miesiąc — otwarto puste HK.`,"info");
    }else{
      showToast(`Data zmieniona (${nextDate}) — puste HK na ten dzień.`,"info");
    }
  },[hkDate,setHkDate,applyPlan,saveCurrentPlan,showToast]);

  const resetHK=()=>{
    setHkData({});
    setHkStaff([]);setDutyPerson("");setAfternoonPerson("");
    setBrMode(false);setZsMode(false);setEditMode(false);
    saveHkPlan(hkDate,{hkData:{},hkStaff:[],dutyPerson:"",afternoonPerson:"",brMode:false,zsMode:false});
    showToast("Dane HK zresetowane dla wybranej daty.","info");
  };

  const setRoom=React.useCallback((no,field,val)=>{
    setHkData(prev=>({...prev,[no]:{...(prev[no]||{}),[field]:val}}));
  },[setHkData]);

  const wRegular=React.useMemo(()=>HK_ALL.filter(r=>!r.apt&&(hkData[r.no]?.status==="W"||hkData[r.no]?.status==="WP")).length,[hkData]);
  const wApt=React.useMemo(()=>HK_ALL.filter(r=>r.apt&&(hkData[r.no]?.status==="W"||hkData[r.no]?.status==="WP")).length,[hkData]);
  const totalW=wRegular+wApt;
  const totalP=React.useMemo(()=>HK_ALL.filter(r=>hkData[r.no]?.status==="P").length,[hkData]);
  const totalPG=React.useMemo(()=>HK_ALL.filter(r=>hkData[r.no]?.status==="PG").length,[hkData]);
  const totalPGZ=React.useMemo(()=>HK_ALL.filter(r=>hkData[r.no]?.status==="PGZ").length,[hkData]);
  const totalBR=React.useMemo(()=>HK_ALL.filter(r=>hkData[r.no]?.br).length,[hkData]);
  const totalZS=React.useMemo(()=>HK_ALL.filter(r=>hkData[r.no]?.zs).length,[hkData]);
  const totalStay=totalPG+totalPGZ;
  const totalReady=React.useMemo(()=>Object.values(liveStatus).filter(s=>s==="czyste").length,[liveStatus]);
  const totalCleaning=React.useMemo(()=>Object.values(liveStatus).filter(s=>s==="czyszczenie").length,[liveStatus]);
  const totalAll=totalW+totalP+totalPG+totalPGZ+totalBR+totalZS;
  const totalAssigned=React.useMemo(()=>HK_ALL.filter(r=>hkData[r.no]?.person).length,[hkData]);

  const capitalize=(s)=>s?s.charAt(0).toUpperCase()+s.slice(1):"";
  const addStaff=(name)=>{if(!name.trim())return;setHkStaff(prev=>[...prev,{name:capitalize(name.trim())}]);};

  // ── Auto-przypisanie ────────────────────────────────────────────────────────
  const autoAssign=({silent=false}={})=>{
    if(!hkStaff.length){if(!silent)showToast("Dodaj najpierw pracowników HK.","error");return false;}
    setHkData(prev=>{
      const next={...prev};
      Object.keys(next).forEach(k=>{if(next[k]?.person)next[k]={...next[k],person:""};});
      return next;
    });
    const wRooms=HK_ALL.filter(r=>hkData[r.no]?.status==="W"||hkData[r.no]?.status==="WP");
    const pgRooms=HK_ALL.filter(r=>hkData[r.no]?.status==="PG"||hkData[r.no]?.status==="PGZ");
    if(!wRooms.length&&!pgRooms.length&&!HK_ALL.filter(r=>hkData[r.no]?.br||hkData[r.no]?.zs).length){
      if(!silent)showToast("Brak pokoi do przypisania (Wyjazd/Pobyt/BR/ZS).","error");return false;
    }
    const morningStaff=hkStaff.filter(s=>s.name!==afternoonPerson);
    if(!morningStaff.length){if(!silent)showToast("Wszyscy pracownicy są przypisani do popołudnia — dodaj kogoś do porannej.","error");return false;}
    const assigned={};
    if(afternoonPerson){
      const PG_LIMIT=20;
      const pgAfternoon=[];const pgOverflow=[];let pgWeight=0;
      for(const r of pgRooms){
        const w=HK_APTS.includes(r.no)?3:1;
        if(pgWeight+w<=PG_LIMIT){pgAfternoon.push(r);pgWeight+=w;}
        else pgOverflow.push(r);
      }
      pgAfternoon.forEach(r=>{assigned[r.no]=afternoonPerson;});
      if(pgOverflow.length&&morningStaff.length){
        pgOverflow.forEach((r,i)=>{assigned[r.no]=morningStaff[i%morningStaff.length].name;});
      }
      HK_ALL.filter(r=>hkData[r.no]?.br&&!assigned[r.no]).forEach(r=>{assigned[r.no]=afternoonPerson;});
      HK_ALL.filter(r=>hkData[r.no]?.zs&&!assigned[r.no]).forEach(r=>{assigned[r.no]=afternoonPerson;});
    }
    if(morningStaff.length&&wRooms.length){
      const n=morningStaff.length;
      const dutyIdx=morningStaff.findIndex(s=>s.name===dutyPerson);
      const DUTY_OFFSET=2.5; // dyżurna dostaje ~2-3 pokoje MNIEJ niż reszta (obsługuje też front desk + telefon)
      const aptRooms=wRooms.filter(r=>HK_APTS.includes(r.no));
      const regRooms=wRooms.filter(r=>!HK_APTS.includes(r.no));
      // Weight-based targets: apt = 3, reg = 1 — prevents over-assigning reg rooms to apt holders
      const totalWeight=wRooms.reduce((s,r)=>s+(HK_APTS.includes(r.no)?3:1),0);
      // Dyżur dostaje STAŁĄ zniżkę ~2-3 pokoi względem reszty (a nie procentową —
      // procent (0.85) ginął przy zaokrąglaniu i dyżurna wychodziła cięższa niż poranne).
      // Z równania d·n = T − OFFSET·(n−1): dyżur = (T−OFFSET·(n−1))/n, reszta = (T+OFFSET)/n,
      // dzięki czemu różnica dyżur↔reszta wynosi dokładnie ~OFFSET pokoi.
      const weightTargets=morningStaff.map((_,i)=>
        dutyIdx<0 ? totalWeight/n
        : i===dutyIdx ? Math.max(0,(totalWeight-DUTY_OFFSET*(n-1))/n)
        : (totalWeight+DUTY_OFFSET)/n);
      const aptWeights=new Array(n).fill(0);
      const nonDuty=morningStaff.map((_,i)=>i).filter(i=>i!==dutyIdx);
      const dutyArr=dutyIdx>=0?[dutyIdx]:[];
      const aptQueue=[...nonDuty,...nonDuty,...dutyArr,...nonDuty,...dutyArr];
      aptRooms.forEach((r,ri)=>{
        const pi=aptQueue[ri%aptQueue.length]??0;
        assigned[r.no]=morningStaff[pi].name;
        aptWeights[pi]+=3;
      });
      const regTargets=morningStaff.map((_,i)=>Math.max(0,weightTargets[i]-aptWeights[i]));
      const regSum=regTargets.reduce((s,v)=>s+v,0);
      const regAvail=regRooms.length;
      const scale=regSum>0?regAvail/regSum:1;
      const adjTargets=regTargets.map(v=>Math.round(v*scale));
      let diff=regAvail-adjTargets.reduce((s,v)=>s+v,0);
      // Non-duty people first when distributing leftover rooms or absorbing surplus
      const diffOrder=[...nonDuty,dutyIdx>=0?dutyIdx:-1].filter(i=>i>=0);
      for(let j=0;diff>0&&j<diffOrder.length;j++){adjTargets[diffOrder[j]]++;diff--;}
      while(diff<0){
        const maxVal=Math.max(...diffOrder.map(i=>adjTargets[i]));
        const idx=diffOrder.find(i=>adjTargets[i]===maxVal&&adjTargets[i]>0);
        if(idx===undefined)break;
        adjTargets[idx]--;diff++;
      }
      let pIdx=0,filled=0;
      regRooms.forEach(r=>{
        while(pIdx<n-1&&filled>=adjTargets[pIdx]){pIdx++;filled=0;}
        assigned[r.no]=morningStaff[pIdx].name;
        filled++;
      });
      const TRPL_ROOMS=["105","107","117","119"];
      const trplAssigned=TRPL_ROOMS.filter(no=>assigned[no]);
      if(trplAssigned.length){
        const counts={};
        morningStaff.forEach(s=>counts[s.name]=0);
        trplAssigned.forEach(no=>{const p=assigned[no];if(counts[p]!==undefined)counts[p]++;});
        for(const no of trplAssigned){
          const owner=assigned[no];
          if(counts[owner]<=1)continue;
          const candidates=morningStaff.filter(s=>counts[s.name]===0);
          if(!candidates.length)break;
          const nonDutyCand=candidates.filter(s=>s.name!==dutyPerson);
          const target=(nonDutyCand[0]||candidates[0]).name;
          const targetRegRoom=regRooms.find(r=>assigned[r.no]===target&&!TRPL_ROOMS.includes(r.no));
          if(targetRegRoom){assigned[targetRegRoom.no]=owner;}
          assigned[no]=target;
          counts[owner]--;counts[target]++;
        }
      }
    }
    setHkData(prev=>{
      const next={...prev};
      Object.entries(assigned).forEach(([no,person])=>{next[no]={...(next[no]||{}),person};});
      return next;
    });
    const brzsCount=HK_ALL.filter(r=>hkData[r.no]?.br||hkData[r.no]?.zs).length;
    const wCount=wRooms.length,pgCount=pgRooms.length;
    if(!silent)showToast(`Przypisano: ${wCount} wyjazdowych + ${pgCount} pobytowych${brzsCount?` + ${brzsCount} BR/ZS`:""}.`,"success");
    return true;
  };

  // Po pobraniu NOWEGO planu z maila rozpisz pokoje automatycznie — jak dawny guzik
  // „Auto‑przypisz", lecz bez klikania. Ręczna edycja pokoju w recepcji nie wywołuje
  // pobrania, więc nie uruchamia rozpisania — zmiany recepcji pozostają nietknięte.
  // Deps obejmują obsadę, by dograć rozpisanie, gdy roster z telefonu dojdzie po planie.
  React.useEffect(()=>{
    if(!autoAssignPending.current)return;
    if(autoAssign({silent:true}))autoAssignPending.current=false;
  },[hkData,hkStaff,dutyPerson,afternoonPerson]); // eslint-disable-line react-hooks/exhaustive-deps

  const genAll=()=>{
    if(!hkStaff.length){showToast("Dodaj najpierw pracowników HK.","error");return;}
    const enriched=hkStaff.map(s=>({...s,_isDuty:s.name===dutyPerson,_isAfternoon:s.name===afternoonPerson,_afternoon:afternoonPerson}));
    const assignedCount=Object.values(hkData).filter(v=>v.person&&v.status).length;
    if(!assignedCount){showToast("Brak przypisanych pokoi — użyj Auto-przypisz.","error");return;}
    try{downloadHKMain(hkDate,enriched,hkData,afternoonPerson);}catch(e){showToast("Błąd raportu głównego: "+e.message,"error");}
    setTimeout(()=>{try{downloadHKRoomList(hkDate,hkData);}catch(e){showToast("Błąd raportu pokoi: "+e.message,"error");}},700);
    setTimeout(()=>{try{downloadHKStatus(hkDate,enriched,hkData,hkNotes);}catch(e){showToast("Błąd raportów indywidualnych: "+e.message,"error");}},1400);
    setTimeout(()=>{try{downloadHKCleaningList(hkDate,enriched,dutyPerson,afternoonPerson||"");}catch(e){showToast("Błąd listy sprzątania: "+e.message,"error");}},2100);
    showToast(`Generuję raporty HK (${assignedCount} pokoi)...`,"success",7000);
  };

  const inp=dark?"input dark-input":"input";

  // ── RoomRow ────────────────────────────────────────────────────────────────
  const LegacyRoomRow=React.memo(({room,rdStatus,rdPerson,rdType,rdBR,rdZS,rdAptNote,brMode,zsMode,editMode})=>{
    const isApt=!!room.apt;
    const isSglTwinOnly=HK_ROOMS_SGL_TWIN_ONLY.includes(room.no);
    const [localType,setLocalType]=React.useState(rdType||room.type);
    const [localStatus,setLocalStatus]=React.useState(rdStatus||"");
    const [localBR,setLocalBR]=React.useState(rdBR||false);
    const [localZS,setLocalZS]=React.useState(rdZS||false);
    const [localAptNote,setLocalAptNote]=React.useState(rdAptNote||"");

    const prevStatus=React.useRef(rdStatus);
    React.useEffect(()=>{if(rdStatus!==prevStatus.current){setLocalStatus(rdStatus||"");prevStatus.current=rdStatus;}},[rdStatus]);
    const prevBR=React.useRef(rdBR);
    React.useEffect(()=>{if(rdBR!==prevBR.current){setLocalBR(rdBR||false);prevBR.current=rdBR;}},[rdBR]);
    const prevZS=React.useRef(rdZS);
    React.useEffect(()=>{if(rdZS!==prevZS.current){setLocalZS(rdZS||false);prevZS.current=rdZS;}},[rdZS]);
    const prevType=React.useRef(rdType);
    React.useEffect(()=>{if(rdType!==prevType.current){setLocalType(rdType||room.type);prevType.current=rdType;}},[rdType,room.type]);
    const prevAptNote=React.useRef(rdAptNote);
    React.useEffect(()=>{if(rdAptNote!==prevAptNote.current){setLocalAptNote(rdAptNote||"");prevAptNote.current=rdAptNote;}},[rdAptNote]);

    const handleTypeChange=React.useCallback((e)=>{const val=e.target.value;setLocalType(val);setRoom(room.no,"roomType",val);},[room.no]);
    const handleBR=React.useCallback(()=>{const next=!localBR;setLocalBR(next);setRoom(room.no,"br",next);},[room.no,localBR]);
    const handleZS=React.useCallback(()=>{const next=!localZS;setLocalZS(next);setRoom(room.no,"zs",next);},[room.no,localZS]);
    // onChange aktualizuje tylko stan lokalny — brak re-renderu rodzica podczas pisania
    const handleAptNoteChange=React.useCallback((e)=>{setLocalAptNote(e.target.value);},[]);
    // Sync do rodzica (i persystencja) dopiero przy blur
    const handleAptNoteBlur=React.useCallback((e)=>{setRoom(room.no,"apartmentNote",e.target.value);},[room.no]);

    const typeOptions=isApt
      ?["DBL","2xDBL","TWIN","2xTWIN","D+T","D+T+SOFA","D+T+SOFA 1","D+T+SOFA 2","5xSGL","2xTWIN+SOFA 1","SGL"]
      :isSglTwinOnly?["SGL","TWIN"]
      :HK_SPECIAL_ROOMS.includes(room.no)?["DBL","SGL","TWIN","TRPL","D+S"]
      :["DBL","SGL","TWIN","TRPL"];

    // Kolor chipa pracownika
    const personIdx=hkStaff.findIndex(s=>s.name===rdPerson);
    const chipColor=personIdx>=0?CHIP_COLORS[personIdx%CHIP_COLORS.length]:"#94a3b8";

    // Inline style helpers
    const textColor=dark?"var(--dark-text)":"var(--text-primary)";
    const mutedColor=dark?"var(--dark-text-muted)":"var(--text-muted)";
    const selectBg=dark?"rgba(255,255,255,.07)":"#f8fafc";
    const selectBorder=dark?"var(--dark-border)":"#e2e8f0";

    // Przyciski statusu — segmented control
    const statusActions=[
      {key:"BR",label:"BR",handler:handleBR,active:localBR},
      {key:"ZS",label:"ZS",handler:handleZS,active:localZS},
    ];

    const lsc=dark?HK_STATUS_COLORS:HK_STATUS_COLORS_LIGHT;
    const statusBadge=localStatus?(()=>{
      const c=lsc[localStatus]||lsc.W;
      return (
        <span className="hkd-auto-status"
          style={{background:c.bg,color:c.color,boxShadow:`0 0 0 1px ${c.border}`}}>
          {HK_STATUS_LABELS[localStatus]||localStatus}
        </span>
      );
    })():null;

    const statusGroup=statusActions.length?(
      <div className="hkd-status-group" style={dark?{background:"rgba(255,255,255,.04)",borderColor:"var(--dark-border)"}:undefined}>
        {statusActions.map(({key,label,handler,active})=>{
          const c=lsc[key]||lsc.W;
          return(
            <button key={key} className="hkd-status-btn"
              style={active?{background:c.bg,color:c.color,boxShadow:`0 0 0 1px ${c.border}`}:undefined}
              onMouseDown={e=>{e.preventDefault();e.stopPropagation();handler();}}>
              {label}
            </button>
          );
        })}
      </div>
    ):null;

    // Assign control: pill → modal lub select w editMode
    const assignControl=editMode?(
      <select className="hkd-assign-select" value={rdPerson||""} onChange={e=>setRoom(room.no,"person",e.target.value)}
        style={{height:22,padding:"0 18px 0 7px",borderRadius:6,fontSize:11,fontWeight:500,
                border:`1px solid ${dark?"#c8a050":"#c8a050"}`,background:dark?"rgba(255,255,255,.08)":"#fff",
                color:textColor,cursor:"pointer",fontFamily:"inherit",
                appearance:"none",WebkitAppearance:"none"}}>
        <option value="">— brak —</option>
        {hkStaff.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
      </select>
    ):(
      <button className={`hkd-assign-pill${rdPerson?" assigned":""}`}
        style={rdPerson?{borderColor:chipColor}:undefined}
        onMouseDown={e=>{e.preventDefault();e.stopPropagation();setAssignModal(room.no);}}>
        {rdPerson?(
          <>
            <span style={{width:6,height:6,borderRadius:"50%",background:chipColor,flexShrink:0,display:"inline-block"}}/>
            <span className="hkd-assign-name">{rdPerson.split(" ")[0]}</span>
          </>
        ):(
          <span style={{color:mutedColor,fontWeight:400}}>—</span>
        )}
      </button>
    );

    const numStyle={fontWeight:700,fontSize:12.5,color:textColor,fontVariantNumeric:"tabular-nums",flexShrink:0};
    const rowActions=(
      <div className="hkd-room-actions">
        {assignControl}
        {statusBadge}
        {statusGroup}
      </div>
    );
    const aptBadge={
      fontSize:9,fontWeight:700,letterSpacing:"0.04em",marginLeft:3,
      background:dark?"rgba(90,29,74,.35)":"#f0e4ec",
      color:dark?"#f0e4ec":"#5a1d4a",
      border:"1px solid",borderColor:dark?"rgba(90,29,74,.55)":"#e4ccd9",
      borderRadius:3,padding:"1px 3px",verticalAlign:"middle",
    };

    if(isApt){
      return(
        <div className="hkd-room">
          <div style={{display:"grid",gridTemplateColumns:"40px minmax(0,1fr) minmax(0,auto)",alignItems:"center",gap:5}}>
            <span style={numStyle}>{room.no}</span>
            <input type="text" value={localAptNote}
              onChange={handleAptNoteChange}
              onBlur={e=>{handleAptNoteBlur(e);e.currentTarget.style.borderColor=dark?"var(--dark-border)":"#dde3f0";}}
              placeholder="D+T, D+D, SOFA…"
              style={{height:22,padding:"0 7px",borderRadius:6,fontSize:11,
                      border:`1px solid ${dark?"var(--dark-border)":"#dde3f0"}`,
                      background:dark?"rgba(255,255,255,.05)":"#fafbff",
                      color:textColor,fontFamily:"inherit",outline:"none",minWidth:0}}
              onFocus={e=>e.currentTarget.style.borderColor="#5a1d4a"}
            />
            {rowActions}
          </div>
        </div>
      );
    }

    return(
      <div className="hkd-room">
        <div style={{display:"grid",gridTemplateColumns:"40px 66px minmax(0,1fr)",alignItems:"center",gap:5}}>
          <span style={numStyle}>{room.no}</span>
          <select value={localType} onChange={handleTypeChange}
            style={{height:22,padding:"0 3px 0 5px",borderRadius:6,fontSize:10.5,
                    border:`1px solid ${selectBorder}`,background:selectBg,
                    color:dark?"var(--dark-text-muted)":mutedColor,fontFamily:"inherit",cursor:"pointer",
                    appearance:"none",WebkitAppearance:"none"}}>
            {typeOptions.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
          {rowActions}
        </div>
      </div>
    );
  },(prev,next)=>
    prev.rdStatus===next.rdStatus&&
    prev.rdPerson===next.rdPerson&&
    prev.rdType===next.rdType&&
    prev.rdBR===next.rdBR&&
    prev.rdZS===next.rdZS&&
    prev.rdAptNote===next.rdAptNote&&
    prev.brMode===next.brMode&&
    prev.zsMode===next.zsMode&&
    prev.editMode===next.editMode
  );

  // ── renderFloorCol — wywoływana jako funkcja, nie JSX ────────────────────
  const renderFloorCol=(rooms,title)=>{
    const done=rooms.filter(r=>hkData[r.no]?.status).length;
    const pct=rooms.length>0?(done/rooms.length)*100:0;
    const floorNum=title.split(" ").pop(); // "1", "2", "3"
    return(
      <section key={title} className="cc-hk-floor-card" aria-labelledby={`cc-hk-floor-${floorNum}-title`}>
        {/* Floor header */}
        <header className="cc-hk-floor-head">
          <div className="cc-hk-floor-title" id={`cc-hk-floor-${floorNum}-title`}>
            <span className="cc-hk-floor-tag" aria-hidden="true">P{floorNum}</span>
            <span className="cc-hk-floor-name">{title}</span>
          </div>
          <div className="cc-hk-floor-progress">
            <span className="cc-hk-floor-progress-count">
              {done}/{rooms.length}
            </span>
            <div className="hkd-progress-bar" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin="0" aria-valuemax="100">
              <div className="hkd-progress-fill" style={{width:`${pct}%`}}/>
            </div>
          </div>
        </header>
        {/* Rooms */}
        <div className="hkd-floor-rooms">
          {rooms.map(r=>{
            const rd=hkData[r.no]||{};
            return(
              <RoomRow key={r.no} room={r}
                rdStatus={rd.status||""} rdPerson={rd.person||""}
                rdType={rd.roomType||""} rdBR={rd.br||false}
                rdZS={rd.zs||false} rdAptNote={rd.apartmentNote||""}
                brMode={brMode} zsMode={zsMode} editMode={editMode}
                dark={dark} hkStaff={hkStaff}
                setRoom={setRoom} setAssignModal={setAssignModal}/>
            );
          })}
        </div>
      </section>
    );
  };

  // Cykl wyjazdu + postęp HK z telefonów (liveStatus):
  //  togo (szary)    → W/WP, gość jeszcze nie wymeldowany ("do wyjazdu")
  //  vacated (żółty) → gość wyjechał, pokój czeka na sprzątanie
  //  cleaning (nieb.)→ HK sprząta (czyszczenie) / przyjazd w przygotowaniu
  //  ready (zielony) → posprzątane (czyste) → "gotowy"
  //  stay (teal)     → pobyt gościa PG/PGZ
  //  dirty (czerw.) BR · donotdisturb (fiolet) ZS
  const statusClass=(rd,live,vacated)=>{
    if(rd?.zs)return "donotdisturb";
    if(rd?.br)return "dirty";
    if(live==="czyste")return "ready";
    if(live==="czyszczenie")return "cleaning";
    const isCheckout=rd?.status==="W"||rd?.status==="WP";
    if(isCheckout)return vacated?"vacated":"togo";
    if(rd?.status==="P")return "cleaning";
    if(rd?.status==="PG"||rd?.status==="PGZ")return "stay";
    // Sama przypisana osoba (person) NIE oznacza, że pokój jest sprzątany —
    // faktyczne sprzątanie wynika ze statusu P lub live="czyszczenie" (obsłużone wyżej).
    // Pokój tylko z przydziałem zostaje "vacant"; osoba i tak jest widoczna jako chip.
    return "vacant";
  };
  const toggleRoomFlag=React.useCallback((roomNo,flag)=>{
    if(!roomNo)return;
    setRoom(roomNo,flag,!hkData?.[roomNo]?.[flag]);
  },[hkData,setRoom]);
  const handleRoomCardClick=React.useCallback((roomNo,e)=>{
    if(!roomNo)return;
    const target=e?.target instanceof Element?e.target:null;
    if(target?.closest("button,select,input,textarea"))return;
    if(brMode){toggleRoomFlag(roomNo,"br");return;}
    if(zsMode){
      // Zmiana statusu: cyklowanie po wszystkich statusach pokoju
      const order=["","W","WP","P","PG","PGZ"];
      const cur=hkData?.[roomNo]?.status||"";
      const next=order[(order.indexOf(cur)+1)%order.length];
      setRoom(roomNo,"status",next);
      return;
    }
    if(editMode)setAssignModal(roomNo);
  },[brMode,zsMode,editMode,hkData,toggleRoomFlag,setRoom]);
  const renderRoomCard=React.useCallback((room)=>{
    const rd=hkData?.[room.no]||{};
    const isCheckout=(rd.status==="W"||rd.status==="WP");
    const isVacated=isCheckout&&!!vacatedRooms[room.no]?.vacated;
    const isPriority=isCheckout&&!!priorityRooms[room.no];
    const cls=statusClass(rd,liveStatus?.[room.no],isVacated);
    const wIdx=rd.person?hkStaff.findIndex(s=>s.name===rd.person):-1;
    const wColor=wIdx>=0?CHIP_COLORS[wIdx%CHIP_COLORS.length]:"#94a3b8";
    const menuOpen=isCheckout&&priorityMenu===room.no;
    return(
      <div key={room.no} className={`room-card ${cls}`} onClick={(e)=>handleRoomCardClick(room.no,e)} style={{position:"relative",...(menuOpen?{overflow:"visible",zIndex:30}:null)}}>
        {isCheckout?(
          <>
            <button
              type="button"
              className={`cc-hk-priority-btn${isPriority?" cc-hk-priority-btn--on":""}`}
              title="Pilne / Zapytaj o status"
              onClick={e=>{
                e.stopPropagation();
                if(!menuOpen){
                  const r=e.currentTarget.getBoundingClientRect();
                  // Domyślnie rozwijamy w prawo (side "left" = left:2px). Tylko gdy zabrakłoby
                  // miejsca do prawej krawędzi okna (menu min-width ~196px), otwieramy w lewo.
                  setPriorityMenuSide(r.left+210<=window.innerWidth?"left":"right");
                }
                setPriorityMenu(menuOpen?null:room.no);
              }}
              aria-label="Pilne lub pytanie o status"
              aria-haspopup="menu"
            >!</button>
            {menuOpen&&(
              <div className={`cc-hk-priority-menu cc-hk-priority-menu--${priorityMenuSide}`} role="menu" onClick={e=>e.stopPropagation()}>
                <button type="button" className="cc-hk-priority-menu-item" role="menuitem"
                  onClick={()=>{requestPriority(room.no);setPriorityMenu(null);}}>
                  {isPriority?"⚡ Anuluj priorytet":"⚡ Pilne — w pierwszej kolejności"}
                </button>
                <button type="button" className="cc-hk-priority-menu-item" role="menuitem"
                  onClick={()=>{askStatus(room.no);setPriorityMenu(null);}}>
                  💬 Zapytaj o status
                </button>
              </div>
            )}
          </>
        ):(
          <div className={`room-status-dot ${cls}`}/>
        )}
        <div className="room-num">{room.no}</div>
        {rd.person&&<div className="cc-hk-room-worker" style={{color:wColor,borderColor:wColor}} title={rd.person}>{rd.person.split(" ")[0]}</div>}
        <div className="room-card-actions">
          {room.apt?(
            <input type="text" value={rd.apartmentNote||""} placeholder="D+T, D+D, SOFA…"
              onChange={e=>setRoom(room.no,"apartmentNote",e.target.value)}
              onClick={e=>e.stopPropagation()}
              className="cc-hk-apt-note"/>
          ):(
            <select value={rd.roomType||room.type||""} onChange={e=>setRoom(room.no,"roomType",e.target.value)} onClick={e=>e.stopPropagation()} style={{flex:1,minWidth:0}}>
              {["DBL","SGL","TWIN","TRPL","D+S"].map(t=><option key={t} value={t}>{t}</option>)}
            </select>
          )}
        </div>
      </div>
    );
  },[hkData,vacatedRooms,priorityRooms,priorityMenu,priorityMenuSide,liveStatus,handleRoomCardClick,setRoom,requestPriority,askStatus,hkStaff]);
  const renderFloorCards=React.useCallback((rooms,label,range)=>(
    <div className="floor-section" key={label}>
      <div className="floor-label">
        <span>{label}</span>
        <div className="floor-label-line"/>
        <span>{range}</span>
      </div>
      <div className="room-grid">{rooms.map(renderRoomCard)}</div>
    </div>
  ),[renderRoomCard]);

  const staffSelect=(value,onChange,label)=>{
    const labelStyle={fontSize:11,fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase",
                      color:dark?"var(--dark-text-muted)":"var(--text-muted)",display:"block",marginBottom:5};
    return(
      <div>
        <label style={labelStyle}>{label}</label>
        <select className={inp} value={value} onChange={e=>onChange(e.target.value)} style={{width:160}}>
          <option value="">— brak —</option>
          {hkStaff.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
        </select>
      </div>
    );
  };

  // Rola pracownika wyliczana z dutyPerson/afternoonPerson (zgodność wsteczna,
  // autoAssign bez zmian). Zmiana roli ustawia odpowiednie pola.
  const ROLE_LABEL={dyzur:"Dyżur",popoludnie:"Popołudnie",poranna:"Poranna"};
  const roleOf=(name)=>name===dutyPerson?"dyzur":name===afternoonPerson?"popoludnie":"poranna";
  const setRole=(name,role)=>{
    if(role==="dyzur"){setDutyPerson(name);if(afternoonPerson===name)setAfternoonPerson("");}
    else if(role==="popoludnie"){setAfternoonPerson(name);if(dutyPerson===name)setDutyPerson("");}
    else{if(dutyPerson===name)setDutyPerson("");if(afternoonPerson===name)setAfternoonPerson("");}
  };

  return(
    <div className="stack hk-design-view">
      {/* ── Tabs: Plan HK / HK Live ─── */}
      <div style={{display:"flex",gap:2,marginBottom:8,padding:"3px",background:dark?"rgba(255,255,255,.06)":"rgba(0,0,0,.06)",borderRadius:8,width:"fit-content"}}>
        <button onClick={()=>setHkTab("plan")} style={{padding:"6px 18px",borderRadius:7,fontSize:12.5,fontWeight:700,cursor:"pointer",border:"none",background:hkTab==="plan"?"var(--plum)":"transparent",color:hkTab==="plan"?"#0B0810":dark?"var(--dark-text-muted)":"var(--text-muted)",boxShadow:hkTab==="plan"?"var(--plum-bright-glow)":"none",transition:"all .15s",letterSpacing:".02em"}}>Plan HK</button>
        <button onClick={()=>setHkTab("live")} style={{padding:"6px 18px",borderRadius:7,fontSize:12.5,fontWeight:700,cursor:"pointer",border:"none",background:hkTab==="live"?"#34d399":"transparent",color:hkTab==="live"?"#0B0810":dark?"var(--dark-text-muted)":"var(--text-muted)",boxShadow:hkTab==="live"?"0 0 16px rgba(52,211,153,.4)":"none",transition:"all .15s",letterSpacing:".02em"}}>HK Live</button>
      </div>
      {hkTab==="live"&&<HKLivePanel dark={dark} hkData={hkData} setHkData={setHkData} hkDate={hkDate} showToast={showToast} askConfirm={askConfirm} isManager={!!isManager} employeeName={employeeName||""}/>}
      {hkTab==="plan"&&(<>

      {/* ── Assign modal ─────────────────────────────────────────────────── */}
      {assignModal&&(
        <div className="hkd-modal-backdrop" onClick={()=>setAssignModal(null)}>
          <div className="hkd-assign-modal" onClick={e=>e.stopPropagation()}>
            {/* Modal header */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
              <span style={{fontWeight:650,fontSize:14,color:"var(--text-primary)",
                            display:"flex",alignItems:"center",gap:8}}>
                <Users size={14} style={{color:"#5a1d4a",flexShrink:0}}/>
                Przypisz pokój {assignModal}
              </span>
              <button onClick={()=>setAssignModal(null)}
                style={{border:"none",background:"transparent",cursor:"pointer",
                        color:"var(--text-muted)",width:26,height:26,
                        borderRadius:6,display:"grid",placeItems:"center",fontSize:14}}>
                ✕
              </button>
            </div>
            {/* Status pokoju — ręczny override */}
            {(()=>{
              const rd=hkData[assignModal]||{};
              const sc=HK_STATUS_COLORS_LIGHT;
              const STATUS_OPTS=[["W","Wyjazd"],["WP","W/P"],["P","Przyjazd"],["PG","PG"],["PGZ","PGZ"]];
              return(
                <div style={{marginBottom:12,paddingBottom:10,borderBottom:"1px dashed var(--border-light)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                    <span style={{fontSize:11,fontWeight:600,color:"var(--text-muted)"}}>STATUS POKOJU</span>
                    {rd.manualOverride&&(
                      <span style={{fontSize:10,fontWeight:700,color:"var(--amber)",background:"rgba(232,148,58,.12)",borderRadius:4,padding:"1px 5px"}}>
                        ZABLOK.
                      </span>
                    )}
                  </div>
                  <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:4}}>
                    {STATUS_OPTS.map(([key,label])=>{
                      const isActive=rd.status===key;
                      const c=sc[key]||sc.W;
                      return(
                        <button key={key}
                          onMouseDown={e=>{e.preventDefault();e.stopPropagation();}}
                          onClick={()=>setHkData(prev=>({
                            ...prev,
                            [assignModal]:{...(prev[assignModal]||{}),status:key,manualOverride:true,autoSource:undefined,autoUpdatedAt:undefined},
                          }))}
                          style={{padding:"4px 10px",borderRadius:6,fontSize:11,fontWeight:600,cursor:"pointer",
                                  background:isActive?c.bg:"transparent",color:isActive?c.color:"var(--text-muted)",
                                  boxShadow:isActive?`0 0 0 1.5px ${c.border}`:"0 0 0 1px var(--border-light)",
                                  border:"none"}}>
                          {label}
                        </button>
                      );
                    })}
                    {rd.manualOverride&&(
                      <button
                        onMouseDown={e=>{e.preventDefault();e.stopPropagation();}}
                        onClick={()=>setHkData(prev=>({
                          ...prev,
                          [assignModal]:{...(prev[assignModal]||{}),status:undefined,manualOverride:false,autoSource:undefined,autoUpdatedAt:undefined},
                        }))}
                        style={{padding:"4px 8px",borderRadius:6,fontSize:10,fontWeight:500,cursor:"pointer",
                                background:"transparent",color:"var(--rose)",border:"none",
                                boxShadow:"0 0 0 1px rgba(255,84,113,.4)"}}>
                        Odblokuj
                      </button>
                    )}
                  </div>
                  {rd.manualOverride&&(
                    <div style={{fontSize:10,color:"var(--text-muted)"}}>Auto-import nie nadpisze tego pokoju.</div>
                  )}
                </div>
              );
            })()}
            {/* Staff list */}
            <div style={{display:"flex",flexDirection:"column",gap:2}}>
              {hkStaff.length===0&&(
                <div style={{padding:"18px",textAlign:"center",color:"var(--text-muted)",fontSize:13}}>
                  Najpierw dodaj pracowników HK.
                </div>
              )}
              {hkStaff.map((s,i)=>{
                const isCurrent=hkData[assignModal]?.person===s.name;
                const chipColor=CHIP_COLORS[i%CHIP_COLORS.length];
                return(
                  <button key={s.name}
                    className={`hkd-modal-item${isCurrent?" current":""}`}
                    onClick={()=>{setRoom(assignModal,"person",isCurrent?"":s.name);setAssignModal(null);}}>
                    <span style={{width:26,height:26,borderRadius:"50%",background:chipColor,
                                  color:"#fff",display:"grid",placeItems:"center",
                                  fontWeight:700,fontSize:11,flexShrink:0}}>
                      {s.name.charAt(0).toUpperCase()}
                    </span>
                    <span style={{fontWeight:600,flex:1}}>{s.name}</span>
                    {isCurrent&&<span style={{color:"#5a1d4a",fontWeight:800,fontSize:15}}>✓</span>}
                  </button>
                );
              })}
              {/* Bez przypisania */}
              <button className="hkd-modal-item"
                style={{borderTop:"1px dashed var(--border-light)",marginTop:4,paddingTop:10,color:"var(--text-muted)"}}
                onClick={()=>{setRoom(assignModal,"person","");setAssignModal(null);}}>
                <span style={{width:26,height:26,borderRadius:"50%",background:"#cbd5e1",
                              color:"#64748b",display:"grid",placeItems:"center",
                              fontWeight:700,fontSize:11,flexShrink:0}}>—</span>
                <span>Bez przypisania</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Górny panel ──────────────────────────────────────────────────── */}
      <div className={`panel${dark?" dark-panel":""}`}>
        {/* Grid: data | dyżurny | popołudnie | statystyki */}
        <div style={{display:"flex",gap:18,alignItems:"flex-end",flexWrap:"wrap"}}>
          {/* Data */}
          <div>
            <label style={{fontSize:11,fontWeight:600,letterSpacing:"0.04em",textTransform:"uppercase",
                           color:dark?"var(--dark-text-muted)":"var(--text-muted)",display:"block",marginBottom:5}}>
              Data planu HK
            </label>
            <div style={{display:"flex",gap:6,alignItems:"center"}}>
              <input className={inp} type="date" value={hkDate}
                onChange={e=>changeHkDate(e.target.value)} style={{width:155}}/>
              <button onClick={resetHK} title="Wyczyść wszystkie dane HK"
                style={{padding:"5px 9px",borderRadius:"var(--radius-md)",
                        border:"0.5px solid var(--rose)",background:"transparent",
                        color:"var(--rose)",cursor:"pointer",fontSize:11,fontWeight:600,
                        display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                <Trash2 size={12}/> Reset
              </button>
              <button
                title="Pobierz najnowsze dane: pokoje z maila KWHotel oraz aktualną obsadę (listę pracowników) wysłaną z telefonu — bez czekania na kolejny cykl."
                onClick={()=>{
                  const hasRooms=!!forceSyncRef.current, hasRoster=!!forceRosterSyncRef.current;
                  if(!hasRooms&&!hasRoster){showToast("Auto‑import niedostępny w tej wersji aplikacji.","error");return;}
                  showToast("Pobieram dane (pokoje + obsada) i rozpisuję…","info");
                  // Ręczne „Pobierz dane" ZAWSZE rozpisuje pokoje po dociągnięciu obsady,
                  // nawet gdy pokoje z maila się nie zmieniły (changedCount=0). Efekt
                  // auto‑przypisania (deps: hkStaff/hkData) odpali, gdy tylko imiona dojdą,
                  // a flaga jest zdejmowana dopiero po udanym przypisaniu.
                  autoAssignPending.current=true;
                  if(hasRoster)forceRosterSyncRef.current();
                  if(hasRooms)forceSyncRef.current();
                }}
                style={{padding:"5px 9px",borderRadius:"var(--radius-md)",
                        border:"0.5px solid var(--plum)",background:"transparent",
                        color:"var(--plum)",cursor:"pointer",fontSize:11,fontWeight:600,
                        display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                <RefreshCw size={12}/> Pobierz dane
              </button>
            </div>
          </div>
          {/* Role (dyżur/popołudnie) ustawia menadżer na telefonie — patrz sekcja „Pracownicy HK". */}

          {/* Statystyki */}
          <div style={{display:"flex",gap:10,alignItems:"flex-end",paddingBottom:2,flexWrap:"wrap",marginLeft:"auto"}}>
            {[
              ["Wyjazd",totalW,"#185FA5"],["Przyjazd",totalP,"#D97706"],
              ["Pobyt goscia",totalPG,"#3B6D11"],
              ["Pobyt goscia Z",totalPGZ,"#854F0B"],["BR",totalBR,"#B91C1C"],
              ["ZS",totalZS,"#7E22CE"],
            ].filter(([,n])=>n>0).map(([l,n,c])=>(
              <div key={l} style={{textAlign:"center",minWidth:44}}>
                <div style={{fontSize:17,fontWeight:700,color:c,lineHeight:1,fontVariantNumeric:"tabular-nums"}}>{n}</div>
                <div style={{fontSize:10,color:dark?"var(--dark-text-muted)":"var(--text-muted)"}}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Akcje */}
        <div style={{display:"flex",gap:8,marginTop:14,paddingTop:14,
                     borderTop:`1px dashed ${dark?"var(--dark-border)":"var(--border-light)"}`,
                     alignItems:"center",flexWrap:"wrap"}}>
          <button className="btn btn-emerald" onClick={genAll}>
            <Download size={14}/> Raporty PDF
          </button>
          {autoSource&&(()=>{
            const s=autoSource.summary||{};
            const mailRoomCount=(Array.isArray(autoSource.rows)?autoSource.rows.filter(r=>r?.status).length:0)
              || ((s.departures||0)+(s.turnarounds||0)+(s.arrivals||0)+(s.generatedStayovers||0));
            return (
            <div style={{marginLeft:"auto",textAlign:"right",lineHeight:1.5}}>
              <div style={{fontSize:11.5,fontWeight:800,color:dark?"var(--dark-text)":"var(--text-primary)"}}>
                Pokoi z maila: <span style={{color:"#5a1d4a"}}>{mailRoomCount}</span>
              </div>
              <div style={{fontSize:10,fontWeight:600,color:dark?"var(--dark-text-secondary)":"var(--text-secondary)"}}>
                KWH: {autoSource.savedAt?new Date(autoSource.savedAt).toLocaleString("pl-PL",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"}):""}
                {autoSource.historyReportCount?` · hist: ${autoSource.historyReportCount}`:""}
              </div>
              <div style={{display:"flex",gap:5,flexWrap:"wrap",justifyContent:"flex-end",marginTop:2}}>
                {[
                  [autoSource.summary?.departures,"W","#185FA5"],
                  [autoSource.summary?.turnarounds,"WP","#7C3AED"],
                  [autoSource.summary?.arrivals,"P","#0E7490"],
                  [autoSource.summary?.generatedStayovers,"PG/PGZ","#3B6D11"],
                ].filter(([n])=>n>0).map(([n,l,c])=>(
                  <span key={l} style={{fontSize:10,fontWeight:700,color:c}}>{n}{l}</span>
                ))}
                {autoSourceCheck&&(
                  <span style={{fontSize:10,fontWeight:700,color:autoSourceCheck.mismatches.length?"#B45309":"#059669"}}>
                    · {autoSourceCheck.ok}/{autoSourceCheck.total}✓
                  </span>
                )}
              </div>
            </div>
            );})()}
        </div>
      </div>

      {/* ── Pracownicy ──────────────────────────────────────────────────── */}
      <div className={`panel${dark?" dark-panel":""}`}>
        {/* Card head */}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                     gap:12,marginBottom:12,flexWrap:"wrap"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,fontWeight:650,fontSize:14,
                       color:dark?"var(--dark-text)":"var(--text-primary)",letterSpacing:"-0.005em"}}>
            <Users size={15} style={{color:"#5a1d4a",flexShrink:0}}/>
            Pracownicy HK
            {hkStaff.length>0&&(
              <span style={{display:"inline-flex",alignItems:"center",height:22,padding:"0 9px",
                            borderRadius:999,fontSize:11,fontWeight:600,
                            background:dark?"rgba(255,255,255,.06)":"var(--bg-secondary)",
                            border:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,
                            color:dark?"var(--dark-text-muted)":"var(--text-muted)"}}>
                {hkStaff.length} {hkStaff.length===1?"osoba":"osób"}
              </span>
            )}
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            {rosterFrom&&<span style={{fontSize:10.5,color:dark?"var(--dark-text-muted)":"var(--text-muted)"}}>📱 Obsada: {rosterFrom}</span>}
            <button className="btn btn-outline" style={{fontSize:12,padding:"5px 12px"}} onClick={()=>setStaffEdit(v=>!v)}>
              {staffEdit?"✓ Gotowe":"✏️ Edytuj obsadę"}
            </button>
          </div>
        </div>

        {/* Add form — tylko w trybie edycji („w razie czego") */}
        {staffEdit&&(
          <div style={{display:"flex",gap:8,marginBottom:12}}>
            <input className={inp} placeholder="Imię pracownika HK" id="hk-staff-input"
              onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){addStaff(e.target.value);e.target.value="";}}}
              style={{flex:1}}/>
            <button className="btn btn-sky"
              onClick={()=>{const el=document.getElementById("hk-staff-input");if(el?.value?.trim()){addStaff(el.value);el.value="";}}}>
              <Plus size={14}/> Dodaj
            </button>
          </div>
        )}

        {/* Staff list */}
        {!hkStaff.length?(
          <div style={{border:`1.5px dashed ${dark?"var(--dark-border)":"var(--border-light)"}`,
                       background:dark?"rgba(255,255,255,.02)":"var(--bg-secondary)",
                       borderRadius:"var(--radius-lg)",padding:"22px",
                       display:"flex",flexDirection:"column",alignItems:"center",gap:8,
                       color:dark?"var(--dark-text-muted)":"var(--text-muted)",fontSize:13,textAlign:"center"}}>
            <Users size={18} style={{opacity:.4}}/>
            {staffEdit?"Dodaj pracowników HK powyżej.":"Brak obsady — kliknij „Edytuj obsadę\", by dodać ręcznie, albo wyślij ją z telefonu menadżera."}
          </div>
        ):(
          <div className={`hkd-staff-grid${staffEdit?" editing":""}`}>
            {hkStaff.map((s,i)=>{
              const myRooms=Object.entries(hkData).filter(([,v])=>v.person===s.name);
              const cntApt=myRooms.filter(([k])=>HK_APTS.includes(k)).length;
              // Wyjazdy (W/WP = pełne sprzątanie) i pobyty (PG/PGZ = lekkie) liczone
              // osobno, w dwóch wierszach, żeby opis nie mylił się z kodami pokoi.
              // Apartament waży 3 i dolicza się do wagi linii wyjazdów.
              const wyjReg=myRooms.filter(([k,v])=>(v.status==="W"||v.status==="WP")&&!HK_APTS.includes(k)).length;
              const cntPob=myRooms.filter(([k,v])=>(v.status==="PG"||v.status==="PGZ")&&!HK_APTS.includes(k)).length;
              const wyjLoad=wyjReg+cntApt*3; // obciążenie w punktach (apt waży 3)
              const wyjRooms=wyjReg+cntApt;  // realna liczba pokoi
              const hasWyj=wyjReg>0||cntApt>0;
              // Pokazuj realne pokoje i osobno punkty, żeby „7 + 1 apt" nie czytało się jak błędne 7+1.
              const wyjTxt=cntApt>0
                ? (wyjReg>0?`wyjazd ${wyjReg} + ${cntApt} apt = ${wyjRooms} pok (${wyjLoad} pkt)`:`${cntApt} apt = ${wyjRooms} pok (${wyjLoad} pkt)`)
                : `wyjazd ${wyjReg}`;
              const isDuty=s.name===dutyPerson;
              const isAfternoon=s.name===afternoonPerson;
              const chipColor=CHIP_COLORS[i%CHIP_COLORS.length];
              const accentBorder=isDuty?"#EF9F27":isAfternoon?"#0369a1":chipColor;
              return(
                <div key={i} className="hkd-staff-chip" style={{borderLeftColor:accentBorder}}>
                  <span className="hkd-staff-avatar" style={{background:chipColor}}>
                    {s.name.charAt(0).toUpperCase()}
                  </span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:13,
                                 color:isDuty?"#854F0B":isAfternoon?"#0369a1":dark?"var(--dark-text)":"var(--text-primary)",
                                 whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                      {s.name}
                    </div>
                    <div style={{fontSize:11,color:dark?"var(--dark-text-muted)":"var(--text-muted)",marginTop:1}}>
                      <b style={{color:isDuty?"#854F0B":isAfternoon?"#0369a1":"inherit"}}>{ROLE_LABEL[roleOf(s.name)]}</b>
                      {myRooms.length===0?" · 0 pok":hasWyj?` · ${wyjTxt}`:""}
                    </div>
                    {cntPob>0&&(
                      <div style={{fontSize:11,color:dark?"var(--dark-text-muted)":"var(--text-muted)"}}>
                        pobyt: {cntPob}
                      </div>
                    )}
                  </div>
                  {staffEdit?(
                    <div className="hkd-staff-edit-ctrls" style={{display:"flex",gap:4,alignItems:"center"}}>
                      <select value={roleOf(s.name)} onChange={e=>setRole(s.name,e.target.value)}
                        style={{fontSize:11,padding:"3px 4px",borderRadius:6,
                                border:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,
                                background:dark?"#161b22":"#fff",color:dark?"var(--dark-text)":"var(--text-primary)",width:104}}>
                        <option value="poranna">Poranna</option>
                        <option value="dyzur">Dyżur</option>
                        <option value="popoludnie">Popołudnie</option>
                      </select>
                      <button onClick={()=>{if(dutyPerson===s.name)setDutyPerson("");if(afternoonPerson===s.name)setAfternoonPerson("");setHkStaff(prev=>prev.filter((_,j)=>j!==i));}}
                        style={{background:"none",border:"none",cursor:"pointer",
                                color:dark?"var(--dark-text-muted)":"var(--text-muted)",
                                display:"flex",padding:2,borderRadius:4,flexShrink:0}}
                        onMouseEnter={e=>e.currentTarget.style.color="#B91C1C"}
                        onMouseLeave={e=>e.currentTarget.style.color=dark?"var(--dark-text-muted)":"var(--text-muted)"}>
                        <X size={12}/>
                      </button>
                    </div>
                  ):(
                    <div style={{display:"flex",gap:3,alignItems:"center"}}>
                      {isDuty&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:999,background:"#854F0B",color:"#fff",fontWeight:700}}>DYŻ</span>}
                      {isAfternoon&&<span style={{fontSize:9,padding:"1px 5px",borderRadius:999,background:"#0369a1",color:"#fff",fontWeight:700}}>POP</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Pasek nad siatką pięter ──────────────────────────────────────── */}
      <div className="hk-toolbar">
        <div className="floor-tabs">
          {[["all","Wszystkie"],["1","Piętro 1"],["2","Piętro 2"],["3","Piętro 3"]].map(([v,l])=>(
            <button key={v} className={`floor-tab${floorFilter===v?" active":""}`} type="button"
              onClick={()=>setFloorFilter(v)}>{l}</button>
          ))}
        </div>
        <div className="hk-toolbar-spacer"/>
        <div className="hk-legend">
          {[
            ["togo","Do wyjazdu"],
            ["vacated","Wyjechał"],
            ["cleaning","Sprząta się"],
            ["ready","Gotowy"],
            ["stay","Pobyt (PG/PGZ)"],
            ["dirty","BR"],
          ].map(([k,label])=>(
            <span key={k} className="hk-legend-item">
              <span className={`hk-legend-dot ${k}`}/>{label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Pasek trybów edycji ──────────────────────────────────────────── */}
      <div className="hk-modes">
        <span className="hk-modes-title">Tryby edycji</span>
        <div className="hk-modes-btns">
          <button className={`hk-mode-pill zs${zsMode?" active":""}`} type="button"
            title="Kliknij pokój aby zmienić status: brak → W → WP → P → PG → PGZ → brak"
            onMouseDown={e=>{e.preventDefault();setZsMode(v=>{const next=!v;if(next){setBrMode(false);}return next;});}}>
            <span className="hk-mode-pill-ico" aria-hidden>🔄</span>
            <span className="hk-mode-pill-txt"><b>Zmiana statusu</b><small>ustaw status pokoju</small></span>
          </button>
          <button className={`hk-mode-pill br${brMode?" active":""}`} type="button"
            title="Kliknij pokój aby oznaczyć: brak ręczników"
            onMouseDown={e=>{e.preventDefault();setBrMode(v=>{const next=!v;if(next){setZsMode(false);}return next;});}}>
            <span className="hk-mode-pill-ico" aria-hidden>🧺</span>
            <span className="hk-mode-pill-txt"><b>BR</b><small>brak ręczników</small></span>
          </button>
          <button className={`hk-mode-pill edit${editMode?" active":""}`} type="button"
            title="Kliknij pokój aby przypisać osobę"
            onMouseDown={e=>{e.preventDefault();setEditMode(v=>!v);}}>
            <span className="hk-mode-pill-ico" aria-hidden>✏️</span>
            <span className="hk-mode-pill-txt"><b>Edycja</b><small>przypisz osobę</small></span>
          </button>
        </div>
      </div>

      {zsMode&&(
        <div style={{padding:"7px 14px",borderRadius:8,background:"rgba(124,58,237,.1)",border:"1px solid rgba(124,58,237,.3)",fontSize:12,fontWeight:600,color:"#6d28d9",display:"flex",alignItems:"center",gap:8}}>
          <span>🔄 Tryb zmiany statusu — kliknij pokój: brak → W → WP → P → PG → PGZ → brak</span>
          <button onMouseDown={e=>{e.preventDefault();setZsMode(false);}} style={{marginLeft:"auto",fontSize:11,padding:"2px 8px",borderRadius:5,border:"1px solid rgba(124,58,237,.4)",background:"transparent",color:"#6d28d9",cursor:"pointer",fontWeight:700}}>Wyłącz</button>
        </div>
      )}
      <div className="hk-stats">
        <div className="hk-stat"><div className="hk-stat-dot" style={{background:"#f59e0b"}}/><div className="hk-stat-val" style={{color:"#f59e0b"}}>{totalW}</div><div><div className="hk-stat-label">Wyjazdy</div><div className="hk-stat-sub">priorytet</div></div></div>
        {totalCleaning>0&&<div className="hk-stat"><div className="hk-stat-dot" style={{background:"#3b82f6"}}/><div className="hk-stat-val" style={{color:"#3b82f6"}}>{totalCleaning}</div><div><div className="hk-stat-label">Sprząta się</div><div className="hk-stat-sub">w trakcie</div></div></div>}
        {totalReady>0&&<div className="hk-stat"><div className="hk-stat-dot" style={{background:"#22c55e"}}/><div className="hk-stat-val" style={{color:"#22c55e"}}>{totalReady}</div><div><div className="hk-stat-label">Gotowe</div><div className="hk-stat-sub">posprzątane</div></div></div>}
        <div className="hk-stat"><div className="hk-stat-dot" style={{background:"#0d9488"}}/><div className="hk-stat-val" style={{color:"#0d9488"}}>{totalStay}</div><div><div className="hk-stat-label">Pobyty</div><div className="hk-stat-sub">PG / PGZ</div></div></div>
        {totalBR>0&&<div className="hk-stat"><div className="hk-stat-dot" style={{background:"#ef4444"}}/><div className="hk-stat-val" style={{color:"#ef4444"}}>{totalBR}</div><div><div className="hk-stat-label">BR</div><div className="hk-stat-sub">brak ręczników</div></div></div>}
      </div>

      <div className="room-scroll">
        {(floorFilter==="all"||floorFilter==="1")&&renderFloorCards(HK_FLOOR1,"Piętro 1","pokoje 101-123")}
        {(floorFilter==="all"||floorFilter==="2")&&renderFloorCards(HK_FLOOR2,"Piętro 2","pokoje 201-223")}
        {(floorFilter==="all"||floorFilter==="3")&&renderFloorCards(HK_FLOOR3,"Piętro 3","pokoje 301-323")}
      </div>

      {/* ── Uwagi do pokoi ───────────────────────────────────────────────── */}
      <div className={`panel${dark?" dark-panel":""}`}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                     marginBottom:14,flexWrap:"wrap",gap:8}}>
          <div style={{display:"flex",alignItems:"center",gap:8,fontWeight:650,fontSize:14,
                       color:dark?"var(--dark-text)":"var(--text-primary)",letterSpacing:"-0.005em"}}>
            <MessageSquare size={14} style={{color:"#5a1d4a",flexShrink:0}}/>
            Uwagi do pokoi
          </div>
          <div style={{fontSize:11,color:dark?"var(--dark-text-muted)":"var(--text-muted)"}}>
            Ważna informacja pojawi się tylko w raporcie indywidualnym danego pracownika
          </div>
        </div>

        {/* Notes form */}
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"flex-end",marginBottom:12}}>
          <div>
            <label style={{fontSize:11,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",
                           color:dark?"var(--dark-text-muted)":"var(--text-muted)",display:"block",marginBottom:5}}>
              Pokój
            </label>
            <select className={inp} value={noteRoom} onChange={e=>setNoteRoom(e.target.value)} style={{width:100}}>
              <option value="">— wybierz —</option>
              {HK_ALL.map(r=><option key={r.no} value={r.no}>{r.no}</option>)}
            </select>
          </div>
          <div style={{flex:1,minWidth:180}}>
            <label style={{fontSize:11,fontWeight:700,letterSpacing:"0.06em",textTransform:"uppercase",
                           color:dark?"var(--dark-text-muted)":"var(--text-muted)",display:"block",marginBottom:5}}>
              Uwaga / notatka
            </label>
            <input className={inp} value={noteText} onChange={e=>setNoteText(e.target.value)}
              placeholder="Np. donieś łóżeczko, przyjeżdża Czesław…"
              style={{width:"100%"}}
              onKeyDown={e=>{
                if(e.key==="Enter"&&noteRoom&&noteText.trim()){
                  const n={...hkNotes,[noteRoom]:noteText.trim()};
                  setHkNotes(n);saveJson(STORAGE_KEYS.hkNotes,n);
                  setNoteRoom("");setNoteText("");
                }
              }}/>
          </div>
          <button className="btn btn-amber" disabled={!noteRoom||!noteText.trim()}
            onClick={()=>{
              if(!noteRoom||!noteText.trim())return;
              const n={...hkNotes,[noteRoom]:noteText.trim()};
              setHkNotes(n);saveJson(STORAGE_KEYS.hkNotes,n);
              setNoteRoom("");setNoteText("");
              showToast(`Uwaga do pokoju ${noteRoom} zapisana.`,"success");
            }}>
            <Plus size={13}/> Zapisz
          </button>
        </div>

        {/* Notes list */}
        {Object.keys(hkNotes).length>0?(
          <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
            {Object.entries(hkNotes).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([no,note])=>(
              <div key={no} style={{display:"inline-flex",alignItems:"center",gap:8,
                                    background:"var(--plum-bg)",border:"1px solid var(--plum-border)",
                                    borderRadius:999,padding:"4px 10px 4px 4px",
                                    fontSize:12,color:"var(--plum-deep)",maxWidth:340}}>
                <span style={{background:"var(--plum)",color:"#fff",fontWeight:700,fontSize:11,
                              height:20,padding:"0 8px",borderRadius:999,
                              display:"inline-grid",placeItems:"center",flexShrink:0,
                              fontVariantNumeric:"tabular-nums"}}>
                  {no}
                </span>
                <span style={{overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{note}</span>
                <button onClick={()=>{const n={...hkNotes};delete n[no];setHkNotes(n);saveJson(STORAGE_KEYS.hkNotes,n);}}
                  style={{background:"none",border:"none",cursor:"pointer",color:"var(--plum)",
                          display:"flex",padding:2,flexShrink:0,opacity:.6}}
                  onMouseEnter={e=>e.currentTarget.style.opacity="1"}
                  onMouseLeave={e=>e.currentTarget.style.opacity=".6"}>
                  <X size={11}/>
                </button>
              </div>
            ))}
          </div>
        ):(
          <div style={{padding:14,background:dark?"rgba(255,255,255,.02)":"var(--bg-secondary)",
                       border:`1px dashed ${dark?"var(--dark-border)":"var(--border-light)"}`,
                       borderRadius:"var(--radius-md)",fontSize:12.5,
                       color:dark?"var(--dark-text-muted)":"var(--text-muted)",textAlign:"center"}}>
            Brak uwag — dodaj notatkę do konkretnego pokoju.
          </div>
        )}
      </div>
      </>)}
    </div>
  );
}

export default HKPanel;
