import React from "react";
import { AnimatePresence } from "framer-motion";
import { Plus, Trash2, CheckCircle, Eye, FileDown } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { VOUCHER_TYPE_LABELS, TENANT_ID } from "../../lib/constants";
import { supabase } from "../../lib/supabase";
import VoucherFormModal from "../../components/modals/VoucherFormModal";
import { downloadVoucherPDF } from "../../lib/pdf-voucher";

const STATUS_LABELS = { issued: "Aktywny", used: "Zrealizowany", expired: "Wygasły" };
const TABLE = "vouchers";

function VouchersPanel({ employeeName, isManager, showToast }) {
  const [vouchers, setVouchers] = React.useState(() => loadJson(STORAGE_KEYS.vouchers, []));
  const [showForm, setShowForm] = React.useState(false);
  const [filter, setFilter] = React.useState("issued");
  const [typeFilter, setTypeFilter] = React.useState("");
  const [fullscreenCode, setFullscreenCode] = React.useState(null);

  React.useEffect(() => { saveJson(STORAGE_KEYS.vouchers, vouchers); }, [vouchers]);

  React.useEffect(() => {
    if (!supabase) return;
    supabase.from(TABLE).select("*").eq("tenant_id", TENANT_ID).order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error("[vouchers] fetch:", error.message); return; }
        if (data && data.length > 0) { setVouchers(data); saveJson(STORAGE_KEYS.vouchers, data); }
      });
    const ch = supabase.channel("vouchers-panel")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `tenant_id=eq.${TENANT_ID}` }, () => {
        supabase.from(TABLE).select("*").eq("tenant_id", TENANT_ID).order("created_at", { ascending: false })
          .then(({ data }) => { if (data) { setVouchers(data); saveJson(STORAGE_KEYS.vouchers, data); } });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const addVoucher = async (v) => {
    const row = { ...v, tenant_id: TENANT_ID };
    setVouchers(prev => [row, ...prev]);
    showToast?.("Voucher wystawiony.", "success");
    if (supabase) {
      const { error } = await supabase.from(TABLE).insert(row);
      if (error) showToast?.("Blad Supabase: " + error.message, "warning");
    }
  };

  const markUsed = async (id) => {
    const patch = { status: "used", used_at: new Date().toISOString() };
    setVouchers(prev => prev.map(v => v.id === id ? { ...v, ...patch } : v));
    showToast?.("Voucher oznaczony jako oddany.", "success");
    if (supabase) {
      const { error } = await supabase.from(TABLE).update(patch).eq("id", id);
      if (error) showToast?.("Blad Supabase: " + error.message, "warning");
    }
  };

  const deleteVoucher = async (id) => {
    if (!confirm("Usunąć ten voucher?")) return;
    setVouchers(prev => prev.filter(v => v.id !== id));
    showToast?.("Voucher usunięty.", "info");
    if (supabase) {
      const { error } = await supabase.from(TABLE).delete().eq("id", id);
      if (error) showToast?.("Blad Supabase: " + error.message, "warning");
    }
  };

  const visibleVouchers = isManager ? vouchers : vouchers.filter(v => v.issued_by === employeeName);
  const visible = visibleVouchers.filter(v => {
    if (filter && v.status !== filter) return false;
    if (typeFilter && v.type !== typeFilter) return false;
    return true;
  });

  const issuedCount = visibleVouchers.filter(v => v.status === "issued").length;
  const usedCount = visibleVouchers.filter(v => v.status === "used").length;
  const expiredCount = visibleVouchers.filter(v => v.status === "expired").length;
  const activeValue = visibleVouchers
    .filter(v => v.status === "issued")
    .reduce((sum, v) => sum + (parseFloat(String(v.value).replace(",", ".")) || 0), 0);

  return (
    <div className="voucher-layout">
      <div className="toolbar">
        <div className="filter-tabs">
          {[["issued", `Aktywne (${issuedCount})`], ["used", `Zrealizowane (${usedCount})`], ["", "Wszystkie"]].map(([k, lbl]) => (
            <button key={k || "all"} className={`filter-tab${filter === k ? " active" : ""}`} onClick={() => setFilter(k)}>{lbl}</button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 6, marginLeft: 8, flexWrap: "wrap" }}>
          <button className={`btn btn-ghost${typeFilter === "voucher" ? " active" : ""}`} style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setTypeFilter(typeFilter === "voucher" ? "" : "voucher")}>Voucher restauracyjny</button>
          <button className={`btn btn-ghost${typeFilter === "cashback" ? " active" : ""}`} style={{ padding: "6px 12px", fontSize: 12 }} onClick={() => setTypeFilter(typeFilter === "cashback" ? "" : "cashback")}>Cashback</button>
        </div>
        <div className="spacer" />
        <button className="btn btn-primary" onClick={() => setShowForm(true)}><Plus size={14} /> Wystaw voucher</button>
      </div>

      <div className="stats-row">
        <div className="stat-mini"><div className="stat-num" style={{ color: "var(--gold)" }}>{issuedCount}</div><div><div className="stat-label">Aktywne</div><div className="stat-sub">do realizacji</div></div></div>
        <div className="stat-mini"><div className="stat-num" style={{ color: "var(--teal)" }}>{usedCount}</div><div><div className="stat-label">Zrealizowane</div><div className="stat-sub">w bazie</div></div></div>
        <div className="stat-mini"><div className="stat-num" style={{ color: "var(--ember)" }}>{activeValue.toLocaleString("pl-PL")} zł</div><div><div className="stat-label">Wartość aktywnych</div><div className="stat-sub">łącznie</div></div></div>
        <div className="stat-mini"><div className="stat-num" style={{ color: "var(--text-1)" }}>{expiredCount}</div><div><div className="stat-label">Wygasłe</div><div className="stat-sub">do weryfikacji</div></div></div>
      </div>

      {visible.length === 0 ? (
        <div className="dp-empty">Brak voucherów w wybranym zakresie.</div>
      ) : (
        <div className="voucher-grid">
          {visible.map(v => {
            const isCashback = v.type === "cashback";
            const isUsed = v.status === "used";
            const cardClass = isUsed ? "used" : isCashback ? "cashback" : v.status === "expired" ? "expired" : "active";
            const typeLabel = VOUCHER_TYPE_LABELS[v.type] || v.type;
            return (
              <div key={v.id} className={`voucher-card ${cardClass}`}>
                <div className="v-top">
                  <div className={`v-type-badge ${isCashback ? "badge-cashback" : isUsed ? "badge-used" : "badge-voucher"}`}>{typeLabel}</div>
                  <div className={`v-status-chip ${isUsed ? "chip-used" : "chip-active"}`}>{STATUS_LABELS[v.status] || v.status}</div>
                  <div className={`v-amount ${isUsed ? "muted" : isCashback ? "teal" : "gold"}`}>{v.value} {v.value_unit}</div>
                  <div className="v-amount-label">{isCashback ? "zwrot gotówkowy do rozliczenia" : "voucher na usługi restauracyjne"}</div>
                </div>
                <div className="ticket-holes"><div className="hole" /><div className="hole" /></div>
                <div className="v-bottom">
                  <div className="v-meta">
                    <div className="v-code">{v.code}</div>
                    <div className="v-who">Wystawił(a): {v.issued_by || "Recepcja"}{v.guest_name ? ` · Gość: ${v.guest_name}` : ""}</div>
                    <div className="v-dates">
                      {v.used_at ? `Zrealizowano: ${new Date(v.used_at).toLocaleDateString("pl-PL")}` : `Ważny do: ${v.expires_at ? new Date(v.expires_at).toLocaleDateString("pl-PL") : "bez terminu"}`}
                      {v.reservation_no ? ` · Rez: ${v.reservation_no}` : ""}
                      {v.kw_no ? ` · KW: ${v.kw_no}` : ""}
                    </div>
                  </div>
                  <div className="v-actions">
                    <button className="v-btn" onClick={() => setFullscreenCode(v)}><Eye size={11} /> Kod</button>
                    <button className="v-btn" onClick={() => downloadVoucherPDF(v)}><FileDown size={11} /> PDF</button>
                    {v.status === "issued" && <button className="v-btn cc-voucher-mark-used-btn" onClick={() => markUsed(v.id)}><CheckCircle size={11} /> Oddany</button>}
                    {isManager && <button className="v-btn" style={{ color: "var(--rose)", borderColor: "var(--rose-border)" }} onClick={() => deleteVoucher(v.id)}><Trash2 size={11} /> Usuń</button>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {fullscreenCode && (
        <div className="modal-backdrop" style={{ zIndex: 1200 }} onClick={() => setFullscreenCode(null)}>
          <div className="data-card" style={{ padding: 28, maxWidth: 360, width: "90%", textAlign: "center" }} onClick={e => e.stopPropagation()}>
            <div style={{ fontSize: 12, fontWeight: 800, color: "var(--text-2)", textTransform: "uppercase", letterSpacing: ".08em" }}>
              {VOUCHER_TYPE_LABELS[fullscreenCode.type] || fullscreenCode.type}
            </div>
            <div style={{ fontFamily: "var(--font-m)", fontSize: 28, fontWeight: 900, color: "var(--ember)", letterSpacing: ".1em", wordBreak: "break-all", margin: "16px 0" }}>
              {fullscreenCode.code}
            </div>
            <div style={{ fontSize: 14, color: "var(--text-1)" }}>
              {fullscreenCode.value} {fullscreenCode.value_unit}{fullscreenCode.guest_name ? ` · ${fullscreenCode.guest_name}` : ""}
            </div>
            <button className="btn btn-ghost" style={{ marginTop: 18 }} onClick={() => setFullscreenCode(null)}>Zamknij</button>
          </div>
        </div>
      )}

      <AnimatePresence>
        {showForm && <VoucherFormModal key="vf" employeeName={employeeName} onClose={() => setShowForm(false)} onSave={addVoucher} />}
      </AnimatePresence>
    </div>
  );
}

export default VouchersPanel;
