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

function VouchersPanel({ employeeName, isManager, showToast, askConfirm }) {
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

  const deleteVoucher = (id) => {
    askConfirm("Usunąć ten voucher?", async () => {
      setVouchers(prev => prev.filter(v => v.id !== id));
      showToast?.("Voucher usunięty.", "info");
      if (supabase) {
        const { error } = await supabase.from(TABLE).delete().eq("id", id);
        if (error) showToast?.("Blad Supabase: " + error.message, "warning");
      }
    });
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
      {/* ═══ KPI ROW v2 wg v2/04-vouchers ═══ */}
      <div className="cc-vouchers-kpi-row">
        <div className="cc-vouchers-kpi">
          <div className="cc-vouchers-kpi-lbl">Aktywne</div>
          <div className="cc-vouchers-kpi-val cc-vouchers-kpi-val--ember">{issuedCount}</div>
          <div className="cc-vouchers-kpi-sub">do realizacji</div>
        </div>
        <div className="cc-vouchers-kpi">
          <div className="cc-vouchers-kpi-lbl">Wartość aktywnych</div>
          <div className="cc-vouchers-kpi-val">
            {activeValue.toLocaleString("pl-PL")}<span className="cc-vouchers-kpi-unit"> zł</span>
          </div>
          <div className="cc-vouchers-kpi-sub">{issuedCount>0?`śr. ${Math.round(activeValue/issuedCount).toLocaleString("pl-PL")} zł / voucher`:"łącznie"}</div>
        </div>
        <div className="cc-vouchers-kpi">
          <div className="cc-vouchers-kpi-lbl">Wykorzystane</div>
          <div className="cc-vouchers-kpi-val cc-vouchers-kpi-val--teal">{usedCount}</div>
          <div className="cc-vouchers-kpi-sub">{(issuedCount+usedCount)>0?`${Math.round(usedCount/(issuedCount+usedCount)*100)}% redemption`:"w bazie"}</div>
        </div>
        <div className="cc-vouchers-kpi">
          <div className="cc-vouchers-kpi-lbl">Wygasłe</div>
          <div className="cc-vouchers-kpi-val cc-vouchers-kpi-val--rose">{expiredCount}</div>
          <div className="cc-vouchers-kpi-sub">do weryfikacji</div>
        </div>
      </div>

      {/* Toolbar v2 */}
      <div className="cc-vouchers-toolbar">
        {[
          ["issued", "Aktywne", issuedCount],
          ["used", "Zrealizowane", usedCount],
          ["expired", "Wygasłe", expiredCount],
          ["", "Wszystkie", visibleVouchers.length],
        ].map(([k, lbl, cnt]) => (
          <button
            key={k || "all"}
            type="button"
            className={`cc-vouchers-tab${filter === k ? " cc-vouchers-tab--on" : ""}`}
            onClick={() => setFilter(k)}>
            <span>{lbl}</span>
            <span className="cc-vouchers-tab-cnt">{cnt}</span>
          </button>
        ))}
        <div style={{display:"flex",gap:6}}>
          <button
            type="button"
            className={`cc-vouchers-typetab${typeFilter === "voucher" ? " cc-vouchers-typetab--on" : ""}`}
            onClick={() => setTypeFilter(typeFilter === "voucher" ? "" : "voucher")}>
            Restauracja
          </button>
          <button
            type="button"
            className={`cc-vouchers-typetab${typeFilter === "cashback" ? " cc-vouchers-typetab--on" : ""}`}
            onClick={() => setTypeFilter(typeFilter === "cashback" ? "" : "cashback")}>
            Cashback
          </button>
        </div>
        <button className="btn btn-primary cc-vouchers-new-btn" onClick={() => setShowForm(true)}>
          <Plus size={14} /> Wystaw voucher
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="cc-vouchers-empty">
          <div className="cc-vouchers-empty-icon">🎟</div>
          <div>Brak voucherów w wybranym zakresie.</div>
        </div>
      ) : (
        /* ═══ Voucher list v2 — flat rows wg v2/04-vouchers .vt-row ═══ */
        <ul className="cc-vouchers-list" role="list">
          {visible.map(v => {
            const isCashback = v.type === "cashback";
            const isUsed = v.status === "used";
            const isExpired = v.status === "expired";
            const typeLabel = VOUCHER_TYPE_LABELS[v.type] || v.type;
            const typeClass = isCashback ? "cashback" : "voucher";
            const statusClass = isUsed ? "used" : isExpired ? "expired" : "active";
            return (
              <li key={v.id} className={`cc-vouchers-row cc-vouchers-row--${statusClass}`}>
                <div className="cc-vouchers-row-code">{v.code}</div>
                <span className={`cc-vouchers-row-type cc-vouchers-row-type--${typeClass}`}>{typeLabel}</span>
                <div className={`cc-vouchers-row-amount${isUsed?" cc-vouchers-row-amount--muted":""}`}>
                  {v.value}<span className="cc-vouchers-row-amount-unit"> {v.value_unit||""}</span>
                </div>
                <div className="cc-vouchers-row-recipient">
                  <div className="cc-vouchers-row-recipient-name">{v.guest_name || "—"}</div>
                  {(v.reservation_no || v.kw_no) && (
                    <div className="cc-vouchers-row-recipient-sub">
                      {v.reservation_no && `Rez: ${v.reservation_no}`}
                      {v.reservation_no && v.kw_no && " · "}
                      {v.kw_no && `KW: ${v.kw_no}`}
                    </div>
                  )}
                </div>
                <div className="cc-vouchers-row-date">
                  {v.used_at
                    ? `✓ ${new Date(v.used_at).toLocaleDateString("pl-PL", { day:"2-digit", month:"short" })}`
                    : v.expires_at
                      ? `do ${new Date(v.expires_at).toLocaleDateString("pl-PL", { day:"2-digit", month:"short" })}`
                      : "—"}
                </div>
                <div className="cc-vouchers-row-issuer">{v.issued_by || "Recepcja"}</div>
                <span className={`cc-vouchers-row-status cc-vouchers-row-status--${statusClass}`}>
                  {STATUS_LABELS[v.status] || v.status}
                </span>
                <div className="cc-vouchers-row-actions">
                  <button type="button" className="cc-vouchers-action-btn" onClick={() => setFullscreenCode(v)} title="Pokaż kod">
                    <Eye size={12}/>
                  </button>
                  <button type="button" className="cc-vouchers-action-btn" onClick={() => downloadVoucherPDF(v)} title="PDF">
                    <FileDown size={12}/>
                  </button>
                  {v.status === "issued" && (
                    <button type="button" className="cc-vouchers-action-btn cc-vouchers-action-btn--ok" onClick={() => markUsed(v.id)} title="Oznacz jako wykorzystany">
                      <CheckCircle size={12}/>
                    </button>
                  )}
                  {isManager && (
                    <button type="button" className="cc-vouchers-action-btn cc-vouchers-action-btn--danger" onClick={() => deleteVoucher(v.id)} title="Usuń">
                      <Trash2 size={12}/>
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
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
