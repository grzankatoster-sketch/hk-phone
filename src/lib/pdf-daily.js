import jsPDF from "jspdf";
import { pl } from "./format";
import { getFullName } from "./employees";
import { mkPDF_header, mkPDF_section, mkPDF_item, mkPDF_footer, savePDF } from "./pdf";

export function downloadDailyReportPDF(report) {
  const doc=new jsPDF({orientation:"p",unit:"mm",format:"a4"});
  const pw=doc.internal.pageSize.getWidth(),ph=doc.internal.pageSize.getHeight();
  const ml=18,mr=18,cw=pw-ml-mr;let y=0;
  const chk=(n=12)=>{if(y+n>ph-14){doc.addPage();y=22;return 22;}};

  mkPDF_header(doc,pw,"Raport dobowy recepcji",pl(report.generatedAt||""));
  y=34;

  doc.setFont("helvetica","bold");doc.setFontSize(10);doc.setTextColor(14,12,10);
  doc.text(pl(report.dateLabel||""),ml,y);
  doc.setFont("helvetica","normal");doc.setFontSize(8.5);doc.setTextColor(100,90,68);
  doc.text(pl(report.shiftMode||""),pw-mr,y,{align:"right"});
  y+=10;

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

  if(report.taskSummary&&report.taskSummary.length){
    y=mkPDF_section(doc,pw,ml,cw,y,"Wykonanie zadan");
    report.taskSummary.forEach(row=>{
      chk(8);
      doc.setFont("helvetica","bold");doc.setFontSize(9.5);doc.setTextColor(14,12,10);
      doc.text(pl(getFullName(row.employee)||row.employee||"-"),ml,y);
      doc.setFont("helvetica","normal");doc.setFontSize(9);
      doc.setTextColor(36,92,58);
      doc.text("[OK] "+row.done,ml+70,y);
      if(row.missed>0){doc.setTextColor(148,38,52);doc.text("[X] "+row.missed,ml+98,y);}
      doc.setTextColor(110,100,85);doc.setFontSize(8);
      doc.text(pl(row.shift||""),pw-mr,y,{align:"right"});
      y+=8;
    });
    y+=4;
  }

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
