import React from "react";
import { Plus, Trash2, BellRing, ToggleLeft, ToggleRight } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";
import { TENANT_ID } from "../../lib/constants";
import { supabase } from "../../lib/supabase";

const TABLE = "standing_reminders";
const CATEGORIES = ["check-in", "check-out", "finanse", "bezpieczenstwo", "gosc", "procedury", "inne"];

export default function StandingRemindersPanel({ currentManager, showToast, addAudit }) {
  const [reminders, setReminders] = React.useState(() => loadJson(STORAGE_KEYS.standingReminders, []));
  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", body: "", category: "" });

  const cache = (next) => { saveJson(STORAGE_KEYS.standingReminders, next); };

  const setF = (key, val) => setForm(f => ({ ...f, [key]: val }));

  React.useEffect(() => {
    if (!supabase) return;
    supabase.from(TABLE).select("*").eq("tenant_id", TENANT_ID).order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (error) { console.error("[reminders] fetch:", error.message); return; }
        if (data) { setReminders(data); cache(data); }
      });
    const ch = supabase.channel("reminders-admin")
      .on("postgres_changes", { event: "*", schema: "public", table: TABLE, filter: `tenant_id=eq.${TENANT_ID}` }, () => {
        supabase.from(TABLE).select("*").eq("tenant_id", TENANT_ID).order("created_at", { ascending: false })
          .then(({ data }) => { if (data) { setReminders(data); cache(data); } });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  const add = async () => {
    if (!form.title.trim() || !form.body.trim()) { showToast("Uzupelnij tytul i tresc.", "warning"); return; }
    const item = {
      id: crypto.randomUUID(),
      tenant_id: TENANT_ID,
      title: form.title.trim(),
      body: form.body.trim(),
      category: form.category || null,
      active: true,
      created_by: currentManager,
      created_at: new Date().toISOString(),
    };
    const next = [item, ...reminders];
    setReminders(next); cache(next);
    if (supabase) {
      const { error } = await supabase.from(TABLE).insert(item);
      if (error) showToast("Blad Supabase: " + error.message, "warning");
    }
    addAudit?.(currentManager, `Dodano stale przypomnienie: "${item.title}"`);
    setForm({ title: "", body: "", category: "" });
    setShowForm(false);
    showToast("Przypomnienie dodane — widoczne dla pracownikow.", "success");
  };

  const remove = async (id) => {
    const item = reminders.find(r => r.id === id);
    const next = reminders.filter(r => r.id !== id);
    setReminders(next); cache(next);
    if (supabase) {
      const { error } = await supabase.from(TABLE).delete().eq("id", id);
      if (error) showToast("Blad Supabase: " + error.message, "warning");
    }
    addAudit?.(currentManager, `Usunieto przypomnienie: "${item?.title}"`);
    showToast("Przypomnienie usuniete.", "info");
  };

  const patch = async (id, fields) => {
    const next = reminders.map(r => r.id === id ? { ...r, ...fields } : r);
    setReminders(next); cache(next);
    if (supabase) {
      const { error } = await supabase.from(TABLE).update(fields).eq("id", id);
      if (error) showToast("Blad Supabase: " + error.message, "warning");
    }
  };

  const toggle = (id) => { const r = reminders.find(x => x.id === id); patch(id, { active: !(r?.active !== false) }); };

  const active = reminders.filter(r => r.active !== false);
  const inactive = reminders.filter(r => r.active === false);

  const catCount = new Set(active.map(r => r.category).filter(Boolean)).size;
  return (
    <>
      {/* ═══ KPI ROW v2 ═══ */}
      <div className="cc-kpi-row cc-kpi-row--3">
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Aktywne przypomnienia</div>
          <div className="cc-kpi-val cc-kpi-val--gold">{active.length}</div>
          <div className="cc-kpi-sub">widoczne na każdej zmianie</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Nieaktywne</div>
          <div className="cc-kpi-val">{inactive.length}</div>
          <div className="cc-kpi-sub">ukryte przed pracownikami</div>
        </div>
        <div className="cc-kpi">
          <div className="cc-kpi-lbl">Kategorie</div>
          <div className="cc-kpi-val cc-kpi-val--brand">{catCount}</div>
          <div className="cc-kpi-sub">w użyciu</div>
        </div>
      </div>

    <div className="panel glass dark-panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
        <div className="panel-title"><BellRing size={16} /> Stale przypomnienia dla pracownikow</div>
        <button className="btn btn-gold" style={{ fontSize: 12 }} onClick={() => setShowForm(v => !v)}>
          <Plus size={14} style={{ marginRight: 4 }} />{showForm ? "Anuluj" : "Nowe przypomnienie"}
        </button>
      </div>

      {showForm && (
        <div style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-light)", borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div className="cc-form-grid cc-form-grid-2" style={{ marginBottom: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Tytul *</label>
              <input className="input" value={form.title} onChange={e => setF("title", e.target.value)}
                placeholder="np. Weryfikacja dokumentow goscia" />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Kategoria</label>
              <select className="input" value={form.category} onChange={e => setF("category", e.target.value)}>
                <option value="">Bez kategorii</option>
                {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".05em", color: "var(--text-muted)", display: "block", marginBottom: 4 }}>Tresc *</label>
            <textarea className="input" rows={3} value={form.body} onChange={e => setF("body", e.target.value)}
              placeholder="Instrukcja lub wytyczna obowiazujaca na kazdej zmianie..." style={{ resize: "vertical" }} />
          </div>
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
            <button className="btn btn-outline" onClick={() => setShowForm(false)}>Anuluj</button>
            <button className="btn btn-gold" onClick={add}>Dodaj przypomnienie</button>
          </div>
        </div>
      )}

      {active.length === 0 && !showForm && (
        <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 10, opacity: .35 }}>🔔</div>
          <div style={{ fontSize: 13.5, fontWeight: 600 }}>Brak aktywnych przypomnien</div>
          <div style={{ fontSize: 12, marginTop: 6, opacity: .7 }}>Kliknij "Nowe przypomnienie" aby dodac stala instrukcje widoczna podczas kazdej zmiany.</div>
        </div>
      )}

      {active.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: inactive.length > 0 ? 16 : 0 }}>
          {active.map(r => (
            <div key={r.id} className="cc-preshift-item" style={{ borderLeftColor: "var(--gold)" }}>
              <div className="cc-preshift-item-head" style={{ flexWrap: "wrap", gap: 6 }}>
                <div className="cc-preshift-item-title" style={{ flex: 1 }}>{r.title}</div>
                {r.category && <span className="cc-preshift-cat">{r.category}</span>}
                <button onClick={() => toggle(r.id)} title="Dezaktywuj (ukryj przed pracownikami)"
                  style={{ border: "none", background: "none", cursor: "pointer", padding: "2px 5px", borderRadius: 4, color: "var(--emerald)" }}>
                  <ToggleRight size={15} />
                </button>
                <button onClick={() => remove(r.id)} title="Usun"
                  style={{ border: "none", background: "none", cursor: "pointer", padding: "2px 5px", borderRadius: 4, color: "var(--rose)" }}>
                  <Trash2 size={12} />
                </button>
              </div>
              <div className="cc-preshift-item-body">{r.body}</div>
              <div className="cc-preshift-item-meta">
                Dodano: {new Date(r.created_at).toLocaleDateString("pl-PL")} · {r.created_by}
              </div>
            </div>
          ))}
        </div>
      )}

      {inactive.length > 0 && (
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: ".06em", marginBottom: 8 }}>
            Nieaktywne — ukryte przed pracownikami ({inactive.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {inactive.map(r => (
              <div key={r.id} style={{ opacity: .5, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 12px", borderRadius: 8, background: "var(--bg-secondary)", border: "1px solid var(--border-light)" }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{r.title}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  <button onClick={() => toggle(r.id)} title="Aktywuj"
                    style={{ border: "none", background: "none", cursor: "pointer", color: "var(--emerald)" }}>
                    <ToggleLeft size={15} />
                  </button>
                  <button onClick={() => remove(r.id)} title="Usun"
                    style={{ border: "none", background: "none", cursor: "pointer", color: "var(--rose)" }}>
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
