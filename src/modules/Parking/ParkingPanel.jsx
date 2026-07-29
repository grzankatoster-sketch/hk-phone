import React, { useState, useEffect } from "react";
import { AlertTriangle, Trash2, X, Check, Wallet, Phone, Pencil, ChevronUp, ChevronDown } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { pl, displayValue } from "../../lib/format";
import { TENANT_ID } from "../../lib/constants";
import { supabase } from "../../lib/supabase";

export default function ParkingPanel({dark, isAdmin, showToast, employees, employeeName}) {
  const [records, setRecords] = React.useState(() => loadJson(STORAGE_KEYS.parking, []));

  // Pierwsze uruchomienie bez lokalnego cache (WYKONANIE 0.3): dane parkingowe
  // nie są już zaszyte w źródle, ładowane raz z Supabase per tenant.
  React.useEffect(() => {
    if (records.length > 0 || !supabase || !TENANT_ID) return;
    supabase.from("parking_records").select("*").eq("tenant_id", TENANT_ID).then(({ data, error }) => {
      if (error || !data || !data.length) return;
      const mapped = data.map(r => ({
        id: r.id, plate: r.plate, name: r.name, phone: r.phone, type: r.type,
        status: r.status, paidTo: r.paid_to, paidOn: r.paid_on, docNr: r.doc_nr,
        note: r.note, price: r.price, active: r.active,
      }));
      setRecords(mapped); saveJson(STORAGE_KEYS.parking, mapped);
    });
  }, []);
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
  const [editRec, setEditRec] = React.useState(null); // edytowany rekord (kopia)
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

  const saveEdit = () => {
    if (!editRec) return;
    save(records.map(r => r.id === editRec.id ? { ...editRec } : r));
    setEditRec(null);
    showToast("Zmiany zapisane.", "success");
  };
  const setEF = (k, v) => setEditRec(p => ({ ...p, [k]: v }));

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
      {/* ═══ KPI ROW v2 wg v2/07-parking ═══ */}
      {(()=>{
        const abonamentCount=active.filter(r=>r.type==="abonament").length;
        const pracownikCount=active.filter(r=>r.type==="pracownik").length;
        const krotkiCount=active.filter(r=>r.type==="krotki").length;
        const expiringSoon=active.filter(r=>{const dl=daysLeft(r.paidTo);return dl!==null&&dl<=3;}).length;
        const monthlyRevenue=active.filter(r=>r.type==="abonament"&&r.price).reduce((s,r)=>{const n=parseFloat(String(r.price).replace(/[^\d.]/g,""))||0;return s+n;},0);
        return (
          <div className="cc-parking-kpi-row">
            <div className="cc-parking-kpi">
              <div className="cc-parking-kpi-lbl">Aktywne wpisy</div>
              <div className="cc-parking-kpi-val">{active.length}</div>
              <div className="cc-parking-kpi-sub">{abonamentCount} abonament · {pracownikCount} pracown.</div>
            </div>
            <div className="cc-parking-kpi">
              <div className="cc-parking-kpi-lbl">Przychód mies.</div>
              <div className="cc-parking-kpi-val cc-parking-kpi-val--brand">{monthlyRevenue.toLocaleString("pl-PL")}<span className="cc-parking-kpi-unit"> PLN</span></div>
              <div className="cc-parking-kpi-sub">{abonamentCount} abon. × ~{abonamentCount>0?Math.round(monthlyRevenue/abonamentCount):0} PLN</div>
            </div>
            <div className="cc-parking-kpi">
              <div className="cc-parking-kpi-lbl">Wygasające ≤3 dni</div>
              <div className={`cc-parking-kpi-val${expiringSoon>0?" cc-parking-kpi-val--warn":""}`}>{expiringSoon}</div>
              <div className="cc-parking-kpi-sub">{expiringSoon>0?"wymaga uwagi":"wszystko OK"}</div>
            </div>
            <div className="cc-parking-kpi">
              <div className="cc-parking-kpi-lbl">Krótkoterminowe</div>
              <div className="cc-parking-kpi-val">{krotkiCount}</div>
              <div className="cc-parking-kpi-sub">Auto-expire o północy</div>
            </div>
          </div>
        );
      })()}

      {/* Header + filter tabs v2 */}
      <div className={panel}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:10,marginBottom:10}}>
          <div>
            <div className="panel-title" style={{margin:0,display:"flex",alignItems:"center",gap:8}}>
              <svg width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" style={{color:"var(--cc-brand)"}}><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Rejestr parking
            </div>
            <div className="cc-parking-subtitle">{active.length} aktywnych · {history.length} w historii</div>
          </div>
          {!isAdmin && (
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button className="btn btn-rose" style={{fontSize:12}} onClick={()=>{setShowAdd(true);setAddMode("abonament");}}>+ Abonament</button>
              <button className="btn btn-amber" style={{fontSize:12}} onClick={()=>{setShowAdd(true);setAddMode("krotki");}}>+ Krótki najem</button>
              <button className="btn btn-emerald" style={{fontSize:12}} onClick={()=>{setShowAdd(true);setAddMode("pracownik");}}>+ Pracownik/firma</button>
            </div>
          )}
        </div>
        {/* Filter tabs v2 */}
        <div className="cc-parking-toolbar">
          {[
            ["all","Wszyscy",active.length,"all"],
            ["abonament","Abonament",active.filter(r=>r.type==="abonament").length,"abonament"],
            ["pracownik","Pracownicy",active.filter(r=>r.type==="pracownik").length,"pracownik"],
            ["krotki","Krótki najem",active.filter(r=>r.type==="krotki").length,"krotki"],
          ].map(([v,l,cnt,dotClass])=>(
            <button
              key={v}
              type="button"
              onClick={()=>setFilter(v)}
              className={`cc-parking-tab${filter===v?" cc-parking-tab--on":""}`}>
              {dotClass!=="all"&&<span className={`cc-parking-tab-dot cc-parking-tab-dot--${dotClass}`} aria-hidden="true"/>}
              <span>{l}</span>
              <span className="cc-parking-tab-cnt">{cnt}</span>
            </button>
          ))}
          <div className="cc-parking-search">
            <svg width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input placeholder="Tablica, imię, telefon..." value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className={panel}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div className="panel-title" style={{margin:0}}>
              {addMode==="abonament"?"+ Nowy abonament":addMode==="krotki"?"+ Krótki najem (z ulicy / hotel obok)":"+ Pracownik / firma"}
            </div>
            <button onClick={()=>setShowAdd(false)} style={{background:"none",border:"none",cursor:"pointer",color:"var(--text-muted)",display:"flex"}}><X size={16}/></button>
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
                <button className="btn btn-amber" disabled={!shortRec.name.trim()} onClick={addShortRec}><Check size={13}/> Dodaj</button>
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
                <button className="btn btn-sky" disabled={!newRec.plate.trim()&&!newRec.name.trim()} onClick={addRecord}><Check size={13}/> Dodaj</button>
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
              <button className="btn btn-emerald" disabled={!payDoc.trim()} onClick={()=>markPaid(payModal)}><Check size={13}/> Zapisz płatność</button>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal */}
      {editRec && (
        <div className="modal-backdrop" onClick={()=>setEditRec(null)}>
          <div className={`modal${dark?" dark-modal":""}`} style={{maxWidth:520}} onClick={e=>e.stopPropagation()}>
            <div className="modal-header"><h2>Edytuj wpis parkingowy</h2></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div><label>Nr rejestracyjny</label><input className={inp} value={editRec.plate||""} onChange={e=>setEF("plate",e.target.value.toUpperCase())} style={{textTransform:"uppercase"}}/></div>
              <div><label>Imię i nazwisko</label><input className={inp} value={editRec.name||""} onChange={e=>setEF("name",e.target.value)}/></div>
              <div><label>Telefon</label><input className={inp} value={editRec.phone||""} onChange={e=>setEF("phone",e.target.value)}/></div>
              <div><label>Status / firma</label><input className={inp} value={editRec.status||""} onChange={e=>setEF("status",e.target.value)}/></div>
              <div><label>Opłacony do</label><input className={inp} type="date" value={editRec.paidTo||""} onChange={e=>setEF("paidTo",e.target.value)}/></div>
              <div><label>Data wpłaty</label><input className={inp} type="date" value={editRec.paidOn||""} onChange={e=>setEF("paidOn",e.target.value)}/></div>
              {editRec.type==="krotki" && <div><label>Krótki najem do</label><input className={inp} type="date" value={editRec.shortUntil||""} onChange={e=>setEF("shortUntil",e.target.value)}/></div>}
              <div><label>Nr dokumentu</label><input className={inp} value={editRec.docNr||""} onChange={e=>setEF("docNr",e.target.value)}/></div>
              <div><label>Cena / stawka</label><input className={inp} value={editRec.price||""} onChange={e=>setEF("price",e.target.value)}/></div>
              <div style={{gridColumn:"span 2"}}><label>Uwagi</label><input className={inp} value={editRec.note||""} onChange={e=>setEF("note",e.target.value)}/></div>
            </div>
            <div style={{display:"flex",gap:8,justifyContent:"flex-end"}}>
              <button className="btn btn-outline" onClick={()=>setEditRec(null)}>Anuluj</button>
              <button className="btn btn-sky" onClick={saveEdit}><Check size={13}/> Zapisz zmiany</button>
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
        const ageClass = alert ? "danger" : (dl !== null && dl <= 7 ? "warn" : (dl !== null && dl > 0 ? "ok" : "muted"));
        return (
          <div
            key={rec.id}
            className={`cc-parking-row cc-parking-row--${rec.type}${alert?" cc-parking-row--alert":""}${isOpen?" cc-parking-row--open":""}`}>
            {/* Header row (clickable) */}
            <div className="cc-parking-row-head" onClick={()=>setExpanded(isOpen?null:rec.id)}>
              <div className={`cc-parking-plate${alert?" cc-parking-plate--alert":""}`}>
                {displayValue(rec.plate)}
              </div>
              <div className="cc-parking-owner">
                <div className="cc-parking-owner-name">{rec.name}</div>
                {(rec.phone||rec.status)&&(
                  <div className="cc-parking-owner-sub">
                    {rec.phone&&<span style={{display:"inline-flex",alignItems:"center",gap:3}}><Phone size={11}/><b>{rec.phone}</b></span>}
                    {rec.phone&&rec.status&&<span> · </span>}
                    {rec.status&&<span>{rec.status}</span>}
                  </div>
                )}
                {rec.note&&<div className="cc-parking-owner-note">{rec.note}</div>}
              </div>
              <span className={`cc-parking-tag cc-parking-tag--${rec.type}`}>
                {typeLabel[rec.type]||rec.type}
              </span>
              <div className={`cc-parking-paid cc-parking-paid--${ageClass}`}>
                {rec.paidTo?(
                  <>
                    <div className="cc-parking-paid-date"><b>{rec.paidTo}</b></div>
                    {rec.docNr&&<div className="cc-parking-paid-doc">{rec.docNr}{rec.paidOn&&` · ${rec.paidOn}`}</div>}
                  </>
                ):rec.shortUntil?(
                  <>
                    <div className="cc-parking-paid-date"><b>do: {rec.shortUntil}</b></div>
                    {rec.shortStarted&&<div className="cc-parking-paid-doc">od: {rec.shortStarted}</div>}
                  </>
                ):(
                  <span className="cc-parking-paid-empty">—</span>
                )}
              </div>
              <span className={`cc-parking-days cc-parking-days--${ageClass}`}>
                {rec.type==="pracownik"?"stały":(rec.paidTo&&dl!==null)?(dl>0?`${dl}d`:dl===0?"dziś":`${dl}`):"—"}
              </span>
              <div className="cc-parking-row-actions" onClick={e=>e.stopPropagation()}>
                {rec.type==="krotki" && !isAdmin && (
                  <button type="button" className="cc-parking-action-btn cc-parking-action-btn--end" onClick={()=>endShort(rec)} title="Zakończ najem">
                    <X size={14}/>
                  </button>
                )}
                {rec.type==="abonament" && alert && (
                  <button type="button" className="cc-parking-action-btn cc-parking-action-btn--pay" onClick={()=>setPayModal(rec.id)} title="Oznacz jako opłacone">
                    <Wallet size={14}/>
                  </button>
                )}
                <button type="button" className="cc-parking-action-btn" onClick={()=>setExpanded(isOpen?null:rec.id)} title={isOpen?"Zwiń":"Rozwiń"}>
                  {isOpen?<ChevronUp size={14}/>:<ChevronDown size={14}/>}
                </button>
              </div>
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
                      <Wallet size={13}/> Zarejestruj płatność
                    </button>
                  )}
                  <button className="btn btn-outline" style={{fontSize:12}} onClick={()=>setEditRec({...rec})}>
                    <Pencil size={13}/> Edytuj
                  </button>
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
