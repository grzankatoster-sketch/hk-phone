// Generatory PDF wydzielone z App.jsx (krok 1 odchudzania monolitu).
// Czyste funkcje — całość zależności pochodzi z lib/, brak sprzężenia ze stanem App.
import jsPDF from "jspdf";
import { pl } from "./format";
import { getFullName } from "./employees";
import { mkPDF_header, mkPDF_section, mkPDF_kv, mkPDF_paragraph, mkPDF_item, mkPDF_footer, savePDF } from "./pdf";
import { SHIFT_LABELS_PL, HOTEL_NAME } from "./constants";

export function downloadCorrectionPDF(c,managerName){
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

export function downloadShiftPDF(report) {
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

export function downloadEmployeeReportPDF(report) {
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
export function downloadWikiPDF(entries) {
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
  doc.text(pl("Instrukcja obslugi dla pracownikow recepcji - " + HOTEL_NAME),ml,45);
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
    doc.text(HOTEL_NAME + " - Wikirecepcja (wydruk dla pracownikow)",ml,ph-7);
    doc.text("Strona "+p+" / "+total,pw-mr,ph-7,{align:"right"});
  }
  savePDF(doc,"wikirecepcja_"+now.replace(/\./g,"-")+".pdf");
}
