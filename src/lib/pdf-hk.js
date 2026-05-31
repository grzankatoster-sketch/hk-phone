import jsPDF from "jspdf";
import { HK_ALL, HK_APTS, HK_FLOOR1, HK_FLOOR2, HK_FLOOR3 } from "./constants";
import { hkDayOfWeek, hkFmtDate } from "./hk";
import { pl } from "./format";
import { mkPDF_header, mkPDF_section, mkPDF_kv, mkPDF_paragraph, mkPDF_item, mkPDF_footer, savePDF } from "./pdf";

export { downloadHKMain, downloadHKRoomList, downloadHKStatus, downloadHKCleaningList, downloadHKExcel };

const APT_DESC_DEFAULTS={106:"D+T",206:"D+T+SOFA 1",218:"D+D",306:"D+T",318:"D+T"};
const aptDesc=(room,rd)=>rd.apartmentNote||rd.roomType||APT_DESC_DEFAULTS[room.no]||room.type;

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
    const pgAft=HK_ALL.filter(r=>data[r.no]?.status==="PG"&&data[r.no]?.person===afternoonN).length;
    const pgzAft=HK_ALL.filter(r=>data[r.no]?.status==="PGZ"&&data[r.no]?.person===afternoonN).length;
    const pgApt=HK_APTS.filter(k=>data[k]?.status==="PG"&&data[k]?.person===afternoonN).length;
    const pgzApt=HK_APTS.filter(k=>data[k]?.status==="PGZ"&&data[k]?.person===afternoonN).length;
    const pgRegular=pgAft-pgApt;const pgzRegular=pgzAft-pgzApt;
    if(pgRegular)doc.text(String(pgRegular),margin+tw*0.38,by+3.8,{align:"center"});
    if(pgApt)doc.text(String(pgApt),margin+tw*0.54,by+3.8,{align:"center"});
    if(pgzRegular)doc.text(String(pgzRegular),margin+tw*0.70,by+3.8,{align:"center"});
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
  const APT_DESC=APT_DESC_DEFAULTS;
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
      if(room.apt)desc=rd.apartmentNote||(rd.roomType||APT_DESC[room.no]||room.type);
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
          const baseTyp=room.apt?aptDesc(room,rd):(rd.roomType||room.type);
          const typStr=baseTyp+(rd.zs?" ZS":"");
          doc.setFont("helvetica",room.apt?"bold":"normal");doc.setFontSize(room.apt&&typStr.length>8?6.8:7.5);doc.setTextColor(0,0,0);
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
