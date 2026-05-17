import React, { useState, useMemo } from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";

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



export default function StaliGosciePanel({dark,isAdmin,currentManager,addAudit}){
  const [guests,setGuests]=React.useState(()=>loadJson(STORAGE_KEYS.staliGoscie,DEFAULT_STALI_GOSCIE));
  const [search,setSearch]=React.useState("");
  const [filter,setFilter]=React.useState("all"); // all|private|company
  const [expanded,setExpanded]=React.useState(null);
  const [editing,setEditing]=React.useState(null); // {id, field, value}
  const [showAddForm,setShowAddForm]=React.useState(false);
  const [newGuest,setNewGuest]=React.useState({name:"",room:"",company:"",notes:"",priceSeason:"",priceOffSeason:"",meal:"",category:"private"});

  const save=(updated)=>{setGuests(updated);saveJson(STORAGE_KEYS.staliGoscie,updated);};

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
                style={{fontSize:12,padding:"5px 12px",borderRadius:"var(--cc-radius-md)",cursor:"pointer",
                        border:`1px solid ${filter===v?"var(--cc-info)":"var(--cc-border)"}`,
                        background:filter===v?"color-mix(in srgb, var(--cc-info) 12%, transparent)":"transparent",
                        color:filter===v?"var(--cc-info)":"var(--cc-text-muted)",fontWeight:filter===v?600:400}}>
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
