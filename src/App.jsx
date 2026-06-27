// Copyright © 2026 Conrad Comfort. All rights reserved. UNLICENSED.
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import UpdateBanner from "./UpdateBanner";
import Logo from "./ui/Logo";
import ScheduleAdminPanel from "./modules/ScheduleAdmin/ScheduleAdminPanel";
import VouchersPanel from "./modules/Vouchers/VouchersPanel";
import TeamChat from "./modules/Chat/TeamChat";
import ReviewsPanel from "./modules/Reviews/ReviewsPanel";
import AlertsAdminPanel from "./modules/Admin/AlertsAdminPanel";
import StandingRemindersPanel from "./modules/Admin/StandingRemindersPanel";
import RestoredHKPanel from "./modules/HK/HKPanel";
import FaultsPanel from "./modules/Faults/FaultsPanel";
import EwidencjaPanel from "./modules/Admin/EwidencjaPanel";
import ZadaniaPanel from "./modules/Admin/ZadaniaPanel";
import PracownicyPanel from "./modules/Admin/PracownicyPanel";
import StatystykiPanel from "./modules/Admin/StatystykiPanel";
import UstawieniaPanel from "./modules/Admin/UstawieniaPanel";
import KorektyPanel from "./modules/Admin/KorektyPanel";
import HistoriaPanel from "./modules/Admin/HistoriaPanel";
import WikiAdminPanel from "./modules/Admin/WikiAdminPanel";
import KasaAdminPanel from "./modules/Admin/KasaAdminPanel";
import WiadomosciPanel from "./modules/Admin/WiadomosciPanel";
import ParkingPanel from "./modules/Parking/ParkingPanel";
import HistoriaWorkerPanel from "./modules/Historia/HistoriaPanel";
import StaliGosciePanel from "./modules/StaliGoscie/StaliGosciePanel";
import ConfirmModal from "./components/modals/ConfirmModal";
import PromptModal from "./components/modals/PromptModal";
import GlobalSearchModal from "./components/modals/GlobalSearchModal";
import EmployeeReportModal from "./components/modals/EmployeeReportModal";
import PreShiftModal from "./components/modals/PreShiftModal";
import IdentityConfirmModal from "./components/modals/IdentityConfirmModal";
import AuditLogModal from "./components/modals/AuditLogModal";
import MessageModal from "./components/modals/MessageModal";
import CorrectionApprovalModal from "./components/modals/CorrectionApprovalModal";
import InboxPanel from "./components/InboxPanel";
import ToastContainer from "./components/ToastContainer";
import GlobalUpdateNotice from "./components/GlobalUpdateNotice";
import WelcomeOverlayScreen from "./components/WelcomeOverlayScreen";
import SignatureCanvas from "./components/SignatureCanvas";
import WorkerSidebar from "./components/Rail/WorkerSidebar";
import AdminSidebarRail from "./components/Rail/AdminSidebarRail";
import { useAutoUpdate } from "./hooks/useAutoUpdate";
import { useClock } from "./hooks/useClock";
import { useDarkMode } from "./hooks/useDarkMode";
import { useSound } from "./hooks/useSound";
import { getFullName } from "./lib/employees";
import { supabase, supabaseReady } from "./lib/supabase";
import { pushMirror } from "./lib/cloudSync";
import { useHKAgent, markRequestHandled } from "./lib/useHKAgent";
import { pushHkState, fetchHkState, subscribeHkState, hkStateDeviceId } from "./lib/hkState";
import { pushSchedule, fetchSchedule, subscribeSchedule } from "./lib/scheduleSync";
import AgentBot from "./components/HKAgent/AgentBot";
import { askWiki, triageFault, generateBriefing, polishText, nudgeShiftEnd, llmReady } from "./lib/llm";
import {
  LogIn, LogOut, Plus, Trash2, ClipboardList, ShieldCheck, BookOpen,
  Search, Settings, History, BellRing, AlertTriangle, X,
  Users, FileText, Download, Cog, Inbox,
  Bell, Calendar, CheckSquare, ArrowLeftRight, Moon, Sun,
  BarChart2, TrendingUp, MessageSquare, RefreshCw, AlertCircle, Send,
  Eye, EyeOff, Maximize2, Minimize2, Sparkles, Clock,
} from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson, getCustomManagers, setCustomManagers as persistCustomManagers } from "./lib/storage";
import { verifyOrCreateAdminPassword, hasAdminPassword, verifyBootstrapPassword, createManagerPassword } from "./lib/adminAuth";
import {
  ADMIN_MANAGERS, SHIFT_OPTIONS,
  SHIFT_LABELS, SHIFT_LABELS_PL, SHIFT_SHORT_LABELS, SHIFT_NAME_PL, NEXT_SHIFT,
  defaultEmployees, defaultTasks, getDefaultWikiEntries, emptyCarryOver,
  HK_FLOOR1, HK_FLOOR2, HK_FLOOR3, HK_ALL, TENANT_ID,
} from "./lib/constants";
import { fmt, fmtA, todayKey, monthKey, parsePlDateTime, autoDetectShift, shiftFromSchedule, shiftStartMinutes, shiftEndDate, getScheduleDayEntry } from "./lib/dates";
import { normalizeToShift } from "./lib/excel";
import { pl, plR, normTask, buildShiftFn, buildEmpFn, fmtMoney } from "./lib/format";
import { canonicalizeNameInput, canonicalizePersonName, getCanonicalManagerName, isManagerName } from "./lib/names";
import { downloadDailyReportPDF } from "./lib/pdf-daily";
import { downloadCorrectionPDF, downloadShiftPDF, downloadEmployeeReportPDF, downloadWikiPDF } from "./lib/pdf-reports";
import Lottie from "lottie-react";
import { checkPlumAnim } from "./lib/lottie-check";


const addAudit=(manager,action)=>{const log=loadJson(STORAGE_KEYS.adminAudit,[]);saveJson(STORAGE_KEYS.adminAudit,[{id:crypto.randomUUID(),manager,action,at:fmtA()},...log].slice(0,200));};



const IS_DEV_TEST = typeof localStorage !== 'undefined' && localStorage.getItem('dev-test-mode') === '1';
// Narzędzia testowe (zegar symulowany). Gate WYŁĄCZNIE na import.meta.env.DEV —
// w `vite build` to stała false, więc cały blok jest usuwany z release (dead-code).
// Widoczne tylko podczas `npm run dev`. Świadomie BEZ IS_DEV_TEST, by nie trafiło na produkcję.
const DEV_TOOLS = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
const TEST_CLOCK_KEY = 'reception-test-clock-offset';

// ── Page-title labels for shell topbar (sekcja 2 redesign) ────────────────────
const WORKER_TAB_LABELS = {
  zmiana: "Przegląd zmiany",
  zadania: "Zadania",
  przekazanie: "Przekaż zmianę",
  hk: "Housekeeping",
  informacje: "Informacje",
  usterki: "Usterki",
  parking: "Parking",
  goscie: "Stali goście",
  vouchery: "Vouchery",
  opinie: "Opinie gości",
};
const ADMIN_TAB_LABELS = {
  ewidencja: "Ewidencja", zadania: "Zadania", pracownicy: "Pracownicy",
  grafik: "Grafik", statystyki: "Statystyki", ustawienia: "Ustawienia",
  korekty: "Korekty", usterki: "Usterki",
  wiadomosci: "Wiadomości", alerty: "Alerty",
  przypomnienia: "Przypomnienia", historia: "Historia", wiki: "Wiki",
  kasa: "Kasa",
};

// Apartamenty mają typ wpisywany RĘCZNIE przez recepcję (np. "2xDBL", "D+T+SOFA")
// i nie wolno go nadpisywać generycznym "APT" z planu mailowego. room_types to
// jedna kolumna JSONB (upsert podmienia CAŁY obiekt), więc gdy budujemy plan z
// danych z dysku/maila (które dla apartamentu dają "APT"), najpierw dociągamy
// istniejący room_types i zachowujemy ręczny typ apartamentu — tak jak robi
// automacja (scripts/hk-automation/lib/supabase-sync.cjs). Bez tego telefon
// pokazywał „APT" zamiast wpisanego „2xDBL".
const HK_APT_NOS = new Set(HK_ALL.filter(r=>r.apt).map(r=>r.no));
async function preserveAptRoomTypes(date, rt){
  if(!rt) return rt;
  const generic = [...HK_APT_NOS].filter(no => !rt[no] || rt[no]==="APT");
  if(!generic.length) return rt; // mamy już konkretne typy apartamentów — nic nie ruszamy
  try{
    const { data } = await supabase.from("hk_plan").select("room_types")
      .eq("date",date).order("updated_at",{ascending:false}).limit(1).maybeSingle();
    const ex = data?.room_types || {};
    generic.forEach(no => { if(ex[no] && ex[no] !== "APT") rt[no] = ex[no]; });
  }catch{ /* brak sieci — zostaw generyczne, nie blokuj zapisu reszty */ }
  return rt;
}

export default function App(){
  const [customManagers,setCustomManagersState]=useState(()=>{const m=getCustomManagers();return m.length>0?m:ADMIN_MANAGERS;});
  // Promocja pracownika na kierownika = dodanie do listy kierowników (wspólne hasło admina).
  const promoteToManager=(name)=>{const n=canonicalizePersonName(name);setCustomManagersState(prev=>{const next=prev.includes(n)?prev:[...prev,n];persistCustomManagers(next);return next;});showToast(`${n} ma teraz dostęp do panelu kierownika (wspólne hasło).`,"success");};
  const demoteManager=(name)=>{setCustomManagersState(prev=>{const next=prev.filter(m=>m!==name);persistCustomManagers(next);return next;});showToast(`${name} cofnięty(a) do roli pracownika.`,"info");};
  // ── Zegar testowy (DEV) — symulowany „teraz" przesunięty o offset w ms ───────
  // Zdefiniowany na samej górze, by getNow() napędzał WIDOCZNY zegar oraz auto-
  // wykrywanie zmiany (nie tylko logikę końca zmiany). offset=0 → realny czas.
  const [testClockOffset,setTestClockOffset]=useState(()=>{
    if(!DEV_TOOLS)return 0;
    const v=parseInt(localStorage.getItem(TEST_CLOCK_KEY)||"0",10);return Number.isFinite(v)?v:0;
  });
  const getNow=useCallback(()=>new Date(Date.now()+(DEV_TOOLS?testClockOffset:0)),[testClockOffset]);
  const applyTestClockOffset=(ms)=>{setTestClockOffset(ms);try{localStorage.setItem(TEST_CLOCK_KEY,String(ms));}catch{/* */}};
  const [tasks,setTasks]=useState(defaultTasks);
  const [employees,setEmployees]=useState(defaultEmployees);
  const [employeeName,setEmployeeName]=useState("");
  const [selectedShift,setSelectedShift]=useState("");
  // Auto-wykrywanie zmiany na podstawie godziny przy przejsciu do "ready"
  // (refleks na zmiane loginStep — gdy ready i pusty shift, ustaw auto)
  const [cashOpeningAmount,setCashOpeningAmount]=useState("");
  const [cashClosingDocumentsAmount,setCashClosingDocumentsAmount]=useState("");
  const [cashCurrentAmount,setCashCurrentAmount]=useState("");
  const [started,setStarted]=useState(false);
  const [completed,setCompleted]=useState({});
  const [currentSessionDate,setCurrentSessionDate]=useState("");
  const [additionalTaskInput,setAdditionalTaskInput]=useState("");
  const [shiftNoteInput,setShiftNoteInput]=useState("");
  const [handoverNote,setHandoverNote]=useState("");
  const [autosaveNote,setAutosaveNote]=useState(()=>{
    try{const s=localStorage.getItem("reception-autosave-note");return s?JSON.parse(s):null;}catch{return null;}
  });
  const [carryOverTarget,setCarryOverTarget]=useState("nocna");
  // autosave last carry note every 60s
  useEffect(()=>{
    if(!started||!shiftNoteInput.trim())return;
    const timer=setTimeout(()=>{
      const snap={text:shiftNoteInput.trim(),employee:employeeName,shift:selectedShift,savedAt:fmtA(),auto:true};
      localStorage.setItem(AUTOSAVE_KEY,JSON.stringify(snap));
    },60000);
    return()=>clearTimeout(timer);
  },[shiftNoteInput,started,employeeName,selectedShift]);
  const [extraTasksLog,setExtraTasksLog]=useState([]);
  const [carryOverTasks,setCarryOverTasks]=useState(emptyCarryOver);
  const [isAdmin,setIsAdmin]=useState(false);
  const [showAdminPanel,setShowAdminPanel]=useState(false);
  const [currentManager,setCurrentManager]=useState("");
  const clearManagerSession=useCallback(()=>{
    setIsAdmin(false);
    setShowAdminPanel(false);
    setCurrentManager("");
    localStorage.removeItem(STORAGE_KEYS.adminSession);
    localStorage.removeItem(STORAGE_KEYS.adminUser);
  },[]);
  // ── Inline login (B4 + B19) ─────────────────────────────────────────────
  const [loginStep,setLoginStep]=useState("name"); // name | admincheck | setup | password | ready
  const [loginPassword,setLoginPassword]=useState("");
  const [loginPassword2,setLoginPassword2]=useState("");
  const [loginAdminInput,setLoginAdminInput]=useState("");
  const [showWelcomeOverlay,setShowWelcomeOverlay]=useState(false);
  const [pendingAutoStart,setPendingAutoStart]=useState(false);
  const [loginShiftSource,setLoginShiftSource]=useState("clock");
  const [schedule,setSchedule]=useState(()=>loadJson(STORAGE_KEYS.schedule,{}));
  // ─── Grafik: dwukierunkowy sync NA ŻYWO z panelem (panel.html) i innymi
  // urządzeniami. Zapis idzie przez schedule_merge (migracja 0034) — per komórka,
  // nie kasuje cudzych wpisów. Wzór 1:1 z hk_state (rev + updated_device + suppress).
  const schedRevRef=React.useRef(0);              // ostatnia zastosowana wersja (rev)
  const suppressSchedulePushRef=React.useRef(false); // właśnie zastosowaliśmy stan zdalny — nie odsyłaj
  const scheduleRef=React.useRef(schedule);
  useEffect(()=>{scheduleRef.current=schedule;},[schedule]);
  useEffect(()=>{
    saveJson(STORAGE_KEYS.schedule,schedule);
    if(suppressSchedulePushRef.current){suppressSchedulePushRef.current=false;return;} // to była zmiana zdalna
    const t=setTimeout(()=>{
      pushSchedule(schedule).then(row=>{if(row&&typeof row.rev==="number")schedRevRef.current=Math.max(schedRevRef.current,row.rev);});
    },700);
    return ()=>clearTimeout(t);
  },[schedule]);
  useEffect(()=>{pushMirror("employees",employees);},[employees]); // rejestr recepcji dla panelu menedżerskiego
  useEffect(()=>{const r=loadJson(STORAGE_KEYS.empReports,[]);if(r.length)pushMirror("employee_reports",r.slice(0,100));},[]); // notatki służbowe → panel (koordynator/kierownik)
  const [lastView,setLastView]=useState(()=>localStorage.getItem("reception-last-view")||"worker"); // worker | manager
  const [mgrToggleMini,setMgrToggleMini]=useState(()=>localStorage.getItem("reception-mgr-toggle-mini")==="1");
  const activeManagerName=getCanonicalManagerName(employeeName,customManagers);
  const canAccessManagerPanel=!!(isAdmin&&activeManagerName&&currentManager===activeManagerName);
  const resolveLoginShift=useCallback((name)=>{
    const emp=name||employeeName; // przekazane imię ma priorytet (stan może być jeszcze niezaktualizowany)
    const currentSchedule=loadJson(STORAGE_KEYS.schedule,schedule);
    setSchedule(currentSchedule);
    const scheduledShift=shiftFromSchedule(currentSchedule,emp);
    setLoginShiftSource(scheduledShift?"schedule":"clock");
    return scheduledShift||autoDetectShift(getNow());
  },[employeeName,schedule,getNow]);
  // Auto-set zmiany na podstawie godziny gdy login kończy się na "ready"
  useEffect(()=>{
    if(loginStep==="ready"){
      const normalizedShift=normalizeToShift(selectedShift);
      if(normalizedShift&&normalizedShift!==selectedShift){
        setSelectedShift(normalizedShift);
      }else if(!normalizedShift){
        setSelectedShift(resolveLoginShift());
      }
    }
  },[loginStep, selectedShift, resolveLoginShift]);
  const completeLogin=useCallback((name)=>{
    const normalizedShift=normalizeToShift(selectedShift)||resolveLoginShift(name);
    setSelectedShift(normalizedShift);
    setLoginStep("ready");
    setPendingAutoStart(true);
    setShowWelcomeOverlay(true);
  },[resolveLoginShift,selectedShift]);
  // ── Identity confirm na wczesnym logowaniu (do 30 min przed startem zmiany) ──
  const [identityConfirm,setIdentityConfirm]=useState(null);
  const attemptWorkerLogin=useCallback((name)=>{
    const empName=name||employeeName;
    const currentSchedule=loadJson(STORAGE_KEYS.schedule,schedule);
    const startMin=shiftStartMinutes(currentSchedule,empName);
    if(startMin!=null){
      const now=getNow();
      const nowMin=now.getHours()*60+now.getMinutes();
      const diff=startMin-nowMin; // dodatni = pracownik loguje się przed startem
      if(diff>0&&diff<=30){
        const entry=getScheduleDayEntry(currentSchedule,empName);
        const shiftKey=entry?.shift||null;
        const raw=entry?.raw;
        let hours="";
        if(raw&&typeof raw==="object"){
          const st=raw.start??raw.startTime??raw.start_time??raw.from??raw.from_time;
          const en=raw.end??raw.endTime??raw.end_time??raw.to??raw.to_time;
          hours=[st,en].filter(Boolean).join("–");
        }else if(typeof raw==="string"&&/\d\s*[-–—]\s*\d/.test(raw)){
          hours=raw.replace(/\s*[-–—]\s*/,"–");
        }
        const pad=n=>String(n).padStart(2,"0");
        setIdentityConfirm({
          employeeName:empName,
          shiftLabel:shiftKey?`${(SHIFT_NAME_PL[shiftKey]||shiftKey)}${hours?" "+hours:""}`:(hours||""),
          startLabel:`${pad(Math.floor(startMin/60))}:${pad(startMin%60)}`,
          nowLabel:`${pad(now.getHours())}:${pad(now.getMinutes())}`,
        });
        return;
      }
    }
    completeLogin(empName);
  },[employeeName,schedule,completeLogin,getNow]);
  // Godziny + typ zmiany wpisane przez kierownika w grafiku (zalogowana osoba, dziś).
  const scheduledEntry=useMemo(()=>{
    if(!employeeName)return{hours:"",shift:null};
    const e=getScheduleDayEntry(schedule,employeeName);
    const raw=e?.raw;
    let hours="";
    if(raw&&typeof raw==="object"){
      const start=raw.start??raw.startTime??raw.start_time??raw.from??raw.from_time;
      const end=raw.end??raw.endTime??raw.end_time??raw.to??raw.to_time;
      hours=[start,end].filter(Boolean).join("–");
    }else if(typeof raw==="string"&&/\d\s*[-–—]\s*\d/.test(raw)){
      hours=raw.replace(/\s*[-–—]\s*/,"–");
    }
    return{hours,shift:e?.shift||null};
  },[employeeName,schedule]);
  // Godziny doklejamy do etykiety TYLKO gdy pokazywany typ zmiany zgadza się z
  // grafikiem — po ręcznej zmianie zmiany przy logowaniu wracamy do sztywnej etykiety.
  const shiftFullLabel=useCallback((key)=>{
    if(!key)return"—";
    const useHours=scheduledEntry.hours&&key===scheduledEntry.shift;
    return useHours?`${SHIFT_NAME_PL[key]||key} ${scheduledEntry.hours}`:(SHIFT_LABELS_PL[key]||key);
  },[scheduledEntry]);
  const shiftShortLabel=useCallback((key)=>{
    if(!key)return"—";
    const useHours=scheduledEntry.hours&&key===scheduledEntry.shift;
    const name=(SHIFT_NAME_PL[key]||key).replace(/^Zmiana\s+/i,"");
    return useHours?`${name.charAt(0).toUpperCase()}${name.slice(1)} ${scheduledEntry.hours}`:(SHIFT_SHORT_LABELS[key]||key);
  },[scheduledEntry]);
  // Zamknij rozwijane "Zmień" (np. cel przekazania, wybór zmiany) po kliknięciu poza nim.
  useEffect(()=>{
    const onDown=(e)=>{
      document.querySelectorAll("details.cc-flow-pick[open]").forEach(d=>{ if(!d.contains(e.target)) d.removeAttribute("open"); });
    };
    document.addEventListener("mousedown",onDown);
    return()=>document.removeEventListener("mousedown",onDown);
  },[]);
  // Domyślny cel przekazania = następna zmiana po obecnej (a nie sztywno "nocna").
  // Ustawiamy przy logowaniu; pracownik może później zmienić ręcznie w UI.
  useEffect(()=>{
    if(selectedShift&&NEXT_SHIFT[selectedShift]){
      setCarryOverTarget(NEXT_SHIFT[selectedShift]);
      setNewReminderShift(selectedShift);
    }
  },[selectedShift]);
  // Odrzucenia przypomnień/powiadomień utrwalamy per pracownik + dzień (klucz tu,
  // efekt zapisujący niżej — po deklaracji dismissedReminderKeys, by uniknąć TDZ).
  const dismissStoreKey=useCallback((name)=>`reception-dismissed-reminders-${name||"_"}-${todayKey()}`,[]);
  // ── Pre-shift modal (B5) ────────────────────────────────────────────────
  const [showPreShiftModal,setShowPreShiftModal]=useState(false);
  // Switch top-bar po zalogowaniu kierownika
  const [adminActivityLog,setAdminActivityLog]=useState([]);
  const [employeeActivityLog,setEmployeeActivityLog]=useState([]);
  const [newTaskText,setNewTaskText]=useState("");
  const [newTaskTime,setNewTaskTime]=useState("");
  const [taskShiftTarget,setTaskShiftTarget]=useState("poranna");
  const [newEmployeeName,setNewEmployeeName]=useState("");
  const [editingEmployeeIndex,setEditingEmployeeIndex]=useState(null);
  const [editingEmployeeName,setEditingEmployeeName]=useState("");
  const [wikiEntries,setWikiEntries]=useState(()=>getDefaultWikiEntries());
  const [showWiki,setShowWiki]=useState(false);
  // Asystent RAG nad Wiki (odpowiada wyłącznie z wpisów Wiki)
  const [wikiAskQ,setWikiAskQ]=useState("");
  const [wikiAskAnswer,setWikiAskAnswer]=useState("");
  const [wikiAskLoading,setWikiAskLoading]=useState(false);
  const [wikiAskError,setWikiAskError]=useState("");
  // Briefing przekazania zmiany (streszczenie LLM z danych operacyjnych)
  const [briefingText,setBriefingText]=useState("");
  const [briefingLoading,setBriefingLoading]=useState(false);
  const [briefingError,setBriefingError]=useState("");
  const [polishingNote,setPolishingNote]=useState(false);
  const [wikiSearch,setWikiSearch]=useState("");
  const [wikiTopic,setWikiTopic]=useState("");
  const [wikiContent,setWikiContent]=useState("");
  const [wikiImages,setWikiImages]=useState([]); // base64 images for current edit
  const [editingWikiId,setEditingWikiId]=useState(null);
  const [selectedWikiId,setSelectedWikiId]=useState(()=>getDefaultWikiEntries()[0]?.id||null);
  const [finishDialogOpen,setFinishDialogOpen]=useState(false);
  const [safeConfirmStep,setSafeConfirmStep]=useState(false); // true = pokazuj ekran potwierdzenia sejfu
  const [showEmpReport,setShowEmpReport]=useState(false);
  const [dismissedReminderKeys,setDismissedReminderKeys]=useState([]);
  // Przypomnienia „do potwierdzenia" (kurier/dostawa) odłożone na później — id→timestamp.
  // Tylko w pamięci: po godzinie wracają, by „dopytać parę razy" w trakcie zmiany.
  const [snoozedConfirm,setSnoozedConfirm]=useState({});
  // Tick co 60 s — żeby odłożone przypomnienia wróciły po wygaśnięciu drzemki.
  const [nowTick,setNowTick]=useState(0);
  useEffect(()=>{const t=setInterval(()=>setNowTick(n=>n+1),60000);return()=>clearInterval(t);},[]);
  // Utrwalanie odrzuceń (po deklaracji powyżej — unika TDZ).
  useEffect(()=>{
    if(employeeName&&started)saveJson(dismissStoreKey(employeeName),dismissedReminderKeys);
  },[dismissedReminderKeys,employeeName,started,dismissStoreKey]);
  const [workerTab,setWorkerTab]=useState("zmiana");
  const [adminTab,setAdminTab]=useState("ewidencja");
  const [evidenceMonth,setEvidenceMonth]=useState(monthKey());
  const [activityDay,setActivityDay]=useState(todayKey());
  const [showAuditLog,setShowAuditLog]=useState(false);
  const [shiftStartTime,setShiftStartTime]=useState(null);
  const [datedReminders,setDatedReminders]=useState([]);
  const [newReminderShift,setNewReminderShift]=useState("poranna");
  const [newReminderDate,setNewReminderDate]=useState(todayKey());
  const [reminderMode,setReminderMode]=useState("general");
  const [reminderEntryType,setReminderEntryType]=useState("reminder"); // reminder | task
  // ── Kompozer „Przekaż zmianę" v2 (Wersja A) — jedno pole, 2 osie wyboru ──
  const [entryKind,setEntryKind]=useState("task");   // task | note
  const [entryWhen,setEntryWhen]=useState("next");   // next | dated | pending
  const [toasts,setToasts]=useState([]);
  const [confirmDialog,setConfirmDialog]=useState(null);
  const [promptDialog,setPromptDialog]=useState(null);
  const { liveTime, shiftElapsed }=useClock(shiftStartTime,getNow);
  const [showSearch,setShowSearch]=useState(false);
  const [paymentCorrections,setPaymentCorrections]=useState(()=>loadJson(STORAGE_KEYS.paymentCorrections,[]));
  useEffect(()=>{pushMirror("payment_corrections",paymentCorrections);},[paymentCorrections]);
  // Synchronizacja decyzji kierownika z panelu menedżerskiego (payment_correction_approvals):
  // panel zatwierdza/odrzuca korekty zdalnie, tu nanosimy te decyzje na lokalne korekty,
  // żeby widok recepcji był spójny z panelem. Idempotentne (po polu panelSync = decided_at).
  useEffect(()=>{
    if(!supabase)return;
    let cancelled=false;
    const syncApprovals=async()=>{
      try{
        const {data,error}=await supabase
          .from("payment_correction_approvals")
          .select("correction_id,decision,manager,note,decided_at")
          .eq("tenant_id",TENANT_ID);
        if(error||!Array.isArray(data)||cancelled)return;
        const byId={};data.forEach(a=>{if(a&&a.correction_id)byId[a.correction_id]=a;});
        setPaymentCorrections(prev=>{
          let changed=false;
          const next=prev.map(c=>{
            const a=byId[c.id];
            if(!a||c.panelSync===a.decided_at)return c; // brak decyzji albo już naniesiona
            changed=true;
            const mgr=a.manager||"Panel";
            const at=a.decided_at?new Date(a.decided_at).toLocaleString("pl-PL",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}):"";
            const rejected=a.decision==="rejected";
            return {...c,done:true,decision:rejected?"rejected":"approved",panelSync:a.decided_at,
              approvals:{...(c.approvals||{}),[mgr]:{at,note:a.note||(rejected?"Odrzucone w panelu menedżerskim":"Zatwierdzone w panelu menedżerskim"),signature:null,source:"panel",rejected}}};
          });
          if(changed)saveJson(STORAGE_KEYS.paymentCorrections,next);
          return changed?next:prev;
        });
      }catch{/* offline / brak tabeli — ignoruj */}
    };
    syncApprovals();
    const iv=setInterval(syncApprovals,60000); // dociągaj decyzje co minutę
    return ()=>{cancelled=true;clearInterval(iv);};
  },[]);
  const [savedReports,setSavedReports]=useState(()=>loadJson(STORAGE_KEYS.reports,[]));
  const [showPaymentForm,setShowPaymentForm]=useState(false);
  const [correctionFilter,setCorrectionFilter]=useState("wszystkie");
  const [expandedCorrection,setExpandedCorrection]=useState(null);
  const [wikiExpandedId,setWikiExpandedId]=useState(null);
  const [globalNotifications,setGlobalNotifications]=useState(()=>loadJson(STORAGE_KEYS.globalNotifications,[]));
  const [newGlobalNote,setNewGlobalNote]=useState("");
  const [newGlobalNoteShift,setNewGlobalNoteShift]=useState("");
  const [newGlobalNoteDate,setNewGlobalNoteDate]=useState(()=>todayKey());
  const [dismissedGlobalNotes,setDismissedGlobalNotes]=useState(()=>{try{return JSON.parse(localStorage.getItem("reception-dismissed-gnotes")||"[]");}catch{return[];}});
  const [handoverLog,setHandoverLog]=useState(()=>loadJson(STORAGE_KEYS.handoverLog,[]));
  const [incidentLog,setIncidentLog]=useState(()=>loadJson(STORAGE_KEYS.incidentLog,[]));
  const [pcDocType,setPcDocType]=useState("paragon");
  const [adminNotifType,setAdminNotifType]=useState("notif");
  const AUTOSAVE_KEY="reception-autosave-note";
  const autosaveTimerRef=React.useRef(null);
  const [showMsgModal,setShowMsgModal]=useState(false);
  const [messages,setMessages]=useState(()=>loadJson(STORAGE_KEYS.messages,[]));
  const [unreadMsgCount,setUnreadMsgCount]=useState(()=>{
    const msgs=loadJson(STORAGE_KEYS.messages,[]);
    return msgs.filter(m=>!m.readByAdmin).length;
  });
  const [pcEmployee,setPcEmployee]=useState("");
  const [pcReservation,setPcReservation]=useState("");
  const [pcExplanation,setPcExplanation]=useState("");
  const [pcSignature,setPcSignature]=useState(null);
  const { workerDark, setWorkerDark, adminDark, setAdminDark, dark }=useDarkMode(canAccessManagerPanel&&showAdminPanel);
  const [hkDate,setHkDate]=useState(()=>todayKey());
  // Po północy aplikacja zostawiona włączona musi przeskoczyć na nowy dzień —
  // inaczej recepcja rozpisuje pokoje pod wczorajszą datą, a panel/telefony czytają
  // dziś (lokalnie) → wszędzie 0. Podążamy tylko gdy hkDate wskazywał poprzednie
  // „dziś" (nie ręcznie wybraną przez usera datę).
  const _lastTodayRef=React.useRef(todayKey());
  useEffect(()=>{
    const id=setInterval(()=>{
      const t=todayKey();
      if(t!==_lastTodayRef.current){
        const prev=_lastTodayRef.current;
        _lastTodayRef.current=t;
        setHkDate(d=>d===prev?t:d);
      }
    },60000);
    return ()=>clearInterval(id);
  },[]);

  // ─── Agent AI (poziom aplikacji): wykrywa propozycje zamian / prośby o pokój /
  // usterki / start-koniec pilnych pokoi. Bot (FAB) stale w HK, dymek w każdym oknie.
  // Ref hkData → klasyfikacja pilnych pokoi (wyjazdy) bez re-subskrypcji efektu.
  const hkDataRef = React.useRef({});
  const {
    suggestions: agentSuggestions, requests: agentRequests, notices: agentNotices,
    attention: agentAttention, dismissAttention: dismissAgentAttention,
    dismissSwap: dismissAgentSwap, dismissNotice: dismissAgentNotice,
  } = useHKAgent(hkDate, supabaseReady && started, hkDataRef);
  const [botOpenSignal, setBotOpenSignal] = useState(0);
  // Dymek bota łączy DWA źródła alarmu: zdarzenia HK (agentAttention z useHKAgent)
  // oraz przypomnienia o zadaniach recepcji z godziną (niżej). Najnowszy wygrywa —
  // dzięki temu np. „pora na raport dobowy" wyskoczy dymkiem nawet poza widokiem HK.
  const [botAttention, setBotAttention] = useState(null);
  React.useEffect(() => { if (agentAttention) setBotAttention(agentAttention); }, [agentAttention]);
  const goToAgentMonitor = React.useCallback(() => {
    setShowAdminPanel(false);
    setWorkerTab("hk");
    dismissAgentAttention();
    setBotAttention(null);
    setBotOpenSignal(s => s + 1);
    // pozwól zamontować HKPanel/HKLivePanel zanim wyemitujemy event
    setTimeout(() => window.dispatchEvent(new CustomEvent("cc-agent-focus")), 60);
  }, [dismissAgentAttention]);
  React.useEffect(() => {
    const api = window.electronAPI;
    if (!api?.onAgentNavigate) return;
    const off = api.onAgentNavigate(() => goToAgentMonitor());
    return () => { if (typeof off === "function") off(); else api.removeAgentNavigate?.(); };
  }, [goToAgentMonitor]);

  const [hkStaff,setHkStaff]=useState(()=>{
    localStorage.removeItem("hk-staff");
    return [];
  });
  const [hkData,setHkData]=useState(()=>{
    // Ładuj dane dla dzisiejszego dnia (per-date persistence)
    const todayStr=todayKey();
    const todayData=loadJson(`hk-data-${todayStr}`,null);
    if(todayData){return todayData;}
    // Fallback: stary klucz — zachowaj tylko typy pokoi
    const saved=loadJson("hk-data",{});
    const preserved={};
    Object.entries(saved).forEach(([no,rd])=>{
      if(rd.roomType||rd.br||rd.zs)preserved[no]={roomType:rd.roomType||undefined,br:rd.br||undefined,zs:rd.zs||undefined};
    });
    return preserved;
  });
  // Świeży hkData dla agenta (klasyfikacja pilnych pokoi — wyjazdy W/WP).
  useEffect(()=>{hkDataRef.current=hkData;},[hkData]);
  // Sync hkData → Supabase hk_plan so the web live panel can load assignments
  useEffect(()=>{
    const buildPlanPayload=(date,data)=>{
      if(!data||!date||Object.keys(data).length===0)return null;
      const rt={};
      HK_ALL.forEach(r=>{rt[r.no]=data[r.no]?.roomType||r.type;});
      const asgn={};const pmAsgn={};const pmRt={};const plannedRooms=[];
      Object.entries(data).forEach(([no,rd])=>{
        const needsClean=rd.status==="W"||rd.status==="WP"||rd.status==="PG"||rd.status==="PGZ"||rd.br||rd.zs;
        if(needsClean){
          pmRt[no]=rd.status==="W"?"W":rd.status==="WP"?"WP":rd.status==="PG"?"PG":rd.status==="PGZ"?"PGZ":rd.br?"BR":"ZS";
          // Zasiej KAŻDY pokój do sprzątania (nawet bez przypisanej osoby), by monitor
          // pokazywał pełen plan z maila, nie tylko pokoje dotknięte przez HK.
          plannedRooms.push({date,room:no,worker:rd.person||null,status:"W"});
        }
        if(!rd.person)return;
        if(rd.status==="W"||rd.status==="WP"){
          if(!asgn[rd.person])asgn[rd.person]=[];
          asgn[rd.person].push(no);
        }else if(rd.status==="PG"||rd.status==="PGZ"||rd.br||rd.zs){
          if(!pmAsgn[rd.person])pmAsgn[rd.person]=[];
          pmAsgn[rd.person].push(no);
        }
      });
      if(!Object.keys(asgn).length&&!Object.keys(pmAsgn).length&&!Object.keys(pmRt).length&&!plannedRooms.length)return null;
      return {
        date,assignments:asgn,pm_assignments:pmAsgn,
        room_types:rt,pm_room_types:pmRt,updated_at:new Date().toISOString(),plannedRooms
      };
    };
    const syncPayload=async payload=>{
      if(!payload)return;
      const {plannedRooms,...planRow}=payload;
      // NIE nadpisuj istniejących przypisań pustką. Gdy renderer nie ma osób
      // (np. plan z maila bez przydziału recepcji), wycinamy assignments/
      // pm_assignments z body — PostgREST (merge-duplicates) zaktualizuje tylko
      // obecne kolumny, więc ręczny przydział w hk_plan przetrwa. Inaczej każdy
      // sync bez osób zerował plan i telefony pokazywały „brak pokoi".
      if(!Object.keys(planRow.assignments||{}).length)delete planRow.assignments;
      if(!Object.keys(planRow.pm_assignments||{}).length)delete planRow.pm_assignments;
      // Zachowaj ręczny typ apartamentu (np. 2xDBL) zamiast generycznego "APT".
      planRow.room_types=await preserveAptRoomTypes(planRow.date,planRow.room_types);
      supabase.from("hk_plan").upsert(planRow,{onConflict:"date"})
        .then(({error})=>{if(error){console.error("[hk-sync] hk_plan upsert:",error.message);showToast("Błąd zapisu planu HK do bazy (sprawdź połączenie/klucz)","error");}});
      if(plannedRooms&&plannedRooms.length){
        // Nowe pokoje: wstaw bez nadpisywania statusu (ignoreDuplicates).
        supabase.from("hk_rooms").upsert(plannedRooms,{onConflict:"date,room",ignoreDuplicates:true})
          .then(({error})=>{if(error)console.error("[hk-sync] hk_rooms upsert:",error.message);});
        // Ręczna zmiana przydziału w planie: skoryguj kolumnę worker na ISTNIEJĄCYCH
        // pokojach (ignoreDuplicates jej nie rusza), zachowując status/vacated. Dzięki
        // temu ręczne przenoszenie działa tak samo jak agent — telefony i monitor
        // przypisują pokój właściwej osobie. Tylko aktywny dzień (telefony pokazują
        // dziś; przyszłe dni dostają poprawny worker już przy wstawianiu).
        if(planRow.date===hkDate){
          const byWorker={};
          plannedRooms.forEach(r=>{if(r.worker){(byWorker[r.worker]=byWorker[r.worker]||[]).push(r.room);}});
          Object.entries(byWorker).forEach(([worker,rms])=>{
            supabase.from("hk_rooms").update({worker}).eq("date",planRow.date).in("room",rms);
          });
        }
      }
    };
    syncPayload(buildPlanPayload(hkDate,hkData));
    const api=window.electronAPI;
    const loadDiskPlanData=async(date)=>{
      if(!api?.hkAutomationGetPlan)return null;
      try{
        const res=await api.hkAutomationGetPlan(date);
        if(res?.ok&&res.plan?.data&&typeof res.plan.data==="object")return res.plan.data;
      }catch{}
      return null;
    };
    (async()=>{
      try{
        const start=new Date();start.setHours(12,0,0,0);
        for(let i=0;i<14;i++){
          const d=new Date(start.getTime()+i*86400000);
          const date=d.toISOString().split("T")[0];
          if(date===hkDate)continue;
          const saved=loadJson(`reception-hk-plan-${date}`,null);
          let data=saved&&typeof saved==="object"&&!Array.isArray(saved)&&saved.data&&typeof saved.data==="object"?saved.data:loadJson(`hk-data-${date}`,null);
          if(!data||Object.keys(data).length===0){
            const diskData=await loadDiskPlanData(date);
            if(diskData)data=diskData;
          }
          syncPayload(buildPlanPayload(date,data));
        }
      }catch{}
    })();
  },[hkData,hkDate]);

  // ─── Wspólny stan dnia (hk_state) — synchronizacja DWUKIERUNKOWA z innymi
  // urządzeniami (koordynator / kierownik HK). Recepcja jest właścicielem klucza
  // "rooms" (opisy pokoi np. „2xDBL", osoba, status), pozostali — "roster"
  // (osoby, zmiana/grafik, obecność). Patch jest mergowany płytko po stronie bazy
  // (migracja 0032), więc nikt nie kasuje cudzego klucza. Patrz lib/hkState.js.
  const hkStateRevRef=React.useRef(0);            // ostatnia zastosowana wersja (rev)
  const suppressRoomsPushRef=React.useRef(false); // właśnie zastosowaliśmy stan zdalny — nie odsyłaj go z powrotem
  // PUSH: lokalna zmiana planu pokoi → wspólny stan (debounce, by nie zalewać bazy).
  useEffect(()=>{
    if(!supabaseReady||!started||!hkDate)return;
    if(suppressRoomsPushRef.current){suppressRoomsPushRef.current=false;return;} // to była zmiana zdalna
    const t=setTimeout(()=>{
      pushHkState(hkDate,{rooms:hkData||{}},"reception")
        .then(row=>{if(row&&typeof row.rev==="number")hkStateRevRef.current=Math.max(hkStateRevRef.current,row.rev);});
    },800);
    return ()=>clearTimeout(t);
  },[hkData,hkDate,started,supabaseReady]);
  // SUBSCRIBE: zmiana z innego urządzenia → zastosuj u nas + DYMEK BOTA (tylko bot
  // informuje recepcję o zmianach, żeby nie poprawiali ich ręcznie).
  useEffect(()=>{
    if(!supabaseReady||!started||!hkDate)return;
    let stop=false;
    const me=hkStateDeviceId();
    const whoLabel=by=>by==="coordinator"?"koordynator":by==="hk_manager"?"kierownik HK":"inne urządzenie";
    const apply=row=>{
      if(!row||stop)return;
      if(row.updated_device===me){hkStateRevRef.current=Math.max(hkStateRevRef.current,row.rev||0);return;} // własne echo
      if(typeof row.rev==="number"&&row.rev<=hkStateRevRef.current)return;                                  // starsze/zastosowane
      hkStateRevRef.current=row.rev||hkStateRevRef.current;
      const d=row.data||{};const who=whoLabel(row.updated_by);
      if(d.rooms&&typeof d.rooms==="object"&&JSON.stringify(d.rooms)!==JSON.stringify(hkDataRef.current||{})){
        suppressRoomsPushRef.current=true;
        setHkData(d.rooms);
        setBotAttention({kind:"info",text:`🔄 Plan pokoi zmieniony (${who}) — zaktualizowano automatycznie, nie poprawiaj ręcznie`});
        if(window.electronAPI?.notify)window.electronAPI.notify({title:"🔄 Aktualizacja planu HK",body:`Plan pokoi zmieniony (${who})`,nav:"hk-monitor"});
      }
      if(Array.isArray(d.roster)){
        setHkStaff(d.roster.filter(r=>r&&r.name).map(r=>({name:r.name})));
        setBotAttention({kind:"info",text:`🔄 Obsada/grafik zaktualizowane (${who})`});
      }
    };
    // Seed rev z bieżącego wiersza (realtime nie wysyła stanu startowego). Lokalny
    // hkData recepcji pozostaje źródłem prawdy przy starcie — nie nadpisujemy go.
    fetchHkState(hkDate).then(row=>{if(!stop&&row)hkStateRevRef.current=Math.max(hkStateRevRef.current,row.rev||0);});
    const unsub=subscribeHkState(hkDate,apply);
    return ()=>{stop=true;unsub();};
  },[hkDate,started,supabaseReady]);

  // ─── Grafik — odbiór zmian z panelu / innych urządzeń (realtime + seed). ───
  // Scalamy per-komórka, ignorujemy własne echo (updated_device) i starsze rev.
  useEffect(()=>{
    if(!supabaseReady)return;
    let stop=false;
    const me=hkStateDeviceId();
    const applySched=row=>{
      if(!row||stop)return;
      if(row.updated_device===me){schedRevRef.current=Math.max(schedRevRef.current,row.rev||0);return;} // własne echo
      if(typeof row.rev==="number"&&row.rev<=schedRevRef.current)return;                                 // starsze/zastosowane
      schedRevRef.current=row.rev||schedRevRef.current;
      const incoming=row.data;
      if(!incoming||typeof incoming!=="object")return;
      // Scal dzień→pracownik do lokalnego grafiku (mirror wygrywa per komórka).
      let changed=false;
      const next={...(scheduleRef.current||{})};
      for(const dk of Object.keys(incoming)){
        const inDay=incoming[dk]; if(!inDay||typeof inDay!=="object")continue;
        const merged={...(next[dk]||{}),...inDay};
        if(JSON.stringify(merged)!==JSON.stringify(next[dk]||{})){next[dk]=merged;changed=true;}
      }
      if(!changed)return;
      suppressSchedulePushRef.current=true; // to zmiana zdalna — nie odsyłaj jej z powrotem
      setSchedule(next);
      setBotAttention({kind:"info",text:"🔄 Grafik zaktualizowany (panel) — zaktualizowano automatycznie"});
    };
    // Seed: pobierz bieżący dokument grafiku i scal (mirror-cells wygrywają).
    fetchSchedule().then(row=>{if(!stop&&row)applySched(row);});
    const unsub=subscribeSchedule(applySched);
    return ()=>{stop=true;unsub();};
  },[supabaseReady]);

  // Periodyczny sync planów z dysku do Supabase (co 5 min) — żeby raporty
  // IMAP przychodzące w trakcie działania aplikacji trafiały do hk_plan
  // bez wymogu restartu lub interakcji z HK panel.
  useEffect(()=>{
    const api=window.electronAPI;
    if(!api?.hkAutomationGetPlan)return;
    const HK_ALL_LOCAL=HK_ALL;
    const buildPayload=(date,data)=>{
      if(!data||!date||Object.keys(data).length===0)return null;
      const rt={};
      HK_ALL_LOCAL.forEach(r=>{rt[r.no]=data[r.no]?.roomType||r.type;});
      const asgn={};const pmAsgn={};const pmRt={};const plannedRooms=[];
      Object.entries(data).forEach(([no,rd])=>{
        const needsClean=rd.status==="W"||rd.status==="WP"||rd.status==="PG"||rd.status==="PGZ"||rd.br||rd.zs;
        if(needsClean){
          pmRt[no]=rd.status==="W"?"W":rd.status==="WP"?"WP":rd.status==="PG"?"PG":rd.status==="PGZ"?"PGZ":rd.br?"BR":"ZS";
          plannedRooms.push({date,room:no,worker:rd.person||null,status:"W"});
        }
        if(!rd.person)return;
        if(rd.status==="W"||rd.status==="WP"){
          if(!asgn[rd.person])asgn[rd.person]=[];
          asgn[rd.person].push(no);
        }else if(rd.status==="PG"||rd.status==="PGZ"||rd.br||rd.zs){
          if(!pmAsgn[rd.person])pmAsgn[rd.person]=[];
          pmAsgn[rd.person].push(no);
        }
      });
      if(!Object.keys(asgn).length&&!Object.keys(pmAsgn).length&&!Object.keys(pmRt).length&&!plannedRooms.length)return null;
      return {date,assignments:asgn,pm_assignments:pmAsgn,room_types:rt,pm_room_types:pmRt,updated_at:new Date().toISOString(),plannedRooms};
    };
    const run=async()=>{
      try{
        const start=new Date();start.setHours(12,0,0,0);
        for(let i=0;i<14;i++){
          const d=new Date(start.getTime()+i*86400000);
          const date=d.toISOString().split("T")[0];
          // Preferuj recznie zapisane dane z localStorage (zmiany usera).
          // Dysk (raport KWHotel z maila) tylko jako fallback gdy brak lokalnych.
          const saved=loadJson(`reception-hk-plan-${date}`,null);
          let data=saved&&typeof saved==="object"&&!Array.isArray(saved)&&saved.data&&typeof saved.data==="object"?saved.data:loadJson(`hk-data-${date}`,null);
          if(!data||Object.keys(data).length===0){
            let res=null;
            try{res=await api.hkAutomationGetPlan(date);}catch{}
            data=res?.ok&&res.plan?.data&&typeof res.plan.data==="object"?res.plan.data:null;
          }
          if(!data)continue;
          const payload=buildPayload(date,data);
          if(payload){
            const {plannedRooms,...planRow}=payload;
            // jak w syncPayload: pusty przydział nie nadpisuje istniejącego planu
            if(!Object.keys(planRow.assignments||{}).length)delete planRow.assignments;
            if(!Object.keys(planRow.pm_assignments||{}).length)delete planRow.pm_assignments;
            // zachowaj ręczny typ apartamentu (2xDBL) zamiast generycznego "APT"
            planRow.room_types=await preserveAptRoomTypes(planRow.date,planRow.room_types);
            supabase.from("hk_plan").upsert(planRow,{onConflict:"date"})
              .then(({error})=>{if(error)console.error("[hk-sync 5min] hk_plan upsert:",error.message);});
            if(plannedRooms&&plannedRooms.length)supabase.from("hk_rooms").upsert(plannedRooms,{onConflict:"date,room",ignoreDuplicates:true});
          }
        }
      }catch{}
    };
    const id=setInterval(run,5*60*1000);
    return()=>clearInterval(id);
  },[]);

  const { soundEnabled, setSoundEnabled }=useSound();
  const [lockedScreen,setLockedScreen]=useState(false);
  const lockTimerRef=useRef(null);
  const LOCK_TIMEOUT=15*60*1000;
  const [newTaskUrgent,setNewTaskUrgent]=useState(false);

  // ── Auto-updater state ────────────────────────────────────────────────────────
  const [newTaskWeekdaysOnly,setNewTaskWeekdaysOnly]=useState(false);

  // ── Tryb testowy — przesunięcie daty ─────────────────────────────────────────
  const [testDateOffset,setTestDateOffset]=useState(0); // 0 = dziś, -1 = wczoraj, -2 = przedwczoraj
  const getTestDate=(base=new Date())=>{
    if(!IS_DEV_TEST||testDateOffset===0)return base;
    const d=new Date(base);d.setDate(d.getDate()+testDateOffset);return d;
  };
  // ── Stała kasowa ──────────────────────────────────────────────────────────────
  const STALA_KASOWA_KEY="reception-stala-kasowa";
  const KW_TOTAL_KEY="reception-kw-total";
  const [stalaKasowa,setStalaKasowa]=useState(()=>{const v=localStorage.getItem("reception-stala-kasowa");return v&&!isNaN(parseFloat(v))?parseFloat(v):500;});
  const [kwTotal,setKwTotal]=useState(()=>{const v=localStorage.getItem("reception-kw-total");return v&&!isNaN(parseFloat(v))?parseFloat(v):0;});
  const [stalaPotwierdzono,setStalaPotwierdzono]=useState(false);
  const [stalaNiezgodnosc,setStalaNiezgodnosc]=useState(false);
  const [showSafeDepositModal,setShowSafeDepositModal]=useState(false);
  const [safeDepositKW,setSafeDepositKW]=useState("");
  const [safeDepositAmount,setSafeDepositAmount]=useState("");
  const [postDepositKW,setPostDepositKW]=useState(""); // płatności gotówkowe PO wpłacie do sejfu
  // Domyślnie kwota do sejfu = przyrost KW (nie wpisuje się jej drugi raz). Override gdy true.
  const [safeDepositManual,setSafeDepositManual]=useState(false);
  const [showPostDeposit,setShowPostDeposit]=useState(false); // zwijana opcja „płatność po 24:00"
  // ── Strażnik sejfu + przypomnienie końca zmiany (agent) ─────────────────────
  // Wpłata do sejfu zarejestrowana w tej sesji (ustawiane w handleSafeDeposit).
  // Nocna/wieczorowa nie może opuścić zmiany dopóki to nie jest true.
  const [safeDepositRegistered,setSafeDepositRegistered]=useState(false);
  const [safeGuardOpen,setSafeGuardOpen]=useState(false);
  const [shiftEndReminderOpen,setShiftEndReminderOpen]=useState(false);
  const [shiftEndReminderText,setShiftEndReminderText]=useState("");
  const [shiftEndFacts,setShiftEndFacts]=useState(null);
  const shiftEndFiredRef=useRef(false);
  const [stalaDiscrepancyInput,setStalaDiscrepancyInput]=useState("");
  const [showStalaDiscrepancyForm,setShowStalaDiscrepancyForm]=useState(false);
  const [showSuccessAnim,setShowSuccessAnim]=useState(false);
  const [cashVisible,setCashVisible]=useState(true);
  const [managerNewStala,setManagerNewStala]=useState("");

  useEffect(()=>{localStorage.setItem("hk-staff",JSON.stringify(hkStaff));},[hkStaff]);
  useEffect(()=>{
    localStorage.setItem("hk-data",JSON.stringify(hkData));
    saveJson(`hk-data-${hkDate}`,hkData);
  },[hkData,hkDate]);
  useEffect(()=>{localStorage.setItem(STORAGE_KEYS.messages,JSON.stringify(messages));},[messages]);
  useEffect(()=>{setUnreadMsgCount(messages.filter(m=>!m.readByAdmin).length);},[messages]);

  const showToast=useCallback((msg,type="info",duration=4500)=>{
    const id=crypto.randomUUID();setToasts(prev=>[...prev,{id,msg,type}]);
    if(duration>0)setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==id)),duration);
  },[]);
  const dismissToast=useCallback((id)=>setToasts(prev=>prev.filter(t=>t.id!==id)),[]);
  // Auto-updater Electrona — wydzielony do hooka (Faza 0).
  const { updateInfo, updateState, updateProgress, updateNoticeDismissed, setUpdateNoticeDismissed, checkForUpdates }=useAutoUpdate(showToast);
  const askConfirm=useCallback((message,onConfirm)=>setConfirmDialog({message,onConfirm}),[]);
  const askPrompt=useCallback((message,onSubmit,opts={})=>setPromptDialog({message,onSubmit,...opts}),[]);

  // ─── Agent: Zastosuj/Odrzuć z globalnego bota (logika lustrzana do HKLivePanel).
  // Przydziały poranne wyliczamy z hkData (źródło prawdy desktopu); fallback: hk_plan.
  const applyAgentSwap=useCallback(async(s)=>{
    if(!supabase)return;
    const date=hkDate;
    let assignments={};
    Object.entries(hkDataRef.current||{}).forEach(([no,rd])=>{
      if(!rd?.person)return;
      if(rd.status==="PG"||rd.status==="PGZ"||rd.br||rd.zs)return;
      (assignments[rd.person]=assignments[rd.person]||[]).push(no);
    });
    if(Object.keys(assignments).length===0){
      const{data:plan}=await supabase.from("hk_plan").select("assignments").eq("date",date).maybeSingle();
      assignments={...(plan?.assignments||{})};
    }
    const fromRooms=(assignments[s.from]||[]).filter(r=>!s.rooms.includes(r));
    const toRooms=[...new Set([...(assignments[s.to]||[]),...s.rooms])];
    const newAssignments={...assignments,[s.from]:fromRooms,[s.to]:toRooms};
    const{error}=await supabase.from("hk_plan")
      .update({assignments:newAssignments,updated_at:new Date().toISOString()}).eq("date",date);
    if(error){showToast("Błąd zamiany: "+error.message,"error");return;}
    await Promise.all(s.rooms.map(no=>
      supabase.from("hk_rooms").upsert({date,room:no,worker:s.to,status:"W"},{onConflict:"date,room"})));
    await supabase.from("hk_logs").insert({
      date,log_time:new Date().toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"}),
      worker:employeeName||"Recepcja",action:"reassign",room:null,extra:`${s.from}→${s.to}: ${s.rooms.join(", ")}`,
    });
    setHkData(prev=>{
      if(!prev||Object.keys(prev).length===0)return prev;
      const next={...prev};
      s.rooms.forEach(no=>{if(next[no])next[no]={...next[no],person:s.to};});
      return next;
    });
    dismissAgentSwap(s);
    showToast(`Przeniesiono ${s.rooms.length} pok.: ${s.from} → ${s.to}`,"success");
  },[hkDate,employeeName,showToast,dismissAgentSwap]);
  const applyAgentRequest=useCallback(async({log,suggestion})=>{
    if(suggestion)await applyAgentSwap(suggestion);
    markRequestHandled(hkDate,log.id);
  },[applyAgentSwap,hkDate]);
  const dismissAgentRequest=useCallback(({log})=>{markRequestHandled(hkDate,log.id);},[hkDate]);

  // Keyboard shortcuts + lock timer
  // Plain digits 1-9 mapują na sidebar items (workerSidebar nav), zgodnie z kbd labels.
  useEffect(()=>{
    const SIDEBAR_KEYS={
      "1":"zmiana", "2":"przekazanie", "3":"informacje",
      "4":"hk",     "5":"usterki",
      "6":"parking","7":"goscie","8":"vouchery","9":"opinie",
    };
    const h=(e)=>{
      const tag=e.target.tagName;
      const typing=tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";
      if(e.key==="Escape"){setShowSearch(false);setShowWiki(false);return;}
      if((e.ctrlKey||e.metaKey)&&e.key==="k"){e.preventDefault();setShowSearch(v=>!v);return;}
      if((e.ctrlKey||e.metaKey)&&e.key==="w"){e.preventDefault();setShowWiki(v=>!v);return;}
      if(!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!showAdminPanel){
        const target=SIDEBAR_KEYS[e.key];
        if(target){
          // 'przekazanie' wymaga aktywnej zmiany — zachowanie zgodne z sidebar disabled state
          if(target==="przekazanie"&&!started)return;
          setWorkerTab(target);
        }
      }
    };
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[showAdminPanel,started]);

  // Inactivity lock — 15 min (tylko gdy zmiana jest aktywna)
  useEffect(()=>{
    if(!started){
      if(lockTimerRef.current)clearTimeout(lockTimerRef.current);
      setLockedScreen(false);
      return;
    }
    const reset=()=>{
      if(lockTimerRef.current)clearTimeout(lockTimerRef.current);
      lockTimerRef.current=setTimeout(()=>setLockedScreen(true),LOCK_TIMEOUT);
    };
    const evs=["mousemove","keydown","mousedown","touchstart"];
    evs.forEach(e=>window.addEventListener(e,reset,{passive:true}));
    reset();
    return()=>{evs.forEach(e=>window.removeEventListener(e,reset));if(lockTimerRef.current)clearTimeout(lockTimerRef.current);};
  },[started]);

  // Load from storage
  useEffect(()=>{
    const loadedTasks=loadJson(STORAGE_KEYS.tasks,defaultTasks);
    setTasks(Object.fromEntries(Object.entries(loadedTasks).map(([shift,shiftTasks])=>[shift,(shiftTasks||[]).map((task,i)=>normTask(task,`${shift}-${i}`))])));
    setExtraTasksLog(loadJson(STORAGE_KEYS.extra,[]));
    setCarryOverTasks(loadJson(STORAGE_KEYS.carry,emptyCarryOver));
    const loadedWiki=loadJson(STORAGE_KEYS.wiki,null)||getDefaultWikiEntries();
    setWikiEntries(loadedWiki);setSelectedWikiId(loadedWiki[0]?.id||null);
    setAdminActivityLog(loadJson(STORAGE_KEYS.adminLog,[]));
    setEmployeeActivityLog(loadJson(STORAGE_KEYS.employeeLog,[]));
    // Backfill brakujących/duplikujących się id — stare wpisy bez id powodowały,
    // że usunięcie jednego (id=undefined) kasowało WSZYSTKIE bez id naraz.
    (()=>{const raw=loadJson(STORAGE_KEYS.datedReminders,[]);const seen=new Set();let changed=false;
      const fixed=raw.map(r=>{if(!r.id||seen.has(r.id)){changed=true;const id=crypto.randomUUID();seen.add(id);return{...r,id};}seen.add(r.id);return r;});
      setDatedReminders(fixed);if(changed)saveJson(STORAGE_KEYS.datedReminders,fixed);})();
    // Admin session intentionally NOT restored on restart — must log in each time
    localStorage.removeItem(STORAGE_KEYS.adminSession);
    localStorage.removeItem(STORAGE_KEYS.adminUser);
    setEmployees(loadJson("reception-final-employees",defaultEmployees));
    // Seed przykladowych alertow i przypomnien przy pierwszym uruchomieniu (demo)
    if(!localStorage.getItem(STORAGE_KEYS.managerAlerts)){
      const seedAlerts=[{
        id:crypto.randomUUID(),
        title:"Witaj w Conrad Comfort!",
        body:"System przypomnień został wprowadzony. Kierownik może dodawać tu ważne informacje dla całego zespołu. Nowe alerty pojawią się automatycznie przy rozpoczęciu zmiany.",
        priority:"normal",
        created_by:"System",
        created_at:new Date().toISOString(),
        expires_at:null,
        pinned:true,
        target_shift:null,
      }];
      saveJson(STORAGE_KEYS.managerAlerts,seedAlerts);
    }
    if(!localStorage.getItem(STORAGE_KEYS.standingReminders)){
      const seedReminders=[
        {id:crypto.randomUUID(),title:"Check-in",body:"Zawsze potwierdzaj numer rejestracyjny pojazdu gościa przy zameldowaniu.",category:"check-in",created_by:"System",created_at:new Date().toISOString(),active:true},
        {id:crypto.randomUUID(),title:"Kasa",body:"Stan kasy potwierdzamy na początku KAŻDEJ zmiany. Niezgodności zgłaszamy od razu kierownikowi.",category:"finanse",created_by:"System",created_at:new Date().toISOString(),active:true},
      ];
      saveJson(STORAGE_KEYS.standingReminders,seedReminders);
    }
  },[]);

  // Supabase sync: alerts + reminders → update localStorage cache for pre-shift modal
  useEffect(()=>{
    if(!supabase)return;
    const sync=async()=>{
      const [ar,rr]=await Promise.all([
        supabase.from("manager_alerts").select("*").eq("tenant_id",TENANT_ID).order("created_at",{ascending:false}),
        supabase.from("standing_reminders").select("*").eq("tenant_id",TENANT_ID).order("created_at",{ascending:false}),
      ]);
      if(ar.data)saveJson(STORAGE_KEYS.managerAlerts,ar.data);
      if(rr.data)saveJson(STORAGE_KEYS.standingReminders,rr.data);
      setInboxVersion(v=>v+1);   // odśwież licznik Pilnych i listę zadań w zakładce „Zadania"
    };
    sync();
    // Nowe zadanie z panelu (INSERT) → bot recepcji ogłasza je proaktywnie: dymek + toast +
    // powiadomienie Windows (gdy okno nieaktywne). UPDATE/DELETE (np. „zrobione") nie alarmują.
    // Realtime odpala się tylko na realnych zmianach po subskrypcji, więc nie alarmuje istniejących.
    const onAlert=(p)=>{
      sync();
      if(p?.eventType!=="INSERT"||!p.new)return;
      const a=p.new;
      const who=a.created_by||"Kierownik";
      const dateTxt=a.target_date&&a.target_date!==todayKey()?` · ${a.target_date}`:"";
      const shiftTxt=(a.target_shift?` · ${SHIFT_SHORT_LABELS[a.target_shift]||a.target_shift}`:" · wszystkie zmiany")+dateTxt;
      const text=`📋 Nowe zadanie od ${who}${shiftTxt}: ${a.title||""}`;
      setBotAttention({kind:"task",text});
      showToast(text,a.priority==="high"?"warning":"info",7000);
      if((document.visibilityState!=="visible"||!document.hasFocus())&&window.electronAPI?.notify)
        window.electronAPI.notify({title:"📋 Nowe zadanie z panelu",body:`${a.title||""}${shiftTxt}`});
    };
    const ch=supabase.channel("app-alerts-sync")
      .on("postgres_changes",{event:"*",schema:"public",table:"manager_alerts",filter:`tenant_id=eq.${TENANT_ID}`},onAlert)
      .on("postgres_changes",{event:"*",schema:"public",table:"standing_reminders",filter:`tenant_id=eq.${TENANT_ID}`},sync)
      .subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[]);

  // Supabase sync: Wiki recepcji ⇄ baza (tabela wiki_entries, migracja 0040). Menedżer z panelu
  // (Tablica → „Wpis do Wiki") dopisuje wprost do Wiki, recepcja widzi wpisy NA ŻYWO. updatedAt
  // mapujemy do formatu lokalnego (fmt = toLocaleString pl-PL), żeby licznik „nowości w Wiki" działał.
  // Bootstrap: jeśli baza jest pusta, wypychamy bieżące lokalne wpisy (nie tracimy seedów/treści).
  useEffect(()=>{
    if(!supabase)return;
    const dbToWiki=(r)=>({id:r.id,topic:r.topic||"",content:r.content||"",images:Array.isArray(r.images)?r.images:[],updatedAt:r.updated_at?new Date(r.updated_at).toLocaleString("pl-PL"):""});
    const sync=async()=>{
      const {data}=await supabase.from("wiki_entries").select("*").eq("tenant_id",TENANT_ID).order("updated_at",{ascending:false});
      if(!data)return;
      if(data.length){
        const mapped=data.map(dbToWiki);
        saveJson(STORAGE_KEYS.wiki,mapped);
        setWikiEntries(mapped);
        setSelectedWikiId(prev=>mapped.some(e=>e.id===prev)?prev:(mapped[0]?.id||null));
        setInboxVersion(v=>v+1);   // odśwież licznik „nowości w Wiki" w Informacjach
      }else{
        const local=loadJson(STORAGE_KEYS.wiki,null);
        if(local&&local.length){
          await supabase.from("wiki_entries").upsert(local.map(e=>({
            id:e.id,tenant_id:TENANT_ID,topic:e.topic,content:e.content||"",
            images:e.images||[],updated_at:new Date().toISOString(),
          })));
        }
      }
    };
    sync();
    const ch=supabase.channel("app-wiki-sync")
      .on("postgres_changes",{event:"*",schema:"public",table:"wiki_entries",filter:`tenant_id=eq.${TENANT_ID}`},sync)
      .subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[]);

  // Wersja skrzynki — bumpowana przy każdej zmianie alertów/zadań/wiki, żeby useMemo
  // niżej (managerTasksForShift, inboxCount) przeliczały się na żywo. MUSI być
  // zadeklarowana przed pierwszym użyciem w tablicy zależności (inaczej TDZ przy renderze).
  const [inboxVersion,setInboxVersion]=useState(0);

  // Computed values
  const currentTasks=useMemo(()=>{
    if(!selectedShift)return[];
    const dayOfWeek=new Date().getDay();
    const isWeekend=dayOfWeek===0||dayOfWeek===6;
    const tasks_=( tasks[selectedShift]||[])
      .map((task,i)=>normTask(task,`${selectedShift}-${i}`))
      .filter(task=>!(task.weekdaysOnly&&isWeekend));
    // Sort: urgent+time → urgent no time → normal+time → normal no time
    return tasks_.sort((a,b)=>{
      const scoreA=(a.urgent?0:2)+(a.scheduledTime?0:1);
      const scoreB=(b.urgent?0:2)+(b.scheduledTime?0:1);
      if(scoreA!==scoreB)return scoreA-scoreB;
      // Within same group sort by time
      if(a.scheduledTime&&b.scheduledTime)return a.scheduledTime.localeCompare(b.scheduledTime);
      return 0;
    });
  },[selectedShift,tasks]);
  const carryOverForCurrentShift=useMemo(()=>(selectedShift?carryOverTasks[selectedShift]||[]:[]),[selectedShift,carryOverTasks]);
  // Zadania przekazane z panelu menedżera (manager_alerts, kind='task') na bieżącą zmianę/dzień — zakładka „Zadania".
  const managerTasksForShift=useMemo(()=>{
    if(!selectedShift)return[];
    const dk=currentSessionDate||todayKey();
    const nowMs=Date.now();
    return loadJson(STORAGE_KEYS.managerAlerts,[]).filter(a=>
      a.kind==="task"&&!a.done&&
      (!a.expires_at||new Date(a.expires_at).getTime()>nowMs)&&
      (!a.target_shift||a.target_shift===selectedShift)&&
      (!a.target_date||a.target_date===dk)
    ).sort((a,b)=>(b.priority==="high"?1:0)-(a.priority==="high"?1:0)||new Date(b.created_at)-new Date(a.created_at));
  },[selectedShift,currentSessionDate,inboxVersion]);
  const filteredExtraTasks=useMemo(()=>extraTasksLog.filter(item=>item.shift===selectedShift&&item.employee===employeeName&&item.sessionDate===currentSessionDate),[extraTasksLog,selectedShift,employeeName,currentSessionDate]);
  const filteredWikiEntries=useMemo(()=>{const q=wikiSearch.trim().toLowerCase();return q?wikiEntries.filter(e=>e.topic.toLowerCase().includes(q)||e.content.toLowerCase().includes(q)):wikiEntries;},[wikiEntries,wikiSearch]);
  const selectedWikiEntry=useMemo(()=>filteredWikiEntries.find(e=>e.id===selectedWikiId)||filteredWikiEntries[0]||null,[filteredWikiEntries,selectedWikiId]);
  const completedCount=Object.values(completed).filter(Boolean).length;
  const completedCarryOverCount=carryOverForCurrentShift.filter(t=>t.done).length;
  const totalMandatory=currentTasks.length+carryOverForCurrentShift.length;
  const totalDone=completedCount+completedCarryOverCount;
  const progress=totalMandatory?Math.round((totalDone/totalMandatory)*100):0;
  const missingBaseTasks=currentTasks.map((task,index)=>({task,index})).filter(({index})=>!completed[index]);
  const missingCarryOverTasks=carryOverForCurrentShift.filter(t=>!t.done);
  const canFinishShift=cashClosingDocumentsAmount.trim();

  // Kasa: sejf po zmianie = start + KW (nowe wpływy z dokumentów)
  const cashDiff=useMemo(()=>{
    // cashDiff = stała kasowa + przyrost KW tej zmiany (KW wpisane - KW poprzednie)
    if(!cashClosingDocumentsAmount.trim())return null;
    const kwNew=parseFloat(cashClosingDocumentsAmount)||0;
    if(kwNew===0)return null; // gdy KW=0 nie pokazuj stałej kasowej żeby uniknąć mylącego "+500"
    const kwPrev=kwTotal; // zapisane KW z poprzedniej zmiany (reset po nocnej/wieczorowej)
    const kwIncrement=Math.max(0,kwNew-kwPrev); // przyrost KW tej zmiany
    return stalaKasowa+kwIncrement;
  },[cashClosingDocumentsAmount,stalaKasowa,kwTotal]);

  // Kwota w sejfie dla następnej zmiany (zapisywana do localStorage)
  const SAFE_KEY="reception-safe-amount";

  // Live stan kasy → panel menedżerski: kasetka = stała kasowa (KPI recepcji),
  // plus aktualny sejf i suma KW. Ten sam wzorzec co inne mirrory (employees itd.).
  useEffect(()=>{pushMirror("cash_state",{kasetka:stalaKasowa,safe:parseFloat(localStorage.getItem(SAFE_KEY))||stalaKasowa,kwTotal,updatedAt:new Date().toISOString()});},[stalaKasowa,kwTotal]);

  // ── Agent: przypomnienie przed końcem zmiany (60 min sejf / 15 min reszta) ──
  // Liczby/decyzje deterministyczne (tu), LLM tylko redaguje zdanie i degraduje
  // się do tekstu sztywnego. Nocna/wieczorowa = wymagana wpłata do sejfu.
  const requiresSafeDeposit=selectedShift==="nocna"||selectedShift==="wieczorowa";
  const buildShiftEndFacts=useCallback((minutesLeft)=>({
    shiftLabel:SHIFT_LABELS_PL[selectedShift]||selectedShift,
    minutesLeft,
    cashChecked:!!cashClosingDocumentsAmount.trim(),
    safeRequired:requiresSafeDeposit,
    safeDone:safeDepositRegistered,
    tasksDone:currentTasks.filter((_,i)=>completed[i]).length,
    tasksTotal:currentTasks.length,
    missing:missingBaseTasks.map(m=>m.task.text),
  }),[selectedShift,cashClosingDocumentsAmount,requiresSafeDeposit,safeDepositRegistered,currentTasks,completed,missingBaseTasks]);
  const fallbackShiftEndText=(f)=>{
    const parts=[`Za ~${f.minutesLeft} min koniec zmiany.`];
    parts.push(f.cashChecked?"Stan kasy sprawdzony.":"Sprawdź stan kasy (wpisz KW końcową).");
    if(f.safeRequired&&!f.safeDone)parts.push("Pamiętaj o zarejestrowaniu wpłaty do sejfu PRZED zakończeniem zmiany.");
    parts.push(`Zaznaczone zadania: ${f.tasksDone}/${f.tasksTotal}.`);
    return parts.join(" ");
  };
  const fireShiftEndReminder=useCallback((minutesLeft)=>{
    const facts=buildShiftEndFacts(minutesLeft);
    setShiftEndFacts(facts);
    setShiftEndReminderText(fallbackShiftEndText(facts));
    setShiftEndReminderOpen(true);
    if(llmReady){
      nudgeShiftEnd(facts).then(t=>{if(t&&t.trim())setShiftEndReminderText(t.trim());}).catch(()=>{});
    }
  },[buildShiftEndFacts]);
  // Reset flagi „pokazano" przy zmianie sesji/zmiany.
  useEffect(()=>{shiftEndFiredRef.current=false;},[selectedShift,shiftStartTime]);
  useEffect(()=>{
    if(!started||!shiftStartTime||!selectedShift)return;
    const check=()=>{
      if(shiftEndFiredRef.current)return;
      const end=shiftEndDate(selectedShift,shiftStartTime);
      if(!end)return;
      const msLeft=end.getTime()-getNow().getTime();
      // Wyprzedzenie: 60 min dla zmian z wpłatą do sejfu (nocna/wieczorowa kończą
      // o 7:00 → okno wpada ~6:00, jest czas na wpłatę), 15 min dla pozostałych.
      // Dolna granica (-5 min) łapie przypadek uśpionego panelu.
      const leadMs=(requiresSafeDeposit?60:15)*60*1000;
      if(msLeft<=leadMs&&msLeft>-5*60*1000){
        shiftEndFiredRef.current=true;
        fireShiftEndReminder(Math.max(0,Math.round(msLeft/60000)));
      }
    };
    check();
    const iv=setInterval(check,30000);
    return()=>clearInterval(iv);
  },[started,shiftStartTime,selectedShift,requiresSafeDeposit,fireShiftEndReminder,getNow]);

  const overdueTasks=useMemo(()=>{
    if(!started||!shiftStartTime)return[];
    const now=new Date();const tk=todayKey(now);
    return currentTasks.filter((task,index)=>{
      if(!task.scheduledTime||completed[index])return false;
      if(dismissedReminderKeys.includes(`${tk}-${selectedShift}-${task.id}-${task.scheduledTime}`))return false;
      const[h,m]=task.scheduledTime.split(":").map(Number);
      const sd=new Date(now);sd.setHours(h||0,m||0,0,0);
      return now>=sd&&sd>=shiftStartTime;
    });
  },[started,shiftStartTime,currentTasks,completed,dismissedReminderKeys,selectedShift]);

  // Te same zaległe zadania z godziną podajemy też agentowi-botowi (prawy róg) jako
  // notices — by przypomnienie było widoczne w popoverze bota i dało się je odhaczyć
  // („OK" w bocie = ten sam klucz dismissedReminderKeys co „Zamknij" na karcie).
  // id koduje pełny klucz odrzucenia (po „task:"), żeby uniknąć parsowania „HH:MM".
  const taskReminderNotices=useMemo(()=>{
    const tk=todayKey();
    return overdueTasks.map(t=>{
      const dk=`${tk}-${selectedShift}-${t.id}-${t.scheduledTime}`;
      const[h,m]=String(t.scheduledTime).split(":").map(Number);
      const sd=new Date();sd.setHours(h||0,m||0,0,0);
      return{id:`task:${dk}`,kind:"task",ts:sd.toISOString(),
        text:`⏰ Pora na zadanie: ${t.text}${t.scheduledTime?` — zaplanowane na ${t.scheduledTime}`:""}`};
    });
  },[overdueTasks,selectedShift]);

  // Gdy nadejdzie pora NOWEGO zadania → dymek bota + powiadomienie Windows (gdy okno
  // nieaktywne). Seed na pierwszym przebiegu NIE alarmuje (zadania już zaległe przy
  // wejściu pokazuje sama karta), potem każdy świeży klucz odpala raz.
  const seenTaskRemRef=React.useRef(null);
  useEffect(()=>{
    if(!started){seenTaskRemRef.current=null;return;}
    const keys=new Set(taskReminderNotices.map(n=>n.id));
    if(seenTaskRemRef.current===null){seenTaskRemRef.current=keys;return;}
    const fresh=taskReminderNotices.find(n=>!seenTaskRemRef.current.has(n.id));
    seenTaskRemRef.current=new Set([...seenTaskRemRef.current,...keys]);
    if(fresh){
      setBotAttention({kind:"task",text:fresh.text});
      if((document.visibilityState!=="visible"||!document.hasFocus())&&window.electronAPI?.notify)
        window.electronAPI.notify({title:"⏰ Przypomnienie o zadaniu",body:fresh.text,nav:"hk-monitor"});
    }
  },[taskReminderNotices,started]);

  // Przypomnienia „zdarzeniowe" (kurier, dostawa, serwis…) — wymagają potwierdzenia
  // „czy było?”, a nie zwykłego zamknięcia. Wykrywane po treści.
  const CONFIRMABLE_RE=/kurier|przesy[łl]k|paczk|dostaw|odbi[oó]r|awizo|serwis|technik|monter|wizyt|dow[oó]z|listonosz|poczt/i;
  const isConfirmableReminder=useCallback((r)=>r?.entryType!=="task"&&CONFIRMABLE_RE.test(r?.text||""),[]);

  const todayDatedReminders=useMemo(()=>{
    if(!started||!selectedShift||!currentSessionDate)return[];
    return datedReminders.filter(r=>!r.confirmedAt&&!isConfirmableReminder(r)&&r.targetDate===currentSessionDate&&(!r.targetShift||r.targetShift===selectedShift)&&!dismissedReminderKeys.includes(`dated-${r.id}`));
  },[started,selectedShift,currentSessionDate,datedReminders,dismissedReminderKeys,isConfirmableReminder]);

  // Sprawy do potwierdzenia: na dziś LUB zaległe (przeszły termin bez odhaczenia),
  // niepotwierdzone, dla tej zmiany, pomijając te odłożone w ostatniej godzinie.
  const dueConfirmReminders=useMemo(()=>{
    if(!started||!selectedShift||!currentSessionDate)return[];
    void nowTick; // zależność czasu — wymusza ponowne sprawdzenie drzemek
    const now=Date.now();
    const floorKey=todayKey(new Date(Date.now()-14*24*60*60*1000)); // zaległe max 14 dni wstecz
    return datedReminders
      .filter(r=>isConfirmableReminder(r)&&!r.confirmedAt&&r.targetDate>=floorKey&&r.targetDate<=currentSessionDate&&(!r.targetShift||r.targetShift===selectedShift)&&!(snoozedConfirm[r.id]&&now-snoozedConfirm[r.id]<60*60*1000))
      .sort((a,b)=>(a.targetDate||"").localeCompare(b.targetDate||""));
  },[started,selectedShift,currentSessionDate,datedReminders,snoozedConfirm,nowTick,isConfirmableReminder]);

  // Licznik usterek (aktywne)
  const [faultsVersion,setFaultsVersion]=useState(0); // trigger re-count po zmianie
  const faultsCount=useMemo(()=>{
    const all=loadJson(STORAGE_KEYS.faults,[]);
    return all.filter(f=>f.status!=="done").length;
  },[faultsVersion]);
  // Nasluchuj zmian faults w innych kartach przez storage event
  useEffect(()=>{
    const onStorage=(e)=>{if(e.key===STORAGE_KEYS.faults)setFaultsVersion(v=>v+1);};
    window.addEventListener("storage",onStorage);
    const poll=setInterval(()=>setFaultsVersion(v=>v+1),3000);
    return ()=>{window.removeEventListener("storage",onStorage);clearInterval(poll);};
  },[]);

  // Licznik nieprzeczytanych wiadomosci czatu zespolowego (B5)
  const [chatTick,setChatTick]=useState(0);
  const chatUnread=useMemo(()=>{
    const msgs=loadJson("reception-team-messages",[]);
    const seen=loadJson("reception-team-lastseen",{});
    const me=employeeName||currentManager||"Recepcja";
    return msgs.filter(m=>{
      const ch=m.channel||"team";
      const since=seen[ch]?new Date(seen[ch]).getTime():0;
      return m.sender!==me && new Date(m.created_at).getTime()>since;
    }).length;
  },[chatTick,employeeName,currentManager,workerTab,adminTab]);
  useEffect(()=>{
    const onStorage=(e)=>{if(e.key==="reception-team-messages"||e.key==="reception-team-lastseen")setChatTick(t=>t+1);};
    window.addEventListener("storage",onStorage);
    const poll=setInterval(()=>setChatTick(t=>t+1),15000);
    return ()=>{window.removeEventListener("storage",onStorage);clearInterval(poll);};
  },[]);

  // Licznik Informacji (Inbox) — aktywne alerty + stale + nowe wiki
  const inboxCount=useMemo(()=>{
    const nowMs=Date.now();
    const alerts=loadJson(STORAGE_KEYS.managerAlerts,[]).filter(a=>{
      const notExp=!a.expires_at||new Date(a.expires_at).getTime()>nowMs;
      const shiftOk=!a.target_shift||!selectedShift||a.target_shift===selectedShift;
      const dateOk=!a.target_date||a.target_date===(currentSessionDate||todayKey());
      const alertOk=a.kind!=="task"||a.priority==="high";   // zadania → zakładka Zadania; tylko pilne liczą się jako alert
      return notExp&&shiftOk&&dateOk&&alertOk&&!a.done;
    }).length;
    const reminders=loadJson(STORAGE_KEYS.standingReminders,[]).filter(r=>r.active!==false).length;
    const wikiLastSeen=parseInt(localStorage.getItem(`${STORAGE_KEYS.wikiLastSeen}-${employeeName}`)||"0");
    const newWiki=wikiEntries.filter(w=>parsePlDateTime(w.updatedAt)>wikiLastSeen).length;
    const pending=loadJson(STORAGE_KEYS.pendingItems,[]).filter(p=>!p.resolved).length;
    return alerts+reminders+newWiki+pending;
  },[wikiEntries,employeeName,selectedShift,currentSessionDate,started,inboxVersion]);

  const futureDatedReminders=useMemo(()=>{
    const today=todayKey();
    return[...datedReminders].filter(r=>r.targetDate>=today).sort((a,b)=>a.targetDate.localeCompare(b.targetDate)||(a.targetShift||"").localeCompare(b.targetShift||""));
  },[datedReminders]);

  const filteredEvidenceLog=useMemo(()=>employeeActivityLog.filter(item=>{if(!item.loginAt)return false;const parts=item.loginAt.split(".");if(parts.length<3)return false;const year=parts[2]?.split(",")[0]?.trim();const month=parts[1]?.padStart(2,"0");return`${year}-${month}`===evidenceMonth;}),[employeeActivityLog,evidenceMonth]);
  const availableMonths=useMemo(()=>{const months=new Set([monthKey()]);employeeActivityLog.forEach(item=>{const parts=item.loginAt?.split(".")||[];if(parts.length<3)return;const year=parts[2]?.split(",")[0]?.trim();const month=parts[1]?.padStart(2,"0");if(year&&month)months.add(`${year}-${month}`);});return Array.from(months).sort().reverse();},[employeeActivityLog]);

  // Last 3 completed shifts (for start screen)
  const recentShifts=useMemo(()=>[...employeeActivityLog].filter(e=>e.logoutAt).slice(0,3),[employeeActivityLog]);

  // Weekly stats
  const weeklyStats=useMemo(()=>{
    try{
    const now=new Date();
    const dow=now.getDay();
    const startOfWeek=new Date(now);
    startOfWeek.setDate(now.getDate()-(dow===0?6:dow-1));
    startOfWeek.setHours(0,0,0,0);
    const parsePolishDate=(str)=>{
      try{const[datePart,timePart]=(str||"").split(", ");const[d,m,y]=datePart.split(".").map(Number);const[h,min]=(timePart||"00:00").split(":").map(Number);return new Date(y,m-1,d,h,min);}catch{return new Date(0);}
    };
    const log=Array.isArray(employeeActivityLog)?employeeActivityLog:[];
    const rpts=Array.isArray(savedReports)?savedReports:[];
    const weekShifts=log.filter(e=>e&&e.loginAt&&parsePolishDate(e.loginAt)>=startOfWeek);
    const weekReports=rpts.filter(r=>{try{return r&&new Date(r.savedAt)>=startOfWeek;}catch{return false;}});
    const empCounts={};
    weekShifts.forEach(e=>{if(e.employee)empCounts[e.employee]=(empCounts[e.employee]||0)+1;});
    const topEmp=Object.entries(empCounts).sort((a,b)=>b[1]-a[1])[0];
    const completedShifts=weekShifts.filter(e=>e.logoutAt).length;
    const totalShifts=weekShifts.length;
    const completionRate=totalShifts>0?Math.round((completedShifts/totalShifts)*100):0;
    return{totalShifts,completedShifts,completionRate,reportsCount:weekReports.length,topEmp:topEmp?{name:topEmp[0],count:topEmp[1]}:null};
    }catch{return{totalShifts:0,completedShifts:0,completionRate:0,reportsCount:0,topEmp:null};}
  },[employeeActivityLog,savedReports]);

  // Last handover note — show only the note from the very last completed shift
  // Dismissed when a new shift is started (handoverNoteDismissed state)
  const [handoverNoteDismissed,setHandoverNoteDismissed]=useState(()=>localStorage.getItem("reception-handover-seen")||"");
  const lastHandoverNote=useMemo(()=>{
    const notes=loadJson(STORAGE_KEYS.handoverNotes,[]);
    if(!notes.length)return null;
    const newest=notes[0];
    // Nie pokazuj jeśli już widziana (po starcie zmiany)
    if(handoverNoteDismissed===newest.id)return null;
    // Nie pokazuj jeśli starsza niż 36 godzin
    try{
      const parts=(newest.createdAt||"").split(", ");
      if(parts.length>=2){
        const dp=parts[0].split(".");
        const tp=parts[1].split(":");
        const noteDate=new Date(+dp[2],+dp[1]-1,+dp[0],+tp[0],+tp[1]||0);
        if((Date.now()-noteDate.getTime())>36*60*60*1000)return null;
      }
    }catch{}
    return newest;
  },[employeeActivityLog,handoverNoteDismissed]);

  // Handlers
  const handleStartShift=()=>{
    const shiftKey=normalizeToShift(selectedShift)||selectedShift;
    if(!employeeName.trim()||!shiftKey){showToast("Wybierz pracownika i zmianę.","error");return;}
    if(shiftKey!==selectedShift)setSelectedShift(shiftKey);
    const dayK=todayKey();
    const ackN=employeeName.toLowerCase().replace(/[ąćęłńóśźż]/g,c=>"acelnoszzz"["ąćęłńóśźż".indexOf(c)]);
    const ackBase=`ack-${ackN}-${dayK}-${shiftKey}`;
    // Auto-ACK puste kategorie — żeby nie pokazywać pustych checkboxów w modalu
    const nowMs=Date.now();
    const relevantAlerts=loadJson(STORAGE_KEYS.managerAlerts,[]).filter(a=>{
      const notExp=!a.expires_at||new Date(a.expires_at).getTime()>nowMs;
      const dateOk=!a.target_date||a.target_date===(dayK);
      const alertOk=a.kind!=="task"||a.priority==="high";   // ack przed zmianą tylko dla alertów i PILNYCH zadań
      return notExp&&(!a.target_shift||a.target_shift===shiftKey)&&dateOk&&alertOk&&!a.done;
    });
    const hasAlerts=relevantAlerts.length>0;
    // Hash po TREŚCI (tytuł+treść), nie po ID — ID są niestabilne (seed/sync Supabase
    // generują nowe), a treść jest tym, co pracownik faktycznie potwierdza. Dzięki temu
    // ACK przeżywa wymianę ID i nie trzeba akceptować tego samego przy każdym logowaniu.
    const contentHash=(arr)=>arr.map(x=>`${x.title||""}|${x.body||""}`).sort().join("||");
    const alertsHash=contentHash(relevantAlerts);
    const hasReminders=loadJson(STORAGE_KEYS.standingReminders,[]).filter(r=>r.active!==false).length>0;
    const wikiLastSeen=parseInt(localStorage.getItem(`${STORAGE_KEYS.wikiLastSeen}-${employeeName}`)||"0");
    const hasNewWiki=wikiEntries.filter(w=>parsePlDateTime(w.updatedAt)>wikiLastSeen).length>0;
    if(!hasAlerts)localStorage.setItem(`${ackBase}-alerts`,"1");
    if(!hasReminders)localStorage.setItem(`${ackBase}-standing`,"1");
    if(!hasNewWiki)localStorage.setItem(`${ackBase}-wiki`,"1");
    // Permanent hash check for standing reminders — skip re-ack if same set already acknowledged
    if(hasReminders){
      const rems=loadJson(STORAGE_KEYS.standingReminders,[]).filter(r=>r.active!==false);
      const sHash=contentHash(rems);
      if(sHash&&localStorage.getItem(`ack-sh-${ackN}-${sHash}`)==="1")localStorage.setItem(`${ackBase}-standing`,"1");
    }
    const alertsAcked=!hasAlerts||localStorage.getItem(`ack-al-${ackN}-${alertsHash}`)==="1";
    const allAck=alertsAcked
              &&localStorage.getItem(`${ackBase}-standing`)==="1"
              &&localStorage.getItem(`${ackBase}-wiki`)==="1";
    if(allAck||inboxCount===0){actualStartShift();return;}
    setShowPreShiftModal(true);
  };
  const actualStartShift=()=>{
    setShowPreShiftModal(false);
    const shiftKey=normalizeToShift(selectedShift)||selectedShift;
    if(!shiftKey){showToast("Wybierz pracownika i zmianę.","error");return;}
    if(shiftKey!==selectedShift)setSelectedShift(shiftKey);
    const shiftLabel=SHIFT_SHORT_LABELS[shiftKey]||shiftKey;
    const init={};(tasks[shiftKey]||[]).forEach((_,i)=>{init[i]=false;});setCompleted(init);
    const updated=[{id:crypto.randomUUID(),employee:employeeName,shift:shiftKey,loginAt:fmtA(),logoutAt:""},...employeeActivityLog];
    setEmployeeActivityLog(updated);saveJson(STORAGE_KEYS.employeeLog,updated);setCurrentSessionDate(todayKey());setDismissedReminderKeys(loadJson(dismissStoreKey(employeeName),[]));
    const cleanedCarry={...carryOverTasks,[shiftKey]:(carryOverTasks[shiftKey]||[]).filter(t=>!t.done)};
    setCarryOverTasks(cleanedCarry);saveJson(STORAGE_KEYS.carry,cleanedCarry);setShiftStartTime(getNow());setStarted(true);setWorkerTab("zadania");
    setCashOpeningAmount(String(stalaKasowa));
    setStalaPotwierdzono(false);setStalaNiezgodnosc(false);
    // Sprawdź płatności po wpłacie nocnej
    const postKWStr=localStorage.getItem("reception-post-deposit-kw");
    if(postKWStr&&!isNaN(parseFloat(postKWStr))&&parseFloat(postKWStr)>0){
      showToast(`Zmiana ${shiftLabel} rozpoczęta. ⚠️ Nocna miała ${fmtMoney(parseFloat(postKWStr))} zł KW po wpłacie do sejfu — uwzględnione w KW.`,"warning",9000);
      localStorage.removeItem("reception-post-deposit-kw");
    } else {
      showToast(`Zmiana ${shiftLabel} rozpoczęta. Powodzenia!`,"success");
    }
    // Alert dla Pawła i Weroniki o niezałatwionych korektach
    const allCorrections=loadJson(STORAGE_KEYS.paymentCorrections,[]);
    const pending=allCorrections.filter(c=>!c.done);
    if(pending.length>0&&isManagerName(employeeName,customManagers)){
      showToast(`Masz ${pending.length} nierozpatrzon${pending.length===1?"ą":"ych"} korekt${pending.length===1?"ę":"ę"} płatności — zaloguj się jako kierownik.`,"warning",10000);
    }
  };
  const logManagerLogin=(manager)=>{const updated=[{id:crypto.randomUUID(),manager,loginAt:fmtA(),logoutAt:""},...adminActivityLog];setAdminActivityLog(updated);saveJson(STORAGE_KEYS.adminLog,updated);addAudit(manager,"Logowanie do panelu kierownika");const unresolved=loadJson(STORAGE_KEYS.incidentLog,[]).filter(i=>!i.resolved);if(unresolved.length>0){setTimeout(()=>showToast(`⚠ ${unresolved.length} niezakończon${unresolved.length===1?"a":"ych"} zmian${unresolved.length===1?"a":""} bez raportu — sprawdź zakładkę Historia.`,"warning",10000),600);}const pendingC=loadJson(STORAGE_KEYS.paymentCorrections,[]).filter(c=>!c.done);if(pendingC.length>0){setTimeout(()=>showToast(`${pendingC.length} korekta(-e) płatności oczekuje — zakładka Korekty.`,"warning",8000),1800);}};

  const handleAdminLogout=()=>{addAudit(currentManager,"Wylogowanie z panelu kierownika");const updated=adminActivityLog.map((item,i)=>i===0&&!item.logoutAt?{...item,logoutAt:fmtA()}:item);setAdminActivityLog(updated);saveJson(STORAGE_KEYS.adminLog,updated);clearManagerSession();setShowWiki(false);setEditingWikiId(null);setWikiTopic("");setWikiContent("");};
  const saveWikiEntries=(entries)=>{
    setWikiEntries(entries);
    saveJson(STORAGE_KEYS.wiki,entries);
  };
  const openWikiEntry=(entry)=>setSelectedWikiId(entry.id);
  const startEditWiki=(entry)=>{setSelectedWikiId(entry.id);setEditingWikiId(entry.id);setWikiTopic(entry.topic);setWikiContent(entry.content);setWikiImages(entry.images||[]);};
  const clearWikiForm=()=>{setEditingWikiId(null);setWikiTopic("");setWikiContent("");setWikiImages([]);};

  const handleWikiImageUpload=(files)=>{
    Array.from(files).forEach(file=>{
      if(!file.type.startsWith("image/"))return;
      if(file.size>4*1024*1024){showToast("Zdjęcie za duże (max 4MB).","error");return;}
      const reader=new FileReader();
      reader.onload=(e)=>{
        setWikiImages(prev=>[...prev,{id:crypto.randomUUID(),data:e.target.result,name:file.name}]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeWikiImage=(imgId)=>setWikiImages(prev=>prev.filter(i=>i.id!==imgId));

  // Wypchnięcie pojedynczego wpisu Wiki do bazy (wiki_entries, migracja 0040) → panel/inne urządzenia
  // widzą zmianę na żywo. Realtime odeśle echo, ale sync jest idempotentny (brak pętli).
  const pushWikiEntry=(entry)=>{
    if(!supabase||!entry)return;
    supabase.from("wiki_entries").upsert({
      id:entry.id,tenant_id:TENANT_ID,topic:entry.topic,content:entry.content||"",
      images:entry.images||[],created_by:currentManager||"Recepcja",updated_at:new Date().toISOString(),
    }).then(()=>{}).catch(()=>{});
  };

  const saveWikiEntry=()=>{
    if(!wikiTopic.trim()||!wikiContent.trim())return;
    let saved;
    if(editingWikiId){
      saved={...(wikiEntries.find(e=>e.id===editingWikiId)||{}),id:editingWikiId,topic:wikiTopic.trim(),content:wikiContent.trim(),images:wikiImages,updatedAt:fmt()};
      const updated=wikiEntries.map(e=>e.id===editingWikiId?saved:e);
      saveWikiEntries(updated);setSelectedWikiId(editingWikiId);
      addAudit(currentManager,`Edytowanie tematu wiki: "${wikiTopic.trim()}"`);
    }else{
      saved={id:crypto.randomUUID(),topic:wikiTopic.trim(),content:wikiContent.trim(),images:wikiImages,updatedAt:fmt()};
      saveWikiEntries([saved,...wikiEntries]);setSelectedWikiId(saved.id);
      addAudit(currentManager,`Dodanie tematu wiki: "${wikiTopic.trim()}"`);
    }
    pushWikiEntry(saved);
    clearWikiForm();showToast("Temat wiki zapisany.","success");
  };

  const deleteWikiEntry=(id)=>{
    const entry=wikiEntries.find(e=>e.id===id);
    saveWikiEntries(wikiEntries.filter(e=>e.id!==id));
    if(editingWikiId===id)clearWikiForm();
    if(selectedWikiId===id)setSelectedWikiId(wikiEntries.filter(e=>e.id!==id)[0]?.id||null);
    if(supabase){supabase.from("wiki_entries").delete().eq("id",id).then(()=>{}).catch(()=>{});}
    addAudit(currentManager,`Usuniecie tematu wiki: "${entry?.topic||id}"`);
    showToast("Temat usunięty.","info");
  };

  // Firebase sync on startup — fetch wiki + tasks if Firebase configured
  const addTask=()=>{if(!newTaskText.trim())return;const updated={...tasks,[taskShiftTarget]:[...(tasks[taskShiftTarget]||[]).map((t,i)=>normTask(t,`${taskShiftTarget}-${i}`)),{id:crypto.randomUUID(),text:newTaskText.trim(),scheduledTime:newTaskTime||"",urgent:newTaskUrgent,weekdaysOnly:newTaskWeekdaysOnly}]};setTasks(updated);saveJson(STORAGE_KEYS.tasks,updated);addAudit(currentManager,`Dodanie zadania do zmiany "${taskShiftTarget}": "${newTaskText.trim()}"${newTaskUrgent?" [PILNE]":""}${newTaskWeekdaysOnly?" [Pn-Pt]":""}`);setNewTaskText("");setNewTaskTime("");setNewTaskUrgent(false);setNewTaskWeekdaysOnly(false);showToast("Zadanie dodane.","success");};
  const removeTask=(shift,index)=>{const txt=tasks[shift]?.[index]?.text||"";const updated={...tasks,[shift]:(tasks[shift]||[]).filter((_,i)=>i!==index)};setTasks(updated);saveJson(STORAGE_KEYS.tasks,updated);if(currentManager)addAudit(currentManager,`Usuniecie zadania ze zmiany "${shift}": "${txt}"`);};
  const toggleTask=(index,checked)=>setCompleted(prev=>({...prev,[index]:!!checked}));
  const addAdditionalTask=()=>{if(!additionalTaskInput.trim()||!employeeName||!selectedShift)return;const updated=[{id:crypto.randomUUID(),text:additionalTaskInput.trim(),shift:selectedShift,employee:employeeName,sessionDate:currentSessionDate,createdAt:fmt()},...extraTasksLog];setExtraTasksLog(updated);saveJson(STORAGE_KEYS.extra,updated);setAdditionalTaskInput("");showToast("Zadanie dodatkowe zapisane.","success");};
  const markCarryOverDone=(index)=>{if(!selectedShift)return;const updated={...carryOverTasks,[selectedShift]:(carryOverTasks[selectedShift]||[]).map((t,i)=>i===index?{...t,done:!t.done,doneBy:!t.done?employeeName:""}:t)};setCarryOverTasks(updated);saveJson(STORAGE_KEYS.carry,updated);};
  // Odhaczenie zadania z panelu menedżera (manager_alerts). Optymistycznie lokalnie + zapis do Supabase
  // (te same kolumny co panel.markZadanieDone) → panel widzi „zrobione" na żywo.
  const markManagerTaskDone=async(id)=>{
    const at=new Date().toISOString(),by=employeeName||currentManager||"recepcja";
    const list=loadJson(STORAGE_KEYS.managerAlerts,[]).map(a=>a.id===id?{...a,done:true,done_at:at,done_by:by}:a);
    saveJson(STORAGE_KEYS.managerAlerts,list);setInboxVersion(v=>v+1);
    if(supabase){try{await supabase.from("manager_alerts").update({done:true,done_at:at,done_by:by}).eq("id",id);}catch{}}
    showToast("Zadanie odhaczone.","success");
  };
  const deleteDatedReminder=(target)=>{const updated=datedReminders.filter(r=>typeof target==="object"?r!==target:r.id!==target);setDatedReminders(updated);saveJson(STORAGE_KEYS.datedReminders,updated);showToast("Przypomnienie usunięte.","info");};
  // ── Oczekujące / Do odebrania (bez terminu) — rejestr w zakładce Informacje ──
  const addPendingItem=(text)=>{
    const t=(text||"").trim();if(!t)return;
    const item={id:crypto.randomUUID(),text:t,createdBy:employeeName||currentManager||"recepcja",createdAt:fmtA(),resolved:false};
    const list=[item,...loadJson(STORAGE_KEYS.pendingItems,[])];saveJson(STORAGE_KEYS.pendingItems,list);
    const logEntry={id:crypto.randomUUID(),type:"pending",from:item.createdBy,fromShift:selectedShift||"—",toShift:"oczekujące",text:t,createdAt:fmtA()};
    const updatedLog=[logEntry,...handoverLog].slice(0,300);setHandoverLog(updatedLog);saveJson(STORAGE_KEYS.handoverLog,updatedLog);
    showToast("Dodano do Oczekujących (Informacje → Oczekujące).","success");
  };
  // ── Kompozer v2: jedno pole + dwie osie (Rodzaj × Kiedy) → właściwy magazyn ──
  const addUnifiedEntry=()=>{
    const text=shiftNoteInput.trim();if(!text)return;
    // Bez terminu → rejestr „Oczekujące"
    if(entryWhen==="pending"){addPendingItem(text);setShiftNoteInput("");return;}
    // Konkretny dzień → datedReminders (z wybranym rodzajem)
    if(entryWhen==="dated"){
      if(!newReminderDate){showToast("Wybierz datę.","error");return;}
      const isAdminCreated=!!(canAccessManagerPanel&&showAdminPanel);
      const ne={id:crypto.randomUUID(),text,targetShift:newReminderShift||null,targetDate:newReminderDate,createdBy:employeeName||currentManager||"recepcja",createdAt:fmtA(),entryType:entryKind==="task"?"task":"reminder",source:isAdminCreated?"admin":"worker"};
      const updated=[ne,...datedReminders];setDatedReminders(updated);saveJson(STORAGE_KEYS.datedReminders,updated);
      const logEntry={id:crypto.randomUUID(),type:ne.entryType,from:ne.createdBy,fromShift:selectedShift||"—",toShift:newReminderShift,text,targetDate:newReminderDate,createdAt:fmtA()};
      const updatedLog=[logEntry,...handoverLog].slice(0,300);setHandoverLog(updatedLog);saveJson(STORAGE_KEYS.handoverLog,updatedLog);
      setShiftNoteInput("");showToast(`Ustawione na ${newReminderDate} (${newReminderShift?SHIFT_SHORT_LABELS[newReminderShift]:"wszystkie zmiany"}).`,"success");return;
    }
    // Następna zmiana → zadanie (checkbox) albo powiadomienie (do wiadomości)
    if(entryKind==="task"){
      if(!carryOverTarget||!employeeName||!selectedShift)return;
      const ne={id:crypto.randomUUID(),text,fromShift:selectedShift,createdBy:employeeName,createdAt:fmt(),done:false,doneBy:""};
      const updated={...carryOverTasks,[carryOverTarget]:[...(carryOverTasks[carryOverTarget]||[]),ne]};
      setCarryOverTasks(updated);saveJson(STORAGE_KEYS.carry,updated);
      const logEntry={id:crypto.randomUUID(),type:"task",from:employeeName,fromShift:selectedShift,toShift:carryOverTarget,text,createdAt:fmtA()};
      const updatedLog=[logEntry,...handoverLog].slice(0,300);setHandoverLog(updatedLog);saveJson(STORAGE_KEYS.handoverLog,updatedLog);
      setShiftNoteInput("");showToast(`Zadanie przekazane do zmiany ${SHIFT_SHORT_LABELS[carryOverTarget]}.`,"success");
    }else{
      const n={id:crypto.randomUUID(),text,createdBy:employeeName||currentManager||"recepcja",createdAt:fmtA(),targetShift:null,entryType:"reminder"};
      const updated=[n,...globalNotifications];setGlobalNotifications(updated);saveJson(STORAGE_KEYS.globalNotifications,updated);
      const logEntry={id:crypto.randomUUID(),type:"reminder",from:n.createdBy,fromShift:selectedShift||"—",toShift:"wszystkie",text,createdAt:fmtA()};
      const updatedLog=[logEntry,...handoverLog].slice(0,300);setHandoverLog(updatedLog);saveJson(STORAGE_KEYS.handoverLog,updatedLog);
      setShiftNoteInput("");showToast("Powiadomienie dodane — widoczne na ekranie startowym.","success");
    }
  };
  const dismissDatedReminder=(id)=>setDismissedReminderKeys(prev=>[...prev,`dated-${id}`]);
  // Odhaczenie sprawy do potwierdzenia (np. „kurier był") — trwałe, znika z listy.
  const confirmDatedReminder=(id)=>{const updated=datedReminders.map(r=>r.id===id?{...r,confirmedAt:fmtA(),confirmedBy:employeeName||currentManager||"recepcja"}:r);setDatedReminders(updated);saveJson(STORAGE_KEYS.datedReminders,updated);showToast("Odhaczone — dziękuję.","success");};
  // „Jeszcze nie” — odłóż na godzinę; potem program dopyta ponownie.
  const snoozeConfirmReminder=(id)=>{setSnoozedConfirm(prev=>({...prev,[id]:Date.now()}));showToast("Przypomnę za godzinę.","info");};
  const closeEmpEntry=()=>{const updated=employeeActivityLog.map(item=>item.employee===employeeName&&item.shift===selectedShift&&!item.logoutAt?{...item,logoutAt:fmtA()}:item);setEmployeeActivityLog(updated);saveJson(STORAGE_KEYS.employeeLog,updated);};
  const resetView=(reportSaved=false)=>{
    // Detect abandoned shift — only when NOT finishing normally with a report
    if(!reportSaved&&started&&shiftStartTime){
      const minElapsed=(Date.now()-shiftStartTime.getTime())/60000;
      if(minElapsed<10){
        // Cofnięcie w ciągu 10 min — usuń wpis z ewidencji (omyłkowy wybór)
        const cleaned=employeeActivityLog.filter(item=>!(item.employee===employeeName&&item.shift===selectedShift&&!item.logoutAt));
        setEmployeeActivityLog(cleaned);saveJson(STORAGE_KEYS.employeeLog,cleaned);
        // Usuń też pełny raport jeśli zdążył się zapisać
        const allFull=loadJson(STORAGE_KEYS.reportsFull,[]);
        const startMs=shiftStartTime.getTime();
        const cleanedFull=allFull.filter(r=>!(r.employeeName===employeeName&&(r.shiftKey||r.selectedShift)===selectedShift&&Math.abs(new Date(r.savedAt||0).getTime()-startMs)<15*60*1000));
        saveJson(STORAGE_KEYS.reportsFull,cleanedFull);
        // Porzucona zmiana — usuń też ewentualny wpis z Supabase (zapisany przy szybkim zakończeniu)
        if(supabase){
          supabase.from("shift_reports").delete()
            .eq("tenant_id",TENANT_ID).eq("employee",employeeName).eq("shift_key",selectedShift)
            .gte("saved_at",new Date(startMs-15*60*1000).toISOString())
            .then(()=>{},()=>{});
        }
        clearManagerSession();setStarted(false);setCurrentSessionDate("");setDismissedReminderKeys([]);setEmployeeName("");setSelectedShift("");setPendingAutoStart(false);setLoginShiftSource("clock");setCashOpeningAmount("");setCashClosingDocumentsAmount("");setCashCurrentAmount("");setCompleted({});setAdditionalTaskInput("");setShiftNoteInput("");setHandoverNote("");setCarryOverTarget("nocna");setFinishDialogOpen(false);setWorkerTab("zmiana");setShiftStartTime(null);localStorage.removeItem(AUTOSAVE_KEY);setAutosaveNote(null);setStalaPotwierdzono(false);setStalaNiezgodnosc(false);setShowSafeDepositModal(false);setSafeDepositKW("");setSafeDepositAmount("");setPostDepositKW("");setSafeDepositRegistered(false);setSafeGuardOpen(false);setShiftEndReminderOpen(false);setShiftEndReminderText("");setShiftEndFacts(null);setSafeDepositManual(false);setShowPostDeposit(false);
        setLoginStep("name");setLoginPassword("");setLoginPassword2("");setLoginAdminInput("");
        return;
      }
      const anyDone=Object.values(completed).some(v=>v);
      if(anyDone){
        const incident={id:crypto.randomUUID(),employee:employeeName,shift:selectedShift,startedAt:fmtA(shiftStartTime),abandonedAt:fmtA(),minutesActive:Math.round(minElapsed),tasksCompleted:Object.values(completed).filter(v=>v).length,totalTasks:currentTasks.length,resolved:false};
        const updInc=[incident,...loadJson(STORAGE_KEYS.incidentLog,[])].slice(0,100);
        setIncidentLog(updInc);saveJson(STORAGE_KEYS.incidentLog,updInc);
      }
    }
    if(employeeName&&selectedShift)closeEmpEntry();clearManagerSession();setStarted(false);setCurrentSessionDate("");setDismissedReminderKeys([]);setEmployeeName("");setSelectedShift("");setPendingAutoStart(false);setLoginShiftSource("clock");setCashOpeningAmount("");setCashClosingDocumentsAmount("");setCashCurrentAmount("");setCompleted({});setAdditionalTaskInput("");setShiftNoteInput("");setHandoverNote("");setCarryOverTarget("nocna");setFinishDialogOpen(false);setWorkerTab("zmiana");setShiftStartTime(null);localStorage.removeItem(AUTOSAVE_KEY);setAutosaveNote(null);setStalaPotwierdzono(false);setStalaNiezgodnosc(false);setShowSafeDepositModal(false);setSafeDepositKW("");setSafeDepositAmount("");setPostDepositKW("");setSafeDepositRegistered(false);setSafeGuardOpen(false);setShiftEndReminderOpen(false);setShiftEndReminderText("");setShiftEndFacts(null);setSafeDepositManual(false);setShowPostDeposit(false);
    setLoginStep("name");setLoginPassword("");setLoginPassword2("");setLoginAdminInput("");
  };
  // ── Przycisk "Wstecz" przeglądarki (wersja webowa, nie Electron) ──
  // Gdy zalogowany, cofnięcie wyrzuca do ekranu logowania zamiast pokazywać
  // starą, zbuforowaną stronę z poprzedniej wersji logowania (bfcache/historia).
  const resetViewRef=useRef(resetView);
  resetViewRef.current=resetView;
  const isLoggedIn=loginStep==="ready"||started;
  useEffect(()=>{
    if(!isLoggedIn)return;
    // Wstaw wpis-pułapkę w historii, żeby "Wstecz" miało co skonsumować
    // i nie opuściło aplikacji do starej strony.
    window.history.pushState({ccLogged:true},"");
    const onPop=()=>{ resetViewRef.current?.(); };
    window.addEventListener("popstate",onPop);
    return ()=>window.removeEventListener("popstate",onPop);
  },[isLoggedIn]);
  const finishShift=()=>{
    if(!cashClosingDocumentsAmount.trim())return;
    try{
      const savedAt=getTestDate(new Date());
      const reportDate=shiftStartTime?getTestDate(new Date(shiftStartTime)):savedAt;
      const filename=buildShiftFn(selectedShift,reportDate);
      const safeTotal=cashDiff!==null?cashDiff:stalaKasowa; // start + KW = kwota w sejfie
      const cashDiffLabel=cashDiff===null?"Kasa bez zmian KW":`W sejfie: ${fmtMoney(safeTotal)}`;
      // Zapisz nową stałą kasową (tylko nie-sejfowe zmiany; sejfowe obsługuje handleSafeDeposit)
      const isDepositShift=(selectedShift==="nocna"||selectedShift==="wieczorowa");
      const kwNew=parseFloat(cashClosingDocumentsAmount)||0;
      if(!isDepositShift){
        localStorage.setItem(STALA_KASOWA_KEY,String(safeTotal));
        setStalaKasowa(safeTotal);
        // Zapisz bieżące łączne KW dla następnej zmiany
        localStorage.setItem(KW_TOTAL_KEY,String(kwNew));
        setKwTotal(kwNew);
        localStorage.setItem(SAFE_KEY,String(safeTotal));
      }
      setSafeConfirmStep(false);
      if(handoverNote.trim()){
        const notes=loadJson(STORAGE_KEYS.handoverNotes,[]);
        saveJson(STORAGE_KEYS.handoverNotes,[{id:crypto.randomUUID(),text:handoverNote.trim(),employee:employeeName,shift:selectedShift,createdAt:fmtA(savedAt)},...notes].slice(0,200));
      }
      // Statystyki zadań do raportu dobowego
      const doneCount=currentTasks.filter((_,i)=>completed[i]).length;
      const taskStatsEntry={employee:employeeName,shiftKey:selectedShift,shiftLabel:SHIFT_LABELS_PL[selectedShift]||selectedShift,done:doneCount,total:currentTasks.length,missing:missingBaseTasks.map(m=>m.task.text)};
      const reportData={employeeName,shiftLabel:SHIFT_LABELS[selectedShift]||selectedShift,savedAtLabel:fmt(savedAt),cashOpeningAmount,cashClosingDocumentsAmount,kwPrevAmount:kwTotal,cashDiffLabel,safeTotal,cashCurrentAmount,handoverNote:handoverNote.trim(),baseTasks:currentTasks.map((task,index)=>({status:completed[index]?"[OK]":"[X]",text:`${task.urgent?"[PILNE] ":""}${task.text}${task.scheduledTime?` (godz. ${task.scheduledTime})`:""}`})),carryOver:carryOverForCurrentShift.map(t=>({status:t.done?"[OK]":"[X]",text:t.text+(t.done&&t.doneNote?` - ${t.doneNote}`:"")})),extraTasks:filteredExtraTasks.map(item=>({status:"-",text:item.text})),missingTasks:[...missingBaseTasks.map(item=>({status:"-",text:item.task.text})),...missingCarryOverTasks.map(item=>({status:"-",text:item.text}))],taskStats:taskStatsEntry,filename};
      const newReports=[{employeeName,selectedShift,savedAt:savedAt.toISOString(),filename},...loadJson(STORAGE_KEYS.reports,[])];
      saveJson(STORAGE_KEYS.reports,newReports);setSavedReports(newReports);

      // Zapisz pełne dane raportu (do scalenia w raport dobowy)
      // Ustal logiczny dzień zmiany (zawsze data startu, nie zakończenia)
      const reportDay=new Date(reportDate);
      const isDayClosingShift=selectedShift==="wieczorowa"||selectedShift==="nocna";
      const logicalDayKey=todayKey(reportDay);

      // Zapisz pełny raport z logicznym dayKey
      const fullReportEntry={...reportData,savedAt:savedAt.toISOString(),
        shiftKey:selectedShift,dayKey:logicalDayKey};
      const allFullReports=loadJson(STORAGE_KEYS.reportsFull,[]);
      const nextFull=[fullReportEntry,...allFullReports].slice(0,60);
      saveJson(STORAGE_KEYS.reportsFull,nextFull);
      pushMirror("reports_full",nextFull);

      // Trwały zapis do Supabase — by Historia była widoczna na innych urządzeniach
      // i dla pracowników. localStorage zostaje buforem (działa też offline).
      if(supabase){
        const num=(v)=>{const n=parseFloat(v);return isNaN(n)?null:n;};
        supabase.from("shift_reports").insert({
          tenant_id:TENANT_ID,
          // Realna tabela ma starą kolumnę date_key (NOT NULL, bez defaultu) obok
          // nowszej day_key — bez date_key każdy insert leciał na 23502 i tabela
          // była pusta. Trzymamy obie równe logicznemu dniowi zmiany.
          date_key:logicalDayKey,
          day_key:logicalDayKey,
          shift_key:selectedShift,
          employee:employeeName,
          saved_at:savedAt.toISOString(),
          cash_opening:num(cashOpeningAmount),
          cash_closing:num(cashClosingDocumentsAmount),
          kw_prev:num(kwTotal),
          safe_total:typeof safeTotal==="number"?safeTotal:num(safeTotal),
          cash_current:num(cashCurrentAmount),
          handover:handoverNote.trim()||null,
          tasks_done:doneCount,
          tasks_total:currentTasks.length,
          // report i data to jsonb-bliźniaki (dryf schematu) — wypełniamy oba,
          // żeby czytelnik korzystający z którejkolwiek dostał pełny raport.
          data:fullReportEntry,
          report:fullReportEntry,
        }).then(({error})=>{ if(error) console.warn("[shift_reports]",error.message); });
      }

      downloadShiftPDF(reportData);

      // ── Raport dobowy: wieczorowa lub nocna = koniec dnia ─────────────────
      if(isDayClosingShift){
        setTimeout(()=>{
          try{
            // Zbierz wszystkie raporty z logicznego dnia (strict dayKey match)
            const allFull=loadJson(STORAGE_KEYS.reportsFull,[]);
            const allDayReports=allFull.filter(r=>{
              // Priorytet: exact dayKey match
              if(r.dayKey)return r.dayKey===logicalDayKey;
              // Fallback dla starych raportów bez dayKey: wylicz dayKey z savedAt + shift type
              if(r.savedAt){
                const rDate=new Date(r.savedAt);
                if(isNaN(rDate.getTime()))return false;
                const rShift=r.shiftKey||r.selectedShift;
                if(rShift==="nocna"){
                  // Nocna 22-7: zapis o 7:00 oznacza dzień poprzedni
                  const d=new Date(rDate);d.setDate(d.getDate()-1);
                  return todayKey(d)===logicalDayKey;
                }
                return todayKey(rDate)===logicalDayKey;
              }
              return false;
            });

            if(!allDayReports.length){
              showToast("Brak danych do raportu dobowego.","warning");return;
            }

            const dayLabel=reportDay.toLocaleDateString("pl-PL",{weekday:"long",year:"numeric",month:"long",day:"numeric"});

            // Obsada zmian z ewidencji
            const allEmpLog=loadJson(STORAGE_KEYS.employeeLog,[]);
            const todaySavedKey=todayKey(savedAt);
            const dayShifts=allEmpLog.filter(e=>{
              if(!e.loginAt)return false;
              try{const parts=e.loginAt.split(", ");const dp=parts[0].split(".");
                const eDay=`${dp[2]}-${dp[1].padStart(2,"0")}-${dp[0].padStart(2,"0")}`;
                return eDay===logicalDayKey||eDay===todaySavedKey;
              }catch{return false;}
            });

            const shiftOrder=["poranna","dzienna","popoludniowa","wieczorowa","nocna"];
            const shiftsData=shiftOrder.map(s=>{
              const emp=dayShifts.find(e=>e.shift===s);
              return emp?{label:SHIFT_LABELS_PL[s]||s,employee:emp.employee,
                time:`${emp.loginAt}${emp.logoutAt?" - "+emp.logoutAt:""}`,
                completed:!!emp.logoutAt}:null;
            }).filter(Boolean);

            // Zbierz zadania, carry, kasę, taskStats ze wszystkich raportów (w kolejności zmian)
            const shiftOrderFull=["poranna","dzienna","popoludniowa","wieczorowa","nocna"];
            const sortedAllDay=[...allDayReports].sort((a,b)=>shiftOrderFull.indexOf(a.shiftKey||a.selectedShift)-shiftOrderFull.indexOf(b.shiftKey||b.selectedShift));
            const allTasks=[],allCarry=[],cashRows=[],taskStatsList=[];
            sortedAllDay.forEach(r=>{
              const sl=SHIFT_SHORT_LABELS[r.shiftKey||r.selectedShift]||r.shiftKey||"";
              (r.baseTasks||[]).forEach(t=>allTasks.push({status:t.status,shift:sl,text:t.text}));
              (r.carryOver||[]).forEach(t=>allCarry.push({status:t.status,shift:sl,text:t.text}));
              if(r.safeTotal!=null)cashRows.push({label:`${r.employeeName} — ${sl}`,val:fmtMoney(r.safeTotal)});
              else if(r.cashOpeningAmount!=null)cashRows.push({label:`${r.employeeName} — ${sl}`,val:fmtMoney(parseFloat(r.cashOpeningAmount)||0)});
              // Task stats
              if(r.taskStats){taskStatsList.push(r.taskStats);}
              else{// Oblicz ze starych raportów bez taskStats
                const done=(r.baseTasks||[]).filter(t=>t.status==="[OK]"||t.status==="✓").length;
                const total=(r.baseTasks||[]).length;
                const missing=(r.baseTasks||[]).filter(t=>t.status==="[X]"||t.status==="✗").map(t=>t.text);
                taskStatsList.push({employee:r.employeeName,shiftKey:r.shiftKey||r.selectedShift,shiftLabel:SHIFT_LABELS_PL[r.shiftKey||r.selectedShift]||r.shiftKey||sl,done,total,missing});
              }
            });

            // Korekty z tego dnia
            const allCorrections=loadJson(STORAGE_KEYS.paymentCorrections,[]);
            const dayCorrections=allCorrections.filter(c=>{
              if(!c.submittedAt)return false;
              try{const p=c.submittedAt.split(", ");const d=p[0].split(".");
                return`${d[2]}-${d[1].padStart(2,"0")}-${d[0].padStart(2,"0")}`===logicalDayKey;
              }catch{return false;}
            });

            // Notatki przekazania z tego dnia
            const allNotesList=loadJson(STORAGE_KEYS.handoverNotes,[]);
            const dayNotes=allNotesList.filter(n=>{
              try{const parts=n.createdAt.split(", ");const dp=parts[0].split(".");
                const nKey=`${dp[2]}-${dp[1].padStart(2,"0")}-${dp[0].padStart(2,"0")}`;
                return nKey===logicalDayKey||nKey===todaySavedKey;
              }catch{return false;}
            }).map(n=>({status:"•",text:`[${SHIFT_SHORT_LABELS[n.shift]||n.shift}] ${n.employee}: ${n.text}`}));

            // Raporty pracownicze z tego dnia
            const allEmpRep=loadJson(STORAGE_KEYS.empReports,[]);
            const dayEmpReports=allEmpRep.filter(r=>{
              if(!r.reportDate)return false;
              try{return r.reportDate===logicalDayKey||r.reportDate===todaySavedKey;}catch{return false;}
            });

            const hasNocna=allDayReports.some(r=>r.shiftKey==="nocna");
            const hasDzienna=allDayReports.some(r=>r.shiftKey==="dzienna");
            const shiftMode=hasDzienna||hasNocna?"Dzienna + Nocna":"Poranna + Popoludniowa + Wieczorowa";

            // taskSummary — per pracownik/zmiana
            const taskSummary=taskStatsList.map(ts=>({
              employee:ts.employee,
              shift:SHIFT_SHORT_LABELS[ts.shiftKey||ts.selectedShift]||ts.shiftKey||"",
              done:ts.done||0,
              missed:ts.missing?ts.missing.length:((ts.total||0)-(ts.done||0)),
            }));

            const dailyReport={
              generatedAt:fmt(savedAt),dateLabel:dayLabel,shiftMode,
              shifts:shiftsData.length?shiftsData:[{label:SHIFT_LABELS_PL[selectedShift]||selectedShift,employee:employeeName,time:fmt(savedAt),completed:true}],
              taskSummary,
              allNotes:dayNotes,
              cashRows,
              corrections:dayCorrections,
              empReports:dayEmpReports,
              filename:`raport_dobowy_${logicalDayKey}.pdf`,
            };
            downloadDailyReportPDF(dailyReport);
            showToast(`Raport dobowy (${allDayReports.length} zmian) wygenerowany.`,"success",6000);
          }catch(e){
            console.error("Blad raportu dobowego:",e);
            showToast("Blad generowania raportu dobowego: "+e.message,"error");
          }
        },1500);
      }
      const newExtra=extraTasksLog.filter(item=>!(item.shift===selectedShift&&item.employee===employeeName&&item.sessionDate===currentSessionDate));
      setExtraTasksLog(newExtra);saveJson(STORAGE_KEYS.extra,newExtra);
      const newCarry={...carryOverTasks};if(newCarry[selectedShift]){newCarry[selectedShift]=newCarry[selectedShift].filter(t=>!t.done);setCarryOverTasks(newCarry);saveJson(STORAGE_KEYS.carry,newCarry);}
      closeEmpEntry();setShowSuccessAnim(true);setTimeout(()=>{setShowSuccessAnim(false);resetView(true);},2000);showToast("Zmiana zakończona — raport PDF zapisany.","success");
    }catch(err){console.error(err);showToast("Błąd podczas kończenia zmiany: "+err.message,"error");}
  };
  // Strażnik wyjścia ze zmiany: nocna/wieczorowa nie może porzucić zmiany bez
  // zarejestrowania wpłaty do sejfu (inaczej robi to dopiero poranna). Pomyłkowe
  // logowanie (<10 min) przepuszczamy — czyszczenie w resetView to obsługuje.
  const attemptLeaveShift=()=>{
    const minElapsed=shiftStartTime?(getNow().getTime()-shiftStartTime.getTime())/60000:0;
    if(started&&requiresSafeDeposit&&!safeDepositRegistered&&minElapsed>=10){
      setSafeGuardOpen(true);
      return;
    }
    resetView();
  };
  const saveEmployees=(next)=>{setEmployees(next);saveJson("reception-final-employees",next);};
  const addEmployee=()=>{const name=newEmployeeName.trim();if(!name)return;if(employees.some(e=>e.toLowerCase()===name.toLowerCase())){showToast("Pracownik o tym imieniu już istnieje.","warning");return;}saveEmployees([...employees,name]);addAudit(currentManager,`Dodanie pracownika: "${name}"`);setNewEmployeeName("");showToast(`Dodano: ${name}`,"success");};
  const startEditEmployee=(i)=>{setEditingEmployeeIndex(i);setEditingEmployeeName(employees[i]||"");};
  const saveEditedEmployee=()=>{const name=editingEmployeeName.trim();if(!name)return;addAudit(currentManager,`Edycja pracownika: "${employees[editingEmployeeIndex]}" -> "${name}"`);saveEmployees(employees.map((e,i)=>i===editingEmployeeIndex?name:e));setEditingEmployeeIndex(null);setEditingEmployeeName("");showToast("Zmiany zapisane.","success");};
  const removeEmployee=(i)=>{addAudit(currentManager,`Usuniecie pracownika: "${employees[i]}"`);saveEmployees(employees.filter((_,idx)=>idx!==i));if(employeeName===employees[i])setEmployeeName("");};
  const resetEvidenceMonth=()=>askConfirm(`Usunąć całą ewidencję za ${evidenceMonth}?`,()=>{const updated=employeeActivityLog.filter(item=>{const parts=item.loginAt?.split(".")||[];const year=parts[2]?.split(",")[0]?.trim();const month=parts[1]?.padStart(2,"0");return`${year}-${month}`!==evidenceMonth;});setEmployeeActivityLog(updated);saveJson(STORAGE_KEYS.employeeLog,updated);addAudit(currentManager,`Reset ewidencji za ${evidenceMonth}`);showToast("Ewidencja usunięta.","info");});
  const resetAllEvidence=()=>askConfirm("Usunąć CAŁĄ ewidencję godzin?",()=>{setEmployeeActivityLog([]);saveJson(STORAGE_KEYS.employeeLog,[]);addAudit(currentManager,"Reset CALEJ ewidencji");showToast("Cała ewidencja usunięta.","info");});

  const updateCarryOverDoneNote=(index,note)=>{
    if(!selectedShift)return;
    const updated={...carryOverTasks,[selectedShift]:(carryOverTasks[selectedShift]||[]).map((t,i)=>i===index?{...t,doneNote:note}:t)};
    setCarryOverTasks(updated);saveJson(STORAGE_KEYS.carry,updated);
  };

  // ── Stała kasowa handlers ─────────────────────────────────────────────────────
  const handleSafeDeposit=()=>{
    const kwNew=parseFloat(safeDepositKW)||0;
    const kwPrev=kwTotal;
    const kwIncrement=Math.max(0,kwNew-kwPrev);
    // Domyślnie do sejfu trafia dokładnie przyrost KW (kasa wraca do stałej) — bez
    // drugiego wpisywania tej samej kwoty. Override tylko gdy zaznaczono „inna kwota".
    const deposit=safeDepositManual?(parseFloat(safeDepositAmount)||0):kwIncrement;
    const totalBeforeDeposit=stalaKasowa+kwIncrement;
    const newStala=totalBeforeDeposit-deposit;
    localStorage.setItem(STALA_KASOWA_KEY,String(newStala));
    setStalaKasowa(newStala);
    localStorage.setItem(SAFE_KEY,String(newStala));
    // KW po wpłacie do sejfu (płatności między wpłatą a końcem nocy)
    const postKW=parseFloat(postDepositKW)||0;
    localStorage.setItem(KW_TOTAL_KEY,String(postKW));
    setKwTotal(postKW);
    if(postKW>0){
      localStorage.setItem("reception-post-deposit-kw",String(postKW));
      const kasaLog2=loadJson("reception-kasa-log",[]);
      saveJson("reception-kasa-log",[{id:crypto.randomUUID(),type:"post_wplata",from:employeeName,shift:selectedShift,text:`Płatność po wpłacie do sejfu: ${fmtMoney(postKW)} zł — wliczone w KW zmiany porannej.`,createdAt:fmtA()},...kasaLog2].slice(0,100));
    } else {
      localStorage.removeItem("reception-post-deposit-kw");
    }
    // Zapis do logu kasy (nie do wiadomości)
    const kasaLog=loadJson("reception-kasa-log",[]);
    saveJson("reception-kasa-log",[{id:crypto.randomUUID(),type:"wplata",from:employeeName,shift:selectedShift,text:`Wpłata do sejfu: ${fmtMoney(deposit)} zł. Przed wpłatą: ${fmtMoney(totalBeforeDeposit)} zł. Nowa stała: ${fmtMoney(newStala)} zł.`,createdAt:fmtA()},...kasaLog].slice(0,100));
    setShowSafeDepositModal(false);
    setSafeDepositRegistered(true);
    setSafeGuardOpen(false);
    showToast(`Wpłata do sejfu: ${fmtMoney(deposit)} zł. Nowa stała kasowa: ${fmtMoney(newStala)} zł.`,"success",6000);
    finishShift();
  };

  const reportStalaDiscrepancy=(workerAmount)=>{
    setStalaNiezgodnosc(true);
    const msg={id:crypto.randomUUID(),from:employeeName,shift:selectedShift,text:`⚠️ NIEZGODNOŚĆ STAŁEJ KASOWEJ: System wskazuje ${fmtMoney(stalaKasowa)} zł, pracownik naliczył ${fmtMoney(parseFloat(workerAmount)||0)} zł. Różnica: ${fmtMoney(Math.abs(stalaKasowa-(parseFloat(workerAmount)||0)))} zł. Proszę o weryfikację.`,createdAt:fmtA(),type:"cash_discrepancy",read:false};
    const updMsgs=[msg,...messages];
    setMessages(updMsgs);saveJson(STORAGE_KEYS.messages,updMsgs);
    showToast("Niezgodność kasy zgłoszona do kierownika.","warning",8000);
    setShowStalaDiscrepancyForm(false);
    setStalaDiscrepancyInput("");
  };

  const setStalaKasowaByManager=(newVal)=>{
    const v=parseFloat(newVal);
    if(isNaN(v)||v<0){showToast("Nieprawidłowa kwota.","error");return;}
    const oldVal=stalaKasowa;
    setStalaKasowa(v);
    localStorage.setItem("reception-stala-kasowa",String(v));
    localStorage.setItem("reception-safe-amount",String(v));
    const log=loadJson("reception-stala-kasowa-log",[]);
    const entry={id:crypto.randomUUID(),changedBy:currentManager,from:oldVal,to:v,changedAt:fmtA()};
    saveJson("reception-stala-kasowa-log",[entry,...log].slice(0,50));
    addAudit(currentManager,`Zmiana stałej kasowej: ${fmtMoney(oldVal)} → ${fmtMoney(v)}`);
    showToast(`Stała kasowa zmieniona na ${fmtMoney(v)}.`,"success");
    setManagerNewStala("");
  };

  const exportEvidenceCSV=()=>{
    const rows=[["Pracownik","Zmiana","Rodzaj zmiany","Rozpoczęcie","Zakończenie"]];
    filteredEvidenceLog.forEach(item=>{rows.push([item.employee||"",item.shift||"",SHIFT_LABELS_PL[item.shift]||item.shift,item.loginAt||"",item.logoutAt||"trwa"]);});
    const csv=rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(",")).join("\r\n");
    const blob=new Blob(["\uFEFF"+csv],{type:"text/csv;charset=utf-8;"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`ewidencja_${evidenceMonth}.csv`;a.click();
    URL.revokeObjectURL(a.href);
    showToast(`Eksportowano ${filteredEvidenceLog.length} wpisów do CSV.`,"success");
  };

  const addGlobalNotification=()=>{
    if(!newGlobalNote.trim())return;
    const n={id:crypto.randomUUID(),text:newGlobalNote.trim(),createdBy:currentManager,createdAt:fmtA(),targetShift:newGlobalNoteShift||null,fromManager:true};
    const updated=[n,...globalNotifications];
    setGlobalNotifications(updated);saveJson(STORAGE_KEYS.globalNotifications,updated);
    setNewGlobalNote("");setNewGlobalNoteShift("");showToast("Powiadomienie dodane.","success");
  };
  const addManagerTask=()=>{
    if(!newGlobalNote.trim()){showToast("Wpisz treść zadania.","error");return;}
    if(!newGlobalNoteShift){showToast("Wybierz zmianę dla zadania.","error");return;}
    const ne={id:crypto.randomUUID(),text:newGlobalNote.trim(),fromShift:"kierownik",createdBy:currentManager,createdAt:fmtA(),targetDate:newGlobalNoteDate,done:false,doneBy:""};
    const updated={...carryOverTasks,[newGlobalNoteShift]:[...(carryOverTasks[newGlobalNoteShift]||[]),ne]};
    setCarryOverTasks(updated);saveJson(STORAGE_KEYS.carry,updated);
    const logEntry={id:crypto.randomUUID(),type:"task",from:currentManager,fromShift:"kierownik",toShift:newGlobalNoteShift,text:newGlobalNote.trim(),createdAt:fmtA()};
    const updLog=[logEntry,...handoverLog].slice(0,300);setHandoverLog(updLog);saveJson(STORAGE_KEYS.handoverLog,updLog);
    setNewGlobalNote("");setNewGlobalNoteShift("");setNewGlobalNoteDate(todayKey());showToast(`Zadanie dodane do zmiany ${SHIFT_SHORT_LABELS[newGlobalNoteShift]}.`,"success");
  };
  const removeGlobalNotification=(id)=>{
    const updated=globalNotifications.filter(n=>n.id!==id);
    setGlobalNotifications(updated);saveJson(STORAGE_KEYS.globalNotifications,updated);
  };
  const dismissGlobalNote=(id)=>{
    const updated=[...dismissedGlobalNotes,id];
    setDismissedGlobalNotes(updated);localStorage.setItem("reception-dismissed-gnotes",JSON.stringify(updated));
  };
  const visibleGlobalNotes=globalNotifications.filter(n=>
    !dismissedGlobalNotes.includes(n.id)&&
    (!n.targetShift||n.targetShift===selectedShift)
  );

  const submitPaymentCorrection=()=>{
    if(!employeeName&&!pcEmployee){showToast("Wybierz pracownika.","error");return;}
    if(!pcReservation.trim()||!pcExplanation.trim()){showToast("Wypełnij wszystkie pola.","error");return;}
    const submitter=employeeName||pcEmployee||"recepcja";
    const nc={id:crypto.randomUUID(),docType:pcDocType,reservation:pcReservation.trim(),explanation:pcExplanation.trim(),reason:pcExplanation.trim(),correctData:"",
      submittedBy:submitter,submittedAt:fmtA(),done:false,shift:selectedShift||"",employeeSignature:pcSignature||null,approvals:{}};
    const updated=[nc,...paymentCorrections];
    setPaymentCorrections(updated);saveJson(STORAGE_KEYS.paymentCorrections,updated);
    setPcDocType("paragon");setPcEmployee("");setPcReservation("");setPcExplanation("");setPcSignature(null);setShowPaymentForm(false);
    showToast("Korekta płatności wysłana do kierownictwa.","success");
  };
  const dismissPaymentCorrection=(id)=>{
    const updated=paymentCorrections.map(c=>c.id===id?{...c,done:true,approvals:{...(c.approvals||{}),[currentManager]:{at:fmtA(),note:"",signature:null}}}:c);
    setPaymentCorrections(updated);saveJson(STORAGE_KEYS.paymentCorrections,updated);
  };
  const pendingCorrections=paymentCorrections.filter(c=>!c.done);
  const [correctionApprovalModal,setCorrectionApprovalModal]=React.useState(null); // {correction}

  const handleExportBackup=()=>{
    const backup={};
    [...Object.values(STORAGE_KEYS),"reception-final-employees"].forEach(k=>{
      const v=localStorage.getItem(k);if(v){try{backup[k]=JSON.parse(v);}catch{}}
    });
    const blob=new Blob([JSON.stringify(backup,null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);
    a.download=`backup_recepcja_${todayKey()}.json`;a.click();
    URL.revokeObjectURL(a.href);
    showToast("Backup pobrany.","success");
  };

  const handleImportBackup=()=>{
    const input=document.createElement("input");input.type="file";input.accept=".json";
    input.onchange=async(e)=>{
      const file=e.target.files[0];if(!file)return;
      try{
        const data=JSON.parse(await file.text());
        Object.entries(data).forEach(([k,v])=>{if(v!==null&&v!==undefined)localStorage.setItem(k,JSON.stringify(v));});
        showToast("Import OK — odświeżam…","success");
        setTimeout(()=>window.location.reload(),1500);
      }catch{showToast("Błąd parsowania pliku backup.","error");}
    };
    input.click();
  };

  // ── Wiki Drawer ───────────────────────────────────────────────────────────────
  const runWikiAsk=async()=>{
    const q=wikiAskQ.trim();
    if(!q||wikiAskLoading)return;
    setWikiAskLoading(true);setWikiAskError("");setWikiAskAnswer("");
    try{
      const ans=await askWiki(q,wikiEntries);
      setWikiAskAnswer(ans||"Brak odpowiedzi.");
    }catch(err){
      setWikiAskError(err?.code==="rate_limited"?"Asystent chwilowo przeciążony — spróbuj za chwilę.":"Asystent niedostępny. Skorzystaj z wyszukiwarki poniżej.");
    }finally{setWikiAskLoading(false);}
  };
  const polishHandover=async()=>{
    if(!handoverNote.trim()||polishingNote)return;
    setPolishingNote(true);
    try{ const out=await polishText(handoverNote.trim()); if(out)setHandoverNote(out); showToast("Notatka zredagowana.","success"); }
    catch(err){ showToast(err?.code==="rate_limited"?"Limit — spróbuj za chwilę.":"AI niedostępne.","error"); }
    finally{setPolishingNote(false);}
  };
  const runBriefing=async()=>{
    if(briefingLoading)return;
    setBriefingLoading(true);setBriefingError("");setBriefingText("");
    try{
      let openFaults=[];
      if(supabase){
        try{
          const {data}=await supabase.from("faults").select("room,space_id,description,priority,status").eq("tenant_id",TENANT_ID).neq("status","done").limit(20);
          openFaults=(data||[]).map(f=>({pokoj:f.room||f.space_id,opis:f.description,priorytet:f.priority,status:f.status}));
        }catch{/* briefing działa też bez usterek */}
      }
      const alerts=loadJson(STORAGE_KEYS.managerAlerts,[])
        .filter(a=>!a.expires_at||new Date(a.expires_at).getTime()>Date.now())
        .filter(a=>!a.target_date||a.target_date===(currentSessionDate||todayKey()))
        .filter(a=>a.kind!=="task"&&!a.done)   // zadania (kind='task') idą do sekcji zadań, nie do alertów
        .map(a=>({tytul:a.title,tresc:a.body}));
      // Wysyłamy do modelu TYLKO niepuste sekcje (po polsku) — inaczej model pisał
      // np. "Nie ma usterek, bo lista openFaults jest pusta".
      // Parser daty fmtA ("DD.MM.YYYY, HH:mm") — wspólny dla sekcji ograniczanych
      // do ostatnich 7 dni. Brak/niepoprawna data => nie odrzucamy (zachowawczo).
      const parseNoteDate=(s)=>{
        try{
          const parts=(s||"").split(", ");
          if(parts.length<2)return null;
          const dp=parts[0].split("."),tp=parts[1].split(":");
          return new Date(+dp[2],+dp[1]-1,+dp[0],+tp[0],+tp[1]||0);
        }catch{return null;}
      };
      const weekAgo=Date.now()-7*24*60*60*1000;
      const within7d=(createdAt)=>{const d=parseNoteDate(createdAt);return !d||d.getTime()>=weekAgo;};
      // Zadania przeniesione: niezrobione I dodane w ostatnich 7 dniach (stare odpadają).
      const carry=(carryOverTasks[selectedShift]||[]).filter(t=>!t.done&&within7d(t.createdAt)).map(t=>t.text);
      // Przypomnienia z ostatnich 7 dni (datą docelową) do dziś — nie tylko na dziś.
      const weekAgoKey=todayKey(new Date(Date.now()-7*24*60*60*1000));
      const todayDateKey=currentSessionDate||todayKey();
      const reminders=datedReminders
        .filter(r=>!r.confirmedAt&&r.targetDate>=weekAgoKey&&r.targetDate<=todayDateKey&&(!r.targetShift||r.targetShift===selectedShift)&&!dismissedReminderKeys.includes(`dated-${r.id}`))
        .sort((a,b)=>(a.targetDate||"").localeCompare(b.targetDate||""))
        .map(r=>r.targetDate&&r.targetDate!==todayDateKey?`${r.targetDate}: ${r.text}`:r.text);
      // Powiadomienia kierownika trwają do odrzucenia — ograniczamy do 7 dni, by stare nie wracały.
      const notifications=visibleGlobalNotes.filter(n=>within7d(n.createdAt)).map(n=>n.text);
      // Notatki przekazania zmiany z ostatnich 7 dni (nie tylko ostatnia zmiana).
      const recentNotes=loadJson(STORAGE_KEYS.handoverNotes,[])
        .filter(n=>{const d=parseNoteDate(n.createdAt);return d&&d.getTime()>=weekAgo;})
        .map(n=>({kiedy:n.createdAt,zmiana:n.shift?(SHIFT_LABELS_PL[n.shift]||n.shift):undefined,tresc:n.text}));
      // Dzisiejsza data (+ dzień tygodnia) — kontekst, by model przeliczał słowa
      // względne z notatek ("jutro przyjdzie kurier") na konkretne daty.
      const DNI_PL=["niedziela","poniedziałek","wtorek","środa","czwartek","piątek","sobota"];
      const dowToday=DNI_PL[new Date(`${todayDateKey}T12:00`).getDay()]||"";
      const ctx={ zmiana:SHIFT_LABELS_PL[selectedShift]||selectedShift, dataDzisiaj:`${todayDateKey} (${dowToday})`, redactNames:[] };
      if(recentNotes.length)    ctx.notatkiZmianOstatnie7Dni=recentNotes;
      if(carry.length)          ctx.zadaniaPrzeniesione=carry;
      if(openFaults.length)     ctx.otwarteUsterki=openFaults;
      if(reminders.length)      ctx.przypomnieniaOstatnie7Dni=reminders;
      if(notifications.length)  ctx.powiadomienia=notifications;
      if(alerts.length)         ctx.alertyKierownika=alerts;
      const text=await generateBriefing(ctx);
      setBriefingText(text||"Brak danych do briefingu.");
    }catch(err){
      setBriefingError(err?.code==="rate_limited"?"Limit zapytań — spróbuj za chwilę.":"Briefing niedostępny. Dane masz w panelach poniżej.");
    }finally{setBriefingLoading(false);}
  };
  const wikiDrawer=(
    <>
      <motion.div key="wov" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} className="wiki-drawer-overlay" onClick={()=>{setShowWiki(false);setWikiSearch("");setWikiExpandedId(null);}}/>
      <motion.div key="wdp" initial={{x:"100%"}} animate={{x:0}} exit={{x:"100%"}} transition={{type:"spring",damping:32,stiffness:320}} className={`wiki-drawer ${dark?"dark-wiki-drawer":""}`}>
        <div className={`wiki-drawer-header ${dark?"dark-dh":""}`}>
          <div style={{display:"flex",alignItems:"center",gap:10}}><BookOpen size={17} style={{color:"var(--gold)"}}/><h2 className="wiki-drawer-title">Wikirecepcja</h2></div>
          <div style={{display:"flex",gap:7,alignItems:"center"}}>
            <button className={dark?"btn btn-outline-dark":"btn btn-outline"} style={{padding:"6px 10px",display:"flex",alignItems:"center",gap:6,fontSize:12.5}} onClick={()=>downloadWikiPDF(wikiEntries)} title="Pobierz PDF wszystkich tematów"><BookOpen size={13}/> PDF</button>
            <button className={dark?"btn btn-outline-dark":"btn btn-outline"} style={{padding:"6px 10px"}} onClick={()=>{setShowWiki(false);setWikiSearch("");setWikiExpandedId(null);}}><X size={14}/></button>
          </div>
        </div>
        <div className="wiki-drawer-body" style={{padding:0,overflow:"hidden",display:"flex",flexDirection:"column"}}>
          {/* Search + list — hidden when topic expanded */}
          {!wikiExpandedId?(
            <div style={{padding:"18px 20px",overflowY:"auto",flex:1}}>
              {llmReady&&(
                <div style={{border:`1px solid ${dark?"rgba(176,101,160,.35)":"#e9d5e3"}`,background:dark?"rgba(176,101,160,.08)":"#fdf6fb",borderRadius:"var(--radius-md)",padding:"12px 14px",marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:8}}>
                    <Sparkles size={14} style={{color:"var(--gold)"}}/>
                    <span style={{fontSize:12.5,fontWeight:700,color:dark?"var(--dark-text)":"var(--text-primary)"}}>Zapytaj o procedurę</span>
                    <span style={{fontSize:10.5,color:dark?"var(--dark-text-muted)":"var(--text-muted)"}}>· odpowiada z Wiki</span>
                  </div>
                  <div style={{display:"flex",gap:7}}>
                    <input className="input" style={{flex:1,fontSize:13.5}} placeholder="Np. Jak zrobić wczesny check-out?"
                      value={wikiAskQ} onChange={e=>setWikiAskQ(e.target.value)} onKeyDown={e=>e.key==="Enter"&&runWikiAsk()}/>
                    <button className="btn btn-gold" style={{fontSize:12.5}} onClick={runWikiAsk} disabled={wikiAskLoading||!wikiAskQ.trim()}>
                      {wikiAskLoading?"Szukam…":"Zapytaj"}
                    </button>
                  </div>
                  {wikiAskError&&<div style={{fontSize:12,color:"var(--rose)",marginTop:8}}>{wikiAskError}</div>}
                  {wikiAskAnswer&&(
                    <div style={{marginTop:10,fontSize:13.5,lineHeight:1.6,whiteSpace:"pre-wrap",color:dark?"var(--dark-text)":"var(--text-primary)",borderTop:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,paddingTop:10}}>
                      {wikiAskAnswer}
                      <div style={{fontSize:10.5,color:dark?"var(--dark-text-muted)":"var(--text-muted)",marginTop:8,fontStyle:"italic"}}>Zweryfikuj w pełnym temacie poniżej. Asystent nie zastępuje kierownika.</div>
                    </div>
                  )}
                </div>
              )}
              <div style={{display:"grid",gridTemplateColumns:"16px 1fr",alignItems:"center",gap:8,background:dark?"rgba(255,255,255,.05)":"var(--bg-secondary)",border:"1px solid",borderColor:dark?"var(--dark-border)":"var(--border-light)",borderRadius:"var(--radius-md)",padding:"9px 12px",marginBottom:14}}>
                <Search size={14} style={{color:"var(--text-faint)"}}/>
                <input style={{background:"transparent",border:"none",outline:"none",fontSize:13.5,color:dark?"var(--dark-text)":"var(--text-primary)"}} placeholder="Szukaj tematów…" value={wikiSearch} onChange={e=>setWikiSearch(e.target.value)}/>
              </div>
              <div style={{display:"grid",gap:7}}>
                {filteredWikiEntries.map(e=>(
                  <button key={e.id} onClick={()=>setWikiExpandedId(e.id)}
                    style={{width:"100%",textAlign:"left",background:dark?"rgba(255,255,255,.04)":"var(--bg-secondary)",border:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,borderRadius:"var(--radius-md)",padding:"11px 14px",cursor:"pointer",transition:"all .15s"}}
                    onMouseEnter={e_=>{ e_.currentTarget.style.borderColor=dark?"#B065A0":"#C988B7"; e_.currentTarget.style.background=dark?"rgba(176,101,160,.08)":"#fdf2f8"; }}
                    onMouseLeave={e_=>{ e_.currentTarget.style.borderColor=dark?"var(--dark-border)":"var(--border-light)"; e_.currentTarget.style.background=dark?"rgba(255,255,255,.04)":"var(--bg-secondary)"; }}>
                    <div style={{fontWeight:600,fontSize:13.5,color:dark?"var(--dark-text)":"var(--text-primary)",marginBottom:4}}>{e.topic}</div>
                    <div style={{fontSize:11.5,color:dark?"var(--dark-text-muted)":"var(--text-muted)",overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical"}}>{e.content?.slice(0,120)}…</div>
                  </button>
                ))}
                {filteredWikiEntries.length===0&&<div style={{fontSize:13,color:dark?"var(--dark-text-muted)":"var(--text-muted)",textAlign:"center",padding:"20px 0"}}>Brak wyników</div>}
              </div>
            </div>
          ):(()=>{
            const e=wikiEntries.find(x=>x.id===wikiExpandedId);
            if(!e)return null;
            return(
              <div style={{flex:1,overflowY:"auto",padding:"18px 20px"}}>
                {/* Back button + actions */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,gap:10}}>
                  <button onClick={()=>setWikiExpandedId(null)}
                    style={{display:"flex",alignItems:"center",gap:6,background:"none",border:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,borderRadius:"var(--radius-md)",padding:"6px 12px",cursor:"pointer",color:dark?"var(--dark-text-secondary)":"var(--text-secondary)",fontSize:13,fontWeight:600}}>
                    ← Wszystkie tematy
                  </button>
                  {canAccessManagerPanel&&(
                    <div style={{display:"flex",gap:7}}>
                      <button className={dark?"btn btn-outline-dark":"btn btn-outline"} style={{fontSize:12.5}} onClick={()=>startEditWiki(e)}>Edytuj</button>
                      <button className="btn btn-danger-outline" style={{fontSize:12.5}} onClick={()=>deleteWikiEntry(e.id)}>Usuń</button>
                    </div>
                  )}
                </div>
                {/* Topic header */}
                <div style={{marginBottom:16,paddingBottom:14,borderBottom:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`}}>
                  <div style={{fontSize:11,textTransform:"uppercase",letterSpacing:".07em",color:dark?"var(--dark-text-muted)":"var(--text-muted)",marginBottom:6}}>Temat</div>
                  <div style={{fontSize:20,fontWeight:700,color:dark?"var(--dark-text)":"var(--text-primary)",lineHeight:1.3,marginBottom:6}}>{e.topic}</div>
                  <div style={{fontSize:11.5,color:dark?"var(--dark-text-muted)":"var(--text-muted)"}}>Aktualizacja: {e.updatedAt}</div>
                </div>
                {/* Full content */}
                <div style={{fontSize:14,lineHeight:1.8,color:dark?"var(--dark-text)":"var(--text-primary)",whiteSpace:"pre-wrap"}}>{e.content}</div>
                {e.images&&e.images.length>0&&(
                  <div style={{marginTop:18,display:"flex",flexWrap:"wrap",gap:12}}>
                    {e.images.map(img=>(<div key={img.id}><img src={img.data} alt={img.name} style={{maxWidth:"100%",maxHeight:240,borderRadius:"var(--radius-md)",border:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,cursor:"pointer"}} onClick={()=>window.open(img.data,"_blank")}/><div style={{fontSize:10.5,color:dark?"var(--dark-text-muted)":"var(--text-muted)",marginTop:4,textAlign:"center"}}>{img.name}</div></div>))}
                  </div>
                )}
              </div>
            );
          })()}
        </div>
        {canAccessManagerPanel&&(
          <div style={{borderTop:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,padding:"16px 20px",background:dark?"var(--dark-bg2)":"var(--bg-secondary)"}}>
            <div style={{fontSize:13,fontWeight:700,marginBottom:10,color:dark?"var(--dark-text)":"var(--text-primary)"}}>{editingWikiId?"Edycja tematu":"Dodaj nowy temat"}</div>
            <div className="stack">
              <div><label>Temat</label><input className={`input ${dark?"dark-input":""}`} placeholder="Np. Schematy zamków" value={wikiTopic} onChange={e=>setWikiTopic(e.target.value)}/></div>
              <div><label>Treść</label><textarea className={`textarea ${dark?"dark-input":""}`} style={{minHeight:130}} placeholder="Wpisz treść tematu…" value={wikiContent} onChange={e=>setWikiContent(e.target.value)}/></div>
              <div>
                <label>Zdjęcia</label>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:wikiImages.length?8:0}}>
                  <label style={{display:"inline-flex",alignItems:"center",gap:7,padding:"6px 12px",borderRadius:"var(--radius-md)",border:`1.5px dashed ${dark?"var(--dark-border)":"var(--border-medium)"}`,cursor:"pointer",fontSize:12.5,color:dark?"var(--dark-text-muted)":"var(--text-muted)",background:"transparent"}}>
                    🖼️ Dodaj zdjęcie
                    <input type="file" accept="image/*" multiple style={{display:"none"}} onChange={e=>handleWikiImageUpload(e.target.files)}/>
                  </label>
                  <span style={{fontSize:11,color:dark?"var(--dark-text-muted)":"var(--text-faint)"}}>Max 4MB</span>
                </div>
                {wikiImages.length>0&&(
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,marginTop:6}}>
                    {wikiImages.map(img=>(
                      <div key={img.id} style={{position:"relative",display:"inline-block"}}>
                        <img src={img.data} alt={img.name} style={{width:70,height:70,objectFit:"cover",borderRadius:"var(--radius-md)",border:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`}}/>
                        <button onClick={()=>removeWikiImage(img.id)} style={{position:"absolute",top:-5,right:-5,width:17,height:17,borderRadius:"50%",background:"var(--rose)",border:"none",color:"#fff",fontSize:10,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:700}}>×</button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div style={{display:"flex",gap:8}}><button className="btn btn-indigo" onClick={saveWikiEntry}>{editingWikiId?"Zapisz zmiany":"Dodaj temat"}</button><button className={dark?"btn btn-outline-dark":"btn btn-outline"} onClick={clearWikiForm}>Wyczyść</button></div>
            </div>
          </div>
        )}
      </motion.div>
    </>
  );

  // ── Admin panel ───────────────────────────────────────────────────────────────
  // (Title + manager info przeniesione do globalnego cc-shell-topbar w sekcji 2)
  const adminPanel=(
    <div>
      <div className="admin-content-full">
          {pendingCorrections.length>0&&adminTab!=="korekty"&&(
            <div style={{background:"var(--gold-soft, var(--gold-bg))",border:"1px solid var(--gold-border)",borderLeft:"4px solid var(--gold)",borderRadius:"var(--radius-md)",padding:"12px 16px",marginBottom:14,display:"flex",alignItems:"center",gap:14,flexWrap:"wrap"}}>
              <div style={{fontSize:13,fontWeight:700,color:"var(--amber)",display:"flex",alignItems:"center",gap:8}}><AlertTriangle size={16}/> {pendingCorrections.length} korekta(-y) oczekuje rozpatrzenia</div>
              <button className="btn btn-gold" style={{fontSize:12,marginLeft:"auto"}} onClick={()=>setAdminTab("korekty")}>Przejdź do korekt →</button>
            </div>
          )}
          {/* R3 wariant A — Admin overview KPI strip */}
          <div className="cc-kpi-grid" style={{marginBottom:14}}>
            <div
              className="cc-kpi cc-kpi-plum"
              onClick={()=>setAdminTab("pracownicy")}
              style={{cursor:"pointer"}}
              role="button"
              tabIndex={0}
              onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setAdminTab("pracownicy");}}}
              title="Otwórz Pracownicy">
              <div className="cc-kpi-label"><Users size={11} style={{display:"inline",verticalAlign:"middle",marginRight:4}}/>Pracownicy</div>
              <div className="cc-kpi-value">{employees.length}</div>
              <div className="cc-kpi-sub">Zarządzaj listą →</div>
            </div>
            <div
              className={`cc-kpi ${pendingCorrections.length===0?"cc-kpi-emerald":pendingCorrections.length>4?"cc-kpi-rose":"cc-kpi-gold"}`}
              onClick={()=>setAdminTab("korekty")}
              style={{cursor:"pointer"}}
              role="button"
              tabIndex={0}
              onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setAdminTab("korekty");}}}
              title="Otwórz Korekty">
              <div className="cc-kpi-label"><FileText size={11} style={{display:"inline",verticalAlign:"middle",marginRight:4}}/>Korekty</div>
              <div className="cc-kpi-value">{pendingCorrections.length}</div>
              <div className="cc-kpi-sub">{pendingCorrections.length===0?"Brak oczekujących":"Oczekuje rozpatrzenia →"}</div>
            </div>
            <div
              className={`cc-kpi ${faultsCount===0?"cc-kpi-emerald":faultsCount>4?"cc-kpi-rose":"cc-kpi-gold"}`}
              onClick={()=>setAdminTab("usterki")}
              style={{cursor:"pointer"}}
              role="button"
              tabIndex={0}
              onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setAdminTab("usterki");}}}
              title="Otwórz Usterki">
              <div className="cc-kpi-label"><AlertTriangle size={11} style={{display:"inline",verticalAlign:"middle",marginRight:4}}/>Usterki</div>
              <div className="cc-kpi-value">{faultsCount}</div>
              <div className="cc-kpi-sub">{faultsCount===0?"Brak otwartych":"Wymagają uwagi →"}</div>
            </div>
            <div
              className={`cc-kpi ${unreadMsgCount===0?"cc-kpi-emerald":"cc-kpi-gold"}`}
              onClick={()=>setAdminTab("wiadomosci")}
              style={{cursor:"pointer"}}
              role="button"
              tabIndex={0}
              onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setAdminTab("wiadomosci");}}}
              title="Otwórz Wiadomości">
              <div className="cc-kpi-label"><Bell size={11} style={{display:"inline",verticalAlign:"middle",marginRight:4}}/>Wiadomości</div>
              <div className="cc-kpi-value">{unreadMsgCount}</div>
              <div className="cc-kpi-sub">{unreadMsgCount===0?"Wszystko przeczytane":"Nieprzeczytane →"}</div>
            </div>
          </div>
      <AnimatePresence>
        {adminTab==="ewidencja"&&(
          <EwidencjaPanel
            evidenceMonth={evidenceMonth} setEvidenceMonth={setEvidenceMonth}
            availableMonths={availableMonths}
            filteredEvidenceLog={filteredEvidenceLog}
            exportEvidenceCSV={exportEvidenceCSV}
            resetEvidenceMonth={resetEvidenceMonth}
            resetAllEvidence={resetAllEvidence}
          />
        )}
        {adminTab==="zadania"&&(
          <ZadaniaPanel
            tasks={tasks}
            taskShiftTarget={taskShiftTarget} setTaskShiftTarget={setTaskShiftTarget}
            newTaskText={newTaskText} setNewTaskText={setNewTaskText}
            newTaskTime={newTaskTime} setNewTaskTime={setNewTaskTime}
            newTaskUrgent={newTaskUrgent} setNewTaskUrgent={setNewTaskUrgent}
            newTaskWeekdaysOnly={newTaskWeekdaysOnly} setNewTaskWeekdaysOnly={setNewTaskWeekdaysOnly}
            addTask={addTask} removeTask={removeTask}
            adminNotifType={adminNotifType} setAdminNotifType={setAdminNotifType}
            newGlobalNote={newGlobalNote} setNewGlobalNote={setNewGlobalNote}
            newGlobalNoteShift={newGlobalNoteShift} setNewGlobalNoteShift={setNewGlobalNoteShift}
            newGlobalNoteDate={newGlobalNoteDate} setNewGlobalNoteDate={setNewGlobalNoteDate}
            globalNotifications={globalNotifications}
            addGlobalNotification={addGlobalNotification}
            addManagerTask={addManagerTask}
            removeGlobalNotification={removeGlobalNotification}
          />
        )}
        {adminTab==="pracownicy"&&(
          <PracownicyPanel
            employees={employees}
            newEmployeeName={newEmployeeName} setNewEmployeeName={setNewEmployeeName}
            addEmployee={addEmployee}
            editingEmployeeIndex={editingEmployeeIndex} setEditingEmployeeIndex={setEditingEmployeeIndex}
            editingEmployeeName={editingEmployeeName} setEditingEmployeeName={setEditingEmployeeName}
            saveEditedEmployee={saveEditedEmployee}
            startEditEmployee={startEditEmployee}
            removeEmployee={removeEmployee}
            employeeActivityLog={employeeActivityLog}
            customManagers={customManagers}
            promoteToManager={promoteToManager}
            demoteManager={demoteManager}
          />
        )}
        {adminTab==="grafik"&&(
          <motion.div key="grafik" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <ScheduleAdminPanel schedule={schedule} setSchedule={setSchedule} employees={employees} dark={adminDark} showToast={showToast}/>
          </motion.div>
        )}
        {adminTab==="statystyki"&&(
          <StatystykiPanel
            weeklyStats={weeklyStats}
            employeeActivityLog={employeeActivityLog}
            paymentCorrections={paymentCorrections}
            activityDay={activityDay} setActivityDay={setActivityDay}
            askConfirm={askConfirm}
            currentManager={currentManager}
            setEmployeeActivityLog={setEmployeeActivityLog}
            setPaymentCorrections={setPaymentCorrections}
            addAudit={addAudit}
            showToast={showToast}
            saveJson={saveJson}
            STORAGE_KEYS={STORAGE_KEYS}
          />
        )}
        {adminTab==="ustawienia"&&(
          <UstawieniaPanel
            adminDark={adminDark} setAdminDark={setAdminDark}
            soundEnabled={soundEnabled} setSoundEnabled={setSoundEnabled}
            handleExportBackup={handleExportBackup}
            handleImportBackup={handleImportBackup}
          />
        )}
        {adminTab==="korekty"&&(
          <KorektyPanel
            paymentCorrections={paymentCorrections} setPaymentCorrections={setPaymentCorrections}
            pendingCorrections={pendingCorrections}
            correctionFilter={correctionFilter} setCorrectionFilter={setCorrectionFilter}
            expandedCorrection={expandedCorrection} setExpandedCorrection={setExpandedCorrection}
            customManagers={customManagers}
            askConfirm={askConfirm}
            setCorrectionApprovalModal={setCorrectionApprovalModal}
            downloadCorrectionPDF={downloadCorrectionPDF}
            currentManager={currentManager}
            showToast={showToast}
            saveJson={saveJson}
            STORAGE_KEYS={STORAGE_KEYS}
            setAdminTab={setAdminTab}
            addAudit={addAudit}
            setEmployeeActivityLog={setEmployeeActivityLog}
            employeeActivityLog={employeeActivityLog}
          />
        )}
        {adminTab==="usterki"&&(
          <motion.div key="usterki-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <FaultsPanel dark={adminDark} employeeName={currentManager} showToast={showToast} floors1={HK_FLOOR1} floors2={HK_FLOOR2} floors3={HK_FLOOR3} isManager={true}/>
          </motion.div>
        )}
        {adminTab==="wiadomosci"&&(
          <WiadomosciPanel
            weeklyStats={weeklyStats}
            employeeActivityLog={employeeActivityLog}
            pendingCorrections={pendingCorrections}
            paymentCorrections={paymentCorrections}
            messages={messages} setMessages={setMessages}
            setAdminTab={setAdminTab}
            adminDark={adminDark}
          />
        )}
        {adminTab==="alerty"&&(
          <motion.div key="alerty" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <AlertsAdminPanel currentManager={currentManager} showToast={showToast} addAudit={addAudit}/>
          </motion.div>
        )}
        {adminTab==="przypomnienia"&&(
          <motion.div key="przypomnienia" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <StandingRemindersPanel currentManager={currentManager} showToast={showToast} addAudit={addAudit}/>
          </motion.div>
        )}
        {adminTab==="historia"&&(
          <HistoriaPanel
            incidentLog={incidentLog} setIncidentLog={setIncidentLog}
            carryOverTasks={carryOverTasks} setCarryOverTasks={setCarryOverTasks}
            handoverLog={handoverLog} setHandoverLog={setHandoverLog}
            askConfirm={askConfirm}
            currentManager={currentManager}
            addAudit={addAudit}
            showToast={showToast}
            saveJson={saveJson}
            STORAGE_KEYS={STORAGE_KEYS}
          />
        )}
        {adminTab==="wiki"&&(
          <WikiAdminPanel
            wikiEntries={wikiEntries}
            startEditWiki={startEditWiki}
            setShowWiki={setShowWiki}
          />
        )}
        {adminTab==="kasa"&&(
          <KasaAdminPanel
            stalaKasowa={stalaKasowa}
            managerNewStala={managerNewStala} setManagerNewStala={setManagerNewStala}
            setStalaKasowaByManager={setStalaKasowaByManager}
            messages={messages}
          />
        )}
        {adminTab==="czat"&&(
          <motion.div key="czat-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <TeamChat employeeName={currentManager||employeeName} isManager={true} showToast={showToast} hkStaff={hkStaff} onApplySwap={applyAgentSwap} onSeen={()=>setChatTick(t=>t+1)}/>
          </motion.div>
        )}
      </AnimatePresence>
      </div>{/* end admin-content-full */}
    </div>
  );

  // ── Worker view ───────────────────────────────────────────────────────────────
  const workerView=(
    <div>
      <AnimatePresence>
        {workerTab==="zmiana"&&(
          <motion.div key="zm" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            {llmReady&&started&&(
              <div className="panel" style={{borderLeft:"3px solid var(--gold)",marginBottom:12,padding:"10px 14px"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,fontWeight:700,fontSize:13}}><Sparkles size={14} style={{color:"var(--gold)"}}/> Briefing zmiany</div>
                  <button className="btn btn-gold" style={{fontSize:11.5,padding:"4px 10px"}} onClick={runBriefing} disabled={briefingLoading}>{briefingLoading?"…":briefingText?"Odśwież":"Wygeneruj"}</button>
                </div>
                {briefingError&&<div style={{fontSize:11.5,color:"var(--rose)",marginTop:6}}>{briefingError}</div>}
                {briefingText&&<div style={{marginTop:8,fontSize:12.5,lineHeight:1.55,whiteSpace:"pre-wrap",color:"var(--text-primary)"}}>{briefingText}</div>}
              </div>
            )}
            {!started?(
              <div className="stack">
                {IS_DEV_TEST&&(
                  <div style={{background:"#1a0a2e",border:"2px dashed #7c3aed",borderRadius:12,padding:"12px 16px"}}>
                    <div style={{fontSize:11,fontWeight:800,color:"#c4b5fd",letterSpacing:".08em",textTransform:"uppercase",marginBottom:8}}>🧪 TRYB TESTOWY — zmiana daty raportów</div>
                    <div style={{fontSize:12,color:"#a78bfa",marginBottom:10}}>Data raportu: <strong style={{color:"#e9d5ff"}}>{todayKey(getTestDate())}</strong></div>
                    <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                      {[0,-1,-2,-3,-4,-5,-6].map(offset=>(
                        <button key={offset} onClick={()=>setTestDateOffset(offset)}
                          style={{padding:"5px 10px",borderRadius:6,fontSize:11.5,fontWeight:700,cursor:"pointer",border:"1px solid",
                            borderColor:testDateOffset===offset?"#7c3aed":"#4c1d95",
                            background:testDateOffset===offset?"#5b21b6":"transparent",
                            color:testDateOffset===offset?"#fff":"#a78bfa"}}>
                          {offset===0?"Dziś":offset===-1?"Wczoraj":`-${Math.abs(offset)} dni`}
                        </button>
                      ))}
                    </div>
                    <div style={{fontSize:10.5,color:"#6E2B5C",marginTop:8}}>Raporty zostaną zapisane z wybraną datą — użyj do testowania raportu dobowego</div>
                  </div>
                )}
                <div className="panel cc-fade-up" style={{position:"relative",overflow:"hidden"}}>
                  <div style={{position:"relative",zIndex:1}}>
                    <div className="panel-title big"><ClipboardList size={20}/> Rozpoczęcie zmiany</div>

                    {/* Pelnoekranowy login obsluguje kroki name+password; tu pokazujemy tylko gotowy stan */}
                    {loginStep==="ready"&&(
                      <div className="cc-fade-up">
                        <div style={{padding:"10px 14px",background:"var(--plum-soft)",border:"1px solid var(--plum-border)",borderRadius:"var(--radius-md)",marginBottom:14,display:"flex",alignItems:"center",justifyContent:"space-between",gap:10}}>
                          <div style={{display:"flex",alignItems:"center",gap:10}}>
                            <div style={{width:36,height:36,borderRadius:"50%",background:"var(--plum)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14}}>{employeeName.charAt(0).toUpperCase()}</div>
                            <div>
                              <div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)"}}>{employeeName}{canAccessManagerPanel&&<span style={{marginLeft:8,fontSize:10,padding:"2px 7px",borderRadius:999,background:"var(--plum)",color:"#fff",fontWeight:700,letterSpacing:".05em",textTransform:"uppercase"}}>Kierownik</span>}</div>
                              <div style={{fontSize:11,color:"var(--text-muted)"}}>{loginShiftSource==="schedule"?"Zmiana pobrana z grafiku kierownika":"System wykrył Twoją zmianę z godziny komputera"}</div>
                            </div>
                          </div>
                          <button className="btn btn-outline" style={{fontSize:11.5}} onClick={()=>{
                            setLoginStep("name");setEmployeeName("");setSelectedShift("");setPendingAutoStart(false);setLoginShiftSource("clock");
                            if(canAccessManagerPanel)clearManagerSession();
                          }}>Zmień osobę</button>
                        </div>
                        {/* Auto-wykryta zmiana — duza karta z mozliwoscia zmiany */}
                        <div style={{padding:"14px 16px",background:"var(--bg-card)",border:"1px solid var(--border-light)",borderLeft:"4px solid var(--gold)",borderRadius:"var(--radius-md)",marginBottom:12}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                            <div>
                              <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:4}}>Twoja zmiana</div>
                              <div style={{fontSize:18,fontWeight:400,fontFamily:"'DM Serif Display',serif",color:"var(--text-primary)",letterSpacing:".005em"}}>{shiftFullLabel(selectedShift)}</div>
                            </div>
                            {loginShiftSource==="schedule"?(
                              <div style={{display:"flex",flexDirection:"column",alignItems:"flex-end",gap:4}}>
                                <span style={{fontSize:10.5,fontWeight:700,padding:"2px 8px",borderRadius:999,background:"var(--emerald-light)",color:"var(--emerald)",border:"1px solid var(--emerald-border)",letterSpacing:".04em",textTransform:"uppercase"}}>Z grafiku</span>
                                <details style={{position:"relative"}}>
                                  <summary style={{listStyle:"none",cursor:"pointer",fontSize:10.5,color:"var(--text-muted)",fontWeight:600}}>zmień ręcznie ▾</summary>
                                  <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,background:"var(--bg-card)",border:"1px solid var(--border-medium)",borderRadius:8,padding:6,zIndex:10,boxShadow:"var(--shadow-md)",minWidth:200}}>
                                    {SHIFT_OPTIONS.map(s=>(
                                      <button key={s} type="button" onClick={()=>{setSelectedShift(s);setLoginShiftSource("clock");}}
                                        style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",border:"none",background:selectedShift===s?"var(--plum-soft)":"transparent",color:selectedShift===s?"var(--plum)":"var(--text-secondary)",fontWeight:selectedShift===s?700:500,borderRadius:5,cursor:"pointer",fontSize:13}}>
                                        {SHIFT_LABELS_PL[s]}
                                      </button>
                                    ))}
                                  </div>
                                </details>
                              </div>
                            ):(
                              <details style={{position:"relative"}}>
                                <summary style={{listStyle:"none",cursor:"pointer",fontSize:11.5,color:"var(--plum)",fontWeight:700,padding:"4px 10px",border:"1px solid var(--plum-border)",borderRadius:6,background:"var(--plum-soft)"}}>Zmień ▾</summary>
                                <div style={{position:"absolute",top:"calc(100% + 4px)",right:0,background:"var(--bg-card)",border:"1px solid var(--border-medium)",borderRadius:8,padding:6,zIndex:10,boxShadow:"var(--shadow-md)",minWidth:200}}>
                                  {SHIFT_OPTIONS.map(s=>(
                                    <button key={s} type="button" onClick={()=>setSelectedShift(s)}
                                      style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",border:"none",background:selectedShift===s?"var(--plum-soft)":"transparent",color:selectedShift===s?"var(--plum)":"var(--text-secondary)",fontWeight:selectedShift===s?700:500,borderRadius:5,cursor:"pointer",fontSize:13}}>
                                      {SHIFT_LABELS_PL[s]}
                                    </button>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        </div>
                        <div className="between responsive-gap" style={{marginTop:14}}>
                          <div className="muted">Po rozpoczęciu zmiany zobaczysz dashboard i listę zadań.</div>
                          <div style={{display:"flex",gap:8}}>
                            {canAccessManagerPanel&&(
                              <button className="btn btn-outline" onClick={()=>{
                                localStorage.setItem("reception-last-view","manager");
                                setLastView("manager");
                                setShowAdminPanel(true);
                              }}>
                                Otwórz panel kierownika →
                              </button>
                            )}
                            <button className="btn btn-rose" disabled={!selectedShift} onClick={handleStartShift}>Rozpocznij zmianę</button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {lastHandoverNote&&(
                  <div className="panel" style={{borderColor:"var(--sky-border)",background:"var(--sky-light)",position:"relative"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                      <div className="panel-title sky-text" style={{marginBottom:8}}><MessageSquare size={16}/> Notatka od poprzedniej zmiany</div>
                      <button onClick={()=>{localStorage.setItem("reception-handover-seen",lastHandoverNote.id);setHandoverNoteDismissed(lastHandoverNote.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--sky)",padding:"2px",borderRadius:"50%",display:"flex",alignItems:"center",opacity:.7,flexShrink:0}} title="Zamknij notatkę"><X size={15}/></button>
                    </div>
                    <div style={{fontSize:13.5,lineHeight:1.65,color:"var(--text-primary)"}}>{lastHandoverNote.text}</div>
                    <div className="tiny muted" style={{marginTop:6}}>{lastHandoverNote.employee} · {SHIFT_SHORT_LABELS[lastHandoverNote.shift]||lastHandoverNote.shift} · {lastHandoverNote.createdAt}</div>
                  </div>
                )}
                {(visibleGlobalNotes.length>0)&&(
                  <div className="panel cc-globalnotes-panel" style={{position:"relative"}}>
                    <div className="panel-title cc-globalnotes-title" style={{marginBottom:12}}><Bell size={15}/> Ważne informacje</div>
                    <div style={{display:"grid",gap:8}}>
                      {visibleGlobalNotes.map(n=>(
                        <div key={n.id} className="notif-item cc-globalnotes-item" style={{position:"relative"}}>
                          <div style={{flex:1}}>
                            <div style={{fontSize:13.5,color:"var(--cc-text)",lineHeight:1.55,fontWeight:500}}>{n.text}</div>
                            <div style={{fontSize:11,color:"var(--cc-text-muted)",marginTop:3}}>{n.createdBy} · {n.createdAt}</div>
                          </div>
                          {n.fromManager?(
                            <div title="Powiadomienie od kierownika — usuwa tylko kierownik"
                              className="cc-globalnotes-mgr-mark"
                              style={{flexShrink:0,display:"flex",alignItems:"center",padding:"3px",opacity:.5}}>
                              <ShieldCheck size={13}/>
                            </div>
                          ):(
                            <button onClick={()=>dismissGlobalNote(n.id)}
                              className="cc-globalnotes-dismiss"
                              style={{flexShrink:0,display:"flex",alignItems:"center"}}
                              title="Zamknij — nie będzie się więcej pokazywać">
                              <X size={13}/>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ):(
              <div className="stack v2-dashboard">
                {/* ═══ v2 TOPBAR — crumb + title + meta + live clock ═══ */}
                <div className="v2-dash-topbar">
                  <div>
                    <div className="v2-dash-crumb">
                      <span className="v2-dash-crumb-pill">Zmiana</span>
                      <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M9 18l6-6-6-6"/></svg>
                      <span>Przegląd</span>
                    </div>
                    <h1 className="v2-dash-title">
                      {(()=>{const h=getNow().getHours();return h<18?"Dzień dobry":"Dobry wieczór";})()}, {employeeName}
                      <span className="v2-live-pill">Live · {shiftShortLabel(selectedShift)}</span>
                    </h1>
                    <div className="v2-dash-meta">
                      <span>Start: <b>{shiftStartTime?new Date(shiftStartTime).toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"}):"—"}</b></span>
                      <span>Trwa: <b>{shiftElapsed||"chwilę"}</b></span>
                      <span>Zadania: <b style={{color:progress===100?"var(--emerald)":"var(--plum)"}}>{totalDone}/{totalMandatory}</b></span>
                      {inboxCount>0&&<span>Alerty: <b style={{color:"var(--rose)"}}>{inboxCount}</b></span>}
                    </div>
                  </div>
                  <div className="v2-dash-clock">
                    <div className="v2-dash-clock-time">{liveTime}</div>
                    <div className="v2-dash-clock-date">{new Date().toLocaleDateString("pl-PL",{weekday:"short",day:"2-digit",month:"short"})}</div>
                  </div>
                </div>

                {/* ═══ v2 KPI ROW ═══ */}
                <div className="v2-kpi-row">

                  <div
                    className="v2-kpi v2-kpi-plum v2-kpi-click"
                    onClick={()=>setWorkerTab("zadania")}
                    role="button" tabIndex={0}
                    onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setWorkerTab("zadania");}}}
                    title="Otwórz Zadania">
                    <div className="v2-kpi-head">
                      <span className="v2-kpi-label">Zadania zmiany</span>
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" style={{color:"var(--plum)"}}><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    </div>
                    <div className="v2-kpi-value">{totalDone}<span className="v2-kpi-unit">/ {totalMandatory}</span></div>
                    <div className="v2-kpi-bar"><div className="v2-kpi-bar-fill" style={{width:`${progress}%`}}/></div>
                    <div className="v2-kpi-sub">{progress}% wykonano</div>
                  </div>

                  <div className="v2-kpi v2-kpi-gold">
                    <div className="v2-kpi-head">
                      <span className="v2-kpi-label">Kasa stała</span>
                      <button
                        onClick={()=>setCashVisible(v=>!v)}
                        title={cashVisible?"Ukryj kwoty (gość przy recepcji)":"Pokaż kwoty"}
                        aria-label={cashVisible?"Ukryj kwoty":"Pokaż kwoty"}
                        style={{background:"none",border:"none",cursor:"pointer",padding:2,color:"var(--text-muted)",display:"flex",alignItems:"center"}}>
                        {cashVisible?<EyeOff size={13}/>:<Eye size={13}/>}
                      </button>
                    </div>
                    <div className="v2-kpi-value v2-kpi-mono" aria-live="polite">{cashVisible?fmtMoney(stalaKasowa):"•••"}</div>
                    <div className="v2-kpi-sub">
                      {stalaPotwierdzono&&!stalaNiezgodnosc?<span style={{color:"var(--emerald)"}}>✓ Potwierdzona</span>:
                       stalaNiezgodnosc?<span style={{color:"var(--rose)"}}>⚠ Niezgodność</span>:
                       <span style={{color:"var(--gold)"}}>● Wymaga potwierdzenia</span>}
                    </div>
                  </div>

                  <div className="v2-kpi v2-kpi-emerald">
                    <div className="v2-kpi-head">
                      <span className="v2-kpi-label">KW dokumentów</span>
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" style={{color:"var(--emerald)"}}><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    </div>
                    <div className="v2-kpi-value v2-kpi-mono">{cashVisible?(cashClosingDocumentsAmount?fmtMoney(parseFloat(cashClosingDocumentsAmount)||0):"—"):"•••"}</div>
                    <div className="v2-kpi-sub">{cashDiff!==null?(cashVisible?`Łącznie: ${fmtMoney(cashDiff)}`:"Łącznie: •••"):"Wpisz na koniec zmiany"}</div>
                  </div>

                  <div className="v2-kpi v2-kpi-plum">
                    <div className="v2-kpi-head">
                      <span className="v2-kpi-label">Trwa zmiana</span>
                      <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" style={{color:"var(--plum)"}}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    </div>
                    <div className="v2-kpi-value v2-kpi-mono">{shiftElapsed||"—"}</div>
                    <div className="v2-kpi-sub">{shiftFullLabel(selectedShift)}</div>
                  </div>

                  <div
                    className={`v2-kpi v2-kpi-click ${inboxCount===0?"v2-kpi-emerald":inboxCount>5?"v2-kpi-rose":"v2-kpi-gold"}`}
                    onClick={()=>setWorkerTab("informacje")}
                    role="button" tabIndex={0}
                    onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setWorkerTab("informacje");}}}
                    title="Otwórz Informacje">
                    <div className="v2-kpi-head">
                      <span className="v2-kpi-label">Alerty</span>
                      <Bell size={13} style={{color:inboxCount===0?"var(--emerald)":inboxCount>5?"var(--rose)":"var(--gold)"}}/>
                    </div>
                    <div className="v2-kpi-value">{inboxCount}</div>
                    <div className="v2-kpi-sub">{inboxCount===0?"Nic nowego":"Zobacz Informacje →"}</div>
                  </div>

                </div>

                {/* ═══ KASA ZMIANY — Cash Card v2 (wg design-preview/v2/02-recepcja-dzienna) ═══
                    Łączy w jednej karcie: stała kasowa potwierdzenie (status pill, nie baner) +
                    KW poprzednia (read-only) + KW końcowa (input) + przyrost computed.
                    Plus cash-result tile z formułą + akcje (Zakończ zmianę, Wróć).
                ═══════════════════════════════════════════════════════════════════════════ */}
                <section className="cc-cash-card" aria-labelledby="cc-cash-card-title">
                  <header className="cc-cash-card-head">
                    <div className="cc-cash-card-headline">
                      <FileText size={15} className="cc-cash-card-icon"/>
                      <h2 id="cc-cash-card-title" className="cc-cash-card-title">Kasa zmiany</h2>
                    </div>
                    <div className="cc-cash-card-meta">
                      <button
                        type="button"
                        className="cc-cash-card-eye"
                        onClick={()=>setCashVisible(v=>!v)}
                        title={cashVisible?"Ukryj kwoty":"Pokaż kwoty"}
                        aria-label={cashVisible?"Ukryj kwoty":"Pokaż kwoty"}>
                        {cashVisible?<EyeOff size={13}/>:<Eye size={13}/>}
                      </button>
                      <span className="cc-cash-card-meta-txt">PLN · zaokrąglanie 0,01</span>
                    </div>
                  </header>

                  <div className="cc-cash-card-grid">
                    {/* CELL 1: Stała kasowa + status pill */}
                    <div className="cc-cash-cell">
                      <label className="cc-cash-cell-lbl">
                        Stała kasowa
                        {!stalaPotwierdzono&&!stalaNiezgodnosc&&(
                          <span className="cc-cash-cell-pill cc-cash-cell-pill--warn" title="Wymaga potwierdzenia">●</span>
                        )}
                        {stalaPotwierdzono&&(
                          <span className="cc-cash-cell-pill cc-cash-cell-pill--ok" title="Potwierdzona">✓</span>
                        )}
                        {stalaNiezgodnosc&&(
                          <span className="cc-cash-cell-pill cc-cash-cell-pill--err" title="Niezgodność">!</span>
                        )}
                      </label>
                      <div className="cc-cash-cell-val">
                        <span className="cc-cash-cell-num">{cashVisible?fmtMoney(stalaKasowa):"•••"}</span>
                      </div>
                      {!stalaPotwierdzono&&!stalaNiezgodnosc&&(
                        <div className="cc-cash-cell-actions">
                          <button
                            type="button"
                            className="cc-cash-cell-btn cc-cash-cell-btn--ok"
                            onClick={()=>setStalaPotwierdzono(true)}>
                            ✓ Zgadza się
                          </button>
                          <button
                            type="button"
                            className="cc-cash-cell-btn cc-cash-cell-btn--err"
                            onClick={()=>setShowStalaDiscrepancyForm(v=>!v)}>
                            ⚠ Niezgodność
                          </button>
                        </div>
                      )}
                      {showStalaDiscrepancyForm&&!stalaPotwierdzono&&(
                        <div className="cc-cash-cell-discr">
                          <input
                            className="cc-cash-cell-discr-input"
                            type="number" min="0" step="0.01"
                            placeholder="Ile faktycznie?"
                            value={stalaDiscrepancyInput}
                            onChange={e=>setStalaDiscrepancyInput(e.target.value)}/>
                          <button
                            type="button"
                            className="cc-cash-cell-btn cc-cash-cell-btn--err"
                            onClick={()=>reportStalaDiscrepancy(stalaDiscrepancyInput)}>
                            Zgłoś
                          </button>
                        </div>
                      )}
                    </div>

                    {/* CELL 2: KW total poprzednia (read-only) */}
                    <div className="cc-cash-cell">
                      <label className="cc-cash-cell-lbl">KW poprzedniej zmiany</label>
                      <div className="cc-cash-cell-val">
                        <span className="cc-cash-cell-num cc-cash-cell-num--muted">{cashVisible?fmtMoney(kwTotal):"•••"}</span>
                      </div>
                      <div className="cc-cash-cell-hint">read-only · dane z systemu</div>
                    </div>

                    {/* CELL 3: KW total końcowa (input z ember accent) */}
                    <div className="cc-cash-cell cc-cash-cell--active">
                      <label className="cc-cash-cell-lbl" htmlFor="cc-cash-kw-end">
                        KW końcowa <span className="cc-cash-cell-lbl-req">wymagane</span>
                      </label>
                      <div className="cc-cash-cell-val">
                        <input
                          id="cc-cash-kw-end"
                          className="cc-cash-cell-input"
                          type="number" min="0" step="0.01"
                          placeholder="0,00"
                          value={cashClosingDocumentsAmount}
                          onChange={e=>setCashClosingDocumentsAmount(e.target.value)}/>
                        <span className="cc-cash-cell-unit">PLN</span>
                      </div>
                      <div className="cc-cash-cell-hint">wpisz z drukarki kasowej</div>
                    </div>

                    {/* CELL 4: Przyrost KW (computed) */}
                    <div className="cc-cash-cell cc-cash-cell--computed">
                      <label className="cc-cash-cell-lbl">Przyrost KW (auto)</label>
                      <div className="cc-cash-cell-val">
                        {cashClosingDocumentsAmount.trim()?(
                          <span className="cc-cash-cell-num cc-cash-cell-num--success">
                            +{cashVisible?fmtMoney((parseFloat(cashClosingDocumentsAmount)||0)-kwTotal):"•••"}
                          </span>
                        ):(
                          <span className="cc-cash-cell-num cc-cash-cell-num--placeholder">—</span>
                        )}
                      </div>
                      <div className="cc-cash-cell-hint">{cashClosingDocumentsAmount.trim()?"= końcowa − poprzednia":"po wpisaniu KW końcowej"}</div>
                    </div>
                  </div>

                  {/* CASH RESULT TILE */}
                  {cashDiff!==null&&(
                    <div className="cc-cash-result">
                      <div className="cc-cash-result-info">
                        <div className="cc-cash-result-lbl">Kasa końcowa zmiany</div>
                        <div className="cc-cash-result-formula">{cashVisible?`${fmtMoney(stalaKasowa)} + ${fmtMoney(parseFloat(cashClosingDocumentsAmount)||0)} (przyrost KW)`:"••• + ••• (przyrost KW)"}</div>
                      </div>
                      <div className="cc-cash-result-val">
                        {cashVisible?fmtMoney(cashDiff):"•••"}
                        <span className="cc-cash-result-unit">PLN</span>
                      </div>
                    </div>
                  )}

                  {/* ACTIONS — wbudowane w kartę kasową (zamiast osobnego baneru "alert") */}
                  <footer className="cc-cash-card-foot">
                    {!canFinishShift&&(
                      <div className="cc-cash-card-warn" role="status">
                        <AlertTriangle size={13}/>
                        <span>Uzupełnij KW końcową, aby zakończyć zmianę</span>
                      </div>
                    )}
                    <div className="cc-cash-card-actions">
                      <button
                        type="button"
                        className="cc-cash-card-action cc-cash-card-action--ghost"
                        onClick={attemptLeaveShift}>
                        Wróć do wyboru
                      </button>
                      <button
                        type="button"
                        className="cc-cash-card-action cc-cash-card-action--primary"
                        disabled={!canFinishShift}
                        onClick={()=>setFinishDialogOpen(true)}>
                        Zakończ zmianę →
                      </button>
                    </div>
                  </footer>
                </section>
              </div>
            )}
          </motion.div>
        )}
        {workerTab==="zadania"&&started&&(
          <motion.div key="zad" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="stack">
            {lastHandoverNote&&(
              <div className="panel" style={{borderColor:"var(--sky-border)",background:"var(--sky-light)",position:"relative"}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                  <div className="panel-title sky-text" style={{marginBottom:6}}><MessageSquare size={15}/> Notatka od poprzedniej zmiany</div>
                  <button onClick={()=>{localStorage.setItem("reception-handover-seen",lastHandoverNote.id);setHandoverNoteDismissed(lastHandoverNote.id);}} style={{background:"none",border:"none",cursor:"pointer",color:"var(--sky)",padding:"2px",display:"flex",alignItems:"center",opacity:.7,flexShrink:0}} title="Zamknij notatkę"><X size={14}/></button>
                </div>
                <div style={{fontSize:13,lineHeight:1.6,color:"var(--text-primary)"}}>{lastHandoverNote.text}</div>
                <div className="tiny muted" style={{marginTop:4}}>{lastHandoverNote.employee} · {SHIFT_SHORT_LABELS[lastHandoverNote.shift]||lastHandoverNote.shift} · {lastHandoverNote.createdAt}</div>
              </div>
            )}
            {todayDatedReminders.length>0&&(
              <div className="panel dated-reminder-panel">
                <div className="panel-title sky-text"><Calendar size={16}/> Ważne informacje dla tej zmiany</div>
                <div className="stack">
                  {todayDatedReminders.map(r=>(
                    <div key={r.id} className="dated-reminder-item">
                      <div><div style={{fontWeight:600,fontSize:14.5}}>{r.text}</div><div className="tiny sky-text" style={{marginTop:3}}>Dodane przez {r.createdBy} · {r.createdAt}</div></div>
                      <button className="btn btn-outline" style={{fontSize:12.5}} onClick={()=>dismissDatedReminder(r.id)}>Zamknij</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {dueConfirmReminders.length>0&&(
              <div className="panel dated-reminder-panel">
                <div className="panel-title amber-text"><BellRing size={16}/> Do potwierdzenia — czy się wydarzyło?</div>
                <div className="stack">
                  {dueConfirmReminders.map(r=>(
                    <div key={r.id} className="dated-reminder-item">
                      <div>
                        <div style={{fontWeight:600,fontSize:14.5}}>{r.text}</div>
                        <div className="tiny amber-text" style={{marginTop:3}}>{r.targetDate<currentSessionDate?`Zaległe od ${r.targetDate} — `:"Termin na dziś — "}potwierdź, gdy będzie załatwione</div>
                      </div>
                      <div style={{display:"flex",gap:6,flexShrink:0}}>
                        <button className="btn btn-emerald" style={{fontSize:12.5}} onClick={()=>confirmDatedReminder(r.id)}>✅ Tak, odhacz</button>
                        <button className="btn btn-outline" style={{fontSize:12.5}} onClick={()=>snoozeConfirmReminder(r.id)}>Jeszcze nie</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {overdueTasks.length>0&&(
              <div className="panel reminder-panel">
                <div className="panel-title amber-text"><BellRing size={16}/> Przypomnienie o zadaniach do wykonania</div>
                <div className="stack">
                  {overdueTasks.map(task=>(
                    <div key={task.id} className="reminder-item">
                      <div><div className="strong">{task.text}</div><div className="tiny amber-text">Zaplanowane na {task.scheduledTime}</div></div>
                      <button className="btn btn-outline" style={{fontSize:12.5}} onClick={()=>setDismissedReminderKeys(prev=>[...prev,`${todayKey()}-${selectedShift}-${task.id}-${task.scheduledTime}`])}>Zamknij</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {/* ═══ TASKS LIST v2 (wg design-preview/v2/02-recepcja-dzienna .tlist) ═══
                Pojedyncza karta z listą zadań: header (count + sync) + rows
                (check + text + tag + time). Sortowanie: pilne/spóźnione → zaplanowane → done.
            ═══════════════════════════════════════════════════════════════════════ */}
            {(()=>{
              const enriched=currentTasks.map((task,index)=>{
                const isDone=!!completed[index];
                const isOverdue=!isDone&&task.scheduledTime&&(()=>{const now=new Date();const[h,m]=task.scheduledTime.split(":").map(Number);const sd=new Date(now);sd.setHours(h||0,m||0,0,0);return now>=sd&&shiftStartTime&&sd>=shiftStartTime;})();
                return {task,index,isDone,isOverdue};
              });
              // Sort: done last, urgent/overdue first, then by scheduledTime asc
              const sorted=[...enriched].sort((a,b)=>{
                if(a.isDone!==b.isDone) return a.isDone?1:-1;
                const aHot=(a.task.urgent||a.isOverdue)?0:1;
                const bHot=(b.task.urgent||b.isOverdue)?0:1;
                if(aHot!==bHot) return aHot-bHot;
                const at=a.task.scheduledTime||"99:99";
                const bt=b.task.scheduledTime||"99:99";
                return at.localeCompare(bt);
              });
              const totalCount=enriched.length;
              const doneCount=enriched.filter(t=>t.isDone).length;
              const hotCount=enriched.filter(t=>!t.isDone&&(t.task.urgent||t.isOverdue)).length;
              return (
                <section className="cc-task-card" aria-labelledby="cc-task-card-title">
                  <header className="cc-task-card-head">
                    <div className="cc-task-card-headline">
                      <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" className="cc-task-card-icon" aria-hidden="true">
                        <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                      </svg>
                      <h2 id="cc-task-card-title" className="cc-task-card-title">Zadania zmiany</h2>
                    </div>
                    <div className="cc-task-card-meta">
                      <span className="cc-task-card-count">
                        <strong>{doneCount}</strong> / {totalCount} <span className="cc-task-card-count-lbl">ukończono</span>
                      </span>
                      {hotCount>0&&(
                        <span className="cc-task-card-hot">
                          <span className="cc-task-card-hot-dot" aria-hidden="true"/>
                          {hotCount} pilne
                        </span>
                      )}
                    </div>
                  </header>

                  {sorted.length===0?(
                    <div className="cc-task-card-empty">
                      <div className="cc-task-card-empty-mark">·</div>
                      <div>Brak zadań dla tej zmiany.</div>
                    </div>
                  ):(
                    <ul className="cc-task-list" role="list">
                      {sorted.map(({task,index,isDone,isOverdue})=>(
                        <motion.li
                          key={task.id}
                          layout
                          className={`cc-task-row${isDone?" cc-task-row--done":""}${task.urgent&&!isDone?" cc-task-row--urgent":""}${isOverdue?" cc-task-row--overdue":""}`}>
                          <button
                            type="button"
                            className="cc-task-check"
                            onClick={()=>toggleTask(index,!isDone)}
                            aria-label={isDone?"Cofnij wykonanie zadania":"Oznacz jako zrobione"}
                            aria-pressed={isDone}>
                            {isDone&&(
                              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="3" viewBox="0 0 24 24" aria-hidden="true">
                                <polyline points="20 6 9 17 4 12"/>
                              </svg>
                            )}
                          </button>
                          <div className="cc-task-text">{task.text}</div>
                          <div className="cc-task-tags">
                            {task.urgent&&!isDone&&<span className="cc-task-tag cc-task-tag--urgent">Pilne</span>}
                            {task.weekdaysOnly&&!isDone&&<span className="cc-task-tag cc-task-tag--neutral">Pn-Pt</span>}
                            {!task.urgent&&!task.weekdaysOnly&&task.required&&!isDone&&<span className="cc-task-tag cc-task-tag--req">Wymagane</span>}
                          </div>
                          {task.scheduledTime&&(
                            <time className={`cc-task-time${isOverdue?" cc-task-time--late":""}`}>
                              {task.scheduledTime}
                            </time>
                          )}
                        </motion.li>
                      ))}
                    </ul>
                  )}
                </section>
              );
            })()}
            {managerTasksForShift.length>0&&(
              <div className="panel">
                <div className="panel-title amber-text"><BellRing size={16}/> Zadania od menedżera (z panelu)</div>
                <div className="stack">
                  {managerTasksForShift.map(task=>{
                    let body=task.body||"",people="";
                    const mt=body.match(/^Dla(?: os[oó]b)?:\s*([^\n]+)\n?/i);
                    if(mt){people=mt[1];body=body.slice(mt[0].length);}
                    return(
                      <div key={task.id} className="carry-row">
                        <input type="checkbox" checked={false} onChange={()=>markManagerTaskDone(task.id)}/>
                        <div className="flex-1">
                          <div className="strong-ish" style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
                            {task.priority==="high"&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:999,background:"rgba(154,48,64,.2)",color:"var(--cc-danger)",fontWeight:700}}>PILNE</span>}
                            {task.title}
                          </div>
                          {body&&body!==task.title&&<div className="tiny" style={{marginTop:2}}>{body}</div>}
                          <div className="tiny muted" style={{marginTop:3}}>Od: {task.created_by||"Menedżer"}{people?` · dla: ${people}`:""}{task.target_date?` · ${task.target_date}`:""}</div>
                        </div>
                        <span style={{fontSize:15,fontWeight:800,color:"var(--cc-danger)",lineHeight:1,flexShrink:0}}>✕</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <div className="panel">
              <div className="panel-title">Zadania przekazane tej zmianie — obowiązkowe</div>
              <div className="stack">
                {carryOverForCurrentShift.map((task,index)=>(
                  <div key={`${task.id}-${index}`} className={`carry-row ${task.done?"task-done":""}`}>
                    <input type="checkbox" checked={!!task.done} onChange={()=>markCarryOverDone(index)}/>
                    <div className="flex-1">
                      <div className={task.done?"line-through muted":"strong-ish"}>{task.text}</div>
                      <div className="tiny muted">Dodane przez: {task.createdBy} · ze zmiany: {SHIFT_NAME_PL[task.fromShift]||task.fromShift} · {task.createdAt}</div>
                      {task.done&&(
                        <div style={{marginTop:6}}>
                          <input className="input" style={{fontSize:12.5,padding:"6px 10px"}} placeholder="Co zrobiłeś w tej sprawie? (opcjonalnie, trafi do raportu)" value={task.doneNote||""} onChange={e=>updateCarryOverDoneNote(index,e.target.value)}/>
                          {task.doneBy&&<div className="tiny emerald-text" style={{marginTop:3}}>Wykonane przez: {task.doneBy}</div>}
                        </div>
                      )}
                    </div>
                    <span style={{fontSize:15,fontWeight:800,color:task.done?"var(--cc-success)":"var(--cc-danger)",lineHeight:1,flexShrink:0}}>{task.done?"✓":"✕"}</span>
                  </div>
                ))}
                {!carryOverForCurrentShift.length&&<div className="empty-box">Brak przekazanych zadań dla tej zmiany.</div>}
              </div>
            </div>
          </motion.div>
        )}
        {workerTab==="przekazanie"&&started&&(
          <motion.div key="prz" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="stack">

            {/* ═══ FLOW CARD v2 — shift blocks z avatars + arrows + status ═══ */}
            <section className="cc-flow-card" aria-labelledby="cc-flow-title">
              <h2 id="cc-flow-title" className="visually-hidden">Przepływ przekazania zmiany</h2>
              <div className="cc-flow-block cc-flow-block--curr">
                <div className="cc-flow-avatar cc-flow-avatar--curr" aria-hidden="true">
                  {(employeeName||"?").charAt(0).toUpperCase()}
                </div>
                <div className="cc-flow-info">
                  <div className="cc-flow-name">
                    {employeeName}
                    <span className="cc-flow-name-tag">· ty</span>
                  </div>
                  <div className="cc-flow-meta">{SHIFT_NAME_PL[selectedShift]||selectedShift}</div>
                </div>
              </div>
              <div className="cc-flow-arrow" aria-hidden="true">→</div>
              <div className="cc-flow-block cc-flow-block--next">
                <div className="cc-flow-avatar cc-flow-avatar--next" aria-hidden="true">?</div>
                <div className="cc-flow-info">
                  <div className="cc-flow-name">Następna zmiana</div>
                  <div className="cc-flow-meta">{SHIFT_NAME_PL[carryOverTarget]||"—"}</div>
                  <details className="cc-flow-pick">
                    <summary className="cc-flow-pick-summary">Zmień ▾</summary>
                    <div className="cc-flow-pick-menu" role="menu">
                      {SHIFT_OPTIONS.map(s=>(
                        <button
                          key={s}
                          type="button"
                          role="menuitem"
                          className={`cc-flow-pick-item${carryOverTarget===s?" is-active":""}`}
                          onClick={()=>setCarryOverTarget(s)}>
                          {SHIFT_NAME_PL[s]}
                        </button>
                      ))}
                    </div>
                  </details>
                </div>
              </div>
            </section>

            {/* ═══ AUTOSAVE recovery (inline pill, gdy istnieje) ═══ */}
            {autosaveNote&&autosaveNote.employee===employeeName&&autosaveNote.shift===selectedShift&&(
              <div className="cc-handover-recovery" role="status">
                <div className="cc-handover-recovery-icon" aria-hidden="true">⚡</div>
                <div className="cc-handover-recovery-body">
                  <div className="cc-handover-recovery-title">Znaleziono automatyczny zapis z {autosaveNote.savedAt}</div>
                  <div className="cc-handover-recovery-preview">{autosaveNote.text}</div>
                </div>
                <div className="cc-handover-recovery-actions">
                  <button
                    type="button"
                    className="cc-handover-recovery-btn cc-handover-recovery-btn--primary"
                    onClick={()=>{if(autosaveNote.text&&!handoverNote)setHandoverNote(autosaveNote.text);setAutosaveNote(null);localStorage.removeItem(AUTOSAVE_KEY);}}>
                    Przywróć
                  </button>
                  <button
                    type="button"
                    className="cc-handover-recovery-btn cc-handover-recovery-btn--ghost"
                    onClick={()=>{setAutosaveNote(null);localStorage.removeItem(AUTOSAVE_KEY);}}>
                    Odrzuć
                  </button>
                </div>
              </div>
            )}

            {/* ═══ COMPOSE CARD v2 — notatka kontekstowa ═══ */}
            <section className="cc-compose-card" aria-labelledby="cc-compose-title">
              <header className="cc-compose-card-head">
                <div className="cc-compose-card-headline">
                  <MessageSquare size={15} className="cc-compose-card-icon"/>
                  <h2 id="cc-compose-title" className="cc-compose-card-title">Twoja notatka dla następnej zmiany</h2>
                </div>
                <div className="cc-compose-card-meta">
                  <span className="cc-compose-card-live" aria-hidden="true"/>
                  Auto-save · co 20s
                </div>
              </header>
              <div className="cc-compose-card-body">
                <textarea
                  className="cc-compose-card-textarea"
                  placeholder="Co warto przekazać? Np. Pok. 304 późny check-out 13:00, usterka 412 konserwator po 16:00, voucher 218 wykorzystany przy wczesnym CO…"
                  value={handoverNote}
                  onChange={e=>{
                    setHandoverNote(e.target.value);
                    if(autosaveTimerRef.current)clearTimeout(autosaveTimerRef.current);
                    autosaveTimerRef.current=setTimeout(()=>{
                      const snap={text:e.target.value.trim(),shiftNote:shiftNoteInput,employee:employeeName,shift:selectedShift,savedAt:fmtA(),auto:true};
                      localStorage.setItem(AUTOSAVE_KEY,JSON.stringify(snap));
                    },20000);
                  }}/>
                <div className="cc-compose-card-foot" style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}>
                  <span className="cc-compose-card-counter">{handoverNote.length} znaków · zapisane lokalnie</span>
                  {llmReady&&<button className="btn btn-outline" style={{fontSize:11.5,padding:"4px 10px",display:"inline-flex",alignItems:"center",gap:5}} onClick={polishHandover} disabled={polishingNote||!handoverNote.trim()}><Sparkles size={12}/>{polishingNote?"Redaguję…":"Zredaguj AI"}</button>}
                </div>
              </div>
            </section>

            {/* ═══ KOMPOZER v2 — jedno pole, dwie osie wyboru (Rodzaj × Kiedy) ═══ */}
            <div className="panel" style={{borderLeft:"4px solid var(--gold)"}}>
              <div className="panel-title"><Plus size={16}/> Dodaj wpis dla innej zmiany</div>
              <div className="tiny muted" style={{marginBottom:12,marginTop:-8}}>Wpisz treść, a potem wybierz rodzaj i komu/kiedy ma trafić — bez zgadywania, które okno.</div>

              <input className="input" style={{marginBottom:14,fontSize:14}}
                placeholder={entryWhen==="pending"?"Np. Gość z 210 odbierze paczkę — kiedyś w tym tygodniu":entryKind==="task"?"Np. Zadzwonić do PWiK":"Np. Przyjazd VIP — pokój 306"}
                value={shiftNoteInput} onChange={e=>setShiftNoteInput(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&addUnifiedEntry()}/>

              {/* Oś 1 — Rodzaj */}
              <div className="cc-seg-label">Rodzaj</div>
              <div className="cc-seg" role="group" aria-label="Rodzaj wpisu">
                <button type="button" className={`cc-seg-btn${entryKind==="task"?" is-active":""}`} onClick={()=>setEntryKind("task")}><CheckSquare size={13}/> Zadanie</button>
                <button type="button" className={`cc-seg-btn${entryKind==="note"?" is-active":""}`} onClick={()=>setEntryKind("note")}><Bell size={13}/> Powiadomienie</button>
              </div>
              <div className="tiny muted" style={{margin:"5px 0 14px"}}>{entryKind==="task"?"Do odhaczenia — pojawi się jako obowiązkowe zadanie.":"Do wiadomości — informacja bez checkboxa."}</div>

              {/* Oś 2 — Kiedy / dla kogo */}
              <div className="cc-seg-label">Kiedy / dla kogo</div>
              <div className="cc-seg" role="group" aria-label="Termin wpisu">
                <button type="button" className={`cc-seg-btn${entryWhen==="next"?" is-active":""}`} onClick={()=>setEntryWhen("next")}>Następna zmiana</button>
                <button type="button" className={`cc-seg-btn${entryWhen==="dated"?" is-active":""}`} onClick={()=>setEntryWhen("dated")}>Konkretny dzień</button>
                <button type="button" className={`cc-seg-btn${entryWhen==="pending"?" is-active":""}`} onClick={()=>setEntryWhen("pending")}>Bez terminu</button>
              </div>

              {entryWhen==="dated"&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,margin:"12px 0 0"}}>
                  <div><label>Docelowa zmiana</label><select className="input" value={newReminderShift} onChange={e=>setNewReminderShift(e.target.value)}><option value="">Wszystkie zmiany</option>{SHIFT_OPTIONS.map(s=><option key={s} value={s}>{SHIFT_NAME_PL[s]}</option>)}</select></div>
                  <div><label>Data</label><input className="input" type="date" value={newReminderDate} onChange={e=>setNewReminderDate(e.target.value)}/></div>
                </div>
              )}
              {entryWhen==="next"&&(
                <div className="tiny muted" style={{margin:"10px 0 0"}}>Trafi do zmiany: <b>{SHIFT_NAME_PL[carryOverTarget]||"—"}</b>{entryKind==="note"?" — powiadomienie widać na ekranie startowym wszystkich zmian":""}. Zmianę docelową zmieniasz w kafelku „Następna zmiana" u góry.</div>
              )}
              {entryWhen==="pending"&&(
                <div className="cc-pending-hint" style={{margin:"12px 0 0"}}>
                  <Clock size={14}/>
                  <span>Trafi do <b>Informacje → Oczekujące</b>. Widoczne dla wszystkich, bez terminu — np. „ktoś kiedyś coś przyniesie / odbierze". Każdy odhaczy, gdy sprawa się załatwi.</span>
                </div>
              )}

              <button className="btn btn-gold full" style={{marginTop:16}} onClick={addUnifiedEntry} disabled={!shiftNoteInput.trim()||(entryWhen==="dated"&&!newReminderDate)}>
                <Plus size={14}/> {entryWhen==="pending"?"Dodaj do Oczekujących":entryWhen==="dated"?"Ustaw na wybrany dzień":entryKind==="task"?"Przekaż zadanie":"Dodaj powiadomienie"}
              </button>
            </div>

            {/* LISTA — zaplanowane na konkretny dzień */}
            {futureDatedReminders.length>0&&(
              <div className="panel">
                <div className="panel-title" style={{color:"var(--plum)"}}><Calendar size={16}/> Zaplanowane na konkretny dzień</div>
                <div className="stack" style={{maxHeight:300,overflowY:"auto",paddingRight:2,marginTop:6}}>
                  {futureDatedReminders.map(r=>(
                    <div key={r.id} className="dated-future-row">
                      <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
                        {r.entryType==="task"?<CheckSquare size={13} style={{color:"var(--amber)",flexShrink:0}}/>:<Bell size={13} style={{color:"var(--sky)",flexShrink:0}}/>}
                        <div className="dated-future-date">{r.targetDate}</div>
                        <div><div style={{fontWeight:600,fontSize:13.5}}>{r.text}</div><div className="tiny muted">{r.targetShift?SHIFT_LABELS_PL[r.targetShift]:"Wszystkie zmiany"} · {r.createdBy}</div></div>
                      </div>
                      {(!r.source||r.source!=="admin"||canAccessManagerPanel)&&<button className="icon-btn icon-btn-danger" onClick={()=>deleteDatedReminder(r)} title="Usuń"><Trash2 size={13}/></button>}
                    </div>
                  ))}
                </div>
              </div>
            )}

          </motion.div>
        )}
        {workerTab==="hk"&&(
          <motion.div key="hk" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <RestoredHKPanel dark={workerDark} hkDate={hkDate} setHkDate={setHkDate}
                     hkStaff={hkStaff} setHkStaff={setHkStaff}
                     hkData={hkData} setHkData={setHkData}
                     showToast={showToast} askConfirm={askConfirm} askPrompt={askPrompt} isManager={canAccessManagerPanel} employeeName={employeeName}/>
          </motion.div>
        )}
        {workerTab==="informacje"&&(
          <motion.div key="informacje" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <InboxPanel dark={workerDark} employeeName={employeeName} selectedShift={selectedShift} wikiEntries={wikiEntries} isManager={canAccessManagerPanel} onOpenWiki={()=>setShowWiki(true)} onMarkedRead={()=>setInboxVersion(v=>v+1)}/>
          </motion.div>
        )}
        {workerTab==="usterki"&&(
          <motion.div key="usterki" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <FaultsPanel dark={workerDark} employeeName={employeeName} showToast={showToast} floors1={HK_FLOOR1} floors2={HK_FLOOR2} floors3={HK_FLOOR3} isManager={canAccessManagerPanel}/>
          </motion.div>
        )}
        {workerTab==="parking"&&(
          <motion.div key="parking" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <ParkingPanel dark={workerDark} isAdmin={canAccessManagerPanel} showToast={showToast} employees={employees} employeeName={employeeName}/>
          </motion.div>
        )}
        {workerTab==="goscie"&&(
          <motion.div key="goscie" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <StaliGosciePanel dark={workerDark} isAdmin={canAccessManagerPanel} currentManager={canAccessManagerPanel?currentManager:""} addAudit={addAudit}/>
          </motion.div>
        )}
        {workerTab==="vouchery"&&(
          <motion.div key="vouchery" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <VouchersPanel employeeName={employeeName} isManager={canAccessManagerPanel} showToast={showToast} askConfirm={askConfirm}/>
          </motion.div>
        )}
        {workerTab==="opinie"&&(
          <motion.div key="opinie" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <ReviewsPanel dark={workerDark} employeeName={employeeName} isManager={canAccessManagerPanel} showToast={showToast}/>
          </motion.div>
        )}
        {workerTab==="czat"&&(
          <motion.div key="czat" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <TeamChat employeeName={employeeName} isManager={canAccessManagerPanel} showToast={showToast} hkStaff={hkStaff} onApplySwap={applyAgentSwap} onSeen={()=>setChatTick(t=>t+1)}/>
          </motion.div>
        )}
        {workerTab==="historia"&&(
          <motion.div key="historia" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <HistoriaWorkerPanel dark={workerDark} canSeeCash={canAccessManagerPanel}/>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );

  // ── Zegar testowy (DEV) — widoczny też przed logowaniem ─────────────────────
  // Pozwala ustawić symulowany czas i skakać nim, by od razu zobaczyć
  // przypomnienie 20 min przed końcem i strażnika sejfu (≥10 min stażu). Znika
  // z release (gate DEV_TOOLS / import.meta.env.DEV).
  const toLocalInput=(d)=>{const p=n=>String(n).padStart(2,"0");return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;};
  // Skacze zegarem do „X minut przed realnym końcem AKTUALNEJ zmiany" — liczone z
  // shiftEndDate(selectedShift), więc zawsze pasuje do zmiany, na której jesteś
  // (popołudniowa, nocna…). Resetuje flagę „pokazano", by alert mógł odpalić ponownie.
  const jumpToBeforeShiftEnd=(minBefore)=>{
    const end=shiftEndDate(selectedShift,shiftStartTime);
    if(!end)return;
    shiftEndFiredRef.current=false;
    setShiftEndReminderOpen(false);
    applyTestClockOffset(end.getTime()-minBefore*60000-Date.now());
  };
  const testClockWidget=DEV_TOOLS&&(
    <div style={{position:"fixed",left:12,bottom:12,zIndex:99999,background:"#1a0a2e",border:"2px dashed #7c3aed",borderRadius:10,padding:"10px 12px",width:252,boxShadow:"0 6px 24px rgba(0,0,0,.45)"}}>
      <div style={{fontSize:10.5,fontWeight:800,color:"#c4b5fd",letterSpacing:".08em",textTransform:"uppercase",marginBottom:6}}>🕒 Zegar testowy (DEV)</div>
      <div style={{fontSize:13,color:"#e9d5ff",fontWeight:700,marginBottom:6}}>{getNow().toLocaleString("pl-PL")}{testClockOffset!==0&&<span style={{color:"#a78bfa",fontWeight:500}}> ({testClockOffset>0?"+":""}{Math.round(testClockOffset/60000)} min)</span>}</div>
      <input type="datetime-local" value={toLocalInput(getNow())} onChange={e=>{const v=e.target.value;if(!v)return;const t=new Date(v).getTime();if(Number.isFinite(t))applyTestClockOffset(t-Date.now());}} style={{width:"100%",fontSize:11.5,marginBottom:6,padding:"3px 6px",borderRadius:6,border:"1px solid #4c1d95",background:"#2a1245",color:"#e9d5ff"}}/>
      <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:7}}>
        {[["−10m",-10],["+5m",5],["+10m",10],["+20m",20],["+1h",60]].map(([lbl,m])=>(
          <button key={lbl} onClick={()=>applyTestClockOffset(testClockOffset+m*60000)} style={{padding:"3px 7px",borderRadius:5,fontSize:11,fontWeight:700,cursor:"pointer",border:"1px solid #4c1d95",background:"transparent",color:"#c4b5fd"}}>{lbl}</button>
        ))}
        <button onClick={()=>applyTestClockOffset(0)} style={{padding:"3px 7px",borderRadius:5,fontSize:11,fontWeight:700,cursor:"pointer",border:"1px solid #7c3aed",background:"#5b21b6",color:"#fff"}}>Reset</button>
      </div>
      {started&&shiftStartTime&&selectedShift?(()=>{
        const end=shiftEndDate(selectedShift,shiftStartTime);
        const lead=requiresSafeDeposit?60:15;
        const p=n=>String(n).padStart(2,"0");
        return(
          <>
            <div style={{fontSize:9.5,color:"#8b6fc4",marginBottom:4,lineHeight:1.4}}>
              Twoja zmiana: <b style={{color:"#c4b5fd"}}>{SHIFT_NAME_PL[selectedShift]||selectedShift}</b>
              {end?<> · koniec <b style={{color:"#c4b5fd"}}>{p(end.getHours())}:{p(end.getMinutes())}</b> · alert {lead} min przed</>:null}
            </div>
            <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
              {[["⏰ Skocz do alertu",lead-1],["Koniec −1 min",1],["Po końcu (+2)",-2]].map(([lbl,mb])=>(
                <button key={lbl} onClick={()=>jumpToBeforeShiftEnd(mb)} style={{padding:"3px 7px",borderRadius:5,fontSize:10.5,fontWeight:700,cursor:"pointer",border:"1px solid #4c1d95",background:"transparent",color:"#a78bfa"}}>{lbl}</button>
              ))}
            </div>
          </>
        );
      })():(
        <div style={{fontSize:9.5,color:"#8b6fc4",lineHeight:1.4}}>Zaloguj i rozpocznij zmianę — pojawią się skróty „skocz do końca zmiany" dopasowane do Twojej zmiany.</div>
      )}
      <div style={{fontSize:9.5,color:"#6E2B5C",marginTop:7,lineHeight:1.4}}>Strażnik sejfu: rozpocznij zmianę, potem „+10m" by przekroczyć 10 min stażu.</div>
    </div>
  );

  // Przypomnienie agenta 20 min przed końcem zmiany (na panelu PC).
  const shiftEndReminderModal=shiftEndReminderOpen&&(
    <div className="modal-backdrop" onClick={()=>setShiftEndReminderOpen(false)}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:460}}>
        <div className="modal-header"><h2>Za chwilę koniec zmiany</h2></div>
        <div className="stack">
          <div style={{background:"var(--plum-soft)",border:"1px solid var(--plum-border)",borderLeft:"4px solid var(--plum)",borderRadius:"var(--radius-md)",padding:"14px 18px",fontSize:14,lineHeight:1.55,color:"var(--text-primary)"}}>
            {shiftEndReminderText}
          </div>
          {shiftEndFacts&&(
            <div style={{display:"grid",gap:8,fontSize:13}}>
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{color:shiftEndFacts.cashChecked?"var(--emerald)":"#c0392b",fontWeight:800}}>{shiftEndFacts.cashChecked?"✓":"✗"}</span>
                <span style={{color:"var(--text-secondary)"}}>Stan kasy sprawdzony (KW końcowa wpisana)</span>
              </div>
              {shiftEndFacts.safeRequired&&(
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{color:shiftEndFacts.safeDone?"var(--emerald)":"#c0392b",fontWeight:800}}>{shiftEndFacts.safeDone?"✓":"✗"}</span>
                  <span style={{color:"var(--text-secondary)"}}>Wpłata do sejfu zarejestrowana</span>
                </div>
              )}
              <div style={{display:"flex",alignItems:"center",gap:8}}>
                <span style={{color:shiftEndFacts.tasksDone>=shiftEndFacts.tasksTotal?"var(--emerald)":"#c8a050",fontWeight:800}}>{shiftEndFacts.tasksDone>=shiftEndFacts.tasksTotal?"✓":"•"}</span>
                <span style={{color:"var(--text-secondary)"}}>Zadania zaznaczone: {shiftEndFacts.tasksDone}/{shiftEndFacts.tasksTotal}</span>
              </div>
              {shiftEndFacts.missing&&shiftEndFacts.missing.length>0&&(
                <ul className="list" style={{margin:"2px 0 0 22px",fontSize:12,color:"var(--text-muted)"}}>
                  {shiftEndFacts.missing.slice(0,5).map((t,i)=><li key={i}>{t}</li>)}
                </ul>
              )}
            </div>
          )}
        </div>
        <div className="modal-footer" style={{gap:8}}>
          <button className="btn btn-outline" onClick={()=>setShiftEndReminderOpen(false)}>OK, rozumiem</button>
          {shiftEndFacts&&shiftEndFacts.safeRequired&&!shiftEndFacts.safeDone&&(
            <button className="btn btn-emerald" style={{flex:1}} onClick={()=>{setShiftEndReminderOpen(false);setFinishDialogOpen(true);}}>
              Przejdź do wpłaty do sejfu
            </button>
          )}
        </div>
      </div>
    </div>
  );

  // Strażnik: blokuje opuszczenie zmiany nocnej/wieczorowej bez wpłaty do sejfu.
  const safeGuardModal=safeGuardOpen&&(
    <div className="modal-backdrop" onClick={e=>e.stopPropagation()}>
      <div className="modal" onClick={e=>e.stopPropagation()} style={{maxWidth:440}}>
        <div className="modal-header"><h2>Najpierw wpłata do sejfu</h2></div>
        <div className="stack">
          <div style={{background:"#fdecea",border:"1px solid #f5b7b1",borderLeft:"4px solid #c0392b",borderRadius:"var(--radius-md)",padding:"14px 18px",fontSize:14,lineHeight:1.55,color:"#7b241c"}}>
            Nie możesz opuścić zmiany bez zarejestrowania wpłaty do sejfu. Zrób to teraz — inaczej zrobi to dopiero zmiana poranna, co rozjeżdża stan kasy i przypisanie operacji.
          </div>
        </div>
        <div className="modal-footer" style={{gap:8}}>
          <button className="btn btn-outline" onClick={()=>setSafeGuardOpen(false)}>Wróć do zmiany</button>
          <button className="btn btn-emerald" style={{flex:1}} onClick={()=>{setSafeGuardOpen(false);setFinishDialogOpen(true);}}>
            Przejdź do wpłaty do sejfu
          </button>
        </div>
      </div>
    </div>
  );

  const finishModal=finishDialogOpen&&(
    <div className="modal-backdrop" onClick={()=>{setFinishDialogOpen(false);setSafeConfirmStep(false);}}>
      <div className="modal large-modal" onClick={e=>e.stopPropagation()}>

        {!safeConfirmStep?(
          // ── Krok 1: Podsumowanie zmiany ──
          <>
            <div className="modal-header"><h2>Potwierdzenie zakończenia zmiany</h2></div>
            <div className="stack">
              <p style={{color:"var(--text-secondary)"}}>Sprawdź dane przed zapisem raportu.</p>
              {(!cashOpeningAmount.trim()||!cashClosingDocumentsAmount.trim())&&(
                <div className="alert"><div style={{fontWeight:700,marginBottom:4,display:"flex",alignItems:"center",gap:6}}><AlertTriangle size={14}/> Brakuje danych kasy:</div>
                  <ul style={{margin:"4px 0 0 18px",lineHeight:1.8}}>
                    {!cashClosingDocumentsAmount.trim()&&<li>Kwota z dokumentów kasowych (KW)</li>}
                  </ul>
                </div>
              )}
              {cashDiff!==null&&(
                <div style={{background:"var(--plum-soft)",border:"1px solid var(--plum-border)",borderLeft:"4px solid var(--plum)",borderRadius:"var(--radius-md)",padding:"14px 18px"}}>
                  <div style={{fontSize:11,color:"var(--plum)",fontWeight:800,marginBottom:8,textTransform:"uppercase",letterSpacing:".07em"}}>Rozliczenie kasy</div>
                  <div style={{display:"grid",gap:7}}>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                      <span style={{color:"var(--text-secondary)"}}>Stała kasowa:</span>
                      <span style={{fontWeight:700,color:"var(--text-primary)"}}>{fmtMoney(stalaKasowa)}</span>
                    </div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:13}}>
                      <span style={{color:"var(--text-secondary)"}}>KW łącznie (poprz. {fmtMoney(kwTotal)} + nowe {fmtMoney(Math.max(0,(parseFloat(cashClosingDocumentsAmount)||0)-kwTotal))}):</span>
                      <span style={{fontWeight:700,color:"var(--text-primary)"}}>{fmtMoney(parseFloat(cashClosingDocumentsAmount)||0)}</span>
                    </div>
                    <div style={{borderTop:"1px solid var(--plum-border)",paddingTop:8,display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                      <span style={{color:"var(--plum)",fontSize:13,fontWeight:800,textTransform:"uppercase",letterSpacing:".05em"}}>Łącznie w kasie:</span>
                      <span style={{color:"var(--plum)",fontSize:22,fontWeight:400,fontFamily:"'DM Serif Display',serif",letterSpacing:"-.02em"}}>{fmtMoney(cashDiff)}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="simple-row">
                <div className="strong-ish">Brakujące zadania podstawowe:</div>
                {missingBaseTasks.length?<ul className="list">{missingBaseTasks.map(item=><li key={item.index}>{item.task.text}</li>)}</ul>:<div className="emerald-text">Wszystkie wykonane</div>}
              </div>
              <div className="simple-row">
                <div className="strong-ish">Brakujące zadania przekazane:</div>
                {missingCarryOverTasks.length?<ul className="list">{missingCarryOverTasks.map((item,i)=><li key={i}>{item.text}</li>)}</ul>:<div className="emerald-text">Wszystkie wykonane</div>}
              </div>
              {handoverNote.trim()&&(
                <div style={{background:"var(--bg-card)",border:"1px solid var(--border-light)",borderLeft:"3px solid var(--plum)",borderRadius:"var(--radius-md)",padding:"12px 16px",fontSize:13}}>
                  <div style={{fontWeight:800,color:"var(--plum)",marginBottom:5,fontSize:11,textTransform:"uppercase",letterSpacing:".06em"}}>Notatka przekazania</div>
                  <div style={{color:"var(--text-primary)",lineHeight:1.55}}>{handoverNote}</div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>{setFinishDialogOpen(false);setSafeConfirmStep(false);}}>Wróć</button>
              <button className="btn btn-indigo" disabled={!canFinishShift}
                onClick={()=>{
                  const isDeposit=selectedShift==="nocna"||selectedShift==="wieczorowa";
                  if(isDeposit){
                    // Przenieś już wpisaną KW końcową do pola sejfu — bez podwójnego wpisywania
                    // i bez ryzyka, że puste pole da przyrost 0 → wpłatę 0.
                    if(!safeDepositKW.trim()&&cashClosingDocumentsAmount.trim())setSafeDepositKW(cashClosingDocumentsAmount);
                    setSafeConfirmStep(true);
                  }else{setFinishDialogOpen(false);finishShift();}
                }}>
                {(selectedShift==="nocna"||selectedShift==="wieczorowa")?"Dalej →":"Zakończ zmianę"}
              </button>
            </div>
          </>
        ):(
          // ── Krok 2: Wpłata do sejfu (nocna/wieczorowa) ──
          <>
              <div className="modal-header"><h2>Wpłata do sejfu</h2></div>
              <div className="stack">
                {(()=>{const kw=parseFloat(safeDepositKW)||0;const postKW=parseFloat(postDepositKW)||0;const kwPrev=kwTotal;const kwInc=Math.max(0,kw-kwPrev);const deposit=safeDepositManual?(parseFloat(safeDepositAmount)||0):kwInc;const totalBefore=stalaKasowa+kwInc;const newS=totalBefore-deposit;return(<>
                  <div style={{background:"var(--plum-soft)",border:"1px solid var(--plum-border)",borderLeft:"4px solid var(--plum)",borderRadius:"var(--radius-md)",padding:"14px 18px"}}>
                    <div style={{fontSize:11,color:"var(--plum)",fontWeight:800,marginBottom:6,textTransform:"uppercase",letterSpacing:".07em"}}>W kasie przed wpłatą</div>
                    <div style={{fontSize:32,fontWeight:400,color:"var(--plum)",fontFamily:"'DM Serif Display',serif",letterSpacing:"-.02em",lineHeight:1}}>{fmtMoney(totalBefore)}</div>
                    <div style={{fontSize:12,color:"var(--text-secondary)",marginTop:6}}>Stała: {fmtMoney(stalaKasowa)} + KW: {fmtMoney(kw)}</div>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:3}}>Stan KW — ile gotówki z dokumentów masz w kasie (zł)</div>
                    <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={safeDepositKW} onChange={e=>setSafeDepositKW(e.target.value)} style={{fontSize:13}} autoFocus/>
                  </div>
                  {/* Kwota do sejfu liczy się sama = przyrost KW tej zmiany. Bez podwójnego wpisywania. */}
                  <div style={{background:"var(--emerald-light)",border:"1px solid var(--emerald-border)",borderLeft:"3px solid var(--emerald)",borderRadius:"var(--radius-md)",padding:"12px 16px"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                      <span style={{fontSize:11,fontWeight:800,color:"var(--emerald)",textTransform:"uppercase",letterSpacing:".06em"}}>Do sejfu (przyrost KW)</span>
                      <span style={{fontSize:22,fontWeight:400,color:"var(--emerald)",fontFamily:"'DM Serif Display',serif",letterSpacing:"-.02em"}}>{fmtMoney(safeDepositManual?(parseFloat(safeDepositAmount)||0):kwInc)}</span>
                    </div>
                    {!safeDepositManual&&<div style={{fontSize:11.5,color:"var(--text-secondary)",marginTop:5,lineHeight:1.5}}>Tyle wkładasz do sejfu — kasa wraca do stałej {fmtMoney(stalaKasowa)} zł. Nie wpisujesz tej kwoty drugi raz.</div>}
                    <label style={{display:"flex",alignItems:"center",gap:7,marginTop:8,fontSize:12,color:"var(--text-secondary)",cursor:"pointer"}}>
                      <input type="checkbox" checked={safeDepositManual} onChange={e=>setSafeDepositManual(e.target.checked)}/>
                      Wpłacam inną kwotę niż przyrost KW
                    </label>
                    {safeDepositManual&&(
                      <div style={{marginTop:8}}>
                        <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:3}}>Kwota wpłaty do sejfu (zł)</div>
                        <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={safeDepositAmount} onChange={e=>setSafeDepositAmount(e.target.value)} style={{fontSize:13}}/>
                      </div>
                    )}
                  </div>
                  {/* Płatność po wpłacie do sejfu (po 24:00) — zwinięta, by nie mylić z wpłatą. */}
                  {!showPostDeposit?(
                    <button type="button" onClick={()=>setShowPostDeposit(true)} style={{background:"none",border:"none",padding:0,textAlign:"left",cursor:"pointer",fontSize:12.5,color:"var(--plum)",fontWeight:700}}>
                      + Płatność gotówką po wpłacie do sejfu (po 24:00)
                    </button>
                  ):(
                    <div>
                      <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:3}}>Płatność gotówkowa PO wpłacie do sejfu (zł) <span style={{color:"#c8a050"}}>— opcjonalne</span></div>
                      <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:4,lineHeight:1.5}}>Gotówka, która wpłynęła już po wpłacie do sejfu (np. po 24:00) — zostanie wliczona jako KW zmiany porannej, NIE trafia do tego sejfu.</div>
                      <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={postDepositKW} onChange={e=>setPostDepositKW(e.target.value)} style={{fontSize:13}} autoFocus/>
                    </div>
                  )}
                  {deposit<=0&&(
                    <div style={{background:"#fdf3e3",border:"1px solid #e8c98a",borderLeft:"4px solid #c8a050",borderRadius:"var(--radius-md)",padding:"12px 16px",fontSize:12.5,color:"#7a5a16",lineHeight:1.5}}>
                      <strong>Do sejfu wychodzi 0 zł.</strong> Sprawdź, czy w polu „Stan KW" jest <u>aktualny</u> odczyt z drukarki kasowej (musi być wyższy niż KW poprzedniej zmiany: {fmtMoney(kwTotal)}). Jeśli w nocy nie było żadnej wpłaty gotówką — to jest OK, możesz zatwierdzić.
                    </div>
                  )}
                  {newS<0&&(
                    <div style={{background:"#fdecec",border:"1px solid #e8a0a0",borderLeft:"4px solid #d04545",borderRadius:"var(--radius-md)",padding:"12px 16px",fontSize:12.5,color:"#8a1c1c",lineHeight:1.5}}>
                      <strong>Uwaga: kasa po wpłacie byłaby ujemna ({fmtMoney(newS)} zł).</strong> Wpłacasz więcej, niż jest w kasie ({fmtMoney(totalBefore)} zł). Sprawdź kwotę wpłaty i odczyt „Stan KW" przed zatwierdzeniem.
                    </div>
                  )}
                  {safeDepositKW&&(
                    <div style={{background:"var(--bg-card)",border:"1px solid var(--border-light)",borderRadius:"var(--radius-md)",padding:"14px 18px"}}>
                      <div style={{fontSize:11,fontWeight:800,color:"var(--plum)",marginBottom:8,textTransform:"uppercase",letterSpacing:".07em"}}>Podgląd po wpłacie</div>
                      <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:3}}>W kasie po wpłacie: <strong style={{color:"var(--emerald)"}}>{fmtMoney(newS)}</strong></div>
                      <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:3}}>KW dla zmiany porannej: <strong style={{color:"var(--text-primary)"}}>{fmtMoney(postKW)}</strong></div>
                      <div style={{fontSize:13,color:"var(--text-secondary)"}}>Nowa stała kasowa: <strong style={{color:"var(--plum)"}}>{fmtMoney(newS)}</strong></div>
                    </div>
                  )}
                </>);})()}
              </div>
              <div className="modal-footer" style={{gap:8}}>
                <button className="btn btn-outline" onClick={()=>setSafeConfirmStep(false)}>← Wróć</button>
                <button className="btn btn-emerald" style={{flex:1}} onClick={()=>{setFinishDialogOpen(false);handleSafeDeposit();}}>
                  Zatwierdź wpłatę i zakończ zmianę
                </button>
              </div>
            </>
        )}

      </div>
    </div>
  );

  const appShellClass="app-shell";
  const isWideWorkerPanel=!(canAccessManagerPanel&&showAdminPanel)&&workerTab==="hk";

  if(lockedScreen){
    const unlock=(e)=>{
      if(e) e.stopPropagation();
      setLockedScreen(false);
      if(lockTimerRef.current)clearTimeout(lockTimerRef.current);
      lockTimerRef.current=setTimeout(()=>setLockedScreen(true),LOCK_TIMEOUT);
    };
    return(
      <div className="lock-screen" onClick={unlock} style={{cursor:"pointer"}}>
        <div style={{marginBottom:16}}><Logo variant="icon" tone="dark" width={56} height={56}/></div>
        <div className="lock-title">Sesja zablokowana</div>
        <div className="lock-sub">
          {started&&employeeName&&<span style={{color:"var(--gold)",fontWeight:700,display:"block",marginBottom:6}}>{employeeName} · {shiftShortLabel(selectedShift)}</span>}
          Brak aktywności przez 15 minut.
        </div>
        <button className="lock-emp-btn" onClick={unlock} style={{marginTop:12}}>Kliknij aby odblokować</button>
        <div className="lock-timer">Conrad Comfort · Panel Recepcji</div>
      </div>
    );
  }

  // ── Pelnoekranowy login (B4) — widoczny TYLKO przed wyborem zmiany ─────────
  // Pokaz gdy nikt nie pracuje (!started) i nie jest w stanie ready (czyli nie zalogowany)
  if(showWelcomeOverlay){
    return <WelcomeOverlayScreen name={employeeName} onDone={()=>{
      setShowWelcomeOverlay(false);
      if(pendingAutoStart){
        setPendingAutoStart(false);
        handleStartShift();
      }
    }}/>;
  }

  if (!started && loginStep !== "ready") {
    return (
      <div className="cc-login-screen cc-login-split">
        {/* ── Lewa kolumna: brand panel v2 ── */}
        <aside className="cc-login-brand" aria-hidden="true">
          <div className="cc-login-brand-top">
            <span className="cc-login-brand-version">v2.0</span>
            <span className="cc-login-brand-status">
              <span className="cc-login-brand-status-dot"/>Online
            </span>
          </div>
          <div className="cc-login-brand-hero">
            <Logo variant="full" tone="white"/>
            <div className="cc-login-brand-tagline">Panel Recepcji — niedoścignione doświadczenie gości.</div>
          </div>
          <div className="cc-login-brand-cards">
            <div className="cc-login-brand-card">
              <div className="cc-login-brand-card-lbl">Data</div>
              <div className="cc-login-brand-card-val">{new Date().toLocaleDateString("pl-PL",{day:"2-digit",month:"short"})}</div>
              <div className="cc-login-brand-card-sub">{new Date().toLocaleDateString("pl-PL",{weekday:"long"})}</div>
            </div>
            <div className="cc-login-brand-card">
              <div className="cc-login-brand-card-lbl">Czas</div>
              <div className="cc-login-brand-card-val">{liveTime||new Date().toLocaleTimeString("pl-PL").slice(0,5)}</div>
              <div className="cc-login-brand-card-sub">lokalny</div>
            </div>
            <div className="cc-login-brand-card">
              <div className="cc-login-brand-card-lbl">Synch.</div>
              <div className="cc-login-brand-card-val">Live</div>
              <div className="cc-login-brand-card-sub">Supabase</div>
            </div>
          </div>
        </aside>

        {/* ── Prawa kolumna: form panel ── */}
        <main className="cc-login-form" role="main">
          <div className="cc-login-form-eyebrow">
            <span className="cc-login-form-eyebrow-line"/>
            <span>Logowanie · Conrad Comfort</span>
          </div>
          <div className="cc-login-center">
          {loginStep==="name"&&(
            <div className="cc-login-card cc-fade-up">
              <div className="cc-login-label">Witamy w Panelu Recepcji</div>
              <input
                className="cc-login-input"
                placeholder="Wpisz swoje imię…"
                value={employeeName}
                autoFocus
                autoComplete="off"
                list="cc-emp-list-main"
                onChange={e=>setEmployeeName(canonicalizeNameInput(e.target.value))}
                onKeyDown={e=>{
                  if(e.key==="Enter"&&employeeName.trim()){
                    const trimmed=canonicalizePersonName(employeeName);
                    setEmployeeName(trimmed);
                    if(isManagerName(trimmed,customManagers)) setLoginStep(hasAdminPassword()?"password":"admincheck");
                    else {clearManagerSession();attemptWorkerLogin(trimmed);}
                  }
                }}
              />
              <datalist id="cc-emp-list-main">
                {(()=>{
                  const seen=new Set();const out=[];
                  [...employees,...customManagers].forEach(n=>{
                    const k=String(n||"").trim().normalize("NFD").replace(/[̀-ͯ]/g,"").replace(/ł/g,"l").toLowerCase();
                    if(!k||seen.has(k))return;seen.add(k);out.push(n);
                  });
                  return out.map(n=><option key={n} value={n}/>);
                })()}
              </datalist>
              <button
                className="cc-login-btn"
                disabled={!employeeName.trim()}
                onClick={()=>{
                  const trimmed=canonicalizePersonName(employeeName);
                  setEmployeeName(trimmed);
                  if(isManagerName(trimmed,customManagers)) setLoginStep(hasAdminPassword()?"password":"admincheck");
                  else {clearManagerSession();attemptWorkerLogin(trimmed);}
                }}>
                Dalej →
              </button>
              <div className="cc-login-hint">Kierownicy zostaną poproszeni o hasło</div>
            </div>
          )}

          {loginStep==="admincheck"&&(
            <div className="cc-login-card cc-fade-up">
              <div className="cc-login-manager-banner">
                <ShieldCheck size={20}/>
                <div>
                  <div className="cc-login-manager-name">{employeeName}</div>
                  <div className="cc-login-manager-sub">Pierwsze logowanie — podaj hasło admina</div>
                </div>
              </div>
              <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:8,lineHeight:1.5}}>
                Aby aktywować konto kierownika, wpisz hasło administratora systemu. Następnie ustawisz swoje własne hasło.
              </div>
              <input
                className="cc-login-input"
                type="password"
                placeholder="Hasło admina"
                value={loginAdminInput}
                autoFocus
                onChange={e=>setLoginAdminInput(e.target.value)}
                onKeyDown={e=>{
                  if(e.key==="Enter"){
                    if(verifyBootstrapPassword(loginAdminInput)){
                      setLoginAdminInput("");
                      setLoginStep("setup");
                    }else{
                      showToast("Nieprawidłowe hasło administratora.","error");
                      setLoginAdminInput("");
                    }
                  }
                }}
              />
              <div style={{display:"flex",gap:8,width:"100%"}}>
                <button className="cc-login-btn-ghost" onClick={()=>{setLoginAdminInput("");setLoginStep("name");}}>← Wstecz</button>
                <button
                  className="cc-login-btn"
                  style={{flex:1}}
                  disabled={!loginAdminInput}
                  onClick={()=>{
                    if(verifyBootstrapPassword(loginAdminInput)){
                      setLoginAdminInput("");
                      setLoginStep("setup");
                    }else{
                      showToast("Nieprawidłowe hasło administratora.","error");
                      setLoginAdminInput("");
                    }
                  }}>
                  Dalej →
                </button>
              </div>
            </div>
          )}

          {loginStep==="setup"&&(
            <div className="cc-login-card cc-fade-up">
              <div className="cc-login-manager-banner">
                <ShieldCheck size={20}/>
                <div>
                  <div className="cc-login-manager-name">{employeeName}</div>
                  <div className="cc-login-manager-sub">Ustaw swoje hasło kierownika</div>
                </div>
              </div>
              <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:8,lineHeight:1.5}}>
                Wybierz hasło, którym będziesz się logować jako kierownik (min. 8 znaków).
              </div>
              <input
                className="cc-login-input"
                type="password"
                placeholder="Nowe hasło (min. 8 znaków)"
                value={loginPassword}
                autoFocus
                onChange={e=>setLoginPassword(e.target.value)}
                onKeyDown={e=>{ if(e.key==="Enter"&&loginPassword2) document.getElementById("cc-setup-confirm")?.focus(); }}
              />
              <input
                id="cc-setup-confirm"
                className="cc-login-input"
                type="password"
                placeholder="Potwierdź hasło"
                value={loginPassword2}
                onChange={e=>setLoginPassword2(e.target.value)}
                onKeyDown={async e=>{
                  if(e.key==="Enter"){
                    if(loginPassword!==loginPassword2){showToast("Hasła nie są identyczne.","error");return;}
                    const result=await createManagerPassword(loginPassword);
                    if(result.ok){
                      setLoginPassword("");setLoginPassword2("");
                      setCurrentManager(employeeName);setIsAdmin(true);
                      localStorage.setItem(STORAGE_KEYS.adminSession,"true");
                      localStorage.setItem(STORAGE_KEYS.adminUser,employeeName);
                      logManagerLogin(employeeName);
                      completeLogin();
                      showToast(`Hasło ustawione. Zalogowano jako kierownik: ${employeeName}`,"success");
                    }else if(result.reason==="too_short"){
                      showToast("Hasło musi mieć min. 8 znaków.","error");
                    }
                  }
                }}
              />
              <div style={{display:"flex",gap:8,width:"100%"}}>
                <button className="cc-login-btn-ghost" onClick={()=>{setLoginPassword("");setLoginPassword2("");setLoginStep("admincheck");}}>← Wstecz</button>
                <button
                  className="cc-login-btn"
                  style={{flex:1}}
                  disabled={!loginPassword||!loginPassword2}
                  onClick={async()=>{
                    if(loginPassword!==loginPassword2){showToast("Hasła nie są identyczne.","error");return;}
                    const result=await createManagerPassword(loginPassword);
                    if(result.ok){
                      setLoginPassword("");setLoginPassword2("");
                      setCurrentManager(employeeName);setIsAdmin(true);
                      localStorage.setItem(STORAGE_KEYS.adminSession,"true");
                      localStorage.setItem(STORAGE_KEYS.adminUser,employeeName);
                      logManagerLogin(employeeName);
                      completeLogin();
                      showToast(`Hasło ustawione. Zalogowano jako kierownik: ${employeeName}`,"success");
                    }else if(result.reason==="too_short"){
                      showToast("Hasło musi mieć min. 8 znaków.","error");
                    }
                  }}>
                  Ustaw hasło i zaloguj →
                </button>
              </div>
            </div>
          )}

          {loginStep==="password"&&(
            <div className="cc-login-card cc-fade-up">
              <div className="cc-login-manager-banner">
                <ShieldCheck size={20}/>
                <div>
                  <div className="cc-login-manager-name">{employeeName}</div>
                  <div className="cc-login-manager-sub">Konto kierownika — podaj hasło</div>
                </div>
              </div>
              <input
                className="cc-login-input"
                type="password"
                placeholder="Hasło"
                value={loginPassword}
                autoFocus
                onChange={e=>setLoginPassword(e.target.value)}
                onKeyDown={async e=>{
                  if(e.key==="Enter"){
                    const result=await verifyOrCreateAdminPassword(loginPassword);
                    if(result.ok){
                      setLoginPassword("");
                      setCurrentManager(employeeName);
                      setIsAdmin(true);
                      localStorage.setItem(STORAGE_KEYS.adminSession,"true");
                      localStorage.setItem(STORAGE_KEYS.adminUser,employeeName);
                      logManagerLogin(employeeName);
                      completeLogin();
                      showToast(result.created?`Ustawiono hasło kierownika: ${employeeName}`:`Zalogowano jako kierownik: ${employeeName}`,"success");
                    }else if(result.reason==="too_short"){
                      showToast("Hasło musi mieć min. 8 znaków.","error");
                    }else{
                      showToast("Nieprawidłowe hasło.","error");
                      setLoginPassword("");
                    }
                  }
                }}
              />
              <div style={{display:"flex",gap:8,width:"100%"}}>
                <button className="cc-login-btn-ghost" onClick={()=>{setLoginPassword("");setLoginStep("name");}}>← Wstecz</button>
                <button
                  className="cc-login-btn"
                  style={{flex:1}}
                  disabled={!loginPassword}
                  onClick={async()=>{
                    const result=await verifyOrCreateAdminPassword(loginPassword);
                    if(result.ok){
                      setLoginPassword("");
                      setCurrentManager(employeeName);
                      setIsAdmin(true);
                      localStorage.setItem(STORAGE_KEYS.adminSession,"true");
                      localStorage.setItem(STORAGE_KEYS.adminUser,employeeName);
                      logManagerLogin(employeeName);
                      completeLogin();
                      showToast(result.created?`Ustawiono hasło kierownika: ${employeeName}`:`Zalogowano jako kierownik: ${employeeName}`,"success");
                    }else if(result.reason==="too_short"){
                      showToast("Hasło musi mieć min. 8 znaków.","error");
                    }else{
                      showToast("Nieprawidłowe hasło.","error");
                      setLoginPassword("");
                    }
                  }}>
                  Zaloguj →
                </button>
              </div>
              <button
                className="cc-login-skip"
                onClick={()=>{setLoginPassword("");clearManagerSession();completeLogin();showToast("Tryb pracownika — bez panelu kierownika.","info");}}>
                Pomiń (kontynuuj jako pracownik)
              </button>
            </div>
          )}
          </div>
          <div className="cc-login-footer">© Conrad Comfort · Panel Recepcji</div>
        </main>
        {/* Modal potwierdzenia tożsamości — musi być też tutaj: gdy pracownik loguje się
            0–30 min przed startem zmiany, loginStep zostaje "name" i render trafia w ten
            wczesny return ekranu logowania (modal w głównym return byłby nieosiągalny). */}
        {identityConfirm&&<IdentityConfirmModal {...identityConfirm} onConfirm={()=>{const n=identityConfirm.employeeName;setIdentityConfirm(null);completeLogin(n);}} onCancel={()=>setIdentityConfirm(null)}/>}
      </div>
    );
  }

  return(
    <div className={appShellClass}>
      {/* ═══ Globalny bot agenta AI — stały FAB w HK, dymek w każdym oknie ════ */}
      <AgentBot
        inHK={workerTab==="hk" && !showAdminPanel}
        dateKey={hkDate}
        suggestions={agentSuggestions}
        requests={agentRequests}
        notices={[...taskReminderNotices,...agentNotices]}
        attention={botAttention}
        dark={canAccessManagerPanel&&showAdminPanel?adminDark:workerDark}
        openSignal={botOpenSignal}
        onApplySwap={applyAgentSwap}
        onDismissSwap={dismissAgentSwap}
        onApplyRequest={applyAgentRequest}
        onDismissRequest={dismissAgentRequest}
        onDismissNotice={(id)=>{
          // „OK" na przypomnieniu o zadaniu = ten sam trwały klucz co „Zamknij" na karcie.
          if(typeof id==="string"&&id.startsWith("task:"))
            setDismissedReminderKeys(prev=>prev.includes(id.slice(5))?prev:[...prev,id.slice(5)]);
          else dismissAgentNotice(id);
        }}
        onGoToHK={goToAgentMonitor}
      />
      {/* ═══ Shell Top Bar (sekcja 2 redesign) ═══════════════════════════════ */}
      <header className={`cc-shell-topbar${mgrToggleMini?" cc-shell-topbar--mini":""}${canAccessManagerPanel&&showAdminPanel?" cc-shell-topbar--admin":""}`}>
        <div className="cc-shell-topbar-left">
          {canAccessManagerPanel&&(
            <div className="cc-shell-topbar-brand" aria-hidden="true">
              <Logo variant="dotsOnly" tone="white" width={28} height={6}/>
            </div>
          )}
          <div className="cc-shell-topbar-titlewrap">
            <div className="cc-shell-topbar-crumb">
              <b>{canAccessManagerPanel&&showAdminPanel?"Admin":"Recepcja"}</b>
              <svg width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6"/></svg>
              <span>{(canAccessManagerPanel&&showAdminPanel)?(ADMIN_TAB_LABELS[adminTab]||adminTab):(WORKER_TAB_LABELS[workerTab]||workerTab)}</span>
            </div>
            <h1 className="cc-shell-topbar-title">
              {(canAccessManagerPanel&&showAdminPanel)?(ADMIN_TAB_LABELS[adminTab]||"Panel kierownictwa"):(WORKER_TAB_LABELS[workerTab]||"Panel recepcji")}
            </h1>
            {canAccessManagerPanel&&showAdminPanel&&(
              <div className="cc-shell-topbar-meta">
                <span>Zalogowany(a) jako kierownik: <strong>{currentManager}</strong></span>
              </div>
            )}
          </div>
        </div>
        <div className="cc-shell-topbar-actions">
          <button
            className="cc-shell-topbar-search"
            onClick={()=>setShowSearch(true)}
            title="Wyszukiwarka globalna (Ctrl+K)">
            <Search size={14}/>
            <span className="cc-shell-topbar-search-label">Szukaj pokoju, gościa, voucheru…</span>
            <kbd>Ctrl K</kbd>
          </button>
          {!mgrToggleMini&&(
            <div className="cc-shell-topbar-clock" aria-live="polite">
              <span className="cc-shell-topbar-clock-dot"/>
              <div>
                <div className="cc-shell-topbar-clock-time">{liveTime||new Date().toLocaleTimeString("pl-PL").slice(0,5)}</div>
                <div className="cc-shell-topbar-clock-date">{new Date().toLocaleDateString("pl-PL",{weekday:"short",day:"2-digit",month:"short"})}</div>
              </div>
            </div>
          )}
          {canAccessManagerPanel&&(
            <div className="cc-shell-topbar-roletoggle" role="tablist" aria-label="Wybór panelu kierownika">
              <button
                className={`cc-shell-topbar-roletab${!showAdminPanel?" is-active":""}`}
                role="tab" aria-selected={!showAdminPanel}
                onClick={()=>{setShowAdminPanel(false);localStorage.setItem("reception-last-view","worker");setLastView("worker");}}>
                Panel pracownika
              </button>
              <button
                className={`cc-shell-topbar-roletab${showAdminPanel?" is-active":""}`}
                role="tab" aria-selected={showAdminPanel}
                onClick={()=>{setShowAdminPanel(true);localStorage.setItem("reception-last-view","manager");setLastView("manager");}}>
                Panel kierownika
              </button>
            </div>
          )}
          {/* Mini-toggle paska i "Wyloguj kierownika" usunięte z górnego paska —
              wylogowanie jest w sidebarze panelu kierownika. */}
        </div>
      </header>
      <div className="app-layout worker-layout">
        {(canAccessManagerPanel&&showAdminPanel)?(
          <AdminSidebarRail
            activeTab={adminTab} setActiveTab={setAdminTab}
            setShowWiki={setShowWiki} setShowAuditLog={setShowAuditLog}
            handleAdminLogout={handleAdminLogout} setShowSearch={setShowSearch}
            adminDark={adminDark} setAdminDark={setAdminDark}
            onCheckUpdate={checkForUpdates} currentManager={currentManager}
            unreadMsgCount={unreadMsgCount}
            updateState={updateState} updateInfo={updateInfo} updateProgress={updateProgress}
            onDownloadUpdate={()=>window.electronAPI?.downloadUpdate()}
            onInstallUpdate={()=>window.electronAPI?.installUpdate()}
            pendingCorrections={pendingCorrections.length}
            faultsCount={faultsCount}
            chatCount={chatUnread}
            showToast={showToast}
          />
        ):(
          <WorkerSidebar activeTab={workerTab} setActiveTab={setWorkerTab} started={started} overdueCount={overdueTasks.length} datedCount={todayDatedReminders.length} setShowWiki={setShowWiki} setShowEmpReport={setShowEmpReport} isAdmin={canAccessManagerPanel} currentManager={canAccessManagerPanel?currentManager:""} setShowAdminPanel={setShowAdminPanel} setShowSearch={setShowSearch} workerDark={workerDark} setWorkerDark={setWorkerDark} setShowPaymentForm={setShowPaymentForm} employeeName={employeeName} selectedShift={selectedShift} shiftLabel={shiftShortLabel(selectedShift)} onShowMsg={()=>setShowMsgModal(true)} liveTime={liveTime} shiftElapsed={shiftElapsed} progress={progress} totalDone={totalDone} totalMandatory={totalMandatory} onOpenFinish={()=>setFinishDialogOpen(true)} inboxCount={inboxCount} faultsCount={faultsCount} chatCount={chatUnread} showToast={showToast}/>
        )}
        <main className={`worker-content${(canAccessManagerPanel&&showAdminPanel&&!adminDark)?" admin-light":""}`}>
          <div className={`container${isWideWorkerPanel?" container-wide":""}`}>
            {(canAccessManagerPanel&&showAdminPanel)?adminPanel:workerView}
          </div>
        </main>
      </div>
      <AnimatePresence>{showWiki&&wikiDrawer}</AnimatePresence>
      <AnimatePresence>{showMsgModal&&<MessageModal key="msgm" onClose={()=>setShowMsgModal(false)} employeeName={employeeName} employees={employees} messages={messages} setMessages={setMessages} dark={dark}/>}</AnimatePresence>
      <AnimatePresence>{showSearch&&<GlobalSearchModal key="gs" onClose={()=>setShowSearch(false)} dark={dark} wikiEntries={wikiEntries} onOpenWiki={(id)=>{setShowSearch(false);if(id){setSelectedWikiId(id);setWikiExpandedId(id);}setShowWiki(true);}}/>}</AnimatePresence>
      {finishModal}
      {shiftEndReminderModal}
      {safeGuardModal}
      {testClockWidget}
      <AnimatePresence>{showPreShiftModal&&<PreShiftModal key="preshift" employeeName={employeeName} selectedShift={selectedShift} shiftLabel={shiftFullLabel(selectedShift)} onCancel={()=>{setShowPreShiftModal(false);setLoginStep("name");setEmployeeName("");setSelectedShift("");setPendingAutoStart(false);setLoginShiftSource("clock");if(canAccessManagerPanel)clearManagerSession();}} onConfirm={actualStartShift}/>}</AnimatePresence>
      {identityConfirm&&<IdentityConfirmModal {...identityConfirm} onConfirm={()=>{const n=identityConfirm.employeeName;setIdentityConfirm(null);completeLogin(n);}} onCancel={()=>setIdentityConfirm(null)}/>}
      <AnimatePresence>{showAuditLog&&<AuditLogModal key="audit" onClose={()=>setShowAuditLog(false)}/>}</AnimatePresence>
      <AnimatePresence>{showEmpReport&&<EmployeeReportModal key="er" employees={employees} dark={dark} onClose={()=>setShowEmpReport(false)} currentEmployeeName={employeeName} onDownload={downloadEmployeeReportPDF}/>}</AnimatePresence>
      {confirmDialog&&<ConfirmModal message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onClose={()=>setConfirmDialog(null)}/>}
      {promptDialog&&<PromptModal message={promptDialog.message} defaultValue={promptDialog.defaultValue} okLabel={promptDialog.okLabel} placeholder={promptDialog.placeholder} onSubmit={promptDialog.onSubmit} onClose={()=>setPromptDialog(null)}/>}
      <ToastContainer toasts={toasts} dismiss={dismissToast}/>
      {!updateNoticeDismissed&&(
        <GlobalUpdateNotice
          state={updateState} info={updateInfo} progress={updateProgress} dark={dark}
          onDownload={()=>window.electronAPI?.downloadUpdate()}
          onInstall={()=>window.electronAPI?.installUpdate()}
          onDismiss={()=>setUpdateNoticeDismissed(true)}
        />
      )}
      {/* Correction approval modal */}
      <AnimatePresence>{correctionApprovalModal&&(
        <CorrectionApprovalModal
          key="cam"
          correction={correctionApprovalModal}
          currentManager={currentManager}
          onClose={()=>setCorrectionApprovalModal(null)}
          onApprove={(id,note,sig)=>{
            const updated=paymentCorrections.map(c=>c.id===id?{
              ...c,
              done:true,
              approvals:{...(c.approvals||{}),[currentManager]:{at:fmtA(),note:note||"",signature:sig||null}}
            }:c);
            setPaymentCorrections(updated);
            saveJson(STORAGE_KEYS.paymentCorrections,updated);
            addAudit(currentManager,"Zatwierdził(a) korektę: "+correctionApprovalModal.reservation);
            showToast("Korekta rozpatrzona i podpisana.","success");
            setCorrectionApprovalModal(null);
          }}
          onDownload={(c)=>downloadCorrectionPDF(c,currentManager)}
        />
      )}</AnimatePresence>
      {/* Payment correction modal */}
      <AnimatePresence>{showPaymentForm&&(
        <motion.div key="pcm" className="modal-backdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onClick={()=>setShowPaymentForm(false)}>
          <motion.div className="modal large-modal" initial={{scale:.96,y:8}} animate={{scale:1,y:0}} onClick={e=>e.stopPropagation()} style={{maxWidth:580}}>
            <div style={{background:"var(--plum)",borderRadius:"var(--radius-lg) var(--radius-lg) 0 0",margin:"-26px -26px 22px",padding:"18px 26px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <div>
                <div style={{color:"#fff",fontWeight:400,fontSize:20,display:"flex",alignItems:"center",gap:10,fontFamily:"'DM Serif Display',serif",letterSpacing:".005em"}}>
                  <FileText size={18} style={{color:"var(--gold)"}}/> Korekta płatności
                </div>
                <div style={{color:"rgba(255,255,255,.7)",fontSize:12,marginTop:3}}>Zgłoszenie trafi bezpośrednio do kierownictwa</div>
              </div>
              <button onClick={()=>setShowPaymentForm(false)} style={{background:"rgba(255,255,255,.12)",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",padding:"7px 10px",display:"flex",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.2)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.12)"}><X size={16}/></button>
            </div>
            {employeeName?(
              <div style={{background:"var(--plum-soft)",border:"1px solid var(--plum-border)",borderLeft:"3px solid var(--plum)",borderRadius:"var(--radius-md)",padding:"12px 16px",marginBottom:16,display:"flex",alignItems:"center",gap:12}}>
                <div style={{width:36,height:36,borderRadius:"50%",background:"var(--plum)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:800,flexShrink:0}}>{employeeName[0]}</div>
                <div><div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",fontFamily:"'DM Serif Display',serif"}}>{employeeName}</div><div style={{fontSize:11.5,color:"var(--text-muted)",marginTop:1}}>{shiftShortLabel(selectedShift)} · {fmtA()}</div></div>
              </div>
            ):(
              <div style={{marginBottom:16}}>
                <label style={{display:"block",marginBottom:6,fontWeight:700,fontSize:12,textTransform:"uppercase",letterSpacing:".05em",color:"var(--text-muted)"}}>Kto zgłasza korektę?</label>
                <div style={{display:"flex",flexWrap:"wrap",gap:8}}>
                  {employees.map(emp=>(
                    <button key={emp} type="button" onClick={()=>setPcEmployee(emp)}
                      style={{padding:"9px 18px",borderRadius:"var(--radius-md)",cursor:"pointer",fontSize:13,fontWeight:pcEmployee===emp?700:500,
                              border:`1.5px solid ${pcEmployee===emp?"var(--plum)":"var(--border-medium)"}`,
                              background:pcEmployee===emp?"var(--plum-soft)":"var(--bg-card)",
                              color:pcEmployee===emp?"var(--plum)":"var(--text-secondary)"}}>
                      {emp}
                    </button>
                  ))}
                </div>
                {!pcEmployee&&<div style={{fontSize:11.5,color:"var(--rose)",marginTop:6}}>Wybierz imię żeby wysłać zgłoszenie</div>}
              </div>
            )}
            <div className="stack" style={{gap:14}}>
              <div>
                <label>Typ dokumentu z błędem</label>
                <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginTop:6}}>
                  {[["paragon","Paragon fiskalny"],["faktura","Faktura VAT"]].map(([val,lbl])=>(
                    <button key={val} type="button" onClick={()=>setPcDocType(val)} style={{padding:"11px 10px",borderRadius:"var(--radius-md)",border:`1.5px solid ${pcDocType===val?"var(--plum)":"var(--border-medium)"}`,background:pcDocType===val?"var(--plum-soft)":"var(--bg-card)",cursor:"pointer",fontSize:13,fontWeight:pcDocType===val?700:500,color:pcDocType===val?"var(--plum)":"var(--text-secondary)",transition:"all .15s"}}>{lbl}</button>
                  ))}
                </div>
              </div>
              <div><label>Nr dokumentu / rezerwacji</label><input className="input" placeholder="Np. paragon 00234 · RES-2026-1234 · FV/2026/031" value={pcReservation} onChange={e=>setPcReservation(e.target.value)}/></div>
              <div><label>Wyjaśnienie — co się stało i jak powinno być</label><textarea className="input" style={{minHeight:130,resize:"vertical",lineHeight:1.7}} placeholder={"Opisz sytuację i podaj prawidłowe dane:\n\nNp. Na paragonie 00234 wpisano kwotę 250 zł zamiast 350 zł.\nGość: Jan Kowalski, pokój 302, data: 20.03.2026.\nNależy wystawić korektę na +100 zł."} value={pcExplanation} onChange={e=>setPcExplanation(e.target.value)}/>{llmReady&&<button type="button" className="btn btn-outline" style={{fontSize:11.5,marginTop:6,display:"inline-flex",alignItems:"center",gap:5}} disabled={polishingNote||!pcExplanation.trim()} onClick={async()=>{setPolishingNote(true);try{const o=await polishText(pcExplanation.trim());if(o)setPcExplanation(o);showToast("Tekst zredagowany.","success");}catch(err){showToast(err?.code==="rate_limited"?"Limit — spróbuj za chwilę.":"AI niedostępne.","error");}finally{setPolishingNote(false);}}}><Sparkles size={12}/>{polishingNote?"Redaguję…":"Zredaguj AI"}</button>}</div>
              <div>
                <label style={{display:"block",marginBottom:6,fontWeight:600,fontSize:13}}>Twój podpis elektroniczny</label>
                <div style={{fontSize:11.5,color:"var(--text-muted)",marginBottom:8}}>Podpisz myszką — pojawi się na dokumencie dla księgowości</div>
                <SignatureCanvas
                  label={`Podpisz: ${employeeName||pcEmployee||"pracownik"}`}
                  onSave={setPcSignature}
                  height={80}
                  dark={false}
                />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-outline" onClick={()=>setShowPaymentForm(false)}>Anuluj</button>
              <button className="btn btn-amber" onClick={submitPaymentCorrection} disabled={(!employeeName&&!pcEmployee)||!pcReservation.trim()||!pcExplanation.trim()}><FileText size={14}/> Wyślij do kierownictwa</button>
            </div>
          </motion.div>
        </motion.div>
      )}</AnimatePresence>
      <AnimatePresence>{showSuccessAnim&&(
        <motion.div key="sanim" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} transition={{duration:.3}}
          style={{position:"fixed",inset:0,zIndex:9999,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(90,29,74,.82)",backdropFilter:"blur(6px)"}}>
          <Lottie animationData={checkPlumAnim} loop={false} style={{width:180,height:180}}/>
          <div style={{color:"#fff",fontFamily:"'DM Serif Display',serif",fontSize:26,fontWeight:400,marginTop:8,letterSpacing:".01em"}}>Zmiana zakończona</div>
          <div style={{color:"rgba(255,255,255,.65)",fontSize:13,marginTop:6}}>Raport PDF zapisany</div>
        </motion.div>
      )}</AnimatePresence>
    </div>
  );
}
