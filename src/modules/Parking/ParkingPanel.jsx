import React, { useState, useEffect } from "react";
import { AlertTriangle, Trash2 } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { pl, displayValue } from "../../lib/format";

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

export default function ParkingPanel({dark, isAdmin, showToast, employees, employeeName}) {
  const [records, setRecords] = React.useState(() => loadJson(STORAGE_KEYS.parking, DEFAULT_PARKING));
  const [filter, setFilter] = React.useState("all"); // all | abonament | pracownik | krotki
  const [search, setSearch] = React.useState("");
  const [showAdd, setShowAdd] = React.useState(false);
  const [addMode, setAddMode] = React.useState("abonament"); // abonament | krotki | pracownik
  const [newRec, setNewRec] = React.useState({plate:"",name:"",phone:"",status:"Os. prywatna",note:"",paidTo:"",paidOn:"",docNr:"",price:""});
  const [shortRec, setShortRec] = React.useState({plate:"",name:"",phone:"",price:"",note:"",until:""});

  // Auto-expire short rentals at midnight
  React.useEffect(()=>{
    const now=new Date();
    const today=`${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;
    const expired=records.filter(r=>r.type==="krotki"&&r.active!==false&&r.shortUntil&&r.shortUntil<today);
    if(expired.length){
      const updated=records.map(r=>expired.some(e=>e.id===r.id)?{...r,active:false}:r);
      setRecords(updated);saveJson(STORAGE_KEYS.parking,updated);
      const h=[...expired.map(r=>({...r,endedAt:'Auto-usunięty '+new Date().toLocaleString('pl-PL'),active:false})),...history].slice(0,200);
      setHistory(h);saveJson(STORAGE_KEYS.parkingHistory,h);
    }
  },[]);
  const [expanded, setExpanded] = React.useState(null);
  const [payModal, setPayModal] = React.useState(null); // record id
  const [payDoc, setPayDoc] = React.useState("");
  const [history, setHistory] = React.useState(() => loadJson(STORAGE_KEYS.parkingHistory, []));

  const save = (updated) => { setRecords(updated); saveJson(STORAGE_KEYS.parking, updated); };
  const saveHistory = (h) => { setHistory(h); saveJson(STORAGE_KEYS.parkingHistory, h); };

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
              <span style={{color:"var(--cc-info)"}}>● {active.filter(r=>r.type==="abonament").length} abonament</span>
              <span style={{color:"var(--cc-success)"}}>● {active.filter(r=>r.type==="pracownik").length} pracownicy</span>
              <span style={{color:"var(--cc-warning)"}}>● {active.filter(r=>r.type==="krotki").length} krótki najem</span>
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
                {displayValue(rec.plate)}
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
            <span style={{background:"color-mix(in srgb, var(--cc-warning) 14%, transparent)",color:"var(--cc-warning)",padding:"2px 10px",borderRadius:999,fontSize:11,fontWeight:700}}>
              HISTORIA — krótkie najmy
            </span>
            <span style={{fontSize:11,color:"var(--text-muted)",marginLeft:8}}>{history.length} wpisów</span>
          </div>
          <div style={{maxHeight:260,overflowY:"auto",display:"flex",flexDirection:"column",gap:5}}>
            {history.map(h=>(
              <div key={h.id+h.endedAt} style={{display:"flex",gap:8,padding:"6px 10px",
                borderRadius:"var(--radius-sm)",background:dark?"rgba(255,255,255,.03)":"var(--bg-secondary)",
                border:`0.5px solid ${dark?"var(--dark-border)":"var(--border-light)"}`}}>
                <div style={{fontFamily:"monospace",fontSize:11,fontWeight:700,minWidth:70}}>{displayValue(h.plate)}</div>
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
