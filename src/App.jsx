import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import jsPDF from "jspdf";
import UpdateBanner from "./UpdateBanner";
import Logo from "./ui/Logo";
import {
  LogIn, LogOut, Plus, Trash2, ClipboardList, ShieldCheck, BookOpen,
  Search, Settings, History, BellRing, AlertTriangle, X,
  Users, FileText, Download, FileDown, Cog, Inbox,
  Bell, Calendar, CheckSquare, ArrowLeftRight, Moon, Sun,
  BarChart2, TrendingUp, MessageSquare, RefreshCw, AlertCircle, Send,
  QrCode, Eye, EyeOff, Maximize2, Minimize2,
} from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "./lib/storage";
import {
  DEFAULT_ADHOC_THRESHOLDS, PARTER_SPACES, FAULT_FLOORS,
  ADMIN_PASSWORD, ADMIN_MANAGERS, SHIFT_OPTIONS,
  SHIFT_LABELS, SHIFT_LABELS_PL, SHIFT_SHORT_LABELS,
  defaultEmployees, defaultTasks, defaultWikiEntries, emptyCarryOver,
  HK_FLOOR1, HK_FLOOR2, HK_FLOOR3, HK_ALL, HK_APTS,
  HK_SPECIAL_ROOMS, HK_ROOMS_SGL_TWIN_ONLY, HK_STATUS_COLORS,
  HK_LIVE_COLORS, HK_WORKERS,
} from "./lib/constants";
import { fmt, fmtA, todayKey, monthKey, autoDetectShift } from "./lib/dates";
import { pl, plR, normTask, buildShiftFn, buildEmpFn } from "./lib/format";
import { mkPDF_header, mkPDF_section, mkPDF_kv, mkPDF_paragraph, mkPDF_item, mkPDF_footer, savePDF } from "./lib/pdf";

// ── Progi czasowe dla zadan ad-hoc HK (konfigurowalne) ─────────────────
// Przed godzina progowa → broadcast do wszystkich porannych HK
// Po godzinie progowej → tylko pracownik popoludniowy
function computeBroadcastMode(now = new Date()) {
  const day = now.getDay(); // 0=nd, 6=sob
  const isWeekend = day === 0 || day === 6;
  const saved = loadJson(STORAGE_KEYS.adhocThresholds, DEFAULT_ADHOC_THRESHOLDS);
  const cutoff = isWeekend ? saved.weekend : saved.weekday;
  return now.getHours() < cutoff ? "all_morning" : "pm_only";
}

// ─── Mapa budynku — parter + 3 pietra (C1) ───────────────────────────────────
// Parter: konfigurowalna lista obszarow (pomieszczen wspolnych)

// ─── Imiona i nazwiska pracowników ────────────────────────────────────────────
// Uzupełnij pełne nazwiska po przydzieleniu kont
const EMPLOYEE_FULL_NAMES={
  "Pawel":    "Paweł Grzenkowicz",
  "Weronika": "Weronika Strach",
  "Agata":    "Agata Letka",
  "Oliwier":  "Oliwier Kowalik",
  "Natalia":  "Natalia Szymańska",
  "Rebecca":  "Rebecca Pinzi",
  // kierownicy
  "Paweł":    "Paweł Grzenkowicz",
};
const getFullName=(name)=>EMPLOYEE_FULL_NAMES[name]||name||"—";

const addAudit=(manager,action)=>{const log=loadJson(STORAGE_KEYS.adminAudit,[]);saveJson(STORAGE_KEYS.adminAudit,[{id:crypto.randomUUID(),manager,action,at:fmtA()},...log].slice(0,200));};
const fmtMoney=(n)=>Number(n).toLocaleString("pl-PL",{minimumFractionDigits:2,maximumFractionDigits:2})+" zł";


function RailwaySettings() {
  const [url, setUrl] = React.useState("");
  const [status, setStatus] = React.useState("idle");
  React.useEffect(() => {
    window.electronAPI.remoteGetUrl?.().then(r => { if (r) setUrl(r); }).catch(() => {});
  }, []);
  const save = async () => {
    if (!url.trim()) return;
    await window.electronAPI.remoteSetUrl?.(url.trim());
    setStatus("checking");
    const r = await window.electronAPI.remoteTest?.();
    setStatus(r?.ok ? "ok" : "error");
  };
  return (
    <div className="panel glass dark-panel">
      <div className="panel-title" style={{color:"#34d399"}}>🌐 Serwer Railway (HK)</div>
      <div style={{fontSize:12,color:"#948e85",marginBottom:10}}>Adres serwera Railway — wymagany do działania QR kodów i aplikacji mobilnej pokojówek.</div>
      <div style={{display:"flex",gap:8,alignItems:"center"}}>
        <input value={url} onChange={e=>setUrl(e.target.value)}
          placeholder="https://hk-server-production.up.railway.app"
          style={{flex:1,padding:"8px 10px",borderRadius:7,border:`1px solid ${status==="ok"?"rgba(52,211,153,.4)":status==="error"?"rgba(220,60,60,.4)":"var(--dark-border)"}`,background:"rgba(255,255,255,.04)",color:"#e6edf3",fontSize:12,fontFamily:"monospace"}}/>
        <button onClick={save} style={{padding:"8px 16px",borderRadius:7,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,fontSize:12,cursor:"pointer",whiteSpace:"nowrap"}}>Zapisz i testuj</button>
      </div>
      {status==="ok"&&<div style={{marginTop:8,fontSize:12,color:"#34d399",fontWeight:600}}>✓ Połączenie działa</div>}
      {status==="error"&&<div style={{marginTop:8,fontSize:12,color:"#f87171",fontWeight:600}}>✗ Nie można połączyć — sprawdź adres</div>}
    </div>
  );
}

function downloadCorrectionPDF(c,managerName){
  const doc=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
  const ml=18,mr=18,cw=pw-ml-mr;let y=0;
  const chk=(n=10)=>{if(y+n>ph-14){doc.addPage();y=22;}};

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
  const chk=(n=10)=>{if(y+n>ph-14){doc.addPage();y=22;}};

  mkPDF_header(doc,pw,"Raport zmiany recepcji",pl(report.savedAtLabel||""));
  y=36;

  // ── Informacje o zmianie ──
  y=mkPDF_section(doc,pw,ml,cw,y,"Informacje o zmianie");
  y=mkPDF_kv(doc,ml,y,"Pracownik",pl(getFullName(report.employeeName)||report.employeeName||"-"),chk);
  y=mkPDF_kv(doc,ml,y,"Zmiana",pl(report.shiftLabel||"-"),chk);
  y=mkPDF_kv(doc,ml,y,"Kasa na start",pl(report.cashOpeningAmount||"-"),chk);
  y=mkPDF_kv(doc,ml,y,"Kwota z dok.",pl(report.cashClosingDocumentsAmount||"-"),chk);
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
  const chk=(n=10)=>{if(y+n>ph-14){doc.addPage();y=22;}};

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

// ─── Daily summary report PDF ─────────────────────────────────────────────────
function downloadDailyReportPDF(report) {
  const doc=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
  const ml=18,mr=18,cw=pw-ml-mr;let y=0;
  const chk=(n=12)=>{if(y+n>ph-14){doc.addPage();y=22;}};

  mkPDF_header(doc,pw,"Raport dobowy recepcji",pl(report.generatedAt||""));
  y=34;

  // Podtytul
  doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(14,12,10);
  doc.text(pl(report.dateLabel||""),ml,y);
  doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.setTextColor(100,90,68);
  doc.text(pl(report.shiftMode||""),pw-mr,y,{align:"right"});
  y+=10;

  // ── 1. Obsada zmian ──
  if(report.shifts&&report.shifts.length){
    y=mkPDF_section(doc,pw,ml,cw,y,"Obsada zmian");
    report.shifts.forEach(s=>{
      chk(8);
      const done=!!s.completed;
      doc.setFont("helvetica","bold");doc.setFontSize(8.5);
      doc.setTextColor(done?36:148,done?92:38,done?58:52);
      doc.text(done?"[OK]":"[--]",ml,y);
      doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(14,12,10);
      doc.text(pl(getFullName(s.employee)||s.employee||"-"),ml+14,y);
      doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.setTextColor(85,78,65);
      doc.text(pl(s.label||""),ml+74,y);
      doc.setFontSize(8);doc.setTextColor(125,118,105);
      doc.text(pl(s.time||""),pw-mr,y,{align:"right"});
      y+=8;
    });
    y+=4;
  }

  // ── 2. Podsumowanie zadań — ile wykonano, ile pominięto ──
  if(report.taskSummary&&report.taskSummary.length){
    y=mkPDF_section(doc,pw,ml,cw,y,"Wykonanie zadan");
    report.taskSummary.forEach(row=>{
      chk(8);
      doc.setFont("helvetica","bold");doc.setFontSize(9.5);doc.setTextColor(14,12,10);
      doc.text(pl(getFullName(row.employee)||row.employee||"-"),ml,y);
      doc.setFont("helvetica","normal");doc.setFontSize(9);
      // Wykonane na zielono
      doc.setTextColor(36,92,58);
      doc.text("[OK] "+row.done,ml+70,y);
      // Niewykonane na czerwono
      if(row.missed>0){doc.setTextColor(148,38,52);doc.text("[X] "+row.missed,ml+98,y);}
      // Zmiana
      doc.setTextColor(110,100,85);doc.setFontSize(8);
      doc.text(pl(row.shift||""),pw-mr,y,{align:"right"});
      y+=8;
    });
    y+=4;
  }

  // ── 3. Kasa ──
  if(report.cashRows&&report.cashRows.length){
    y=mkPDF_section(doc,pw,ml,cw,y,"Rozliczenie kasy");
    report.cashRows.forEach((row,i)=>{
      chk(8);
      const isLast=i===report.cashRows.length-1;
      doc.setFont("helvetica",isLast?"bold":"normal");
      doc.setFontSize(9.5);
      doc.setTextColor(isLast?108:68,isLast?80:62,isLast?28:48);
      doc.text(pl(row.label||""),ml+3,y);
      doc.setFont("helvetica","bold");doc.setTextColor(14,12,10);
      doc.text(pl(row.val||""),pw-mr,y,{align:"right"});
      y+=8;
    });
    y+=4;
  }

  // ── 4. Korekty i raporty z tego dnia (na dole) ──
  if(report.corrections&&report.corrections.length){
    chk(14);
    y=mkPDF_section(doc,pw,ml,cw,y,"Korekty platnosci z tego dnia");
    report.corrections.forEach(c=>{
      chk(9);
      const st=c.done?"[OK]":"[--]";
      const txt=pl((c.docType||"dok").toUpperCase())+" | "+pl(c.reservation||"-")+" | "+pl(getFullName(c.submittedBy)||c.submittedBy||"-");
      y=mkPDF_item(doc,ml,cw,y,st,txt,chk);
    });
    y+=4;
  }
  if(report.empReports&&report.empReports.length){
    chk(14);
    y=mkPDF_section(doc,pw,ml,cw,y,"Notatki sluzbowe z tego dnia");
    report.empReports.forEach(r=>{
      chk(8);
      doc.setFont("helvetica","normal");doc.setFontSize(9.5);doc.setTextColor(14,12,10);
      doc.text(pl(getFullName(r.author)||r.author||"-")+" - "+pl(r.subject||"-"),ml+4,y);
      y+=8;
    });
    y+=4;
  }

  mkPDF_footer(doc,ph,pw,ml,mr,"raport dobowy");
  savePDF(doc,report.filename,"raporty dobowe");
}

// ─── Wiki PDF export ──────────────────────────────────────────────────────────
function downloadWikiPDF(entries) {
  const doc=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
  const ml=18,mr=18,cw=pw-ml-mr;let y=0;
  const chk=(n=8)=>{if(y+n>ph-16){doc.addPage();y=20;}};
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

// ─── Confirm modal ────────────────────────────────────────────────────────────
function ConfirmModal({message,onConfirm,onClose}){
  return(
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div initial={{opacity:0,scale:.96,y:8}} animate={{opacity:1,scale:1,y:0}} className="modal" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h2>Potwierdź operację</h2></div>
        <p style={{color:"var(--text-secondary)",lineHeight:1.65,marginBottom:4}}>{message}</p>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Anuluj</button>
          <button className="btn btn-rose" onClick={()=>{onConfirm();onClose();}}>Potwierdź</button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Signature Canvas ─────────────────────────────────────────────────────────
function SignatureCanvas({onSave,label="Podpisz tutaj myszką",height=90,dark=false}){
  const canvasRef=React.useRef(null);
  const [drawing,setDrawing]=React.useState(false);
  const [hasSig,setHasSig]=React.useState(false);
  const lastPos=React.useRef(null);

  const getPos=(e)=>{
    const c=canvasRef.current;
    const rect=c.getBoundingClientRect();
    const sx=c.width/rect.width,sy=c.height/rect.height;
    if(e.touches){return{x:(e.touches[0].clientX-rect.left)*sx,y:(e.touches[0].clientY-rect.top)*sy};}
    return{x:(e.clientX-rect.left)*sx,y:(e.clientY-rect.top)*sy};
  };
  const startDraw=(e)=>{e.preventDefault();const pos=getPos(e);lastPos.current=pos;setDrawing(true);};
  const draw=(e)=>{
    if(!drawing)return;e.preventDefault();
    const c=canvasRef.current;const ctx=c.getContext("2d");
    const pos=getPos(e);
    ctx.beginPath();ctx.moveTo(lastPos.current.x,lastPos.current.y);
    ctx.lineTo(pos.x,pos.y);
    ctx.strokeStyle="#111";ctx.lineWidth=2;ctx.lineCap="round";ctx.lineJoin="round";
    ctx.stroke();lastPos.current=pos;setHasSig(true);
  };
  const endDraw=()=>{setDrawing(false);lastPos.current=null;if(hasSig)onSave&&onSave(canvasRef.current.toDataURL("image/png"));};
  const clear=()=>{const c=canvasRef.current;c.getContext("2d").clearRect(0,0,c.width,c.height);setHasSig(false);onSave&&onSave(null);};

  return(
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <div style={{fontSize:11.5,fontWeight:600,color:dark?"var(--dark-text-muted)":"var(--text-muted)"}}>{label}</div>
      <canvas ref={canvasRef} width={520} height={height}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        style={{width:"100%",height:height,borderRadius:8,background:"#fff",
                border:`1.5px solid ${dark?"#484f58":"var(--border-light)"}`,
                cursor:"crosshair",touchAction:"none",display:"block"}}/>
      <button type="button" onClick={clear}
        style={{alignSelf:"flex-start",fontSize:11,padding:"3px 10px",borderRadius:6,
                border:`1px solid ${dark?"#484f58":"var(--border-light)"}`,
                background:"transparent",cursor:"pointer",
                color:dark?"var(--dark-text-muted)":"var(--text-muted)"}}>
        ✕ Wyczyść podpis
      </button>
    </div>
  );
}

// ─── Global Search Modal ──────────────────────────────────────────────────────
function GlobalSearchModal({onClose,dark}){
  const [q,setQ]=useState("");
  const [filter,setFilter]=useState("all"); // all | carry | note | notif | remind
  const inputRef=useRef(null);
  useEffect(()=>{setTimeout(()=>inputRef.current?.focus(),60);},[]);

  const allItems=useMemo(()=>{
    const items=[];
    const parseDate=(s)=>{
      if(!s)return 0;
      // Format: "DD.MM.YYYY, HH:MM" or ISO
      try{
        if(s.includes("T"))return new Date(s).getTime();
        const p=s.split(", ");
        if(p.length>=2){const d=p[0].split(".");return new Date(`${d[2]}-${d[1]}-${d[0]}T${p[1]}:00`).getTime();}
        return 0;
      }catch{return 0;}
    };

    // Przekazane zadania (carryover)
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

    // Notatki przekazania
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

    // Powiadomienia globalne
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

    // Przypomnienia datowane
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

    // Sort newest first
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

  const hl=(text)=>{
    const raw=q.trim();
    if(!raw||raw.length<1)return text;
    return text.replace(new RegExp(`(${raw.replace(/[.*+?^${}()|[\]\\]/g,"\\$&")})`,`gi`),'<mark style="background:#fde68a;border-radius:2px;padding:0 1px">$1</mark>');
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
        {/* Input */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"13px 16px",borderBottom:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`}}>
          <Search size={16} style={{color:"var(--text-muted)",flexShrink:0}}/>
          <input ref={inputRef} value={q} onChange={e=>setQ(e.target.value)}
            placeholder="Szukaj w zadaniach, notatkach i powiadomieniach…"
            style={{flex:1,border:"none",outline:"none",fontSize:14,background:"transparent",color:dark?"var(--dark-text)":"var(--text-primary)"}}/>
          <kbd style={{fontSize:11,padding:"2px 7px",background:dark?"rgba(255,255,255,.08)":"var(--bg-secondary)",border:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,borderRadius:6,color:"var(--text-muted)"}}>Esc</kbd>
          <button onClick={onClose} style={{border:"none",background:"transparent",cursor:"pointer",color:"var(--text-muted)",display:"flex"}}><X size={15}/></button>
        </div>
        {/* Filter pills */}
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
        {/* Results */}
        <div style={{flex:1,overflowY:"auto",padding:"10px 12px"}}>
          {filtered.length===0&&(
            <div style={{textAlign:"center",color:"var(--text-faint)",fontSize:13,padding:"32px 0"}}>
              {q.length>0?`Brak wyników dla „${q}"`:"Brak wpisów w tej kategorii"}
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
                                 overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                         dangerouslySetInnerHTML={{__html:hl(item.title)}}/>
                    <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}
                         dangerouslySetInnerHTML={{__html:hl(item.sub)}}/>
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

// ─── Employee Report Modal ────────────────────────────────────────────────────
function EmployeeReportModal({employees,dark,onClose,currentEmployeeName=""}){
  const today=todayKey();
  const [author,setAuthor]=useState(currentEmployeeName||"");const [handoverTo,setHandoverTo]=useState("");const [subject,setSubject]=useState("");
  const [reportDate,setReportDate]=useState(today);const [content,setContent]=useState("");const [error,setError]=useState("");
  const handleDownload=()=>{
    if(!author||!handoverTo||!subject||!content.trim()){setError("Wypełnij wszystkie pola przed pobraniem raportu.");return;}
    setError("");const now=new Date();const filename=buildEmpFn(author,now);
    const reportData={author,handoverTo,subject,reportDate,content,createdAt:fmtA(now),filename};
    saveJson(STORAGE_KEYS.empReports,[{...reportData,id:crypto.randomUUID()},...loadJson(STORAGE_KEYS.empReports,[])]);
    try{downloadEmployeeReportPDF(reportData);}catch(e){console.error(e);}onClose();
  };
  const inp="input "+(dark?"dark-input":""),ta="textarea "+(dark?"dark-input":"");
  return(
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div initial={{opacity:0,scale:.96}} animate={{opacity:1,scale:1}} exit={{opacity:0}} className={"modal large-modal "+(dark?"dark-modal":"")} onClick={e=>e.stopPropagation()} style={{maxWidth:620}}>
        <div style={{background:"var(--plum)",borderRadius:"var(--radius-lg) var(--radius-lg) 0 0",margin:"-26px -26px 22px",padding:"18px 26px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{color:"#fff",fontWeight:400,fontSize:20,display:"flex",alignItems:"center",gap:10,fontFamily:"'DM Serif Display',serif",letterSpacing:".005em"}}>
              <FileText size={18}/> Notatka służbowa
            </div>
            <div style={{color:"rgba(255,255,255,.7)",fontSize:12,marginTop:3}}>Wypełnij formularz i pobierz PDF</div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.12)",border:"none",borderRadius:8,color:"#fff",cursor:"pointer",padding:"7px 10px",display:"flex",transition:"background .15s"}} onMouseEnter={e=>e.currentTarget.style.background="rgba(255,255,255,.2)"} onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.12)"}><X size={16}/></button>
        </div>
        <div className="stack" style={{gap:14}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
            <div><label>Pracownik (autor raportu)</label><select className={inp} value={author} onChange={e=>setAuthor(e.target.value)}><option value="">Wybierz z listy</option>{employees.map(e=><option key={e} value={e}>{e}</option>)}</select></div>
            <div><label>Przekazuje raport dla</label><input className={inp} placeholder="Np. Kierownik / Anna" value={handoverTo} onChange={e=>setHandoverTo(e.target.value)}/></div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr auto",gap:14}}>
            <div><label>Temat raportu</label><input className={inp} placeholder="Np. Reklamacja pokój 214…" value={subject} onChange={e=>setSubject(e.target.value)}/></div>
            <div><label>Data raportu</label><input className={inp} type="date" value={reportDate} onChange={e=>setReportDate(e.target.value)}/></div>
          </div>
          <div><label>Treść raportu</label><textarea className={ta} placeholder="Opisz zdarzenie, podjęte działania…" value={content} onChange={e=>setContent(e.target.value)} style={{minHeight:190}}/><div style={{fontSize:11.5,color:"var(--text-faint)",marginTop:4,textAlign:"right"}}>{content.length} znaków</div></div>
          {error&&<div className="alert" style={{display:"flex",alignItems:"center",gap:8}}><AlertTriangle size={14}/> {error}</div>}
        </div>
        <div className="modal-footer">
          <button className={dark?"btn btn-outline-dark":"btn btn-outline"} onClick={onClose}>Anuluj</button>
          <button className="btn btn-indigo" onClick={handleDownload} disabled={!author||!handoverTo||!subject||!content.trim()}><Download size={14}/> Pobierz raport PDF</button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Wiki List ────────────────────────────────────────────────────────────────
function WikiList({entries,selectedId,onSelect,dark}){
  return(
    <div className="wiki-list">
      {entries.map(entry=>(
        <button key={entry.id} type="button" onClick={()=>onSelect(entry)} className={`wiki-item ${dark?"wiki-item-dark":""} ${selectedId===entry.id?"wiki-item-selected":""}`}>
          <p className={`wiki-title ${dark?"wiki-title-dark":""}`}>{entry.topic}</p>
          <p className={`wiki-preview ${dark?"wiki-preview-dark":""}`}>{entry.content}</p>
          <p className={`wiki-date ${dark?"wiki-date-dark":""}`}>Aktualizacja: {entry.updatedAt}</p>
        </button>
      ))}
      {!entries.length&&<div className={`empty-box ${dark?"empty-box-dark":""}`}>Brak tematów pasujących do wyszukiwania.</div>}
    </div>
  );
}

// ─── Manager select modal ─────────────────────────────────────────────────────

// ─── Pre-shift modal — 3 kategorie zapoznania (B5) ───────────────────────────
function PreShiftModal({employeeName,selectedShift,onCancel,onConfirm}){
  const [activeTab,setActiveTab]=React.useState("alerts");
  const [acks,setAcks]=React.useState({alerts:false,standing:false,wiki:false});

  const now=new Date();
  const dayKey=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
  const ackKeyBase=`ack-${employeeName}-${dayKey}-${selectedShift}`;

  // Zaladuj stan ACK (tego dnia, tej zmiany)
  React.useEffect(()=>{
    setAcks({
      alerts:   localStorage.getItem(`${ackKeyBase}-alerts`)==="1",
      standing: localStorage.getItem(`${ackKeyBase}-standing`)==="1",
      wiki:     localStorage.getItem(`${ackKeyBase}-wiki`)==="1",
    });
  },[ackKeyBase]);

  const setAck=(key,val)=>{
    setAcks(a=>({...a,[key]:val}));
    if(val) localStorage.setItem(`${ackKeyBase}-${key}`,"1");
    else    localStorage.removeItem(`${ackKeyBase}-${key}`);
  };

  // Dane
  const alerts=loadJson(STORAGE_KEYS.managerAlerts,[])
    .filter(a=>!a.expires_at||new Date(a.expires_at).getTime()>Date.now())
    .filter(a=>!a.target_shift||a.target_shift===selectedShift)
    .sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||new Date(b.created_at)-new Date(a.created_at));

  const reminders=loadJson(STORAGE_KEYS.standingReminders,[])
    .filter(r=>r.active!==false);

  const wikiEntries=loadJson(STORAGE_KEYS.wiki,[]);
  const wikiLastSeenKey=`${STORAGE_KEYS.wikiLastSeen}-${employeeName}`;
  const lastSeenMs=parseInt(localStorage.getItem(wikiLastSeenKey)||"0");
  const newWiki=wikiEntries.filter(w=>{
    const u=w.updatedAt?new Date(w.updatedAt).getTime():0;
    return u>lastSeenMs;
  });

  const counts={alerts:alerts.length,standing:reminders.length,wiki:newWiki.length};
  const allAck=acks.alerts&&acks.standing&&acks.wiki;

  const handleStart=()=>{
    // Oznacz Wiki jako obejrzane
    localStorage.setItem(wikiLastSeenKey,String(Date.now()));
    onConfirm();
  };

  const renderEmpty=(msg)=>(
    <div style={{padding:"40px 20px",textAlign:"center",color:"var(--text-muted)"}}>
      <div style={{fontSize:34,marginBottom:10,opacity:.5}}>📭</div>
      <div style={{fontSize:13.5,fontWeight:600}}>{msg}</div>
      <div style={{fontSize:11.5,marginTop:6,opacity:.7}}>Zaznacz „Zapoznałem się" aby kontynuować.</div>
    </div>
  );

  const tab=(id,label,count,color)=>(
    <button
      key={id}
      onClick={()=>setActiveTab(id)}
      className={`cc-preshift-tab${activeTab===id?" cc-active":""}`}
      style={{borderBottomColor:activeTab===id?color:"transparent"}}>
      <span>{label}</span>
      {count>0&&<span className="cc-preshift-tab-badge" style={{background:color}}>{count}</span>}
      {acks[id==="alerts"?"alerts":id==="standing"?"standing":"wiki"]&&<span className="cc-preshift-tab-check">✓</span>}
    </button>
  );

  return (
    <div className="modal-backdrop" style={{zIndex:1100}}>
      <motion.div
        initial={{opacity:0,y:12,scale:.97}}
        animate={{opacity:1,y:0,scale:1}}
        className="cc-preshift-modal"
        onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div className="cc-preshift-header">
          <Logo variant="icon" tone="dark" width={36} height={36}/>
          <div style={{flex:1}}>
            <div className="cc-preshift-title">Zanim rozpoczniesz zmianę</div>
            <div className="cc-preshift-sub">
              <strong>{employeeName}</strong> · {SHIFT_LABELS_PL[selectedShift]||selectedShift}
            </div>
          </div>
          <button className="cc-preshift-close" onClick={onCancel} title="Anuluj">
            <X size={18}/>
          </button>
        </div>

        {/* Tabs */}
        <div className="cc-preshift-tabs">
          {tab("alerts",  "Pilne informacje", counts.alerts,  "var(--rose)")}
          {tab("standing","Stałe przypomnienia", counts.standing, "var(--gold)")}
          {tab("wiki",    "Nowe w Wiki",     counts.wiki,   "var(--plum)")}
        </div>

        {/* Tab content */}
        <div className="cc-preshift-content">
          {activeTab==="alerts"&&(
            <div className="cc-preshift-list">
              {alerts.length===0?renderEmpty("Brak pilnych informacji od kierownika."):
                alerts.map(a=>(
                  <div key={a.id} className="cc-preshift-item" style={{borderLeftColor:a.priority==="urgent"?"var(--rose)":"var(--gold)"}}>
                    <div className="cc-preshift-item-head">
                      <div className="cc-preshift-item-title">{a.title||"Informacja"}</div>
                      {a.pinned&&<span className="cc-preshift-pin">📌</span>}
                      {a.priority==="urgent"&&<span className="cc-preshift-urgent">PILNE</span>}
                    </div>
                    <div className="cc-preshift-item-body">{a.body}</div>
                    <div className="cc-preshift-item-meta">{a.created_by} · {new Date(a.created_at).toLocaleDateString("pl-PL")}</div>
                  </div>
                ))
              }
            </div>
          )}
          {activeTab==="standing"&&(
            <div className="cc-preshift-list">
              {reminders.length===0?renderEmpty("Brak stałych przypomnień."):
                reminders.map(r=>(
                  <div key={r.id} className="cc-preshift-item" style={{borderLeftColor:"var(--gold)"}}>
                    <div className="cc-preshift-item-head">
                      <div className="cc-preshift-item-title">{r.title||"Przypomnienie"}</div>
                      {r.category&&<span className="cc-preshift-cat">{r.category}</span>}
                    </div>
                    <div className="cc-preshift-item-body">{r.body}</div>
                  </div>
                ))
              }
            </div>
          )}
          {activeTab==="wiki"&&(
            <div className="cc-preshift-list">
              {newWiki.length===0?renderEmpty("Brak nowych wpisów w Wiki od ostatniego logowania."):
                newWiki.map(w=>(
                  <div key={w.id} className="cc-preshift-item" style={{borderLeftColor:"var(--plum)"}}>
                    <div className="cc-preshift-item-head">
                      <div className="cc-preshift-item-title">{w.topic}</div>
                    </div>
                    <div className="cc-preshift-item-body" style={{maxHeight:160,overflow:"auto"}}>{w.content}</div>
                    <div className="cc-preshift-item-meta">Zaktualizowano: {w.updatedAt}</div>
                  </div>
                ))
              }
            </div>
          )}
        </div>

        {/* ACK checkbox */}
        <div className="cc-preshift-ack">
          <label className="cc-preshift-ack-label">
            <input
              type="checkbox"
              checked={acks[activeTab==="alerts"?"alerts":activeTab==="standing"?"standing":"wiki"]}
              onChange={e=>setAck(activeTab==="alerts"?"alerts":activeTab==="standing"?"standing":"wiki",e.target.checked)}
            />
            <span>Zapoznałem się z sekcją „{activeTab==="alerts"?"Pilne informacje":activeTab==="standing"?"Stałe przypomnienia":"Nowe w Wiki"}"</span>
          </label>
        </div>

        {/* Footer */}
        <div className="cc-preshift-footer">
          <div className="cc-preshift-progress">
            <span className={acks.alerts?"cc-done":""}>Pilne</span>
            <span style={{opacity:.4}}>›</span>
            <span className={acks.standing?"cc-done":""}>Stałe</span>
            <span style={{opacity:.4}}>›</span>
            <span className={acks.wiki?"cc-done":""}>Wiki</span>
          </div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-outline" onClick={onCancel}>Anuluj</button>
            <button
              className="btn btn-rose"
              disabled={!allAck}
              onClick={handleStart}
              title={allAck?"":"Potwierdź wszystkie 3 kategorie aby kontynuować"}>
              {allAck?"Rozpocznij zmianę →":"Potwierdź wszystkie sekcje"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Inbox panel — widok "Informacje" w sidebarze (3 kategorie) ──────────────
function InboxPanel({dark,employeeName,selectedShift,wikiEntries,onOpenWiki}){
  const [tab,setTab]=React.useState("alerts");
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

  const section=(title,color)=>(
    <div style={{marginBottom:10,paddingBottom:8,borderBottom:`1px solid var(--border-light)`,fontSize:12,fontWeight:800,color:color,textTransform:"uppercase",letterSpacing:".06em"}}>{title}</div>
  );
  const tabBtn=(id,label,count,color)=>(
    <button key={id} onClick={()=>setTab(id)}
      style={{flex:1,padding:"14px 16px",border:"none",background:tab===id?"var(--bg-card)":"transparent",borderBottom:tab===id?`3px solid ${color}`:"3px solid transparent",fontWeight:tab===id?700:600,fontSize:13.5,cursor:"pointer",color:tab===id?color:"var(--text-muted)",display:"flex",alignItems:"center",justifyContent:"center",gap:9,letterSpacing:".02em",textTransform:"uppercase",fontFamily:"inherit"}}>
      {label}{count>0&&<span style={{background:color,color:"#fff",fontSize:10,fontWeight:800,minWidth:20,height:20,borderRadius:999,padding:"0 7px",display:"inline-flex",alignItems:"center",justifyContent:"center"}}>{count}</span>}
    </button>
  );

  return (
    <div className="panel" style={{padding:0,overflow:"hidden"}}>
      <div style={{padding:"14px 18px",borderBottom:"1px solid var(--border-light)",display:"flex",alignItems:"center",gap:10}}>
        <BellRing size={18} style={{color:"var(--plum)"}}/>
        <div>
          <div style={{fontSize:16,fontWeight:700,color:"var(--text-primary)",fontFamily:"'DM Serif Display',serif"}}>Informacje</div>
          <div style={{fontSize:12,color:"var(--text-muted)",marginTop:1}}>Pilne wiadomości, stałe przypomnienia i nowości w Wiki</div>
        </div>
      </div>
      <div style={{display:"flex",borderBottom:"1px solid var(--border-light)",background:"var(--bg-secondary)"}}>
        {tabBtn("alerts","Pilne",alerts.length,"var(--rose)")}
        {tabBtn("standing","Stałe",reminders.length,"var(--gold)")}
        {tabBtn("wiki","Nowe w Wiki",newWiki.length,"var(--plum)")}
      </div>
      <div style={{padding:"16px 18px",maxHeight:"calc(100vh - 300px)",overflowY:"auto"}}>
        {tab==="alerts"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {alerts.length===0?(
              <div style={{padding:"40px 20px",textAlign:"center",color:"var(--text-muted)"}}>
                <div style={{fontSize:32,marginBottom:8,opacity:.5}}>📭</div>
                <div style={{fontSize:13.5,fontWeight:600}}>Brak pilnych informacji.</div>
              </div>
            ):alerts.map(a=>(
              <div key={a.id} className="cc-preshift-item" style={{borderLeftColor:a.priority==="urgent"?"var(--rose)":"var(--gold)"}}>
                <div className="cc-preshift-item-head">
                  <div className="cc-preshift-item-title">{a.title||"Informacja"}</div>
                  {a.pinned&&<span className="cc-preshift-pin">📌</span>}
                  {a.priority==="urgent"&&<span className="cc-preshift-urgent">PILNE</span>}
                </div>
                <div className="cc-preshift-item-body">{a.body}</div>
                <div className="cc-preshift-item-meta">{a.created_by} · {new Date(a.created_at).toLocaleDateString("pl-PL")}</div>
              </div>
            ))}
          </div>
        )}
        {tab==="standing"&&(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {reminders.length===0?(
              <div style={{padding:"40px 20px",textAlign:"center",color:"var(--text-muted)"}}>
                <div style={{fontSize:32,marginBottom:8,opacity:.5}}>📋</div>
                <div style={{fontSize:13.5,fontWeight:600}}>Brak stałych przypomnień.</div>
              </div>
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
              <div style={{padding:"40px 20px",textAlign:"center",color:"var(--text-muted)"}}>
                <div style={{fontSize:32,marginBottom:8,opacity:.5}}>📚</div>
                <div style={{fontSize:13.5,fontWeight:600}}>Brak nowości w Wiki od ostatniego logowania.</div>
                <button onClick={onOpenWiki} style={{marginTop:14,padding:"8px 18px",border:"1px solid var(--plum)",background:"transparent",color:"var(--plum)",borderRadius:8,fontWeight:700,fontSize:12.5,cursor:"pointer"}}>Otwórz Wiki →</button>
              </div>
            ):(
              <>
                <div style={{display:"flex",justifyContent:"flex-end",marginBottom:4}}>
                  <button onClick={()=>{markWikiSeen();window.location.reload();}} style={{padding:"6px 14px",border:"1px solid var(--border-medium)",background:"var(--bg-card)",color:"var(--text-secondary)",borderRadius:7,fontWeight:600,fontSize:11.5,cursor:"pointer"}}>Oznacz wszystkie jako przeczytane</button>
                </div>
                {newWiki.map(w=>(
                  <div key={w.id} className="cc-preshift-item" style={{borderLeftColor:"var(--plum)"}}>
                    <div className="cc-preshift-item-head">
                      <div className="cc-preshift-item-title">{w.topic}</div>
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
    </div>
  );
}

// ─── Audit log modal ──────────────────────────────────────────────────────────
function AuditLogModal({onClose}){
  const [log]=useState(()=>loadJson(STORAGE_KEYS.adminAudit,[]));
  const [filter,setFilter]=useState("wszyscy");
  const filtered=filter==="wszyscy"?log:log.filter(e=>e.manager===filter);
  return(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal large-modal dark-modal" style={{maxWidth:720}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header" style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <h2 style={{display:"flex",alignItems:"center",gap:10}}><Cog size={18}/> Dziennik działań kierownictwa</h2>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"none",borderRadius:8,color:"var(--dark-text)",cursor:"pointer",padding:"7px 10px",display:"flex"}}><X size={16}/></button>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
          {["wszyscy",...ADMIN_MANAGERS].map(m=>(
            <button key={m} onClick={()=>setFilter(m)}
              style={{padding:"6px 14px",borderRadius:8,border:"1px solid",fontWeight:700,fontSize:12.5,cursor:"pointer",
                      borderColor:filter===m?"var(--gold)":"var(--dark-border)",
                      background:filter===m?"rgba(201,153,80,.15)":"transparent",
                      color:filter===m?"var(--gold)":"var(--dark-text-muted)",textTransform:"capitalize"}}>{m}</button>
          ))}
        </div>
        <div style={{maxHeight:440,overflowY:"auto",display:"grid",gap:8}}>
          {filtered.length?filtered.map(entry=>(
            <div key={entry.id} style={{background:"rgba(255,255,255,.03)",borderRadius:"var(--radius-md)",padding:"12px 14px",border:"1px solid var(--dark-border)",borderLeft:"3px solid var(--gold)"}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:10}}>
                  <div style={{width:30,height:30,borderRadius:"50%",background:"var(--gold)",display:"flex",alignItems:"center",justifyContent:"center",color:"var(--plum-deep)",fontSize:12,fontWeight:800}}>{entry.manager?.[0]||"?"}</div>
                  <span style={{fontWeight:700,color:"var(--gold)",fontSize:13.5,fontFamily:"'DM Serif Display',serif"}}>{entry.manager}</span>
                </div>
                <span style={{fontSize:11,color:"var(--dark-text-muted)"}}>{entry.at}</span>
              </div>
              <div style={{color:"var(--dark-text-secondary)",fontSize:13,paddingLeft:40,lineHeight:1.5}}>{entry.action}</div>
            </div>
          )):<div style={{textAlign:"center",color:"var(--dark-text-muted)",padding:40,fontSize:13}}>Brak zapisanych działań.</div>}
        </div>
      </div>
    </div>
  );
}

// ─── Worker Sidebar ───────────────────────────────────────────────────────────
function WorkerSidebar({activeTab,setActiveTab,started,overdueCount,datedCount,setShowWiki,setShowEmpReport,isAdmin,currentManager,setShowAdminPanel,setShowSearch,workerDark,setWorkerDark,setShowPaymentForm,employeeName,selectedShift,onShowMsg,liveTime,shiftElapsed,progress,totalDone,totalMandatory,onOpenFinish,inboxCount=0,faultsCount=0,showToast}){
  const totalBadge=overdueCount+datedCount;
  // Mapowanie tab → grupa
  const tabToGroup={zmiana:"zmiana",zadania:"zmiana",przekazanie:"zmiana",informacje:"zmiana",
    hk:"pokoje",hklive:"pokoje",usterki:"pokoje",
    parking:"obsluga",goscie:"obsluga"};
  const [activeGroup,setActiveGroup]=React.useState(tabToGroup[activeTab]||"zmiana");
  React.useEffect(()=>{
    if(tabToGroup[activeTab]&&tabToGroup[activeTab]!==activeGroup) setActiveGroup(tabToGroup[activeTab]);
  },[activeTab]);
  const groupBadge={
    zmiana: totalBadge+inboxCount,
    pokoje: faultsCount,
    obsluga: 0,
    komunikacja: 0,
    narzedzia: 0,
  };
  const groups=[
    {id:"zmiana",    label:"Zmiana",       icon:<ClipboardList size={18}/>},
    {id:"pokoje",    label:"Pokoje",       icon:<Cog size={18}/>},
    {id:"obsluga",   label:"Obsługa",      icon:<Users size={18}/>},
    {id:"komunikacja",label:"Komunikacja", icon:<MessageSquare size={18}/>},
    {id:"narzedzia", label:"Narzędzia",    icon:<BookOpen size={18}/>},
  ];
  const nb=(id,icon,label,badge=0,disabled=false)=>(
    <button key={id} className={`wsb-item${activeTab===id?" wsb-active":""}${disabled?" wsb-disabled":""}`} onClick={()=>!disabled&&setActiveTab(id)}>
      <span className="wsb-icon">{icon}</span><span className="wsb-label">{label}</span>
      {badge>0&&<span className="wsb-badge">{badge}</span>}
    </button>
  );
  const soon=(icon,label)=>(
    <button className="wsb-item wsb-disabled" onClick={()=>showToast&&showToast(`Moduł „${label}" — wkrótce dostępny.`,"info")} title="Wkrótce dostępny">
      <span className="wsb-icon">{icon}</span><span className="wsb-label">{label}</span>
      <span className="wsb-soon">Wkrótce</span>
    </button>
  );
  // Zawartosc panelu details w zaleznosci od grupy
  const detailsTitle={zmiana:"Na tej zmianie",pokoje:"Pokoje",obsluga:"Obsługa",komunikacja:"Komunikacja",narzedzia:"Narzędzia"}[activeGroup];
  return(
    <aside className={`worker-sidebar-rail${workerDark?" worker-sidebar-dark":""}`}>
      {/* ── RAIL (waski pasek z ikonami) ─────────────────────── */}
      <div className="wsb-rail">
        <div className="wsb-rail-logo" title="Conrad Comfort"><Logo variant="icon" tone="dark"/></div>
        <div className="wsb-rail-groups">
          {groups.map(g=>(
            <button
              key={g.id}
              className={`wsb-rail-btn${activeGroup===g.id?" wsb-rail-active":""}`}
              onClick={()=>setActiveGroup(g.id)}
              title={g.label}>
              {g.icon}
              {groupBadge[g.id]>0&&<span className="wsb-rail-dot"/>}
            </button>
          ))}
        </div>
        <div className="wsb-rail-spacer"/>
        {/* Bottom rail: theme + user */}
        <button className="wsb-rail-btn" onClick={()=>setWorkerDark(v=>!v)} title={workerDark?"Tryb jasny":"Tryb ciemny"}>
          {workerDark?<Sun size={18}/>:<Moon size={18}/>}
        </button>
        {isAdmin&&(
          <button className="wsb-rail-btn" onClick={()=>setShowAdminPanel(true)} title={`Kierownik: ${currentManager}`}>
            <ShieldCheck size={18}/>
          </button>
        )}
      </div>

      {/* ── DETAILS (pozycje aktualnej grupy) ─────────────── */}
      <div className="wsb-details">
        <div className="wsb-details-header">
          <div className="wsb-details-title">{detailsTitle}</div>
          {employeeName&&<div className="wsb-details-sub">{employeeName}{selectedShift&&" · "+SHIFT_SHORT_LABELS[selectedShift]}</div>}
        </div>
        {started&&employeeName&&(
          <div className="wsb-shift-card">
            <div className="wsb-clock">{liveTime}</div>
            <div className="wsb-elapsed">Trwa: {shiftElapsed}</div>
            <div className="wsb-prog-row">
              <div className="wsb-prog-bar"><div className="wsb-prog-fill" style={{width:`${progress}%`}}/></div>
              <span className="wsb-prog-label">{totalDone}/{totalMandatory}</span>
            </div>
          </div>
        )}
        <div className="wsb-details-items">
          {activeGroup==="zmiana"&&<>
            {nb("zmiana",<ClipboardList size={14}/>,"Dashboard")}
            {nb("zadania",<CheckSquare size={14}/>,"Zadania",totalBadge,!started)}
            {nb("przekazanie",<ArrowLeftRight size={14}/>,"Przekaż zmianę",0,!started)}
            {nb("informacje",<BellRing size={14}/>,"Informacje",inboxCount)}
          </>}
          {activeGroup==="pokoje"&&<>
            {nb("hk",<Cog size={14}/>,"Housekeeping")}
            {nb("hklive",<QrCode size={14}/>,"Panel HK Live")}
            {nb("usterki",<AlertTriangle size={14}/>,"Usterki",faultsCount)}
          </>}
          {activeGroup==="obsluga"&&<>
            {nb("parking",<span style={{fontSize:12}}>🚗</span>,"Parking")}
            {nb("goscie",<Users size={14}/>,"Stali goście")}
            {soon(<FileText size={14}/>,"Vouchery")}
          </>}
          {activeGroup==="komunikacja"&&<>
            {soon(<MessageSquare size={14}/>,"Czat zespołu")}
            <button className="wsb-item" onClick={()=>setShowEmpReport(true)}><span className="wsb-icon"><FileDown size={14}/></span><span className="wsb-label">Notatka służbowa</span></button>
            <button className="wsb-item wsb-item-rose" onClick={onShowMsg}><span className="wsb-icon"><AlertCircle size={14}/></span><span className="wsb-label">Wiadomość do kierownika</span></button>
          </>}
          {activeGroup==="narzedzia"&&<>
            <button className="wsb-item" onClick={()=>setShowWiki(true)}><span className="wsb-icon"><BookOpen size={14}/></span><span className="wsb-label">Wiki</span></button>
            <button className="wsb-item" onClick={()=>setShowSearch(true)}><span className="wsb-icon"><Search size={14}/></span><span className="wsb-label">Szukaj</span></button>
            <button className="wsb-item wsb-item-amber" onClick={()=>setShowPaymentForm(true)}><span className="wsb-icon"><FileText size={14}/></span><span className="wsb-label">Korekta płatności</span></button>
          </>}
        </div>
        <div className="wsb-spacer"/>
        {started&&(
          <div style={{padding:"8px 10px"}}>
            <button className="wsb-finish-btn" onClick={onOpenFinish}><LogOut size={13}/> Zakończ zmianę</button>
          </div>
        )}
      </div>
    </aside>
  );
}

function AdminSidebarRail({
  activeTab, setActiveTab, setShowWiki, setShowAuditLog, handleAdminLogout, setShowSearch,
  adminDark, setAdminDark, onCheckUpdate, currentManager, unreadMsgCount=0,
  updateState, updateInfo, updateProgress, onDownloadUpdate, onInstallUpdate,
  pendingCorrections=0, faultsCount=0, showToast,
}){
  // Mapowanie tab → grupa
  const tabToGroup={
    wiadomosci:"dashboard", statystyki:"dashboard",
    pracownicy:"zespol", ewidencja:"zespol", historia:"zespol",
    kwhotel:"pokoje", usterki:"pokoje", goscie:"pokoje", parking:"pokoje",
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
    finanse: pendingCorrections,
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
    <button className="wsb-item wsb-disabled" onClick={()=>showToast&&showToast(`Moduł „${label}" — wkrótce dostępny.`,"info")}>
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
      {/* RAIL */}
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

      {/* DETAILS */}
      <div className="wsb-details">
        <div className="wsb-details-header">
          <div className="wsb-details-title">{detailsTitle}</div>
          <div className="wsb-details-sub">Kierownik: <strong>{currentManager}</strong></div>
        </div>
        {/* Update banner wewnatrz details */}
        {updateState==="available"&&updateInfo&&(
          <div style={{margin:"10px 12px",padding:"10px 12px",background:"rgba(56,189,248,.12)",border:"1px solid rgba(56,189,248,.35)",borderRadius:8,fontSize:12}}>
            <div style={{color:"#38bdf8",fontWeight:700,marginBottom:6}}>Dostępna v{updateInfo.version}</div>
            <button onClick={onDownloadUpdate} className="btn btn-sky" style={{fontSize:11,padding:"4px 10px",width:"100%"}}>Pobierz</button>
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
            <button onClick={onInstallUpdate} className="btn btn-emerald" style={{fontSize:11,padding:"4px 10px",width:"100%"}}>Zainstaluj i uruchom ponownie</button>
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
          </>}
          {activeGroup==="pokoje"&&<>
            {nb("kwhotel",<TrendingUp size={14}/>,"KWHotel / HK")}
            {nb("usterki",<AlertTriangle size={14}/>,"Usterki",faultsCount)}
            {nb("goscie",<Users size={14}/>,"Stali goście")}
            {nb("parking",<span style={{fontSize:12}}>🚗</span>,"Parking")}
          </>}
          {activeGroup==="komunikacja"&&<>
            {soon(<AlertCircle size={14}/>,"Pilne informacje")}
            {soon(<BellRing size={14}/>,"Stałe przypomnienia")}
          </>}
          {activeGroup==="finanse"&&<>
            {nb("korekty",<FileText size={14}/>,"Korekty płatności",pendingCorrections)}
            {nb("kasa",<Settings size={14}/>,"Kasa")}
            {soon(<FileText size={14}/>,"Vouchery")}
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


// ─── HK MODULE ────────────────────────────────────────────────────────────────
const hkW=(no)=>HK_APTS.includes(no)?3:1;
const hkFmtDate=(s)=>s?s.split("-").reverse().join("."):"";
const hkDayOfWeek=(s)=>{try{return new Date(s).getDay();}catch{return 0;}};

// helper: numer pracownika z listy (1.Imie)
const hkPersonLabel=(name)=>pl(name||"");

function downloadHKMain(date,staff,data,afternoonPersonName){
  // afternoonPersonName passed separately — don't rely on _isAfternoon flag
  const doc=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
  const d=hkFmtDate(date);
  const margin=10;const cw=(pw-margin*2-6)/3; // 3 równe kolumny z odstępami
  const cx=[margin,margin+cw+3,margin+2*(cw+3)];

  // Tytuł
  doc.setFillColor(25,55,120);doc.rect(0,0,pw,14,"F");
  doc.setFont("helvetica","bold");doc.setFontSize(14);doc.setTextColor(255,255,255);
  doc.text("RAPORT GLOWNY",pw/2,9.5,{align:"center"});

  // Nagłówki pięter
  const floors=[HK_FLOOR1,HK_FLOOR2,HK_FLOOR3];
  const rh=4.8;
  let startY=17;

  floors.forEach((fl,fi)=>{
    const ox=cx[fi];
    doc.setFillColor(50,80,140);doc.rect(ox,startY,cw,5.5,"F");
    doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(255,255,255);
    doc.text(`Pietro ${fi+1}`,ox+cw/2,startY+3.8,{align:"center"});
    // sub-header
    doc.setFillColor(210,218,240);doc.rect(ox,startY+5.5,cw,4,"F");
    doc.setFontSize(6.5);doc.setTextColor(30,30,80);
    const sc1=ox+2,sc2=ox+cw*0.38,sc3=ox+cw*0.75;
    doc.text("Nr",sc1,startY+8.8);
    doc.text("Osoba",sc2,startY+8.8);
    doc.text("Status",sc3,startY+8.8);
  });

  const maxLen=Math.max(HK_FLOOR1.length,HK_FLOOR2.length,HK_FLOOR3.length);
  let y=startY+9.5;

  for(let ri=0;ri<maxLen;ri++){
    floors.forEach((fl,fi)=>{
      const room=fl[ri];if(!room)return;
      const ox=cx[fi];const rd=data[room.no]||{};
      const ry=y+ri*rh;
      if(room.apt){doc.setFillColor(195,200,230);}
      else if(ri%2===0){doc.setFillColor(250,251,255);}
      else{doc.setFillColor(255,255,255);}
      doc.rect(ox,ry,cw,rh,"F");
      doc.setDrawColor(205,210,225);doc.setLineWidth(0.1);doc.rect(ox,ry,cw,rh,"S");
      // grid lines
      doc.line(ox+cw*0.34,ry,ox+cw*0.34,ry+rh);
      doc.line(ox+cw*0.72,ry,ox+cw*0.72,ry+rh);
      // Nr
      doc.setFont("helvetica",room.apt?"bold":"normal");doc.setFontSize(7.5);
      doc.setTextColor(room.apt?20:0,room.apt?20:0,room.apt?100:0);
      doc.text(room.no,ox+cw*0.17,ry+rh-1.2,{align:"center"});
      // Osoba
      if(rd.person){
        doc.setFont("helvetica","normal");doc.setFontSize(7);doc.setTextColor(0,0,0);
        const nm=pl(rd.person).substring(0,9);
        doc.text(nm,ox+cw*0.54,ry+rh-1.2,{align:"center"});
      }
      // Status (W/PG/PGZ) lub BR/ZS
      const stLabel=rd.status||(rd.br&&rd.zs?"BR+ZS":rd.br?"BR":rd.zs?"ZS":"");
      if(stLabel){
        doc.setFont("helvetica","bold");doc.setFontSize(7.5);
        const sc={W:[24,95,165],WP:[24,95,165],PG:[15,110,70],PGZ:[130,79,10]}[rd.status];
        doc.setTextColor(sc?sc[0]:0,sc?sc[1]:0,sc?sc[2]:0);
        doc.text(stLabel,ox+cw*0.88,ry+rh-1.2,{align:"center"});
      }
    });
  }

  // Sekcja dolna
  let by=startY+9.5+maxLen*rh+5;
  doc.setDrawColor(25,55,120);doc.setLineWidth(0.5);doc.line(margin,by,pw-margin,by);by+=4;

  // DATA / DYŻUR
  doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(0,0,0);
  doc.text("DATA: "+d,margin,by+3.5);
  const dutyN=pl(staff.find(s=>s._isDuty)?.name||"");
  doc.text("DYZUR: "+dutyN,margin+50,by+3.5);

  // Tabela pracowników
  by+=7;
  const tw=pw-margin*2;
  doc.setFillColor(50,80,140);doc.rect(margin,by,tw,5.5,"F");
  doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(255,255,255);
  doc.text("IMIE I NAZWISKO",margin+2,by+3.8);
  doc.text("W",margin+tw*0.48,by+3.8,{align:"center"});
  doc.text("PG",margin+tw*0.62,by+3.8,{align:"center"});
  doc.text("PGZ",margin+tw*0.76,by+3.8,{align:"center"});
  by+=5.5;

  // Pracownicy: filtruj popołudniową przez imię (niezawodne)
  const afternoonN=afternoonPersonName||"";
  const mainStaff=staff.filter(s=>s.name!==afternoonN);
  const isW=(s)=>s==="W"||s==="WP";
  const countRooms=(name)=>{
    const pr=Object.entries(data).filter(([,v])=>v.person===name);
    const reg=pr.filter(([k,v])=>isW(v.status)&&!HK_APTS.includes(k)).length;
    const apt=pr.filter(([k,v])=>isW(v.status)&&HK_APTS.includes(k)).length;
    const pgAll=pr.filter(([,v])=>v.status==="PG"||v.status==="PGZ").length;
    return{reg,apt,pg:pgAll,total:reg+apt*3};
  };
  mainStaff.forEach((s,si)=>{
    if(by>ph-20){doc.addPage();by=12;}
    const {reg,apt,pg,total}=countRooms(s.name);
    doc.setFillColor(si%2===0?248:255,si%2===0?249:255,si%2===0?253:255);
    doc.rect(margin,by,tw,5.5,"F");
    doc.setDrawColor(200,205,220);doc.rect(margin,by,tw,5.5,"S");
    doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.setTextColor(0,0,0);
    doc.text(`${si+1}. ${pl(s.name)}${s._isDuty?" (dyz.)":""}`,margin+2,by+3.8);
    // Pokazuj reg+apt lub samą liczbe
    const wLabel=apt>0?`${reg}+${apt}`:reg>0?String(reg):"";
    if(wLabel)doc.text(wLabel,margin+tw*0.48,by+3.8,{align:"center"});
    if(pg)doc.text(String(pg),margin+tw*0.62,by+3.8,{align:"center"});
    by+=5.5;
  });
  // Podsumowanie popołudnie - sekcja z osobą popołudniową wewnątrz
  by+=5;
  const pgTot=HK_ALL.filter(r=>data[r.no]?.status==="PG").length;
  const pgzTot=HK_ALL.filter(r=>data[r.no]?.status==="PGZ").length;
  const afP=afternoonPersonName?{name:afternoonPersonName}:null;
  // Header Popołudnie
  doc.setFillColor(240,245,255);doc.rect(margin,by,tw,5.5,"F");
  doc.setDrawColor(100,130,200);doc.rect(margin,by,tw,5.5,"S");
  doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(25,55,120);
  doc.text("Popoludnie",margin+2,by+3.8);
  doc.text("PG",margin+tw*0.38,by+3.8,{align:"center"});
  doc.text("PG APT",margin+tw*0.54,by+3.8,{align:"center"});
  doc.text("PGNZ",margin+tw*0.70,by+3.8,{align:"center"});
  doc.text("PGNZ APT",margin+tw*0.86,by+3.8,{align:"center"});
  by+=5.5;
  // Osoba popołudniowa — w tej sekcji z numerem następującym po liście głównej
  if(afternoonN){
    if(by>ph-20){doc.addPage();by=12;}
    const si=mainStaff.length;
    const {pg:apg,total:at}=countRooms(afternoonN);
    doc.setFillColor(255,255,255);doc.rect(margin,by,tw,5.5,"F");
    doc.setDrawColor(180,198,230);doc.setLineWidth(0.3);doc.rect(margin,by,tw,5.5,"S");
    doc.setLineWidth(0.1);
    doc.setFont("helvetica","bold");doc.setFontSize(8.5);doc.setTextColor(25,55,120);
    doc.text(`${si+1}. ${pl(afternoonN)}`,margin+2,by+3.8);
    const pgApt=HK_APTS.filter(k=>data[k]?.status==="PG"&&(data[k]?.person===afternoonN)).length;
    const pgzApt=HK_APTS.filter(k=>data[k]?.status==="PGZ"&&(data[k]?.person===afternoonN)).length;
    const pgRegular=pgTot-pgApt;const pgzRegular=pgzTot-pgzApt;
    if(pgRegular)doc.text(String(pgRegular),margin+tw*0.38,by+3.8,{align:"center"});
    if(pgApt)doc.text(String(pgApt),margin+tw*0.54,by+3.8,{align:"center"});
    if(pgzTot)doc.text(String(pgzTot),margin+tw*0.70,by+3.8,{align:"center"});
    if(pgzApt)doc.text(String(pgzApt),margin+tw*0.86,by+3.8,{align:"center"});
    by+=5.5;
  } else {
    // Empty data row
    const pgApt=HK_APTS.filter(k=>data[k]?.status==="PG").length;
    const pgzApt=HK_APTS.filter(k=>data[k]?.status==="PGZ").length;
    doc.setFillColor(255,255,255);doc.rect(margin,by,tw,6,"F");doc.rect(margin,by,tw,6,"S");
    doc.setFont("helvetica","normal");doc.setFontSize(10);doc.setTextColor(0,0,0);
    [pgTot,pgApt,pgzTot,pgzApt].forEach((n,i)=>{
      const xs=[0.38,0.54,0.70,0.86];
      if(n>0)doc.text(String(n),margin+tw*xs[i],by+4.2,{align:"center"});
    });
    by+=6;
  }

  savePDF(doc,`HK_Raport_Glowny_${date}.pdf`,"hk");
}

function downloadHKRoomList(date,data){
  // Raport Pokoje — tylko Nr, Typ, Opis łóżek dla wszystkich pokoi — A4 portrait
  const doc=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
  const margin=8;const colGap=3;const colW=(pw-margin*2-colGap*2)/3;
  const cx=[margin,margin+colW+colGap,margin+2*(colW+colGap)];
  const APT_DESC={106:"D+T",206:"D+T+SOFA 1",218:"D+D",306:"D+T",318:"D+T"};
  const TRPL_DESC="SGL+SGL+SGL";

  // Tytuł
  doc.setFont("helvetica","bold");doc.setFontSize(14);doc.setTextColor(0,0,0);
  doc.text("RAPORT - POKOJE",pw/2,9,{align:"center"});

  const floors=[HK_FLOOR1,HK_FLOOR2,HK_FLOOR3];
  const colP=[0.22,0.22,0.56]; // Nr, Typ, Opis
  const hdrY=12;

  cx.forEach((ox,fi)=>{
    doc.setFillColor(220,228,248);doc.rect(ox,hdrY,colW,5,"F");
    doc.setDrawColor(150,165,200);doc.setLineWidth(0.3);doc.rect(ox,hdrY,colW,5,"S");
    doc.setFont("helvetica","bold");doc.setFontSize(8);doc.setTextColor(20,30,100);
    doc.text(`Pietro ${fi+1}`,ox+colW/2,hdrY+3.4,{align:"center"});
  });
  const subY=hdrY+5;
  cx.forEach(ox=>{
    doc.setFillColor(205,215,242);doc.rect(ox,subY,colW,3.8,"F");doc.rect(ox,subY,colW,3.8,"S");
    doc.setFont("helvetica","bold");doc.setFontSize(6.5);doc.setTextColor(20,30,100);
    let hx=ox;
    [["Nr",colP[0]],["Typ",colP[1]],["Opis lozek",colP[2]]].forEach(([l,p])=>{
      doc.text(l,hx+colW*p/2,subY+2.7,{align:"center"});hx+=colW*p;
    });
  });

  const rh=5;
  const maxLen=Math.max(HK_FLOOR1.length,HK_FLOOR2.length,HK_FLOOR3.length);
  const startY=subY+3.8;

  for(let ri=0;ri<maxLen;ri++){
    floors.forEach((fl,fi)=>{
      const room=fl[ri];if(!room)return;
      const ox=cx[fi];const ry=startY+ri*rh;
      const rd=data[room.no]||{};
      if(room.apt)doc.setFillColor(190,200,235);
      else if(ri%2===0)doc.setFillColor(248,251,255);
      else doc.setFillColor(255,255,255);
      doc.rect(ox,ry,colW,rh,"F");
      doc.setDrawColor(205,210,228);doc.setLineWidth(0.1);doc.rect(ox,ry,colW,rh,"S");
      doc.line(ox+colW*colP[0],ry,ox+colW*colP[0],ry+rh);
      doc.line(ox+colW*(colP[0]+colP[1]),ry,ox+colW*(colP[0]+colP[1]),ry+rh);
      // Nr
      doc.setFont("helvetica",room.apt?"bold":"normal");doc.setFontSize(8.5);
      doc.setTextColor(room.apt?20:0,room.apt?20:0,room.apt?100:0);
      doc.text(room.no,ox+colW*colP[0]/2,ry+rh-1.5,{align:"center"});
      // Typ — APT → "APT", TRPL → "TRPL", reszta normalnie
      const isTRPL=(rd.roomType||room.type)==="TRPL"||["105","107","117","119"].includes(room.no)&&!room.apt;
      const rType=rd.roomType||room.type;
      const displayTyp=room.apt?"APT":isTRPL?"TRPL":rType;
      doc.setFont("helvetica","normal");doc.setFontSize(8);doc.setTextColor(0,0,0);
      doc.text(displayTyp,ox+colW*(colP[0]+colP[1]/2),ry+rh-1.5,{align:"center"});
      // Opis — APT: rd.roomType (wybór z dropdowna), TRPL: rd.roomType jeśli inne niż TRPL, inaczej SGL+SGL+SGL
      let desc="";
      if(room.apt)desc=rd.roomType||APT_DESC[room.no]||room.type;
      else if(isTRPL)desc=rType!=="TRPL"?rType:TRPL_DESC;
      if(desc){doc.setFontSize(7.5);doc.text(desc,ox+colW*(colP[0]+colP[1]+colP[2]/2),ry+rh-1.5,{align:"center"});}
    });
  }

  const botY=startY+maxLen*rh+5;
  // Linia dekoracyjna
  doc.setDrawColor(180,188,215);doc.setLineWidth(0.4);
  doc.line(margin,botY,pw-margin,botY);
  // Data w ramce
  doc.setFillColor(220,228,248);doc.rect(margin,botY+3,pw-margin*2,6,"F");
  doc.setDrawColor(150,165,200);doc.setLineWidth(0.3);doc.rect(margin,botY+3,pw-margin*2,6,"S");
  doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(20,30,100);
  doc.text("DATA: "+hkFmtDate(date),pw/2,botY+7.5,{align:"center"});
  // Linia dolna
  doc.setDrawColor(180,188,215);doc.setLineWidth(0.4);
  doc.line(margin,botY+9,pw-margin,botY+9);
  savePDF(doc,`HK_Raport_Pokoje_${date}.pdf`,"hk");
}

function downloadHKStatus(date,staff,data,notes){
  // Raport Indywidualny — osobny PDF dla każdej osoby
  // 3 kolumny: Nr | Typ | Status (W/PG/PGZ)
  const d=hkFmtDate(date);
  const allStaff=staff; // generate for everyone including afternoon
  if(!allStaff.length)return;
  const hkNotes=notes||{};

  const LINEN=["POSZWA","POSZEWKI","PRZES. SR.","PRZES. DUZE","RECZ. DUZY","RECZ. SREDNI","DYWANIK","NARZUTA","KOLDR","PODUSZKA","PODK"];
  const stColors={W:[24,95,165],WP:[24,95,165],PG:[15,110,70],PGZ:[130,79,10]};

  allStaff.forEach((person)=>{
    const isAfternoonPerson=person._isAfternoon||false;
    const myRooms=HK_ALL.filter(r=>{const rd=data[r.no]||{};return rd.person===person.name&&(rd.status||rd.br||rd.zs);});
    // For linen table: afternoon person only gets PG/PGZ rooms (no BR/ZS)
    const linenRooms=isAfternoonPerson?myRooms.filter(r=>["PG","PGZ"].includes(data[r.no]?.status||"")):myRooms;
    if(!myRooms.length)return;

    const doc=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
    const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
    const margin=10;const tw=pw-margin*2;

    // Tytuł
    doc.setFont("helvetica","bold");doc.setFontSize(12);doc.setTextColor(0,0,0);
    doc.text("RAPORT POKOJE - INDYWIDUALNY",pw/2,9,{align:"center"});
    doc.setFontSize(9);doc.setFont("helvetica","normal");doc.setTextColor(80,80,80);
    doc.text(d,pw-margin,9,{align:"right"});
    // Imię pracownika — wyraźnie pod tytułem
    doc.setFillColor(50,80,140);doc.rect(0,11,pw,7,"F");
    doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(255,255,255);
    doc.text(pl(person.name),pw/2,16,{align:"center"});

    // Tabela pokoi — 3 kolumny w 3 blokach side-by-side (jeden blok = piętro)
    const colGap=3;const colW=(tw-colGap*2)/3;
    const bx=[margin,margin+colW+colGap,margin+2*(colW+colGap)];
    const cP=[0.25,0.40,0.35]; // Nr, Typ, Status
    const rh=4.6;const floors=[HK_FLOOR1,HK_FLOOR2,HK_FLOOR3];

    // Headers
    const hY=20;
    bx.forEach((ox,fi)=>{
      doc.setFillColor(220,228,248);doc.rect(ox,hY,colW,4.5,"F");
      doc.setDrawColor(150,165,200);doc.setLineWidth(0.3);doc.rect(ox,hY,colW,4.5,"S");
      doc.setFont("helvetica","bold");doc.setFontSize(7);doc.setTextColor(20,30,100);
      doc.text(`Pietro ${fi+1}`,ox+colW/2,hY+3.1,{align:"center"});
    });
    const subY=hY+4.5;
    bx.forEach(ox=>{
      doc.setFillColor(205,215,242);doc.rect(ox,subY,colW,3.8,"F");doc.rect(ox,subY,colW,3.8,"S");
      doc.setFontSize(6.5);doc.setFont("helvetica","bold");doc.setTextColor(20,30,100);
      let hx=ox;
      [["Nr",cP[0]],["Typ",cP[1]],["Status",cP[2]]].forEach(([l,p])=>{
        doc.text(l,hx+colW*p/2,subY+2.7,{align:"center"});hx+=colW*p;
      });
    });

    const maxLen=Math.max(HK_FLOOR1.length,HK_FLOOR2.length,HK_FLOOR3.length);
    const rowStartY=subY+3.8;

    for(let ri=0;ri<maxLen;ri++){
      floors.forEach((fl,fi)=>{
        const room=fl[ri];if(!room)return;
        const ox=bx[fi];const rd=data[room.no]||{};
        const isMyRoom=rd.person===person.name;
        const ry=rowStartY+ri*rh;
        if(!isMyRoom){doc.setFillColor(249,250,253);}
        else if(room.apt){doc.setFillColor(185,195,228);}
        else{doc.setFillColor(232,238,255);}
        doc.rect(ox,ry,colW,rh,"F");
        doc.setDrawColor(205,212,230);doc.setLineWidth(0.1);doc.rect(ox,ry,colW,rh,"S");
        // dividers
        doc.line(ox+colW*cP[0],ry,ox+colW*cP[0],ry+rh);
        doc.line(ox+colW*(cP[0]+cP[1]),ry,ox+colW*(cP[0]+cP[1]),ry+rh);
        // Nr
        const clr=isMyRoom?(room.apt?[20,20,110]:[0,0,0]):[185,185,195];
        doc.setFont("helvetica",room.apt?"bold":"normal");doc.setFontSize(8);
        doc.setTextColor(clr[0],clr[1],clr[2]);
        doc.text(room.no,ox+colW*cP[0]/2,ry+rh-1.3,{align:"center"});
        if(!isMyRoom)return;
        // Typ — tylko W, W/P i ZS; BR/PG/PGZ mają pusty Typ
        const showTyp=rd.status==="W"||rd.status==="WP"||rd.zs;
        if(showTyp){
          const typStr=(rd.roomType||room.type)+(rd.zs?" ZS":"");
          doc.setFont("helvetica","normal");doc.setFontSize(7.5);doc.setTextColor(0,0,0);
          doc.text(typStr,ox+colW*(cP[0]+cP[1]/2),ry+rh-1.3,{align:"center"});
        }
        // Status: W/PG/PGZ lub BR (w kolumnie Status)
        const indivStLabel=rd.status||(rd.br?"BR":rd.zs?"ZS":"");
        if(indivStLabel){
          const sc=stColors[rd.status];
          doc.setFont("helvetica","bold");doc.setFontSize(8.5);
          doc.setTextColor(sc?sc[0]:0,sc?sc[1]:0,sc?sc[2]:0);
          doc.text(indivStLabel,ox+colW*(cP[0]+cP[1]+cP[2]/2),ry+rh-1.3,{align:"center"});
        }
      });
    }

    // DATA
    const tableEnd=rowStartY+maxLen*rh;
    doc.setFillColor(220,228,248);doc.rect(margin,tableEnd+3,28,5.5,"F");
    doc.setDrawColor(150,165,200);doc.setLineWidth(0.4);doc.rect(margin,tableEnd+3,28,5.5,"S");
    doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(0,0,0);
    doc.text("DATA:",margin+2,tableEnd+7.2);
    doc.setFillColor(255,255,255);doc.rect(margin+28,tableEnd+3,40,5.5,"F");doc.rect(margin+28,tableEnd+3,40,5.5,"S");
    doc.text(d,margin+28+20,tableEnd+7.2,{align:"center"});

    // Tabela pościeli
    const linenY=tableEnd+12;
    const etikW=20;const razW=12;
    const usableW=tw-etikW-razW;
    const roomCW=Math.min(usableW/Math.max(linenRooms.length,1),22);
    const actualW=roomCW*linenRooms.length;

    doc.setFillColor(205,215,242);doc.rect(margin,linenY,etikW,5.5,"F");doc.rect(margin,linenY,etikW,5.5,"S");
    doc.setFont("helvetica","bold");doc.setFontSize(7);doc.setTextColor(20,30,100);
    doc.text("POKOJE:",margin+1,linenY+3.8);
    linenRooms.forEach((room,ci)=>{
      const cx2=margin+etikW+ci*roomCW;
      doc.setFillColor(215,222,245);doc.rect(cx2,linenY,roomCW,5.5,"F");doc.rect(cx2,linenY,roomCW,5.5,"S");
      doc.setFont("helvetica","bold");doc.setFontSize(7);doc.setTextColor(0,0,0);
      doc.text(room.no,cx2+roomCW/2,linenY+3.8,{align:"center"});
    });
    const razX=margin+etikW+actualW;
    doc.setFillColor(185,200,235);doc.rect(razX,linenY,razW,5.5,"F");doc.rect(razX,linenY,razW,5.5,"S");
    doc.setFont("helvetica","bold");doc.setFontSize(6.5);doc.setTextColor(20,30,100);
    doc.text("RAZEM",razX+razW/2,linenY+3.8,{align:"center"});

    LINEN.forEach((row,ri2)=>{
      const ry2=linenY+5.5+ri2*5.5;
      const bg=ri2%2===0?[245,248,255]:[255,255,255];
      doc.setFillColor(bg[0],bg[1],bg[2]);doc.rect(margin,ry2,etikW,5.5,"F");doc.rect(margin,ry2,etikW,5.5,"S");
      doc.setFont("helvetica","bold");doc.setFontSize(6.5);doc.setTextColor(0,0,0);
      doc.text(row,margin+1,ry2+3.8);
      linenRooms.forEach((_,ci)=>{
        const cx2=margin+etikW+ci*roomCW;
        doc.setFillColor(bg[0],bg[1],bg[2]);doc.rect(cx2,ry2,roomCW,5.5,"F");doc.rect(cx2,ry2,roomCW,5.5,"S");
      });
      doc.setFillColor(235,240,252);doc.rect(razX,ry2,razW,5.5,"F");doc.rect(razX,ry2,razW,5.5,"S");
    });

    // Ważne uwagi do pokoi (Czas C)
    const myNotes=myRooms.filter(r=>hkNotes[r.no]).map(r=>({no:r.no,note:hkNotes[r.no]}));
    if(myNotes.length){
      const lnEnd=linenY+5.5+LINEN.length*5.5;
      const nY=lnEnd+8;
      doc.setFillColor(255,240,180);doc.rect(margin,nY,tw,6.5,"F");
      doc.setDrawColor(220,170,0);doc.setLineWidth(0.4);doc.rect(margin,nY,tw,6.5,"S");
      doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(0,0,0);
      doc.text("! WAZNE UWAGI DO POKOI:",margin+2,nY+4.5);
      myNotes.forEach((n,idx)=>{
        const y2=nY+6.5+idx*8;
        doc.setFillColor(255,255,255);doc.rect(margin,y2,tw,7.5,"F");doc.rect(margin,y2,tw,7.5,"S");
        doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(150,80,0);
        doc.text(`Pokoj ${n.no}:`,margin+2,y2+5);
        doc.setFont("helvetica","normal");doc.setTextColor(0,0,0);
        doc.text(pl(n.note),margin+24,y2+5);
      });
    }

    const fname=`HK_Indywidualny_${pl(person.name).replace(/\s+/g,"_").replace(/[^a-zA-Z0-9_]/g,"")}_${date}.pdf`;
    savePDF(doc,fname,"hk");
  });
}

function downloadHKCleaningList(date,staff,dutyPersonName,afternoonPerson){
  const doc=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
  const pw=doc.internal.pageSize.getWidth();
  const dow=hkDayOfWeek(date);
  const isFriSat=dow===5||dow===6;
  const dn=pl(dutyPersonName||staff.find(s=>s.isDuty)?.name||"");
  const ap=pl(afternoonPerson||"");
  const margin=10;const tw=pw-margin*2;

  // Nagłówek
  doc.setFillColor(25,55,120);doc.rect(0,0,pw,16,"F");
  doc.setFont("helvetica","bold");doc.setFontSize(15);doc.setTextColor(255,255,255);
  doc.text("LISTA SPRZATANIA RECEPCJI",pw/2,10.5,{align:"center"});
  doc.setFillColor(45,85,165);doc.rect(0,16,pw,8,"F");
  doc.setFontSize(10);doc.setFont("helvetica","normal");
  doc.text("Dzial Housekeeping (HK)",pw/2,21.5,{align:"center"});

  // Data
  doc.setFillColor(190,210,240);doc.rect(0,24,pw,10,"F");
  doc.setFont("helvetica","bold");doc.setFontSize(11);doc.setTextColor(0,0,0);
  doc.text("DATA:",20,30.5);
  doc.setFillColor(255,255,255);doc.rect(42,26,90,7,"F");
  doc.setDrawColor(80,120,190);doc.setLineWidth(0.5);doc.rect(42,26,90,7,"S");
  doc.text(hkFmtDate(date),87,30.5,{align:"center"});
  // Also show date in title area
  doc.setFontSize(9);doc.setFont("helvetica","normal");doc.setTextColor(200,210,230);
  doc.text(hkFmtDate(date),pw-margin-2,13,{align:"right"});

  // Tabela header
  const th=38;const rowH=22;
  const colW=[0.07,0.15,0.37,0.20,0.21]; // lp, czas, osoba, podpis, faktyczna
  doc.setFillColor(45,85,165);doc.rect(margin,th,tw,8,"F");
  doc.setFont("helvetica","bold");doc.setFontSize(9);doc.setTextColor(255,255,255);
  const hLabels=["Lp.","Godzina","Imie osoby sprzatajacej","Podpis","Faktyczna godz."];
  let hx=margin;
  colW.forEach((w,i)=>{doc.text(hLabels[i],hx+tw*w/2,th+5,{align:"center"});hx+=tw*w;});

  const slots=[
    {n:"1",time:"07:30",person:dn},
    {n:"2",time:"10:30",person:isFriSat?dn:ap},
    {n:"3",time:"14:30",person:ap},
    {n:"4",time:"17:30",person:ap},
  ];

  let ry=th+8;
  slots.forEach((slot,i)=>{
    const bg=i%2===0?[215,228,248]:[245,248,255];
    doc.setFillColor(bg[0],bg[1],bg[2]);
    doc.rect(margin,ry,tw,rowH,"F");
    doc.setDrawColor(130,158,210);doc.setLineWidth(0.3);doc.rect(margin,ry,tw,rowH,"S");
    // Linie pionowe
    let vx=margin;
    colW.forEach(w=>{vx+=tw*w;doc.line(vx,ry,vx,ry+rowH);});
    // Numer
    doc.setFont("helvetica","bold");doc.setFontSize(14);doc.setTextColor(25,55,120);
    doc.text(slot.n,margin+tw*colW[0]/2,ry+rowH/2+3,{align:"center"});
    // Czas
    doc.setFontSize(15);doc.text(slot.time,margin+tw*colW[0]+tw*colW[1]/2,ry+rowH/2+3,{align:"center"});
    // Osoba
    doc.setFont("helvetica","normal");doc.setFontSize(12);doc.setTextColor(0,0,0);
    if(slot.person)doc.text(slot.person,margin+tw*(colW[0]+colW[1])+tw*colW[2]/2,ry+rowH/2+3,{align:"center"});
    ry+=rowH;
  });

  // Uwagi
  ry+=4;
  doc.setFillColor(190,210,240);doc.rect(margin,ry,tw,7,"F");
  doc.setDrawColor(130,158,210);doc.rect(margin,ry,tw,7,"S");
  doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(0,0,0);
  doc.text("Uwagi:",margin+3,ry+4.8);
  doc.setFillColor(255,255,255);doc.rect(margin,ry+7,tw,32,"F");doc.rect(margin,ry+7,tw,32,"S");
  if(isFriSat){
    doc.setFont("helvetica","italic");doc.setFontSize(9);doc.setTextColor(80,80,80);
    doc.text("Piatek/Sobota: godz. 10:30 - dyzurny (HK popoludniowe przychodzi o 12:00).",margin+3,ry+15);
  }
  savePDF(doc,`HK_Lista_Sprzatania_${date}.pdf`,"hk");
}

function downloadHKExcel(date,staff,data){
  // W i WP traktujemy tak samo (wyjazd) — zliczamy razem, w komorce wyswietlamy "W"
  const isW=(s)=>s==="W"||s==="WP";
  const mkR=(room)=>{const rd=data[room.no]||{};const bg=room.apt?"background:#d0d5e8;":"";const pLabel=rd.person?pl(rd.person):"";return`<tr style="${bg}"><td>${room.no}</td><td>${rd.roomType||room.type}</td><td>${pLabel}</td><td>${isW(rd.status)?"W":""}</td><td>${rd.status==="PG"?"PG":""}</td><td>${rd.status==="PGZ"?"PGZ":""}</td></tr>`;};
  const html=`<html><head><meta charset="UTF-8"><style>table{border-collapse:collapse;font-family:Arial,sans-serif;font-size:10px}th{background:#1e3c8a;color:#fff;padding:5px 10px;border:1px solid #aaa}td{padding:4px 10px;border:1px solid #ccc}</style></head><body><p style="font-size:14px;font-weight:bold">RAPORT HK - ${hkFmtDate(date)}</p><table><tr><th>Pokój</th><th>Typ</th><th>Osoba</th><th>W</th><th>PG</th><th>PGZ</th></tr>${HK_ALL.map(r=>mkR(r)).join("")}</table><br><table><tr><th>Imię</th><th>Dyżur</th><th>W</th><th>PG</th><th>PGZ</th><th>Suma</th></tr>${staff.map(s=>{const pr=Object.entries(data).filter(([,v])=>v.person===s.name);const wc=pr.filter(([,v])=>isW(v.status)).length;const pgc=pr.filter(([,v])=>v.status==="PG").length;const pgzc=pr.filter(([,v])=>v.status==="PGZ").length;return`<tr><td>${s.name}</td><td>${s.isDuty?"TAK":""}</td><td>${wc||""}</td><td>${pgc||""}</td><td>${pgzc||""}</td><td>${wc+pgc+pgzc}</td></tr>`;}).join("")}</table></body></html>`;
  const blob=new Blob([html],{type:"application/vnd.ms-excel"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`HK_${date}.xls`;a.click();URL.revokeObjectURL(url);
}





function HKPanel({dark,hkDate,setHkDate,hkStaff,setHkStaff,hkData,setHkData,showToast}){
  const [newStaff,setNewStaff]=React.useState("");
  const [hkNotes,setHkNotes]=React.useState(()=>loadJson(STORAGE_KEYS.hkNotes,{}));
  const [noteRoom,setNoteRoom]=React.useState("");
  const [noteText,setNoteText]=React.useState("");
  const [dutyPerson,setDutyPerson]=React.useState("");
  const [afternoonPerson,setAfternoonPerson]=React.useState("");
  const [brMode,setBrMode]=React.useState(false); // brak ręczników — popołudniowa
  const [zsMode,setZsMode]=React.useState(false); // zmiana statusu — popołudniowa
  const [editMode,setEditMode]=React.useState(false); // globalny tryb edycji osób
  const prevDateRef=React.useRef(hkDate);
  React.useEffect(()=>{
    if(prevDateRef.current!==hkDate){
      const prevDate=prevDateRef.current;
      prevDateRef.current=hkDate;
      // Zapisz dane poprzedniego dnia
      setHkData(prev=>{
        saveJson(`hk-data-${prevDate}`,prev);
        // Załaduj dane nowego dnia
        const saved=loadJson(`hk-data-${hkDate}`,null);
        if(saved&&Object.keys(saved).length>0){
          showToast(`Data zmieniona — załadowano dane z ${hkDate}.`,"info");
          return saved;
        }
        // Brak danych dla nowego dnia: zachowaj tylko typy pokoi
        const preserved={};
        Object.entries(prev).forEach(([no,rd])=>{if(rd.roomType)preserved[no]={roomType:rd.roomType};});
        showToast(`Data zmieniona (${hkDate}) — brak zapisanych danych, reset pokoi.`,"info");
        return preserved;
      });
    }
  },[hkDate]);
  const resetHK=()=>{setHkData(prev=>{const p={};Object.entries(prev).forEach(([no,rd])=>{if(rd.roomType)p[no]={roomType:rd.roomType};});return p;});setHkStaff([]);setDutyPerson("");setAfternoonPerson("");showToast("Dane HK zresetowane (typy pokoi zachowane).","info");};

  const setRoom=(no,field,val)=>setHkData(prev=>({...prev,[no]:{...(prev[no]||{}),[field]:val}}));

  // Licznik: pokoje z przypisanym statusem (bez wagi, osobno regular/apt)
  // W = wyjazdy (tylko status W), osobno regular i apt
  const wRegular=React.useMemo(()=>HK_ALL.filter(r=>!r.apt&&(hkData[r.no]?.status==="W"||hkData[r.no]?.status==="WP")).length,[hkData]);
  const wApt=React.useMemo(()=>HK_ALL.filter(r=>r.apt&&(hkData[r.no]?.status==="W"||hkData[r.no]?.status==="WP")).length,[hkData]);
  const totalW=wRegular+wApt;
  const totalPG=React.useMemo(()=>HK_ALL.filter(r=>hkData[r.no]?.status==="PG").length,[hkData]);
  const totalPGZ=React.useMemo(()=>HK_ALL.filter(r=>hkData[r.no]?.status==="PGZ").length,[hkData]);
  const totalBR=React.useMemo(()=>HK_ALL.filter(r=>hkData[r.no]?.br).length,[hkData]);
  const totalZS=React.useMemo(()=>HK_ALL.filter(r=>hkData[r.no]?.zs).length,[hkData]);
  const totalAll=totalW+totalPG+totalPGZ+totalBR+totalZS;
  // Wyjazdy potwierdzone w nocy — dla porannej zmiany
  const nightDepartures=React.useMemo(()=>HK_ALL.filter(r=>hkData[r.no]?.nightVacated).map(r=>({...r,at:hkData[r.no]?.nightVacatedAt,by:hkData[r.no]?.nightVacatedBy})),[hkData]);
  const clearAllNight=()=>{
    setHkData(prev=>{
      const next={...prev};
      Object.keys(next).forEach(no=>{
        if(next[no]?.nightVacated){next[no]={...next[no],nightVacated:false,nightVacatedAt:null,nightVacatedBy:null};}
      });
      return next;
    });
    showToast&&showToast("Wyczyszczono oznaczenia wyjazdów z nocy.","info");
  };

  const capitalize=(s)=>s?s.charAt(0).toUpperCase()+s.slice(1):"";const addStaff=(name)=>{if(!name.trim())return;setHkStaff(prev=>[...prev,{name:capitalize(name.trim())}]);};

  // ── Auto-przypisanie ────────────────────────────────────────────────────────
  // Zasady:
  // 1. Popołudnie (afternoonPerson) dostaje tylko PG i PGZ
  // 2. Poranna obsada dostaje W (+ nadmiarowe PG/PGZ jeśli popołudnia brak)
  // 3. Dyżur dostaje 2-3 pokoje (wagowo) mniej niż reszta
  // 4. Podział SEKWENCYJNY: pierwsze N pokoi → osoba 1, kolejne N → osoba 2 itd.
  // 5. Apartament = 3 przy balansowaniu wagi, ale to 1 wpis w kolejce

  const autoAssign=()=>{
    if(!hkStaff.length){showToast("Dodaj najpierw pracowników HK.","error");return;}
    // Clear all existing person assignments first to avoid stale data
    setHkData(prev=>{
      const next={...prev};
      Object.keys(next).forEach(k=>{if(next[k]?.person)next[k]={...next[k],person:""};});
      return next;
    });

    const wRooms=HK_ALL.filter(r=>hkData[r.no]?.status==="W"||hkData[r.no]?.status==="WP");
    const pgRooms=HK_ALL.filter(r=>hkData[r.no]?.status==="PG"||hkData[r.no]?.status==="PGZ");
    const brRooms=HK_ALL.filter(r=>hkData[r.no]?.br);
    const zsRooms=HK_ALL.filter(r=>hkData[r.no]?.zs);

    if(!wRooms.length&&!pgRooms.length&&!brRooms.length&&!zsRooms.length){
      showToast("Brak pokoi z przypisanym statusem (W/PG/PGZ/BR/ZS).","error");return;
    }

    // Wydziel obsadę poranną (bez osoby popołudniowej)
    const morningStaff=hkStaff.filter(s=>s.name!==afternoonPerson);
    if(!morningStaff.length){showToast("Wszyscy pracownicy są przypisani do popołudnia — dodaj kogoś do porannej.","error");return;}

    const assigned={};

    // ── Popołudnie: PG + PGZ + BR + ZS — wszystko do osoby popołudniowej ──
    // Jeśli PG/PGZ > 20 — nadmiarowe pokoje idą do porannej obsady round-robin
    if(afternoonPerson){
      const PG_LIMIT=20;
      const pgAfternoon=pgRooms.slice(0,PG_LIMIT);
      const pgOverflow=pgRooms.slice(PG_LIMIT);
      pgAfternoon.forEach(r=>{assigned[r.no]=afternoonPerson;});
      // Nadmiarowe PG rozdaj porannej obsadzie round-robin
      if(pgOverflow.length&&morningStaff.length){
        pgOverflow.forEach((r,i)=>{assigned[r.no]=morningStaff[i%morningStaff.length].name;});
      }
      // BR rooms (br=true) — przypisz popołudniową (nawet bez statusu PG/PGZ)
      HK_ALL.filter(r=>hkData[r.no]?.br&&!assigned[r.no]).forEach(r=>{assigned[r.no]=afternoonPerson;});
      // ZS rooms (zs=true) — przypisz popołudniową
      HK_ALL.filter(r=>hkData[r.no]?.zs&&!assigned[r.no]).forEach(r=>{assigned[r.no]=afternoonPerson;});
    }

    // ── Poranna: W pokoje — równy podział ──
    // 1. Apartamenty rozdaj round-robin (każda osoba dostaje po 1 apt)
    // 2. Zwykłe pokoje przypisz w ciągłych blokach żeby nie biegać po piętrach
    if(morningStaff.length&&wRooms.length){
      const n=morningStaff.length;
      const dutyIdx=morningStaff.findIndex(s=>s.name===dutyPerson);
      const DUTY_RATIO=0.7;

      // Rozdziel apt i zwykłe pokoje
      const aptRooms=wRooms.filter(r=>HK_APTS.includes(r.no));
      const regRooms=wRooms.filter(r=>!HK_APTS.includes(r.no));

      // Policz ile pokoi przypada na osobę (bez wag — liczymy pokoje, apt=1 pokój)
      const totalRooms=wRooms.length;
      const rawRatios=morningStaff.map((_,i)=>i===dutyIdx&&dutyIdx>=0?DUTY_RATIO:1.0);
      const ratioSum=rawRatios.reduce((s,v)=>s+v,0);
      const roomTargets=rawRatios.map(v=>Math.max(1,Math.round(v/ratioSum*totalRooms)));

      // ─ Krok 1: apt round-robin — pomijaj dyżurnego dopóki inni nie dostaną swojej porcji
      const aptCounts=new Array(n).fill(0);
      // Kolejność: non-duty najpierw, duty last
      const aptOrder=[...morningStaff.map((_,i)=>i).filter(i=>i!==dutyIdx||(aptRooms.length>morningStaff.filter((_,i)=>i!==dutyIdx).length*Math.ceil(aptRooms.length/n)))];
      if(dutyIdx>=0&&!aptOrder.includes(dutyIdx))aptOrder.push(dutyIdx);
      if(!aptOrder.length)aptOrder.push(...morningStaff.map((_,i)=>i));

      // Rzeczywisty round-robin z pomijaniem dyżurnego
      const nonDuty=morningStaff.map((_,i)=>i).filter(i=>i!==dutyIdx);
      const dutyArr=dutyIdx>=0?[dutyIdx]:[];
      const aptQueue=[...nonDuty,...nonDuty,...dutyArr,...nonDuty,...dutyArr]; // non-duty dostaje pierwszeństwo

      aptRooms.forEach((r,ri)=>{
        const pi=aptQueue[ri%aptQueue.length]??0;
        assigned[r.no]=morningStaff[pi].name;
        aptCounts[pi]++;
      });

      // ─ Krok 2: zwykłe pokoje w ciągłych blokach
      // Przelicz ile zwykłych pokoi każda osoba powinna dostać (target − już przypisane apt)
      const regTargets=morningStaff.map((_,i)=>Math.max(0,roomTargets[i]-aptCounts[i]));
      const regSum=regTargets.reduce((s,v)=>s+v,0);
      // Dopasuj do liczby dostępnych pokoi
      const regAvail=regRooms.length;
      const scale=regSum>0?regAvail/regSum:1;
      const adjTargets=regTargets.map(v=>Math.round(v*scale));
      // Skoryguj zaokrąglenia
      let diff=regAvail-adjTargets.reduce((s,v)=>s+v,0);
      for(let i=0;diff>0&&i<n;i++){adjTargets[i]++;diff--;}
      for(let i=0;diff<0&&i<n;i++){if(adjTargets[i]>0){adjTargets[i]--;diff++;}}

      // Przypisz bloki ciągłe
      let pIdx=0,filled=0;
      regRooms.forEach(r=>{
        while(pIdx<n-1&&filled>=adjTargets[pIdx]){pIdx++;filled=0;}
        assigned[r.no]=morningStaff[pIdx].name;
        filled++;
      });

      // ─ Krok 3: wyrownaj TRPL (105/107/117/119) — max 1 per osoba
      // Te pokoje sa duze (3 lozka) wiec nie chcemy dawac dwoch jednej osobie
      const TRPL_ROOMS=["105","107","117","119"];
      const trplAssigned=TRPL_ROOMS.filter(no=>assigned[no]); // assigned w W
      if(trplAssigned.length){
        const counts={};
        morningStaff.forEach(s=>counts[s.name]=0);
        trplAssigned.forEach(no=>{const p=assigned[no];if(counts[p]!==undefined)counts[p]++;});
        // Przenies nadwyzki: dla osoby z 2+ TRPL, oddaj nadwyzke osobie z 0 (jezeli istnieje)
        for(const no of trplAssigned){
          const owner=assigned[no];
          if(counts[owner]<=1)continue;
          // Znajdz osobe ktora ma 0 TRPL i nie jest dyzurnym (chyba ze tylko dyzurny ma 0)
          const candidates=morningStaff.filter(s=>counts[s.name]===0);
          if(!candidates.length)break;
          // Preferuj non-duty
          const nonDutyCand=candidates.filter(s=>s.name!==dutyPerson);
          const target=(nonDutyCand[0]||candidates[0]).name;
          // Zamien — oddaj target jeden z normal pokoi w zamian (zeby zachowac balans)
          const targetRegRoom=regRooms.find(r=>assigned[r.no]===target&&!TRPL_ROOMS.includes(r.no));
          if(targetRegRoom){
            assigned[targetRegRoom.no]=owner;
          }
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
    showToast(`Przypisano: ${wCount} W + ${pgCount} PG/PGZ${brzsCount?` + ${brzsCount} BR/ZS`:""}.`,"success");
  };

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

  const hkPanelRef=React.useRef(null);

  const RoomRow=React.memo(({room,rdStatus,rdPerson,rdType,rdBR,rdZS,rdNight,brMode,zsMode,editMode,employeeName})=>{
    const isApt=!!room.apt;
    const isSglTwinOnly=HK_ROOMS_SGL_TWIN_ONLY.includes(room.no);
    const [localType,setLocalType]=React.useState(rdType||room.type);
    const [localStatus,setLocalStatus]=React.useState(rdStatus||"");
    const [localBR,setLocalBR]=React.useState(rdBR||false);
    const [localZS,setLocalZS]=React.useState(rdZS||false);
    const [localNight,setLocalNight]=React.useState(!!rdNight);
    const [localWP,setLocalWP]=React.useState(rdStatus==="WP"||false);

    const prevStatus=React.useRef(rdStatus);
    React.useEffect(()=>{
      if(rdStatus!==prevStatus.current){setLocalStatus(rdStatus||"");prevStatus.current=rdStatus;}
    },[rdStatus]);
    const prevBR=React.useRef(rdBR);
    React.useEffect(()=>{if(rdBR!==prevBR.current){setLocalBR(rdBR||false);prevBR.current=rdBR;}},[rdBR]);
    const prevZS=React.useRef(rdZS);
    React.useEffect(()=>{if(rdZS!==prevZS.current){setLocalZS(rdZS||false);prevZS.current=rdZS;}},[rdZS]);
    const prevType=React.useRef(rdType);
    React.useEffect(()=>{
      if(rdType!==prevType.current){setLocalType(rdType||room.type);prevType.current=rdType;}
    },[rdType,room.type]);

    const handleTypeChange=React.useCallback((e)=>{
      const val=e.target.value;setLocalType(val);setRoom(room.no,"roomType",val);
    },[room.no]);
    const handleStatus=React.useCallback((st)=>{
      const next=localStatus===st?"":st;
      setLocalStatus(next);setRoom(room.no,"status",next);
    },[room.no,localStatus]);
    const handleBR=React.useCallback(()=>{const next=!localBR;setLocalBR(next);setRoom(room.no,"br",next);},[room.no,localBR]);
    const handleZS=React.useCallback(()=>{const next=!localZS;setLocalZS(next);setRoom(room.no,"zs",next);},[room.no,localZS]);
    const handleWP=React.useCallback(()=>{const next=localStatus==="WP"?"":"WP";setLocalStatus(next);setRoom(room.no,"status",next);},[room.no,localStatus]);
    const handleNight=React.useCallback(()=>{
      const next=!localNight;
      setLocalNight(next);
      setRoom(room.no,"nightVacated",next);
      if(next){
        setRoom(room.no,"nightVacatedAt",new Date().toISOString());
        setRoom(room.no,"nightVacatedBy",employeeName||"");
      }
    },[room.no,localNight,employeeName]);

    // Opcje typów pokoi
    const typeOptions=isApt
      ?["DBL","2xDBL","TWIN","2xTWIN","D+T","D+T+SOFA","D+T+SOFA 1","D+T+SOFA 2","5xSGL","2xTWIN+SOFA 1","SGL"]
      :isSglTwinOnly
        ?["SGL","TWIN"]
        :HK_SPECIAL_ROOMS.includes(room.no)
          ?["DBL","SGL","TWIN","TRPL","D+S"]
          :["DBL","SGL","TWIN","TRPL"];

    const isW=localStatus==="W"||localStatus==="WP";
    return(
      <div style={{display:"flex",alignItems:"center",gap:4,padding:"5px 6px",borderRadius:6,marginBottom:3,
                   background:localNight?"#E8F5E9":isApt?"#EEEDFE":dark?"rgba(255,255,255,.04)":"var(--bg-card)",
                   border:`${localNight?1.5:0.5}px solid ${localNight?"#2d8659":isApt?"#AFA9EC":dark?"var(--dark-border)":"var(--border-light)"}`}}>
        <div style={{width:40,fontSize:13,fontWeight:700,flexShrink:0,
                     color:localNight?"#2d8659":isApt?"#3C3489":dark?"var(--dark-text)":"var(--text-primary)",
                     display:"flex",alignItems:"center",gap:3}}>
          {room.no}
          {localNight&&<span title={`Wyjazd w nocy · ${rdNight?.at||""} · ${rdNight?.by||""}`} style={{fontSize:10}}>🌙</span>}
        </div>
        <select value={localType} onChange={handleTypeChange}
          style={{width:isApt?90:54,fontSize:11,padding:"2px 3px",borderRadius:4,height:24,flexShrink:0,
                  background:isApt?"#EEEDFE":dark?"rgba(255,255,255,.06)":"var(--bg-secondary)",
                  border:`0.5px solid ${isApt?"#AFA9EC":dark?"var(--dark-border)":"var(--border-light)"}`,
                  color:isApt?"#3C3489":"var(--text-muted)"}}>
          {typeOptions.map(t=><option key={t} value={t}>{t}</option>)}
        </select>
        {/* Osoba: w trybie edycji select, poza nim tylko tekst */}
        {editMode?(
          <select
            value={rdPerson||""}
            onChange={e=>setRoom(room.no,"person",e.target.value)}
            style={{flex:1,fontSize:11,padding:"2px 4px",borderRadius:4,height:24,minWidth:0,
                    background:dark?"rgba(255,255,255,.08)":"#fff",
                    border:`1px solid ${dark?"#a07428":"#c8a050"}`,color:"var(--text-primary)"}}>
            <option value="">— brak —</option>
            {hkStaff.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        ):(
          <div style={{flex:1,fontSize:11,fontWeight:500,
                       color:rdPerson?(dark?"var(--dark-text)":"var(--text-primary)"):(dark?"var(--dark-text-muted)":"var(--text-muted)"),
                       overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",paddingLeft:3,minWidth:0}}>
            {rdPerson||"—"}
          </div>
        )}
        <div style={{display:"flex",gap:2,flexShrink:0}}>
          {["W","W/P","PG","PGZ"].map(st=>{
            const isWP=st==="W/P";
            const active=isWP?(localStatus==="WP"):(localStatus===st);
            const c=isWP?HK_STATUS_COLORS.WP:HK_STATUS_COLORS[st];
            return(<button key={st}
              onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();isWP?handleWP():handleStatus(st);}}
              style={{fontSize:10,padding:"3px 6px",borderRadius:4,border:"0.5px solid",cursor:"pointer",fontWeight:700,
                      background:active?c.bg:(dark?"rgba(255,255,255,.05)":"var(--bg-secondary)"),
                      color:active?c.color:(dark?"var(--dark-text-muted)":"var(--text-muted)"),
                      borderColor:active?c.border:(dark?"var(--dark-border)":"var(--border-light)")}}>
              {st}
            </button>);
          })}
          {brMode&&(<button onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();handleBR();}}
            style={{fontSize:9,padding:"3px 5px",borderRadius:4,border:"0.5px solid",cursor:"pointer",fontWeight:700,
                    background:localBR?HK_STATUS_COLORS.BR.bg:(dark?"rgba(255,255,255,.05)":"var(--bg-secondary)"),
                    color:localBR?HK_STATUS_COLORS.BR.color:(dark?"var(--dark-text-muted)":"var(--text-muted)"),
                    borderColor:localBR?HK_STATUS_COLORS.BR.border:(dark?"var(--dark-border)":"var(--border-light)")}}>BR</button>)}
          {zsMode&&(<button onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();handleZS();}}
            style={{fontSize:9,padding:"3px 5px",borderRadius:4,border:"0.5px solid",cursor:"pointer",fontWeight:700,
                    background:localZS?HK_STATUS_COLORS.ZS.bg:(dark?"rgba(255,255,255,.05)":"var(--bg-secondary)"),
                    color:localZS?HK_STATUS_COLORS.ZS.color:(dark?"var(--dark-text-muted)":"var(--text-muted)"),
                    borderColor:localZS?HK_STATUS_COLORS.ZS.border:(dark?"var(--dark-border)":"var(--border-light)")}}>ZS</button>)}
          {isW&&(<button
            onMouseDown={(e)=>{e.preventDefault();e.stopPropagation();handleNight();}}
            title={localNight?"Cofnij oznaczenie wyjazdu w nocy":"Oznacz jako wyjazd potwierdzony w nocy"}
            style={{fontSize:9,padding:"3px 6px",borderRadius:4,border:"0.5px solid",cursor:"pointer",fontWeight:800,
                    background:localNight?"#DCF0E3":(dark?"rgba(255,255,255,.05)":"var(--bg-secondary)"),
                    color:localNight?"#2d8659":(dark?"var(--dark-text-muted)":"var(--text-muted)"),
                    borderColor:localNight?"#2d8659":(dark?"var(--dark-border)":"var(--border-light)")}}>🌙 NOC</button>)}
        </div>
      </div>
    );
  },
  (prev,next)=>
    prev.rdStatus===next.rdStatus&&
    prev.rdPerson===next.rdPerson&&
    prev.rdType===next.rdType&&
    prev.rdBR===next.rdBR&&
    prev.rdZS===next.rdZS&&
    prev.brMode===next.brMode&&
    prev.zsMode===next.zsMode&&
    prev.editMode===next.editMode
  );

  const FloorCol=React.useCallback(({rooms,title})=>(
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:11,fontWeight:700,color:dark?"var(--dark-text-muted)":"var(--text-muted)",
                   textTransform:"uppercase",letterSpacing:".06em",padding:"4px 0 7px",
                   borderBottom:`0.5px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,marginBottom:5}}>
        {title}
      </div>
      {rooms.map(r=>{const rd=hkData[r.no]||{};return(<RoomRow key={r.no} room={r} rdStatus={rd.status||""} rdPerson={rd.person||""} rdType={rd.roomType||""} rdBR={rd.br||false} rdZS={rd.zs||false} rdNight={rd.nightVacated?{at:rd.nightVacatedAt,by:rd.nightVacatedBy}:null} brMode={brMode} zsMode={zsMode} editMode={editMode} employeeName={""}/>);})}
    </div>
  ),[hkData,dark,brMode,zsMode,editMode]);


  const staffSelect=(value,onChange,label)=>(
    <div>
      <label>{label}</label>
      <select className={inp} value={value} onChange={e=>onChange(e.target.value)} style={{width:160,marginTop:4}}>
        <option value="">— brak —</option>
        {hkStaff.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
      </select>
    </div>
  );

  return(
    <div className="stack">
      {/* Górny panel */}
      <div className={`panel${dark?" dark-panel":""}`}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",flexWrap:"wrap",gap:14}}>
          <div style={{display:"flex",gap:16,flexWrap:"wrap",alignItems:"flex-end"}}>
            <div>
              <label>Data planu HK</label>
              <div style={{display:"flex",gap:6,marginTop:4,alignItems:"center"}}>
                <input className={inp} type="date" value={hkDate} onChange={e=>setHkDate(e.target.value)} style={{width:155}}/>
                <button onClick={resetHK} title="Wyczyść wszystkie dane HK"
                  style={{padding:"5px 9px",borderRadius:"var(--radius-md)",border:"0.5px solid var(--rose)",
                          background:"transparent",color:"var(--rose)",cursor:"pointer",fontSize:11,fontWeight:600,
                          display:"flex",alignItems:"center",gap:4,flexShrink:0}}>
                  <Trash2 size={12}/> Reset
                </button>
              </div>
            </div>
            {/* Dyżurny i popołudnie jako dwa osobne pola */}
            {staffSelect(dutyPerson,setDutyPerson,"Kto ma dyżur")}
            {staffSelect(afternoonPerson,setAfternoonPerson,"Zmiana popołudniowa")}
            {/* Liczniki */}
            <div style={{display:"flex",gap:12,alignItems:"flex-end",paddingBottom:2}}>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:22,fontWeight:700,lineHeight:1,color:"#185FA5"}}>
                  {wRegular}
                  {wApt>0&&<><span style={{fontSize:14,color:"var(--text-muted)",margin:"0 2px"}}>+</span><span style={{fontSize:22}}>{wApt}</span></>}
                </div>
                <div style={{fontSize:10,color:"var(--text-muted)"}}>W{wApt>0?" (pok+apt)":""}</div>
              </div>
              {[["W",totalW,"#185FA5"],["PG",totalPG,"#3B6D11"],["PGZ",totalPGZ,"#854F0B"],["BR",totalBR,"#B91C1C"],["ZS",totalZS,"#7E22CE"]].filter(([,n])=>n>0).map(([l,n,c])=>(
                <div key={l} style={{textAlign:"center",minWidth:32}}>
                  <div style={{fontSize:18,fontWeight:700,color:c,lineHeight:1}}>{n}</div>
                  <div style={{fontSize:10,color:"var(--text-muted)"}}>{l}</div>
                </div>
              ))}
              {totalAll>0&&(
                <div style={{textAlign:"center",minWidth:32}}>
                  <div style={{fontSize:18,fontWeight:700,color:dark?"var(--dark-text)":"var(--text-secondary)",lineHeight:1}}>{totalAll}</div>
                  <div style={{fontSize:10,color:"var(--text-muted)"}}>łącznie</div>
                </div>
              )}
            </div>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",paddingBottom:2}}>
            <button className="btn btn-sky" onClick={autoAssign}><Users size={14}/> Auto-przypisz</button>
            <button className="btn btn-emerald" onClick={genAll}><Download size={14}/> Raporty PDF</button>
            <button className="btn btn-outline" onClick={()=>downloadHKExcel(hkDate,hkStaff,hkData)}><FileDown size={14}/> Excel</button>
          </div>
        </div>
      </div>

      {/* Pracownicy */}
      <div className={`panel${dark?" dark-panel":""}`}>
        <div className="panel-title"><Users size={15}/> Pracownicy HK</div>
        <div style={{display:"flex",gap:8,marginBottom:10}}>
          <input className={inp} placeholder="Imię pracownika HK" id="hk-staff-input"
                 onKeyDown={e=>{if(e.key==="Enter"&&e.target.value.trim()){addStaff(e.target.value);e.target.value="";}}}/>          <button className="btn btn-indigo" onClick={()=>{const el=document.getElementById("hk-staff-input");if(el?.value?.trim()){addStaff(el.value);el.value="";}}}>
            <Plus size={14}/> Dodaj
          </button>
        </div>
        {!hkStaff.length&&<div className={`empty-box${dark?" empty-box-dark":""}`}>Dodaj pracowników HK żeby zacząć.</div>}
        <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
          {hkStaff.map((s,i)=>{
            const myRooms=Object.entries(hkData).filter(([,v])=>v.person===s.name);
                const cntReg=myRooms.filter(([k])=>!HK_APTS.includes(k)).length;
                const cntApt=myRooms.filter(([k])=>HK_APTS.includes(k)).length;
                const cnt=cntReg+cntApt*3;
            const isDuty=s.name===dutyPerson;
            const isAfternoon=s.name===afternoonPerson;
            return(
              <div key={i} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 10px",borderRadius:"var(--radius-md)",
                                    border:`1px solid ${isDuty?"#EF9F27":isAfternoon?"#7dd3fc":dark?"var(--dark-border)":"var(--border-light)"}`,
                                    background:isDuty?"#FAEEDA":isAfternoon?"#f0f9ff":dark?"rgba(255,255,255,.04)":"var(--bg-secondary)"}}>
                <span style={{fontSize:13,fontWeight:600,color:isDuty?"#854F0B":isAfternoon?"#0369a1":dark?"var(--dark-text)":"var(--text-primary)"}}>{s.name}</span>
                <span style={{fontSize:11,color:"var(--text-muted)"}}>
                  ({cntReg>0&&cntApt>0?`${cntReg}+${cntApt}apt`:cntReg>0?cntReg:cntApt>0?`${cntApt}apt`:0})
                </span>
                {isDuty&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:999,background:"#854F0B",color:"#fff",fontWeight:700}}>DYŻ</span>}
                {isAfternoon&&<span style={{fontSize:9,padding:"1px 6px",borderRadius:999,background:"#0369a1",color:"#fff",fontWeight:700}}>POP</span>}
                <button onClick={()=>setHkStaff(prev=>prev.filter((_,j)=>j!==i))}
                  style={{background:"none",border:"none",cursor:"pointer",color:"var(--rose)",display:"flex",padding:2}}>
                  <X size={12}/>
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Wyjazdy potwierdzone w nocy — dla porannej zmiany */}
      {nightDepartures.length>0&&(
        <div className={`panel${dark?" dark-panel":""}`} style={{borderLeft:"4px solid #2d8659",background:dark?"rgba(45,134,89,.08)":"#E8F5E9"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8,flexWrap:"wrap"}}>
            <span style={{fontSize:22}}>🌙</span>
            <div style={{flex:1}}>
              <div style={{fontSize:15,fontWeight:700,color:"#2d8659",fontFamily:"'DM Serif Display',serif"}}>Wyjazdy potwierdzone w nocy</div>
              <div style={{fontSize:12,color:"var(--text-muted)"}}>{nightDepartures.length} {nightDepartures.length===1?"pokój":"pokoi"} — noc już zakończona, sprzątanie może ruszyć</div>
            </div>
            <button onClick={clearAllNight} style={{padding:"4px 10px",borderRadius:6,border:"1px solid #2d8659",background:"transparent",color:"#2d8659",fontSize:11,fontWeight:600,cursor:"pointer"}}>Wyczyść oznaczenia</button>
          </div>
          <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
            {nightDepartures.sort((a,b)=>a.no.localeCompare(b.no)).map(r=>(
              <div key={r.no} title={r.at?`${new Date(r.at).toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"})}${r.by?" · "+r.by:""}`:""}
                style={{padding:"5px 10px",borderRadius:6,background:"#fff",border:"1.5px solid #2d8659",fontSize:13,fontWeight:700,color:"#1e6040"}}>
                {r.no}{r.apt&&<span style={{fontSize:9,marginLeft:4,color:"#3C3489"}}>APT</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Siatka pokoi */}
      <div className={`panel${dark?" dark-panel":""}`} ref={hkPanelRef}>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
          <span style={{background:"#EEEDFE",border:"1px solid #AFA9EC",borderRadius:4,padding:"1px 7px",color:"#3C3489",fontSize:10,fontWeight:600}}>APT</span>
          <span style={{fontSize:11,color:"var(--text-muted)"}}>Apartamenty liczone jako 3 pokoje przy przypisaniu</span>
          <div style={{marginLeft:"auto",display:"flex",gap:6}}>
            <button onMouseDown={(e)=>{e.preventDefault();setBrMode(v=>!v);}}
              style={{padding:"3px 10px",borderRadius:4,border:`1.5px solid ${brMode?"#FCA5A5":"var(--border-light)"}`,cursor:"pointer",
                      fontWeight:700,fontSize:11,background:brMode?"#FFF0F0":"transparent",
                      color:brMode?"#B91C1C":"var(--text-muted)"}}>
              BR — brak ręczników
            </button>
            <button onMouseDown={(e)=>{e.preventDefault();setZsMode(v=>!v);}}
              style={{padding:"3px 10px",borderRadius:4,border:`1.5px solid ${zsMode?"#D8B4FE":"var(--border-light)"}`,cursor:"pointer",
                      fontWeight:700,fontSize:11,background:zsMode?"#FDF4FF":"transparent",
                      color:zsMode?"#7E22CE":"var(--text-muted)"}}>
              ZS — zmiana statusu
            </button>
            <button onMouseDown={(e)=>{e.preventDefault();setEditMode(v=>!v);}}
              style={{padding:"3px 10px",borderRadius:4,border:`1.5px solid ${editMode?"#6EE7B7":"var(--border-light)"}`,cursor:"pointer",
                      fontWeight:700,fontSize:11,background:editMode?"rgba(16,185,129,.1)":"transparent",
                      color:editMode?"#059669":"var(--text-muted)"}}>
              {editMode?"✓ Tryb edycji":"Edytuj osoby"}
            </button>
          </div>
        </div>
        <div style={{display:"flex",gap:14}}>
          <FloorCol rooms={HK_FLOOR1} title="Pietro 1"/>
          <FloorCol rooms={HK_FLOOR2} title="Piętro 2"/>
          <FloorCol rooms={HK_FLOOR3} title="Piętro 3"/>
        </div>
      </div>

      {/* Notatki do pokoi — "Czas C" */}
      <div className={`panel${dark?" dark-panel":""}`}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10,flexWrap:"wrap",gap:8}}>
          <div className="panel-title" style={{margin:0}}>
            <MessageSquare size={14}/> Uwagi do pokoi
          </div>
          <div style={{fontSize:11,color:"var(--text-muted)"}}>Ważna informacja pojawi się tylko w raporcie indywidualnym danego pracownika</div>
        </div>
        <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end",marginBottom:10}}>
          <div>
            <label>Pokój</label>
            <select className={inp} value={noteRoom} onChange={e=>setNoteRoom(e.target.value)} style={{width:100,marginTop:4}}>
              <option value="">— wybierz —</option>
              {HK_ALL.map(r=><option key={r.no} value={r.no}>{r.no}</option>)}
            </select>
          </div>
          <div style={{flex:1,minWidth:180}}>
            <label>Uwaga / notatka</label>
            <input className={inp} value={noteText} onChange={e=>setNoteText(e.target.value)}
              placeholder="Np. donies lozeczko, przyjezdza Czeslaw..."
              style={{marginTop:4,width:"100%"}}
              onKeyDown={e=>{if(e.key==="Enter"&&noteRoom&&noteText.trim()){const n={...hkNotes,[noteRoom]:noteText.trim()};setHkNotes(n);saveJson(STORAGE_KEYS.hkNotes,n);setNoteRoom("");setNoteText("");}}}/>
          </div>
          <button className="btn btn-amber" disabled={!noteRoom||!noteText.trim()}
            onClick={()=>{if(!noteRoom||!noteText.trim())return;const n={...hkNotes,[noteRoom]:noteText.trim()};setHkNotes(n);saveJson(STORAGE_KEYS.hkNotes,n);setNoteRoom("");setNoteText("");showToast(`Uwaga do pokoju ${noteRoom} zapisana.`,"success");}}>
            <Plus size={13}/> Zapisz
          </button>
        </div>
        {Object.keys(hkNotes).length>0?(
          <div style={{display:"flex",flexWrap:"wrap",gap:7}}>
            {Object.entries(hkNotes).sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([no,note])=>(
              <div key={no} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 12px",borderRadius:8,background:"#FFF7ED",border:"1px solid #FED7AA",maxWidth:320}}>
                <span style={{fontWeight:800,fontSize:13,color:"#9A3412",flexShrink:0}}>Pokój {no}</span>
                <span style={{fontSize:12,color:"#7c3009",flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{note}</span>
                <button onClick={()=>{const n={...hkNotes};delete n[no];setHkNotes(n);saveJson(STORAGE_KEYS.hkNotes,n);}}
                  style={{background:"none",border:"none",cursor:"pointer",color:"#B91C1C",display:"flex",padding:2,flexShrink:0}}>
                  <X size={11}/>
                </button>
              </div>
            ))}
          </div>
        ):(
          <div style={{fontSize:12,color:"var(--text-muted)"}}>Brak uwag — dodaj notatkę do konkretnego pokoju.</div>
        )}
      </div>
    </div>
  );
}



// ─── WIADOMOŚCI DO KIEROWNIKA ─────────────────────────────────────────────────
function MessageModal({onClose,employeeName,employees,messages,setMessages,dark}){
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

        {/* Typ wiadomości */}
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

        {/* Nadawca — tylko gdy niezalogowany */}
        {!employeeName&&(
          <div style={{marginBottom:12}}>
            <label>Twoje imię</label>
            <select className={inp} value={sender} onChange={e=>setSender(e.target.value)} style={{marginTop:4}}>
              <option value="">— wybierz —</option>
              {employees.map(e=><option key={e} value={e}>{e}</option>)}
            </select>
          </div>
        )}

        {/* Treść */}
        <div style={{marginBottom:16}}>
          <label>{msgType==="bug"?"Opisz problem":"Treść wiadomości"}</label>
          <textarea className={inp}
            placeholder={msgType==="bug"?
              "Np. Po kliknięciu X program się zawiesza, nie można zapisać zmiany…":
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

function AdminMessagesPanel({messages,setMessages,dark}){
  const unread=messages.filter(m=>!m.readByAdmin);
  const markAllRead=()=>{
    const updated=messages.map(m=>({...m,readByAdmin:true}));
    setMessages(updated);
    localStorage.setItem("reception-messages",JSON.stringify(updated));
  };
  const deleteMsg=(id)=>{
    const updated=messages.filter(m=>m.id!==id);
    setMessages(updated);
    localStorage.setItem("reception-messages",JSON.stringify(updated));
  };
  // Mark as read when panel is opened
  React.useEffect(()=>{
    if(unread.length>0){
      const updated=messages.map(m=>({...m,readByAdmin:true}));
      setMessages(updated);
      localStorage.setItem("reception-messages",JSON.stringify(updated));
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


// ─── PARKING ─────────────────────────────────────────────────────────────────
const STORAGE_KEY_PARKING = "reception-parking";

const DEFAULT_PARKING = [
  // Pracownicy hotelu
  {id:"p-1",plate:"RT55807",name:"Natalia Szymańska",phone:"",type:"pracownik",status:"Conrad",paidTo:"",paidOn:"",docNr:"",note:"Recepcjonistka",active:true},
  {id:"p-2",plate:"KK7283C",name:"Tetiana Tymoshenko",phone:"795 009 296",type:"pracownik",status:"Housekeeping",paidTo:"",paidOn:"",docNr:"",note:"",active:true},
  {id:"p-3",plate:"BE8018CA",name:"Anastasiia Pidberezniak",phone:"",type:"pracownik",status:"HK",paidTo:"",paidOn:"",docNr:"",note:"",active:true},
  {id:"p-4",plate:"KR 8M740",name:"Witkoś",phone:"501095515",type:"pracownik",status:"Conrad",paidTo:"",paidOn:"",docNr:"",note:"Pozwolenie od właściciela",active:true},
  {id:"p-5",plate:"KGR8XH1",name:"Jan Szczepaniec",phone:"",type:"pracownik",status:"Conrad",paidTo:"",paidOn:"",docNr:"",note:"Od szefów",active:true},
  {id:"p-6",plate:"KTA3295H",name:"Bartosz Dudowicz",phone:"",type:"pracownik",status:"Conrad",paidTo:"",paidOn:"",docNr:"",note:"",active:true},
  {id:"p-7",plate:"KN75526",name:"Oliwier Kowalik",phone:"",type:"pracownik",status:"Conrad",paidTo:"",paidOn:"",docNr:"",note:"",active:true},
  // Abonament - firmy / biura
  {id:"p-8",plate:"WN4740N",name:"Damian Myśliwski (CFE Polska)",phone:"697901416",type:"abonament",status:"Comfort wewnętrzny",paidTo:"2025-08-31",paidOn:"2021-08-03",docNr:"FV",note:"Faktura co miesiąc na początku - CFE POLSKA",active:true},
  {id:"p-9",plate:"WF1925X",name:"Agata Otfinowska",phone:"601132204",type:"abonament",status:"Os. prywatna",paidTo:"2025-08-31",paidOn:"2025-07-23",docNr:"FS 174/CC/07/2025",note:"250 zł/miesiąc od 1 do 31",active:true},
  {id:"p-10",plate:"KPR8Y53",name:"Natkaniec Monika",phone:"690 671 884",type:"abonament",status:"Os. prywatna - z osiedla",paidTo:"2026-03-15",paidOn:"2026-02-04",docNr:"PA 99/02/26",note:"250 zł/mies. od 15 do 15",active:true},
  {id:"p-11",plate:"KBR8RA4",name:"Michał Faron",phone:"",type:"abonament",status:"Os. prywatna - z osiedla",paidTo:"2026-03-15",paidOn:"2026-02-09",docNr:"PA 200/02/2026",note:"250 zł/mies. od 15 do 15",active:true},
  // NORCONSULT
  {id:"p-12",plate:"SC1961R",name:"Piotr Sułkowski",phone:"",type:"pracownik",status:"NORCONSULT",paidTo:"",paidOn:"",docNr:"",note:"",active:true},
  {id:"p-13",plate:"KK3956T",name:"Zuzanna Fedczyna",phone:"",type:"pracownik",status:"NORCONSULT",paidTo:"",paidOn:"",docNr:"",note:"",active:true},
  {id:"p-14",plate:"KK01903",name:"Aleksandra Dzięgielewska",phone:"",type:"pracownik",status:"NORCONSULT",paidTo:"",paidOn:"",docNr:"",note:"",active:true},
  {id:"p-15",plate:"LBL79099",name:"Beata Górka",phone:"",type:"pracownik",status:"NORCONSULT",paidTo:"",paidOn:"",docNr:"",note:"",active:true},
  // Inne firmy
  {id:"p-16",plate:"WU5450M",name:"Anna Markowska",phone:"",type:"pracownik",status:"Gabinet Doktor Green",paidTo:"",paidOn:"",docNr:"",note:"",active:true},
  {id:"p-17",plate:"AH5009IE",name:"Sokolova Mariya",phone:"+380 93 656 1025",type:"abonament",status:"Klient zewnętrzny",paidTo:"2025-09-11",paidOn:"2025-08-30",docNr:"PA 495/08/2025",note:"12 x 50 zł = 600 PLN",active:false},
  {id:"p-18",plate:"KA7867IT",name:"Aleksey Lukashenko",phone:"38067977288",type:"krotki",status:"Os. prywatna",paidTo:"2025-07-12",paidOn:"2025-07-01",docNr:"PA 5/07/2025",note:"600 zł",active:false},
];

// ─── KWHotel ──────────────────────────────────────────────────────────────────
const KWH_CREDS_KEY = "reception-kwhotel-creds"; // {username, password} — tylko lokalnie

function KWHotelAdminPanel({dark, showToast}) {
  const saved = React.useMemo(()=>{try{return JSON.parse(localStorage.getItem(KWH_CREDS_KEY)||"{}");}catch{return {};}}, []);
  const [user, setUser] = React.useState(saved.username||"");
  const [pass, setPass] = React.useState(saved.password||"");
  const [testing, setTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState(null);

  const saveCreds = () => {
    if (!user.trim()) { showToast("Wpisz login KWHotel.","error"); return; }
    localStorage.setItem(KWH_CREDS_KEY, JSON.stringify({username:user.trim(), password:pass}));
    showToast("Dane logowania zapisane lokalnie.","success");
  };

  const clearCreds = () => {
    localStorage.removeItem(KWH_CREDS_KEY);
    setUser(""); setPass(""); setTestResult(null);
    showToast("Dane logowania usunięte.","info");
  };

  const runTest = async () => {
    if (!user.trim()) { showToast("Wpisz login KWHotel.","error"); return; }
    if (!window.electronAPI?.kwhotelTest) { showToast("Dostępne tylko w zainstalowanej aplikacji (nie w przeglądarce).","warning"); return; }
    setTesting(true); setTestResult(null);
    const r = await window.electronAPI.kwhotelTest({username:user.trim(), password:pass});
    setTesting(false); setTestResult(r);
    if (r.ok) showToast("Połączenie nawiązano — sprawdź wyniki diagnostyki.","success");
    else showToast("Błąd połączenia — sprawdź dane logowania.","error");
  };

  return (
    <div className="stack">
      <div className="panel glass dark-panel">
        <div className="panel-title"><TrendingUp size={16}/> KWHotel — dane logowania API</div>
        <div style={{fontSize:12,color:"#948e85",marginBottom:14,lineHeight:1.6}}>
          Dane logowania są przechowywane <strong style={{color:"#c8a050"}}>tylko na tym komputerze</strong> (localStorage) — nigdy nie trafiają do kodu ani GitHub.
          Wpisz login i hasło do <strong>cloud.kwhotel.com</strong>.
        </div>
        <div style={{display:"grid",gap:10,maxWidth:420}}>
          <div>
            <label style={{color:"#948e85"}}>Login (email)</label>
            <input className="input dark-admin-entry" placeholder="np. recepcja@hotel.pl" value={user} onChange={e=>setUser(e.target.value)} autoComplete="off"/>
          </div>
          <div>
            <label style={{color:"#948e85"}}>Hasło</label>
            <input className="input dark-admin-entry" type="password" placeholder="••••••••" value={pass} onChange={e=>setPass(e.target.value)} autoComplete="new-password"/>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            <button className="btn btn-amber" onClick={saveCreds}>Zapisz lokalnie</button>
            <button className="btn btn-sky" onClick={runTest} disabled={testing}>
              {testing?"Testuję…":"Test połączenia"}
            </button>
            {(user||pass)&&<button className="btn btn-danger-outline" onClick={clearCreds}>Usuń dane</button>}
          </div>
        </div>
      </div>

      {testResult&&(
        <div className="panel glass dark-panel">
          <div className="panel-title" style={{color:testResult.ok?"#34d399":"#f87171"}}>
            {testResult.ok?"✓ Zalogowano pomyślnie":"✗ Błąd logowania"} — Diagnostyka
          </div>

          {/* Komunikat podpowiedzi */}
          {testResult.loginResult?.hint&&(
            <div style={{padding:"9px 12px",borderRadius:8,background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",color:"#f59e0b",fontSize:12.5,marginBottom:12}}>
              {testResult.loginResult.hint}
            </div>
          )}

          {/* Sukces logowania */}
          {testResult.loginResult?.ok&&(
            <div style={{padding:"9px 12px",borderRadius:8,background:"rgba(52,211,153,.08)",border:"1px solid rgba(52,211,153,.25)",color:"#34d399",fontSize:12.5,marginBottom:12}}>
              Zalogowano przez <strong>{testResult.loginResult.endpoint}</strong> [{testResult.loginResult.format}]
              {testResult.loginResult.token&&" · token JWT uzyskany"}
              {testResult.loginResult.cookie&&" · cookie sesji ustawione"}
            </div>
          )}

          {/* Tabela prób logowania */}
          {testResult.loginResult?.attempts&&(
            <div style={{marginBottom:14}}>
              <div style={{fontSize:11,color:"#948e85",marginBottom:6,textTransform:"uppercase",letterSpacing:".06em"}}>Próby logowania ({testResult.loginResult.attempts.length})</div>
              <div style={{display:"grid",gap:3}}>
                {testResult.loginResult.attempts.map((a,i)=>{
                  const isOk   = a.ok;
                  const isAuth = a.status===401||a.status===403;
                  const isErr  = a.error;
                  const bg = isOk?"rgba(52,211,153,.08)":isAuth?"rgba(245,158,11,.08)":"rgba(255,255,255,.02)";
                  const bc = isOk?"rgba(52,211,153,.3)":isAuth?"rgba(245,158,11,.3)":"rgba(255,255,255,.06)";
                  const col= isOk?"#34d399":isAuth?"#f59e0b":"#484f58";
                  return(
                    <div key={i} style={{display:"grid",gridTemplateColumns:"36px 50px 1fr",gap:8,alignItems:"center",padding:"5px 10px",borderRadius:6,background:bg,border:`1px solid ${bc}`}}>
                      <span style={{fontSize:11,fontWeight:700,color:col}}>{a.status||"ERR"}</span>
                      <span style={{fontSize:10,color:"#635e57",fontWeight:600}}>{a.ct||""}</span>
                      <span style={{fontSize:10.5,color:"#8b949e",fontFamily:"monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{a.url||a.error}</span>
                    </div>
                  );
                })}
              </div>
              {/* Pokaż odpowiedź serwera dla pierwszej próby z odpowiedzią */}
              {(()=>{
                const a = testResult.loginResult.attempts.find(x=>x.body&&x.body.length>0);
                if(!a) return null;
                return(
                  <div style={{marginTop:8}}>
                    <div style={{fontSize:10,color:"#f59e0b",marginBottom:3,fontWeight:600}}>Odpowiedź serwera (HTTP {a.status}) — {a.url}:</div>
                    <pre style={{fontSize:11,color:"#e6edf3",background:"rgba(0,0,0,.4)",borderRadius:6,padding:"10px 12px",maxHeight:180,overflow:"auto",whiteSpace:"pre-wrap",wordBreak:"break-all",margin:0,border:"1px solid rgba(245,158,11,.2)"}}>{a.body}</pre>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Sondowanie endpointów danych */}
          {testResult.probes&&(
            <div>
              <div style={{fontSize:11,color:"#948e85",marginBottom:6,textTransform:"uppercase",letterSpacing:".06em"}}>Sondowanie endpointów danych</div>
              <div style={{display:"grid",gap:3}}>
                {testResult.probes.map((p,i)=>(
                  <div key={i} style={{display:"flex",gap:10,alignItems:"center",padding:"5px 10px",borderRadius:6,background:p.ok?"rgba(52,211,153,.08)":"rgba(255,255,255,.02)",border:`1px solid ${p.ok?"rgba(52,211,153,.25)":"rgba(255,255,255,.06)"}`}}>
                    <span style={{fontSize:11,fontWeight:700,color:p.ok?"#34d399":"#484f58",flexShrink:0,width:32}}>{p.status}</span>
                    <span style={{fontSize:11,color:"#8b949e",fontFamily:"monospace",flex:1}}>{p.path}</span>
                    {p.ok&&<span style={{fontSize:10,color:"#34d399",flexShrink:0,fontWeight:700}}>OK</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {testResult.error&&<div style={{fontSize:12,color:"#f87171",marginTop:8}}>{testResult.error}</div>}
        </div>
      )}
    </div>
  );
}

// ─── KWHotel Panel (zakładka pracownika) ──────────────────────────────────────
const KWH_REFRESH_SEC = 60; // auto-odświeżanie co 60 sekund

function KWHotelPanel({dark, hkData, setHkData}) {
  const todayStr = new Date().toISOString().split("T")[0];
  const [date, setDate] = React.useState(todayStr);
  const [loading, setLoading] = React.useState(false);
  const [arrivals, setArrivals] = React.useState(null);
  const [departures, setDepartures] = React.useState(null);
  const [rooms, setRooms] = React.useState(null);
  const [error, setError] = React.useState("");
  const [lastFetch, setLastFetch] = React.useState(null);
  const [nextRefresh, setNextRefresh] = React.useState(KWH_REFRESH_SEC);
  const [hkUpdated, setHkUpdated] = React.useState([]); // numery pokoi auto-zaktualizowanych

  const hasCreds = React.useMemo(()=>{
    try{const c=JSON.parse(localStorage.getItem(KWH_CREDS_KEY)||"{}");return !!(c.username&&c.password);}catch{return false;}
  },[]);

  const getCreds = ()=>{try{return JSON.parse(localStorage.getItem(KWH_CREDS_KEY)||"{}");}catch{return {};}};

  const roomNo = (item) => String(item.room_number||item.roomNumber||item.room||item.roomNo||item.room_no||"").trim();

  // Po pobraniu wyjazdów — automatycznie ustaw status W w HK dla pokoi bez statusu
  const applyDeparturesToHK = React.useCallback((depList) => {
    if (!depList||!depList.length||!setHkData) return [];
    const updated = [];
    setHkData(prev => {
      const next = {...prev};
      depList.forEach(item => {
        const no = roomNo(item);
        if (!no||no==="undefined") return;
        // Ustaw W tylko jeśli pokój istnieje w HK i nie ma jeszcze statusu
        const inHK = HK_ALL.some(r=>r.no===no);
        if (inHK && !prev[no]?.status) {
          next[no] = {...(prev[no]||{}), status:"W"};
          updated.push(no);
        }
      });
      return next;
    });
    return updated;
  }, [setHkData]);

  const fetchAll = React.useCallback(async () => {
    if (!window.electronAPI?.kwhotelArrivals) {
      setError("Dostępne tylko w zainstalowanej aplikacji Electron.");
      return;
    }
    if (!hasCreds) {
      setError("Brak danych logowania KWHotel — kierownik musi je ustawić w panelu KWHotel API.");
      return;
    }
    setLoading(true); setError("");
    try {
      const creds = getCreds();
      await window.electronAPI.kwhotelLogin(creds);
      const [a, d, r] = await Promise.all([
        window.electronAPI.kwhotelArrivals({date}),
        window.electronAPI.kwhotelDepartures({date}),
        window.electronAPI.kwhotelRooms({date}),
      ]);
      setArrivals(a);
      setDepartures(d);
      setRooms(r);
      setLastFetch(new Date().toLocaleTimeString("pl-PL"));
      setNextRefresh(KWH_REFRESH_SEC);
      // Auto-aktualizacja HK
      const depList = parseKwhList(d);
      if (depList) {
        const upd = [];
        setHkData && setHkData(prev => {
          const next = {...prev};
          depList.forEach(item => {
            const no = roomNo(item);
            if (!no||no==="undefined") return;
            const inHK = HK_ALL.some(r=>r.no===no);
            if (inHK && !prev[no]?.status) {
              next[no] = {...(prev[no]||{}), status:"W"};
              upd.push(no);
            }
          });
          return next;
        });
        setHkUpdated(upd);
      }
    } catch(e) {
      setError("Błąd połączenia: "+e.message);
    }
    setLoading(false);
  }, [date, hasCreds, setHkData]);

  // Pierwsze pobranie + co zmianę daty
  React.useEffect(()=>{ fetchAll(); }, [date]);

  // Auto-odświeżanie co minutę + odliczanie
  React.useEffect(()=>{
    const tick = setInterval(()=>{
      setNextRefresh(n=>{
        if(n<=1){ fetchAll(); return KWH_REFRESH_SEC; }
        return n-1;
      });
    },1000);
    return ()=>clearInterval(tick);
  },[fetchAll]);

  function parseKwhList(result) {
    if (!result?.ok) return null;
    const d = result.data;
    if (!d) return null;
    if (Array.isArray(d)) return d;
    const keys = Object.keys(d);
    for (const k of keys) { if (Array.isArray(d[k])) return d[k]; }
    return null;
  }

  const arr = parseKwhList(arrivals);
  const dep = parseKwhList(departures);
  const rms = parseKwhList(rooms);

  const panelStyle = {background:dark?"var(--dark-card)":"var(--bg-card)", border:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`, borderRadius:14, padding:20};
  const hdStyle = {fontSize:13,fontWeight:700,marginBottom:12,display:"flex",alignItems:"center",gap:7,color:dark?"var(--dark-text)":"var(--text-primary)"};
  const rowStyle = {padding:"8px 12px",borderRadius:8,border:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,marginBottom:5,fontSize:13,color:dark?"var(--dark-text)":"var(--text-primary)",background:dark?"rgba(255,255,255,.03)":"var(--bg-secondary)"};

  const guestName = (item) => item.guest_name||item.guestName||item.name||item.lastName||item.surname||(item.guest?.name)||"—";
  const timeStr   = (item) => item.time||item.hour||item.arrival_time||item.departure_time||item.checkIn||item.checkOut||"";
  const persons   = (item) => item.persons||item.guests||item.adults||item.pax||"";
  const noteStr   = (item) => item.note||item.notes||item.comment||item.remarks||"";

  return (
    <div style={{display:"grid",gap:14}}>
      {/* Toolbar */}
      <div style={{display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)}
          style={{padding:"7px 10px",borderRadius:8,border:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,background:dark?"rgba(255,255,255,.05)":"var(--bg-card)",color:dark?"var(--dark-text)":"var(--text-primary)",fontSize:13}}/>
        <button onClick={fetchAll} disabled={loading}
          style={{display:"flex",alignItems:"center",gap:6,padding:"7px 14px",borderRadius:8,border:"none",background:"#a07428",color:"#fff",fontWeight:700,fontSize:12.5,cursor:loading?"not-allowed":"pointer",opacity:loading?.6:1}}>
          <RefreshCw size={13}/> {loading?"Pobieranie…":"Odśwież"}
        </button>
        {lastFetch&&<span style={{fontSize:11,color:dark?"#484f58":"var(--text-muted)"}}>Ostatnie: {lastFetch} · Kolejne za {nextRefresh}s</span>}
        {!hasCreds&&<span style={{fontSize:11.5,color:"#f87171",fontWeight:600}}>⚠ Brak konfiguracji — kierownik musi ustawić dane logowania</span>}
      </div>

      {error&&<div style={{padding:"10px 14px",borderRadius:10,background:"rgba(190,18,60,.08)",border:"1px solid rgba(190,18,60,.25)",color:"#f87171",fontSize:13}}>{error}</div>}

      {hkUpdated.length>0&&(
        <div style={{padding:"9px 14px",borderRadius:10,background:"rgba(52,211,153,.08)",border:"1px solid rgba(52,211,153,.25)",color:"#34d399",fontSize:12.5,display:"flex",alignItems:"center",gap:7}}>
          <CheckSquare size={13}/> Automatycznie oznaczono jako <strong>W (wyjazd)</strong> w HK: pokoje {hkUpdated.join(", ")}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14}}>
        {/* Przyjazdy */}
        <div style={panelStyle}>
          <div style={hdStyle}><span style={{fontSize:18}}>🏨</span> Przyjazdy {arr&&<span style={{marginLeft:"auto",fontSize:11,fontWeight:400,color:"#34d399",background:"rgba(52,211,153,.1)",padding:"2px 8px",borderRadius:999}}>{arr.length}</span>}</div>
          {!arrivals&&!loading&&<div style={{fontSize:12,color:dark?"#484f58":"var(--text-muted)"}}>Brak danych.</div>}
          {loading&&<div style={{fontSize:12,color:dark?"#484f58":"var(--text-muted)"}}>Pobieranie…</div>}
          {arrivals&&!arrivals.ok&&<div style={{fontSize:11.5,color:"#f87171"}}>Błąd: HTTP {arrivals.status}<br/><code style={{fontSize:10,wordBreak:"break-all"}}>{arrivals.raw}</code></div>}
          {arr&&arr.length===0&&<div style={{fontSize:12,color:dark?"#484f58":"var(--text-muted)"}}>Brak przyjazdów na ten dzień.</div>}
          {arr&&arr.map((item,i)=>(
            <div key={i} style={rowStyle}>
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:2}}>
                <span style={{fontWeight:800,fontSize:15,minWidth:36,color:"#a07428"}}>{roomNo(item)||"—"}</span>
                <span style={{fontWeight:600}}>{guestName(item)}</span>
                {timeStr(item)&&<span style={{marginLeft:"auto",fontSize:11,color:dark?"#484f58":"var(--text-muted)"}}>{timeStr(item)}</span>}
              </div>
              {(persons(item)||noteStr(item))&&<div style={{fontSize:11,color:dark?"#635e57":"var(--text-muted)"}}>{persons(item)?`${persons(item)} os. `:""}{noteStr(item)}</div>}
            </div>
          ))}
        </div>

        {/* Wyjazdy */}
        <div style={panelStyle}>
          <div style={hdStyle}><span style={{fontSize:18}}>🚪</span> Wyjazdy {dep&&<span style={{marginLeft:"auto",fontSize:11,fontWeight:400,color:"#f87171",background:"rgba(190,18,60,.1)",padding:"2px 8px",borderRadius:999}}>{dep.length}</span>}</div>
          {!departures&&!loading&&<div style={{fontSize:12,color:dark?"#484f58":"var(--text-muted)"}}>Brak danych.</div>}
          {loading&&<div style={{fontSize:12,color:dark?"#484f58":"var(--text-muted)"}}>Pobieranie…</div>}
          {departures&&!departures.ok&&<div style={{fontSize:11.5,color:"#f87171"}}>Błąd: HTTP {departures.status}<br/><code style={{fontSize:10,wordBreak:"break-all"}}>{departures.raw}</code></div>}
          {dep&&dep.length===0&&<div style={{fontSize:12,color:dark?"#484f58":"var(--text-muted)"}}>Brak wyjazdów na ten dzień.</div>}
          {dep&&dep.map((item,i)=>{
            const no = roomNo(item);
            const autoMarked = hkData&&hkData[no]?.status==="W";
            return(
              <div key={i} style={{...rowStyle, borderColor:autoMarked?"rgba(190,18,60,.35)":undefined}}>
                <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:2}}>
                  <span style={{fontWeight:800,fontSize:15,minWidth:36,color:"#be123c"}}>{no||"—"}</span>
                  <span style={{fontWeight:600}}>{guestName(item)}</span>
                  {autoMarked&&<span style={{fontSize:10,padding:"1px 6px",borderRadius:999,background:"rgba(190,18,60,.12)",color:"#f87171",fontWeight:700,marginLeft:4}}>W</span>}
                  {timeStr(item)&&<span style={{marginLeft:"auto",fontSize:11,color:dark?"#484f58":"var(--text-muted)"}}>{timeStr(item)}</span>}
                </div>
                {(persons(item)||noteStr(item))&&<div style={{fontSize:11,color:dark?"#635e57":"var(--text-muted)"}}>{persons(item)?`${persons(item)} os. `:""}{noteStr(item)}</div>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Status pokoi */}
      {(rooms||loading)&&(
        <div style={panelStyle}>
          <div style={hdStyle}><span style={{fontSize:18}}>🏠</span> Status pokoi {rms&&<span style={{marginLeft:"auto",fontSize:11,fontWeight:400,color:"#60a5fa",background:"rgba(96,165,250,.1)",padding:"2px 8px",borderRadius:999}}>{rms.length} pokoi</span>}</div>
          {loading&&<div style={{fontSize:12,color:dark?"#484f58":"var(--text-muted)"}}>Pobieranie…</div>}
          {rooms&&!rooms.ok&&<div style={{fontSize:11.5,color:"#f87171"}}>Błąd: HTTP {rooms.status}<br/><code style={{fontSize:10,wordBreak:"break-all"}}>{rooms.raw}</code></div>}
          {rms&&(
            <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
              {rms.map((item,i)=>{
                const no = roomNo(item);
                const status = (item.status||item.room_status||item.housekeeping_status||"").toLowerCase();
                const isPGZ  = status.includes("pgz")||status.includes("przy_gosciu")||status.includes("occupied_task");
                const isDep  = status.includes("wyjazd")||status.includes("departure")||status.includes("checkout");
                const isClean= status.includes("czysty")||status.includes("clean")||status.includes("pg")||status.includes("ready");
                const bg = isPGZ?"rgba(245,158,11,.15)":isDep?"rgba(190,18,60,.12)":isClean?"rgba(52,211,153,.1)":"rgba(255,255,255,.04)";
                const bc = isPGZ?"rgba(245,158,11,.4)":isDep?"rgba(190,18,60,.3)":isClean?"rgba(52,211,153,.3)":"var(--dark-border)";
                const col= isPGZ?"#f59e0b":isDep?"#f87171":isClean?"#34d399":dark?"#8b949e":"var(--text-muted)";
                return(
                  <div key={i} style={{padding:"6px 10px",borderRadius:8,border:`1px solid ${bc}`,background:bg,textAlign:"center",minWidth:56}}>
                    <div style={{fontSize:13,fontWeight:800,color:col}}>{no||"—"}</div>
                    <div style={{fontSize:9.5,color:col,marginTop:1,textTransform:"uppercase",letterSpacing:".04em"}}>{item.status||item.room_status||"—"}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Raw response — diagnostyka gdy nie działa */}
      {(arrivals||departures)&&(!arr&&!dep)&&(
        <div style={{...panelStyle,borderColor:"rgba(245,158,11,.3)"}}>
          <div style={{...hdStyle,color:"#f59e0b"}}>🔧 Diagnostyka — surowa odpowiedź serwera</div>
          <div style={{fontSize:11,color:"#948e85",marginBottom:8}}>API odpowiada ale format jest inny niż oczekiwany. Skopiuj poniższe i pokaż deweloperowi.</div>
          {arrivals&&<div><div style={{fontSize:11,fontWeight:700,color:"#8b949e",marginBottom:4}}>Przyjazdy [{arrivals.endpoint}] HTTP {arrivals.status}:</div><pre style={{fontSize:10.5,color:"#e6edf3",background:"rgba(0,0,0,.35)",borderRadius:8,padding:10,overflow:"auto",maxHeight:120,whiteSpace:"pre-wrap",wordBreak:"break-all"}}>{arrivals.raw}</pre></div>}
          {departures&&<div style={{marginTop:8}}><div style={{fontSize:11,fontWeight:700,color:"#8b949e",marginBottom:4}}>Wyjazdy [{departures.endpoint}] HTTP {departures.status}:</div><pre style={{fontSize:10.5,color:"#e6edf3",background:"rgba(0,0,0,.35)",borderRadius:8,padding:10,overflow:"auto",maxHeight:120,whiteSpace:"pre-wrap",wordBreak:"break-all"}}>{departures.raw}</pre></div>}
        </div>
      )}
    </div>
  );
}

// ─── HK Live Panel — panel poranny z QR kodami i statusem pokoi ──────────────

function HKLivePanel({ dark, hkData, setHkData, hkDate, hkStaff, showToast, isManager }) {
  const [activeTab, setActiveTab]         = React.useState("qr");
  const [remoteQrCodes, setRemoteQrCodes] = React.useState({});   // railway QR (morning)
  const [pmQrCodes, setPmQrCodes]         = React.useState({});   // railway QR (afternoon)
  const [newQrWorker, setNewQrWorker]     = React.useState("");
  const [liveState, setLiveState]         = React.useState(null);
  const [assignments, setAssignments]     = React.useState({});   // name → [rooms] (morning, status W)
  const [pmAssignments, setPmAssignments] = React.useState({});   // name → [rooms] (afternoon, PG/PGZ/BR/ZS)
  const [loading, setLoading]             = React.useState(true);
  const [remoteUrl, setRemoteUrl]         = React.useState("");
  const [remoteStatus, setRemoteStatus]   = React.useState("idle");
  const [qrCache, setQrCache]             = React.useState(() => loadJson("hk-qr-cache", {}));
  const [generatingFor, setGeneratingFor] = React.useState(null); // imię → regeneracja w toku
  // Dynamiczna lista pracowników HK (manager może edytować)
  const [hkWorkers, setHkWorkers]         = React.useState(() => loadJson("hk-workers-list", HK_WORKERS));
  const [newWorkerName, setNewWorkerName] = React.useState("");

  const hasElectron = !!window.electronAPI?.hkGetUrl;

  // Zbuduj przypisania z hkData + pmRoomTypes (HK statuses PG/PGZ/BR/ZS)
  const [pmRoomTypes, setPmRoomTypes] = React.useState({});
  React.useEffect(() => {
    const morning = {};
    const afternoon = {};
    const prt = {};
    if (hkData) {
      Object.entries(hkData).forEach(([no, rd]) => {
        if (!rd.person) return;
        if (rd.status === "W") {
          if (!morning[rd.person]) morning[rd.person] = [];
          morning[rd.person].push(no);
        } else if (rd.status === "PG" || rd.status === "PGZ" || rd.br || rd.zs) {
          if (!afternoon[rd.person]) afternoon[rd.person] = [];
          afternoon[rd.person].push(no);
          prt[no] = rd.status === "PG" ? "PG" : rd.status === "PGZ" ? "PGZ" : rd.br ? "BR" : "ZS";
        }
      });
    }
    setAssignments(morning);
    setPmAssignments(afternoon);
    setPmRoomTypes(prt);
  }, [hkData]);

  // Helper: pobierz QR z cache lub wygeneruj i zapisz
  const getCachedQr = React.useCallback(async (name, ip, base, pm, force) => {
    const cacheKey = `${name}::${base||ip||"local"}::${pm?"pm":"hk"}`;
    if (!force && qrCache[cacheKey]?.dataURL) return qrCache[cacheKey];
    const qr = await window.electronAPI.hkGetQr(name, ip || null, base || null, pm || false);
    if (qr?.dataURL) {
      setQrCache(prev => {
        const next = { ...prev, [cacheKey]: qr };
        localStorage.setItem("hk-qr-cache", JSON.stringify(next));
        return next;
      });
    }
    return qr;
  }, [qrCache]);

  // Wyślij przypisania do serwera — tylko gdy hkDate == dziś
  React.useEffect(() => {
    if (!hasElectron) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const rt = {};
        HK_ALL.forEach(r => { rt[r.no] = r.type; });
        await window.electronAPI.hkSetAssignments(assignments, hkDate, rt, pmAssignments, pmRoomTypes);
        const state = await window.electronAPI.hkGetState();
        if (!cancelled) { setLiveState(state); setLoading(false); }
      } catch (e) {
        console.error("[HKLivePanel]", e);
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [assignments, pmAssignments, pmRoomTypes, hasElectron, hkDate]);

  // Załaduj URL serwera i generuj QR kody dla WSZYSTKICH 9 pracowników
  React.useEffect(() => {
    if (!hasElectron) return;
    (async () => {
      const url = await window.electronAPI.remoteGetUrl?.();
      if (!url) return;
      setRemoteUrl(url);
      setRemoteStatus("ok");
      const base = url.trim().replace(/\/$/, "");
      const pmNames = Object.keys(pmAssignments);
      const morning = {};
      const pm = {};
      for (const name of hkWorkers) {
        const isPm = pmNames.includes(name);
        if (isPm) {
          pm[name] = await getCachedQr(name, null, base, true, false);
        } else {
          morning[name] = await getCachedQr(name, null, base, false, false);
        }
      }
      setRemoteQrCodes(morning);
      setPmQrCodes(pm);
    })();
  }, [hasElectron, pmAssignments, hkWorkers]);

  const saveRemoteUrl = async () => {
    if (!remoteUrl.trim()) return;
    await window.electronAPI.remoteSetUrl?.(remoteUrl.trim());
    const result = await window.electronAPI.remoteTest?.();
    if (result?.ok) {
      setRemoteStatus("ok");
      showToast("Serwer połączony!", "success");
      const base = remoteUrl.trim().replace(/\/$/, "");
      const pmNames = Object.keys(pmAssignments);
      const morning = {};
      const pm = {};
      for (const name of hkWorkers) {
        const isPm = pmNames.includes(name);
        if (isPm) {
          pm[name] = await getCachedQr(name, null, base, true, true);
        } else {
          morning[name] = await getCachedQr(name, null, base, false, true);
        }
      }
      setRemoteQrCodes(morning);
      setPmQrCodes(pm);
    } else {
      setRemoteStatus("error");
      showToast("Nie można połączyć: " + (result?.error||""), "error");
    }
  };

  // Nasłuchuj zmian od pokojówek
  React.useEffect(() => {
    if (!hasElectron) return;
    window.electronAPI.onHkStateChanged(s => setLiveState({...s}));
    return () => window.electronAPI.removeHkListeners?.();
  }, [hasElectron]);

  // Recepcja oznacza pokój jako pusty
  const markVacated = async (roomNo) => {
    if (hasElectron) {
      await window.electronAPI.hkVacateRoom(roomNo);
      const s = await window.electronAPI.hkGetState();
      setLiveState({...s});
    }
    setHkData(prev => ({ ...prev, [roomNo]: { ...(prev[roomNo]||{}), status: "W", vacated: true } }));
    showToast(`Pokój ${roomNo} — powiadomiono pokojówkę`, "success");
  };

  // Regeneruj QR dla jednej osoby
  const regenerateQr = async (name, isPm) => {
    if (!hasElectron || !remoteUrl) return;
    setGeneratingFor(name);
    try {
      const base = remoteUrl.trim().replace(/\/$/, "");
      const qr = await getCachedQr(name, null, base, isPm, true);
      if (isPm) setPmQrCodes(prev => ({ ...prev, [name]: qr }));
      else setRemoteQrCodes(prev => ({ ...prev, [name]: qr }));
      showToast(`QR dla ${name} wygenerowany`, "success");
    } finally {
      setGeneratingFor(null);
    }
  };

  const getRoomState = (no) => liveState?.rooms?.[no] || { status: "W", vacated: false };

  const morningNames  = Object.keys(assignments);
  const pmNames       = Object.keys(pmAssignments);
  // Dla każdego z 9 stałych pracowników ustal czy jest rano czy po południu
  const workerRole = (name) => pmNames.includes(name) ? "pm" : morningNames.includes(name) ? "morning" : "unassigned";
  const allRooms      = Object.entries(liveState?.rooms || {});
  const totalW        = allRooms.filter(([,r])=>r.status==="W").length;
  const totalCleaning = allRooms.filter(([,r])=>r.status==="czyszczenie").length;
  const totalDone     = allRooms.filter(([,r])=>r.status==="czyste").length;
  const totalSkipped  = allRooms.filter(([,r])=>r.status==="pominięte").length;

  const cs = { background: dark?"var(--dark-card)":"var(--bg-card)", border:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}` };

  // ─── Karta QR — tylko imię + kod, bez guzika Wygeneruj ──────────────────────
  const renderQrCard = (name, wi, isPm) => {
    const color = HK_LIVE_COLORS[wi % HK_LIVE_COLORS.length];
    const qr    = isPm ? pmQrCodes[name] : remoteQrCodes[name];
    return (
      <div key={name} style={{...cs,borderRadius:14,overflow:"hidden",borderTop:`3px solid ${color}`,display:"flex",flexDirection:"column",alignItems:"center",padding:16,gap:10,textAlign:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,width:"100%"}}>
          <div style={{width:32,height:32,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:14,color:"#fff",flexShrink:0}}>
            {name.charAt(0).toUpperCase()}
          </div>
          <div style={{flex:1,textAlign:"left"}}>
            <div style={{fontWeight:800,fontSize:13}}>{name}</div>
            <div style={{fontSize:10,color:dark?"#8b949e":"var(--text-muted)"}}>{isPm?"Popołudnie":"Rano"}</div>
          </div>
        </div>
        {qr?.dataURL ? (
          <img src={qr.dataURL} alt="QR" style={{width:140,height:140,borderRadius:8,border:`2px solid ${dark?"#30363d":"var(--border-light)"}`}}/>
        ) : (
          <div style={{width:140,height:140,borderRadius:8,background:dark?"rgba(255,255,255,.03)":"var(--bg-secondary)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:11,color:dark?"#484f58":"var(--text-muted)",flexDirection:"column",gap:6}}>
            {!remoteUrl ? "Skonfiguruj serwer" : "Brak QR"}
          </div>
        )}
      </div>
    );
  };

  // ─── Tab: Widok online ────────────────────────────────────────────────────────
  const renderOnlineTab = () => {
    if (morningNames.length === 0 && !loading) return (
      <div style={{textAlign:"center",padding:"40px 24px",color:dark?"#484f58":"var(--text-muted)"}}>
        <div style={{fontSize:40,marginBottom:12}}>🧹</div>
        <div style={{fontSize:15,fontWeight:700,marginBottom:6}}>Brak przypisanych pokoi</div>
        <div style={{fontSize:13}}>Wróć do zakładki Housekeeping i przypisz pokoje do pracowników.</div>
      </div>
    );
    const allGroups = [
      ...morningNames.map(n => ({ name: n, rooms: assignments[n] || [], pm: false })),
      ...pmNames.map(n => ({ name: n, rooms: pmAssignments[n] || [], pm: true })),
    ];
    return (
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(240px,1fr))",gap:12}}>
        {allGroups.map(({name, rooms, pm}, wi) => {
          const color = HK_LIVE_COLORS[wi % HK_LIVE_COLORS.length];
          return (
            <div key={name} style={{...cs,borderRadius:14,overflow:"hidden",borderTop:`3px solid ${color}`}}>
              <div style={{padding:"10px 14px",fontWeight:800,fontSize:13,display:"flex",alignItems:"center",gap:8,borderBottom:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`}}>
                <div style={{width:28,height:28,borderRadius:"50%",background:color,display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:12,color:"#fff",flexShrink:0}}>
                  {name.charAt(0).toUpperCase()}
                </div>
                <span style={{flex:1}}>{name}</span>
                {pm&&<span style={{fontSize:10,padding:"2px 7px",borderRadius:999,background:"rgba(167,139,250,.15)",color:"#a78bfa",fontWeight:700}}>PM</span>}
              </div>
              <div style={{padding:"10px 12px",display:"flex",flexDirection:"column",gap:5}}>
                {rooms.map(no => {
                  const rs    = getRoomState(no);
                  const done  = rs.status==="czyste";
                  const clean = rs.status==="czyszczenie";
                  const skip  = rs.status==="pominięte";
                  const vac   = rs.vacated && rs.status==="W";
                  const bg    = done?"rgba(52,211,153,.08)":clean?"rgba(96,165,250,.08)":skip?"rgba(167,139,250,.08)":vac?"rgba(245,158,11,.08)":"transparent";
                  const bc    = done?"rgba(52,211,153,.3)":clean?"rgba(96,165,250,.3)":skip?"rgba(167,139,250,.3)":vac?"rgba(245,158,11,.3)":dark?"var(--dark-border)":"var(--border-light)";
                  const pmType = pmRoomTypes[no];
                  const col   = done?"#34d399":clean?"#60a5fa":skip?"#a78bfa":vac?"#f59e0b":pm?(pmType==="PGZ"?"#f59e0b":pmType==="BR"?"#a78bfa":pmType==="ZS"?"#34d399":"#60a5fa"):dark?"#8b949e":"var(--text-muted)";
                  const label = done?"Czyste":clean?"Czyszczenie":skip?"Pominięte":vac?"Pokój pusty":pm?(pmRoomTypes[no]||"PM"):"Czeka";
                  const dur   = done&&rs.startedAt&&rs.doneAt ? Math.floor((new Date(rs.doneAt)-new Date(rs.startedAt))/60000)+"min" : null;
                  return (
                    <div key={no} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:9,background:bg,border:`1.5px solid ${bc}`,minHeight:48}}>
                      <span style={{fontWeight:900,fontSize:20,minWidth:42,color:col,letterSpacing:"-.02em"}}>{no}</span>
                      <span style={{fontSize:13,fontWeight:800,color:col,flex:1,textTransform:"uppercase",letterSpacing:".04em"}}>{label}</span>
                      {dur&&<span style={{fontSize:11,color:"#34d399",fontWeight:700}}>{dur}</span>}
                      {!pm&&!vac&&!clean&&!done&&!skip&&(
                        <button onClick={()=>markVacated(no)} style={{fontSize:11,padding:"5px 10px",borderRadius:6,border:"1px solid rgba(245,158,11,.4)",background:"rgba(245,158,11,.08)",color:"#f59e0b",cursor:"pointer",fontWeight:700,whiteSpace:"nowrap"}}>
                          Pusty
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const logs = liveState?.logs || [];
  const chatRef = React.useRef(null);
  // Zapisuj logi do localStorage dla danego dnia
  React.useEffect(() => {
    if (logs.length && hkDate) {
      const key = `${STORAGE_KEYS.hkDayLogs}-${hkDate}`;
      localStorage.setItem(key, JSON.stringify(logs));
    }
  }, [logs, hkDate]);
  React.useEffect(() => {
    if (activeTab === "chat" && chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [logs, activeTab]);

  // Manager day-log picker
  const [logPickDate, setLogPickDate] = React.useState(hkDate || "");
  const [pickedLogs, setPickedLogs]   = React.useState(null);
  const loadDayLogs = (date) => {
    if (!date) return;
    const key = `${STORAGE_KEYS.hkDayLogs}-${date}`;
    const stored = localStorage.getItem(key);
    setPickedLogs(stored ? JSON.parse(stored) : []);
  };

  const LOG_CFG = {
    start:  { color:"#60a5fa", bg:"rgba(96,165,250,.08)",  bc:"rgba(96,165,250,.25)",  icon:"▶",  text:(l)=>`${l.worker} zaczyna pokój ${l.room}` },
    done:   { color:"#34d399", bg:"rgba(52,211,153,.08)",  bc:"rgba(52,211,153,.25)",  icon:"✓",  text:(l)=>`${l.worker} skończyła pokój ${l.room}${l.extra?" · "+l.extra:""}` },
    skip:   { color:"#f59e0b", bg:"rgba(245,158,11,.08)",  bc:"rgba(245,158,11,.25)",  icon:"✕",  text:(l)=>`${l.worker} — goście nie chcieli (${l.room})` },
    vacate: { color:"#a78bfa", bg:"rgba(167,139,250,.08)", bc:"rgba(167,139,250,.25)", icon:"🔔", text:(l)=>`Recepcja: pokój ${l.room} pusty` },
  };

  // Raport lniany dzienny — suma pozycji ze wszystkich pokoi
  const [showLinenReport, setShowLinenReport] = React.useState(false);
  const linenSummary = React.useMemo(() => {
    const rooms = Object.values(liveState?.rooms || {});
    const fields = ["poszwa","poszewki","przes_sr","przes_duze","recz_duzy","recz_sredni","dywanik","narzuta","koldra","poduszka","podklad"];
    const labels = {"poszwa":"Poszwa","poszewki":"Poszewki","przes_sr":"Prześ. Śr.","przes_duze":"Prześ. Duże","recz_duzy":"Ręcz. Duży","recz_sredni":"Ręcz. Średni","dywanik":"Dywanik","narzuta":"Narzuta","koldra":"Kołdra","poduszka":"Poduszka","podklad":"Podkład"};
    const totals = {};
    fields.forEach(f => { totals[f] = 0; });
    const extra = {};
    rooms.forEach(r => {
      if (!r.report) return;
      fields.forEach(f => { totals[f] = (totals[f]||0) + (r.report[f]||0); });
      (r.report.extraItems||[]).forEach(it => {
        if (!it.name) return;
        extra[it.name] = (extra[it.name]||0) + (it.count||0);
      });
    });
    return { totals, labels, fields, extra };
  }, [liveState]);

  const TABS_BASE = [
    { id: "online", label: "Widok online", icon: "📡" },
    { id: "adhoc",  label: "Prośby HK",    icon: "📨" },
    { id: "qr",     label: "QR kody",     icon: "⬛" },
    { id: "chat",   label: "Aktywność",    icon: "💬" },
    { id: "linen",  label: "Pościel",      icon: "🛏" },
  ];
  const TABS_ALL = isManager
    ? [...TABS_BASE, { id: "raport", label: "Raport HK", icon: "📋" }, { id: "pracownicy", label: "Pracownicy HK", icon: "👥" }]
    : TABS_BASE;

  return (
    <div style={{display:"flex",flexDirection:"column",height:"calc(100vh - 44px)",margin:"-22px -26px",overflow:"hidden",background:dark?"var(--dark-bg)":"var(--bg-primary)"}}>

      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div style={{background:dark?"#161b22":"#fff",borderBottom:`2px solid ${dark?"#30363d":"var(--border-light)"}`,padding:"10px 18px",display:"flex",alignItems:"center",gap:12,flexShrink:0}}>
        <Logo variant="icon" tone="dark" width={32} height={32}/>
        <div style={{flex:1}}>
          <div style={{fontSize:16,fontWeight:800,display:"flex",alignItems:"center",gap:8}}>
            <QrCode size={16}/> Panel HK Live — {hkDate||"dziś"}
          </div>
          {remoteStatus==="ok"&&<div style={{marginTop:2,fontSize:11,color:"#34d399"}}>● Serwer połączony</div>}
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end",alignItems:"center"}}>
          {[["Czeka","#8b949e",totalW],["Sprząta","#60a5fa",totalCleaning],["Czyste","#34d399",totalDone],["Pominięte","#a78bfa",totalSkipped]].map(([lbl,col,cnt])=>(
            cnt > 0 && <div key={lbl} style={{textAlign:"center",padding:"4px 10px",borderRadius:8,background:dark?"rgba(255,255,255,.05)":"var(--bg-secondary)",minWidth:44}}>
              <div style={{fontSize:16,fontWeight:900,color:col}}>{cnt}</div>
              <div style={{fontSize:9,color:dark?"#484f58":"var(--text-muted)",fontWeight:700}}>{lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ─── Body ────────────────────────────────────────────────────────────── */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* Sidebar */}
        <div style={{width:180,flexShrink:0,background:dark?"#0d1117":"#f8fafc",borderRight:`1px solid ${dark?"#30363d":"var(--border-light)"}`,display:"flex",flexDirection:"column",padding:"12px 8px",gap:4}}>
          {TABS_ALL.map(tab => (
            <button key={tab.id} onClick={()=>setActiveTab(tab.id)} style={{display:"flex",alignItems:"center",gap:9,padding:"10px 12px",borderRadius:9,border:"none",background:activeTab===tab.id?(dark?"rgba(99,102,241,.25)":"rgba(99,102,241,.12)"):"transparent",color:activeTab===tab.id?"#6366f1":dark?"#8b949e":"var(--text-muted)",cursor:"pointer",fontWeight:activeTab===tab.id?800:600,fontSize:13,textAlign:"left",width:"100%",transition:"all .15s"}}>
              <span style={{fontSize:14}}>{tab.icon}</span>{tab.label}
              {tab.id==="chat"&&logs.length>0&&<span style={{marginLeft:"auto",fontSize:10,fontWeight:900,color:"#6366f1",background:"rgba(99,102,241,.15)",borderRadius:999,padding:"1px 6px"}}>{logs.length}</span>}
            </button>
          ))}

          {/* Serwer zdalny */}
          {isManager && hasElectron && (
            <div style={{marginTop:"auto",paddingTop:12,borderTop:`1px solid ${dark?"#30363d":"var(--border-light)"}`}}>
              <div style={{fontSize:10,fontWeight:700,color:dark?"#484f58":"var(--text-muted)",marginBottom:6,paddingLeft:4}}>SERWER</div>
              <div style={{padding:"8px 10px",borderRadius:8,background:dark?"rgba(255,255,255,.03)":"var(--bg-secondary)",border:`1px solid ${remoteStatus==="ok"?"rgba(52,211,153,.3)":dark?"#30363d":"var(--border-light)"}`}}>
                {remoteStatus==="ok"
                  ? <div style={{fontSize:11,color:"#34d399",fontWeight:700}}>● Połączony</div>
                  : <div style={{fontSize:11,color:dark?"#8b949e":"var(--text-muted)"}}>⚪ Nie skonfigurowany</div>
                }
                <input value={remoteUrl} onChange={e=>setRemoteUrl(e.target.value)}
                  placeholder="https://...railway.app"
                  style={{marginTop:6,width:"100%",padding:"5px 7px",borderRadius:5,border:`1px solid ${dark?"#30363d":"var(--border-light)"}`,background:dark?"#161b22":"#fff",color:dark?"#e6edf3":"#111",fontSize:9.5,fontFamily:"monospace",boxSizing:"border-box"}}/>
                <button onClick={saveRemoteUrl} style={{marginTop:5,width:"100%",padding:"5px",borderRadius:5,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,fontSize:10.5,cursor:"pointer"}}>
                  Zapisz
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Treść */}
        <div style={{flex:1,overflow:"auto",padding:20}}>

          {loading && <div style={{color:dark?"#8b949e":"var(--text-muted)",textAlign:"center",padding:40,fontSize:14}}>Ładowanie...</div>}

          {!hasElectron && !loading && (
            <div style={{padding:"12px 16px",borderRadius:10,background:"rgba(245,158,11,.1)",border:"1px solid rgba(245,158,11,.3)",color:"#f59e0b",fontSize:12,marginBottom:16}}>
              ⚠ QR kody działają tylko w aplikacji Electron.
            </div>
          )}

          {/* ─── QR kody ──────────────────────────────────────────────── */}
          {activeTab==="qr" && (
            <>
              {/* Wpisz imię i wygeneruj QR */}
              <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:14,padding:"10px 14px",borderRadius:10,background:dark?"rgba(99,102,241,.07)":"rgba(99,102,241,.06)",border:`1px solid ${dark?"rgba(99,102,241,.25)":"rgba(99,102,241,.2)"}`}}>
                <input value={newQrWorker} onChange={e=>setNewQrWorker(e.target.value)}
                  placeholder="Wpisz imię pracownika HK…"
                  list="hk-workers-datalist"
                  style={{flex:1,padding:"7px 10px",borderRadius:7,border:`1px solid ${dark?"#30363d":"var(--border-light)"}`,background:dark?"#161b22":"#fff",color:dark?"#e6edf3":"#111",fontSize:13,outline:"none"}}/>
                <datalist id="hk-workers-datalist">{hkWorkers.map(n=><option key={n} value={n}/>)}</datalist>
                <button onClick={async()=>{
                  if(!newQrWorker.trim()||!remoteUrl)return;
                  const name=newQrWorker.trim();
                  // Dodaj do listy pracownikow HK jesli jeszcze go nie ma
                  if(!hkWorkers.includes(name)){
                    const updated=[...hkWorkers,name];
                    setHkWorkers(updated);
                    saveJson("hk-workers-list",updated);
                    showToast(`Dodano pracownika: ${name}`,"success");
                  }
                  const isPm=workerRole(name)==="pm";
                  await regenerateQr(name,isPm);
                }}
                  disabled={!newQrWorker.trim()||!remoteUrl||generatingFor===newQrWorker.trim()}
                  style={{padding:"8px 16px",borderRadius:7,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,fontSize:13,cursor:!newQrWorker.trim()||!remoteUrl?"not-allowed":"pointer",opacity:!newQrWorker.trim()||!remoteUrl?0.5:1,whiteSpace:"nowrap"}}>
                  {generatingFor===newQrWorker.trim()?"Generuję...":"🔄 Generuj QR"}
                </button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(155px,1fr))",gap:10}}>
                {hkWorkers.map((name, wi) => renderQrCard(name, wi, workerRole(name) === "pm"))}
              </div>
            </>
          )}

          {/* ─── Widok online ─────────────────────────────────────────── */}
          {activeTab==="online" && !loading && renderOnlineTab()}

          {/* ─── Prosby HK (ad-hoc) ──────────────────────────────────── */}
          {activeTab==="adhoc" && (
            <AdhocTasksPanel
              dark={dark}
              employeeName={"Recepcja"}
              afternoonPerson={Object.keys(pmAssignments)[0]||null}
              allRooms={HK_ALL}
              showToast={showToast}
              isManager={isManager}
            />
          )}

          {/* ─── Aktywność (czat/logi) ────────────────────────────────── */}
          {activeTab==="chat" && (
            <div ref={chatRef} style={{display:"flex",flexDirection:"column",gap:8}}>
              {logs.length === 0 ? (
                <div style={{textAlign:"center",padding:"40px 20px",color:dark?"#484f58":"var(--text-muted)"}}>
                  <div style={{fontSize:32,marginBottom:8}}>💬</div>
                  <div style={{fontSize:13,fontWeight:700}}>Brak aktywności</div>
                  <div style={{fontSize:11,marginTop:4}}>Tutaj pojawią się logi gdy pokojówki zaczną sprzątać</div>
                </div>
              ) : [...logs].reverse().map((l, i) => {
                const cfg = LOG_CFG[l.action] || LOG_CFG.start;
                return (
                  <div key={i} style={{display:"flex",alignItems:"flex-start",gap:10,padding:"10px 14px",borderRadius:12,background:cfg.bg,border:`1px solid ${cfg.bc}`}}>
                    <div style={{width:34,height:34,borderRadius:"50%",background:cfg.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:900,color:"#fff",flexShrink:0}}>
                      {cfg.icon}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:13,fontWeight:700,color:dark?"#e6edf3":"#111",lineHeight:1.4}}>{cfg.text(l)}</div>
                      <div style={{fontSize:11,color:dark?"#484f58":"var(--text-muted)",marginTop:3}}>{l.time}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ─── Pościel / ręczniki ───────────────────────────────────── */}
          {activeTab==="linen" && (
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{fontSize:13,fontWeight:700,color:dark?"#e6edf3":"#111"}}>Raport pościeli i ręczników — suma wszystkich pokoi z dzisiejszego dnia</div>
              {linenSummary.fields.every(f=>!linenSummary.totals[f]) && Object.keys(linenSummary.extra).length===0 ? (
                <div style={{textAlign:"center",padding:"40px 20px",color:dark?"#484f58":"var(--text-muted)"}}>
                  <div style={{fontSize:32,marginBottom:8}}>🛏</div>
                  <div style={{fontSize:13,fontWeight:700}}>Brak danych</div>
                  <div style={{fontSize:11,marginTop:4}}>Pokojówki muszą wypełnić i zatwierdzić raporty pokoi.</div>
                </div>
              ) : (
                <>
                  <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
                    {linenSummary.fields.filter(f=>linenSummary.totals[f]>0).map(f=>(
                      <div key={f} style={{...cs,borderRadius:12,padding:"14px 16px",textAlign:"center"}}>
                        <div style={{fontSize:32,fontWeight:900,color:"#6366f1",lineHeight:1}}>{linenSummary.totals[f]}</div>
                        <div style={{fontSize:11,color:dark?"#8b949e":"var(--text-muted)",fontWeight:700,marginTop:4}}>{linenSummary.labels[f]}</div>
                      </div>
                    ))}
                  </div>
                  {Object.entries(linenSummary.extra).filter(([,v])=>v>0).length > 0 && (
                    <>
                      <div style={{fontSize:11,fontWeight:700,color:dark?"#8b949e":"var(--text-muted)",textTransform:"uppercase",letterSpacing:".06em"}}>Dodatkowe pozycje</div>
                      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(130px,1fr))",gap:10}}>
                        {Object.entries(linenSummary.extra).filter(([,v])=>v>0).map(([name,cnt])=>(
                          <div key={name} style={{borderRadius:12,padding:"14px 16px",textAlign:"center",background:"rgba(245,158,11,.07)",border:"1px solid rgba(245,158,11,.3)"}}>
                            <div style={{fontSize:32,fontWeight:900,color:"#f59e0b",lineHeight:1}}>{cnt}</div>
                            <div style={{fontSize:11,color:"#f59e0b",fontWeight:700,marginTop:4}}>{name}</div>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* ─── Raport HK (tylko kierownik) ──────────────────────────── */}
          {activeTab==="raport" && isManager && (
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{display:"flex",gap:8,alignItems:"flex-end",flexWrap:"wrap"}}>
                <div>
                  <div style={{fontSize:11,fontWeight:700,marginBottom:4,color:dark?"#8b949e":"var(--text-muted)"}}>DATA</div>
                  <input type="date" value={logPickDate} onChange={e=>setLogPickDate(e.target.value)}
                    style={{padding:"7px 10px",borderRadius:7,border:`1px solid ${dark?"#30363d":"var(--border-light)"}`,background:dark?"#161b22":"#fff",color:dark?"#e6edf3":"#111",fontSize:13}}/>
                </div>
                <button onClick={()=>loadDayLogs(logPickDate)}
                  style={{padding:"8px 16px",borderRadius:7,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer"}}>
                  Załaduj raport
                </button>
                {pickedLogs !== null && <span style={{fontSize:12,color:dark?"#8b949e":"var(--text-muted)"}}>{pickedLogs.length} wpisów</span>}
              </div>
              {pickedLogs !== null && (
                pickedLogs.length === 0 ? (
                  <div style={{textAlign:"center",padding:"30px",color:dark?"#484f58":"var(--text-muted)",fontSize:13}}>Brak zapisanych logów dla tego dnia.</div>
                ) : (
                  <div style={{display:"flex",flexDirection:"column",gap:6}}>
                    {pickedLogs.map((l,i)=>{
                      const cfg=LOG_CFG[l.action]||LOG_CFG.start;
                      // compute duration for "done" entries
                      const durStr = l.action==="done"&&l.extra ? ` · ${l.extra}` : "";
                      return (
                        <div key={i} style={{display:"flex",alignItems:"center",gap:10,padding:"8px 12px",borderRadius:9,background:cfg.bg,border:`1px solid ${cfg.bc}`}}>
                          <div style={{width:28,height:28,borderRadius:"50%",background:cfg.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:900,color:"#fff",flexShrink:0}}>{cfg.icon}</div>
                          <div style={{flex:1,fontSize:12,fontWeight:600,color:dark?"#e6edf3":"#111"}}>{cfg.text(l)}{durStr}</div>
                          <div style={{fontSize:11,color:dark?"#484f58":"var(--text-muted)",flexShrink:0}}>{l.time}</div>
                        </div>
                      );
                    })}
                    {/* Podsumowanie per pracownik */}
                    <div style={{marginTop:8,padding:"12px 16px",borderRadius:10,background:dark?"rgba(255,255,255,.03)":"var(--bg-secondary)",border:`1px solid ${dark?"#30363d":"var(--border-light)"}`}}>
                      <div style={{fontSize:12,fontWeight:800,marginBottom:8,color:dark?"#e6edf3":"#111"}}>Podsumowanie pracowników</div>
                      {Object.entries(pickedLogs.filter(l=>l.worker&&l.worker!=="Recepcja").reduce((acc,l)=>{
                        if(!acc[l.worker])acc[l.worker]={done:0,skip:0,rooms:new Set()};
                        if(l.action==="done")acc[l.worker].done++;
                        if(l.action==="skip")acc[l.worker].skip++;
                        if(l.room)acc[l.worker].rooms.add(l.room);
                        return acc;
                      },{})).map(([name,s])=>(
                        <div key={name} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 0",borderBottom:`1px solid ${dark?"#21262d":"var(--border-light)"}`}}>
                          <span style={{fontWeight:700,fontSize:13,flex:1,color:dark?"#e6edf3":"#111"}}>{name}</span>
                          <span style={{fontSize:11,color:"#34d399",fontWeight:700}}>✓ {s.done}</span>
                          {s.skip>0&&<span style={{fontSize:11,color:"#f59e0b",fontWeight:700}}>✕ {s.skip}</span>}
                          <span style={{fontSize:11,color:dark?"#8b949e":"var(--text-muted)"}}>pokoi: {s.rooms.size}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              )}
            </div>
          )}
          {/* ─── Pracownicy HK (tylko manager) ───────────────────────── */}
          {activeTab==="pracownicy" && isManager && (
            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              <div style={{fontSize:13,fontWeight:700,color:dark?"#e6edf3":"#111",marginBottom:4}}>Lista pracowników HK — zarządzaj osobami na liście QR</div>
              <div style={{display:"flex",gap:8,alignItems:"center"}}>
                <input value={newWorkerName} onChange={e=>setNewWorkerName(e.target.value)}
                  placeholder="Imię nowego pracownika HK…"
                  onKeyDown={e=>{if(e.key==="Enter"&&newWorkerName.trim()){const n=newWorkerName.trim();if(!hkWorkers.includes(n)){const updated=[...hkWorkers,n];setHkWorkers(updated);saveJson("hk-workers-list",updated);}setNewWorkerName("");}}}
                  style={{flex:1,padding:"8px 12px",borderRadius:8,border:`1px solid ${dark?"#30363d":"var(--border-light)"}`,background:dark?"#161b22":"#fff",color:dark?"#e6edf3":"#111",fontSize:13,outline:"none"}}/>
                <button onClick={()=>{const n=newWorkerName.trim();if(n&&!hkWorkers.includes(n)){const updated=[...hkWorkers,n];setHkWorkers(updated);saveJson("hk-workers-list",updated);}setNewWorkerName("");}}
                  style={{padding:"8px 16px",borderRadius:8,border:"none",background:"#6366f1",color:"#fff",fontWeight:700,fontSize:13,cursor:"pointer",whiteSpace:"nowrap"}}>
                  + Dodaj
                </button>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {hkWorkers.map((name,i)=>(
                  <div key={name} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",borderRadius:9,background:dark?"rgba(255,255,255,.03)":"var(--bg-secondary)",border:`1px solid ${dark?"#30363d":"var(--border-light)"}`}}>
                    <div style={{width:30,height:30,borderRadius:"50%",background:HK_LIVE_COLORS[i%HK_LIVE_COLORS.length],display:"flex",alignItems:"center",justifyContent:"center",fontWeight:900,fontSize:13,color:"#fff",flexShrink:0}}>{name.charAt(0)}</div>
                    <span style={{flex:1,fontWeight:600,fontSize:13,color:dark?"#e6edf3":"#111"}}>{name}</span>
                    <button onClick={()=>{const updated=hkWorkers.filter(w=>w!==name);setHkWorkers(updated);saveJson("hk-workers-list",updated);showToast(`Usunięto ${name} z listy HK.`,"info");}}
                      style={{padding:"5px 12px",borderRadius:7,border:"1px solid rgba(248,113,113,.4)",background:"rgba(248,113,113,.08)",color:"#f87171",fontWeight:700,fontSize:12,cursor:"pointer"}}>
                      Usuń
                    </button>
                  </div>
                ))}
                {!hkWorkers.length&&<div style={{textAlign:"center",padding:"24px",color:dark?"#484f58":"var(--text-muted)",fontSize:13}}>Brak pracowników na liście.</div>}
              </div>
              <button onClick={()=>{if(window.confirm("Przywrócić domyślną listę pracowników HK?")){setHkWorkers(HK_WORKERS);saveJson("hk-workers-list",HK_WORKERS);showToast("Przywrócono domyślną listę.","info");}}}
                style={{alignSelf:"flex-start",padding:"7px 16px",borderRadius:8,border:"1px solid var(--dark-border)",background:"transparent",color:dark?"#8b949e":"var(--text-muted)",fontSize:12,cursor:"pointer"}}>
                Przywróć domyślną listę
              </button>
            </div>
          )}
      </div>
    </div>
  </div>
  );
}

// ─── Modul Usterki (C1) ──────────────────────────────────────────────────────
// Floor map: reużywalny komponent mapy kondygnacji
function FloorMap({floor,faults,onSelectSpace,selectedSpace}){
  const isParter = floor.key === "parter";
  const items = isParter ? floor.spaces : floor.rooms;
  const faultsBySpace = {};
  faults.forEach(f=>{
    if(f.status==="done")return;
    if(f.floor!==floor.key)return;
    if(!faultsBySpace[f.space_id])faultsBySpace[f.space_id]=[];
    faultsBySpace[f.space_id].push(f);
  });
  return (
    <div className="cc-floor-map">
      <div className="cc-floor-map-title">{floor.label}</div>
      <div className={`cc-floor-grid${isParter?" cc-floor-grid-parter":" cc-floor-grid-rooms"}`}>
        {items.map(it=>{
          const id=isParter?it.id:it.no;
          const label=isParter?it.label:it.no;
          const list=faultsBySpace[id]||[];
          const has=list.length>0;
          const priority=list.some(f=>f.priority==="urgent")?"urgent":list.some(f=>f.status==="in_progress")?"progress":has?"normal":"none";
          return (
            <button
              key={id}
              onClick={()=>onSelectSpace(id)}
              className={`cc-floor-cell cc-floor-cell-${priority}${selectedSpace===id?" cc-floor-cell-sel":""}`}
              title={has?`${list.length} usterek`:"Brak usterek"}>
              <span className="cc-floor-cell-label">{label}</span>
              {has&&<span className="cc-floor-cell-badge">{list.length}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FaultFormModal({onClose,onSave,employeeName,floors,initialSpace,initialFloor}){
  const [floor,setFloor]=React.useState(initialFloor||"parter");
  const [spaceId,setSpaceId]=React.useState(initialSpace||"");
  const [description,setDescription]=React.useState("");
  const [priority,setPriority]=React.useState("normal");
  const [dueAt,setDueAt]=React.useState("");
  const [photo,setPhoto]=React.useState(null);
  const fl=floors.find(f=>f.key===floor);
  const items=fl.key==="parter"?fl.spaces:fl.rooms||[];
  const handlePhoto=(e)=>{
    const file=e.target.files?.[0];
    if(!file)return;
    if(file.size>2*1024*1024){alert("Zdjęcie większe niż 2MB — wybierz mniejsze.");return;}
    const reader=new FileReader();
    reader.onload=()=>setPhoto(reader.result);
    reader.readAsDataURL(file);
  };
  const handleSave=()=>{
    if(!spaceId||!description.trim()){alert("Wybierz pomieszczenie i opisz usterkę.");return;}
    onSave({
      id:crypto.randomUUID(),
      floor, space_id:spaceId,
      description:description.trim(), priority,
      status:"open",
      reported_by:employeeName||"Recepcja",
      reported_at:new Date().toISOString(),
      due_at:dueAt||null,
      photo_url:photo||null,
    });
    onClose();
  };
  return (
    <div className="modal-backdrop" style={{zIndex:1100}}>
      <motion.div initial={{opacity:0,y:12,scale:.97}} animate={{opacity:1,y:0,scale:1}} className="cc-preshift-modal" style={{maxWidth:560}} onClick={e=>e.stopPropagation()}>
        <div className="cc-preshift-header">
          <div style={{width:36,height:36,borderRadius:10,background:"var(--rose-light)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <AlertTriangle size={20} style={{color:"var(--rose)"}}/>
          </div>
          <div style={{flex:1}}>
            <div className="cc-preshift-title">Nowa usterka</div>
            <div className="cc-preshift-sub">Zgłoś problem do konserwatora</div>
          </div>
          <button className="cc-preshift-close" onClick={onClose}><X size={18}/></button>
        </div>
        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:14}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label>Piętro</label>
              <select className="input" value={floor} onChange={e=>{setFloor(e.target.value);setSpaceId("");}}>
                {floors.map(f=><option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label>Pomieszczenie / Pokój</label>
              <select className="input" value={spaceId} onChange={e=>setSpaceId(e.target.value)}>
                <option value="">— wybierz —</option>
                {items.map(it=>{const id=fl.key==="parter"?it.id:it.no;const lbl=fl.key==="parter"?it.label:it.no;return <option key={id} value={id}>{lbl}</option>;})}
              </select>
            </div>
          </div>
          <div>
            <label>Opis usterki</label>
            <textarea className="input" rows={4} placeholder="Np. Nie działa klimatyzacja, cieknie bateria w łazience…" value={description} onChange={e=>setDescription(e.target.value)}/>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
            <div>
              <label>Priorytet</label>
              <select className="input" value={priority} onChange={e=>setPriority(e.target.value)}>
                <option value="normal">Normalny</option>
                <option value="urgent">Pilne</option>
              </select>
            </div>
            <div>
              <label>Do wykonania (opcjonalnie)</label>
              <input className="input" type="datetime-local" value={dueAt} onChange={e=>setDueAt(e.target.value)}/>
            </div>
          </div>
          <div>
            <label>Zdjęcie (opcjonalnie, do 2MB)</label>
            <input type="file" accept="image/*" onChange={handlePhoto} style={{fontSize:13}}/>
            {photo&&<img src={photo} alt="podgląd" style={{marginTop:8,maxWidth:"100%",maxHeight:120,borderRadius:8,border:"1px solid var(--border-light)"}}/>}
          </div>
        </div>
        <div className="cc-preshift-footer">
          <div style={{fontSize:11.5,color:"var(--text-muted)"}}>Zgłasza: <strong>{employeeName||"Recepcja"}</strong></div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-outline" onClick={onClose}>Anuluj</button>
            <button className="btn btn-rose" onClick={handleSave}>Zgłoś usterkę</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function FaultDetailsModal({fault,floors,onClose,onUpdate,onDelete,employeeName}){
  const [note,setNote]=React.useState(fault.completion_note||"");
  const fl=floors.find(f=>f.key===fault.floor);
  const label=fl?.key==="parter"?(fl.spaces.find(s=>s.id===fault.space_id)?.label||fault.space_id):fault.space_id;
  const statusLabel={open:"Nowa",in_progress:"W trakcie",done:"Zakończona"}[fault.status];
  const statusColor={open:"var(--rose)",in_progress:"var(--amber)",done:"var(--emerald)"}[fault.status];
  return (
    <div className="modal-backdrop" style={{zIndex:1100}} onClick={onClose}>
      <motion.div initial={{opacity:0,y:12,scale:.97}} animate={{opacity:1,y:0,scale:1}} className="cc-preshift-modal" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
        <div className="cc-preshift-header">
          <div style={{width:36,height:36,borderRadius:10,background:"var(--rose-light)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <AlertTriangle size={20} style={{color:statusColor}}/>
          </div>
          <div style={{flex:1}}>
            <div className="cc-preshift-title">{label} · {fl?.label}</div>
            <div className="cc-preshift-sub">
              <span style={{color:statusColor,fontWeight:700}}>{statusLabel}</span>
              {fault.priority==="urgent"&&<span className="cc-preshift-urgent" style={{marginLeft:8}}>PILNE</span>}
            </div>
          </div>
          <button className="cc-preshift-close" onClick={onClose}><X size={18}/></button>
        </div>
        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:12,maxHeight:"60vh",overflowY:"auto"}}>
          <div>
            <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Opis</div>
            <div style={{fontSize:14,lineHeight:1.5,color:"var(--text-primary)"}}>{fault.description}</div>
          </div>
          {fault.photo_url&&(
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Zdjęcie</div>
              <img src={fault.photo_url} alt="usterka" style={{maxWidth:"100%",maxHeight:300,borderRadius:10,border:"1px solid var(--border-light)"}}/>
            </div>
          )}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,fontSize:12}}>
            <div><strong>Zgłoszone:</strong><br/>{fault.reported_by}<br/>{new Date(fault.reported_at).toLocaleString("pl-PL")}</div>
            {fault.due_at&&<div><strong>Do wykonania:</strong><br/>{new Date(fault.due_at).toLocaleString("pl-PL")}</div>}
            {fault.started_at&&<div><strong>Rozpoczęto:</strong><br/>{new Date(fault.started_at).toLocaleString("pl-PL")}</div>}
            {fault.completed_at&&<div><strong>Zakończono:</strong><br/>{new Date(fault.completed_at).toLocaleString("pl-PL")}</div>}
          </div>
          {fault.status!=="open"&&(
            <div>
              <div style={{fontSize:11,fontWeight:700,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:".06em",marginBottom:4}}>Notatka konserwatora</div>
              <textarea className="input" rows={3} value={note} onChange={e=>setNote(e.target.value)} placeholder="Opisz co zostało naprawione…"/>
            </div>
          )}
        </div>
        <div className="cc-preshift-footer">
          <button className="btn btn-danger-outline" onClick={()=>{if(confirm("Usunąć tę usterkę?")){onDelete(fault.id);onClose();}}}>
            <Trash2 size={13}/> Usuń
          </button>
          <div style={{display:"flex",gap:8}}>
            {fault.status==="open"&&(
              <button className="btn btn-amber" onClick={()=>{onUpdate(fault.id,{status:"in_progress",started_at:new Date().toISOString()});onClose();}}>
                Rozpocznij →
              </button>
            )}
            {fault.status==="in_progress"&&(
              <button className="btn btn-emerald" onClick={()=>{onUpdate(fault.id,{status:"done",completed_at:new Date().toISOString(),completion_note:note.trim()});onClose();}}>
                ✓ Zakończ
              </button>
            )}
            {fault.status==="done"&&(
              <button className="btn btn-outline" onClick={()=>{onUpdate(fault.id,{completion_note:note.trim()});onClose();}}>
                Zapisz notatkę
              </button>
            )}
            <button className="btn btn-outline" onClick={onClose}>Zamknij</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function FaultsPanel({dark,employeeName,showToast,floors1,floors2,floors3}){
  const [faults,setFaults]=React.useState(()=>loadJson(STORAGE_KEYS.faults,[]));
  const [activeFloor,setActiveFloor]=React.useState("parter");
  const [selectedSpace,setSelectedSpace]=React.useState("");
  const [showForm,setShowForm]=React.useState(false);
  const [showDetails,setShowDetails]=React.useState(null);
  const [filter,setFilter]=React.useState("active"); // active | all | done

  // Buduj tabele pieter (parter ma spaces, pietra maja rooms z HK_FLOOR*)
  const floors=React.useMemo(()=>[
    {key:"parter",  label:"Parter",    spaces:PARTER_SPACES},
    {key:"pietro1", label:"1. piętro", rooms:floors1},
    {key:"pietro2", label:"2. piętro", rooms:floors2},
    {key:"pietro3", label:"3. piętro", rooms:floors3},
  ],[floors1,floors2,floors3]);

  React.useEffect(()=>{saveJson(STORAGE_KEYS.faults,faults);},[faults]);

  const activeCount=faults.filter(f=>f.status!=="done").length;
  const urgentCount=faults.filter(f=>f.status!=="done"&&f.priority==="urgent").length;
  const doneCount=faults.filter(f=>f.status==="done").length;

  const visibleFaults=faults.filter(f=>{
    if(filter==="active")return f.status!=="done";
    if(filter==="done")return f.status==="done";
    return true;
  }).sort((a,b)=>{
    // Sortuj: urgent najpierw, potem po dacie
    if(a.priority==="urgent"&&b.priority!=="urgent")return -1;
    if(b.priority==="urgent"&&a.priority!=="urgent")return 1;
    return new Date(b.reported_at)-new Date(a.reported_at);
  });

  const selectedFloorObj=floors.find(f=>f.key===activeFloor);
  const floorFaults=visibleFaults.filter(f=>f.floor===activeFloor);
  const spaceFaults=selectedSpace?visibleFaults.filter(f=>f.floor===activeFloor&&f.space_id===selectedSpace):floorFaults;

  const addFault=(fault)=>{
    setFaults(prev=>[fault,...prev]);
    showToast&&showToast("Usterka zgłoszona.","success");
  };
  const updateFault=(id,patch)=>{
    setFaults(prev=>prev.map(f=>f.id===id?{...f,...patch}:f));
    showToast&&showToast("Usterka zaktualizowana.","success");
  };
  const deleteFault=(id)=>{
    setFaults(prev=>prev.filter(f=>f.id!==id));
    showToast&&showToast("Usterka usunięta.","info");
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Header */}
      <div className="panel" style={{padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:40,height:40,borderRadius:10,background:"var(--rose-light)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <AlertTriangle size={22} style={{color:"var(--rose)"}}/>
          </div>
          <div>
            <div style={{fontSize:18,fontWeight:700,fontFamily:"'DM Serif Display',serif",color:"var(--text-primary)"}}>Usterki</div>
            <div style={{fontSize:12,color:"var(--text-muted)",marginTop:1}}>
              <strong style={{color:activeCount>0?"var(--rose)":"var(--text-muted)"}}>{activeCount}</strong> aktywnych
              {urgentCount>0&&<> · <strong style={{color:"var(--rose)"}}>{urgentCount}</strong> pilnych</>}
              {doneCount>0&&<> · {doneCount} zakończonych</>}
            </div>
          </div>
        </div>
        <button className="btn btn-rose" onClick={()=>setShowForm(true)}>
          <Plus size={15}/> Nowa usterka
        </button>
      </div>

      {/* Floor tabs */}
      <div className="panel" style={{padding:0,overflow:"hidden"}}>
        <div className="cc-floor-tabs">
          {floors.map(f=>{
            const cnt=faults.filter(x=>x.floor===f.key&&x.status!=="done").length;
            return (
              <button key={f.key}
                onClick={()=>{setActiveFloor(f.key);setSelectedSpace("");}}
                className={`cc-floor-tab${activeFloor===f.key?" cc-active":""}`}>
                {f.label}
                {cnt>0&&<span className="cc-floor-tab-badge">{cnt}</span>}
              </button>
            );
          })}
        </div>
        <div style={{padding:"18px 20px"}}>
          <FloorMap floor={selectedFloorObj} faults={faults} onSelectSpace={setSelectedSpace} selectedSpace={selectedSpace}/>
          {selectedSpace&&(
            <div style={{marginTop:12,fontSize:12,color:"var(--text-muted)",textAlign:"center"}}>
              Pokazuję usterki dla: <strong style={{color:"var(--text-primary)"}}>{selectedSpace}</strong>
              <button onClick={()=>setSelectedSpace("")} style={{marginLeft:8,padding:"2px 8px",border:"1px solid var(--border-medium)",borderRadius:6,background:"transparent",color:"var(--text-secondary)",fontSize:11,cursor:"pointer"}}>× Wyczyść</button>
            </div>
          )}
        </div>
      </div>

      {/* Lista */}
      <div className="panel" style={{padding:"14px 18px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)"}}>Lista usterek</div>
          <div style={{display:"flex",gap:4,background:"var(--bg-secondary)",padding:3,borderRadius:8}}>
            {[["active","Aktywne"],["all","Wszystkie"],["done","Zakończone"]].map(([k,lbl])=>(
              <button key={k} onClick={()=>setFilter(k)}
                style={{padding:"5px 12px",borderRadius:6,border:"none",background:filter===k?"var(--bg-card)":"transparent",color:filter===k?"var(--plum)":"var(--text-muted)",fontWeight:filter===k?700:500,fontSize:12,cursor:"pointer"}}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        {spaceFaults.length===0?(
          <div style={{padding:"40px 20px",textAlign:"center",color:"var(--text-muted)"}}>
            <div style={{fontSize:32,marginBottom:8,opacity:.5}}>✨</div>
            <div style={{fontSize:13.5,fontWeight:600}}>Brak usterek — wszystko gra.</div>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {spaceFaults.map(f=>{
              const fl=floors.find(x=>x.key===f.floor);
              const spaceLabel=fl?.key==="parter"?(fl.spaces.find(s=>s.id===f.space_id)?.label||f.space_id):f.space_id;
              const statusColor={open:"var(--rose)",in_progress:"var(--amber)",done:"var(--emerald)"}[f.status];
              const statusLabel={open:"Nowa",in_progress:"W trakcie",done:"Zakończona"}[f.status];
              return (
                <div key={f.id} className="cc-fault-card cc-fade-up" onClick={()=>setShowDetails(f)} style={{borderLeftColor:statusColor}}>
                  <div className="cc-fault-head">
                    <div className="cc-fault-space">{fl?.label} · <strong>{spaceLabel}</strong></div>
                    <div className="cc-fault-status" style={{background:statusColor}}>{statusLabel}</div>
                    {f.priority==="urgent"&&<span className="cc-preshift-urgent">PILNE</span>}
                  </div>
                  <div className="cc-fault-desc">{f.description}</div>
                  <div className="cc-fault-meta">
                    {f.reported_by} · {new Date(f.reported_at).toLocaleString("pl-PL",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}
                    {f.due_at&&<> · do: {new Date(f.due_at).toLocaleString("pl-PL",{day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})}</>}
                    {f.photo_url&&<> · 📷 zdjęcie</>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showForm&&<FaultFormModal key="ff" employeeName={employeeName} floors={floors} initialFloor={activeFloor} initialSpace={selectedSpace} onClose={()=>setShowForm(false)} onSave={addFault}/>}
      </AnimatePresence>
      <AnimatePresence>
        {showDetails&&<FaultDetailsModal key="fd" fault={showDetails} floors={floors} onClose={()=>setShowDetails(null)} onUpdate={updateFault} onDelete={deleteFault} employeeName={employeeName}/>}
      </AnimatePresence>
    </div>
  );
}

// ─── Zadania ad-hoc HK (C3) ────────────────────────────────────────────
function AdhocTaskFormModal({onClose,onSave,employeeName,allRooms,afternoonPerson}){
  const [text,setText]=React.useState("");
  const [roomNo,setRoomNo]=React.useState("");
  const [previewMode]=React.useState(()=>computeBroadcastMode());
  const handleSave=()=>{
    if(!text.trim()){alert("Wpisz treść prośby.");return;}
    const now=new Date();
    const mode=computeBroadcastMode(now);
    onSave({
      id:crypto.randomUUID(),
      created_at:now.toISOString(),
      created_by:employeeName||"Recepcja",
      text:text.trim(),
      room_no:roomNo||null,
      target_date:todayKey(now),
      broadcast_mode:mode,
      claimed_by: mode==="pm_only" ? (afternoonPerson||null) : null,
      claimed_at: null,
      completed_at:null,
      completion_note:"",
      status:"open",
    });
    onClose();
  };
  return (
    <div className="modal-backdrop" style={{zIndex:1100}}>
      <motion.div initial={{opacity:0,y:12,scale:.97}} animate={{opacity:1,y:0,scale:1}} className="cc-preshift-modal" style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
        <div className="cc-preshift-header">
          <div style={{width:36,height:36,borderRadius:10,background:"var(--plum-soft)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <BellRing size={20} style={{color:"var(--plum)"}}/>
          </div>
          <div style={{flex:1}}>
            <div className="cc-preshift-title">Nowa prośba dla HK</div>
            <div className="cc-preshift-sub">{previewMode==="all_morning"?"🌅 Broadcast do wszystkich porannych HK (pierwsza osoba akceptuje)":"☀ Tylko zmiana popołudniowa"}</div>
          </div>
          <button className="cc-preshift-close" onClick={onClose}><X size={18}/></button>
        </div>
        <div style={{padding:"18px 20px",display:"flex",flexDirection:"column",gap:14}}>
          <div>
            <label>Treść prośby</label>
            <textarea className="input" rows={4} placeholder="Np. Zmień status pokoju 316 na DBL, zanieś żelazko do 210…" value={text} onChange={e=>setText(e.target.value)} autoFocus/>
          </div>
          <div>
            <label>Pokój (opcjonalnie)</label>
            <select className="input" value={roomNo} onChange={e=>setRoomNo(e.target.value)}>
              <option value="">— brak —</option>
              {(allRooms||[]).map(r=><option key={r.no} value={r.no}>{r.no}</option>)}
            </select>
          </div>
          <div style={{fontSize:12,padding:"10px 12px",background:"var(--plum-soft)",border:"1px solid var(--plum-border)",borderRadius:8,color:"var(--plum)"}}>
            {previewMode==="all_morning"
              ? '💡 Pora poranna — prośba trafi do wszystkich pracowników HK. Pierwsza osoba, która kliknie "Przyjmuję", zajmie się zadaniem (znika u pozostałych).'
              : '💡 Pora popołudniowa — prośbą zajmie się osoba ze zmiany popołudniowej. Pracownicy poranni nie zobaczą tej prośby.'}
          </div>
        </div>
        <div className="cc-preshift-footer">
          <div style={{fontSize:11.5,color:"var(--text-muted)"}}>Wysyła: <strong>{employeeName||"Recepcja"}</strong></div>
          <div style={{display:"flex",gap:8}}>
            <button className="btn btn-outline" onClick={onClose}>Anuluj</button>
            <button className="btn btn-rose" onClick={handleSave} disabled={!text.trim()}>Wyślij prośbę</button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

function AdhocTasksPanel({dark,employeeName,afternoonPerson,allRooms,showToast,isManager}){
  const [tasks,setTasks]=React.useState(()=>loadJson(STORAGE_KEYS.adhocTasks,[]));
  const [showForm,setShowForm]=React.useState(false);
  const [filter,setFilter]=React.useState("active"); // active | all | done
  const [completionNote,setCompletionNote]=React.useState({});
  const today=todayKey();

  // Odswiezanie z localStorage (zeby synchronizowac miedzy kartami)
  React.useEffect(()=>{
    const onStorage=(e)=>{if(e.key===STORAGE_KEYS.adhocTasks)setTasks(loadJson(STORAGE_KEYS.adhocTasks,[]));};
    window.addEventListener("storage",onStorage);
    const poll=setInterval(()=>setTasks(loadJson(STORAGE_KEYS.adhocTasks,[])),2500);
    return ()=>{window.removeEventListener("storage",onStorage);clearInterval(poll);};
  },[]);

  React.useEffect(()=>{saveJson(STORAGE_KEYS.adhocTasks,tasks);},[tasks]);

  const addTask=(task)=>{
    setTasks(prev=>[task,...prev]);
    showToast&&showToast(task.broadcast_mode==="all_morning"
      ? "Prośba wysłana — do wszystkich porannych HK."
      : `Prośba wysłana — do ${task.claimed_by||"zmiany popołudniowej"}.`,"success");
  };
  const claimTask=(id)=>{
    setTasks(prev=>prev.map(t=>t.id===id?{...t,claimed_by:employeeName||"HK",claimed_at:new Date().toISOString(),status:"claimed"}:t));
    showToast&&showToast("Przyjęto zadanie.","success");
  };
  const completeTask=(id)=>{
    const note=completionNote[id]||"";
    setTasks(prev=>prev.map(t=>t.id===id?{...t,status:"done",completed_at:new Date().toISOString(),completion_note:note}:t));
    setCompletionNote(prev=>{const p={...prev};delete p[id];return p;});
    showToast&&showToast("Zadanie zakończone.","success");
  };
  const cancelTask=(id)=>{
    if(!confirm("Anulować tę prośbę?"))return;
    setTasks(prev=>prev.filter(t=>t.id!==id));
    showToast&&showToast("Prośba anulowana.","info");
  };

  // Filtry: pokaz tylko dzisiejsze; dla HK pokazuj tylko te co dotyczą danego pracownika
  const visible=tasks.filter(t=>t.target_date===today).filter(t=>{
    if(filter==="done")return t.status==="done";
    if(filter==="active")return t.status!=="done";
    return true;
  }).sort((a,b)=>{
    const sOrder={open:0,claimed:1,done:2};
    return (sOrder[a.status]||0)-(sOrder[b.status]||0) || new Date(b.created_at)-new Date(a.created_at);
  });

  const activeCount=tasks.filter(t=>t.target_date===today&&t.status!=="done").length;
  const openCount=tasks.filter(t=>t.target_date===today&&t.status==="open").length;

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div className="panel" style={{padding:"14px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:12}}>
          <div style={{width:40,height:40,borderRadius:10,background:"var(--plum-soft)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <BellRing size={22} style={{color:"var(--plum)"}}/>
          </div>
          <div>
            <div style={{fontSize:18,fontWeight:700,fontFamily:"'DM Serif Display',serif",color:"var(--text-primary)"}}>Prośby do HK (ad-hoc)</div>
            <div style={{fontSize:12,color:"var(--text-muted)",marginTop:1}}>
              <strong style={{color:activeCount>0?"var(--plum)":"var(--text-muted)"}}>{activeCount}</strong> aktywnych
              {openCount>0&&<> · <strong style={{color:"var(--rose)"}}>{openCount}</strong> nieprzyjętych</>}
            </div>
          </div>
        </div>
        <button className="btn btn-rose" onClick={()=>setShowForm(true)}>
          <Plus size={15}/> Nowa prośba
        </button>
      </div>

      <div className="panel" style={{padding:"14px 18px"}}>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12,flexWrap:"wrap",gap:8}}>
          <div style={{fontSize:14,fontWeight:700,color:"var(--text-primary)"}}>Dzisiaj ({today})</div>
          <div style={{display:"flex",gap:4,background:"var(--bg-secondary)",padding:3,borderRadius:8}}>
            {[["active","Aktywne"],["all","Wszystkie"],["done","Zakończone"]].map(([k,lbl])=>(
              <button key={k} onClick={()=>setFilter(k)}
                style={{padding:"5px 12px",borderRadius:6,border:"none",background:filter===k?"var(--bg-card)":"transparent",color:filter===k?"var(--plum)":"var(--text-muted)",fontWeight:filter===k?700:500,fontSize:12,cursor:"pointer"}}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
        {visible.length===0?(
          <div style={{padding:"40px 20px",textAlign:"center",color:"var(--text-muted)"}}>
            <div style={{fontSize:32,marginBottom:8,opacity:.5}}>📋</div>
            <div style={{fontSize:13.5,fontWeight:600}}>Brak próśb dla HK.</div>
          </div>
        ):(
          <div style={{display:"flex",flexDirection:"column",gap:10}}>
            {visible.map(t=>{
              const statusColor={open:"var(--rose)",claimed:"var(--amber)",done:"var(--emerald)"}[t.status];
              const statusLabel={open:"Nowa",claimed:"Przyjęte",done:"Zakończone"}[t.status];
              const modeLabel=t.broadcast_mode==="all_morning"?"🌅 Wszyscy":"☀ PM";
              // HK widzi zadanie jesli: (a) broadcast_mode=all_morning i status=open, albo (b) claimed_by=employeeName
              const canClaim=t.status==="open"&&(t.broadcast_mode==="all_morning"||t.claimed_by===employeeName);
              const canComplete=t.status==="claimed"&&(t.claimed_by===employeeName||isManager);
              return (
                <div key={t.id} className="cc-preshift-item" style={{borderLeftColor:statusColor}}>
                  <div className="cc-preshift-item-head">
                    <div className="cc-preshift-item-title">{t.text}</div>
                    <span style={{fontSize:10,padding:"2px 7px",borderRadius:999,background:statusColor,color:"#fff",fontWeight:800,letterSpacing:".05em",textTransform:"uppercase"}}>{statusLabel}</span>
                    <span style={{fontSize:10,padding:"2px 7px",borderRadius:999,background:"var(--bg-secondary)",color:"var(--text-muted)",fontWeight:700}}>{modeLabel}</span>
                  </div>
                  <div className="cc-preshift-item-meta">
                    {t.room_no&&<>🚪 Pokój <strong>{t.room_no}</strong> · </>}
                    Zgłosił: {t.created_by} · {new Date(t.created_at).toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"})}
                    {t.claimed_by&&<> · <strong style={{color:"var(--amber)"}}>Przyjęła(-ął): {t.claimed_by}</strong></>}
                    {t.completed_at&&<> · ✓ {new Date(t.completed_at).toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"})}</>}
                  </div>
                  {t.status==="done"&&t.completion_note&&(
                    <div style={{marginTop:6,fontSize:12,padding:"8px 10px",background:"var(--emerald-light)",border:"1px solid var(--emerald-border)",borderRadius:6,color:"var(--emerald)"}}>
                      💬 {t.completion_note}
                    </div>
                  )}
                  {/* Akcje */}
                  <div style={{marginTop:8,display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
                    {canClaim&&employeeName&&(
                      <button className="btn btn-amber" style={{fontSize:12}} onClick={()=>claimTask(t.id)}>✋ Przyjmuję</button>
                    )}
                    {canComplete&&(
                      <>
                        <input
                          className="input" style={{fontSize:12,flex:1,minWidth:180}}
                          placeholder="Krótka notatka (opcjonalnie)…"
                          value={completionNote[t.id]||""}
                          onChange={e=>setCompletionNote(prev=>({...prev,[t.id]:e.target.value}))}/>
                        <button className="btn btn-emerald" style={{fontSize:12}} onClick={()=>completeTask(t.id)}>✓ Zakończ</button>
                      </>
                    )}
                    {(t.status==="open"||isManager)&&(t.created_by===employeeName||isManager)&&(
                      <button className="btn btn-outline" style={{fontSize:11,color:"var(--rose)",borderColor:"var(--rose)"}} onClick={()=>cancelTask(t.id)}>
                        <Trash2 size={11}/> Anuluj
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showForm&&<AdhocTaskFormModal key="atf" employeeName={employeeName} allRooms={allRooms} afternoonPerson={afternoonPerson} onClose={()=>setShowForm(false)} onSave={addTask}/>}
      </AnimatePresence>
    </div>
  );
}

function ParkingPanel({dark, isAdmin, showToast, employees, employeeName}) {
  const [records, setRecords] = React.useState(() => loadJson(STORAGE_KEY_PARKING, DEFAULT_PARKING));
  const [filter, setFilter] = React.useState("all"); // all | abonament | pracownik | krotki
  const [search, setSearch] = React.useState("");
  const [showAdd, setShowAdd] = React.useState(false);
  const [addMode, setAddMode] = React.useState("abonament"); // abonament | krotki | pracownik
  const [newRec, setNewRec] = React.useState({plate:"",name:"",phone:"",status:"Os. prywatna",note:"",paidTo:"",paidOn:"",docNr:"",price:""});
  const [shortRec, setShortRec] = React.useState({plate:"",name:"",phone:"",price:"",note:"",until:""});

  // Auto-expire short rentals at midnight
  React.useEffect(()=>{
    const now=new Date();
    const today=now.toISOString().split('T')[0];
    const expired=records.filter(r=>r.type==="krotki"&&r.active!==false&&r.shortUntil&&r.shortUntil<today);
    if(expired.length){
      const updated=records.map(r=>expired.some(e=>e.id===r.id)?{...r,active:false}:r);
      setRecords(updated);localStorage.setItem(STORAGE_KEY_PARKING,JSON.stringify(updated));
      const h=[...expired.map(r=>({...r,endedAt:'Auto-usunięty '+new Date().toLocaleString('pl-PL'),active:false})),...history].slice(0,200);
      setHistory(h);localStorage.setItem('reception-parking-history',JSON.stringify(h));
    }
  },[]);
  const [expanded, setExpanded] = React.useState(null);
  const [payModal, setPayModal] = React.useState(null); // record id
  const [payDoc, setPayDoc] = React.useState("");
  const [history, setHistory] = React.useState(() => loadJson("reception-parking-history", []));

  const save = (updated) => { setRecords(updated); localStorage.setItem(STORAGE_KEY_PARKING, JSON.stringify(updated)); };
  const saveHistory = (h) => { setHistory(h); localStorage.setItem("reception-parking-history", JSON.stringify(h)); };

  // Days until expiry
  const daysLeft = (dateStr) => {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    const today = new Date(); today.setHours(0,0,0,0);
    return Math.ceil((d - today) / 86400000);
  };

  // Alert: ≤3 days AND not paid recently
  const needsAlert = (rec) => {
    if (rec.type !== "abonament") return false;
    const dl = daysLeft(rec.paidTo);
    return dl !== null && dl <= 3 && dl >= -7;
  };

  const active = records.filter(r => r.active !== false);
  const filtered = active.filter(r => {
    if (filter !== "all" && r.type !== filter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return [r.plate, r.name, r.phone, r.status, r.note].some(s => (s||"").toLowerCase().includes(q));
  });

  const addRecord = () => {
    if (!newRec.plate.trim() && !newRec.name.trim()) return;
    const ne = {
      id: `p-${Date.now()}`,
      plate: newRec.plate.trim().toUpperCase(),
      name: newRec.name.trim(),
      phone: newRec.phone.trim(),
      type: addMode,
      status: newRec.status,
      paidTo: newRec.paidTo,
      paidOn: newRec.paidOn,
      docNr: newRec.docNr,
      note: newRec.note.trim(),
      price: newRec.price.trim(),
      active: true,
    };
    save([...records, ne]);
    setNewRec({plate:"",name:"",phone:"",status:"Os. prywatna",note:"",paidTo:"",paidOn:"",docNr:"",price:""});
    setShowAdd(false);
    showToast("Dodano do listy parkingowej.", "success");
  };

  const addShortRec = () => {
    if (!shortRec.name.trim()||!shortRec.until) { showToast("Wpisz imię i datę zakończenia.","error"); return; }
    const ne = {
      id: `p-${Date.now()}`,
      plate: shortRec.plate.trim().toUpperCase(),
      name: shortRec.name.trim(),
      phone: shortRec.phone.trim(),
      type: "krotki",
      status: "Krótki najem",
      paidTo: shortRec.until,
      shortUntil: shortRec.until,
      paidOn: new Date().toISOString().split("T")[0],
      docNr: "",
      note: shortRec.note.trim(),
      price: shortRec.price.trim(),
      active: true,
      shortStarted: new Date().toLocaleString("pl-PL"),
    };
    save([...records, ne]);
    setShortRec({plate:"",name:"",phone:"",price:"",note:"",until:""});
    setShowAdd(false);
    showToast("Krótki najem dodany — aktywny do "+shortRec.until+".", "success");
  };

  const markPaid = (id) => {
    if (!payDoc.trim()) { showToast("Wpisz nr dokumentu sprzedaży.", "error"); return; }
    const paidOn = new Date().toISOString().split("T")[0];
    // Extend by 1 month from paidTo or today
    const updated = records.map(r => {
      if (r.id !== id) return r;
      const base = r.paidTo ? new Date(r.paidTo) : new Date();
      base.setMonth(base.getMonth() + 1);
      return {...r, paidOn, docNr: payDoc.trim(), paidTo: base.toISOString().split("T")[0]};
    });
    save(updated);
    setPayModal(null); setPayDoc("");
    showToast("Płatność zapisana.", "success");
  };

  const endShort = (rec) => {
    const updated = records.map(r => r.id === rec.id ? {...r, active: false} : r);
    save(updated);
    const h = [{...rec, endedAt: new Date().toLocaleString("pl-PL"), active: false}, ...history].slice(0, 200);
    saveHistory(h);
    showToast("Krótki najem zakończony i zapisany w historii.", "success");
  };

  const deleteRecord = (id) => {
    save(records.map(r => r.id === id ? {...r, active: false} : r));
    showToast("Usunięto z aktywnej listy.", "info");
  };

  const inp = dark ? "input dark-input" : "input";
  const panel = `panel${dark ? " dark-panel" : ""}`;

  const typeLabel = {abonament:"Abonament", pracownik:"Pracownik", krotki:"Krótki najem"};
  const typeBg = {
    abonament: dark ? "rgba(24,95,165,.15)" : "#E6F1FB",
    pracownik: dark ? "rgba(30,107,60,.15)" : "#E8F5EE",
    krotki: dark ? "rgba(130,79,10,.15)" : "#FAEEDA",
  };
  const typeColor = {abonament:"#185FA5", pracownik:"#1E6B3C", krotki:"#854F0B"};

  const alertItems=active.filter(r=>needsAlert(r));
  return (
    <div className="stack">
      {/* Alerty u góry — jeśli są */}
      {alertItems.length>0&&(
        <div className={panel} style={{borderLeft:"4px solid var(--rose)",background:"var(--rose-light)"}}>
          <div style={{fontSize:15,fontWeight:400,color:"var(--rose)",marginBottom:10,display:"flex",alignItems:"center",gap:8,fontFamily:"'DM Serif Display',serif"}}>
            <AlertTriangle size={18}/> Wymaga uwagi ({alertItems.length})
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {alertItems.slice(0,5).map(r=>(
              <div key={r.id} style={{padding:"8px 12px",background:"var(--bg-card)",border:"1px solid var(--rose-border)",borderLeft:"3px solid var(--rose)",borderRadius:"var(--radius-md)",fontSize:12.5,display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                <span style={{fontWeight:800,color:"var(--text-primary)"}}>{r.plate||r.name}</span>
                <span style={{color:"var(--text-muted)"}}>· {typeLabel[r.type]||r.type}</span>
                {r.paidTo&&<span style={{color:"var(--rose)",fontSize:11,fontWeight:700}}>do: {r.paidTo}</span>}
                {r.shortUntil&&<span style={{color:"var(--rose)",fontSize:11,fontWeight:700}}>krótki do: {r.shortUntil}</span>}
              </div>
            ))}
            {alertItems.length>5&&<div style={{fontSize:11,color:"var(--text-muted)",fontStyle:"italic"}}>i {alertItems.length-5} więcej…</div>}
          </div>
        </div>
      )}
      {/* Header */}
      <div className={panel}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:10}}>
          <div>
            <div className="panel-title" style={{margin:0}}>🚗 Lista parkingowa</div>
            <div style={{fontSize:12,color:"var(--text-muted)",marginTop:4,display:"flex",gap:14,flexWrap:"wrap"}}>
              <span><strong style={{color:"var(--text-primary)",fontFamily:"'DM Serif Display',serif",fontSize:14}}>{active.length}</strong> aktywnych</span>
              <span style={{color:"#185FA5"}}>● {active.filter(r=>r.type==="abonament").length} abonament</span>
              <span style={{color:"#1E6B3C"}}>● {active.filter(r=>r.type==="pracownik").length} pracownicy</span>
              <span style={{color:"#854F0B"}}>● {active.filter(r=>r.type==="krotki").length} krótki najem</span>
            </div>
          </div>
          {!isAdmin && (
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button className="btn btn-rose" style={{fontSize:12}} onClick={()=>{setShowAdd(true);setAddMode("abonament");}}>+ Abonament</button>
              <button className="btn btn-amber" style={{fontSize:12}} onClick={()=>{setShowAdd(true);setAddMode("krotki");}}>+ Krótki najem</button>
              <button className="btn btn-emerald" style={{fontSize:12}} onClick={()=>{setShowAdd(true);setAddMode("pracownik");}}>+ Pracownik/firma</button>
            </div>
          )}
        </div>
        {/* Filters */}
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
          {[["all","Wszyscy"],["abonament","Abonament"],["pracownik","Pracownicy"],["krotki","Krótki najem"]].map(([v,l])=>(
            <button key={v} onClick={()=>setFilter(v)}
              style={{fontSize:11.5,padding:"5px 12px",borderRadius:"var(--radius-md)",cursor:"pointer",
                      border:`1px solid ${filter===v?"var(--plum)":"var(--border-light)"}`,
                      background:filter===v?"var(--plum-soft)":"transparent",
                      color:filter===v?"var(--plum)":"var(--text-muted)",fontWeight:filter===v?700:500}}>
              {l}
            </button>
          ))}
          <input className={inp} placeholder="Szukaj tablicy, nazwiska..." value={search}
            onChange={e=>setSearch(e.target.value)}
            style={{marginLeft:"auto",width:220,fontSize:11.5}}/>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className={panel}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div className="panel-title" style={{margin:0}}>
              {addMode==="abonament"?"+ Nowy abonament":addMode==="krotki"?"+ Krótki najem (z ulicy / hotel obok)":"+ Pracownik / firma"}
            </div>
            <button onClick={()=>setShowAdd(false)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-muted)",fontSize:16}}>✕</button>
          </div>

          {addMode==="krotki" ? (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div><label>Imię i nazwisko *</label><input className={inp} value={shortRec.name} onChange={e=>setShortRec(p=>({...p,name:e.target.value}))}/></div>
                <div><label>Numer telefonu</label><input className={inp} value={shortRec.phone} onChange={e=>setShortRec(p=>({...p,phone:e.target.value}))}/></div>
                <div><label>Nr rejestracyjny</label><input className={inp} value={shortRec.plate} onChange={e=>setShortRec(p=>({...p,plate:e.target.value.toUpperCase()}))} style={{textTransform:"uppercase"}}/></div>
                <div><label>Cena</label><input className={inp} value={shortRec.price} onChange={e=>setShortRec(p=>({...p,price:e.target.value}))}/></div>
                <div><label style={{color:"var(--rose)",fontWeight:600}}>Najem do (data) *</label><input className={inp} type="date" value={shortRec.until} onChange={e=>setShortRec(p=>({...p,until:e.target.value}))} style={{border:"1px solid var(--rose)"}}/></div>
                <div style={{display:"flex",alignItems:"flex-end",paddingBottom:1,fontSize:10.5,color:"var(--text-muted)"}}>Wpis widoczny do 23:59 tej daty. Potem automatycznie trafia do historii.</div>
                <div style={{gridColumn:"span 2"}}><label>Uwagi (skąd, hotel obok, inne)</label><input className={inp} value={shortRec.note} onChange={e=>setShortRec(p=>({...p,note:e.target.value}))}/></div>
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button className="btn btn-outline" onClick={()=>setShowAdd(false)}>Anuluj</button>
                <button className="btn btn-amber" disabled={!shortRec.name.trim()} onClick={addShortRec}>✓ Dodaj</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:10}}>
                <div><label>Nr rejestracyjny *</label><input className={inp} value={newRec.plate} onChange={e=>setNewRec(p=>({...p,plate:e.target.value.toUpperCase()}))} style={{textTransform:"uppercase"}}/></div>
                <div><label>Imię i nazwisko *</label><input className={inp} value={newRec.name} onChange={e=>setNewRec(p=>({...p,name:e.target.value}))}/></div>
                <div><label>Telefon</label><input className={inp} value={newRec.phone} onChange={e=>setNewRec(p=>({...p,phone:e.target.value}))}/></div>
                <div><label>Status / firma</label>
                  <input className={inp} value={newRec.status} onChange={e=>setNewRec(p=>({...p,status:e.target.value}))}/>
                </div>
                {addMode==="abonament" && <>
                  <div><label>Opłacony do</label><input className={inp} type="date" value={newRec.paidTo} onChange={e=>setNewRec(p=>({...p,paidTo:e.target.value}))}/></div>
                  <div><label>Data wpłaty</label><input className={inp} type="date" value={newRec.paidOn} onChange={e=>setNewRec(p=>({...p,paidOn:e.target.value}))}/></div>
                  <div><label>Nr dokumentu</label><input className={inp} value={newRec.docNr} onChange={e=>setNewRec(p=>({...p,docNr:e.target.value}))}/></div>
                  <div><label>Cena / stawka</label><input className={inp} value={newRec.price} onChange={e=>setNewRec(p=>({...p,price:e.target.value}))}/></div>
                </>}
                <div style={{gridColumn:"span 2"}}><label>Uwagi</label><input className={inp} value={newRec.note} onChange={e=>setNewRec(p=>({...p,note:e.target.value}))}/></div>
              </div>
              <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
                <button className="btn btn-outline" onClick={()=>setShowAdd(false)}>Anuluj</button>
                <button className="btn btn-sky" disabled={!newRec.plate.trim()&&!newRec.name.trim()} onClick={addRecord}>✓ Dodaj</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Pay modal */}
      {payModal && (
        <div className="modal-backdrop" onClick={()=>{setPayModal(null);setPayDoc("");}}>
          <div className={`modal${dark?" dark-modal":""}`} style={{maxWidth:400}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h2>Potwierdź płatność</h2></div>
            <p style={{marginBottom:12,fontSize:13}}>Wpisz numer dokumentu sprzedaży (paragon / FV):</p>
            <input className={inp} placeholder="np. PA 123/03/2026" value={payDoc} onChange={e=>setPayDoc(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&markPaid(payModal)}
              style={{marginBottom:14}} autoFocus/>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button className="btn btn-outline" onClick={()=>{setPayModal(null);setPayDoc("");}}>Anuluj</button>
              <button className="btn btn-emerald" disabled={!payDoc.trim()} onClick={()=>markPaid(payModal)}>✓ Zapisz płatność</button>
            </div>
          </div>
        </div>
      )}

      {/* Records list */}
      {filtered.length === 0 && (
        <div className={panel}><div className={`empty-box${dark?" empty-box-dark":""}`}>Brak wyników.</div></div>
      )}
      {filtered.map(rec => {
        const dl = daysLeft(rec.paidTo);
        const alert = needsAlert(rec);
        const isOpen = expanded === rec.id;
        return (
          <div key={rec.id} style={{
            borderRadius:"var(--radius-md)",overflow:"hidden",marginBottom:5,
            border:`1.5px solid ${alert?"var(--rose)":dark?"var(--dark-border)":"var(--border-light)"}`,
            background:alert?(dark?"rgba(154,48,64,.08)":"#FEF2F2"):(dark?"rgba(255,255,255,.03)":"var(--bg-card)"),
          }}>
            {/* Row */}
            <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",cursor:"pointer"}}
              onClick={()=>setExpanded(isOpen?null:rec.id)}>
              {/* Alert badge */}
              {alert && <span style={{fontSize:16,flexShrink:0}} title="Wymaga opłaty">⚠️</span>}
              {/* Plate */}
              <div style={{fontFamily:"monospace",fontWeight:700,fontSize:13,
                           background:dark?"rgba(255,255,255,.07)":"#f0f4ff",padding:"2px 8px",
                           borderRadius:4,flexShrink:0,minWidth:80,textAlign:"center",
                           color:dark?"var(--dark-text)":"var(--text-primary)"}}>
                {rec.plate||"—"}
              </div>
              {/* Name */}
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,color:dark?"var(--dark-text)":"var(--text-primary)",
                             overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                  {rec.name}
                </div>
                <div style={{fontSize:11,color:"var(--text-muted)"}}>{rec.status}</div>
              </div>
              {/* Type badge */}
              <span style={{fontSize:10.5,padding:"2px 8px",borderRadius:999,flexShrink:0,fontWeight:600,
                            background:typeBg[rec.type]||"transparent",color:typeColor[rec.type]||"var(--text-muted)"}}>
                {typeLabel[rec.type]||rec.type}
              </span>
              {/* Days left badge */}
              {rec.paidTo && dl !== null && (
                <span style={{fontSize:11,padding:"2px 8px",borderRadius:999,flexShrink:0,fontWeight:700,
                              background:dl<=3?"rgba(154,48,64,.15)":dl<=7?"rgba(245,158,11,.15)":"rgba(30,107,60,.12)",
                              color:dl<=3?"var(--rose)":dl<=7?"var(--amber)":"var(--emerald)"}}>
                  {dl>0?`${dl}d`:"Wygasło"}
                </span>
              )}
              {/* Krótki najem — End button */}
              {rec.type==="krotki" && !isAdmin && (
                <button className="btn btn-amber" style={{fontSize:11,padding:"3px 9px",flexShrink:0}}
                  onClick={e=>{e.stopPropagation();endShort(rec);}}>
                  Zakończ
                </button>
              )}
              {/* Pay button for abonament */}
              {rec.type==="abonament" && alert && (
                <button className="btn btn-rose" style={{fontSize:11,padding:"3px 9px",flexShrink:0}}
                  onClick={e=>{e.stopPropagation();setPayModal(rec.id);}}>
                  Opłać
                </button>
              )}
              <span style={{color:"var(--text-muted)",fontSize:11}}>{isOpen?"▲":"▼"}</span>
            </div>
            {/* Expanded */}
            {isOpen && (
              <div style={{padding:"8px 14px 12px",borderTop:`0.5px solid ${dark?"var(--dark-border)":"var(--border-light)"}`}}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,marginBottom:8}}>
                  {[
                    ["Telefon", rec.phone],
                    ["Opłacony do", rec.paidTo],
                    ["Data wpłaty", rec.paidOn],
                    ["Nr dokumentu", rec.docNr],
                    ["Cena / stawka", rec.price],
                  ].filter(([,v])=>v).map(([l,v])=>(
                    <div key={l}>
                      <div style={{fontSize:10,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:".05em",fontWeight:600,marginBottom:1}}>{l}</div>
                      <div style={{fontSize:12.5,color:dark?"var(--dark-text)":"var(--text-primary)"}}>{v}</div>
                    </div>
                  ))}
                </div>
                {rec.note && (
                  <div style={{background:dark?"rgba(245,208,106,.08)":"var(--gold-bg)",border:"1px solid var(--gold-border)",
                               borderRadius:"var(--radius-sm)",padding:"5px 9px",fontSize:12,marginBottom:8}}>
                    <strong style={{fontSize:10,color:"var(--amber)"}}>UWAGI: </strong>{rec.note}
                  </div>
                )}
                {rec.shortStarted && (
                  <div style={{fontSize:11,color:"var(--text-muted)",marginBottom:8}}>
                    Najem od: {rec.shortStarted}
                  </div>
                )}
                <div style={{display:"flex",gap:6,justifyContent:"flex-end",flexWrap:"wrap"}}>
                  {rec.type==="abonament" && (
                    <button className="btn btn-emerald" style={{fontSize:12}} onClick={()=>setPayModal(rec.id)}>
                      💰 Zarejestruj płatność
                    </button>
                  )}
                  <button className="btn btn-danger-outline" style={{fontSize:12}} onClick={()=>deleteRecord(rec.id)}>
                    <Trash2 size={12}/> Usuń
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Historia krótkich najem */}
      {isAdmin && history.length > 0 && (filter==="all"||filter==="krotki") && (
        <div className={panel}>
          <div className="panel-title" style={{marginBottom:8}}>
            <span style={{background:dark?"rgba(130,79,10,.2)":"#FAEEDA",color:"var(--amber)",padding:"2px 10px",borderRadius:999,fontSize:11,fontWeight:700}}>
              HISTORIA — krótkie najmy
            </span>
            <span style={{fontSize:11,color:"var(--text-muted)",marginLeft:8}}>{history.length} wpisów</span>
          </div>
          <div style={{maxHeight:260,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
            {history.map(h=>(
              <div key={h.id+h.endedAt} style={{display:"flex",gap:8,padding:"6px 10px",
                borderRadius:"var(--radius-sm)",background:dark?"rgba(255,255,255,.03)":"var(--bg-secondary)",
                border:`0.5px solid ${dark?"var(--dark-border)":"var(--border-light)"}`}}>
                <div style={{fontFamily:"monospace",fontSize:11,fontWeight:700,minWidth:70}}>{h.plate||"—"}</div>
                <div style={{flex:1}}>
                  <div style={{fontSize:12,fontWeight:600,color:dark?"var(--dark-text)":"var(--text-primary)"}}>{h.name}</div>
                  <div style={{fontSize:10.5,color:"var(--text-muted)"}}>{h.phone} &nbsp;·&nbsp; {h.price} &nbsp;·&nbsp; Zakończony: {h.endedAt}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── STALI GOŚCIE ─────────────────────────────────────────────────────────────
const DEFAULT_STALI_GOSCIE=[
  {id:"sg-1",name:`ALEX RĄCZKA - PREZES HOTELU`,room:`POBYT ZE ŚNIADANIEM BEZPŁATNY`,company:``,notes:``,priceSeason:``,priceOffSeason:``,meal:``,category:"private",hasFV:false},
  {id:"sg-2",name:`Wojciech Kułaga: manager Ventus z Izb`,room:``,company:``,notes:`Pan płaci za gastronomię normalnie. Nie płaci za pokój`,priceSeason:``,priceOffSeason:``,meal:`płaci w restauracji normalnie`,category:"private",hasFV:false},
  {id:"sg-3",name:`Andrzej Kochanowski`,room:``,company:``,notes:``,priceSeason:`220 zł bez sniadania lub 260 ze sniadaniem dla 1 osoby`,priceOffSeason:`200 zł bez sniadania lub 240 ze sniadaniem dla 1 osoby`,meal:`NIE`,category:"private",hasFV:false},
  {id:"sg-4",name:`Grzegorz Reszczyński`,room:`319, 219`,company:`(MAXTO)`,notes:`MAXTO Proszę o przesyłanie faktur na adres: faktury.elektroniczne@maxtotechnology.pl`,priceSeason:`230/doba ze sniadaniem dla 1 osoby`,priceOffSeason:`230/doba ze sniadaniem dla 1 osoby`,meal:`TAK wliczamy posiłek do zakwaterowania na fakture`,category:"private",hasFV:true},
  {id:"sg-5",name:`Michał Ryba`,room:`122`,company:`(BREMER)`,notes:``,priceSeason:`220 zł bez sniadania lub 250 ze sniadaniem dla 1 osoby`,priceOffSeason:`220 zł bez sniadania lub 250 ze sniadaniem dla 1 osoby`,meal:`NIE`,category:"private",hasFV:true},
  {id:"sg-6",name:`Krzysztof Pamuła`,room:``,company:`(BREMER)`,notes:``,priceSeason:`220 zł bez sniadania lub 260 ze sniadaniem dla 1 osoby`,priceOffSeason:`200 zł bez sniadania lub 240 ze sniadaniem dla 1 osoby`,meal:`NIE`,category:"private",hasFV:true},
  {id:"sg-7",name:`Andrzej Giedrojć`,room:`319`,company:``,notes:``,priceSeason:`CENA OD 2026: 250 ZŁ BEZ SNIADANIA DBL`,priceOffSeason:`230 ZŁ BEZ SNIADANIA DBL`,meal:`NIE`,category:"private",hasFV:false},
  {id:"sg-8",name:`Luca Agostini`,room:`222`,company:``,notes:``,priceSeason:`220 zł bez sniadania lub 260 ze sniadaniem dla 1 osoby`,priceOffSeason:`200 zł bez sniadania lub 240 ze sniadaniem dla 1 osoby`,meal:`NIE`,category:"private",hasFV:false},
  {id:"sg-9",name:`Chesney Lanik („Czesiu”)`,room:``,company:``,notes:`Koniecznie w jego pokoju musi być podwójny materac i więcej poduszek, bardzo często prosi o zamwianie taksówek na miasto`,priceSeason:`200 zł ze śniadaniem w przypadku pobytu na więcej niż 1 doba`,priceOffSeason:`200 zł ze śniadaniem w przypadku pobytu na więcej niż 1 doba`,meal:`TAK Ma wliczane posiłki do rezerwacji i płaci wszystko w recepcji.`,category:"private",hasFV:false},
  {id:"sg-10",name:`Beata Fabianowicz`,room:`216`,company:`(MEDI POLSKA)`,notes:``,priceSeason:`5% zniżki od ceny regularnej`,priceOffSeason:`5% zniżki od ceny regularnej`,meal:`NIE`,category:"private",hasFV:true},
  {id:"sg-11",name:`Adrian Janus`,room:`222, 223`,company:`PRZEDSIĘBIORSTWO INŻYNIERYJNYCH ROBÓT KOLEJOWYCH "TOR - KRAK" SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ`,notes:``,priceSeason:`220 zł bez sniadania lub 260 ze sniadaniem dla 1 osoby`,priceOffSeason:`200 zł bez sniadania lub 240 ze sniadaniem dla 1 osoby`,meal:`NIE`,category:"private",hasFV:true},
  {id:"sg-12",name:`Dorota Ciejka, Magdalena Słobodzian, Agnieszka Gliścińska`,room:`Koniecznie pokoje od osiedla, na pewno nie 123, i jeśli chcą apartament to na pewno nie 106)`,company:`Grupa VAT PEKAO`,notes:``,priceSeason:`210 zł bez sniadania lub 250 ze sniadaniem dla 1 osoby`,priceOffSeason:`200 zł bez sniadania lub 240 ze sniadaniem dla 1 osoby`,meal:`NIE`,category:"private",hasFV:true},
  {id:"sg-13",name:`Radosław Kupis, Mateusz Greczka, Mariusz Świerguła`,room:``,company:`Grupa VAT PEKAO`,notes:``,priceSeason:`210 zł bez sniadania lub 250 ze sniadaniem dla 1 osoby`,priceOffSeason:`200 zł bez sniadania lub 240 ze sniadaniem dla 1 osoby`,meal:`NIE`,category:"private",hasFV:true},
  {id:"sg-14",name:`NORCONSULT Aleksandra Chrupcała`,room:``,company:`NORCONSULT`,notes:`Nie gość, ale pani często robi u nas rezerwacje dla Norconsult (firma na 4 piętrze), więc warto znać :-)`,priceSeason:`240  ZŁ ZE SNIADANIEM DLA 1 OSOBY, 280 ZŁ ZE SNIADANIEM DLA 2 OSÓB`,priceOffSeason:``,meal:`NIE`,category:"private",hasFV:true},
  {id:"sg-15",name:`Piotr Wzgarda`,room:``,company:`P.H.U.PIOTR WZGARDA`,notes:``,priceSeason:`220 zł bez sniadania lub 260 ze sniadaniem dla 1 osoby`,priceOffSeason:`200 zł bez sniadania lub 240 ze sniadaniem dla 1 osoby`,meal:`NIE`,category:"private",hasFV:true},
  {id:"sg-16",name:`Arkadiusz Gąsiorek`,room:``,company:`GWE POL-BUD SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ`,notes:``,priceSeason:`220 zł bez sniadania lub 260 ze sniadaniem dla 1 osoby`,priceOffSeason:`200 zł bez sniadania lub 240 ze sniadaniem dla 1 osoby`,meal:`NIE`,category:"private",hasFV:true},
  {id:"sg-17",name:`Barszczewski Jarosław`,room:`Pan nie ma preferowanego pokoju, ale będzie narzekać jak coś nie działa`,company:`Faktura zazwyczaj brana na CALFERT, NIP: 7010308565`,notes:`Pan robi rezerwacje przez booking. Starszy Pan, narzekający wszędzie (m.in.. opinia na bookingu) na niedziałający domofon do garażu podziemnego.`,priceSeason:`5% zniżki od ceny regularnej`,priceOffSeason:`5% zniżki od ceny regularnej`,meal:`NIE`,category:"private",hasFV:true},
  {id:"sg-18",name:`Jerzy Gralak`,room:`Zawsze pokój od strony osiedla!`,company:`Państwo nie biorą faktury.`,notes:`Zazwyczaj rezerwacja telefoniczna na DBL.`,priceSeason:`230 zł bez sniadania lub 270 zł ze sniadaniem dla 2 osób`,priceOffSeason:`220 zł bez sniadania lub 260 zł ze sniadaniem dla 2 osób`,meal:`NIE`,category:"private",hasFV:false},
  {id:"sg-19",name:`Wiesław Giszczak`,room:``,company:`Pan przyjeżdżał co dwa tygodnie`,notes:``,priceSeason:`5% zniżki od ceny regularnej`,priceOffSeason:`5% zniżki od ceny regularnej`,meal:`NIE`,category:"private",hasFV:false},
  {id:"sg-20",name:`Silvair`,room:``,company:`Silvair Sp. z o.o. | ul. Opolska 100 | 31-323 Kraków | NIP: 9452164348`,notes:``,priceSeason:`230 zł bez sniadania`,priceOffSeason:`210 zł bez sniadania`,meal:`NIE`,category:"company",hasFV:true},
  {id:"sg-21",name:`Firma Wurth`,room:``,company:``,notes:``,priceSeason:`250 zł ze śniadaniem dla 1 osoby lub 210 zł bez śniadania dla 1 osoby`,priceOffSeason:`230 zł ze śniadaniem dla 1 osoby lub 200 zł bez śniadania dla 1 osoby`,meal:`Firma Würth Polska  pokrywa tylko koszt noclegu, parkingu (jeśli nie ma opcji bezpłatnego) i posiłek limitowany do 50 zł brutto, koszt konsumpcji nie może przekraczać 50 zł za 1 dzień pobytu, różnicę pracownik pokrywa indywidualnie. Proszą o dopisek nazwiska osoby nocującej w uwagach.`,category:"company",hasFV:false},
  {id:"sg-22",name:`Infoconsulting`,room:``,company:`Faktura na przelew | Dane do FV: | INFOCONSULTING POLAND SP. Z O.O. | ul. Grzybowska 2/36 00-131 Warszawa | NIP 525 27 50  789`,notes:``,priceSeason:`250 zł ze śniadaniem dla 1 osoby lub 210 zł bez śniadania dla 1 osoby`,priceOffSeason:`230 zł ze śniadaniem dla 1 osoby lub 200 zł bez śniadania dla 1 osoby`,meal:`nie`,category:"company",hasFV:true},
  {id:"sg-23",name:`ENDEGO`,room:``,company:`Faktura na przelew Endego sp. z o.o. | ul. Kołowa 8 | 30-134 Kraków`,notes:``,priceSeason:`250 zł ze śniadaniem dla 1 osoby lub 210 zł bez śniadania dla 1 osoby ORAZ 270 zł ze sniadniem dla 2 osob lub 230 zł bez śniadania dla 2 osób`,priceOffSeason:`250 zł ze śniadaniem dla 1 osoby lub 210 zł bez śniadania dla 1 osoby ORAZ 270 zł ze sniadniem dla 2 osob lub 230 zł bez śniadania dla 2 osób`,meal:`NIE`,category:"company",hasFV:true},
  {id:"sg-24",name:`COLUMBUS ENERGY`,room:``,company:``,notes:``,priceSeason:`Pokój jednoosobowy (SGL BB) – 200 zł/doba (ze śniadaniem) |     Pokój dwuosobowy (TWIN BB) – 220 zł/doba (ze śniadaniem) |     Faktura zbiorcza wystawiana na koniec każdego miesiąca |     Termin płatności: 21 dni od daty wystawienia faktury`,priceOffSeason:``,meal:``,category:"company",hasFV:false},
  {id:"sg-25",name:`Aneta Olejnik`,room:``,company:`BMW FINANCIAL SERVICES POLSKA SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ`,notes:``,priceSeason:`Cena 310 zł ze śniadaniem w sezonie, Bez śniadania 250 zł`,priceOffSeason:``,meal:``,category:"private",hasFV:true},
  {id:"sg-26",name:`Piotr Rutkowski`,room:``,company:`Faktura przelew 7 dni MAXTO TECHNOLOGY SPÓŁKA Z OGRANICZONĄ ODPOWIEDZIALNOŚCIĄ NIP:5130262994`,notes:`Często rezerwacja telefoniczna: 509926773 - MAXTO Proszę o przesyłanie faktur na adres: faktury.elektroniczne@maxtotechnology.pl`,priceSeason:`230 zł doba ze śniadaniem za 1 osobę`,priceOffSeason:`230 zł doba ze śniadaniem za 1 osobę`,meal:``,category:"private",hasFV:true},
  {id:"sg-27",name:`Szymon Brewczyński`,room:``,company:``,notes:``,priceSeason:``,priceOffSeason:``,meal:``,category:"private",hasFV:false},
  {id:"sg-28",name:`"Copa-Data"`,room:``,company:`Goście rezerwują na hasło Copa data i płacą sami na miejscu. Dane do fv mają przekazać recepcji`,notes:`Płacą na miejscu`,priceSeason:`W sezonie ZE ŚNIADANIEM: | - pokój 1 osobowy: 260 PLN / doba | - pokój 2 osobowy: 300 PLN / doba`,priceOffSeason:`Poza sezonem ZE ŚNIADANIEM: | - pokój 1 osobowy: 230 PLN / doba | - pokój 2 osobowy: 270 PLN / doba | - apartament : 360 PLN / doba`,meal:`NIE`,category:"company",hasFV:true},
  {id:"sg-29",name:`Polska Akademia Trenerów i Instruktorów Sportu GREEN WAY SYLWIA SUBIK`,room:``,company:``,notes:``,priceSeason:`W sezonie ze śniadaniem:- pokój 1 osobowy: 270 PLN / doba - pokój 2 osobowy 290 PLN / doba`,priceOffSeason:``,meal:`NIE`,category:"company",hasFV:false},
  {id:"sg-30",name:`Schmitt Christelle`,room:``,company:``,notes:`Pani nocuje u nas od wielu lat. Czasami jej pobyty trwały miesiącami. Bardzo spokojna i miła Pani, bezproblemowa. Zazwyczaj robiła rezerwacje mailowe, ale ostatnio przychodzą one z expedii np..`,priceSeason:``,priceOffSeason:``,meal:`NIE`,category:"private",hasFV:false},
  {id:"sg-31",name:`Świtalska-Skrzypek Ewa`,room:``,company:`Faktura imienna na dane: Świtalska-Skrzypek Ewa, Bydgoszcz 85-685 Zaświat 30/25  Numer rejestracyjny auta: cb518rw.`,notes:`Państwo zazwyczaj robią rezerwację przez BOOKING.`,priceSeason:``,priceOffSeason:``,meal:`NIE`,category:"private",hasFV:true},
  {id:"sg-32",name:`ODNOVA`,room:``,company:`ODNOVA`,notes:`KONFERENCJ/SZKOLENIA`,priceSeason:`250 ZŁ/OSOBA ZE ŚNIADANIEM`,priceOffSeason:``,meal:`NIE`,category:"company",hasFV:true}
];

const STORAGE_KEY_STALI="reception-stali-goscie";

function StaliGosciePanel({dark,isAdmin,currentManager,addAudit}){
  const [guests,setGuests]=React.useState(()=>loadJson(STORAGE_KEY_STALI,DEFAULT_STALI_GOSCIE));
  const [search,setSearch]=React.useState("");
  const [filter,setFilter]=React.useState("all"); // all|private|company
  const [expanded,setExpanded]=React.useState(null);
  const [editing,setEditing]=React.useState(null); // {id, field, value}
  const [showAddForm,setShowAddForm]=React.useState(false);
  const [newGuest,setNewGuest]=React.useState({name:"",room:"",company:"",notes:"",priceSeason:"",priceOffSeason:"",meal:"",category:"private"});

  const save=(updated)=>{setGuests(updated);localStorage.setItem(STORAGE_KEY_STALI,JSON.stringify(updated));};

  const filtered=React.useMemo(()=>{
    const q=search.trim().toLowerCase();
    return guests.filter(g=>{
      if(filter==="private"&&g.category!=="private")return false;
      if(filter==="company"&&g.category!=="company")return false;
      if(!q)return true;
      return[g.name,g.company,g.notes,g.room].some(s=>(s||"").toLowerCase().includes(q));
    });
  },[guests,search,filter]);

  const privateGuests=filtered.filter(g=>g.category==="private");
  const companyGuests=filtered.filter(g=>g.category==="company");

  const addGuest=()=>{
    if(!newGuest.name.trim())return;
    const ne={...newGuest,id:`sg-${Date.now()}`,hasFV:!!newGuest.company};
    const updated=[...guests,ne];
    save(updated);
    setNewGuest({name:"",room:"",company:"",notes:"",priceSeason:"",priceOffSeason:"",meal:"",category:"private"});
    setShowAddForm(false);
    if(isAdmin&&addAudit)addAudit(currentManager,"Dodano stalego goscia: "+ne.name);
  };

  const deleteGuest=(id)=>{
    const g=guests.find(x=>x.id===id);
    save(guests.filter(x=>x.id!==id));
    if(isAdmin&&addAudit&&g)addAudit(currentManager,"Usunieto stalego goscia: "+g.name);
  };

  const dp=dark?"dark-panel":"";
  const inp=dark?"input dark-input":"input";

  const GuestCard=({g})=>{
    const isOpen=expanded===g.id;
    const hasFV=g.hasFV||!!g.company;
    return(
      <div style={{borderRadius:"var(--radius-md)",overflow:"hidden",
                   border:`1px solid ${dark?"var(--dark-border)":"var(--border-light)"}`,
                   marginBottom:6,
                   background:dark?"rgba(255,255,255,.03)":"var(--bg-card)"}}>
        {/* Row header */}
        <div style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",cursor:"pointer"}}
             onClick={()=>setExpanded(isOpen?null:g.id)}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
              <span style={{fontSize:13.5,fontWeight:700,color:dark?"var(--dark-text)":"var(--text-primary)"}}>{g.name}</span>
              {hasFV&&g.company&&(
                <span style={{fontSize:10,padding:"2px 8px",borderRadius:999,
                              background:"var(--plum-soft)",
                              color:"var(--plum)",fontWeight:700}}>
                  FV: {g.company.length>30?g.company.slice(0,30)+"…":g.company}
                </span>
              )}
              {g.room&&(
                <span style={{fontSize:10,padding:"1px 7px",borderRadius:999,
                              background:dark?"rgba(255,255,255,.06)":"var(--bg-secondary)",
                              color:"var(--text-muted)",fontWeight:500}}>
                  pok. {g.room}
                </span>
              )}
            </div>
            {g.priceSeason&&!isOpen&&(
              <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2,
                           whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>
                Sezon: {g.priceSeason.slice(0,60)}{g.priceSeason.length>60?"…":""}
              </div>
            )}
          </div>
          <span style={{color:"var(--text-muted)",fontSize:12,flexShrink:0}}>{isOpen?"▲":"▼"}</span>
        </div>
        {/* Expanded */}
        {isOpen&&(
          <div style={{padding:"0 12px 12px",
                       borderTop:`0.5px solid ${dark?"var(--dark-border)":"var(--border-light)"}`}}>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginTop:10}}>
              {[
                ["Preferowany pokój",g.room],
                ["Firma / FV",g.company],
                ["Cena sezon (kwiecień–październik)",g.priceSeason],
                ["Cena poza sezonem",g.priceOffSeason],
                ["Obiad/posiłek",g.meal],
              ].filter(([,v])=>v).map(([l,v])=>(
                <div key={l} style={{gridColumn:v&&v.length>60?"span 2":"span 1"}}>
                  <div style={{fontSize:10,color:"var(--text-muted)",textTransform:"uppercase",
                               letterSpacing:".05em",fontWeight:600,marginBottom:3}}>{l}</div>
                  <div style={{fontSize:12.5,color:dark?"var(--dark-text)":"var(--text-primary)",
                               lineHeight:1.55,whiteSpace:"pre-wrap"}}>{v}</div>
                </div>
              ))}
              {g.notes&&(
                <div style={{gridColumn:"span 2"}}>
                  <div style={{fontSize:10,color:"var(--amber)",textTransform:"uppercase",
                               letterSpacing:".05em",fontWeight:600,marginBottom:3}}>Uwagi / specjalne życzenia</div>
                  <div style={{fontSize:12.5,color:dark?"var(--dark-text)":"var(--text-primary)",
                               lineHeight:1.55,padding:"8px 10px",
                               background:dark?"rgba(245,208,106,.08)":"var(--gold-bg)",
                               borderRadius:"var(--radius-sm)",border:"1px solid var(--gold-border)",
                               whiteSpace:"pre-wrap"}}>{g.notes}</div>
                </div>
              )}
            </div>
            {isAdmin&&(
              <div style={{marginTop:10,display:"flex",justifyContent:"flex-end"}}>
                <button className="btn btn-danger-outline" style={{fontSize:12}}
                        onClick={()=>deleteGuest(g.id)}>
                  <Trash2 size={13}/> Usuń
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return(
    <div className="stack">
      {/* Topbar: wyszukiwanie + filtry + dodaj */}
      <div className={`panel${dark?" dark-panel":""}`}>
        <div style={{display:"flex",gap:10,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
          <div style={{position:"relative",flex:1,minWidth:200}}>
            <Search size={14} style={{position:"absolute",left:10,top:"50%",transform:"translateY(-50%)",color:"var(--text-muted)"}}/>
            <input className={inp} placeholder="Szukaj gościa, firmy, uwag…"
                   value={search} onChange={e=>setSearch(e.target.value)}
                   style={{paddingLeft:32}}/>
          </div>
          <div style={{display:"flex",gap:5}}>
            {[["all","Wszyscy"],["private","Osoby prywatne"],["company","Firmy"]].map(([v,l])=>(
              <button key={v} onClick={()=>setFilter(v)}
                style={{fontSize:12,padding:"5px 12px",borderRadius:"var(--radius-md)",cursor:"pointer",
                        border:`1px solid ${filter===v?"var(--sky)":"var(--border-light)"}`,
                        background:filter===v?dark?"rgba(88,166,255,.15)":"#E6F1FB":"transparent",
                        color:filter===v?"var(--sky)":"var(--text-muted)",fontWeight:filter===v?600:400}}>
                {l}
              </button>
            ))}
          </div>
          {isAdmin&&(
            <button className="btn btn-emerald" style={{fontSize:12.5,flexShrink:0}}
                    onClick={()=>setShowAddForm(v=>!v)}>
              <Plus size={13}/> Dodaj gościa
            </button>
          )}
        </div>
        {/* Statystyki */}
        <div style={{display:"flex",gap:14,fontSize:12,color:"var(--text-muted)"}}>
          <span>Łącznie: <strong style={{color:dark?"var(--dark-text)":"var(--text-primary)"}}>{guests.length}</strong></span>
          <span>Osoby prywatne: <strong>{guests.filter(g=>g.category==="private").length}</strong></span>
          <span>Firmy: <strong>{guests.filter(g=>g.category==="company").length}</strong></span>
          <span>Z FV: <strong style={{color:"var(--sky)"}}>{guests.filter(g=>g.hasFV||g.company).length}</strong></span>
        </div>
      </div>

      {/* Formularz dodawania (tylko admin) */}
      {showAddForm&&isAdmin&&(
        <div className={`panel${dark?" dark-panel":""}`}>
          <div className="panel-title"><Plus size={15}/> Nowy stały gość</div>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:12}}>
            <div><label>Imię i nazwisko *</label><input className={inp} value={newGuest.name} onChange={e=>setNewGuest(p=>({...p,name:e.target.value}))}/></div>
            <div><label>Preferowany pokój</label><input className={inp} value={newGuest.room} onChange={e=>setNewGuest(p=>({...p,room:e.target.value}))}/></div>
            <div style={{gridColumn:"span 2"}}><label>Firma / dane do FV</label><input className={inp} placeholder="Jeśli gość chce FV na firmę — wpisz dane firmy" value={newGuest.company} onChange={e=>setNewGuest(p=>({...p,company:e.target.value}))}/></div>
            <div><label>Cena sezon</label><input className={inp} value={newGuest.priceSeason} onChange={e=>setNewGuest(p=>({...p,priceSeason:e.target.value}))}/></div>
            <div><label>Cena poza sezonem</label><input className={inp} value={newGuest.priceOffSeason} onChange={e=>setNewGuest(p=>({...p,priceOffSeason:e.target.value}))}/></div>
            <div style={{gridColumn:"span 2"}}><label>Uwagi / specjalne życzenia</label><textarea className={inp} style={{minHeight:70}} value={newGuest.notes} onChange={e=>setNewGuest(p=>({...p,notes:e.target.value}))}/></div>
            <div><label>Obiad/posiłek</label><input className={inp} value={newGuest.meal} onChange={e=>setNewGuest(p=>({...p,meal:e.target.value}))}/></div>
            <div><label>Kategoria</label>
              <select className={inp} value={newGuest.category} onChange={e=>setNewGuest(p=>({...p,category:e.target.value}))}>
                <option value="private">Osoba prywatna</option>
                <option value="company">Firma</option>
              </select>
            </div>
          </div>
          <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
            <button className={dark?"btn btn-outline-dark":"btn btn-outline"} onClick={()=>setShowAddForm(false)}>Anuluj</button>
            <button className="btn btn-emerald" disabled={!newGuest.name.trim()} onClick={addGuest}><Plus size={14}/> Zapisz</button>
          </div>
        </div>
      )}

      {/* Sekcja: Firmy */}
      {(filter==="all"||filter==="company")&&companyGuests.length>0&&(
        <div className={`panel${dark?" dark-panel":""}`} style={{borderLeft:"4px solid var(--plum)"}}>
          <div className="panel-title" style={{marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:11,fontWeight:800,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:".08em"}}>───── FIRMY ({companyGuests.length}) ─────</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {companyGuests.map(g=><GuestCard key={g.id} g={g}/>)}
          </div>
        </div>
      )}

      {/* Sekcja: Osoby prywatne */}
      {(filter==="all"||filter==="private")&&privateGuests.length>0&&(
        <div className={`panel${dark?" dark-panel":""}`} style={{borderLeft:"4px solid var(--gold)"}}>
          <div className="panel-title" style={{marginBottom:14,display:"flex",alignItems:"center",gap:10}}>
            <span style={{fontSize:11,fontWeight:800,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:".08em"}}>───── PRYWATNI ({privateGuests.length}) ─────</span>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {privateGuests.map(g=><GuestCard key={g.id} g={g}/>)}
          </div>
        </div>
      )}

      {filtered.length===0&&(
        <div className={`panel${dark?" dark-panel":""}`}>
          <div className={`empty-box${dark?" empty-box-dark":""}`}>Brak wyników dla "{search}"</div>
        </div>
      )}
    </div>
  );
}

// ─── Correction Approval Modal ────────────────────────────────────────────────
function CorrectionApprovalModal({correction:c,currentManager,onClose,onApprove,onDownload}){
  const [note,setNote]=React.useState("");
  const [mgrSig,setMgrSig]=React.useState(null);
  const approvals=c.approvals||{};
  const alreadyApprovedByMe=approvals[currentManager]?.at;

  return(
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div initial={{opacity:0,scale:.97,y:8}} animate={{opacity:1,scale:1,y:0}} exit={{opacity:0}}
        className="modal large-modal dark-modal"
        style={{maxWidth:600,maxHeight:"90vh",overflowY:"auto"}}
        onClick={e=>e.stopPropagation()}>
        {/* Nagłówek */}
        <div style={{background:"linear-gradient(135deg,#1a1612,#221c14)",borderRadius:"14px 14px 0 0",
                     margin:"-24px -24px 20px",padding:"18px 24px",
                     display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <div style={{color:"#e4e0da",fontWeight:800,fontSize:16,display:"flex",alignItems:"center",gap:8}}>
              <FileText size={16} style={{color:"#c8a050"}}/> Rozpatrz korektę płatności
            </div>
            <div style={{color:"#635e57",fontSize:11.5,marginTop:2}}>
              Kierownik: <span style={{color:"#c8a050",fontWeight:600}}>{getFullName(currentManager)}</span>
            </div>
          </div>
          <button onClick={onClose} style={{background:"rgba(255,255,255,.1)",border:"none",borderRadius:8,
                                            color:"#e4e0da",cursor:"pointer",padding:"6px 8px",display:"flex"}}>
            <X size={14}/>
          </button>
        </div>

        {/* Kto popełnił błąd */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:"#c8503a",textTransform:"uppercase",letterSpacing:".07em",fontWeight:700,marginBottom:6}}>Kto popełnił błąd</div>
          <div style={{background:"rgba(200,80,58,.08)",border:"1px solid rgba(200,80,58,.2)",borderRadius:10,padding:"11px 14px"}}>
            <div style={{fontSize:14,fontWeight:700,color:"#e4e0da"}}>{getFullName(c.submittedBy)}</div>
            <div style={{fontSize:11.5,color:"#635e57",marginTop:2}}>
              {SHIFT_SHORT_LABELS[c.shift]||c.shift||""}{c.shift?" · ":""}{c.submittedAt}
            </div>
          </div>
        </div>

        {/* Dokument */}
        <div style={{display:"flex",gap:8,marginBottom:16,flexWrap:"wrap"}}>
          <div style={{flex:1,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:10,padding:"10px 13px",minWidth:120}}>
            <div style={{fontSize:9.5,color:"#635e57",textTransform:"uppercase",letterSpacing:".07em",marginBottom:3}}>Typ dokumentu</div>
            <div style={{fontSize:13,fontWeight:700,color:"#c8a050",textTransform:"uppercase"}}>{c.docType||"dokument"}</div>
          </div>
          <div style={{flex:2,background:"rgba(255,255,255,.04)",border:"1px solid rgba(255,255,255,.08)",borderRadius:10,padding:"10px 13px"}}>
            <div style={{fontSize:9.5,color:"#635e57",textTransform:"uppercase",letterSpacing:".07em",marginBottom:3}}>Nr dokumentu / rezerwacji</div>
            <div style={{fontSize:13,fontWeight:700,color:"#e4e0da"}}>{c.reservation||"—"}</div>
          </div>
        </div>

        {/* Wyjaśnienie pracownika */}
        <div style={{marginBottom:16}}>
          <div style={{fontSize:10,color:"#6a8acc",textTransform:"uppercase",letterSpacing:".07em",fontWeight:700,marginBottom:6}}>Wyjaśnienie pracownika</div>
          <div style={{background:"rgba(30,40,80,.2)",border:"1px solid rgba(100,130,200,.2)",borderRadius:10,padding:"12px 14px",
                       fontSize:13,color:"#d0ccC6",lineHeight:1.7,whiteSpace:"pre-wrap"}}>
            {c.explanation||c.reason||"—"}
          </div>
        </div>

        {/* Podpis pracownika (jeśli jest) */}
        {c.employeeSignature&&(
          <div style={{marginBottom:16}}>
            <div style={{fontSize:10,color:"#948e85",textTransform:"uppercase",letterSpacing:".07em",fontWeight:700,marginBottom:6}}>Podpis pracownika</div>
            <div style={{background:"#fff",borderRadius:8,padding:6,display:"inline-block",border:"1px solid rgba(255,255,255,.15)"}}>
              <img src={c.employeeSignature} alt="podpis" style={{height:60,display:"block"}}/>
            </div>
          </div>
        )}

        {alreadyApprovedByMe?(
          <div style={{background:"rgba(45,106,79,.15)",border:"1px solid rgba(45,106,79,.3)",borderRadius:10,padding:"12px 14px",marginBottom:16}}>
            <div style={{fontSize:13,fontWeight:600,color:"#5acc94"}}>✓ Już zatwierdzono przez Ciebie — {approvals[currentManager].at}</div>
            {approvals[currentManager].note&&<div style={{fontSize:12,color:"#948e85",marginTop:4}}>Notatka: {approvals[currentManager].note}</div>}
          </div>
        ):(
          <>
            {/* Notatka kierownika */}
            <div style={{marginBottom:16}}>
              <label style={{display:"block",fontSize:11.5,fontWeight:600,color:"#948e85",marginBottom:6,textTransform:"uppercase",letterSpacing:".05em"}}>
                Twoja notatka / korekta (opcjonalnie)
              </label>
              <textarea value={note} onChange={e=>setNote(e.target.value)}
                placeholder="Np. korekta wystawiona 25.03.2026, kwota różnicy +100 zł..."
                style={{width:"100%",minHeight:80,background:"rgba(255,255,255,.05)",border:"1px solid rgba(255,255,255,.12)",
                        borderRadius:8,padding:"9px 12px",fontSize:12.5,color:"#e4e0da",resize:"vertical",lineHeight:1.6}}/>
            </div>
            {/* Podpis kierownika */}
            <div style={{marginBottom:20}}>
              <SignatureCanvas
                label={`Podpis kierownika: ${getFullName(currentManager)}`}
                onSave={setMgrSig}
                height={80}
                dark={true}
              />
            </div>
          </>
        )}

        {/* Status zatwierdzeń */}
        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:20}}>
          {ADMIN_MANAGERS.map(mgr=>{
            const ap=(c.approvals||{})[mgr];
            return(
              <div key={mgr} style={{fontSize:11.5,padding:"4px 12px",borderRadius:999,fontWeight:600,
                                      background:ap?.at?"rgba(45,106,79,.15)":"rgba(255,255,255,.05)",
                                      border:`1px solid ${ap?.at?"rgba(45,106,79,.3)":"rgba(255,255,255,.1)"}`,
                                      color:ap?.at?"#5acc94":"#5f5a54"}}>
                {ap?.at?`[OK] ${getFullName(mgr)}`:`oczekuje: ${mgr}`}
              </div>
            );
          })}
        </div>

        <div style={{display:"flex",gap:9,justifyContent:"flex-end",flexWrap:"wrap"}}>
          <button className="btn btn-outline-dark" onClick={onClose}>Anuluj</button>
          <button className="btn btn-outline-dark" style={{fontSize:12}}
            onClick={()=>onDownload({...c,approvals:{...(c.approvals||{}),[currentManager]:{at:fmtA(),note,signature:mgrSig}}})}>
            <FileDown size={13}/> Pobierz PDF
          </button>
          {!alreadyApprovedByMe&&(
            <button className="btn btn-emerald" onClick={()=>onApprove(c.id,note,mgrSig)}>
              Zatwierdz i zapisz podpis
            </button>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Manual Daily Report Panel ───────────────────────────────────────────────
function ManualDailyReportPanel({showToast}){
  const [selDayKey,setSelDayKey]=React.useState(()=>new Date().toISOString().split("T")[0]);
  const [excluded,setExcluded]=React.useState({}); // id→true = wykluczona ze scalenia

  // Pobierz zmiany dla wybranego dnia (do podglądu)
  const getDayReports=React.useCallback((dayKey)=>{
    const allFull=loadJson(STORAGE_KEYS.reportsFull,[]);
    return allFull.filter(r=>{
      // Podstawowe kryterium: dayKey ustawiony przy zapisie (od zegara startu zmiany)
      if(r.dayKey)return r.dayKey===dayKey;
      // Fallback dla starych raportów bez dayKey: wylicz dayKey z savedAt + shift type
      if(r.savedAt){
        const rDate=new Date(r.savedAt);
        if(isNaN(rDate.getTime()))return false;
        const rShift=r.shiftKey||r.selectedShift;
        if(rShift==="nocna"){
          const d=new Date(rDate);d.setDate(d.getDate()-1);
          return todayKey(d)===dayKey;
        }
        return todayKey(rDate)===dayKey;
      }
      return false;
    });
  },[]);

  const [dayReports,setDayReports]=React.useState(()=>getDayReports(new Date().toISOString().split("T")[0]));

  React.useEffect(()=>{
    setDayReports(getDayReports(selDayKey));
    setExcluded({});
  },[selDayKey,getDayReports]);

  const deleteReport=(id)=>{
    if(!window.confirm("Usunąć tę zmianę z historii? Tej operacji nie można cofnąć."))return;
    const allFull=loadJson(STORAGE_KEYS.reportsFull,[]);
    saveJson(STORAGE_KEYS.reportsFull,allFull.filter(r=>r.id!==id));
    const allRep=loadJson(STORAGE_KEYS.reports,[]);
    saveJson(STORAGE_KEYS.reports,allRep.filter(r=>r.id!==id));
    setDayReports(prev=>prev.filter(r=>r.id!==id));
    showToast("Zmiana usunięta z historii.","info");
  };

  const generate=()=>{
    try{
      const dayReportsFiltered=dayReports.filter(r=>!excluded[r.id]);
      if(!dayReportsFiltered.length){showToast("Brak zmian do raportu (wszystkie wykluczone lub brak danych).","warning");return;}
      const allEmpLog=loadJson(STORAGE_KEYS.employeeLog,[]);
      const dayShifts=allEmpLog.filter(e=>{
        if(!e.loginAt)return false;
        try{const p=e.loginAt.split(", ");const d=p[0].split(".");
          return`${d[2]}-${d[1].padStart(2,"0")}-${d[0].padStart(2,"0")}`===selDayKey;
        }catch{return false;}
      });
      const shiftOrder=["poranna","dzienna","popoludniowa","wieczorowa","nocna"];
      const shiftsData=shiftOrder.map(s=>{
        const emp=dayShifts.find(e=>e.shift===s);
        return emp?{label:SHIFT_LABELS_PL[s]||s,employee:emp.employee,
          time:`${emp.loginAt}${emp.logoutAt?" - "+emp.logoutAt:""}`,completed:!!emp.logoutAt}:null;
      }).filter(Boolean);
      const shiftOrder2=["poranna","dzienna","popoludniowa","wieczorowa","nocna"];
      const sortedDayReports=[...dayReportsFiltered].sort((a,b)=>shiftOrder2.indexOf(a.shiftKey||a.selectedShift)-shiftOrder2.indexOf(b.shiftKey||b.selectedShift));
      const allTasks=[],allCarry=[],cashRows=[],taskStatsList=[];
      sortedDayReports.forEach(r=>{
        const sl=SHIFT_SHORT_LABELS[r.shiftKey||r.selectedShift]||r.shiftKey||"";
        (r.baseTasks||[]).forEach(t=>allTasks.push({status:t.status,shift:sl,text:t.text}));
        (r.carryOver||[]).forEach(t=>allCarry.push({status:t.status,shift:sl,text:t.text}));
        if(r.safeTotal!=null)cashRows.push({label:`${r.employeeName} — ${sl}`,val:fmtMoney(r.safeTotal)});
        else if(r.cashOpeningAmount!=null)cashRows.push({label:`${r.employeeName} — ${sl}`,val:fmtMoney(parseFloat(r.cashOpeningAmount)||0)});
        if(r.taskStats){taskStatsList.push(r.taskStats);}
        else{const done=(r.baseTasks||[]).filter(t=>t.status==="[OK]"||t.status==="✓").length;const total=(r.baseTasks||[]).length;const missing=(r.baseTasks||[]).filter(t=>t.status==="[X]"||t.status==="✗").map(t=>t.text);taskStatsList.push({employee:r.employeeName,shiftKey:r.shiftKey||r.selectedShift,shiftLabel:SHIFT_LABELS_PL[r.shiftKey||r.selectedShift]||r.shiftKey||sl,done,total,missing});}
      });
      const allNotesList=loadJson(STORAGE_KEYS.handoverNotes,[]);
      const dayNotes=allNotesList.filter(n=>{
        try{const p=n.createdAt.split(", ");const d=p[0].split(".");
          return`${d[2]}-${d[1].padStart(2,"0")}-${d[0].padStart(2,"0")}`===selDayKey;
        }catch{return false;}
      }).map(n=>({status:"-",text:`[${SHIFT_SHORT_LABELS[n.shift]||n.shift}] ${n.employee}: ${n.text}`}));
      const allCorrections=loadJson(STORAGE_KEYS.paymentCorrections,[]);
      const dayCorrections=allCorrections.filter(c=>{
        if(!c.submittedAt)return false;
        try{const p=c.submittedAt.split(", ");const d=p[0].split(".");return`${d[2]}-${d[1].padStart(2,"0")}-${d[0].padStart(2,"0")}`===selDayKey;}catch{return false;}
      });
      const hasNocna=dayReports.some(r=>r.shiftKey==="nocna");
      const hasDzienna=dayReports.some(r=>r.shiftKey==="dzienna");
      const dayLabel=new Date(selDayKey).toLocaleDateString("pl-PL",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
      const allEmpRep=loadJson(STORAGE_KEYS.empReports,[]);
      const dayEmpReports=allEmpRep.filter(r=>{
        if(!r.reportDate)return false;
        try{return r.reportDate===selDayKey;}catch{return false;}
      });
      const taskSummary=taskStatsList.map(ts=>({
        employee:ts.employee,
        shift:SHIFT_SHORT_LABELS[ts.shiftKey||ts.selectedShift]||ts.shiftKey||"",
        done:ts.done||0,
        missed:ts.missing?ts.missing.length:((ts.total||0)-(ts.done||0)),
      }));
      downloadDailyReportPDF({
        generatedAt:fmt(),dateLabel:dayLabel,
        shiftMode:hasDzienna||hasNocna?"Dzienna + Nocna":"Poranna + Popoludniowa + Wieczorowa",
        shifts:shiftsData.length?shiftsData:[],
        taskSummary,
        allNotes:dayNotes,cashRows,corrections:dayCorrections,
        empReports:dayEmpReports,
        filename:`raport_dobowy_${selDayKey}.pdf`,
      });
      showToast(`Raport dobowy (${dayReportsFiltered.length} zmian) wygenerowany.`,"success");
    }catch(e){showToast("Blad: "+e.message,"error");}
  };
  const activeCount=dayReports.filter(r=>!excluded[r.id]).length;

  return(
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      {/* Toolbar */}
      <div style={{display:"flex",gap:10,alignItems:"flex-end",flexWrap:"wrap"}}>
        <div>
          <label style={{display:"block",fontSize:11.5,fontWeight:600,color:"#948e85",marginBottom:5}}>Data dnia roboczego</label>
          <input type="date" value={selDayKey} onChange={e=>setSelDayKey(e.target.value)}
            style={{background:"rgba(255,255,255,.06)",border:"1px solid var(--dark-border)",borderRadius:"var(--radius-md)",
                    padding:"7px 12px",fontSize:13,color:"var(--dark-text)",outline:"none"}}/>
        </div>
        <button className="btn btn-emerald" onClick={generate} disabled={activeCount===0}>
          <Download size={14}/> Generuj raport dobowy {activeCount>0?`(${activeCount} zmian)`:""}
        </button>
      </div>

      {/* Lista zmian dla wybranego dnia */}
      {dayReports.length===0?(
        <div style={{fontSize:12.5,color:"#635e57",padding:"10px 0"}}>Brak zapisanych zmian dla tej daty.</div>
      ):(
        <div style={{display:"flex",flexDirection:"column",gap:6}}>
          <div style={{fontSize:11,fontWeight:700,color:"#948e85",textTransform:"uppercase",letterSpacing:".06em",marginBottom:2}}>
            Zmiany w raporcie — odznacz lub usuń niepotrzebne
          </div>
          {dayReports.map(r=>{
            const isExcluded=!!excluded[r.id];
            const shiftLabel=SHIFT_SHORT_LABELS[r.shiftKey||r.selectedShift]||r.shiftKey||"?";
            const time=r.savedAtLabel||r.savedAt?.slice(11,16)||"";
            return(
              <div key={r.id||r.savedAt} style={{display:"flex",alignItems:"center",gap:10,padding:"9px 12px",borderRadius:8,
                background:isExcluded?"rgba(248,113,113,.05)":"rgba(52,211,153,.05)",
                border:`1px solid ${isExcluded?"rgba(248,113,113,.2)":"rgba(52,211,153,.15)"}`,
                opacity:isExcluded?.6:1}}>
                {/* Checkbox */}
                <input type="checkbox" checked={!isExcluded}
                  onChange={()=>setExcluded(prev=>({...prev,[r.id]:!prev[r.id]}))}
                  style={{width:16,height:16,cursor:"pointer",accentColor:"#34d399"}}/>
                <div style={{flex:1}}>
                  <span style={{fontWeight:700,fontSize:13,color:isExcluded?"#635e57":"#e8e4de"}}>{shiftLabel}</span>
                  <span style={{fontSize:12,color:"#635e57",marginLeft:8}}>{r.employeeName}</span>
                  {time&&<span style={{fontSize:11,color:"#484f58",marginLeft:6}}>{time}</span>}
                </div>
                {isExcluded&&<span style={{fontSize:10.5,color:"#f87171",fontWeight:700}}>pominięta</span>}
                {/* Usuń trwale */}
                <button onClick={()=>deleteReport(r.id)}
                  style={{padding:"3px 8px",borderRadius:6,border:"1px solid rgba(248,113,113,.3)",background:"transparent",
                          color:"#f87171",cursor:"pointer",fontSize:11,fontWeight:700,flexShrink:0}}
                  title="Usuń tę zmianę z historii (trwale)">
                  ✕ Usuń
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────────
// ─── Tryb testowy (tylko lokalnie, NIE w buildzie) ─────────────────────────────
// Żeby włączyć: w przeglądarce/DevTools wpisz: localStorage.setItem('dev-test-mode','1')
// Wyłączyć: localStorage.removeItem('dev-test-mode')
const IS_DEV_TEST = typeof localStorage !== 'undefined' && localStorage.getItem('dev-test-mode') === '1';

export default function App(){
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
  const [loginStep,setLoginStep]=useState("name"); // name | password | ready
  const [loginPassword,setLoginPassword]=useState("");
  const [lastView,setLastView]=useState(()=>localStorage.getItem("reception-last-view")||"worker"); // worker | manager
  const [mgrToggleMini,setMgrToggleMini]=useState(()=>localStorage.getItem("reception-mgr-toggle-mini")==="1");
  // Auto-set zmiany na podstawie godziny gdy login kończy się na "ready"
  useEffect(()=>{
    if(loginStep==="ready" && !selectedShift){
      setSelectedShift(autoDetectShift());
    }
  },[loginStep, selectedShift]);
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
  const [wikiEntries,setWikiEntries]=useState(defaultWikiEntries);
  const [showWiki,setShowWiki]=useState(false);
  const [wikiSearch,setWikiSearch]=useState("");
  const [wikiTopic,setWikiTopic]=useState("");
  const [wikiContent,setWikiContent]=useState("");
  const [wikiImages,setWikiImages]=useState([]); // base64 images for current edit
  const [editingWikiId,setEditingWikiId]=useState(null);
  const [selectedWikiId,setSelectedWikiId]=useState(defaultWikiEntries[0]?.id||null);
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
  const [workerDark,setWorkerDark]=useState(()=>localStorage.getItem(STORAGE_KEYS.workerDark)==="true");
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
  const [workerTab_SG,setWorkerTab_SG]=useState(false); // stali goscie shown
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
  // Cash privacy reveal — guests near reception desk; default hidden
  const [cashVisible,setCashVisible]=useState(false);
  // Auto re-hide kwot po opuszczeniu tab "zmiana" (privacy)
  useEffect(()=>{ if(workerTab!=="zmiana") setCashVisible(false); },[workerTab]);
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

  // Inactivity lock — 15 min
  useEffect(()=>{
    const reset=()=>{
      if(lockTimerRef.current)clearTimeout(lockTimerRef.current);
      lockTimerRef.current=setTimeout(()=>setLockedScreen(true),LOCK_TIMEOUT);
    };
    const evs=["mousemove","keydown","mousedown","touchstart"];
    evs.forEach(e=>window.addEventListener(e,reset,{passive:true}));
    reset();
    return()=>{evs.forEach(e=>window.removeEventListener(e,reset));if(lockTimerRef.current)clearTimeout(lockTimerRef.current);};
  },[]);

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
    const loadedWiki=loadJson(STORAGE_KEYS.wiki,defaultWikiEntries);
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
    if(!employeeName.trim()||!selectedShift){showToast("Wybierz pracownika i zmianę.","error");return;}
    // Sprawdz czy wszystkie 3 kategorie ACK juz potwierdzone (ponowne wejscie tego samego dnia/zmiany)
    const dayK=todayKey();
    const ackBase=`ack-${employeeName}-${dayK}-${selectedShift}`;
    const allAck = localStorage.getItem(`${ackBase}-alerts`)==="1"
               && localStorage.getItem(`${ackBase}-standing`)==="1"
               && localStorage.getItem(`${ackBase}-wiki`)==="1";
    if(allAck||inboxCount===0){
      actualStartShift();
      return;
    }
    setShowPreShiftModal(true);
  };
  const actualStartShift=()=>{
    setShowPreShiftModal(false);
    const init={};(tasks[selectedShift]||[]).forEach((_,i)=>{init[i]=false;});setCompleted(init);
    const updated=[{id:crypto.randomUUID(),employee:employeeName,shift:selectedShift,loginAt:fmtA(),logoutAt:""},...employeeActivityLog];
    setEmployeeActivityLog(updated);saveJson(STORAGE_KEYS.employeeLog,updated);setCurrentSessionDate(todayKey());setDismissedReminderKeys([]);
    const cleanedCarry={...carryOverTasks,[selectedShift]:(carryOverTasks[selectedShift]||[]).filter(t=>!t.done)};
    setCarryOverTasks(cleanedCarry);saveJson(STORAGE_KEYS.carry,cleanedCarry);setShiftStartTime(new Date());setStarted(true);setWorkerTab("zadania");
    setCashOpeningAmount(String(stalaKasowa));
    setStalaPotwierdzono(false);setStalaNiezgodnosc(false);
    // Sprawdź płatności po wpłacie nocnej
    const postKWStr=localStorage.getItem("reception-post-deposit-kw");
    if(postKWStr&&!isNaN(parseFloat(postKWStr))&&parseFloat(postKWStr)>0){
      showToast(`Zmiana ${SHIFT_SHORT_LABELS[selectedShift]} rozpoczęta. ⚠️ Nocna miała ${fmtMoney(parseFloat(postKWStr))} zł KW po wpłacie do sejfu — uwzględnione w KW.`,"warning",9000);
      localStorage.removeItem("reception-post-deposit-kw");
    } else {
      showToast(`Zmiana ${SHIFT_SHORT_LABELS[selectedShift]} rozpoczęta. Powodzenia!`,"success");
    }
    // Alert dla Pawła i Weroniki o niezałatwionych korektach
    const allCorrections=loadJson(STORAGE_KEYS.paymentCorrections,[]);
    const pending=allCorrections.filter(c=>!c.done);
    if(pending.length>0&&ADMIN_MANAGERS.includes(employeeName)){
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
        setStarted(false);setCurrentSessionDate("");setDismissedReminderKeys([]);setEmployeeName("");setSelectedShift("");setCashOpeningAmount("");setCashClosingDocumentsAmount("");setCashCurrentAmount("");setCompleted({});setAdditionalTaskInput("");setShiftNoteInput("");setHandoverNote("");setCarryOverTarget("nocna");setFinishDialogOpen(false);setWorkerTab("zmiana");setShiftStartTime(null);localStorage.removeItem(AUTOSAVE_KEY);setAutosaveNote(null);setStalaPotwierdzono(false);setStalaNiezgodnosc(false);setShowSafeDepositModal(false);setSafeDepositKW("");setSafeDepositAmount("");setPostDepositKW("");
        return;
      }
      const anyDone=Object.values(completed).some(v=>v);
      if(anyDone){
        const incident={id:crypto.randomUUID(),employee:employeeName,shift:selectedShift,startedAt:fmtA(shiftStartTime),abandonedAt:fmtA(),minutesActive:Math.round(minElapsed),tasksCompleted:Object.values(completed).filter(v=>v).length,totalTasks:currentTasks.length,resolved:false};
        const updInc=[incident,...loadJson(STORAGE_KEYS.incidentLog,[])].slice(0,100);
        setIncidentLog(updInc);saveJson(STORAGE_KEYS.incidentLog,updInc);
      }
    }
    if(employeeName&&selectedShift)closeEmpEntry();setStarted(false);setCurrentSessionDate("");setDismissedReminderKeys([]);setEmployeeName("");setSelectedShift("");setCashOpeningAmount("");setCashClosingDocumentsAmount("");setCashCurrentAmount("");setCompleted({});setAdditionalTaskInput("");setShiftNoteInput("");setHandoverNote("");setCarryOverTarget("nocna");setFinishDialogOpen(false);setWorkerTab("zmiana");setShiftStartTime(null);localStorage.removeItem(AUTOSAVE_KEY);setAutosaveNote(null);setStalaPotwierdzono(false);setStalaNiezgodnosc(false);setShowSafeDepositModal(false);setSafeDepositKW("");setSafeDepositAmount("");setPostDepositKW("");
    setLoginStep("name");setLoginPassword("");
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
      closeEmpEntry();resetView(true);showToast("Zmiana zakończona — raport PDF zapisany.","success");
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
    setNewGlobalNote("");setNewGlobalNoteShift("");showToast(`Zadanie dodane do zmiany ${SHIFT_SHORT_LABELS[newGlobalNoteShift]}.`,"success");
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
                    onMouseEnter={e_=>{ e_.currentTarget.style.borderColor=dark?"#58a6ff":"#93c5fd"; e_.currentTarget.style.background=dark?"rgba(88,166,255,.08)":"#f0f9ff"; }}
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
          <motion.div key="ew" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <div className="panel glass dark-panel">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18,flexWrap:"wrap",gap:12}}>
                <div className="panel-title" style={{margin:0}}><History size={16}/> Ewidencja godzin pracowników</div>
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <select value={evidenceMonth} onChange={e=>setEvidenceMonth(e.target.value)} className="input dark-input" style={{width:"auto",minWidth:140,padding:"7px 12px"}}>{availableMonths.map(m=><option key={m} value={m}>{m}</option>)}</select>
                  <button className="btn btn-sky" style={{fontSize:12.5}} onClick={exportEvidenceCSV} disabled={!filteredEvidenceLog.length}><Download size={13}/> Eksportuj CSV</button>
                  <button className="btn btn-danger-outline" style={{fontSize:12.5}} onClick={resetEvidenceMonth}><Trash2 size={13}/> Resetuj miesiąc</button>
                  <button className="btn btn-danger-outline" style={{fontSize:12.5}} onClick={resetAllEvidence}><Trash2 size={13}/> Resetuj wszystko</button>
                </div>
              </div>
              <div className="table-wrap">
                <table><thead><tr><th>Pracownik</th><th>Zmiana</th><th>Rozpoczęcie</th><th>Zakończenie</th></tr></thead>
                  <tbody>{filteredEvidenceLog.length?filteredEvidenceLog.map(item=>(<tr key={item.id}><td>{item.employee}</td><td>{SHIFT_LABELS_PL[item.shift]||item.shift}</td><td>{item.loginAt}</td><td>{item.logoutAt||<span style={{color:"var(--gold)",fontWeight:700}}>● Trwa zmiana</span>}</td></tr>)):<tr><td colSpan={4} className="center muted">Brak ewidencji za wybrany miesiąc.</td></tr>}</tbody>
                </table>
              </div>
              {filteredEvidenceLog.length>0&&<div style={{marginTop:12,fontSize:13,color:"var(--text-muted)"}}>Łącznie wpisów: <strong style={{color:"var(--text-primary)",fontFamily:"'DM Serif Display',serif",fontSize:15}}>{filteredEvidenceLog.length}</strong></div>}
            </div>
          </motion.div>
        )}
        {adminTab==="zadania"&&(
          <motion.div key="za" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <div className="panel glass dark-panel">
              <div className="panel-title"><Settings size={16}/> Zarządzanie zadaniami zmian</div>
              <div className="task-form-grid">
                <div><label>Zmiana</label><select className="input dark-input" value={taskShiftTarget} onChange={e=>setTaskShiftTarget(e.target.value)}>{SHIFT_OPTIONS.map(s=><option key={s} value={s}>{SHIFT_LABELS_PL[s]}</option>)}</select></div>
                <div><label>Nowe zadanie</label><input className="input dark-admin-entry" placeholder="Np. potwierdź rezerwacje VIP" value={newTaskText} onChange={e=>setNewTaskText(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addTask()}/></div>
                <div><label>Godzina</label><input className="input dark-input" type="time" value={newTaskTime} onChange={e=>setNewTaskTime(e.target.value)}/></div>
                <div className="align-end"><button className="btn btn-rose full" onClick={addTask}><Plus size={14}/> Dodaj</button></div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:10,padding:"9px 13px",background:"rgba(154,48,64,.08)",border:"1px solid rgba(154,48,64,.2)",borderRadius:"var(--radius-md)"}}>
                <input type="checkbox" id="urgChk" checked={newTaskUrgent} onChange={e=>setNewTaskUrgent(e.target.checked)} style={{width:16,height:16,flexShrink:0}}/>
                <label htmlFor="urgChk" style={{textTransform:"none",fontSize:13,color:"#e07070",fontWeight:600,margin:0,cursor:"pointer",letterSpacing:0}}>Oznacz jako pilne (czerwona ramka na liście zadań pracownika)</label>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10,marginTop:8,padding:"9px 13px",background:"rgba(43,110,138,.08)",border:"1px solid rgba(43,110,138,.2)",borderRadius:"var(--radius-md)"}}>
                <input type="checkbox" id="wdChk" checked={newTaskWeekdaysOnly} onChange={e=>setNewTaskWeekdaysOnly(e.target.checked)} style={{width:16,height:16,flexShrink:0}}/>
                <label htmlFor="wdChk" style={{textTransform:"none",fontSize:13,color:"#6aabcc",fontWeight:600,margin:0,cursor:"pointer",letterSpacing:0}}>Tylko dni robocze — Pon–Pt (zadanie nie pojawia się w sobotę i niedzielę)</label>
              </div>
              <div className="tabs">
                <div className="tab-head">{SHIFT_OPTIONS.map(s=><button key={s} className={`tab-btn ${taskShiftTarget===s?"tab-btn-active":""}`} onClick={()=>setTaskShiftTarget(s)}>{SHIFT_SHORT_LABELS[s]}</button>)}</div>
                <div className="stack">
                  {(tasks[taskShiftTarget]||[]).map((task,index)=>{if(!task)return null;const t=normTask(task,`${taskShiftTarget}-${index}`);return(<div key={`${taskShiftTarget}-${t.id}`} className={`task-row dark-row ${t.urgent?"task-row-urgent":""}`}><div style={{flex:1}}><div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>{t.urgent&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:999,background:"rgba(154,48,64,.25)",color:"#e07070",fontWeight:700,flexShrink:0}}>PILNE</span>}{t.weekdaysOnly&&<span style={{fontSize:10,padding:"1px 7px",borderRadius:999,background:"rgba(43,110,138,.25)",color:"#6aabcc",fontWeight:700,flexShrink:0}}>Pn–Pt</span>}<div>{t.text}</div></div>{t.scheduledTime&&<div className="tiny muted-light">Godzina: {t.scheduledTime}</div>}</div><button className="icon-btn icon-btn-danger" onClick={()=>removeTask(taskShiftTarget,index)}><Trash2 size={14}/></button></div>);})}
                  {!(tasks[taskShiftTarget]||[]).length&&<div className="empty-box empty-box-dark">Brak zadań dla tej zmiany.</div>}
                </div>
              </div>
            </div>
            {/* Powiadomienia globalne */}
            <div className="panel glass dark-panel">
              <div className="panel-title" style={{marginBottom:12}}><Bell size={16}/> Powiadomienia dla wszystkich zmian</div>
              <div style={{fontSize:12.5,color:"var(--dark-text-secondary)",marginBottom:14,lineHeight:1.6}}>Widoczne na ekranie startowym pracownika przed rozpoczęciem zmiany. Każdy może zamknąć u siebie — usunięcia dokonuje kierownik.</div>
              <div style={{display:"flex",gap:0,marginBottom:10,borderRadius:"var(--radius-md)",overflow:"hidden",border:"1px solid rgba(255,255,255,.12)"}}>
                {[["notif","🔔 Powiadomienie"],["task","✓ Zadanie dla zmiany"]].map(([v,l])=>(
                  <button key={v} onClick={()=>setAdminNotifType(v)}
                    style={{flex:1,padding:"8px",border:"none",cursor:"pointer",fontSize:12.5,fontWeight:600,
                            background:adminNotifType===v?"rgba(245,158,11,.18)":"rgba(255,255,255,.05)",
                            color:adminNotifType===v?"#fbbf24":"#948e85"}}>
                    {l}
                  </button>
                ))}
              </div>
              <div style={{display:"grid",gap:10,marginBottom:14}}>
                <input className="input dark-admin-entry"
                  placeholder={adminNotifType==="notif"?"Treść powiadomienia — np. Coś leży na dole recepcji":"Treść zadania — np. Sprawdzić rezerwacje na jutro"}
                  value={newGlobalNote} onChange={e=>setNewGlobalNote(e.target.value)}
                  onKeyDown={e=>e.key==="Enter"&&(adminNotifType==="notif"?addGlobalNotification():addManagerTask())}/>
                <div style={{display:"flex",gap:10,alignItems:"center"}}>
                  <select className="input dark-input" style={{flex:1}} value={newGlobalNoteShift} onChange={e=>setNewGlobalNoteShift(e.target.value)}>
                    <option value="">{adminNotifType==="notif"?"Wszystkie zmiany (ogólne)":"— Wybierz zmianę —"}</option>
                    {SHIFT_OPTIONS.map(s=><option key={s} value={s}>{SHIFT_LABELS_PL[s]}</option>)}
                  </select>
                  {(adminNotifType==="task"||newGlobalNoteShift)&&(
                    <input className="input dark-input" type="date" value={newGlobalNoteDate}
                      onChange={e=>setNewGlobalNoteDate(e.target.value)}
                      style={{width:140,flexShrink:0}} title="Data (dla zadań i przypomnień na konkretny dzień)"/>
                  )}
                  <button className="btn btn-amber" onClick={adminNotifType==="notif"?addGlobalNotification:addManagerTask} disabled={!newGlobalNote.trim()||(adminNotifType==="task"&&!newGlobalNoteShift)}>
                    <Plus size={14}/> {adminNotifType==="notif"?"Dodaj powiadomienie":"Dodaj zadanie"}
                  </button>
                </div>
              </div>
              {globalNotifications.length===0?(
                <div className="empty-box empty-box-dark">Brak aktywnych powiadomień.</div>
              ):(
                <div style={{display:"grid",gap:7}}>
                  {globalNotifications.map(n=>(
                    <div key={n.id} style={{display:"flex",alignItems:"flex-start",gap:10,background:"rgba(245,158,11,.08)",border:"1px solid rgba(245,158,11,.2)",borderRadius:"var(--radius-md)",padding:"10px 13px"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",gap:7,alignItems:"center",marginBottom:4,flexWrap:"wrap"}}>
                          {n.targetShift
                            ?<span style={{fontSize:10.5,padding:"1px 8px",borderRadius:999,background:"rgba(245,158,11,.2)",color:"#fbbf24",fontWeight:700}}>{SHIFT_SHORT_LABELS[n.targetShift]||n.targetShift}</span>
                            :<span style={{fontSize:10.5,padding:"1px 8px",borderRadius:999,background:"rgba(255,255,255,.1)",color:"var(--dark-text-muted)",fontWeight:600}}>Wszystkie zmiany</span>
                          }
                        </div>
                        <div style={{fontSize:13,color:"var(--dark-text)",lineHeight:1.5}}>{n.text}</div>
                        <div style={{fontSize:11,color:"var(--dark-text-muted)",marginTop:3}}>{n.createdBy} · {n.createdAt}</div>
                      </div>
                      <button className="btn btn-danger-outline" style={{fontSize:12,flexShrink:0}} onClick={()=>removeGlobalNotification(n.id)}>Usuń</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
        {adminTab==="pracownicy"&&(
          <motion.div key="pr" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <div className="panel glass dark-panel">
              <div className="panel-title"><Users size={16}/> Zarządzanie pracownikami</div>
              <div className="input-row" style={{marginBottom:14}}>
                <input className="input dark-admin-entry" placeholder="Imię nowego pracownika" value={newEmployeeName} onChange={e=>setNewEmployeeName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addEmployee()}/>
                <button className="btn btn-indigo" onClick={addEmployee}><Plus size={14}/> Dodaj osobę</button>
              </div>
              <div className="stack">
                {employees.map((employee,index)=>{
                  // Statystyki: ilość zmian w bieżącym miesiącu + wskaźnik zakończeń
                  const month=monthKey();
                  const empLog=employeeActivityLog.filter(item=>{
                    if(item.employee!==employee||!item.loginAt)return false;
                    const p=item.loginAt.split(".");if(p.length<3)return false;
                    const y=p[2]?.split(",")[0]?.trim();const m=p[1]?.padStart(2,"0");
                    return`${y}-${m}`===month;
                  });
                  const total=empLog.length;
                  const completed=empLog.filter(i=>i.logoutAt).length;
                  const pct=total>0?Math.round((completed/total)*100):0;
                  return (
                  <div key={`${employee}-${index}`} className="task-row dark-row">
                    {editingEmployeeIndex===index?(<><input className="input dark-admin-entry flex-1" value={editingEmployeeName} onChange={e=>setEditingEmployeeName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&saveEditedEmployee()}/><div className="actions"><button className="btn btn-emerald" onClick={saveEditedEmployee}>Zapisz</button><button className="btn btn-outline-dark" onClick={()=>{setEditingEmployeeIndex(null);setEditingEmployeeName("");}}>Anuluj</button></div></>):(<>
                      <div style={{display:"flex",alignItems:"center",gap:12,flex:1}}>
                        <div style={{width:38,height:38,borderRadius:"50%",background:"var(--plum)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:800,flexShrink:0}}>{employee[0]}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{color:"var(--dark-text)",fontFamily:"'DM Serif Display',serif",fontSize:16,lineHeight:1.2}}>{employee}</div>
                          <div style={{display:"flex",gap:12,marginTop:3,fontSize:11.5,color:"var(--dark-text-muted)"}}>
                            <span>📅 <strong style={{color:"var(--gold)"}}>{total}</strong> zmian/mc</span>
                            {total>0&&<span style={{color:pct>=80?"var(--emerald)":pct>=50?"var(--gold)":"var(--rose)"}}>● {pct}% zakończeń</span>}
                          </div>
                        </div>
                      </div>
                      <div className="actions"><button className="btn btn-outline-dark" onClick={()=>startEditEmployee(index)}>Edytuj</button><button className="btn btn-danger-outline" onClick={()=>removeEmployee(index)}>Usuń</button></div>
                    </>)}
                  </div>
                  );
                })}
                {!employees.length&&<div className="empty-box empty-box-dark">Brak pracowników.</div>}
              </div>
            </div>
          </motion.div>
        )}
        {adminTab==="statystyki"&&(
          <motion.div key="st" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <div className="panel glass dark-panel">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
                <div className="panel-title" style={{margin:0}}><BarChart2 size={16}/> Statystyki tygodniowe</div>
                <button className="btn btn-danger-outline" style={{fontSize:12.5}} onClick={()=>askConfirm("Zresetować wszystkie statystyki? (ewidencja, korekty, raporty)",()=>{setEmployeeActivityLog([]);saveJson(STORAGE_KEYS.employeeLog,[]);setPaymentCorrections([]);saveJson(STORAGE_KEYS.paymentCorrections,[]);saveJson(STORAGE_KEYS.reports,[]);addAudit(currentManager,"Reset wszystkich statystyk");showToast("Statystyki zresetowane.","info");})}><Trash2 size={13}/> Resetuj statystyki</button>
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))",gap:14,marginBottom:20}}>
                {[
                  {label:"Zmian w tym tygodniu",value:weeklyStats.totalShifts,accent:"var(--plum)"},
                  {label:"Zakończonych zmian",value:weeklyStats.completedShifts,accent:"var(--emerald)"},
                  {label:"Wskaźnik zakończeń",value:weeklyStats.completionRate+"%",accent:weeklyStats.completionRate>=80?"var(--emerald)":"var(--rose)"},
                  {label:"Raportów PDF",value:weeklyStats.reportsCount,accent:"var(--plum)"},
                  {label:"Korekty łącznie",value:paymentCorrections.length,accent:"var(--gold)"},
                ].map(s=>(
                  <div key={s.label} style={{background:"var(--bg-card)",borderRadius:"var(--radius-md)",border:"1px solid var(--border-light)",borderLeft:`4px solid ${s.accent}`,padding:"16px 18px"}}>
                    <div style={{fontSize:11,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:8,fontWeight:700}}>{s.label}</div>
                    <div style={{fontSize:32,fontWeight:400,color:"var(--text-primary)",lineHeight:1,fontFamily:"'DM Serif Display',serif"}}>{s.value}</div>
                  </div>
                ))}
              </div>
              {weeklyStats.topEmp&&weeklyStats.topEmp.name&&(
                <div style={{background:"var(--plum-soft)",borderRadius:"var(--radius-md)",border:"1px solid var(--plum-border)",borderLeft:"4px solid var(--plum)",padding:"14px 18px",marginBottom:16,display:"flex",alignItems:"center",gap:14}}>
                  <div style={{width:44,height:44,borderRadius:"50%",background:"var(--plum)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:16,fontWeight:800,flexShrink:0}}>{(weeklyStats.topEmp.name||"?")[0]}</div>
                  <div>
                    <div style={{fontSize:11,color:"var(--plum)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:3,fontWeight:700}}>Najbardziej aktywny pracownik</div>
                    <div style={{fontSize:17,fontWeight:400,color:"var(--text-primary)",fontFamily:"'DM Serif Display',serif"}}>{weeklyStats.topEmp.name} <span style={{fontSize:12,color:"var(--text-muted)",fontWeight:400,fontFamily:"Inter"}}>({weeklyStats.topEmp.count} zmian)</span></div>
                  </div>
                </div>
              )}
              <div style={{fontSize:11.5,color:"var(--text-muted)",marginTop:4}}>
                Statystyki dotyczą bieżącego tygodnia (pon–nd). Dane na podstawie ewidencji w localStorage.
              </div>
              {/* Activity by day */}
              <div style={{marginTop:22,paddingTop:18,borderTop:"1px solid var(--border-light)"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",flexWrap:"wrap",gap:10,marginBottom:12}}>
                  <div style={{fontSize:12,fontWeight:800,color:"var(--text-muted)",textTransform:"uppercase",letterSpacing:".08em"}}>Aktywność dnia</div>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <button style={{background:"var(--bg-card)",border:"1px solid var(--border-medium)",borderRadius:7,color:"var(--text-secondary)",padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:600}} onClick={()=>{const d=new Date(activityDay);d.setDate(d.getDate()-1);setActivityDay(todayKey(d));}}>‹ Wcześniej</button>
                    <input type="date" value={activityDay} onChange={e=>setActivityDay(e.target.value)} style={{background:"var(--bg-card)",border:"1px solid var(--border-medium)",borderRadius:7,padding:"5px 10px",fontSize:12,color:"var(--text-primary)",outline:"none"}}/>
                    <button style={{background:"var(--bg-card)",border:"1px solid var(--border-medium)",borderRadius:7,color:"var(--text-secondary)",padding:"5px 10px",cursor:"pointer",fontSize:12,fontWeight:600}} onClick={()=>{const d=new Date(activityDay);d.setDate(d.getDate()+1);setActivityDay(todayKey(d));}}>Później ›</button>
                    <button style={{background:"var(--plum-soft)",border:"1px solid var(--plum-border)",borderRadius:7,color:"var(--plum)",padding:"5px 12px",cursor:"pointer",fontSize:12,fontWeight:700}} onClick={()=>setActivityDay(todayKey())}>Dziś</button>
                  </div>
                </div>
                <div className="stack">
                  {employeeActivityLog.filter(item=>{
                    if(!item.loginAt)return false;
                    const p=item.loginAt.split(".");
                    if(p.length<3)return false;
                    const y=p[2]?.split(",")[0]?.trim();
                    const m=p[1]?.padStart(2,"0");
                    const d=p[0]?.padStart(2,"0");
                    return`${y}-${m}-${d}`===activityDay;
                  }).map(item=>(
                    <div key={item.id} style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.03)",border:"1px solid rgba(255,255,255,.07)",borderRadius:"var(--radius-md)",padding:"9px 12px"}}>
                      <div style={{width:8,height:8,borderRadius:"50%",background:item.logoutAt?"#2d8659":"#d4a83a",flexShrink:0}}/>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,fontWeight:600,color:"#e8e4de"}}>{item.employee} — {SHIFT_SHORT_LABELS[item.shift]||item.shift}</div>
                        <div style={{fontSize:11,color:"#5f5a54"}}>{item.loginAt}{item.logoutAt?` → ${item.logoutAt}`:""}</div>
                      </div>
                      <span style={{fontSize:11,padding:"2px 8px",borderRadius:999,background:item.logoutAt?"rgba(45,134,89,.2)":"rgba(212,168,58,.15)",color:item.logoutAt?"#2d8659":"#d4a83a",fontWeight:600}}>{item.logoutAt?"Zakończona":"Trwa"}</span>
                    </div>
                  ))}
                  {!employeeActivityLog.filter(item=>{if(!item.loginAt)return false;const p=item.loginAt.split(".");if(p.length<3)return false;const y=p[2]?.split(",")[0]?.trim();const m=p[1]?.padStart(2,"0");const d=p[0]?.padStart(2,"0");return`${y}-${m}-${d}`===activityDay;}).length&&<div className="empty-box empty-box-dark">Brak aktywności dla wybranego dnia.</div>}
                </div>
              </div>
            </div>
          </motion.div>
        )}
        {adminTab==="ustawienia"&&(
          <motion.div key="stb" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="stack">
            {/* Aktualizacje aplikacji — przeniesione z dashboardu pracownika */}
            {!!window.electronAPI && (
              <div className="panel glass dark-panel">
                <div className="panel-title"><RefreshCw size={16}/> Aktualizacje aplikacji</div>
                <UpdateBanner dark={adminDark}/>
              </div>
            )}
            <div className="panel glass dark-panel">
              <div className="panel-title"><Download size={16}/> Backup i przywracanie danych</div>
              <div className="tiny muted-light" style={{marginBottom:12,marginTop:-6}}>Dane przechowywane w pamięci aplikacji. Backup = plik JSON na pendrive.</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                <div style={{background:"rgba(45,106,79,.1)",border:"1px solid rgba(45,106,79,.25)",borderRadius:"var(--radius-md)",padding:"12px"}}>
                  <div style={{fontSize:12.5,fontWeight:700,color:"#5acc94",marginBottom:6}}>📦 Eksport backup</div>
                  <div style={{fontSize:11.5,color:"#635e57",marginBottom:10,lineHeight:1.5}}>Pobierz plik JSON ze wszystkimi danymi recepcji.</div>
                  <button className="btn btn-emerald full" onClick={handleExportBackup}><Download size={13}/> Pobierz backup</button>
                </div>
                <div style={{background:"rgba(90,74,192,.1)",border:"1px solid rgba(90,74,192,.25)",borderRadius:"var(--radius-md)",padding:"12px"}}>
                  <div style={{fontSize:12.5,fontWeight:700,color:"#9b8fe8",marginBottom:6}}>📂 Import backup</div>
                  <div style={{fontSize:11.5,color:"#635e57",marginBottom:10,lineHeight:1.5}}>Przywróć dane z pliku backup. Aplikacja się odświeży.</div>
                  <button className="btn btn-outline-dark full" onClick={handleImportBackup}>📂 Wybierz plik</button>
                </div>
              </div>
            </div>
            {/* Ustawienia */}
            <div className="panel glass dark-panel">
              <div className="panel-title"><Settings size={16}/> Ustawienia</div>
              <div className="stack">
                {[
                  {label:"Dźwięki powiadomień",sub:"Sygnał przy przeterminowanym zadaniu i przypomnieniu",val:soundEnabled,toggle:()=>setSoundEnabled(v=>!v)},
                  {label:"Motyw ciemny — panel kierownictwa",sub:"Przełącz jasny / ciemny",val:adminDark,toggle:()=>setAdminDark(v=>!v)},
                ].map(s=>(
                  <div key={s.label} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"11px 13px",background:"rgba(255,255,255,.04)",border:"1px solid var(--dark-border)",borderRadius:"var(--radius-md)"}}>
                    <div><div style={{fontSize:13,fontWeight:600,color:"var(--dark-text)"}}>{s.label}</div><div style={{fontSize:11.5,color:"var(--dark-text-muted)",marginTop:2}}>{s.sub}</div></div>
                    <button onClick={s.toggle} style={{width:44,height:24,borderRadius:999,border:"none",cursor:"pointer",position:"relative",flexShrink:0,background:s.val?"#a07428":"#524f4b",transition:"background .2s"}}>
                      <span style={{position:"absolute",top:3,width:18,height:18,borderRadius:"50%",background:"#fff",transition:"left .2s",left:s.val?"22px":"3px"}}/>
                    </button>
                  </div>
                ))}
              </div>
            </div>
            {/* Railway — serwer HK */}
            {!!window.electronAPI && <RailwaySettings/>}
          </motion.div>
        )}
        {adminTab==="korekty"&&(
          <motion.div key="ko" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="stack">
            <div className="panel glass dark-panel">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16,flexWrap:"wrap",gap:10}}>
                <div>
                  <div className="panel-title" style={{margin:0}}><FileText size={16}/> Korekty płatności</div>
                  <div style={{fontSize:12.5,color:"var(--text-muted)",marginTop:3}}>
                    {paymentCorrections.length} łącznie · <span style={{color:pendingCorrections.length>0?"var(--gold)":"var(--emerald)",fontWeight:700}}>{pendingCorrections.length} nierozpatrzonych</span>
                  </div>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  {pendingCorrections.length>0&&<button className="btn btn-danger-outline" style={{fontSize:12.5}} onClick={()=>askConfirm("Usunąć całą historię korekt?",()=>{setPaymentCorrections([]);saveJson(STORAGE_KEYS.paymentCorrections,[]);showToast("Historia wyczyszczona.","info");})}><Trash2 size={13}/> Wyczyść historię</button>}
                </div>
              </div>
              {/* Filtry */}
              <div style={{display:"flex",gap:6,marginBottom:16,flexWrap:"wrap"}}>
                {["wszystkie","nierozpatrzone","załatwione"].map(f=>(
                  <button key={f} onClick={()=>setCorrectionFilter(f)}
                    style={{padding:"6px 14px",borderRadius:9,border:"1px solid",fontWeight:700,fontSize:12.5,cursor:"pointer",
                            borderColor:correctionFilter===f?"var(--plum)":"var(--border-medium)",
                            background:correctionFilter===f?"var(--plum-soft)":"transparent",
                            color:correctionFilter===f?"var(--plum)":"var(--text-muted)",textTransform:"capitalize"}}>{f}
                  </button>
                ))}
              </div>
              {paymentCorrections.filter(c=>correctionFilter==="wszystkie"?true:correctionFilter==="nierozpatrzone"?!c.done:c.done).length===0?(
                <div className="empty-box empty-box-dark">Brak korekt w wybranym filtrze.</div>
              ):(
                <div style={{display:"grid",gap:8}}>
                  {paymentCorrections.filter(c=>correctionFilter==="wszystkie"?true:correctionFilter==="nierozpatrzone"?!c.done:c.done).map(c=>{
                    const approvals=c.approvals||{};
                    const approvedBy=Object.keys(approvals);
                    const bothApproved=ADMIN_MANAGERS.every(m=>approvals[m]?.at);
                    const isExpanded=expandedCorrection===c.id;
                    return isExpanded ? (
                    <div key={c.id} style={{borderRadius:"var(--radius-md)",overflow:"hidden",border:"1px solid var(--border-light)",borderLeft:`4px solid ${c.done?"var(--emerald)":"var(--gold)"}`,background:"var(--bg-card)",boxShadow:"var(--shadow-md)"}}>
                      {/* Górna belka statusu */}
                      <div style={{background:c.done?"var(--emerald-light)":"var(--gold-soft, var(--gold-bg))",padding:"11px 16px",
                                   display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,
                                   borderBottom:"1px solid var(--border-light)"}}>
                        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                          <span style={{fontSize:10.5,padding:"2px 10px",borderRadius:999,
                                        background:c.done?"var(--emerald)":"var(--gold)",
                                        color:"#fff",fontWeight:800,
                                        textTransform:"uppercase",letterSpacing:".06em"}}>{c.docType||"dokument"}</span>
                          <span style={{fontSize:14.5,fontWeight:700,color:"var(--text-primary)",fontFamily:"'DM Serif Display',serif"}}>{c.reservation}</span>
                          {c.done&&Object.entries(c.approvals||{}).filter(([,v])=>v?.at).map(([mgr])=>(
                            <span key={mgr} style={{fontSize:10.5,padding:"2px 9px",borderRadius:999,background:"var(--emerald-light)",color:"var(--emerald)",fontWeight:700,border:"1px solid var(--emerald-border)"}}>
                              ✓ {mgr}
                            </span>
                          ))}
                        </div>
                        <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
                          {!c.done&&<button className="btn btn-emerald" style={{fontSize:12,padding:"5px 13px"}}
                            onClick={()=>setCorrectionApprovalModal(c)}>
                            ✓ Rozpatrz i podpisz
                          </button>}
                          <button className="btn btn-outline-dark" style={{fontSize:12,padding:"5px 11px"}}
                            onClick={()=>downloadCorrectionPDF(c,currentManager)} title="Pobierz PDF dla księgowości">
                            <FileDown size={13}/> PDF dla księgowości
                          </button>
                        </div>
                      </div>
                      {/* Treść */}
                      <div style={{padding:"12px 14px",background:"rgba(255,255,255,.02)"}}>
                        {/* Kto popełnił błąd */}
                        <div style={{marginBottom:10}}>
                          <div style={{fontSize:10,color:"#c8503a",textTransform:"uppercase",letterSpacing:".07em",fontWeight:700,marginBottom:3}}>Kto popełnił błąd</div>
                          <div style={{fontSize:13,fontWeight:600,color:"var(--dark-text)"}}>{getFullName(c.submittedBy)}</div>
                          <div style={{fontSize:11,color:"#635e57",marginTop:1}}>
                            {SHIFT_SHORT_LABELS[c.shift]||c.shift||""}{c.shift?" · ":""}{c.submittedAt}
                          </div>
                        </div>
                        {/* Wyjaśnienie */}
                        <div style={{background:"rgba(30,40,80,.15)",borderRadius:8,padding:"10px 13px",borderLeft:"3px solid rgba(100,130,200,.4)",marginBottom:10}}>
                          <div style={{fontSize:10,color:"#6a8acc",textTransform:"uppercase",letterSpacing:".07em",marginBottom:5,fontWeight:700}}>Wyjaśnienie pracownika</div>
                          <div style={{fontSize:12.5,color:"var(--dark-text)",lineHeight:1.7,whiteSpace:"pre-wrap"}}>{c.explanation||c.reason||"—"}</div>
                        </div>
                        {/* Status zatwierdzeń — zawsze widoczny */}
                        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:8}}>
                          {ADMIN_MANAGERS.map(mgr=>{
                            const ap=approvals[mgr];
                            return ap?.at?(
                              <div key={mgr} style={{fontSize:11,padding:"3px 10px",borderRadius:999,
                                   background:"rgba(45,106,79,.15)",color:"#5acc94",
                                   border:"1px solid rgba(45,106,79,.25)",fontWeight:600}}>
                                {getFullName(mgr)} — {ap.at}
                              </div>
                            ):(
                              <div key={mgr} style={{fontSize:11,padding:"3px 10px",borderRadius:999,
                                   background:"rgba(255,255,255,.04)",color:"#5f5a54",
                                   border:"1px solid rgba(255,255,255,.08)"}}>
                                oczekuje: {mgr}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <div style={{padding:"10px 16px",borderTop:"1px solid var(--border-light)",display:"flex",justifyContent:"flex-end"}}>
                        <button className="btn btn-outline" style={{fontSize:11.5}} onClick={()=>setExpandedCorrection(null)}>▴ Zwiń</button>
                      </div>
                    </div>
                    ) : (
                    <div key={c.id}
                      onClick={()=>setExpandedCorrection(c.id)}
                      style={{cursor:"pointer",padding:"10px 16px",borderRadius:"var(--radius-md)",border:"1px solid var(--border-light)",borderLeft:`3px solid ${c.done?"var(--emerald)":"var(--gold)"}`,background:"var(--bg-card)",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",transition:"all .15s"}}
                      onMouseEnter={e=>{e.currentTarget.style.boxShadow="var(--shadow-sm)";e.currentTarget.style.borderLeftWidth="4px";}}
                      onMouseLeave={e=>{e.currentTarget.style.boxShadow="";e.currentTarget.style.borderLeftWidth="3px";}}>
                      {/* Status icon */}
                      <span style={{fontSize:13,color:c.done?"var(--emerald)":"var(--gold)",fontWeight:800}}>
                        {c.done?"✓":"⚠"}
                      </span>
                      {/* Doc type chip */}
                      <span style={{fontSize:10,padding:"2px 9px",borderRadius:999,background:c.done?"var(--emerald)":"var(--gold)",color:"#fff",fontWeight:800,textTransform:"uppercase",letterSpacing:".05em"}}>
                        {c.docType||"dok"}
                      </span>
                      {/* Nr rezerwacji */}
                      <span style={{fontSize:14,fontWeight:700,color:"var(--text-primary)",fontFamily:"'DM Serif Display',serif",minWidth:120}}>
                        {c.reservation||"—"}
                      </span>
                      {/* Kto */}
                      <span style={{fontSize:12,color:"var(--text-secondary)"}}>
                        {getFullName(c.submittedBy)}
                      </span>
                      {/* Data */}
                      <span style={{fontSize:11.5,color:"var(--text-muted)",marginLeft:"auto"}}>
                        {(c.submittedAt||"").split(",")[0]}
                      </span>
                      <span style={{fontSize:11,color:"var(--plum)",fontWeight:700}}>▸</span>
                    </div>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="panel glass dark-panel">
              <div className="panel-title"><Trash2 size={16}/> Reset danych</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
                {[
                  {label:"Wyczyść korekty",sub:"Usuwa całą historię korekt płatności",action:()=>askConfirm("Usunąć całą historię korekt?",()=>{setPaymentCorrections([]);saveJson(STORAGE_KEYS.paymentCorrections,[]);showToast("Korekty wyczyszczone.","info");})},
                  {label:"Reset ewidencji (miesiąc)",sub:"Przejdź do Ewidencji aby wybrać miesiąc",action:()=>setAdminTab("ewidencja")},
                  {label:"Reset całej ewidencji",sub:"Usuwa wszystkie dane godzin pracy",action:()=>askConfirm("Usunąć CAŁĄ ewidencję godzin?",()=>{setEmployeeActivityLog([]);saveJson(STORAGE_KEYS.employeeLog,[]);addAudit(currentManager,"Reset CALEJ ewidencji");showToast("Cała ewidencja usunięta.","info");})},
                  {label:"Reset statystyk",sub:"Ewidencja + korekty + raporty",action:()=>askConfirm("Zresetować wszystkie statystyki?",()=>{setEmployeeActivityLog([]);saveJson(STORAGE_KEYS.employeeLog,[]);setPaymentCorrections([]);saveJson(STORAGE_KEYS.paymentCorrections,[]);saveJson(STORAGE_KEYS.reports,[]);addAudit(currentManager,"Reset wszystkich statystyk");showToast("Statystyki zresetowane.","info");})},
                ].map(item=>(
                  <button key={item.label} onClick={item.action} style={{background:"rgba(255,255,255,.04)",border:"1px solid var(--dark-border)",borderRadius:"var(--radius-md)",padding:"12px 14px",textAlign:"left",cursor:"pointer",transition:"background .15s"}}
                    onMouseEnter={e=>e.currentTarget.style.background="rgba(154,48,64,.1)"}
                    onMouseLeave={e=>e.currentTarget.style.background="rgba(255,255,255,.04)"}>
                    <div style={{fontSize:13,fontWeight:700,color:"var(--dark-text)",marginBottom:3}}>{item.label}</div>
                    <div style={{fontSize:11.5,color:"#635e57"}}>{item.sub}</div>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
        {adminTab==="parking"&&(
          <motion.div key="parking-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <ParkingPanel dark={adminDark} isAdmin={true} showToast={showToast} employees={employees} employeeName={currentManager}/>
          </motion.div>
        )}
        {adminTab==="usterki"&&(
          <motion.div key="usterki-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <FaultsPanel dark={adminDark} employeeName={currentManager} showToast={showToast} floors1={HK_FLOOR1} floors2={HK_FLOOR2} floors3={HK_FLOOR3}/>
          </motion.div>
        )}
        {adminTab==="goscie"&&(
          <motion.div key="goscie-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <StaliGosciePanel dark={adminDark} isAdmin={true} currentManager={currentManager} addAudit={addAudit}/>
          </motion.div>
        )}
        {adminTab==="wiadomosci"&&(
          <motion.div key="wiad" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="stack">
            {/* BENTO: KPI dashboard + skróty */}
            <div className="cc-bento-grid">
              {/* Duża karta — łączna liczba zmian (2 kolumny) */}
              <div className="cc-bento-card cc-bento-2x" style={{borderLeft:"4px solid var(--plum)"}}>
                <div className="cc-bento-label">Zmian w tygodniu</div>
                <div className="cc-bento-value-xl">{weeklyStats.totalShifts}</div>
                <div className="cc-bento-sub">{weeklyStats.completedShifts} zakończonych · {weeklyStats.completionRate}% wskaźnik</div>
                <div className="cc-kpi-bar" style={{marginTop:12}}><div className="cc-kpi-bar-fill" style={{width:`${weeklyStats.completionRate}%`}}/></div>
              </div>
              {/* Aktywni pracownicy */}
              <div className="cc-bento-card" style={{borderLeft:"4px solid var(--emerald)"}}>
                <div className="cc-bento-label">Aktywni pracownicy</div>
                <div className="cc-bento-value">{employeeActivityLog.filter(i=>!i.logoutAt).length}</div>
                <div className="cc-bento-sub">teraz na zmianie</div>
              </div>
              {/* Korekty alert */}
              <div className="cc-bento-card" style={{borderLeft:`4px solid ${pendingCorrections.length>0?"var(--rose)":"var(--emerald)"}`,cursor:"pointer"}} onClick={()=>setAdminTab("korekty")}>
                <div className="cc-bento-label">Korekty</div>
                <div className="cc-bento-value" style={{color:pendingCorrections.length>0?"var(--rose)":undefined}}>
                  {pendingCorrections.length}
                  {pendingCorrections.length>0&&<span style={{fontSize:14,marginLeft:6,verticalAlign:"middle"}}>nowych!</span>}
                </div>
                <div className="cc-bento-sub">{paymentCorrections.length} łącznie</div>
              </div>
              {/* Top pracownik */}
              {weeklyStats.topEmp&&weeklyStats.topEmp.name&&(
                <div className="cc-bento-card" style={{borderLeft:"4px solid var(--gold)"}}>
                  <div className="cc-bento-label">Najbardziej aktywny</div>
                  <div style={{display:"flex",alignItems:"center",gap:10,marginTop:6}}>
                    <div style={{width:36,height:36,borderRadius:"50%",background:"var(--plum)",color:"#fff",display:"flex",alignItems:"center",justifyContent:"center",fontWeight:800,fontSize:14,flexShrink:0}}>{(weeklyStats.topEmp.name||"?")[0]}</div>
                    <div>
                      <div style={{fontFamily:"'DM Serif Display',serif",fontSize:17,color:"var(--dark-text)"}}>{weeklyStats.topEmp.name}</div>
                      <div style={{fontSize:11,color:"var(--text-muted)",marginTop:1}}>{weeklyStats.topEmp.count} zmian</div>
                    </div>
                  </div>
                </div>
              )}
              {/* Wiadomości — szeroka karta */}
              <div className="cc-bento-card cc-bento-2x" style={{borderLeft:`4px solid ${messages.filter(m=>!m.readByAdmin).length>0?"var(--rose)":"var(--plum)"}`}}>
                <div className="cc-bento-label">
                  Wiadomości
                  {messages.filter(m=>!m.readByAdmin).length>0&&<span style={{marginLeft:8,fontSize:10,padding:"2px 8px",borderRadius:999,background:"var(--rose)",color:"#fff",fontWeight:800}}>{messages.filter(m=>!m.readByAdmin).length} NOWYCH</span>}
                </div>
                <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:10,maxHeight:140,overflowY:"auto"}}>
                  {messages.length===0?(
                    <div style={{fontSize:12,color:"var(--text-muted)",fontStyle:"italic"}}>Brak wiadomości.</div>
                  ):messages.slice(0,4).map(m=>(
                    <div key={m.id} style={{padding:"7px 10px",fontSize:12,background:m.readByAdmin?"transparent":"var(--rose-light)",borderRadius:6,borderLeft:`2px solid ${m.type==="bug"?"var(--rose)":"var(--plum)"}`}}>
                      <strong>{m.sender}</strong>: {m.text.slice(0,60)}{m.text.length>60?"…":""}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {/* Pełny panel wiadomości pod bento */}
            <AdminMessagesPanel messages={messages} setMessages={setMessages} dark={adminDark}/>
          </motion.div>
        )}
        {adminTab==="historia"&&(
          <motion.div key="hist" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="stack">
            {/* Ręczne generowanie raportu dobowego */}
            <div className="panel glass dark-panel">
              <div className="panel-title" style={{margin:0,marginBottom:12}}><FileDown size={16}/> Generuj raport dobowy</div>
              <div style={{fontSize:12.5,color:"#948e85",marginBottom:14,lineHeight:1.6}}>
                Raport dobowy generuje się automatycznie po zakończeniu zmiany wieczorowej lub nocnej. Możesz też wygenerować go ręcznie dla dowolnego dnia — zbiera wszystkie raporty zmian z wybranej daty.
              </div>
              <ManualDailyReportPanel showToast={showToast}/>
            </div>
            {incidentLog.filter(i=>!i.resolved).length>0&&(
              <div className="panel" style={{borderLeft:"4px solid var(--rose)",background:"var(--rose-light)"}}>
                <div style={{fontSize:15,fontWeight:400,color:"var(--rose)",marginBottom:12,display:"flex",alignItems:"center",gap:8,fontFamily:"'DM Serif Display',serif"}}><AlertTriangle size={18}/> Niezakończone zmiany bez raportu ({incidentLog.filter(i=>!i.resolved).length})</div>
                <div style={{display:"grid",gap:8}}>
                  {incidentLog.filter(i=>!i.resolved).map(inc=>(
                    <div key={inc.id} style={{background:"var(--bg-card)",border:"1px solid var(--rose-border)",borderLeft:"3px solid var(--rose)",borderRadius:"var(--radius-md)",padding:"12px 15px",display:"flex",gap:12,alignItems:"flex-start"}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:5,alignItems:"center"}}>
                          <span style={{fontSize:13.5,fontWeight:700,color:"var(--text-primary)",fontFamily:"'DM Serif Display',serif"}}>{inc.employee}</span>
                          <span style={{fontSize:10.5,padding:"2px 9px",borderRadius:999,background:"var(--rose)",color:"#fff",fontWeight:800,letterSpacing:".04em",textTransform:"uppercase"}}>{SHIFT_SHORT_LABELS[inc.shift]||inc.shift}</span>
                        </div>
                        <div style={{fontSize:12,color:"var(--text-muted)"}}>Zalogował(a): {inc.startedAt} · Opuścił(a) bez raportu: {inc.abandonedAt}</div>
                        <div style={{fontSize:12,color:"var(--text-muted)",marginTop:2}}>Aktywność: {inc.minutesActive} min · Zadania: {inc.tasksCompleted}/{inc.totalTasks}</div>
                      </div>
                      <button className="btn btn-outline" style={{fontSize:12,flexShrink:0}} onClick={()=>{const u=incidentLog.map(i=>i.id===inc.id?{...i,resolved:true}:i);setIncidentLog(u);saveJson(STORAGE_KEYS.incidentLog,u);}}>Wyjaśnione</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="panel glass dark-panel">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                <div className="panel-title" style={{margin:0}}><ArrowLeftRight size={16}/> Aktywne zadania przekazane</div>
              </div>
              {(()=>{const allCarry=Object.entries(carryOverTasks).flatMap(([shift,tasks])=>(tasks||[]).map(t=>({...t,shift})));
              const active=allCarry.filter(t=>!t.done),done=allCarry.filter(t=>t.done);
              if(!allCarry.length)return <div className="empty-box empty-box-dark">Brak przekazanych zadań.</div>;
              return(<div style={{display:"grid",gap:8}}>
                {active.length>0&&<div style={{fontSize:11,color:"var(--dark-text-muted)",textTransform:"uppercase",letterSpacing:".07em",marginBottom:2}}>Aktywne ({active.length})</div>}
                {active.map((t,i)=>(
                  <div key={t.id||i} style={{display:"flex",gap:10,alignItems:"flex-start",background:"rgba(255,255,255,.04)",border:"1px solid rgba(45,106,79,.25)",borderRadius:"var(--radius-md)",padding:"10px 13px"}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,color:"var(--dark-text)",fontWeight:600,marginBottom:3}}>{t.text}</div>
                      <div style={{fontSize:11,color:"var(--dark-text-muted)"}}>Zmiana: {SHIFT_SHORT_LABELS[t.shift]||t.shift} · Dodane przez: {t.createdBy||"—"} · {t.createdAt||""}</div>
                    </div>
                    <button className="btn btn-danger-outline" style={{fontSize:11.5,flexShrink:0}} onClick={()=>{const u={...carryOverTasks,[t.shift]:(carryOverTasks[t.shift]||[]).filter(x=>x.id!==t.id&&x.text!==t.text)};setCarryOverTasks(u);saveJson(STORAGE_KEYS.carry,u);showToast("Zadanie usunięte.","info");}}>Usuń</button>
                  </div>
                ))}
                {done.length>0&&<div style={{fontSize:11,color:"var(--dark-text-muted)",textTransform:"uppercase",letterSpacing:".07em",marginTop:6,marginBottom:2}}>Wykonane ({done.length})</div>}
                {done.map((t,i)=>(
                  <div key={t.id||i+'d'} style={{display:"flex",gap:10,alignItems:"flex-start",background:"rgba(45,106,79,.06)",border:"1px solid rgba(45,106,79,.2)",borderRadius:"var(--radius-md)",padding:"10px 13px",opacity:.75}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13,color:"var(--dark-text-muted)",textDecoration:"line-through"}}>{t.text}</div>
                      <div style={{fontSize:11,color:"var(--dark-text-muted)"}}>Zmiana: {SHIFT_SHORT_LABELS[t.shift]||t.shift} · {t.doneBy&&`Wykonane: ${t.doneBy}`}</div>
                    </div>
                    <button className="btn btn-danger-outline" style={{fontSize:11.5,flexShrink:0}} onClick={()=>{const u={...carryOverTasks,[t.shift]:(carryOverTasks[t.shift]||[]).filter(x=>x.id!==t.id&&x.text!==t.text)};setCarryOverTasks(u);saveJson(STORAGE_KEYS.carry,u);showToast("Zadanie usunięte.","info");}}>Usuń</button>
                  </div>
                ))}
              </div>);})()} 
            </div>
            <div className="panel glass dark-panel">
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14,flexWrap:"wrap",gap:8}}>
                <div className="panel-title" style={{margin:0}}><Bell size={16}/> Historia powiadomień i przypomnień</div>
                <div style={{display:"flex",gap:8,alignItems:"center"}}>
                  <span style={{fontSize:12,color:"#635e57"}}>{handoverLog.length} wpisów</span>
                  {handoverLog.length>0&&<button className="btn btn-danger-outline" style={{fontSize:12}} onClick={()=>askConfirm("Wyczyścić historię przekazań?",()=>{setHandoverLog([]);saveJson(STORAGE_KEYS.handoverLog,[]);showToast("Historia wyczyszczona.","info");})}><Trash2 size={12}/> Wyczyść</button>}
                </div>
              </div>
              {handoverLog.length===0?(
                <div className="empty-box empty-box-dark">Brak historii przekazań.</div>
              ):(
                <div style={{display:"grid",gap:8,maxHeight:520,overflowY:"auto"}}>
                  {handoverLog.map(log=>(
                    <div key={log.id} style={{background:log.type==="reminder"?"rgba(43,110,138,.07)":"rgba(45,106,79,.06)",border:`1px solid ${log.type==="reminder"?"rgba(43,110,138,.25)":"rgba(45,106,79,.2)"}`,borderRadius:"var(--radius-md)",padding:"11px 14px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:10,marginBottom:6}}>
                        <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center"}}>
                          <span style={{fontSize:10.5,padding:"2px 9px",borderRadius:999,background:log.type==="reminder"?"rgba(43,110,138,.2)":"rgba(45,106,79,.2)",color:log.type==="reminder"?"#6aabcc":"#5acc94",fontWeight:700,textTransform:"uppercase",letterSpacing:".05em"}}>{log.type==="reminder"?"Przypomnienie":"Zadanie"}</span>
                          <span style={{fontSize:12.5,fontWeight:700,color:"var(--dark-text)"}}>{log.from}</span>
                          <span style={{fontSize:11.5,color:"#635e57"}}>→ {SHIFT_SHORT_LABELS[log.toShift]||log.toShift}</span>
                          {log.type==="reminder"&&log.targetDate&&<span style={{fontSize:11,padding:"1px 7px",borderRadius:999,background:"rgba(43,110,138,.15)",color:"#6aabcc",fontWeight:600}}>{log.targetDate}</span>}
                        </div>
                        <span style={{fontSize:11,color:"#5f5a54",flexShrink:0,whiteSpace:"nowrap"}}>{log.createdAt}</span>
                      </div>
                      <div style={{fontSize:13,color:"var(--dark-text)",lineHeight:1.55}}>{log.text}</div>
                      <div style={{fontSize:11,color:"#5f5a54",marginTop:5}}>Ze zmiany: {SHIFT_SHORT_LABELS[log.fromShift]||log.fromShift||"—"}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {incidentLog.length>0&&(
              <div className="panel glass dark-panel">
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                  <div className="panel-title" style={{margin:0,color:"#e07070"}}><AlertTriangle size={16}/> Historia incydentów</div>
                  <button className="btn btn-danger-outline" style={{fontSize:12}} onClick={()=>askConfirm("Wyczyścić historię incydentów?",()=>{setIncidentLog([]);saveJson(STORAGE_KEYS.incidentLog,[]);showToast("Historia incydentów wyczyszczona.","info");})}><Trash2 size={12}/> Wyczyść</button>
                </div>
                <div style={{display:"grid",gap:7,maxHeight:320,overflowY:"auto"}}>
                  {incidentLog.map(inc=>(
                    <div key={inc.id} style={{background:inc.resolved?"rgba(45,106,79,.05)":"rgba(154,48,64,.07)",border:`1px solid ${inc.resolved?"rgba(45,106,79,.2)":"rgba(154,48,64,.25)"}`,borderRadius:"var(--radius-md)",padding:"10px 13px",display:"flex",alignItems:"flex-start",gap:10}}>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",gap:7,flexWrap:"wrap",alignItems:"center",marginBottom:4}}>
                          <span style={{fontSize:12.5,fontWeight:700,color:"var(--dark-text)"}}>{inc.employee}</span>
                          <span style={{fontSize:11,padding:"2px 7px",borderRadius:999,background:"rgba(154,48,64,.2)",color:"#e07070",fontWeight:600}}>{SHIFT_SHORT_LABELS[inc.shift]||inc.shift}</span>
                          {inc.resolved&&<span style={{fontSize:11,padding:"2px 7px",borderRadius:999,background:"rgba(45,106,79,.2)",color:"#5acc94",fontWeight:600}}>✓ Wyjaśnione</span>}
                        </div>
                        <div style={{fontSize:11.5,color:"#948e85"}}>{inc.startedAt} → {inc.abandonedAt} · {inc.minutesActive} min · {inc.tasksCompleted}/{inc.totalTasks} zadań</div>
                      </div>
                      {!inc.resolved&&<button className="btn btn-outline-dark" style={{fontSize:11.5,flexShrink:0}} onClick={()=>{const u=incidentLog.map(i=>i.id===inc.id?{...i,resolved:true}:i);setIncidentLog(u);saveJson(STORAGE_KEYS.incidentLog,u);}}>Wyjaśnione</button>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
        {adminTab==="wiki"&&(
          <motion.div key="wiki-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <div className="panel glass dark-panel">
              <div className="panel-title"><BookOpen size={16}/> Wiki recepcji</div>
              <div style={{fontSize:12.5,color:"#948e85",marginBottom:14}}>Baza wiedzy widoczna dla pracowników. Dodaj lub edytuj tematy w panelu Wiki (ikonka w górnym pasku).</div>
              <div style={{display:"grid",gap:8}}>
                {wikiEntries.map(e=>(
                  <div key={e.id} style={{background:"rgba(255,255,255,.04)",border:"1px solid var(--dark-border)",borderRadius:"var(--radius-md)",padding:"12px 14px",display:"flex",alignItems:"flex-start",gap:12}}>
                    <div style={{flex:1}}>
                      <div style={{fontSize:13.5,fontWeight:700,color:"var(--dark-text)",marginBottom:3}}>{e.topic}</div>
                      <div style={{fontSize:12,color:"#635e57",marginBottom:6,lineHeight:1.5,maxHeight:48,overflow:"hidden"}}>{e.content}</div>
                      <div style={{fontSize:11,color:"#5f5a54"}}>Aktualizacja: {e.updatedAt}</div>
                    </div>
                    <button className="btn btn-outline-dark" style={{fontSize:12,flexShrink:0}} onClick={()=>{startEditWiki(e);setShowWiki(true);}}>Edytuj</button>
                  </div>
                ))}
                {!wikiEntries.length&&<div className="empty-box empty-box-dark">Brak wpisów wiki.</div>}
              </div>
            </div>
          </motion.div>
        )}
        {adminTab==="kasa"&&(
          <motion.div key="kasa-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}} className="stack">
            <div className="panel glass dark-panel">
              <div className="panel-title"><Settings size={16}/> Stała kasowa — zarządzanie</div>
              <div style={{textAlign:"center",padding:"20px 0 12px",background:"var(--plum-soft)",borderRadius:"var(--radius-md)",margin:"0 -4px 18px",border:"1px solid var(--plum-border)"}}>
                <div style={{fontSize:11,color:"var(--plum)",textTransform:"uppercase",letterSpacing:".08em",marginBottom:8,fontWeight:800}}>Aktualna stała kasowa</div>
                <div style={{fontSize:46,fontWeight:400,color:"var(--plum)",letterSpacing:"-1.5px",lineHeight:1,fontFamily:"'DM Serif Display',serif"}}>{fmtMoney(stalaKasowa)}</div>
              </div>
              <div style={{display:"grid",gap:10,marginTop:4}}>
                <div style={{fontSize:12.5,color:"var(--text-muted)"}}>Zmień stałą kasową (tylko kierownik):</div>
                <div style={{display:"flex",gap:10}}>
                  <input className="input dark-admin-entry" type="number" min="0" step="0.01" placeholder="Nowa wartość stałej kasowej" value={managerNewStala} onChange={e=>setManagerNewStala(e.target.value)} style={{flex:1}}/>
                  <button className="btn btn-amber" onClick={()=>setStalaKasowaByManager(managerNewStala)} disabled={!managerNewStala.trim()}>Zapisz</button>
                </div>
              </div>
            </div>
            {/* Log wpłat do sejfu */}
            <div className="panel glass dark-panel">
              <div className="panel-title"><History size={16}/> Operacje kasowe</div>
              {(()=>{const log=loadJson("reception-kasa-log",[]);return log.length===0?(
                <div className="empty-box empty-box-dark">Brak operacji.</div>
              ):(
                <div style={{display:"grid",gap:6,maxHeight:280,overflowY:"auto"}}>
                  {log.slice(0,20).map(e=>(
                    <div key={e.id} style={{background:e.type==="post_wplata"?"rgba(160,116,40,.08)":"rgba(255,255,255,.04)",border:"1px solid var(--dark-border)",borderRadius:"var(--radius-md)",padding:"9px 13px"}}>
                      <div style={{fontSize:12.5,color:"var(--dark-text)",lineHeight:1.5}}>{e.text}</div>
                      <div style={{fontSize:11,color:"#635e57",marginTop:2}}>{e.from} · {SHIFT_SHORT_LABELS[e.shift]||e.shift} · {e.createdAt}</div>
                    </div>
                  ))}
                </div>
              );})()}
            </div>
            {/* Historia zmian stałej kasowej */}
            <div className="panel glass dark-panel">
              <div className="panel-title"><History size={16}/> Historia zmian stałej kasowej</div>
              {(()=>{const log=loadJson("reception-stala-kasowa-log",[]);return log.length===0?(
                <div className="empty-box empty-box-dark">Brak historii zmian.</div>
              ):(
                <div style={{display:"grid",gap:7,maxHeight:320,overflowY:"auto"}}>
                  {log.slice(0,10).map(entry=>(
                    <div key={entry.id} style={{background:"rgba(255,255,255,.04)",border:"1px solid var(--dark-border)",borderRadius:"var(--radius-md)",padding:"10px 13px",display:"flex",alignItems:"center",gap:12}}>
                      <div style={{flex:1}}>
                        <div style={{fontSize:13,color:"var(--dark-text)",fontWeight:600}}>{fmtMoney(entry.from)} → {fmtMoney(entry.to)}</div>
                        <div style={{fontSize:11,color:"#635e57",marginTop:2}}>{entry.changedBy} · {entry.changedAt}</div>
                      </div>
                    </div>
                  ))}
                </div>
              );})()}
            </div>
            {/* Niezgodności kasowe */}
            <div className="panel glass dark-panel">
              <div className="panel-title" style={{color:"#e07070"}}><AlertTriangle size={16}/> Zgłoszone niezgodności kasowe</div>
              {(()=>{const discrepancies=messages.filter(m=>m.type==="cash_discrepancy");return discrepancies.length===0?(
                <div className="empty-box empty-box-dark">Brak zgłoszonych niezgodności.</div>
              ):(
                <div style={{display:"grid",gap:8,maxHeight:400,overflowY:"auto"}}>
                  {discrepancies.map(m=>(
                    <div key={m.id} style={{background:"rgba(154,48,64,.07)",border:"1px solid rgba(154,48,64,.25)",borderRadius:"var(--radius-md)",padding:"11px 14px"}}>
                      <div style={{fontSize:13,color:"var(--dark-text)",lineHeight:1.55,marginBottom:4}}>{m.text}</div>
                      <div style={{fontSize:11,color:"#635e57"}}>{m.from} · {SHIFT_SHORT_LABELS[m.shift]||m.shift} · {m.createdAt}</div>
                    </div>
                  ))}
                </div>
              );})()}
            </div>
          </motion.div>
        )}
        {adminTab==="kwhotel"&&(
          <motion.div key="kwhotel-a" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <KWHotelAdminPanel dark={adminDark} showToast={showToast}/>
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
                    <div style={{fontSize:10.5,color:"#6d28d9",marginTop:8}}>Raporty zostaną zapisane z wybraną datą — użyj do testowania raportu dobowego</div>
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
                              <div style={{fontSize:11,color:"var(--text-muted)"}}>System wykrył Twoją zmianę z godziny komputera</div>
                            </div>
                          </div>
                          <button className="btn btn-outline" style={{fontSize:11.5}} onClick={()=>{
                            setLoginStep("name");setEmployeeName("");setSelectedShift("");
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
              <div className="stack">
                {/* HERO — powitanie */}
                <div className="cc-dash-hero">
                  <div>
                    <div className="cc-dash-greeting">{(()=>{const h=new Date().getHours();return h<10?"Dzień dobry":h<18?"Dobre popołudnie":"Dobry wieczór";})()}, {employeeName}</div>
                    <div className="cc-dash-sub">Twoja zmiana zaczęła się o {shiftStartTime?new Date(shiftStartTime).toLocaleTimeString("pl-PL",{hour:"2-digit",minute:"2-digit"}):"—"} · trwa {shiftElapsed||"chwilę"}</div>
                  </div>
                  <div className="cc-dash-hero-clock">{liveTime}</div>
                </div>

                {/* KPI GRID — 4 metryki + alerty (R2 wariant A) */}
                <div className="cc-kpi-grid">
                  <div
                    className="cc-kpi cc-kpi-plum"
                    onClick={()=>setWorkerTab("zadania")}
                    style={{cursor:"pointer"}}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setWorkerTab("zadania");}}}
                    title="Otwórz Zadania">
                    <div className="cc-kpi-label">Zadania</div>
                    <div className="cc-kpi-value">{totalDone}<span className="cc-kpi-of">/{totalMandatory}</span></div>
                    <div className="cc-kpi-bar"><div className="cc-kpi-bar-fill" style={{width:`${progress}%`}}/></div>
                    <div className="cc-kpi-sub">{progress}% wykonania</div>
                  </div>
                  <div className="cc-kpi cc-kpi-gold">
                    <div className="cc-kpi-label" style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                      <span>Kasa (stała)</span>
                      <button
                        onClick={()=>setCashVisible(v=>!v)}
                        title={cashVisible?"Ukryj kwoty (gość przy recepcji)":"Pokaż kwoty"}
                        aria-label={cashVisible?"Ukryj kwoty":"Pokaż kwoty"}
                        style={{background:"none",border:"none",cursor:"pointer",padding:2,color:"var(--text-muted)",display:"flex",alignItems:"center"}}>
                        {cashVisible?<EyeOff size={13}/>:<Eye size={13}/>}
                      </button>
                    </div>
                    <div className="cc-kpi-value cc-kpi-money" aria-live="polite">{cashVisible?fmtMoney(stalaKasowa):"•••"}<span className="visually-hidden">{cashVisible?"":" (kwota ukryta — kliknij oko aby pokazać)"}</span></div>
                    <div className="cc-kpi-sub">
                      {stalaPotwierdzono&&!stalaNiezgodnosc?<span style={{color:"var(--emerald)"}}>✓ Potwierdzona</span>:
                       stalaNiezgodnosc?<span style={{color:"var(--rose)"}}>⚠ Niezgodność</span>:
                       <span style={{color:"var(--gold)"}}>● Wymaga potwierdzenia</span>}
                    </div>
                  </div>
                  <div className="cc-kpi cc-kpi-emerald">
                    <div className="cc-kpi-label">KW dokumentów</div>
                    <div className="cc-kpi-value cc-kpi-money">{cashVisible?(cashClosingDocumentsAmount?fmtMoney(parseFloat(cashClosingDocumentsAmount)||0):"—"):"•••"}</div>
                    <div className="cc-kpi-sub">{cashDiff!==null?(cashVisible?`Łącznie: ${fmtMoney(cashDiff)}`:"Łącznie: •••"):"Wpisz na koniec"}</div>
                  </div>
                  <div className="cc-kpi cc-kpi-plum">
                    <div className="cc-kpi-label">Trwa zmiana</div>
                    <div className="cc-kpi-value">{shiftElapsed||"—"}</div>
                    <div className="cc-kpi-sub">{SHIFT_SHORT_LABELS[selectedShift]}</div>
                  </div>
                  <div
                    className={`cc-kpi ${inboxCount===0?"cc-kpi-emerald":inboxCount>5?"cc-kpi-rose":"cc-kpi-gold"}`}
                    onClick={()=>setWorkerTab("informacje")}
                    style={{cursor:"pointer"}}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e)=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();setWorkerTab("informacje");}}}
                    title="Otwórz Informacje">
                    <div className="cc-kpi-label"><Bell size={11} style={{display:"inline",verticalAlign:"middle",marginRight:4}}/>Alerty</div>
                    <div className="cc-kpi-value">{inboxCount}</div>
                    <div className="cc-kpi-sub">{inboxCount===0?"Nic nowego":"Zobacz Informacje →"}</div>
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
                <div className="cc-handover-from">{SHIFT_LABELS_PL[selectedShift]}</div>
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
            <HKPanel dark={workerDark} hkDate={hkDate} setHkDate={setHkDate}
                     hkStaff={hkStaff} setHkStaff={setHkStaff}
                     hkData={hkData} setHkData={setHkData}
                     showToast={showToast}/>
          </motion.div>
        )}
        {workerTab==="informacje"&&(
          <motion.div key="informacje" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <InboxPanel dark={workerDark} employeeName={employeeName} selectedShift={selectedShift} wikiEntries={wikiEntries} onOpenWiki={()=>setShowWiki(true)}/>
          </motion.div>
        )}
        {workerTab==="usterki"&&(
          <motion.div key="usterki" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <FaultsPanel dark={workerDark} employeeName={employeeName||currentManager} showToast={showToast} floors1={HK_FLOOR1} floors2={HK_FLOOR2} floors3={HK_FLOOR3}/>
          </motion.div>
        )}
        {workerTab==="hklive"&&(
          <motion.div key="hklive" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <HKLivePanel dark={workerDark} hkData={hkData} setHkData={setHkData} hkDate={hkDate} hkStaff={hkStaff} showToast={showToast} isManager={!!currentManager}/>
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
        {workerTab==="kwhotel"&&(
          <motion.div key="kwhotel" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
            <KWHotelPanel dark={workerDark} hkData={hkData} setHkData={setHkData}/>
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

  const appShellClass=`app-shell ${(isAdmin&&showAdminPanel)?(adminDark?"dark-shell":"light-shell"):workerDark?"dark-shell":"light-shell"}`;

  if(lockedScreen){
    const unlock=()=>{
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
          Brak aktywności przez 15 minut.<br/>Kliknij aby kontynuować.
        </div>
        <button className="lock-emp-btn" style={{marginTop:8,pointerEvents:"none"}}>Kliknij aby odblokować</button>
        <div className="lock-timer">Conrad Comfort · Panel Recepcji</div>
      </div>
    );
  }

  // ── Pelnoekranowy login (B4) — widoczny TYLKO przed wyborem zmiany ─────────
  // Pokaz gdy nikt nie pracuje (!started) i nie jest w stanie ready (czyli nie zalogowany)
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
                  onClick={()=>setEmployeeName(employeeActivityLog[0].employee)}
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
                onChange={e=>{const v=e.target.value;setEmployeeName(v.charAt(0).toUpperCase()+v.slice(1));}}
                onKeyDown={e=>{
                  if(e.key==="Enter"&&employeeName.trim()){
                    const trimmed=employeeName.trim();
                    if(ADMIN_MANAGERS.includes(trimmed)) setLoginStep("password");
                    else setLoginStep("ready");
                  }
                }}
              />
              <datalist id="cc-emp-list-main">
                {employees.map(e=><option key={e} value={e}/>)}
                {ADMIN_MANAGERS.map(m=><option key={"m_"+m} value={m}/>)}
              </datalist>
              <button
                className="cc-login-btn"
                disabled={!employeeName.trim()}
                onClick={()=>{
                  const trimmed=employeeName.trim();
                  if(ADMIN_MANAGERS.includes(trimmed)) setLoginStep("password");
                  else setLoginStep("ready");
                }}>
                Dalej →
              </button>
              <div className="cc-login-hint">Kierownicy zostaną poproszeni o hasło</div>
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
                onKeyDown={e=>{
                  if(e.key==="Enter"){
                    if(loginPassword===ADMIN_PASSWORD){
                      setLoginPassword("");
                      setCurrentManager(employeeName);
                      setIsAdmin(true);
                      localStorage.setItem(STORAGE_KEYS.adminSession,"true");
                      localStorage.setItem(STORAGE_KEYS.adminUser,employeeName);
                      logManagerLogin(employeeName);
                      setLoginStep("ready");
                      showToast(`Zalogowano jako kierownik: ${employeeName}`,"success");
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
                  onClick={()=>{
                    if(loginPassword===ADMIN_PASSWORD){
                      setLoginPassword("");
                      setCurrentManager(employeeName);
                      setIsAdmin(true);
                      localStorage.setItem(STORAGE_KEYS.adminSession,"true");
                      localStorage.setItem(STORAGE_KEYS.adminUser,employeeName);
                      logManagerLogin(employeeName);
                      setLoginStep("ready");
                      showToast(`Zalogowano jako kierownik: ${employeeName}`,"success");
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
                onClick={()=>{setLoginPassword("");setLoginStep("ready");showToast("Tryb pracownika — bez panelu kierownika.","info");}}>
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
            showToast={showToast}
          />
        ):(
          <WorkerSidebar activeTab={workerTab} setActiveTab={setWorkerTab} started={started} overdueCount={overdueTasks.length} datedCount={todayDatedReminders.length} setShowWiki={setShowWiki} setShowEmpReport={setShowEmpReport} isAdmin={isAdmin} currentManager={currentManager} setShowAdminPanel={setShowAdminPanel} setShowSearch={setShowSearch} workerDark={workerDark} setWorkerDark={setWorkerDark} setShowPaymentForm={setShowPaymentForm} employeeName={employeeName} selectedShift={selectedShift} onShowMsg={()=>setShowMsgModal(true)} liveTime={liveTime} shiftElapsed={shiftElapsed} progress={progress} totalDone={totalDone} totalMandatory={totalMandatory} onOpenFinish={()=>setFinishDialogOpen(true)} inboxCount={inboxCount} faultsCount={faultsCount} showToast={showToast}/>
        )}
        <main className={`worker-content${(isAdmin&&showAdminPanel&&!adminDark)?" admin-light":""}${(!isAdmin||!showAdminPanel)&&workerDark?" dark-main":""}${isAdmin&&showAdminPanel&&adminDark?" dark-main":""}`}><div className="container">{(isAdmin&&showAdminPanel)?adminPanel:workerView}</div></main>
      </div>
      <AnimatePresence>{showWiki&&wikiDrawer}</AnimatePresence>
      <AnimatePresence>{showMsgModal&&<MessageModal key="msgm" onClose={()=>setShowMsgModal(false)} employeeName={employeeName} employees={employees} messages={messages} setMessages={setMessages} dark={dark}/>}</AnimatePresence>
      <AnimatePresence>{showSearch&&<GlobalSearchModal key="gs" onClose={()=>setShowSearch(false)} dark={dark}/>}</AnimatePresence>
      {finishModal}
      <AnimatePresence>{showPreShiftModal&&<PreShiftModal key="preshift" employeeName={employeeName} selectedShift={selectedShift} onCancel={()=>setShowPreShiftModal(false)} onConfirm={actualStartShift}/>}</AnimatePresence>
      <AnimatePresence>{showAuditLog&&<AuditLogModal key="audit" onClose={()=>setShowAuditLog(false)}/>}</AnimatePresence>
      <AnimatePresence>{showEmpReport&&<EmployeeReportModal key="er" employees={employees} dark={dark} onClose={()=>setShowEmpReport(false)} currentEmployeeName={employeeName}/>}</AnimatePresence>
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
    </div>
  );
}