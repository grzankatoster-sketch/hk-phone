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
  const deleteFault = async (id) => {
    setFaults(prev => prev.filter(f => f.id !== id));
    showToast?.("Usterka usunięta.", "info");
    if (supabase) {
      const { error } = await supabase.from(TABLE).delete().eq("id", id);
      if (error) showToast?.("Blad Supabase: " + error.message, "warning");
    }
  };

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

      <div className="fault-stats">
        <div className="fstat"><div className="fstat-num" style={{ color: "var(--rose)" }}>{urgentCount}</div><div><div className="fstat-label">Pilne</div><div className="fstat-sub">wymaga akcji</div></div></div>
        <div className="fstat"><div className="fstat-num" style={{ color: "var(--amber)" }}>{activeCount - urgentCount}</div><div><div className="fstat-label">Normalne</div><div className="fstat-sub">aktywne zgłoszenia</div></div></div>
        <div className="fstat"><div className="fstat-num" style={{ color: "var(--teal)" }}>{doneCount}</div><div><div className="fstat-label">Rozwiązane</div><div className="fstat-sub">łącznie w bazie</div></div></div>
        <div className="fstat"><div className="fstat-num" style={{ color: "var(--text-1)" }}>{spaceFaults.length}</div><div><div className="fstat-label">Widoczne</div><div className="fstat-sub">po filtrach</div></div></div>
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
          <FloorMap floor={selectedFloorObj} faults={faults} onSelectSpace={setSelectedSpace} selectedSpace={selectedSpace} />
          {selectedSpace && (
            <div style={{ marginTop: 12, fontSize: 12, color: "var(--text-2)", textAlign: "center" }}>
              Pokazuję: <strong style={{ color: "var(--text-0)" }}>{selectedSpace}</strong>
              <button className="fault-action-btn" onClick={() => setSelectedSpace("")} style={{ marginLeft: 8, padding: "2px 8px" }}>Wyczyść</button>
            </div>
          )}
        </div>
      </div>

      {spaceFaults.length === 0 ? (
        <div className="dp-empty"><AlertTriangle size={24} /><div style={{ marginTop: 8 }}>Brak usterek w wybranym zakresie.</div></div>
      ) : (
        <div className="fault-list">
          {spaceFaults.map(f => {
            const fl = floors.find(x => x.key === f.floor);
            const spaceLabel = fl?.key === "parter" ? (fl.spaces.find(s => s.id === f.space_id)?.label || f.space_id) : f.space_id;
            const done = f.status === "done";
            const priority = done ? "done" : f.priority === "urgent" ? "urgent" : f.priority === "low" ? "low" : "normal";
            const statusLabel = { open: "Nowa", in_progress: "W trakcie", done: "Rozwiązane" }[f.status] || f.status;
            const initials = (f.assigned_to || "HK").split(/\s+/).map(p => p[0]).join("").slice(0, 2).toUpperCase();
            return (
              <div key={f.id} className={`fault-card ${priority === "urgent" ? "urgent" : ""} ${done ? "done" : ""}`}>
                <div className={`fault-priority-bar ${priority}`} />
                <div className="fault-body">
                  <div className="fault-main" onClick={() => setShowDetails(f)} style={{ cursor: "pointer" }}>
                    <div className="fault-header-row">
                      <div className="fault-room">{spaceLabel}</div>
                      <div className="fault-title">{f.category || "Usterka"}</div>
                    </div>
                    <div className="fault-desc">{f.description}</div>
                    <div className="fault-meta">
                      <span className={`fault-badge ${done ? "badge-done" : priority === "urgent" ? "badge-urgent" : "badge-normal"}`}>{priority === "urgent" ? "Pilne" : statusLabel}</span>
                      <span className="fault-badge badge-floor">{fl?.label || f.floor}</span>
                      <span className="fault-date">Zgłoszono: {new Date(f.reported_at).toLocaleString("pl-PL", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                      <span className="fault-reported">Zgłosił(a): {f.reported_by || "Recepcja"}</span>
                    </div>
                  </div>
                  <div className="fault-actions">
                    <div className="fault-assignee"><div className="assignee-avatar cc-fault-assignee-avatar">{initials}</div>{f.assigned_to || "Nieprzypisane"}</div>
                    {!done && <button className="fault-action-btn cc-fault-resolve-btn" onClick={() => updateFault(f.id, { status: "done", resolved_at: new Date().toISOString() })}>Rozwiąż</button>}
                    <button className="fault-action-btn" onClick={() => setShowDetails(f)}>Szczegóły</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
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
        {showDetails && <FaultDetailsModal key="fd" fault={showDetails} floors={floors} onClose={() => setShowDetails(null)} onUpdate={updateFault} onDelete={deleteFault} employeeName={employeeName} isManager={isManager} />}
      </AnimatePresence>
    </div>
  );
}

export default FaultsPanel;
