import React from "react";
import { Plus, Trash2, Pin, AlertCircle, Clock } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { SHIFT_OPTIONS, SHIFT_LABELS_PL, TENANT_ID } from "../../lib/constants";
import { supabase } from "../../lib/supabase";

const TABLE = "manager_alerts";

export default function AlertsAdminPanel({ currentManager, showToast, addAudit }) {
  const [alerts, setAlerts] = React.useState(() => loadJson(STORAGE_KEYS.managerAlerts, []));
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({
    title: "", body: "", priority: "normal", pinned: false, target_shift: "", expires_in_hours: "",
  });

  const cache = (next) => { saveJson(STORAGE_KEYS.managerAlerts, next); };

  const setF = (key, val) => setForm(f => ({ ...f, [key]: val }));

  React.useEffect(() => {
    if (!supabase) return;
    supabase.from(TABLE).select("*").eq("tenant_id", TENANT_ID).order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error("[alerts] fetch:", error.message); return; }
        if (data) { setAlerts(data); cache(data); }
      });
    const ch = supabase.channel("alerts-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `tenant_id=eq.${TENANT_ID}` }, () => {
        supabase.from(TABLE).select("*").eq("tenant_id", TENANT_ID).order("created_at", { ascending: false })
          .then(({ data }) => { if (data) { setAlerts(data); cache(data); } });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const add = async () => {
    if (!form.title.trim() || !form.body.trim()) { showToast("Uzupelnij tytul i tresc.", "warning"); return; }
    const expires_at = form.expires_in_hours
      ? new Date(Date.now() + Number(form.expires_in_hours) * 3600000).toISOString()
      : null;
    const item = {
      id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      title: form.title.trim(),
      body: form.body.trim(),
      priority: form.priority,
      pinned: form.pinned,
      target_shift: form.target_shift || null,
      expires_at,
      created_by: currentManager,
      created_at: new Date().toISOString(),
    };
    const next = [item, ...alerts];
    setAlerts(next); cache(next);
    if (supabase) {
      const { error } = await supabase.from(TABLE).insert(item);
      if (error) showToast("Blad Supabase: " + error.message, "warning");
    }
    addAudit?.(currentManager, `Dodano alert: "${item.title}"`);
    setForm({ title: "", body: "", priority: "normal", pinned: false, target_shift: "", expires_in_hours: "" });
    setShowForm(false);
    showToast("Alert dodany — widoczny dla pracownikow.", "success");
  };

  const remove = async (id) => {
    const item = alerts.find(a => a.id === id);
    const next = alerts.filter(a => a.id !== id);
    setAlerts(next); cache(next);
    if (supabase) {
      const { error } = await supabase.from(TABLE).delete().eq("id", id);
      if (error) showToast("Blad Supabase: " + error.message, "warning");
    }
    addAudit?.(currentManager, `Usunieto alert: "${item?.title}"`);
    showToast("Alert usuniety.", "info");
  };

  const patch = async (id, fields) => {
    const next = alerts.map(a => a.id === id ? { ...a, ...fields } : a);
    setAlerts(next); cache(next);
    if (supabase) {
      const { error } = await supabase.from(TABLE).update(fields).eq("id", id);
      if (error) showToast("Blad Supabase: " + error.message, "warning");
    }
  };

  const togglePin = (id) => { const a = alerts.find(x => x.id === id); patch(id, { pinned: !a?.pinned }); };
  const toggleUrgent = (id) => { const a = alerts.find(x => x.id === id); patch(id, { priority: a?.priority === "urgent" ? "normal" : "urgent" }); };

  const now = Date.now();
  const active = alerts.filter(a => !a.expires_at || new Date(a.expires_at).getTime() > now);
  const expired = alerts.filter(a => a.expires_at && new Date(a.expires_at).getTime() <= now);

  const urgentActive = active.filter(a => a.priority === "urgent").length;
  const pinnedActive = active.filter(a => a.pinned).length;
  return (
    <>
      {/* ═══ KPI ROW v2 ═══ */}
      <div className="cc-kpi-row">
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Aktywne alerty</div>
          <div className="cc-kpi-val cc-kpi-val--brand">{active.length}</div>
          <div className="cc-kpi-sub">widoczne dla pracowników</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Pilne</div>
          <div className={`cc-kpi-val${urgentActive>0?" cc-kpi-val--danger":""}`}>{urgentActive}</div>
          <div className="cc-kpi-sub">oznaczone PILNE</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Przypięte</div>
          <div className="cc-kpi-val cc-kpi-val--gold">{pinnedActive}</div>
          <div className="cc-kpi-sub">na górze listy</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Wygasłe</div>
          <div className="cc-kpi-val">{expired.length}</div>
          <div className="cc-kpi-sub">do usunięcia</div>
        </div>
      </div>

    <div className="panel glass dark-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="panel-title"><AlertCircle size={16} /> Pilne informacje dla pracownikow</div>
        <button className="btn btn-rose" style={{ fontSize: 12 }} onClick={() => setShowForm(v => !v)}>
          <Plus size={14} style={{ marginRight: 4 }} />{showForm ? "Anuluj" : "Nowy alert"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-light)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div className="cc-form-grid cc-form-grid-2" style={{ marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Tytul *</label>
              <input className="input" value={form.title} onChange={e => setF("title", e.target.value)} placeholder="np. Awaria windy, przerwa woda" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Priorytet</label>
              <select className="input" value={form.priority} onChange={e => setF("priority", e.target.value)}>
                <option value="normal">Normalny</option>
                <option value="urgent">Pilny (czerwony)</option>
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Tresc *</label>
            <textarea className="input" rows={3} value={form.body} onChange={e => setF("body", e.target.value)}
              placeholder="Szczegoly waznej informacji dla pracownikow..." style={{ resize: "vertical" }} />
          </div>
          <div className="cc-form-grid cc-form-grid-3" style={{ marginBottom: 14 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Zmiana (opcja)</label>
              <select className="input" value={form.target_shift} onChange={e => setF("target_shift", e.target.value)}>
                <option value="">Wszystkie zmiany</option>
                {SHIFT_OPTIONS.map(s => <option key={s} value={s}>{SHIFT_LABELS_PL[s] || s}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Wygasa po (godz.)</label>
              <input className="input" type="number" min="1" max="168" value={form.expires_in_hours}
                onChange={e => setF("expires_in_hours", e.target.value)} placeholder="np. 24" />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", paddingBottom: 2 }}>
              <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                <input type="checkbox" checked={form.pinned} onChange={e => setF("pinned", e.target.checked)} />
                Przypnij na gorze
              </label>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Anuluj</button>
            <button className="btn btn-rose" onClick={add}>Dodaj alert</button>
          </div>
        </div>
      )}

      {active.length === 0 && !showForm && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 10, opacity: .35 }}>📭</div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Brak aktywnych alertow</div>
          <div style={{ fontSize: 12, marginTop: 6, opacity: .7 }}>Kliknij "Nowy alert" aby dodac pilna informacje widoczna dla pracownikow w pre-shift i InboxPanel.</div>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {active.map(a => {
          const exp = a.expires_at ? Math.max(0, new Date(a.expires_at).getTime() - now) : null;
          const expH = exp !== null ? Math.ceil(exp / 3600000) : null;
          return (
            <div key={a.id} className="cc-preshift-item"
              style={{ borderLeftColor: a.priority === "urgent" ? "var(--rose)" : "var(--gold)" }}>
              <div className="cc-preshift-item-head" style={{ flexWrap: "wrap", gap: 6 }}>
                <div className="cc-preshift-item-title" style={{ flex: 1 }}>{a.title}</div>
                {a.pinned && (
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "var(--plum-soft)", color: "var(--plum)", fontWeight: 700 }}>
                    Przypiety
                  </span>
                )}
                {a.priority === "urgent" && <span className="cc-preshift-urgent">PILNE</span>}
                {a.target_shift && (
                  <span style={{ fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "var(--bg-secondary)", border: "1px solid var(--border-light)", fontWeight: 600 }}>
                    {SHIFT_LABELS_PL[a.target_shift] || a.target_shift}
                  </span>
                )}
                {expH !== null && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, padding: "2px 7px", borderRadius: 999, background: "var(--amber-light,#fef3c7)", color: "var(--amber)", fontWeight: 700 }}>
                    <Clock size={8} /> {expH < 24 ? `${expH} godz.` : `${Math.ceil(expH / 24)} dni`}
                  </span>
                )}
                <button onClick={() => toggleUrgent(a.id)} title={a.priority === "urgent" ? "Zmien na normalny" : "Oznacz jako pilne"}
                  style={{ border: "none", background: "none", cursor: "pointer", padding: "2px 5px", borderRadius: 4, color: "var(--rose)", fontSize: 11, fontWeight: 700 }}>
                  {a.priority === "urgent" ? "!" : "!?"}
                </button>
                <button onClick={() => togglePin(a.id)} title={a.pinned ? "Odepnij" : "Przypnij"}
                  style={{ border: "none", background: "none", cursor: "pointer", padding: "2px 5px", borderRadius: 4, color: "var(--plum)" }}>
                  <Pin size={12} />
                </button>
                <button onClick={() => remove(a.id)} title="Usun alert"
                  style={{ border: "none", background: "none", cursor: "pointer", padding: "2px 5px", borderRadius: 4, color: "var(--rose)" }}>
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="cc-preshift-item-body">{a.body}</div>
              <div className="cc-preshift-item-meta">
                Dodano: {new Date(a.created_at).toLocaleDateString("pl-PL")} · {a.created_by}
                {a.expires_at && ` · Wygasa: ${new Date(a.expires_at).toLocaleDateString("pl-PL")}`}
              </div>
            </div>
          );
        })}
      </div>

      {expired.length > 0 && (
        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
            Wygasle ({expired.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {expired.map(a => (
              <div key={a.id} style={{ opacity: .5, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, background: "var(--bg-secondary)", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{a.title}</span>
                <button onClick={() => remove(a.id)} title="Usun" style={{ border: "none", background: "none", cursor: "pointer", color: "var(--rose)" }}>
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
