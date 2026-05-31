import React from "react";
import { AnimatePresence } from "framer-motion";
import { AlertTriangle, Plus, QrCode } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { FAULT_FLOORS, KONSERWATOR_WORKERS, TENANT_ID } from "../../lib/constants";
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
  const [workerFilter, setWorkerFilter] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [qrCodes, setQrCodes] = React.useState({});
  const [generatingQr, setGeneratingQr] = React.useState(null);

  const floors = React.useMemo(() => [
    FAULT_FLOORS[0],
    { ...FAULT_FLOORS[1], rooms: floors1 },
    { ...FAULT_FLOORS[2], rooms: floors2 },
    { ...FAULT_FLOORS[3], rooms: floors3 },
    { key: "hk", label: "📱 HK", spaces: [], rooms: [] }, // usterki zgłoszone z telefonów HK
  ], [floors1, floors2, floors3]);

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

  const activeCount = faults.filter(f => f.status !== "done").length;
  const urgentCount = faults.filter(f => f.status !== "done" && f.priority === "urgent").length;
  const doneCount = faults.filter(f => f.status === "done").length;

  const generateKonserwatorQr = async (name) => {
    if (!hasElectron) return;
    setGeneratingQr(name);
    try {
      const workerFaults = faults.filter(f => f.assigned_to === name && f.status !== "done");
      const qr = await window.electronAPI.hkGetKonserwatorQr(name, workerFaults);
      if (qr?.dataURL) setQrCodes(prev => ({ ...prev, [name]: qr.dataURL }));
    } finally {
      setGeneratingQr(null);
    }
  };

  const visibleFaults = faults
    .filter(f => filter === "active" ? f.status !== "done" : filter === "done" ? f.status === "done" : true)
    .filter(f => !workerFilter || f.assigned_to === workerFilter)
    .filter(f => {
      const q = search.trim().toLowerCase();
      if (!q) return true;
      return [f.description, f.space_id, f.floor, f.assigned_to, f.reported_by, f.category]
        .some(v => String(v || "").toLowerCase().includes(q));
    })
    .sort((a, b) => {
      if (a.priority === "urgent" && b.priority !== "urgent") return -1;
      if (b.priority === "urgent" && a.priority !== "urgent") return 1;
      return new Date(b.reported_at) - new Date(a.reported_at);
    });

  const selectedFloorObj = floors.find(f => f.key === activeFloor);
  const floorFaults = visibleFaults.filter(f => f.floor === activeFloor);
  const spaceFaults = selectedSpace
    ? visibleFaults.filter(f => f.floor === activeFloor && f.space_id === selectedSpace)
    : floorFaults;

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
        <div className="filter-tabs">
          {[["active", `Aktywne (${activeCount})`], ["all", "Wszystkie"], ["done", `Rozwiązane (${doneCount})`]].map(([k, lbl]) => (
            <button key={k} className={`filter-tab${filter === k ? " active" : ""}`} onClick={() => setFilter(k)}>
              {lbl}
            </button>
          ))}
        </div>
        <div className="spacer" />
        <select className="input" value={workerFilter} onChange={e => setWorkerFilter(e.target.value)} style={{ width: 178, height: 34, fontSize: 12 }}>
          <option value="">Konserwator: wszyscy</option>
          {KONSERWATOR_WORKERS.map(w => <option key={w} value={w}>{w}</option>)}
        </select>
        <div className="search-wrap">
          <svg className="search-icon" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" /></svg>
          <input className="search-input" placeholder="Szukaj usterki..." value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Zgłoś usterkę</button>
      </div>

      {/* ═══ KPI row v2 wg v2/03-faults — 4 cards z color-coded icons ═══ */}
      <div className="cc-faults-kpi-row">
        <div className="cc-faults-kpi">
          <div className="cc-faults-kpi-ic cc-faults-kpi-ic--rose" aria-hidden="true">
            <AlertTriangle size={17}/>
          </div>
          <div className="cc-faults-kpi-info">
            <div className="cc-faults-kpi-lbl">Pilne</div>
            <div className="cc-faults-kpi-val">{urgentCount}</div>
            <div className="cc-faults-kpi-sub">wymaga akcji</div>
          </div>
        </div>
        <div className="cc-faults-kpi">
          <div className="cc-faults-kpi-ic cc-faults-kpi-ic--amber" aria-hidden="true">
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
          </div>
          <div className="cc-faults-kpi-info">
            <div className="cc-faults-kpi-lbl">Normalne</div>
            <div className="cc-faults-kpi-val">{activeCount - urgentCount}</div>
            <div className="cc-faults-kpi-sub">aktywne zgłoszenia</div>
          </div>
        </div>
        <div className="cc-faults-kpi">
          <div className="cc-faults-kpi-ic cc-faults-kpi-ic--teal" aria-hidden="true">
            <svg width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
          </div>
          <div className="cc-faults-kpi-info">
            <div className="cc-faults-kpi-lbl">Rozwiązane</div>
            <div className="cc-faults-kpi-val">{doneCount}</div>
            <div className="cc-faults-kpi-sub">łącznie w bazie</div>
          </div>
        </div>
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

      <div className="data-card" style={{ marginBottom: 16 }}>
        <div className="data-card-head">
          <div className="data-card-title">Mapa piętra</div>
          <div className="filter-tabs">
            {floors.map(f => {
              const cnt = faults.filter(x => x.floor === f.key && x.status !== "done").length;
              return (
                <button key={f.key} className={`filter-tab${activeFloor === f.key ? " active" : ""}`} onClick={() => { setActiveFloor(f.key); setSelectedSpace(""); }}>
                  {f.label}{cnt > 0 ? ` (${cnt})` : ""}
                </button>
              );
            })}
          </div>
        </div>
        <div style={{ padding: 18 }}>
          {activeFloor === "hk" ? (
            <div className="cc-fault-hint" style={{ textAlign: "center" }}>📱 Usterki zgłoszone z telefonów HK (ze zdjęciami) — lista poniżej.</div>
          ) : (
            <FloorMap floor={selectedFloorObj} faults={faults} onSelectSpace={setSelectedSpace} selectedSpace={selectedSpace} />
          )}
          {selectedSpace && (
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-2)", textAlign: "center" }}>
              Pokazuję: <strong style={{ color: "var(--text-0)" }}>{selectedSpace}</strong>
              <button className="fault-action-btn" onClick={() => setSelectedSpace("")} style={{ marginLeft: 8, padding: "2px 8px" }}>Wyczyść</button>
            </div>
          )}
        </div>
      </div>

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
                  <div className="cc-fault-cat">{f.category || "Usterka"}</div>
                  <div className="cc-fault-desc">{f.description}</div>
                  <div className="cc-fault-meta">
                    <span>Zgłosił(a): <b>{f.reported_by || "Recepcja"}</b></span>
                    <span>{reportedShort}</span>
                  </div>
                </div>
                <div className="cc-fault-status">
                  <span className={`cc-fault-badge cc-fault-badge--${done ? "done" : f.status === "in_progress" ? "progress" : "open"}`}>{statusLabel}</span>
                  <span className="cc-fault-time">{elapsedLabel}</span>
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
            <div className="data-card-title" style={{ display: "flex", alignItems: "center", gap: 8 }}><QrCode size={18} /> Kody QR - Konserwatorzy</div>
          </div>
          {!hasElectron && (
            <div className="cc-fault-hint">
              QR kody dostępne tylko w aplikacji Electron.
            </div>
          )}
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", padding: 16 }}>
            {KONSERWATOR_WORKERS.map(name => {
              const count = faults.filter(f => f.assigned_to === name && f.status !== "done").length;
              return (
                <div key={name} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: "14px 18px", borderRadius: 12, background: "var(--bg-1)", border: "1px solid var(--border)", minWidth: 140 }}>
                  <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text-0)" }}>{name}</div>
                  <div style={{ fontSize: 11, color: count > 0 ? "var(--rose)" : "var(--text-2)", fontWeight: 600 }}>
                    {count > 0 ? `${count} aktywnych` : "Brak usterek"}
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
                  <button className="btn btn-ghost" style={{ fontSize: 11, padding: "5px 12px" }} onClick={() => generateKonserwatorQr(name)} disabled={!hasElectron || generatingQr === name}>
                    {generatingQr === name ? "Generuję..." : qrCodes[name] ? "Odśwież QR" : "Generuj QR"}
                  </button>
                </div>
              );
            })}
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
