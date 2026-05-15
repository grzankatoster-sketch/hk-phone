// Copyright © 2026 Conrad Comfort. All rights reserved. UNLICENSED.
import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import jsPDF from "jspdf";
import UpdateBanner from "./UpdateBanner";
import Logo from "./ui/Logo";
import ScheduleAdminPanel from "./modules/ScheduleAdmin/ScheduleAdminPanel";
import VouchersPanel from "./modules/Vouchers/VouchersPanel";
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
import StaliGosciePanel from "./modules/StaliGoscie/StaliGosciePanel";
import ConfirmModal from "./components/modals/ConfirmModal";
import GlobalSearchModal from "./components/modals/GlobalSearchModal";
import EmployeeReportModal from "./components/modals/EmployeeReportModal";
import PreShiftModal from "./components/modals/PreShiftModal";
import AuditLogModal from "./components/modals/AuditLogModal";
import MessageModal from "./components/modals/MessageModal";
import CorrectionApprovalModal from "./components/modals/CorrectionApprovalModal";
import InboxPanel from "./components/InboxPanel";
import SignatureCanvas from "./components/SignatureCanvas";
import WorkerSidebar from "./components/Rail/WorkerSidebar";
import AdminSidebarRail from "./components/Rail/AdminSidebarRail";
import { getFullName } from "./lib/employees";
import { supabase } from "./lib/supabase";
import {
  LogIn, LogOut, Plus, Trash2, ClipboardList, ShieldCheck, BookOpen,
  Search, Settings, History, BellRing, AlertTriangle, X,
  Users, FileText, Download, Cog, Inbox,
  Bell, Calendar, CheckSquare, ArrowLeftRight, Moon, Sun,
  BarChart2, TrendingUp, MessageSquare, RefreshCw, AlertCircle, Send,
  Eye, EyeOff, Maximize2, Minimize2,
} from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson, getCustomManagers } from "./lib/storage";
import { verifyOrCreateAdminPassword, hasAdminPassword, verifyBootstrapPassword, createManagerPassword } from "./lib/adminAuth";
import {
  ADMIN_MANAGERS, SHIFT_OPTIONS,
  SHIFT_LABELS, SHIFT_LABELS_PL, SHIFT_SHORT_LABELS,
  defaultEmployees, defaultTasks, getDefaultWikiEntries, emptyCarryOver,
  HK_FLOOR1, HK_FLOOR2, HK_FLOOR3, HK_ALL, TENANT_ID,
} from "./lib/constants";
import { fmt, fmtA, todayKey, monthKey, autoDetectShift, shiftFromSchedule } from "./lib/dates";
import { normalizeToShift } from "./lib/excel";
import { pl, plR, normTask, buildShiftFn, buildEmpFn, fmtMoney } from "./lib/format";
import { mkPDF_header, mkPDF_section, mkPDF_kv, mkPDF_paragraph, mkPDF_item, mkPDF_footer, savePDF } from "./lib/pdf";
import { canonicalizeNameInput, canonicalizePersonName, getCanonicalManagerName, isManagerName } from "./lib/names";
import { downloadDailyReportPDF } from "./lib/pdf-daily";
import Lottie from "lottie-react";
import { checkPlumAnim } from "./lib/lottie-check";


const addAudit=(manager,action)=>{const log=loadJson(STORAGE_KEYS.adminAudit,[]);saveJson(STORAGE_KEYS.adminAudit,[{id:crypto.randomUUID(),manager,action,at:fmtA()},...log].slice(0,200));};



function downloadCorrectionPDF(c,managerName){
  const doc=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
  const ml=18,mr=18,cw=pw-ml-mr;let y=0;
  const chk=(n=10)=>{if(y+n>ph-14){doc.addPage();y=22;return 22;}};

  mkPDF_header(doc,pw,"KOREKTA PLATNOSCI",new Date().toLocaleDateString("pl-PL"));
  y=36;

  // ── Dane dokumentu ──
  y=mkPDF_kv(doc,ml,y,"Typ dokumentu",pl((c.docType||"dokument").toUpperCase()));
  y=mkPDF_kv(doc,ml,y,"Nr dokumentu",pl(c.reservation||"-"));
  y=mkPDF_kv(doc,ml,y,"Data zgloszenia",pl((c.submittedAt||"-").replace(/,.*$/,"")));
  y+=4;

  // ── Kto popelnil blad ──
  y=mkPDF_section(doc,pw,ml,cw,y,"Kto popelnil blad");
  doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(14,12,10);
  doc.text(pl(getFullName(c.submittedBy)),ml,y);y+=7;
  doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.setTextColor(95,86,68);
  const shiftLbl=pl(SHIFT_LABELS_PL[c.shift]||c.shift||"");
  if(shiftLbl)doc.text(shiftLbl+" | "+pl(c.submittedAt||""),ml,y);
  else doc.text(pl(c.submittedAt||""),ml,y);
  y+=12;

  // ── Wyjasnienie pracownika ──
  y=mkPDF_section(doc,pw,ml,cw,y,"Wyjasnienie pracownika");
  y=mkPDF_paragraph(doc,ml,cw,y,c.explanation||c.reason||"-",10,chk);
  y+=6;

  // ── Uwagi kierownictwa ──
  const approvals=c.approvals||{};
  const approvedManagers=Object.entries(approvals).filter(([,v])=>v&&v.at);
  const withNotes=approvedManagers.filter(([,v])=>v.note);
  if(withNotes.length){
    y=mkPDF_section(doc,pw,ml,cw,y,"Uwagi kierownictwa");
    withNotes.forEach(([mgr,v])=>{
      chk(14);
      doc.setFont("helvetica","bold");doc.setFontSize(9.5);doc.setTextColor(38,70,45);
      doc.text(pl(getFullName(mgr))+":",ml,y);y+=7;
      y=mkPDF_paragraph(doc,ml+4,cw-8,y,v.note,9.5,chk);y+=4;
    });
    y+=2;
  }

  // ── Podpisy — Word style: dwie kolumny tekstu, linia na podpis ──
  chk(60);
  y=mkPDF_section(doc,pw,ml,cw,y,"Podpisy");
  const colW=(cw-12)/2;
  const approvalEntry=approvedManagers[0];
  const mgrName=approvalEntry?approvalEntry[0]:(managerName||"Kierownik");
  const mgrSig=approvalEntry?approvalEntry[1].signature:null;
  const empSig=c.employeeSignature||null;

  const drawSigCol=(x,bW,roleLabel,name,sigB64)=>{
    // Label roli — maly szary tekst
    doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(110,102,88);
    doc.text(pl(roleLabel),x,y);
    // Imie i nazwisko
    doc.setFont("helvetica","bold");doc.setFontSize(10.5);doc.setTextColor(14,12,10);
    doc.text(pl(name),x,y+7);
    if(sigB64){
      // Narysowany podpis
      try{doc.addImage(sigB64,"PNG",x,y+12,bW,28);}catch{}
      // Linia pod
      doc.setDrawColor(160,150,135);doc.setLineWidth(0.4);doc.line(x,y+42,x+bW,y+42);
    }else{
      // Pusta linia do podpisu odręcznego
      doc.setDrawColor(160,150,135);doc.setLineWidth(0.4);doc.line(x,y+38,x+bW,y+38);
      doc.setFont("helvetica","italic");doc.setFontSize(7);doc.setTextColor(158,148,132);
      doc.text(pl("podpis odrecznie"),x+bW/2,y+43,{align:"center"});
    }
  };

  drawSigCol(ml,colW,"Osoba, która popełniła błąd:",getFullName(c.submittedBy),empSig);
  drawSigCol(ml+colW+12,colW,"Kierownik — zatwierdza korektę:",getFullName(mgrName),mgrSig);
  y+=50;

  mkPDF_footer(doc,ph,pw,ml,mr,"korekta platnosci");
  savePDF(doc,"korekta_"+pl(c.reservation||"dok").replace(/[^a-zA-Z0-9]/g,"_")+"_"+(c.submittedAt||"").slice(0,10)+".pdf","korekty i raporty");
}

function downloadShiftPDF(report) {
  const doc=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
  const ml=18,mr=18,cw=pw-ml-mr;let y=0;
  const chk=(n=10)=>{if(y+n>ph-14){doc.addPage();y=22;return 22;}};

  mkPDF_header(doc,pw,"Raport zmiany recepcji",pl(report.savedAtLabel||""));
  y=36;

  // ── Informacje o zmianie ──
  y=mkPDF_section(doc,pw,ml,cw,y,"Informacje o zmianie");
  y=mkPDF_kv(doc,ml,y,"Pracownik",pl(getFullName(report.employeeName)||report.employeeName||"-"),chk);
  y=mkPDF_kv(doc,ml,y,"Zmiana",pl(report.shiftLabel||"-"),chk);
  y=mkPDF_kv(doc,ml,y,"Kasa na start",pl(report.cashOpeningAmount??"-"),chk);
  y=mkPDF_kv(doc,ml,y,"Kwota z dok.",pl(report.cashClosingDocumentsAmount??"-"),chk);
  y=mkPDF_kv(doc,ml,y,"Roznica kasy",pl(report.cashDiffLabel||"-"),chk);
  y+=4;

  // ── Notatka przekazania ──
  if(report.handoverNote){
    chk(16);
    y=mkPDF_section(doc,pw,ml,cw,y,"Notatka przekazania zmiany");
    y=mkPDF_paragraph(doc,ml,cw,y,report.handoverNote,10,chk);y+=4;
  }

  // ── Zadania — funkcja pomocnicza ──
  const section=(title,items,emptyMsg)=>{
    chk(14);
    y=mkPDF_section(doc,pw,ml,cw,y,title);
    if(!items||!items.length){
      chk(8);doc.setFont("helvetica","italic");doc.setFontSize(8.5);doc.setTextColor(135,126,110);
      doc.text(pl(emptyMsg||"Brak"),ml+4,y);y+=9;return;
    }
    items.forEach(item=>{
      const st=item.status==="[OK]"||item.status==="✓"?"[OK]":item.status==="[X]"||item.status==="✗"?"[X]":"-";
      y=mkPDF_item(doc,ml,cw,y,st,item.text||"",chk);
    });
    y+=4;
  };

  section("Zadania podstawowe",report.baseTasks,"Brak zadan");
  section("Zadania przekazane tej zmianie",report.carryOver,"Brak przekazanych");
  if(report.missingTasks&&report.missingTasks.length)section("Zadania niewykonane",report.missingTasks);

  mkPDF_footer(doc,ph,pw,ml,mr,"raport zmiany");
  savePDF(doc,report.filename,"raporty dzienne");
}

function downloadEmployeeReportPDF(report) {
  const doc=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
  const ml=18,mr=18,cw=pw-ml-mr;let y=0;
  const chk=(n=10)=>{if(y+n>ph-14){doc.addPage();y=22;return 22;}};

  mkPDF_header(doc,pw,"Notatka sluzbowa",pl(report.createdAt||""));
  y=36;

  y=mkPDF_section(doc,pw,ml,cw,y,"Informacje");
  y=mkPDF_kv(doc,ml,y,"Pracownik",pl(getFullName(report.author)||report.author||"-"),chk);
  y=mkPDF_kv(doc,ml,y,"Przekazuje dla",pl(report.handoverTo||"-"),chk);
  y=mkPDF_kv(doc,ml,y,"Temat",pl(report.subject||"-"),chk);
  y=mkPDF_kv(doc,ml,y,"Data",pl(report.reportDate||"-"),chk);
  y+=6;

  y=mkPDF_section(doc,pw,ml,cw,y,"Tresc notatki");
  y=mkPDF_paragraph(doc,ml,cw,y,report.content||"",10,chk);
  y+=14;

  chk(22);
  doc.setDrawColor(175,164,142);doc.setLineWidth(0.4);doc.line(ml,y,ml+70,y);y+=6;
  doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(105,96,82);
  doc.text(pl("Podpis: "+getFullName(report.author)),ml,y);

  mkPDF_footer(doc,ph,pw,ml,mr,"notatka sluzbowa");
  savePDF(doc,report.filename,"korekty i raporty");
}

// ─── Wiki PDF export ──────────────────────────────────────────────────────────
function downloadWikiPDF(entries) {
  const doc=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
  const ml=18,mr=18,cw=pw-ml-mr;let y=0;
  const chk=(n=8)=>{if(y+n>ph-16){doc.addPage();y=20;return 20;}};
  const now=new Date().toLocaleDateString("pl-PL",{day:"2-digit",month:"2-digit",year:"numeric"});
  // Header
  doc.setFillColor(30,27,22);doc.rect(0,0,pw,38,"F");
  doc.setFillColor(140,100,32);doc.rect(0,36,pw,2,"F");
  doc.setFontSize(8.5);doc.setFont("helvetica","normal");doc.setTextColor(140,100,32);
  doc.text("CONRAD COMFORT",ml,11);
  doc.setFontSize(18);doc.setFont("helvetica","bold");doc.setTextColor(230,225,215);
  doc.text("Wikirecepcja",ml,22);
  doc.setFontSize(8.5);doc.setFont("helvetica","normal");doc.setTextColor(100,95,88);
  doc.text(pl("Baza wiedzy recepcji - "+entries.length+" tematow - Wydruk: "+now),ml,32);
  doc.setFillColor(244,237,226);doc.rect(0,38,pw,10,"F");
  doc.setFontSize(9);doc.setFont("helvetica","bold");doc.setTextColor(140,100,32);
  doc.text(pl("Instrukcja obslugi dla pracownikow recepcji - Conrad Comfort"),ml,45);
  y=56;
  // TOC
  chk(14);
  doc.setFillColor(238,234,228);doc.rect(ml,y-6,cw,9,"F");
  doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(30,27,22);
  doc.text(pl("Spis tresci"),ml+2,y);y+=11;
  entries.forEach((e,i)=>{
    chk(7);
    if(i%2===0){doc.setFillColor(251,248,244);doc.rect(ml,y-5.5,cw,7,"F");}
    doc.setFont("helvetica","bold");doc.setFontSize(9.5);doc.setTextColor(140,100,32);
    doc.text(String(i+1)+".",ml+2,y);
    doc.setFont("helvetica","normal");doc.setTextColor(26,24,20);
    doc.text(pl(e.topic),ml+12,y);
    doc.setTextColor(170,165,160);doc.setFontSize(8.5);
    doc.text(e.updatedAt||"",pw-mr,y,{align:"right"});
    y+=7.5;
  });
  y+=8;
  // Topics
  entries.forEach((e,i)=>{
    chk(20);
    // Section header
    doc.setFillColor(30,27,22);doc.rect(ml,y-6,cw,11,"F");
    doc.setFont("helvetica","bold");doc.setFontSize(11.5);doc.setTextColor(200,180,130);
    doc.text(String(i+1)+".  "+pl(e.topic),ml+4,y);y+=12;
    doc.setFillColor(140,100,32);doc.rect(ml,y-1,cw,1.2,"F");y+=4;
    // Content
    doc.setFont("helvetica","normal");doc.setFontSize(9.5);doc.setTextColor(26,24,20);
    const lines=doc.splitTextToSize(pl(e.content||""),cw-4);
    lines.forEach(line=>{chk(6);doc.text(line,ml+2,y);y+=5.8;});
    if(e.images&&e.images.length){
      chk(8);doc.setFontSize(8.5);doc.setTextColor(140,100,32);
      doc.text(pl("["+e.images.length+" zdjecie(a) - dostepne w aplikacji]"),ml+2,y);y+=7;
    }
    y+=6;
  });
  // Footer
  const total=doc.internal.getNumberOfPages();
  for(let p=1;p<=total;p++){
    doc.setPage(p);
    doc.setDrawColor(200,190,178);doc.setLineWidth(0.3);doc.line(ml,ph-12,pw-mr,ph-12);
    doc.setFontSize(7.5);doc.setFont("helvetica","normal");doc.setTextColor(170,165,158);
    doc.text("Conrad Comfort - Wikirecepcja (wydruk dla pracownikow)",ml,ph-7);
    doc.text("Strona "+p+" / "+total,pw-mr,ph-7,{align:"right"});
  }
  savePDF(doc,"wikirecepcja_"+now.replace(/\./g,"-")+".pdf");
}

function ToastContainer({toasts,dismiss}){
  if(!toasts.length)return null;
  return(
    <div className="toast-container">
      <AnimatePresence>
        {toasts.map(t=>(
          <motion.div key={t.id} initial={{opacity:0,y:14,scale:.95}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:6}} transition={{duration:.2}} className={`toast-item toast-${t.type}`}>
            <div className="toast-dot"/><div className="toast-msg">{t.msg}</div>
            <button className="toast-close" onClick={()=>dismiss(t.id)}><X size={13}/></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function WelcomeOverlayScreen({name,onDone}){
  const [out,setOut]=React.useState(false);
  const onDoneRef=React.useRef(onDone);
  onDoneRef.current=onDone;
  React.useEffect(()=>{
    const t1=setTimeout(()=>setOut(true),1500);
    const t2=setTimeout(()=>onDoneRef.current?.(),1950);
    return()=>{clearTimeout(t1);clearTimeout(t2);};
  },[]);
  const h=new Date().getHours();
  const greeting=h<18?"Dzień dobry,":"Dobry wieczór,";
  return(
    <div className="cc-welcome-overlay" style={{opacity:out?0:1}}>
      <motion.div initial={{opacity:0,y:22}} animate={{opacity:1,y:0}} transition={{duration:.45,ease:[.22,1,.36,1]}} className="cc-welcome-inner">
        <div className="cc-welcome-greeting">{greeting}</div>
        <div className="cc-welcome-name">{name||"Recepcja"}</div>
      </motion.div>
    </div>
  );
}

const IS_DEV_TEST = typeof localStorage !== 'undefined' && localStorage.getItem('dev-test-mode') === '1';

export default function App(){
  const customManagers=React.useMemo(()=>{const m=getCustomManagers();return m.length>0?m:ADMIN_MANAGERS;},[]);
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
  // ── Inline login (B4 + B19) ─────────────────────────────────────────────
  const [loginStep,setLoginStep]=useState("name"); // name | admincheck | setup | password | ready
  const [loginPassword,setLoginPassword]=useState("");
  const [loginPassword2,setLoginPassword2]=useState("");
  const [loginAdminInput,setLoginAdminInput]=useState("");
  const [showWelcomeOverlay,setShowWelcomeOverlay]=useState(false);
  const [pendingAutoStart,setPendingAutoStart]=useState(false);
  const [loginShiftSource,setLoginShiftSource]=useState("clock");
  const [schedule,setSchedule]=useState(()=>loadJson(STORAGE_KEYS.schedule,{}));
  useEffect(()=>{saveJson(STORAGE_KEYS.schedule,schedule);},[schedule]);
  const [lastView,setLastView]=useState(()=>localStorage.getItem("reception-last-view")||"worker"); // worker | manager
  const [mgrToggleMini,setMgrToggleMini]=useState(()=>localStorage.getItem("reception-mgr-toggle-mini")==="1");
  const resolveLoginShift=useCallback(()=>{
    const currentSchedule=loadJson(STORAGE_KEYS.schedule,schedule);
    setSchedule(currentSchedule);
    const scheduledShift=shiftFromSchedule(currentSchedule,employeeName);
    setLoginShiftSource(scheduledShift?"schedule":"clock");
    return scheduledShift||autoDetectShift();
  },[employeeName,schedule]);
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
  const completeLogin=useCallback(()=>{
    const normalizedShift=normalizeToShift(selectedShift)||resolveLoginShift();
    setSelectedShift(normalizedShift);
    setLoginStep("ready");
    setPendingAutoStart(true);
    setShowWelcomeOverlay(true);
  },[resolveLoginShift,selectedShift]);
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
  const [workerTab,setWorkerTab]=useState("zmiana");
  const [adminTab,setAdminTab]=useState("ewidencja");
  const [evidenceMonth,setEvidenceMonth]=useState(monthKey());
  const [activityDay,setActivityDay]=useState(todayKey());
  const [showAuditLog,setShowAuditLog]=useState(false);
  const [shiftStartTime,setShiftStartTime]=useState(null);
  const [datedReminders,setDatedReminders]=useState([]);
  const [newReminderText,setNewReminderText]=useState("");
  const [newReminderShift,setNewReminderShift]=useState("poranna");
  const [newReminderDate,setNewReminderDate]=useState(todayKey());
  const [reminderMode,setReminderMode]=useState("general");
  const [reminderEntryType,setReminderEntryType]=useState("reminder"); // reminder | task
  const [toasts,setToasts]=useState([]);
  const [confirmDialog,setConfirmDialog]=useState(null);
  const [liveTime,setLiveTime]=useState("");
  const [shiftElapsed,setShiftElapsed]=useState("");
  const [showSearch,setShowSearch]=useState(false);
  const [paymentCorrections,setPaymentCorrections]=useState(()=>loadJson(STORAGE_KEYS.paymentCorrections,[]));
  const [savedReports,setSavedReports]=useState(()=>loadJson(STORAGE_KEYS.reports,[]));
  const [showPaymentForm,setShowPaymentForm]=useState(false);
  const [correctionFilter,setCorrectionFilter]=useState("wszystkie");
  const [expandedCorrection,setExpandedCorrection]=useState(null);
  const [wikiExpandedId,setWikiExpandedId]=useState(null);
  const [globalNotifications,setGlobalNotifications]=useState(()=>loadJson(STORAGE_KEYS.globalNotifications,[]));
  const [newGlobalNote,setNewGlobalNote]=useState("");
  const [newGlobalNoteShift,setNewGlobalNoteShift]=useState("");
  const [newGlobalNoteDate,setNewGlobalNoteDate]=useState(()=>new Date().toISOString().split("T")[0]);
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
  const [workerDark,setWorkerDark]=useState(()=>localStorage.getItem(STORAGE_KEYS.workerDark)!=="false");
  const [hkDate,setHkDate]=useState(()=>new Date().toISOString().split("T")[0]);
  const [hkStaff,setHkStaff]=useState(()=>{
    localStorage.removeItem("hk-staff");
    return [];
  });
  const [hkData,setHkData]=useState(()=>{
    // Ładuj dane dla dzisiejszego dnia (per-date persistence)
    const todayStr=new Date().toISOString().split("T")[0];
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
  // Sync hkData → Supabase hk_plan so Railway/web live panel can load assignments
  useEffect(()=>{
    const buildPlanPayload=(date,data)=>{
      if(!data||!date||Object.keys(data).length===0)return null;
      const rt={};
      HK_ALL.forEach(r=>{rt[r.no]=r.type;});
      const asgn={};const pmAsgn={};const pmRt={};
      Object.entries(data).forEach(([no,rd])=>{
        if(rd.status==="W"||rd.status==="WP"||rd.status==="PG"||rd.status==="PGZ"||rd.br||rd.zs){
          pmRt[no]=rd.status==="W"?"W":rd.status==="WP"?"WP":rd.status==="PG"?"PG":rd.status==="PGZ"?"PGZ":rd.br?"BR":"ZS";
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
      if(!Object.keys(asgn).length&&!Object.keys(pmAsgn).length&&!Object.keys(pmRt).length)return null;
      return {
        date,assignments:asgn,pm_assignments:pmAsgn,
        room_types:rt,pm_room_types:pmRt,updated_at:new Date().toISOString()
      };
    };
    const syncPayload=payload=>{
      if(!payload)return;
      supabase.from("hk_plan").upsert(payload,{onConflict:"date"});
      const allPlanned=[
        ...Object.entries(payload.assignments).flatMap(([w,rms])=>rms.map(r=>({date:payload.date,room:r,worker:w,status:"W"}))),
        ...Object.entries(payload.pm_assignments).flatMap(([w,rms])=>rms.map(r=>({date:payload.date,room:r,worker:w,status:"W"}))),
      ];
      if(allPlanned.length)supabase.from("hk_rooms").upsert(allPlanned,{onConflict:"date,room",ignoreDuplicates:true});
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
      HK_ALL_LOCAL.forEach(r=>{rt[r.no]=r.type;});
      const asgn={};const pmAsgn={};const pmRt={};
      Object.entries(data).forEach(([no,rd])=>{
        if(rd.status==="W"||rd.status==="WP"||rd.status==="PG"||rd.status==="PGZ"||rd.br||rd.zs){
          pmRt[no]=rd.status==="W"?"W":rd.status==="WP"?"WP":rd.status==="PG"?"PG":rd.status==="PGZ"?"PGZ":rd.br?"BR":"ZS";
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
      if(!Object.keys(asgn).length&&!Object.keys(pmAsgn).length&&!Object.keys(pmRt).length)return null;
      return {date,assignments:asgn,pm_assignments:pmAsgn,room_types:rt,pm_room_types:pmRt,updated_at:new Date().toISOString()};
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
          if(payload)supabase.from("hk_plan").upsert(payload,{onConflict:"date"});
        }
      }catch{}
    };
    const id=setInterval(run,5*60*1000);
    return()=>clearInterval(id);
  },[]);

  const [adminDark,setAdminDark]=useState(()=>localStorage.getItem(STORAGE_KEYS.adminDark)!=="false");
  const [soundEnabled,setSoundEnabled]=useState(()=>localStorage.getItem(STORAGE_KEYS.soundEnabled)!=="false");
  const [lockedScreen,setLockedScreen]=useState(false);
  const lockTimerRef=useRef(null);
  const LOCK_TIMEOUT=15*60*1000;
  const [newTaskUrgent,setNewTaskUrgent]=useState(false);

  // ── Auto-updater state ────────────────────────────────────────────────────────
  const [updateInfo,setUpdateInfo]=useState(null); // {version,releaseDate}
  const [updateState,setUpdateState]=useState("idle"); // idle|available|downloading|downloaded|error
  const [updateProgress,setUpdateProgress]=useState(0);
  const [updateError,setUpdateError]=useState("");

  useEffect(()=>{
    const api=window.electronAPI;
    if(!api)return;
    api.onUpdateAvailable(info=>{setUpdateInfo(info);setUpdateState("available");});
    api.onUpdateNotAvailable(()=>{setUpdateState("idle");showToast("Masz najnowszą wersję aplikacji.","success",4000);});
    api.onUpdateProgress(p=>{setUpdateState("downloading");setUpdateProgress(p.percent||0);});
    api.onUpdateDownloaded(()=>{setUpdateState("downloaded");showToast("Aktualizacja pobrana — kliknij 'Zainstaluj' w panelu.","success",8000);});
    api.onUpdateError(msg=>{setUpdateState("error");setUpdateError(msg);});
    return()=>api.removeUpdateListeners?.();
  },[]);
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
  const [stalaDiscrepancyInput,setStalaDiscrepancyInput]=useState("");
  const [showStalaDiscrepancyForm,setShowStalaDiscrepancyForm]=useState(false);
  const [showSuccessAnim,setShowSuccessAnim]=useState(false);
  const [cashVisible,setCashVisible]=useState(true);
  const [managerNewStala,setManagerNewStala]=useState("");

  // dark = admin panel OR worker dark mode
  const dark=(isAdmin&&showAdminPanel)?adminDark:workerDark;

  useEffect(()=>{localStorage.setItem(STORAGE_KEYS.workerDark,workerDark);},[workerDark]);
  useEffect(()=>{localStorage.setItem("hk-staff",JSON.stringify(hkStaff));},[hkStaff]);
  useEffect(()=>{
    localStorage.setItem("hk-data",JSON.stringify(hkData));
    saveJson(`hk-data-${hkDate}`,hkData);
  },[hkData,hkDate]);
  useEffect(()=>{localStorage.setItem(STORAGE_KEYS.messages,JSON.stringify(messages));},[messages]);
  useEffect(()=>{setUnreadMsgCount(messages.filter(m=>!m.readByAdmin).length);},[messages]);
  useEffect(()=>{localStorage.setItem(STORAGE_KEYS.adminDark,adminDark);},[adminDark]);
  useEffect(()=>{const dark=(isAdmin&&showAdminPanel)?adminDark:workerDark;document.body.classList.toggle("app-dark",dark);},[isAdmin,showAdminPanel,adminDark,workerDark]);
  useEffect(()=>{localStorage.setItem(STORAGE_KEYS.soundEnabled,soundEnabled);},[soundEnabled]);

  const showToast=useCallback((msg,type="info",duration=4500)=>{
    const id=crypto.randomUUID();setToasts(prev=>[...prev,{id,msg,type}]);
    if(duration>0)setTimeout(()=>setToasts(prev=>prev.filter(t=>t.id!==id)),duration);
  },[]);
  const dismissToast=useCallback((id)=>setToasts(prev=>prev.filter(t=>t.id!==id)),[]);
  const askConfirm=useCallback((message,onConfirm)=>setConfirmDialog({message,onConfirm}),[]);

  // Keyboard shortcuts + lock timer
  useEffect(()=>{
    const h=(e)=>{
      const tag=e.target.tagName;
      const typing=tag==="INPUT"||tag==="TEXTAREA"||tag==="SELECT";
      if(e.key==="Escape"){setShowSearch(false);setShowWiki(false);return;}
      if((e.ctrlKey||e.metaKey)&&e.key==="k"){e.preventDefault();setShowSearch(v=>!v);return;}
      if((e.ctrlKey||e.metaKey)&&e.key==="w"){e.preventDefault();setShowWiki(v=>!v);return;}
      if(!typing&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
        if(e.key==="1"&&!showAdminPanel){setWorkerTab("zmiana");return;}
        if(e.key==="2"&&!showAdminPanel){setWorkerTab("zadania");return;}
        if(e.key==="3"&&!showAdminPanel){setWorkerTab("przekazanie");return;}
      }
    };
    window.addEventListener("keydown",h);return()=>window.removeEventListener("keydown",h);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  },[showAdminPanel]);

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

  // Live clock
  useEffect(()=>{
    const update=()=>{
      const now=new Date();
      setLiveTime(`${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}:${String(now.getSeconds()).padStart(2,"0")}`);
      if(shiftStartTime){const d=Math.floor((now-shiftStartTime)/60000);setShiftElapsed(`${Math.floor(d/60)}h ${d%60}min`);}
    };
    update();const iv=setInterval(update,1000);return()=>clearInterval(iv);
  },[shiftStartTime]);

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
    setDatedReminders(loadJson(STORAGE_KEYS.datedReminders,[]));
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
    };
    sync();
    const ch=supabase.channel("app-alerts-sync")
      .on("postgres_changes",{event:"*",schema:"public",table:"manager_alerts",filter:`tenant_id=eq.${TENANT_ID}`},sync)
      .on("postgres_changes",{event:"*",schema:"public",table:"standing_reminders",filter:`tenant_id=eq.${TENANT_ID}`},sync)
      .subscribe();
    return()=>{supabase.removeChannel(ch);};
  },[]);

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

  const todayDatedReminders=useMemo(()=>{
    if(!started||!selectedShift||!currentSessionDate)return[];
    return datedReminders.filter(r=>r.targetDate===currentSessionDate&&r.targetShift===selectedShift&&!dismissedReminderKeys.includes(`dated-${r.id}`));
  },[started,selectedShift,currentSessionDate,datedReminders,dismissedReminderKeys]);

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

  // Licznik Informacji (Inbox) — aktywne alerty + stale + nowe wiki
  const inboxCount=useMemo(()=>{
    const nowMs=Date.now();
    const alerts=loadJson(STORAGE_KEYS.managerAlerts,[]).filter(a=>{
      const notExp=!a.expires_at||new Date(a.expires_at).getTime()>nowMs;
      const shiftOk=!a.target_shift||!selectedShift||a.target_shift===selectedShift;
      return notExp&&shiftOk;
    }).length;
    const reminders=loadJson(STORAGE_KEYS.standingReminders,[]).filter(r=>r.active!==false).length;
    const wikiLastSeen=parseInt(localStorage.getItem(`${STORAGE_KEYS.wikiLastSeen}-${employeeName}`)||"0");
    const newWiki=wikiEntries.filter(w=>{
      const u=w.updatedAt?new Date(w.updatedAt).getTime():0;
      return u>wikiLastSeen;
    }).length;
    return alerts+reminders+newWiki;
  },[wikiEntries,employeeName,selectedShift,started]);

  const futureDatedReminders=useMemo(()=>{
    const today=todayKey();
    return[...datedReminders].filter(r=>r.targetDate>=today).sort((a,b)=>a.targetDate.localeCompare(b.targetDate)||a.targetShift.localeCompare(b.targetShift));
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

  // Sound effects — defined after all computed values to avoid TDZ
  const playBeep=useCallback((freq=660,dur=0.3)=>{
    if(!soundEnabled)return;
    try{
      const ctx=new AudioContext();
      const osc=ctx.createOscillator();
      const gain=ctx.createGain();
      osc.connect(gain);gain.connect(ctx.destination);
      osc.frequency.value=freq;osc.type="sine";
      gain.gain.setValueAtTime(0.25,ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+dur);
      osc.start();osc.stop(ctx.currentTime+dur);
      setTimeout(()=>ctx.close(),dur*1000+200);
    }catch{}
  },[soundEnabled]);

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
    const hasAlerts=loadJson(STORAGE_KEYS.managerAlerts,[]).filter(a=>{
      const notExp=!a.expires_at||new Date(a.expires_at).getTime()>nowMs;
      return notExp&&(!a.target_shift||a.target_shift===shiftKey);
    }).length>0;
    const hasReminders=loadJson(STORAGE_KEYS.standingReminders,[]).filter(r=>r.active!==false).length>0;
    const wikiLastSeen=parseInt(localStorage.getItem(`${STORAGE_KEYS.wikiLastSeen}-${employeeName}`)||"0");
    const hasNewWiki=wikiEntries.filter(w=>(w.updatedAt?new Date(w.updatedAt).getTime():0)>wikiLastSeen).length>0;
    if(!hasAlerts)localStorage.setItem(`${ackBase}-alerts`,"1");
    if(!hasReminders)localStorage.setItem(`${ackBase}-standing`,"1");
    if(!hasNewWiki)localStorage.setItem(`${ackBase}-wiki`,"1");
    // Permanent hash check for standing reminders — skip re-ack if same set already acknowledged
    if(hasReminders){
      const rems=loadJson(STORAGE_KEYS.standingReminders,[]).filter(r=>r.active!==false);
      const sHash=rems.map(r=>r.id).sort().join(",");
      if(sHash&&localStorage.getItem(`ack-sh-${ackN}-${sHash}`)==="1")localStorage.setItem(`${ackBase}-standing`,"1");
    }
    const allAck=localStorage.getItem(`${ackBase}-alerts`)==="1"
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
    setEmployeeActivityLog(updated);saveJson(STORAGE_KEYS.employeeLog,updated);setCurrentSessionDate(todayKey());setDismissedReminderKeys([]);
    const cleanedCarry={...carryOverTasks,[shiftKey]:(carryOverTasks[shiftKey]||[]).filter(t=>!t.done)};
    setCarryOverTasks(cleanedCarry);saveJson(STORAGE_KEYS.carry,cleanedCarry);setShiftStartTime(new Date());setStarted(true);setWorkerTab("zadania");
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

  const handleAdminLogout=()=>{addAudit(currentManager,"Wylogowanie z panelu kierownika");const updated=adminActivityLog.map((item,i)=>i===0&&!item.logoutAt?{...item,logoutAt:fmtA()}:item);setAdminActivityLog(updated);saveJson(STORAGE_KEYS.adminLog,updated);setIsAdmin(false);setShowAdminPanel(false);setCurrentManager("");setShowWiki(false);setEditingWikiId(null);setWikiTopic("");setWikiContent("");localStorage.removeItem(STORAGE_KEYS.adminSession);localStorage.removeItem(STORAGE_KEYS.adminUser);};
  const handleCheckUpdate=async()=>{
    if(!window.electronAPI?.checkForUpdates){showToast("Aktualizacje działają tylko w zainstalowanej wersji.","info");return;}
    setUpdateState("idle");setUpdateError("");
    const r=await window.electronAPI.checkForUpdates();
    if(r?.isDev) showToast("Tryb dev — aktualizacje dostępne tylko w instalatorze.","info");
    else if(r?.error) showToast("Błąd sprawdzania: "+r.error,"error");
    else showToast("Sprawdzam aktualizacje…","info",3000);
  };
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

  const saveWikiEntry=()=>{
    if(!wikiTopic.trim()||!wikiContent.trim())return;
    if(editingWikiId){
      const updated=wikiEntries.map(e=>e.id===editingWikiId?{...e,topic:wikiTopic.trim(),content:wikiContent.trim(),images:wikiImages,updatedAt:fmt()}:e);
      saveWikiEntries(updated);setSelectedWikiId(editingWikiId);
      addAudit(currentManager,`Edytowanie tematu wiki: "${wikiTopic.trim()}"`);
    }else{
      const ne={id:crypto.randomUUID(),topic:wikiTopic.trim(),content:wikiContent.trim(),images:wikiImages,updatedAt:fmt()};
      saveWikiEntries([ne,...wikiEntries]);setSelectedWikiId(ne.id);
      addAudit(currentManager,`Dodanie tematu wiki: "${wikiTopic.trim()}"`);
    }
    clearWikiForm();showToast("Temat wiki zapisany.","success");
  };

  const deleteWikiEntry=(id)=>{
    const entry=wikiEntries.find(e=>e.id===id);
    saveWikiEntries(wikiEntries.filter(e=>e.id!==id));
    if(editingWikiId===id)clearWikiForm();
    if(selectedWikiId===id)setSelectedWikiId(wikiEntries.filter(e=>e.id!==id)[0]?.id||null);
    addAudit(currentManager,`Usuniecie tematu wiki: "${entry?.topic||id}"`);
    showToast("Temat usunięty.","info");
  };

  // Firebase sync on startup — fetch wiki + tasks if Firebase configured
  const addTask=()=>{if(!newTaskText.trim())return;const updated={...tasks,[taskShiftTarget]:[...(tasks[taskShiftTarget]||[]).map((t,i)=>normTask(t,`${taskShiftTarget}-${i}`)),{id:crypto.randomUUID(),text:newTaskText.trim(),scheduledTime:newTaskTime||"",urgent:newTaskUrgent,weekdaysOnly:newTaskWeekdaysOnly}]};setTasks(updated);saveJson(STORAGE_KEYS.tasks,updated);addAudit(currentManager,`Dodanie zadania do zmiany "${taskShiftTarget}": "${newTaskText.trim()}"${newTaskUrgent?" [PILNE]":""}${newTaskWeekdaysOnly?" [Pn-Pt]":""}`);setNewTaskText("");setNewTaskTime("");setNewTaskUrgent(false);setNewTaskWeekdaysOnly(false);showToast("Zadanie dodane.","success");};
  const removeTask=(shift,index)=>{const txt=tasks[shift]?.[index]?.text||"";const updated={...tasks,[shift]:(tasks[shift]||[]).filter((_,i)=>i!==index)};setTasks(updated);saveJson(STORAGE_KEYS.tasks,updated);if(currentManager)addAudit(currentManager,`Usuniecie zadania ze zmiany "${shift}": "${txt}"`);};
  const toggleTask=(index,checked)=>setCompleted(prev=>({...prev,[index]:!!checked}));
  const addAdditionalTask=()=>{if(!additionalTaskInput.trim()||!employeeName||!selectedShift)return;const updated=[{id:crypto.randomUUID(),text:additionalTaskInput.trim(),shift:selectedShift,employee:employeeName,sessionDate:currentSessionDate,createdAt:fmt()},...extraTasksLog];setExtraTasksLog(updated);saveJson(STORAGE_KEYS.extra,updated);setAdditionalTaskInput("");showToast("Zadanie dodatkowe zapisane.","success");};
  const addCarryOverTask=()=>{if(!shiftNoteInput.trim()||!carryOverTarget||!employeeName||!selectedShift)return;const ne={id:crypto.randomUUID(),text:shiftNoteInput.trim(),fromShift:selectedShift,createdBy:employeeName,createdAt:fmt(),done:false,doneBy:""};const updated={...carryOverTasks,[carryOverTarget]:[...(carryOverTasks[carryOverTarget]||[]),ne]};setCarryOverTasks(updated);saveJson(STORAGE_KEYS.carry,updated);
    const logEntry={id:crypto.randomUUID(),type:"task",from:employeeName,fromShift:selectedShift,toShift:carryOverTarget,text:shiftNoteInput.trim(),createdAt:fmtA()};
    const updatedLog=[logEntry,...handoverLog].slice(0,300);setHandoverLog(updatedLog);saveJson(STORAGE_KEYS.handoverLog,updatedLog);
    setShiftNoteInput("");showToast(`Zadanie przekazane do zmiany ${SHIFT_SHORT_LABELS[carryOverTarget]}.`,"success");};
  const markCarryOverDone=(index)=>{if(!selectedShift)return;const updated={...carryOverTasks,[selectedShift]:(carryOverTasks[selectedShift]||[]).map((t,i)=>i===index?{...t,done:!t.done,doneBy:!t.done?employeeName:""}:t)};setCarryOverTasks(updated);saveJson(STORAGE_KEYS.carry,updated);};
  const addGeneralReminder=(entryType="reminder")=>{
    if(!newReminderText.trim())return;
    const n={id:crypto.randomUUID(),text:newReminderText.trim(),createdBy:employeeName||currentManager||"recepcja",createdAt:fmtA(),targetShift:null,entryType};
    const updated=[n,...globalNotifications];
    setGlobalNotifications(updated);saveJson(STORAGE_KEYS.globalNotifications,updated);
    const logEntry={id:crypto.randomUUID(),type:entryType,from:employeeName||currentManager||"recepcja",fromShift:selectedShift||"—",toShift:"wszystkie",text:newReminderText.trim(),createdAt:fmtA()};
    const updatedLog=[logEntry,...handoverLog].slice(0,300);setHandoverLog(updatedLog);saveJson(STORAGE_KEYS.handoverLog,updatedLog);
    setNewReminderText("");showToast(entryType==="task"?"Ogólne zadanie dodane.":"Ogólne powiadomienie dodane — widoczne na ekranie startowym.","success");
  };

  const addDatedReminder=(entryType="reminder")=>{if(!newReminderText.trim()||!newReminderShift||!newReminderDate){showToast("Wypełnij wszystkie pola.","error");return;}const isAdminCreated=!!(isAdmin&&showAdminPanel);const ne={id:crypto.randomUUID(),text:newReminderText.trim(),targetShift:newReminderShift,targetDate:newReminderDate,createdBy:employeeName||currentManager||"recepcja",createdAt:fmtA(),entryType,source:isAdminCreated?"admin":"worker"};const updated=[ne,...datedReminders];setDatedReminders(updated);saveJson(STORAGE_KEYS.datedReminders,updated);
    const logEntry={id:crypto.randomUUID(),type:entryType,from:employeeName||currentManager||"recepcja",fromShift:selectedShift||"—",toShift:newReminderShift,text:newReminderText.trim(),targetDate:newReminderDate,createdAt:fmtA()};
    const updatedLog=[logEntry,...handoverLog].slice(0,300);setHandoverLog(updatedLog);saveJson(STORAGE_KEYS.handoverLog,updatedLog);
    setNewReminderText("");showToast(entryType==="task"?`Zadanie ustawione na ${newReminderDate}.`:`Przypomnienie ustawione na ${newReminderDate} (${SHIFT_SHORT_LABELS[newReminderShift]}).`,"success");};
  const deleteDatedReminder=(id)=>{const updated=datedReminders.filter(r=>r.id!==id);setDatedReminders(updated);saveJson(STORAGE_KEYS.datedReminders,updated);showToast("Przypomnienie usunięte.","info");};
  const dismissDatedReminder=(id)=>setDismissedReminderKeys(prev=>[...prev,`dated-${id}`]);
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
        setStarted(false);setCurrentSessionDate("");setDismissedReminderKeys([]);setEmployeeName("");setSelectedShift("");setPendingAutoStart(false);setLoginShiftSource("clock");setCashOpeningAmount("");setCashClosingDocumentsAmount("");setCashCurrentAmount("");setCompleted({});setAdditionalTaskInput("");setShiftNoteInput("");setHandoverNote("");setCarryOverTarget("nocna");setFinishDialogOpen(false);setWorkerTab("zmiana");setShiftStartTime(null);localStorage.removeItem(AUTOSAVE_KEY);setAutosaveNote(null);setStalaPotwierdzono(false);setStalaNiezgodnosc(false);setShowSafeDepositModal(false);setSafeDepositKW("");setSafeDepositAmount("");setPostDepositKW("");
        return;
      }
      const anyDone=Object.values(completed).some(v=>v);
      if(anyDone){
        const incident={id:crypto.randomUUID(),employee:employeeName,shift:selectedShift,startedAt:fmtA(shiftStartTime),abandonedAt:fmtA(),minutesActive:Math.round(minElapsed),tasksCompleted:Object.values(completed).filter(v=>v).length,totalTasks:currentTasks.length,resolved:false};
        const updInc=[incident,...loadJson(STORAGE_KEYS.incidentLog,[])].slice(0,100);
        setIncidentLog(updInc);saveJson(STORAGE_KEYS.incidentLog,updInc);
      }
    }
    if(employeeName&&selectedShift)closeEmpEntry();setStarted(false);setCurrentSessionDate("");setDismissedReminderKeys([]);setEmployeeName("");setSelectedShift("");setPendingAutoStart(false);setLoginShiftSource("clock");setCashOpeningAmount("");setCashClosingDocumentsAmount("");setCashCurrentAmount("");setCompleted({});setAdditionalTaskInput("");setShiftNoteInput("");setHandoverNote("");setCarryOverTarget("nocna");setFinishDialogOpen(false);setWorkerTab("zmiana");setShiftStartTime(null);localStorage.removeItem(AUTOSAVE_KEY);setAutosaveNote(null);setStalaPotwierdzono(false);setStalaNiezgodnosc(false);setShowSafeDepositModal(false);setSafeDepositKW("");setSafeDepositAmount("");setPostDepositKW("");
    setLoginStep("name");setLoginPassword("");setLoginPassword2("");setLoginAdminInput("");
  };
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
      saveJson(STORAGE_KEYS.reportsFull,[fullReportEntry,...allFullReports].slice(0,60));

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
    const deposit=parseFloat(safeDepositAmount)||0;
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
  const [voucherVersion,setVoucherVersion]=useState(0);
  const voucherCount=useMemo(()=>loadJson(STORAGE_KEYS.vouchers,[]).filter(v=>v.status==="issued").length,[voucherVersion]);
  useEffect(()=>{
    const onStorage=(e)=>{if(e.key===STORAGE_KEYS.vouchers)setVoucherVersion(v=>v+1);};
    window.addEventListener("storage",onStorage);
    const poll=setInterval(()=>setVoucherVersion(v=>v+1),5000);
    return()=>{window.removeEventListener("storage",onStorage);clearInterval(poll);};
  },[]);
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
                  {isAdmin&&(
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
        {isAdmin&&(
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
  const adminPanel=(
    <div>
      <div className="topbar dark-text" style={{marginBottom:16}}>
        <div><h1>Panel kierownictwa recepcji</h1><p>Zalogowany(a): <strong style={{color:"var(--plum)"}}>{currentManager}</strong></p></div>
      </div>
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
        {adminTab==="parking"&&(
          <motion.div key="parking-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <ParkingPanel dark={adminDark} isAdmin={true} showToast={showToast} employees={employees} employeeName={currentManager}/>
          </motion.div>
        )}
        {adminTab==="usterki"&&(
          <motion.div key="usterki-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <FaultsPanel dark={adminDark} employeeName={currentManager} showToast={showToast} floors1={HK_FLOOR1} floors2={HK_FLOOR2} floors3={HK_FLOOR3} isManager={true}/>
          </motion.div>
        )}
        {adminTab==="goscie"&&(
          <motion.div key="goscie-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <StaliGosciePanel dark={adminDark} isAdmin={true} currentManager={currentManager} addAudit={addAudit}/>
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
        {adminTab==="vouchery"&&(
          <motion.div key="vouchery-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <VouchersPanel employeeName={currentManager||employeeName} isManager={true} showToast={showToast}/>
          </motion.div>
        )}
        {adminTab==="opinie"&&(
          <motion.div key="opinie-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <ReviewsPanel dark={adminDark} employeeName={currentManager||employeeName} isManager={true} showToast={showToast}/>
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
                              <div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)"}}>{employeeName}{isAdmin&&<span style={{marginLeft:8,fontSize:10,padding:"2px 7px",borderRadius:999,background:"var(--plum)",color:"#fff",fontWeight:700,letterSpacing:".05em",textTransform:"uppercase"}}>Kierownik</span>}</div>
                              <div style={{fontSize:11,color:"var(--text-muted)"}}>{loginShiftSource==="schedule"?"Zmiana pobrana z grafiku kierownika":"System wykrył Twoją zmianę z godziny komputera"}</div>
                            </div>
                          </div>
                          <button className="btn btn-outline" style={{fontSize:11.5}} onClick={()=>{
                            setLoginStep("name");setEmployeeName("");setSelectedShift("");setPendingAutoStart(false);setLoginShiftSource("clock");
                            if(isAdmin){setIsAdmin(false);setCurrentManager("");localStorage.removeItem(STORAGE_KEYS.adminSession);localStorage.removeItem(STORAGE_KEYS.adminUser);}
                          }}>Zmień osobę</button>
                        </div>
                        {/* Auto-wykryta zmiana — duza karta z mozliwoscia zmiany */}
                        <div style={{padding:"14px 16px",background:"var(--bg-card)",border:"1px solid var(--border-light)",borderLeft:"4px solid var(--gold)",borderRadius:"var(--radius-md)",marginBottom:12}}>
                          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}>
                            <div>
                              <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:".07em",marginBottom:4}}>Twoja zmiana</div>
                              <div style={{fontSize:18,fontWeight:400,fontFamily:"'DM Serif Display',serif",color:"var(--text-primary)",letterSpacing:".005em"}}>{SHIFT_LABELS_PL[selectedShift]||"—"}</div>
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
                            {isAdmin&&(
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
                  <div className="panel" style={{borderColor:"#fde68a",background:"#fffbeb",position:"relative"}}>
                    <div className="panel-title" style={{color:"#92400e",marginBottom:12}}><Bell size={15}/> Ważne informacje</div>
                    <div style={{display:"grid",gap:8}}>
                      {visibleGlobalNotes.map(n=>(
                        <div key={n.id} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 12px",background:"rgba(255,255,255,.6)",border:"1px solid #fde68a",borderRadius:"var(--radius-md)",position:"relative"}} className="notif-item">
                          <div style={{flex:1}}>
                            <div style={{fontSize:13.5,color:"var(--text-primary)",lineHeight:1.55,fontWeight:500}}>{n.text}</div>
                            <div style={{fontSize:11,color:"var(--text-muted)",marginTop:3}}>{n.createdBy} · {n.createdAt}</div>
                          </div>
                          {n.fromManager?(
                            <div title="Powiadomienie od kierownika — usuwa tylko kierownik"
                              style={{color:"#92400e",opacity:.4,flexShrink:0,display:"flex",alignItems:"center",padding:"3px"}}>
                              <ShieldCheck size={13}/>
                            </div>
                          ):(
                            <button onClick={()=>dismissGlobalNote(n.id)}
                              style={{background:"rgba(0,0,0,.07)",border:"none",cursor:"pointer",color:"#92400e",padding:"3px",borderRadius:"50%",flexShrink:0,display:"flex",alignItems:"center",opacity:.6,transition:"opacity .15s"}}
                              onMouseEnter={e=>e.currentTarget.style.opacity="1"}
                              onMouseLeave={e=>e.currentTarget.style.opacity=".6"}
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
                      {(()=>{const h=new Date().getHours();return h<10?"Dzień dobry":h<18?"Dobre popołudnie":"Dobry wieczór";})()}, {employeeName}
                      <span className="v2-live-pill">Live · {SHIFT_SHORT_LABELS[selectedShift]||selectedShift||"zmiana"}</span>
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
                    <div className="v2-kpi-sub">{SHIFT_LABELS_PL[selectedShift]||SHIFT_SHORT_LABELS[selectedShift]||selectedShift||"—"}</div>
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

                {/* STAŁA KASA — potwierdzenie */}
                {!stalaPotwierdzono&&!stalaNiezgodnosc&&(
                  <div className="panel" style={{borderLeft:"4px solid var(--gold)"}}>
                    <div className="panel-title"><AlertTriangle size={16} style={{color:"var(--gold)"}}/> Potwierdź stan kasy</div>
                    <div style={{fontSize:13,color:"var(--text-secondary)",marginBottom:12}}>Zanim rozpoczniesz pracę, sprawdź czy w kasie jest <strong>{fmtMoney(stalaKasowa)}</strong>.</div>
                    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                      <button className="btn btn-emerald" onClick={()=>setStalaPotwierdzono(true)}>✓ Zgadza się — potwierdzam</button>
                      <button className="btn btn-outline" style={{color:"var(--rose)",borderColor:"var(--rose)"}} onClick={()=>setShowStalaDiscrepancyForm(v=>!v)}>⚠ Zgłoś niezgodność</button>
                    </div>
                    {showStalaDiscrepancyForm&&(
                      <div style={{marginTop:12,padding:12,background:"var(--rose-light)",border:"1px solid var(--rose-border)",borderRadius:"var(--radius-md)"}}>
                        <div style={{fontSize:12,fontWeight:700,color:"var(--rose)",marginBottom:6}}>Ile faktycznie jest w kasie?</div>
                        <div style={{display:"flex",gap:6}}>
                          <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={stalaDiscrepancyInput} onChange={e=>setStalaDiscrepancyInput(e.target.value)} style={{fontSize:13,flex:1}}/>
                          <button className="btn btn-rose" onClick={()=>reportStalaDiscrepancy(stalaDiscrepancyInput)}>Zgłoś</button>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* KW INPUT — kompaktowy panel */}
                <div className="panel">
                  <div className="panel-title"><FileText size={16}/> KW z dokumentów kasowych</div>
                  <div style={{fontSize:12,color:"var(--text-muted)",marginBottom:8}}>Poprzednia zmiana zostawiła {fmtMoney(kwTotal)}. Wpisz aktualną sumę KW z Twojej zmiany:</div>
                  <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={cashClosingDocumentsAmount} onChange={e=>setCashClosingDocumentsAmount(e.target.value)} style={{fontSize:15,padding:"10px 14px"}}/>
                  {cashDiff!==null&&(
                    <div className="cc-cash-summary">
                      <div>
                        <div style={{fontSize:11,color:"var(--text-muted)",fontWeight:700,textTransform:"uppercase",letterSpacing:".06em",display:"flex",alignItems:"center",gap:6}}>
                          Łącznie w kasie
                          <button onClick={()=>setCashVisible(v=>!v)} title={cashVisible?"Ukryj kwoty":"Pokaż kwoty"} aria-label={cashVisible?"Ukryj kwoty":"Pokaż kwoty"} style={{background:"none",border:"none",cursor:"pointer",padding:0,color:"var(--text-muted)",display:"flex",alignItems:"center"}}>{cashVisible?<EyeOff size={12}/>:<Eye size={12}/>}</button>
                        </div>
                        <div style={{fontSize:24,fontFamily:"'DM Serif Display',serif",color:"var(--plum)",letterSpacing:"-.02em"}}>{cashVisible?fmtMoney(cashDiff):"•••"}</div>
                      </div>
                      <div style={{fontSize:11,color:"var(--text-muted)",textAlign:"right"}}>{cashVisible?<>Stała: {fmtMoney(stalaKasowa)}<br/>+ KW: {fmtMoney(parseFloat(cashClosingDocumentsAmount)||0)}</>:<>Stała: •••<br/>+ KW: •••</>}</div>
                    </div>
                  )}
                </div>

                {/* AKCJE */}
                {!canFinishShift&&<div className="alert"><AlertTriangle size={14}/> Uzupełnij kwotę KW z dokumentów, aby zakończyć zmianę.</div>}
                <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
                  <button className="btn btn-indigo" style={{flex:1,minWidth:180}} onClick={()=>setFinishDialogOpen(true)}>Zakończ zmianę</button>
                  <button className="btn btn-outline" onClick={resetView}>Wróć do wyboru</button>
                </div>
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
            {/* KANBAN — 3 kolumny: Do zrobienia / Pilne / Zrobione */}
            {(()=>{
              const enriched=currentTasks.map((task,index)=>{
                const isDone=!!completed[index];
                const isOverdue=!isDone&&task.scheduledTime&&(()=>{const now=new Date();const[h,m]=task.scheduledTime.split(":").map(Number);const sd=new Date(now);sd.setHours(h||0,m||0,0,0);return now>=sd&&shiftStartTime&&sd>=shiftStartTime;})();
                return {task,index,isDone,isOverdue};
              });
              const colTodo=enriched.filter(t=>!t.isDone&&!t.isOverdue&&!t.task.urgent);
              const colHot =enriched.filter(t=>!t.isDone&&(t.isOverdue||t.task.urgent));
              const colDone=enriched.filter(t=>t.isDone);
              const renderCard=({task,index,isDone,isOverdue})=>(
                <motion.div key={task.id} layout
                  className={`cc-kanban-card${isDone?" cc-kanban-card-done":""}${isOverdue?" cc-kanban-card-overdue":""}${task.urgent&&!isDone?" cc-kanban-card-urgent":""}`}>
                  <button className="cc-kanban-check" onClick={()=>toggleTask(index,!isDone)} aria-label={isDone?"Cofnij":"Oznacz jako zrobione"}>
                    {isDone?"✓":""}
                  </button>
                  <div style={{flex:1,minWidth:0}}>
                    <div className="cc-kanban-text">{task.text}</div>
                    <div className="cc-kanban-meta">
                      {task.urgent&&!isDone&&<span className="cc-kanban-tag cc-kanban-tag-rose">PILNE</span>}
                      {task.weekdaysOnly&&!isDone&&<span className="cc-kanban-tag cc-kanban-tag-plum">Pn-Pt</span>}
                      {task.scheduledTime&&<span className={`cc-kanban-time${isOverdue?" cc-kanban-time-late":""}`}>{isOverdue?"⏰ ":"🕒 "}{task.scheduledTime}</span>}
                    </div>
                  </div>
                </motion.div>
              );
              return (
                <div className="cc-kanban-grid">
                  <div className="cc-kanban-col">
                    <div className="cc-kanban-head">
                      <span className="cc-kanban-dot" style={{background:"var(--text-muted)"}}/>
                      Do zrobienia <span className="cc-kanban-count">{colTodo.length}</span>
                    </div>
                    <div className="cc-kanban-list">
                      {colTodo.length===0&&<div className="cc-kanban-empty">Wszystko poukładane</div>}
                      {colTodo.map(renderCard)}
                    </div>
                  </div>
                  <div className="cc-kanban-col cc-kanban-col-hot">
                    <div className="cc-kanban-head">
                      <span className="cc-kanban-dot" style={{background:"var(--rose)"}}/>
                      Pilne / nadchodzące <span className="cc-kanban-count">{colHot.length}</span>
                    </div>
                    <div className="cc-kanban-list">
                      {colHot.length===0&&<div className="cc-kanban-empty">Brak pilnych</div>}
                      {colHot.map(renderCard)}
                    </div>
                  </div>
                  <div className="cc-kanban-col cc-kanban-col-done">
                    <div className="cc-kanban-head">
                      <span className="cc-kanban-dot" style={{background:"var(--emerald)"}}/>
                      Zrobione <span className="cc-kanban-count">{colDone.length}</span>
                    </div>
                    <div className="cc-kanban-list">
                      {colDone.length===0&&<div className="cc-kanban-empty">Jeszcze nic</div>}
                      {colDone.map(renderCard)}
                    </div>
                  </div>
                </div>
              );
            })()}
            <div className="panel">
              <div className="panel-title">Zadania przekazane tej zmianie — obowiązkowe</div>
              <div className="stack">
                {carryOverForCurrentShift.map((task,index)=>(
                  <div key={`${task.id}-${index}`} className={`carry-row ${task.done?"task-done":""}`}>
                    <input type="checkbox" checked={!!task.done} onChange={()=>markCarryOverDone(index)}/>
                    <div className="flex-1">
                      <div className={task.done?"line-through muted":"strong-ish"}>{task.text}</div>
                      <div className="tiny muted">Dodane przez: {task.createdBy} · ze zmiany: {SHIFT_LABELS_PL[task.fromShift]||task.fromShift} · {task.createdAt}</div>
                      {task.done&&(
                        <div style={{marginTop:6}}>
                          <input className="input" style={{fontSize:12.5,padding:"6px 10px"}} placeholder="Co zrobiłeś w tej sprawie? (opcjonalnie, trafi do raportu)" value={task.doneNote||""} onChange={e=>updateCarryOverDoneNote(index,e.target.value)}/>
                          {task.doneBy&&<div className="tiny emerald-text" style={{marginTop:3}}>Wykonane przez: {task.doneBy}</div>}
                        </div>
                      )}
                    </div>
                    <span style={{fontSize:15,fontWeight:800,color:task.done?"#2d6a4f":"#9a3040",lineHeight:1,flexShrink:0}}>{task.done?"✓":"✕"}</span>
                  </div>
                ))}
                {!carryOverForCurrentShift.length&&<div className="empty-box">Brak przekazanych zadań dla tej zmiany.</div>}
              </div>
            </div>
          </motion.div>
        )}
        {workerTab==="przekazanie"&&started&&(
          <motion.div key="prz" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="stack">
            {autosaveNote&&autosaveNote.employee===employeeName&&autosaveNote.shift===selectedShift&&(
              <div style={{padding:"10px 14px",borderRadius:"var(--radius-md)",
                           background:"rgba(245,158,11,.1)",border:"1.5px solid rgba(245,158,11,.35)",
                           display:"flex",alignItems:"flex-start",gap:12}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:12.5,fontWeight:700,color:"var(--amber)",marginBottom:4}}>
                    ⚡ Automatyczny zapis z {autosaveNote.savedAt}
                  </div>
                  <div style={{fontSize:12,color:"var(--text-secondary)",marginBottom:6,whiteSpace:"pre-wrap",
                               maxHeight:60,overflow:"hidden",textOverflow:"ellipsis"}}>
                    {autosaveNote.text}
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button className="btn btn-amber" style={{fontSize:11.5}}
                      onClick={()=>{if(autosaveNote.text&&!handoverNote)setHandoverNote(autosaveNote.text);setAutosaveNote(null);localStorage.removeItem(AUTOSAVE_KEY);}}>
                      Przywróć notatkę
                    </button>
                    <button className="btn btn-outline" style={{fontSize:11.5}}
                      onClick={()=>{setAutosaveNote(null);localStorage.removeItem(AUTOSAVE_KEY);}}>
                      Odrzuć
                    </button>
                  </div>
                </div>
              </div>
            )}
            {/* HERO przekazania — kto i dla kogo */}
            <div className="cc-handover-hero">
              <div>
                <div className="cc-handover-label">Przekazujesz</div>
                <div className="cc-handover-name">{employeeName}</div>
                <div className="cc-handover-from">{SHIFT_LABELS_PL[selectedShift]||selectedShift||"—"}</div>
              </div>
              <div className="cc-handover-arrow">→</div>
              <div style={{textAlign:"right"}}>
                <div className="cc-handover-label">Następnej zmianie</div>
                <div className="cc-handover-name">{SHIFT_LABELS_PL[carryOverTarget]||"—"}</div>
                <details style={{position:"relative"}}>
                  <summary className="cc-handover-change">Zmień ▾</summary>
                  <div className="cc-handover-dropdown">
                    {SHIFT_OPTIONS.map(s=>(
                      <button key={s} type="button" onClick={()=>setCarryOverTarget(s)}
                        style={{display:"block",width:"100%",textAlign:"left",padding:"7px 10px",border:"none",background:carryOverTarget===s?"var(--plum-soft)":"transparent",color:carryOverTarget===s?"var(--plum)":"var(--text-secondary)",fontWeight:carryOverTarget===s?700:500,borderRadius:5,cursor:"pointer",fontSize:13}}>
                        {SHIFT_LABELS_PL[s]}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            </div>

            {/* NOTATKA KONTEKSTOWA */}
            <div className="panel" style={{borderLeft:"4px solid var(--plum)"}}>
              <div className="panel-title"><MessageSquare size={16}/> ✍ Notatka kontekstowa</div>
              <div className="tiny muted" style={{marginBottom:10,marginTop:-10}}>Co się działo, ważne uwagi, kontakty z gośćmi — trafi do raportu PDF.</div>
              <textarea className="input" style={{minHeight:140,resize:"vertical",lineHeight:1.65,fontSize:14,padding:"12px 14px"}} placeholder="Np. Gość z pokoju 302 czeka na fakturę. VIP w 108 prosił o dodatkowe ręczniki…" value={handoverNote} onChange={e=>{setHandoverNote(e.target.value);if(autosaveTimerRef.current)clearTimeout(autosaveTimerRef.current);autosaveTimerRef.current=setTimeout(()=>{const snap={text:e.target.value.trim(),shiftNote:shiftNoteInput,employee:employeeName,shift:selectedShift,savedAt:fmtA(),auto:true};localStorage.setItem(AUTOSAVE_KEY,JSON.stringify(snap));},20000);}}/>
              <div style={{fontSize:11.5,color:"var(--text-faint)",marginTop:6,display:"flex",justifyContent:"space-between"}}>
                <span>💾 Auto-zapis co 20s</span>
                <span>{handoverNote.length} znaków</span>
              </div>
            </div>

            {/* CHECKLISTA DO ZROBIENIA */}
            <div className="panel" style={{borderLeft:"4px solid var(--gold)"}}>
              <div className="panel-title"><CheckSquare size={16}/> 📋 Do zrobienia na następnej zmianie</div>
              <div className="tiny muted" style={{marginBottom:12,marginTop:-10}}>Konkretne zadania checkbox — pojawią się jako obowiązkowe.</div>
              <div style={{display:"flex",gap:8,marginBottom:8}}>
                <input className="input" style={{flex:1,fontSize:14}} placeholder="Np. Zadzwonić do PWiK" value={shiftNoteInput} onChange={e=>setShiftNoteInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCarryOverTask()}/>
                <button className="btn btn-gold" onClick={addCarryOverTask} disabled={!shiftNoteInput.trim()}><Plus size={14}/> Dodaj</button>
              </div>
            </div>
            <div className="panel">
              <div className="panel-title sky-text"><Bell size={16}/> Powiadomienie dla zmiany</div>

              {/* Zakres: ogólne vs na konkretny dzień */}
              <div style={{display:"flex",gap:6,marginBottom:14}}>
                {[["general","Ogólne","dla wszystkich zmian"],["dated","Na konkretny dzień","data + zmiana"]].map(([mode,label,sub])=>(
                  <button key={mode} onClick={()=>setReminderMode(mode)}
                    style={{flex:1,padding:"8px",borderRadius:"var(--radius-md)",cursor:"pointer",
                            border:`1.5px solid ${reminderMode===mode?"var(--amber)":"var(--border-light)"}`,
                            background:reminderMode===mode?"var(--gold-bg)":"var(--bg-card)",
                            fontSize:12,fontWeight:600,textAlign:"left",
                            color:reminderMode===mode?"var(--amber)":"var(--text-secondary)"}}>
                    {label}
                    <div style={{fontSize:10.5,fontWeight:400,marginTop:1,color:reminderMode===mode?"var(--amber)":"var(--text-muted)"}}>{sub}</div>
                  </button>
                ))}
              </div>
              <input className="input" style={{marginBottom:10}}
                placeholder={reminderEntryType==="task"?"Np. Sprawdź reklamację z pokoju 214":"Np. Przyjazd VIP — pokój 306"}
                value={newReminderText} onChange={e=>setNewReminderText(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&(reminderMode==="general"?addGeneralReminder():addDatedReminder())}/>
              {reminderMode==="dated"&&(
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                  <div><label>Docelowa zmiana</label><select className="input" value={newReminderShift} onChange={e=>setNewReminderShift(e.target.value)}>{SHIFT_OPTIONS.map(s=><option key={s} value={s}>{SHIFT_LABELS_PL[s]}</option>)}</select></div>
                  <div><label>Data</label><input className="input" type="date" value={newReminderDate} onChange={e=>setNewReminderDate(e.target.value)}/></div>
                </div>
              )}
              <button className="btn btn-sky full"
                onClick={reminderMode==="general"?()=>addGeneralReminder("reminder"):()=>addDatedReminder("reminder")}
                disabled={!newReminderText.trim()||(reminderMode==="dated"&&(!newReminderShift||!newReminderDate))}>
                <Bell size={14}/>
                {reminderMode==="general"?"Dodaj ogólne powiadomienie":"Ustaw przypomnienie na wybrany dzień"}
              </button>
              {futureDatedReminders.length>0&&reminderMode==="dated"&&(
                <div className="stack top-space">
                  <div className="tiny muted uppercase" style={{letterSpacing:".05em"}}>Zaplanowane na konkretny dzień</div>
                  {futureDatedReminders.map(r=>(
                    <div key={r.id} className="dated-future-row">
                      <div style={{display:"flex",alignItems:"center",gap:10,flex:1}}>
                        {r.entryType==="task"?<CheckSquare size={13} style={{color:"var(--amber)",flexShrink:0}}/>:<Bell size={13} style={{color:"var(--sky)",flexShrink:0}}/>}
                        <div className="dated-future-date">{r.targetDate}</div>
                        <div><div style={{fontWeight:600,fontSize:13.5}}>{r.text}</div><div className="tiny muted">{SHIFT_LABELS_PL[r.targetShift]} · {r.createdBy}</div></div>
                      </div>
                      {(!r.source||r.source!=="admin"||isAdmin)&&<button className="icon-btn icon-btn-danger" onClick={()=>deleteDatedReminder(r.id)} title="Usuń"><Trash2 size={13}/></button>}
                    </div>
                  ))}
                </div>
              )}
              {futureDatedReminders.length===0&&reminderMode==="dated"&&<div className="empty-box" style={{marginTop:14}}>Brak zaplanowanych wpisów.</div>}
            </div>

          </motion.div>
        )}
        {workerTab==="hk"&&(
          <motion.div key="hk" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <RestoredHKPanel dark={workerDark} hkDate={hkDate} setHkDate={setHkDate}
                     hkStaff={hkStaff} setHkStaff={setHkStaff}
                     hkData={hkData} setHkData={setHkData}
                     showToast={showToast} isManager={!!currentManager} employeeName={employeeName||currentManager}/>
          </motion.div>
        )}
        {workerTab==="informacje"&&(
          <motion.div key="informacje" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <InboxPanel dark={workerDark} employeeName={employeeName} selectedShift={selectedShift} wikiEntries={wikiEntries} onOpenWiki={()=>setShowWiki(true)}/>
          </motion.div>
        )}
        {workerTab==="usterki"&&(
          <motion.div key="usterki" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <FaultsPanel dark={workerDark} employeeName={employeeName||currentManager} showToast={showToast} floors1={HK_FLOOR1} floors2={HK_FLOOR2} floors3={HK_FLOOR3} isManager={!!currentManager}/>
          </motion.div>
        )}
        {workerTab==="parking"&&(
          <motion.div key="parking" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <ParkingPanel dark={workerDark} isAdmin={isAdmin} showToast={showToast} employees={employees} employeeName={employeeName}/>
          </motion.div>
        )}
        {workerTab==="goscie"&&(
          <motion.div key="goscie" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <StaliGosciePanel dark={workerDark} isAdmin={isAdmin} currentManager={currentManager} addAudit={addAudit}/>
          </motion.div>
        )}
        {workerTab==="vouchery"&&(
          <motion.div key="vouchery" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <VouchersPanel employeeName={employeeName||currentManager} isManager={isAdmin} showToast={showToast}/>
          </motion.div>
        )}
        {workerTab==="opinie"&&(
          <motion.div key="opinie" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <ReviewsPanel dark={workerDark} employeeName={employeeName||currentManager} isManager={isAdmin} showToast={showToast}/>
          </motion.div>
        )}
      </AnimatePresence>
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
                  if(isDeposit)setSafeConfirmStep(true);else{setFinishDialogOpen(false);finishShift();}
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
                {(()=>{const kw=parseFloat(safeDepositKW)||0;const deposit=parseFloat(safeDepositAmount)||0;const postKW=parseFloat(postDepositKW)||0;const kwPrev=kwTotal;const kwInc=Math.max(0,kw-kwPrev);const totalBefore=stalaKasowa+kwInc;const newS=totalBefore-deposit;return(<>
                  <div style={{background:"var(--plum-soft)",border:"1px solid var(--plum-border)",borderLeft:"4px solid var(--plum)",borderRadius:"var(--radius-md)",padding:"14px 18px"}}>
                    <div style={{fontSize:11,color:"var(--plum)",fontWeight:800,marginBottom:6,textTransform:"uppercase",letterSpacing:".07em"}}>W kasie przed wpłatą</div>
                    <div style={{fontSize:32,fontWeight:400,color:"var(--plum)",fontFamily:"'DM Serif Display',serif",letterSpacing:"-.02em",lineHeight:1}}>{fmtMoney(totalBefore)}</div>
                    <div style={{fontSize:12,color:"var(--text-secondary)",marginTop:6}}>Stała: {fmtMoney(stalaKasowa)} + KW: {fmtMoney(kw)}</div>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:3}}>Stan KW — ile masz KW dokumentów (zł)</div>
                    <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={safeDepositKW} onChange={e=>setSafeDepositKW(e.target.value)} style={{fontSize:13}}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:3}}>Kwota wpłaty do sejfu (zł)</div>
                    <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={safeDepositAmount} onChange={e=>setSafeDepositAmount(e.target.value)} style={{fontSize:13}}/>
                  </div>
                  <div>
                    <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:3}}>Płatność gotówkowa PO wpłacie do sejfu (zł) <span style={{color:"#c8a050"}}>— opcjonalne</span></div>
                    <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:4,lineHeight:1.5}}>Jeśli ktoś zapłacił gotówką już po wpłacie do sejfu, wpisz kwotę — zostanie wliczona jako KW zmiany porannej.</div>
                    <input className="input" type="number" min="0" step="0.01" placeholder="0.00" value={postDepositKW} onChange={e=>setPostDepositKW(e.target.value)} style={{fontSize:13}}/>
                  </div>
                  {(safeDepositAmount||safeDepositKW)&&(
                    <div style={{background:"var(--emerald-light)",border:"1px solid var(--emerald-border)",borderLeft:"3px solid var(--emerald)",borderRadius:"var(--radius-md)",padding:"14px 18px"}}>
                      <div style={{fontSize:11,fontWeight:800,color:"var(--emerald)",marginBottom:8,textTransform:"uppercase",letterSpacing:".07em"}}>Podgląd po wpłacie</div>
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
  const isWideWorkerPanel=!showAdminPanel&&workerTab==="hk";

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
          {started&&employeeName&&<span style={{color:"var(--gold)",fontWeight:700,display:"block",marginBottom:6}}>{employeeName} · {SHIFT_SHORT_LABELS[selectedShift]||selectedShift}</span>}
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
      <div className="cc-login-screen">
        {/* Pasek gorny: logo + zegar + data */}
        <div className="cc-login-topbar">
          <Logo variant="dotsOnly" tone="white" width={40} height={10}/>
          <div className="cc-login-clock">
            <div className="cc-login-date">{new Date().toLocaleDateString("pl-PL",{weekday:"long",day:"2-digit",month:"long",year:"numeric"})}</div>
            <div className="cc-login-time">{liveTime||new Date().toLocaleTimeString("pl-PL")}</div>
          </div>
        </div>

        {/* Logo + formularz ustawione pionowo — logo na gorze (20%), formularz nizej */}
        <div className="cc-login-hero">
          <div className="cc-login-logo-hero">
            <Logo variant="full" tone="white"/>
          </div>
          <div className="cc-login-center">
          {loginStep==="name"&&(
            <div className="cc-login-card cc-fade-up">
              <div className="cc-login-label">Witamy w Panelu Recepcji</div>
              {!employeeName&&employeeActivityLog?.[0]?.employee&&(
                <button
                  type="button"
                  onClick={()=>setEmployeeName(canonicalizePersonName(employeeActivityLog[0].employee))}
                  style={{
                    background:"rgba(201,153,80,.12)",border:"1px solid rgba(201,153,80,.35)",
                    color:"#f5e6c8",borderRadius:"var(--radius-md)",
                    padding:"8px 12px",marginBottom:10,fontSize:12.5,
                    cursor:"pointer",display:"flex",alignItems:"center",gap:8,
                    width:"100%",textAlign:"left"
                  }}
                  title="Kliknij aby wybrać"
                >
                  <History size={14}/> Ostatnio jako: <strong style={{marginLeft:2}}>{employeeActivityLog[0].employee}</strong>
                </button>
              )}
              <input
                className="cc-login-input"
                placeholder="Wpisz swoje imię…"
                value={employeeName}
                autoFocus
                list="cc-emp-list-main"
                onChange={e=>setEmployeeName(canonicalizeNameInput(e.target.value))}
                onKeyDown={e=>{
                  if(e.key==="Enter"&&employeeName.trim()){
                    const trimmed=canonicalizePersonName(employeeName);
                    setEmployeeName(trimmed);
                    if(isManagerName(trimmed,customManagers)) setLoginStep(hasAdminPassword()?"password":"admincheck");
                    else completeLogin();
                  }
                }}
              />
              <datalist id="cc-emp-list-main">
                {employees.map(e=><option key={e} value={e}/>)}
                {customManagers.map(m=><option key={"m_"+m} value={m}/>)}
              </datalist>
              <button
                className="cc-login-btn"
                disabled={!employeeName.trim()}
                onClick={()=>{
                  const trimmed=canonicalizePersonName(employeeName);
                  setEmployeeName(trimmed);
                  if(isManagerName(trimmed,customManagers)) setLoginStep(hasAdminPassword()?"password":"admincheck");
                  else completeLogin();
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
                onClick={()=>{setLoginPassword("");completeLogin();showToast("Tryb pracownika — bez panelu kierownika.","info");}}>
                Pomiń (kontynuuj jako pracownik)
              </button>
            </div>
          )}
          </div>
        </div>

        {/* Stopka */}
        <div className="cc-login-footer">Conrad Comfort · Panel Recepcji</div>
      </div>
    );
  }

  return(
    <div className={appShellClass}>
      {/* Top toggle dla zalogowanego kierownika (B19) */}
      {isAdmin&&(
        <div className={`cc-mgr-toggle-bar${mgrToggleMini?" cc-mgr-toggle-bar--mini":""}`}>
          <div className="cc-mgr-toggle-inner">
            <div className="cc-mgr-toggle-info">
              <Logo variant="dotsOnly" tone="white" width={28} height={6}/>
              <span><strong>{currentManager}</strong> · zalogowany jako kierownik</span>
            </div>
            <div className="cc-mgr-toggle-tabs">
              <button
                className={`cc-mgr-toggle-tab${!showAdminPanel?" cc-active":""}`}
                onClick={()=>{setShowAdminPanel(false);localStorage.setItem("reception-last-view","worker");setLastView("worker");}}>
                Panel pracownika
              </button>
              <button
                className={`cc-mgr-toggle-tab${showAdminPanel?" cc-active":""}`}
                onClick={()=>{setShowAdminPanel(true);localStorage.setItem("reception-last-view","manager");setLastView("manager");}}>
                Panel kierownika
              </button>
              <button
                className="cc-mgr-toggle-logout"
                onClick={()=>{const v=!mgrToggleMini;setMgrToggleMini(v);localStorage.setItem("reception-mgr-toggle-mini",v?"1":"0");}}
                title={mgrToggleMini?"Rozwiń pasek":"Zwiń do mini"}>
                {mgrToggleMini?<Maximize2 size={13}/>:<Minimize2 size={13}/>}
              </button>
              <button
                className="cc-mgr-toggle-logout"
                onClick={handleAdminLogout}
                title="Wyloguj kierownika">
                <LogOut size={13}/>
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="app-layout worker-layout">
        {(isAdmin&&showAdminPanel)?(
          <AdminSidebarRail
            activeTab={adminTab} setActiveTab={setAdminTab}
            setShowWiki={setShowWiki} setShowAuditLog={setShowAuditLog}
            handleAdminLogout={handleAdminLogout} setShowSearch={setShowSearch}
            adminDark={adminDark} setAdminDark={setAdminDark}
            onCheckUpdate={handleCheckUpdate} currentManager={currentManager}
            unreadMsgCount={unreadMsgCount}
            updateState={updateState} updateInfo={updateInfo} updateProgress={updateProgress}
            onDownloadUpdate={()=>window.electronAPI?.downloadUpdate()}
            onInstallUpdate={()=>window.electronAPI?.installUpdate()}
            pendingCorrections={pendingCorrections.length}
            faultsCount={faultsCount}
            voucherCount={voucherCount}
            showToast={showToast}
          />
        ):(
          <WorkerSidebar activeTab={workerTab} setActiveTab={setWorkerTab} started={started} overdueCount={overdueTasks.length} datedCount={todayDatedReminders.length} setShowWiki={setShowWiki} setShowEmpReport={setShowEmpReport} isAdmin={isAdmin} currentManager={currentManager} setShowAdminPanel={setShowAdminPanel} setShowSearch={setShowSearch} workerDark={workerDark} setWorkerDark={setWorkerDark} setShowPaymentForm={setShowPaymentForm} employeeName={employeeName} selectedShift={selectedShift} onShowMsg={()=>setShowMsgModal(true)} liveTime={liveTime} shiftElapsed={shiftElapsed} progress={progress} totalDone={totalDone} totalMandatory={totalMandatory} onOpenFinish={()=>setFinishDialogOpen(true)} inboxCount={inboxCount} faultsCount={faultsCount} showToast={showToast}/>
        )}
        <main className={`worker-content${(isAdmin&&showAdminPanel&&!adminDark)?" admin-light":""}`}>
          <div className={`container${isWideWorkerPanel?" container-wide":""}`}>
            {(isAdmin&&showAdminPanel)?adminPanel:workerView}
          </div>
        </main>
      </div>
      <AnimatePresence>{showWiki&&wikiDrawer}</AnimatePresence>
      <AnimatePresence>{showMsgModal&&<MessageModal key="msgm" onClose={()=>setShowMsgModal(false)} employeeName={employeeName} employees={employees} messages={messages} setMessages={setMessages} dark={dark}/>}</AnimatePresence>
      <AnimatePresence>{showSearch&&<GlobalSearchModal key="gs" onClose={()=>setShowSearch(false)} dark={dark}/>}</AnimatePresence>
      {finishModal}
      <AnimatePresence>{showPreShiftModal&&<PreShiftModal key="preshift" employeeName={employeeName} selectedShift={selectedShift} onCancel={()=>setShowPreShiftModal(false)} onConfirm={actualStartShift}/>}</AnimatePresence>
      <AnimatePresence>{showAuditLog&&<AuditLogModal key="audit" onClose={()=>setShowAuditLog(false)}/>}</AnimatePresence>
      <AnimatePresence>{showEmpReport&&<EmployeeReportModal key="er" employees={employees} dark={dark} onClose={()=>setShowEmpReport(false)} currentEmployeeName={employeeName} onDownload={downloadEmployeeReportPDF}/>}</AnimatePresence>
      {confirmDialog&&<ConfirmModal message={confirmDialog.message} onConfirm={confirmDialog.onConfirm} onClose={()=>setConfirmDialog(null)}/>}
      <ToastContainer toasts={toasts} dismiss={dismissToast}/>
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
                <div><div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",fontFamily:"'DM Serif Display',serif"}}>{employeeName}</div><div style={{fontSize:11.5,color:"var(--text-muted)",marginTop:1}}>{SHIFT_SHORT_LABELS[selectedShift]||selectedShift||"—"} · {fmtA()}</div></div>
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
              <div><label>Wyjaśnienie — co się stało i jak powinno być</label><textarea className="input" style={{minHeight:130,resize:"vertical",lineHeight:1.7}} placeholder={"Opisz sytuację i podaj prawidłowe dane:\n\nNp. Na paragonie 00234 wpisano kwotę 250 zł zamiast 350 zł.\nGość: Jan Kowalski, pokój 302, data: 20.03.2026.\nNależy wystawić korektę na +100 zł."} value={pcExplanation} onChange={e=>setPcExplanation(e.target.value)}/></div>
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
