import React from "react";
import { AnimatePresence } from "framer-motion";
import { AlertTriangle, Plus, QrCode } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { FAULT_FLOORS, TENANT_ID } from "../../lib/constants";
import { getKonserwatorzy, setKonserwatorzy, getKonserwatorSpecs } from "../../lib/konserwatorzy";
import { supabase } from "../../lib/supabase";
import FloorMap from "../../components/FloorMap";
import FaultFormModal from "../../components/modals/FaultFormModal";
import FaultDetailsModal from "../../components/modals/FaultDetailsModal";

const hasElectron = !!window.electronAPI;
const TABLE = "faults";

function FaultsPanel({ dark, employeeName, showToast, floors1, floors2, floors3, isManager }) {
  const [faults, setFaults] = React.useState(() => loadJson(STORAGE_KEYS.faults, []));
  const [activeFloor, setActiveFloor] = React.useState("parter");
  const [selectedSpace, setSelectedSpace] = React.useState("");
  const [showForm, setShowForm] = React.useState(false);
  const [showDetails, setShowDetails] = React.useState(null);
  const [filter, setFilter] = React.useState("active");
  const [kpiView, setKpiView] = React.useState(null); // null | "urgent" | "normal" | "done" — klik w kartę KPI
  const [workerFilter, setWorkerFilter] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [qrCodes, setQrCodes] = React.useState({});
  const [generatingQr, setGeneratingQr] = React.useState(null);
  const [konserwatorzy, setKons] = React.useState(getKonserwatorzy);
  const specs = getKonserwatorSpecs(); // staly podzial: Kamil->Elektryka, Grzegorz->Hydraulika
  const [newKons, setNewKons] = React.useState("");
  const addKons = () => { const n = newKons.trim(); if (!n || konserwatorzy.includes(n)) { setNewKons(""); return; } const next = [...konserwatorzy, n]; setKons(next); setKonserwatorzy(next); setNewKons(""); showToast?.("Dodano konserwatora.", "success"); };
  const removeKons = (name) => { const next = konserwatorzy.filter(k => k !== name); setKons(next); setKonserwatorzy(next); showToast?.("Usunięto konserwatora.", "info"); };

  // Brak osobnej zakładki „HK" — usterki z telefonów HK trafiają wprost na piętro/
  // pokój przez resolveHkFloor (po numerze pokoju), więc nie potrzebują własnego worka.
  const floors = React.useMemo(() => [
    FAULT_FLOORS[0],
    { ...FAULT_FLOORS[1], rooms: floors1 },
    { ...FAULT_FLOORS[2], rooms: floors2 },
    { ...FAULT_FLOORS[3], rooms: floors3 },
  ], [floors1, floors2, floors3]);

  // ─── Mapowanie numeru pokoju → realne piętro ──────────────────────────────
  // Usterki z telefonów HK przychodzą z floor:"hk", ale niosą numer pokoju w
  // space_id/room. Zamiast lądować w worku "HK", trafiają od razu na właściwe
  // piętro/pokój (parter/1/2/3). Mapowanie po numerze pokoju, z fallbackiem na
  // pierwszą cyfrę numeru.
  const roomFloorMap = React.useMemo(() => {
    const m = {};
    (floors1 || []).forEach(r => { m[String(r.no)] = "pietro1"; });
    (floors2 || []).forEach(r => { m[String(r.no)] = "pietro2"; });
    (floors3 || []).forEach(r => { m[String(r.no)] = "pietro3"; });
    (FAULT_FLOORS[0].spaces || []).forEach(s => { m[String(s.id)] = "parter"; });
    return m;
  }, [floors1, floors2, floors3]);

  const resolveHkFloor = React.useCallback((room) => {
    const key = String(room ?? "").trim();
    if (roomFloorMap[key]) return roomFloorMap[key];
    const d = key.match(/^(\d)/)?.[1];
    if (d === "1") return "pietro1";
    if (d === "2") return "pietro2";
    if (d === "3") return "pietro3";
    return "parter"; // nierozpoznany numer — ląduje na parterze (recepcja), nie znika
  }, [roomFloorMap]);

  // Usterki znormalizowane: HK przypisane do realnego piętra + flaga _fromHk.
  const normFaults = React.useMemo(() => faults.map(f => {
    const fromHk = f.source === "hk" || f.floor === "hk";
    if (f.floor === "hk") return { ...f, floor: resolveHkFloor(f.space_id ?? f.room), _fromHk: true };
    return fromHk ? { ...f, _fromHk: true } : f;
  }), [faults, resolveHkFloor]);

  React.useEffect(() => { saveJson(STORAGE_KEYS.faults, faults); }, [faults]);

  React.useEffect(() => {
    if (!supabase) return;
    supabase.from(TABLE).select("*").eq("tenant_id", TENANT_ID).order("reported_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error("[faults] fetch:", error.message); return; }
        if (data && data.length > 0) { setFaults(data); saveJson(STORAGE_KEYS.faults, data); }
      });
    const ch = supabase.channel("faults-panel")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `tenant_id=eq.${TENANT_ID}` }, () => {
        supabase.from(TABLE).select("*").eq("tenant_id", TENANT_ID).order("reported_at", { ascending: false })
          .then(({ data }) => { if (data) { setFaults(data); saveJson(STORAGE_KEYS.faults, data); } });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const activeCount = normFaults.filter(f => f.status !== "done").length;
  const urgentCount = normFaults.filter(f => f.status !== "done" && f.priority === "urgent").length;
  const doneCount = normFaults.filter(f => f.status === "done").length;

  const generateKonserwatorQr = async (name) => {
    if (!hasElectron) return;
    setGeneratingQr(name);
    try {
      const workerFaults = normFaults.filter(f => f.assigned_to === name && f.status !== "done");
      const qr = await window.electronAPI.hkGetKonserwatorQr(name, workerFaults);
      if (qr?.dataURL) setQrCodes(prev => ({ ...prev, [name]: qr.dataURL }));
    } finally {
      setGeneratingQr(null);
    }
  };

  // Auto-generowanie kodów QR — recepcja nie musi klikać „Generuj" za każdym
  // razem. QR jest stały (link ?k=Imię); wywołanie odświeża też listę usterek
  // po stronie serwera konserwacji, więc puszczamy je też przy zmianie usterek.
  React.useEffect(() => {
    if (!isManager || !hasElectron) return;
    let cancelled = false;
    (async () => {
      for (const name of konserwatorzy) {
        const workerFaults = normFaults.filter(f => f.assigned_to === name && f.status !== "done");
        try {
          const qr = await window.electronAPI.hkGetKonserwatorQr(name, workerFaults);
          if (!cancelled && qr?.dataURL) setQrCodes(prev => ({ ...prev, [name]: qr.dataURL }));
        } catch { /* QR niedostępny — pomijamy, przycisk „Odśwież" jako fallback */ }
      }
    })();
    return () => { cancelled = true; };
  }, [isManager, konserwatorzy, normFaults]);

  // Baza: filtr konserwatora + wyszukiwanie + sortowanie (bez statusu i piętra).
  const baseFaults = normFaults
    .filter(f => !workerFilter || f.assigned_to === workerFilter)
    .filter(f => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [f.description, f.space_id, f.floor, f.assigned_to, f.reported_by, f.category]
        .some(v => String(v || "").toLowerCase().includes(q));
    })
    .slice()
    .sort((a, b) => {
      // SLA (due_at, migracja 0043/0044) już eskaluje przeterminowane do managera —
      // tu dodatkowo podbijamy je w liście recepcji, żeby były widoczne bez czekania na alert.
      const isOverdue = (f) => f.status !== "done" && f.due_at && new Date(f.due_at).getTime() < Date.now();
      const aOverdue = isOverdue(a), bOverdue = isOverdue(b);
      if (a.priority === "urgent" && b.priority !== "urgent") return -1;
      if (b.priority === "urgent" && a.priority !== "urgent") return 1;
      if (aOverdue && !bOverdue) return -1;
      if (bOverdue && !aOverdue) return 1;
      return new Date(b.reported_at) - new Date(a.reported_at);
    });

  const selectedFloorObj = floors.find(f => f.key === activeFloor);

  // Widok po kliknięciu karty KPI — lista wszystkich usterek danego typu
  // (ponad piętrami). null = tryb mapy (zakres wybranego piętra/pokoju).
  const kpiFaults = kpiView === "done"
    ? baseFaults.filter(f => f.status === "done")
    : kpiView === "urgent"
      ? baseFaults.filter(f => f.status !== "done" && f.priority === "urgent")
      : kpiView === "normal"
        ? baseFaults.filter(f => f.status !== "done" && f.priority !== "urgent")
        : null;

  // Tryb mapy: status wg zakładek + zakres aktywnego piętra/pokoju.
  const statusFiltered = baseFaults.filter(f => filter === "active" ? f.status !== "done" : filter === "done" ? f.status === "done" : true);
  const floorFaults = statusFiltered.filter(f => f.floor === activeFloor);
  const mapFaults = selectedSpace
    ? statusFiltered.filter(f => f.floor === activeFloor && f.space_id === selectedSpace)
    : floorFaults;

  const spaceFaults = kpiFaults || mapFaults;
  const toggleKpi = (v) => { setKpiView(prev => prev === v ? null : v); setSelectedSpace(""); };

  const addFault = async (fault) => {
    const row = { ...fault, tenant_id: TENANT_ID };
    setFaults(prev => [row, ...prev]);
    showToast?.("Usterka zgłoszona.", "success");
    if (supabase) {
      const { error } = await supabase.from(TABLE).insert(row);
      if (error) showToast?.("Blad Supabase: " + error.message, "warning");
    }
  };
  const updateFault = async (id, patch) => {
    setFaults(prev => prev.map(f => f.id === id ? { ...f, ...patch } : f));
    showToast?.("Usterka zaktualizowana.", "success");
    if (supabase) {
      const { error } = await supabase.from(TABLE).update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);
      if (error) showToast?.("Blad Supabase: " + error.message, "warning");
    }
  };
  // Usuwanie usterek jest ZABLOKOWANE (wymóg: dane trwałe w chmurze, RLS bez DELETE).

  return (
    <div className="fault-layout">
      <div className="fault-toolbar">
        {/* Tekstowe zakładki Aktywne/Wszystkie/Rozwiązane usunięte — filtrowanie
            odbywa się przez kafelki KPI (Pilne/Normalne/Rozwiązane) poniżej. */}
        <div className="spacer" />
        <select className="input" value={workerFilter} onChange={e => setWorkerFilter(e.target.value)} style={{ width: 178, height: 34, fontSize: 12 }}>
          <option value="">Konserwator: wszyscy</option>
          {konserwatorzy.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <div className="search-wrap">
          <svg className="search-icon" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input className="search-input" placeholder="Szukaj usterki..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Zgłoś usterkę</button>
      </div>

      {/* ═══ KPI row v2 wg v2/03-faults — 4 cards z color-coded icons ═══ */}
      <div className="cc-faults-kpi-row">
        <button type="button" className={`cc-faults-kpi cc-faults-kpi--btn${kpiView === "urgent" ? " is-active" : ""}`} aria-pressed={kpiView === "urgent"} onClick={() => toggleKpi("urgent")}>
          <div className="cc-faults-kpi-ic cc-faults-kpi-ic--rose" aria-hidden="true">
            <AlertTriangle size={17}/>
          </div>
          <div className="cc-faults-kpi-info">
            <div className="cc-faults-kpi-lbl">Pilne</div>
            <div className="cc-faults-kpi-val">{urgentCount}</div>
            <div className="cc-faults-kpi-sub">{kpiView === "urgent" ? "kliknij, by wyczyścić" : "pokaż listę"}</div>
          </div>
        </button>
        <button type="button" className={`cc-faults-kpi cc-faults-kpi--btn${kpiView === "normal" ? " is-active" : ""}`} aria-pressed={kpiView === "normal"} onClick={() => toggleKpi("normal")}>
          <div className="cc-faults-kpi-ic cc-faults-kpi-ic--amber" aria-hidden="true">
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
          </div>
          <div className="cc-faults-kpi-info">
            <div className="cc-faults-kpi-lbl">Normalne</div>
            <div className="cc-faults-kpi-val">{activeCount - urgentCount}</div>
            <div className="cc-faults-kpi-sub">{kpiView === "normal" ? "kliknij, by wyczyścić" : "pokaż listę"}</div>
          </div>
        </button>
        <button type="button" className={`cc-faults-kpi cc-faults-kpi--btn${kpiView === "done" ? " is-active" : ""}`} aria-pressed={kpiView === "done"} onClick={() => toggleKpi("done")}>
          <div className="cc-faults-kpi-ic cc-faults-kpi-ic--teal" aria-hidden="true">
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <div className="cc-faults-kpi-info">
            <div className="cc-faults-kpi-lbl">Rozwiązane</div>
            <div className="cc-faults-kpi-val">{doneCount}</div>
            <div className="cc-faults-kpi-sub">{kpiView === "done" ? "kliknij, by wyczyścić" : "pokaż listę"}</div>
          </div>
        </button>
        <div className="cc-faults-kpi">
          <div className="cc-faults-kpi-ic cc-faults-kpi-ic--sky" aria-hidden="true">
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>
          </div>
          <div className="cc-faults-kpi-info">
            <div className="cc-faults-kpi-lbl">Widoczne</div>
            <div className="cc-faults-kpi-val">{spaceFaults.length}</div>
            <div className="cc-faults-kpi-sub">po filtrach</div>
          </div>
        </div>
      </div>

      {/* Mapa piętra — ukryta gdy aktywny filtr KPI: wtedy pokazujemy wprost listę
          pokoi z usterkami (klik w kartę KPI ponownie = powrót do mapy). */}
      {!kpiView && (
        <div className="data-card" style={{ marginBottom: 16 }}>
          <div className="data-card-head">
            <div className="data-card-title">Mapa piętra</div>
            <div className="filter-tabs">
              {floors.map(f => {
                const cnt = normFaults.filter(x => x.floor === f.key && x.status !== "done").length;
                return (
                  <button key={f.key} className={`filter-tab${activeFloor === f.key ? " active" : ""}`} onClick={() => { setActiveFloor(f.key); setSelectedSpace(""); setKpiView(null); }}>
                    {f.label}{cnt > 0 ? ` (${cnt})` : ""}
                  </button>
                );
              })}
            </div>
          </div>
          <div style={{ padding: 18 }}>
            <FloorMap floor={selectedFloorObj} faults={normFaults} onSelectSpace={(id) => { setSelectedSpace(id); setKpiView(null); }} selectedSpace={selectedSpace} />
            {selectedSpace && (
              <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-2)", textAlign: "center" }}>
                Pokazuję: <strong style={{ color: "var(--text-0)" }}>{selectedSpace}</strong>
                <button className="fault-action-btn" onClick={() => setSelectedSpace("")} style={{ marginLeft: 8, padding: "2px 8px" }}>Wyczyść</button>
              </div>
            )}
          </div>
        </div>
      )}

      {spaceFaults.length === 0 ? (
        <div className="cc-faults-empty">
          <AlertTriangle size={24} className="cc-faults-empty-icon"/>
          <div>Brak usterek w wybranym zakresie.</div>
        </div>
      ) : (
        /* ═══ Fault list v2 — grid rows wg v2/03-faults .fault pattern ═══ */
        <ul className="cc-faults-list" role="list">
          {spaceFaults.map(f => {
            const fl = floors.find(x => x.key === f.floor);
            const spaceLabel = fl?.key === "parter" ? (fl.spaces.find(s => s.id === f.space_id)?.label || f.space_id) : f.space_id;
            const done = f.status === "done";
            const priority = done ? "done" : f.priority === "urgent" ? "urgent" : f.priority === "low" ? "low" : "normal";
            const priLabel = priority === "urgent" ? "P1" : priority === "low" ? "P3" : "P2";
            const statusLabel = { open: "Otwarta", in_progress: "W trakcie", done: "Rozwiązana" }[f.status] || f.status;
            const initials = (f.assigned_to || "HK").split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase();
            const reportedShort = new Date(f.reported_at).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
            const elapsedMin = Math.floor((Date.now() - new Date(f.reported_at).getTime()) / 60000);
            const elapsedLabel = elapsedMin < 60 ? `${elapsedMin}m` : elapsedMin < 1440 ? `${Math.floor(elapsedMin/60)}h ${elapsedMin%60}m` : `${Math.floor(elapsedMin/1440)}d`;
            // SLA: due_at liczony automatycznie w bazie (0043) z priorytetu — pokazujemy
            // "po terminie" tu, w recepcji, zamiast tylko w panelu kierownika (loadSLA).
            const isOverdue = !done && f.due_at && new Date(f.due_at).getTime() < Date.now();
            return (
              <li
                key={f.id}
                className={`cc-fault-row cc-fault-row--${priority}${done ? " cc-fault-row--done" : ""}`}
                onClick={() => setShowDetails(f)}>
                <div className={`cc-fault-pri cc-fault-pri--${priority}`} aria-label={`Priorytet ${priLabel}`}>{priLabel}</div>
                <div className="cc-fault-room">
                  <div className="cc-fault-room-num">{spaceLabel}</div>
                  <div className="cc-fault-room-sub">{fl?.label || f.floor}</div>
                </div>
                <div className="cc-fault-info">
                  <div className="cc-fault-cat">{f._fromHk ? "📱 " : ""}{f.category || "Usterka"}</div>
                  <div className="cc-fault-desc">{f.description}</div>
                  <div className="cc-fault-meta">
                    <span>Zgłosił(a): <b>{f.reported_by || "Recepcja"}</b></span>
                    <span>{reportedShort}</span>
                  </div>
                </div>
                <div className="cc-fault-status">
                  <span className={`cc-fault-badge cc-fault-badge--${done ? "done" : f.status === "in_progress" ? "progress" : "open"}`}>{statusLabel}</span>
                  <span className="cc-fault-time">{elapsedLabel}</span>
                  {isOverdue && (
                    <span style={{ fontSize: 10, fontWeight: 800, color: "#fff", background: "#dc2626", borderRadius: 999, padding: "2px 7px", marginTop: 2 }}>
                      ⚠ po terminie
                    </span>
                  )}
                </div>
                <div className="cc-fault-assigned">
                  <span className="cc-fault-avatar">{initials}</span>
                  <div className="cc-fault-assigned-info">
                    <div className="cc-fault-assigned-role">Konserw.</div>
                    <div className="cc-fault-assigned-name">{f.assigned_to || "—"}</div>
                  </div>
                </div>
                <div className="cc-fault-actions" onClick={e => e.stopPropagation()}>
                  {!done && (
                    <button
                      type="button"
                      className="cc-fault-resolve-btn"
                      onClick={() => updateFault(f.id, { status: "done", resolved_at: new Date().toISOString() })}
                      title="Oznacz jako rozwiązaną">
                      ✓
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {isManager && (
        <div className="data-card" style={{ marginTop: 16 }}>
          <div className="data-card-head">
            <div className="data-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}><QrCode size={18} /> Konserwatorzy — lista i kody QR</div>
          </div>
          {/* Edycja listy konserwatorów */}
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", padding: "12px 16px 0" }}>
            <input className="input" value={newKons} onChange={e => setNewKons(e.target.value)}
              onKeyDown={e => e.key === "Enter" && addKons()} placeholder="Imię nowego konserwatora"
              style={{ maxWidth: 220, height: 34, fontSize: 13 }} />
            <button className="btn btn-primary" style={{ fontSize: 12 }} onClick={addKons}><Plus size={13} /> Dodaj konserwatora</button>
          </div>
          {!hasElectron && (
            <div className="cc-fault-hint">
              QR kody dostępne tylko w aplikacji Electron.
            </div>
          )}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: 16 }}>
            {konserwatorzy.map(name => {
              const count = normFaults.filter(f => f.assigned_to === name && f.status !== "done").length;
              return (
                <div key={name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "14px 18px", borderRadius: 12, background: "var(--bg-1)", border: "1px solid var(--border)", minWidth: 140 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-0)" }}>{name}</div>
                  <div style={{ fontSize: 11, color: count > 0 ? "var(--rose)" : "var(--text-2)", fontWeight: 600 }}>
                    {count > 0 ? `${count} aktywnych` : "Brak usterek"}
                  </div>
                  <div title="Stała specjalność — AI kieruje tu usterki z tej kategorii"
                    style={{ fontSize: 11, fontWeight: 700, padding: "5px 12px", borderRadius: 999, background: "var(--bg-2)", border: "1px solid var(--border)", color: specs[name] ? "var(--text-0)" : "var(--text-2)" }}>
                    {specs[name] ? `Specjalność: ${specs[name]}` : "Ogólne (wszystko)"}
                  </div>
                  {qrCodes[name] ? (
                    <>
                      <img src={qrCodes[name]} alt={`QR ${name}`} style={{ width: 120, height: 120, borderRadius: 6, border: "1px solid var(--border)" }} />
                      <div style={{ fontSize: 10, color: "var(--text-2)", textAlign: "center", lineHeight: 1.4 }}>Zeskanuj, aby zobaczyć swoje zadania</div>
                    </>
                  ) : (
                    <div style={{ width: 120, height: 120, borderRadius: 6, background: "var(--bg-2)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--text-2)", textAlign: "center", padding: 8 }}>
                      Brak QR
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="btn btn-ghost" style={{ fontSize: 11, padding: "5px 12px" }} onClick={() => generateKonserwatorQr(name)} disabled={!hasElectron || generatingQr === name}>
                      {generatingQr === name ? "Generuję..." : qrCodes[name] ? "Odśwież QR" : "Generuj QR"}
                    </button>
                    <button className="btn btn-danger-outline" style={{ fontSize: 11, padding: "5px 10px" }} onClick={() => removeKons(name)} title="Usuń konserwatora">✕</button>
                  </div>
                </div>
              );
            })}
            {konserwatorzy.length === 0 && <div style={{ fontSize: 12, color: "var(--text-2)", padding: 8 }}>Brak konserwatorów — dodaj powyżej.</div>}
          </div>
        </div>
      )}

      <AnimatePresence>
        {showForm && <FaultFormModal key="ff" employeeName={employeeName} floors={floors} initialFloor={activeFloor} initialSpace={selectedSpace} onClose={() => setShowForm(false)} onSave={addFault} />}
      </AnimatePresence>
      <AnimatePresence>
        {showDetails && <FaultDetailsModal key="fd" fault={showDetails} floors={floors} onClose={() => setShowDetails(null)} onUpdate={updateFault} employeeName={employeeName} isManager={isManager} />}
      </AnimatePresence>
    </div>
  );
}

export default FaultsPanel;
