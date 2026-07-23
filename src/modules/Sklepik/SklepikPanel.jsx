import React from "react";
import { ShoppingBag, Plus, Undo2, Package } from "lucide-react";
import { supabase } from "../../lib/supabase";
import { TENANT_ID } from "../../lib/constants";
import { fmtMoney } from "../../lib/format";

// Sklepik recepcji jako magazyn (WYKONANIE 4.2, rozszerzone o wymaganie usera:
// prawdziwy stan/wydania/ceny, nie tylko log sprzedaży). Stan (shop_items.stock)
// mutowany WYŁĄCZNIE przez RPC (shop_sell/shop_storno/shop_purchase) z blokadą
// wiersza po stronie bazy — dwie jednoczesne sprzedaże nie przesprzedadzą towaru.
// "Zakupy" (przyjęcie towaru) — TYLKO menedżer (isAdmin), jak storno. Utarg to
// osobny log (shop_sales), zero wpływu na calculateShiftCash — wzorem 4.1/4.12.
const PAYMENTS = [["gotowka", "Gotówka"], ["karta", "Karta"]];

export default function SklepikPanel({ isAdmin, showToast, employeeName, selectedShift }) {
  const [items, setItems] = React.useState([]);
  const [sales, setSales] = React.useState([]);
  const [qty, setQty] = React.useState({});     // itemId -> ilość do sprzedaży
  const [payment, setPayment] = React.useState({}); // itemId -> gotowka|karta
  const [busy, setBusy] = React.useState(null);
  const [showZakupy, setShowZakupy] = React.useState(false);
  const [zkMode, setZkMode] = React.useState("existing"); // existing | new
  const [zkItemId, setZkItemId] = React.useState("");
  const [zkName, setZkName] = React.useState("");
  const [zkPrice, setZkPrice] = React.useState("");
  const [zkQty, setZkQty] = React.useState("");
  const [zkCost, setZkCost] = React.useState("");

  const todayKey = React.useMemo(() => new Date().toISOString().slice(0, 10), []);

  const load = React.useCallback(async () => {
    if (!supabase) return;
    const [{ data: itemsData }, { data: salesData }] = await Promise.all([
      supabase.from("shop_items").select("*").eq("tenant_id", TENANT_ID).eq("active", true).order("name"),
      supabase.from("shop_sales").select("*").eq("tenant_id", TENANT_ID).gte("created_at", `${todayKey}T00:00:00`).order("created_at", { ascending: false }),
    ]);
    setItems(itemsData || []);
    setSales(salesData || []);
  }, [todayKey]);

  React.useEffect(() => { load(); }, [load]);

  React.useEffect(() => {
    if (!supabase) return;
    const ch = supabase.channel(`sklepik-${TENANT_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_items", filter: `tenant_id=eq.${TENANT_ID}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_sales", filter: `tenant_id=eq.${TENANT_ID}` }, load)
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [load]);

  const sell = async (item) => {
    const q = Math.max(1, parseInt(qty[item.id], 10) || 1);
    setBusy(item.id);
    try {
      const { error } = await supabase.rpc("shop_sell", {
        p_item_id: item.id, p_qty: q, p_payment: payment[item.id] || "gotowka",
        p_shift: selectedShift || null, p_by: employeeName || "recepcja",
      });
      if (error) throw error;
      showToast?.(`Sprzedano: ${item.name} x${q}`, "success");
      setQty(prev => ({ ...prev, [item.id]: "" }));
      load();
    } catch (e) {
      showToast?.(e?.message || "Nie udało się sprzedać.", "error");
    } finally {
      setBusy(null);
    }
  };

  const storno = async (sale) => {
    setBusy(sale.id);
    try {
      const { error } = await supabase.rpc("shop_storno", { p_sale_id: sale.id, p_by: employeeName || "recepcja" });
      if (error) throw error;
      showToast?.("Storno wykonane.", "info");
      load();
    } catch (e) {
      showToast?.(e?.message || "Nie udało się zrobić storno.", "error");
    } finally {
      setBusy(null);
    }
  };

  const submitZakupy = async () => {
    const q = parseInt(zkQty, 10) || 0;
    if (q <= 0) { showToast?.("Podaj ilość.", "error"); return; }
    setBusy("zakupy");
    try {
      let itemId = zkItemId;
      if (zkMode === "new") {
        const name = zkName.trim();
        const price = parseFloat(String(zkPrice).replace(",", ".")) || 0;
        if (!name) { showToast?.("Podaj nazwę produktu.", "error"); setBusy(null); return; }
        const { data, error } = await supabase.from("shop_items")
          .insert({ tenant_id: TENANT_ID, name, price, stock: 0, active: true })
          .select("id").single();
        if (error) throw error;
        itemId = data.id;
      }
      if (!itemId) { showToast?.("Wybierz produkt.", "error"); setBusy(null); return; }
      const unitCost = zkCost ? (parseFloat(String(zkCost).replace(",", ".")) || null) : null;
      const { error: purErr } = await supabase.rpc("shop_purchase", {
        p_item_id: itemId, p_qty: q, p_unit_cost: unitCost, p_by: employeeName || "recepcja",
      });
      if (purErr) throw purErr;
      showToast?.("Towar dodany do magazynu.", "success");
      setZkName(""); setZkPrice(""); setZkQty(""); setZkCost(""); setZkItemId("");
      load();
    } catch (e) {
      showToast?.(e?.message || "Nie udało się dodać towaru.", "error");
    } finally {
      setBusy(null);
    }
  };

  const todaysTotal = sales.reduce((s, r) => s + Number(r.total || 0), 0);

  return (
    <div className="panel glass dark-panel">
      <div className="panel-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}><ShoppingBag size={16} /> Sklepik</span>
        {todaysTotal > 0 ? <span style={{ fontSize: 13, fontWeight: 800, color: "#5acc94" }}>{fmtMoney(todaysTotal)} zł dziś</span> : null}
      </div>

      {isAdmin && (
        <div style={{ marginBottom: 14 }}>
          <button className="btn btn-gold" onClick={() => setShowZakupy(v => !v)}>
            <Package size={13} /> {showZakupy ? "Ukryj zakupy" : "Zakupy — dodaj towar"}
          </button>
          {showZakupy && (
            <div style={{ marginTop: 10, padding: 12, background: "rgba(255,255,255,.04)", border: "1px solid var(--dark-border)", borderRadius: "var(--radius-md)" }}>
              <div style={{ display: "flex", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                <select className="input dark-input" value={zkMode} onChange={e => setZkMode(e.target.value)} style={{ width: 170 }}>
                  <option value="existing">Istniejący produkt</option>
                  <option value="new">Nowy produkt</option>
                </select>
                {zkMode === "existing" ? (
                  <select className="input dark-input" value={zkItemId} onChange={e => setZkItemId(e.target.value)} style={{ width: 190 }}>
                    <option value="">— wybierz —</option>
                    {items.map(it => <option key={it.id} value={it.id}>{it.name}</option>)}
                  </select>
                ) : (
                  <>
                    <input className="input dark-input" style={{ width: 160 }} placeholder="Nazwa produktu" value={zkName} onChange={e => setZkName(e.target.value)} />
                    <input className="input dark-input" style={{ width: 100 }} placeholder="Cena sprzedaży" value={zkPrice} onChange={e => setZkPrice(e.target.value)} />
                  </>
                )}
                <input className="input dark-input" style={{ width: 80 }} placeholder="Ilość" value={zkQty} onChange={e => setZkQty(e.target.value)} />
                <input className="input dark-input" style={{ width: 110 }} placeholder="Koszt/szt. (opc.)" value={zkCost} onChange={e => setZkCost(e.target.value)} />
                <button className="btn btn-gold" disabled={busy === "zakupy"} onClick={submitZakupy}><Plus size={13} /> Dodaj</button>
              </div>
              <div className="tiny muted-light">Przyjęcie towaru podbija stan magazynowy. Koszt jednostkowy jest opcjonalny (do przyszłej analizy marży).</div>
            </div>
          )}
        </div>
      )}

      {!items.length ? (
        <div className="tiny muted-light">Brak produktów w magazynie{isAdmin ? " — dodaj pierwszy przez „Zakupy”." : "."}</div>
      ) : (
        <div className="stack" style={{ marginBottom: 16 }}>
          {items.map(it => {
            const low = it.stock <= (it.min_stock || 0);
            return (
              <div key={it.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 11px", background: "rgba(255,255,255,.04)", border: "1px solid var(--dark-border)", borderRadius: "var(--radius-md)", flexWrap: "wrap" }}>
                <span style={{ flex: 1, minWidth: 100, fontSize: 13, fontWeight: 700, color: "var(--dark-text)" }}>{it.name}</span>
                <span style={{ fontSize: 12.5, color: "var(--dark-text-muted)" }}>{fmtMoney(it.price)} zł</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: low ? "#e0705a" : "var(--dark-text-muted)" }}>
                  {low ? "⚠ " : ""}stan: {it.stock}
                </span>
                <input className="input dark-input" type="number" min="1" style={{ width: 56 }} placeholder="1"
                  value={qty[it.id] ?? ""} onChange={e => setQty(prev => ({ ...prev, [it.id]: e.target.value }))} />
                <select className="input dark-input" style={{ width: 100 }}
                  value={payment[it.id] || "gotowka"} onChange={e => setPayment(prev => ({ ...prev, [it.id]: e.target.value }))}>
                  {PAYMENTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
                <button className="btn btn-gold" disabled={busy === it.id || it.stock <= 0} onClick={() => sell(it)}>
                  {it.stock <= 0 ? "Brak" : "Sprzedaj"}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="panel-title" style={{ fontSize: 13 }}>Dzisiejsza sprzedaż</div>
      {!sales.length ? (
        <div className="tiny muted-light">Brak sprzedaży dzisiaj.</div>
      ) : (
        <div className="stack">
          {sales.map(s => (
            <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "7px 11px", background: "rgba(255,255,255,.04)", border: "1px solid var(--dark-border)", borderRadius: "var(--radius-md)" }}>
              <span style={{ flex: 1, fontSize: 12.5, color: "var(--dark-text)" }}>
                {s.qty < 0 ? "↩ storno: " : ""}{s.name} x{Math.abs(s.qty)} ({PAYMENTS.find(p => p[0] === s.payment)?.[1] || s.payment}){s.by ? ` — ${s.by}` : ""}
              </span>
              <span style={{ fontWeight: 700, color: s.total < 0 ? "#e0705a" : "var(--dark-text)" }}>{fmtMoney(s.total)} zł</span>
              {isAdmin && s.qty > 0 && (
                <button onClick={() => storno(s)} title="Storno" disabled={busy === s.id}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dark-text-muted)", display: "flex" }}>
                  <Undo2 size={13} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
