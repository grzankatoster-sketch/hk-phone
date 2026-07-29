import React, { useState, useMemo } from "react";
import { Plus, Search, Trash2, Users } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { TENANT_ID } from "../../lib/constants";
import { supabase } from "../../lib/supabase";




export default function StaliGosciePanel({dark,isAdmin,currentManager,addAudit}){
  const [guests,setGuests]=React.useState(()=>loadJson(STORAGE_KEYS.staliGoscie,[]));
  const [search,setSearch]=React.useState("");
  const [filter,setFilter]=React.useState("all"); // all|private|company
  const [expanded,setExpanded]=React.useState(null);
  const [editing,setEditing]=React.useState(null); // {id, field, value}
  const [showAddForm,setShowAddForm]=React.useState(false);
  const [newGuest,setNewGuest]=React.useState({name:"",room:"",company:"",notes:"",priceSeason:"",priceOffSeason:"",meal:"",category:"private"});

  const save=(updated)=>{setGuests(updated);saveJson(STORAGE_KEYS.staliGoscie,updated);};

  // Pierwsze uruchomienie bez lokalnego cache (WYKONANIE 0.3): baza stałych gości
  // nie jest już zaszyta w źródle, ładowana raz z Supabase per tenant.
  React.useEffect(() => {
    if (guests.length > 0 || !supabase || !TENANT_ID) return;
    supabase.from("stali_goscie").select("*").eq("tenant_id", TENANT_ID).then(({ data, error }) => {
      if (error || !data || !data.length) return;
      const mapped = data.map(g => ({
        id: g.id, name: g.name, room: g.room, company: g.company, notes: g.notes,
        priceSeason: g.price_season, priceOffSeason: g.price_off_season, meal: g.meal,
        category: g.category, hasFV: g.has_fv,
      }));
      save(mapped);
    });
  }, []);

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

  /* ═══ Guest row v2 — avatar + info + stats + flag (wg v2/08-stali-goscie) ═══ */
  const avatarGradient = (name) => {
    // Hash name to one of 8 gradient pairs (consistent per guest)
    const palettes = [
      "linear-gradient(135deg, var(--cc-brand), var(--cc-brand-deep))",
      "linear-gradient(135deg, var(--cc-accent-gold), color-mix(in srgb, var(--cc-accent-gold) 60%, black))",
      "linear-gradient(135deg, var(--cc-info), color-mix(in srgb, var(--cc-info) 55%, black))",
      "linear-gradient(135deg, var(--cc-success), color-mix(in srgb, var(--cc-success) 55%, black))",
      "linear-gradient(135deg, var(--cc-danger), color-mix(in srgb, var(--cc-danger) 60%, black))",
      "linear-gradient(135deg, var(--cc-warning), color-mix(in srgb, var(--cc-warning) 55%, black))",
      "linear-gradient(135deg, #7c3aed, #5b21b6)",
      "linear-gradient(135deg, #0e7490, #155e75)",
    ];
    const hash = [...(name||"?")].reduce((s,c)=>s+c.charCodeAt(0),0);
    return palettes[hash % palettes.length];
  };

  const GuestCard=({g})=>{
    const isOpen=expanded===g.id;
    const hasFV=g.hasFV||!!g.company;
    const initial=(g.name||"?").charAt(0).toUpperCase();
    return(
      <div className={`cc-guest${isOpen?" cc-guest--expanded":""}`}>
        {/* Row header v2 */}
        <div className="cc-guest-head" onClick={()=>setExpanded(isOpen?null:g.id)}>
          <div className="cc-guest-avatar" style={{background:avatarGradient(g.name)}}>{initial}</div>
          <div className="cc-guest-info">
            <div className="cc-guest-name">
              {g.name}
              {hasFV&&<span className="cc-guest-flag cc-guest-flag--fv">FV</span>}
            </div>
            {g.company&&(
              <div className="cc-guest-company">{g.company}</div>
            )}
            {g.room&&(
              <div className="cc-guest-room">Pokój: <b>{g.room}</b></div>
            )}
            {g.priceSeason&&!isOpen&&!g.company&&(
              <div className="cc-guest-room">Sezon: {g.priceSeason.slice(0,50)}{g.priceSeason.length>50?"…":""}</div>
            )}
          </div>
          <div className="cc-guest-stats">
            {g.priceSeason&&<span className="cc-guest-price">{g.priceSeason.length<20?g.priceSeason:g.priceSeason.slice(0,20)+"…"}</span>}
            <span className={`cc-guest-flag cc-guest-flag--${g.category==="company"?"company":"private"}`}>
              {g.category==="company"?"Firma":"Prywatny"}
            </span>
          </div>
          <button type="button" className="cc-guest-expand-btn" aria-label={isOpen?"Zwiń":"Rozwiń"}>
            {isOpen?"▲":"▼"}
          </button>
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

  const fvCount = guests.filter(g=>g.hasFV||g.company).length;

  return(
    <div className="stack">
      {/* ═══ KPI ROW v2 wg v2/08-stali-goscie ═══ */}
      <div className="cc-guests-kpi-row">
        <div className="cc-guests-kpi">
          <div className="cc-guests-kpi-lbl">Łącznie gości</div>
          <div className="cc-guests-kpi-val">{guests.length}</div>
          <div className="cc-guests-kpi-sub">aktywna baza</div>
        </div>
        <div className="cc-guests-kpi">
          <div className="cc-guests-kpi-lbl">Prywatni</div>
          <div className="cc-guests-kpi-val cc-guests-kpi-val--violet">{privateGuests.length}</div>
          <div className="cc-guests-kpi-sub">{guests.length>0?Math.round(privateGuests.length/guests.length*100):0}% bazy</div>
        </div>
        <div className="cc-guests-kpi">
          <div className="cc-guests-kpi-lbl">Firmy</div>
          <div className="cc-guests-kpi-val cc-guests-kpi-val--teal">{companyGuests.length}</div>
          <div className="cc-guests-kpi-sub">B2B kontrakty</div>
        </div>
        <div className="cc-guests-kpi">
          <div className="cc-guests-kpi-lbl">Z fakturą</div>
          <div className="cc-guests-kpi-val cc-guests-kpi-val--gold">{fvCount}</div>
          <div className="cc-guests-kpi-sub">{guests.length>0?Math.round(fvCount/guests.length*100):0}% generuje FV</div>
        </div>
      </div>

      {/* List card head + toolbar v2 */}
      <div className={`panel${dark?" dark-panel":""}`}>
        <div className="cc-guests-card-head">
          <div className="cc-guests-card-headline">
            <Users size={15} className="cc-guests-card-icon"/>
            <h2 className="cc-guests-card-title">Baza stałych gości</h2>
          </div>
          {isAdmin&&(
            <button className="btn btn-emerald" style={{fontSize:12.5,flexShrink:0}}
                    onClick={()=>setShowAddForm(v=>!v)}>
              <Plus size={13}/> Dodaj gościa
            </button>
          )}
        </div>
        <div className="cc-guests-toolbar">
          {[
            ["all","Wszyscy",guests.length],
            ["private","Prywatni",privateGuests.length],
            ["company","Firmy",companyGuests.length],
          ].map(([v,l,cnt])=>(
            <button key={v} type="button" onClick={()=>setFilter(v)}
              className={`cc-guests-tab${filter===v?" cc-guests-tab--on":""}`}>
              <span>{l}</span>
              <span className="cc-guests-tab-cnt">{cnt}</span>
            </button>
          ))}
          <div className="cc-guests-search">
            <Search size={13}/>
            <input placeholder="Imię, firma, uwagi…" value={search} onChange={e=>setSearch(e.target.value)}/>
          </div>
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
