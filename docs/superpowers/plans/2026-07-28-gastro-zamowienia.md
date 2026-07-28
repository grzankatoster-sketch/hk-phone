# Zamówienia gastro (kuchnia/bar → kierownik gastronomii) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Employees add items+quantities to a shared shopping list from the `posilki.html` tablet (used by both kitchen and bar); the gastronomy manager (`mgr_gastro` role in `panel.html`, on their phone) sees the same list and checks items off as bought; an LLM auto-categorizes items after every addition.

**Architecture:** One new Supabase table (`gastro_shopping_list`, no RPC — plain insert/update, no race-condition risk). A new LLM task `gastro_shop` added to the existing single-entrypoint edge function `supabase/functions/llm/index.ts` (Groq, matches the `roletabs` pattern of picking categories only from a fixed allowed list). `posilki.html` gets an add-only UI (button → modal); `panel.html` gets a read+check-off UI (new tab for role `mgr_gastro`, replacing its existing "wkrótce" placeholder).

**Tech Stack:** Supabase (Postgres + RLS + Edge Functions/Deno), vanilla JS in static HTML files (`public/hk-phone/*.html`), Groq via the existing `llm` edge function, `@supabase/supabase-js` v2 UMD build (already loaded via CDN script tag in both HTML files).

## Global Constraints

- Multi-tenant convention: `tenant_id` defaults to `'00000000-0000-0000-0000-000000000001'` on every row (copy this exact UUID — it's the single tenant in production today).
- RLS on new tables: `for all to anon, authenticated using (true) with check (true)` — matches every other core table in this app (no DB-level role gating; gating happens in UI, per `shop_items` in `0060_shop_sklepik.sql`).
- No data is ever hard-deleted — "bought" is a status change, not a row delete (matches `shop_sales` storno convention: never rewrite history).
- LLM must never invent values outside a fixed allowed list — mirror the `roletabs` task's defense-in-depth: filter the LLM's JSON output against the allowed set server-side, never trust the model's exact string.
- Deploy for SQL is manual: the user pastes the full contents of `supabase/panel_install.sql` into the Supabase SQL editor (no CLI push in this workflow) — every new migration file's content MUST also be appended to `panel_install.sql` under a `-- ========== 00NN_name.sql ==========` header, exactly like every prior migration in that file.
- `npm run migrations:check` must pass (enforces unique numeric migration prefixes) before considering Task 1 done.

---

### Task 1: SQL migration — `gastro_shopping_list` table + tab-key catalog update

**Files:**
- Create: `supabase/migrations/0071_gastro_shopping_list.sql`
- Modify: `supabase/panel_install.sql` (append at end of file)

**Interfaces:**
- Produces: table `public.gastro_shopping_list` with columns `id uuid, tenant_id uuid, name text, qty numeric(10,2), unit text, category text, status text ('to_buy'|'bought'), added_by text, bought_by text, bought_at timestamptz, created_at timestamptz`. Consumed directly by `posilki.html` (insert) and `panel.html` (select/update) in Tasks 3 and 4 — no RPC wrapper.
- Modifies `public.panel_valid_tab_keys()` to include `'zakupy'` — consumed by Task 4's tab assignment.

- [ ] **Step 1: Write the migration file**

Create `supabase/migrations/0071_gastro_shopping_list.sql`:

```sql
-- 0071_gastro_shopping_list.sql
-- Lista zakupów gastronomii: pracownicy (kuchnia/bar, tablet posilki.html)
-- dopisują pozycje+ilość, kierownik gastronomii (rola mgr_gastro, panel.html)
-- odznacza jako kupione. Kategoria wypełniana przez LLM (zadanie "gastro_shop"
-- w supabase/functions/llm/index.ts) z ustalonego katalogu — nic nie usuwamy
-- trwale, "kupione" to zmiana statusu (historia zostaje), wzorem shop_sales.

create table if not exists public.gastro_shopping_list (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  name       text not null,
  qty        numeric(10,2) not null default 1,
  unit       text,
  category   text,
  status     text not null default 'to_buy',
  added_by   text,
  bought_by  text,
  bought_at  timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists gastro_shopping_list_tenant_idx
  on public.gastro_shopping_list(tenant_id, status, created_at desc);

alter table public.gastro_shopping_list enable row level security;
drop policy if exists "gastro_shopping_list_anon" on public.gastro_shopping_list;
drop policy if exists "gastro_shopping_list_auth" on public.gastro_shopping_list;
create policy "gastro_shopping_list_anon" on public.gastro_shopping_list for all to anon using (true) with check (true);
create policy "gastro_shopping_list_auth" on public.gastro_shopping_list for all to authenticated using (true) with check (true);

-- Dołóż nowy klucz zakładki do katalogu dozwolonych (obrona w głąb, patrz 0069_panel_struktura.sql).
create or replace function public.panel_valid_tab_keys()
returns text[] language sql immutable as $$
  select array[
    'poczta','pulpit','live','wyjazdy','staty','praca','jakosc','kontrole','tablica',
    'znalezione','grafik','zmiany','zadania','kasa','konserw','sla','plan','akcje',
    'konta','logi','zakupy'
  ]
$$;
```

- [ ] **Step 2: Run the migration numbering check**

Run: `npm run migrations:check`
Expected: `Migracje OK — 71 plików, numery unikalne.` (count will match however many `.sql` files exist in `supabase/migrations` after adding this one — just confirm it prints "OK" and exits 0, don't hardcode-match the count).

- [ ] **Step 3: Append the migration to `panel_install.sql`**

Open `supabase/panel_install.sql`, go to the very end of the file (after the `seed_app_accounts.sql` section), and append:

```sql

-- ========== 0071_gastro_shopping_list.sql ==========
-- 0071_gastro_shopping_list.sql
-- Lista zakupów gastronomii: pracownicy (kuchnia/bar, tablet posilki.html)
-- dopisują pozycje+ilość, kierownik gastronomii (rola mgr_gastro, panel.html)
-- odznacza jako kupione. Kategoria wypełniana przez LLM (zadanie "gastro_shop"
-- w supabase/functions/llm/index.ts) z ustalonego katalogu — nic nie usuwamy
-- trwale, "kupione" to zmiana statusu (historia zostaje), wzorem shop_sales.

create table if not exists public.gastro_shopping_list (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null default '00000000-0000-0000-0000-000000000001',
  name       text not null,
  qty        numeric(10,2) not null default 1,
  unit       text,
  category   text,
  status     text not null default 'to_buy',
  added_by   text,
  bought_by  text,
  bought_at  timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists gastro_shopping_list_tenant_idx
  on public.gastro_shopping_list(tenant_id, status, created_at desc);

alter table public.gastro_shopping_list enable row level security;
drop policy if exists "gastro_shopping_list_anon" on public.gastro_shopping_list;
drop policy if exists "gastro_shopping_list_auth" on public.gastro_shopping_list;
create policy "gastro_shopping_list_anon" on public.gastro_shopping_list for all to anon using (true) with check (true);
create policy "gastro_shopping_list_auth" on public.gastro_shopping_list for all to authenticated using (true) with check (true);

create or replace function public.panel_valid_tab_keys()
returns text[] language sql immutable as $$
  select array[
    'poczta','pulpit','live','wyjazdy','staty','praca','jakosc','kontrole','tablica',
    'znalezione','grafik','zmiany','zadania','kasa','konserw','sla','plan','akcje',
    'konta','logi','zakupy'
  ]
$$;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0071_gastro_shopping_list.sql supabase/panel_install.sql
git commit -m "feat(gastro): dodaj tabele gastro_shopping_list + klucz zakladki zakupy"
```

---

### Task 2: LLM edge function — `gastro_shop` categorization task

**Files:**
- Modify: `supabase/functions/llm/index.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks (independent of the DB table — the edge function never queries Postgres directly, only receives `payload` from the caller).
- Produces: a callable task `"gastro_shop"` reachable via `sb.functions.invoke("llm", { body: { task: "gastro_shop", tenant_id, payload: { items: [{name, unit}] } } })`. Response shape: `{ data: { items: [{ name: string, category: string }] }, text: string }` where every `category` is guaranteed to be one of the 11 fixed categories (never invented by the model). Consumed by Task 3 (`posilki.html`'s `categorizeShop()`).

- [ ] **Step 1: Add the shared category list constant**

In `supabase/functions/llm/index.ts`, find this line (right after the `MODELS` object closes):

```ts
} as const;
```

Right after that line (before the `const CORS = {` line), insert:

```ts

// Katalog kategorii dla listy zakupów gastro (zadanie "gastro_shop"). LLM wybiera
// WYŁĄCZNIE z tej listy — filtrowane server-side, jak przy "roletabs".
const GASTRO_CATEGORIES = [
  "Nabiał", "Pieczywo", "Warzywa i owoce", "Mięso i ryby", "Napoje",
  "Alkohol/bar", "Mrożonki", "Sypkie/przyprawy", "Chemia i higiena",
  "Jednorazówki", "Inne",
];
```

- [ ] **Step 2: Add `gastro_shop` to the `MODELS` map**

Find:

```ts
  roletabs: "llama-3.3-70b-versatile",
} as const;
```

Replace with:

```ts
  roletabs: "llama-3.3-70b-versatile",
  gastro_shop: "llama-3.3-70b-versatile",
} as const;
```

- [ ] **Step 3: Add the prompt builder branch**

Find the end of the `"roletabs"` branch in `buildPrompt`:

```ts
      user: `STANOWISKO: ${payload?.title ?? ""}\nDZIAŁ: ${payload?.department ?? ""}`,
    };
  }
  if (task === "weekly") {
```

Insert a new branch between them (right after the `roletabs` block's closing `}` and before `if (task === "weekly")`):

```ts
  if (task === "gastro_shop") {
    const items = Array.isArray(payload?.items) ? payload.items : [];
    const lines = items
      .map((it: any, i: number) => `${i + 1}. ${it?.name ?? ""}${it?.unit ? ` (${it.unit})` : ""}`)
      .join("\n");
    return {
      system:
        "Kategoryzujesz pozycje listy zakupów kuchni/baru hotelowego. Zwracasz WYŁĄCZNIE poprawny " +
        "JSON w formacie: {\"items\": [{\"name\": string, \"category\": string}]}. Pole category MUSI " +
        `pochodzić z listy: [${GASTRO_CATEGORIES.join(", ")}] — nie wolno zwracać kategorii spoza tej ` +
        "listy ani niczego wymyślać. Zwróć DOKŁADNIE jedną pozycję w items dla KAŻDEJ podanej pozycji, " +
        "w tej samej kolejności co wejście, z polem name identycznym jak podane (bez zmian pisowni).",
      user: `POZYCJE LISTY ZAKUPÓW:\n${lines || "(brak)"}`,
    };
  }
```

- [ ] **Step 4: Add `gastro_shop` to the JSON response-format condition**

Find:

```ts
        ...(task === "triage" || task === "route" || task === "schedule" || task === "reviews" || task === "grafik" || task === "plan" || task === "pricing" || task === "roletabs" ? { response_format: { type: "json_object" } } : {}),
```

Replace with:

```ts
        ...(task === "triage" || task === "route" || task === "schedule" || task === "reviews" || task === "grafik" || task === "plan" || task === "pricing" || task === "roletabs" || task === "gastro_shop" ? { response_format: { type: "json_object" } } : {}),
```

- [ ] **Step 5: Add `gastro_shop` to the JSON parse/filter condition and add its filter block**

Find:

```ts
  if (task === "triage" || task === "route" || task === "schedule" || task === "reviews" || task === "grafik" || task === "plan" || task === "pricing" || task === "roletabs") {
    let parsed: any = null;
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    } catch { parsed = null; }
    // roletabs: LLM nigdy nie jest źródłem dozwolonych kluczy — odfiltruj do faktycznie
    // przesłanego katalogu, niezależnie od tego co model zwrócił (obrona w głąb, patrz
    // też panel_valid_tab_keys() po stronie SQL, który filtruje jeszcze raz przy zapisie).
    if (task === "roletabs") {
      const allowed = new Set((Array.isArray(payload?.catalog) ? payload.catalog : []).map((c: any) => c?.key));
      const tabs = Array.isArray(parsed?.tabs) ? parsed.tabs.filter((k: unknown) => allowed.has(k)) : [];
      parsed = { tabs };
    }
    return json({ data: parsed, text });
  }
```

Replace with (adds `gastro_shop` to the condition, and adds its own filter block mirroring `roletabs`):

```ts
  if (task === "triage" || task === "route" || task === "schedule" || task === "reviews" || task === "grafik" || task === "plan" || task === "pricing" || task === "roletabs" || task === "gastro_shop") {
    let parsed: any = null;
    try {
      const m = text.match(/\{[\s\S]*\}/);
      parsed = m ? JSON.parse(m[0]) : null;
    } catch { parsed = null; }
    // roletabs: LLM nigdy nie jest źródłem dozwolonych kluczy — odfiltruj do faktycznie
    // przesłanego katalogu, niezależnie od tego co model zwrócił (obrona w głąb, patrz
    // też panel_valid_tab_keys() po stronie SQL, który filtruje jeszcze raz przy zapisie).
    if (task === "roletabs") {
      const allowed = new Set((Array.isArray(payload?.catalog) ? payload.catalog : []).map((c: any) => c?.key));
      const tabs = Array.isArray(parsed?.tabs) ? parsed.tabs.filter((k: unknown) => allowed.has(k)) : [];
      parsed = { tabs };
    }
    // gastro_shop: kategoria MUSI pochodzić z GASTRO_CATEGORIES — nieznana/brakująca → "Inne".
    if (task === "gastro_shop") {
      const allowedCats = new Set(GASTRO_CATEGORIES);
      const items = Array.isArray(parsed?.items) ? parsed.items : [];
      parsed = {
        items: items.map((it: any) => ({
          name: String(it?.name ?? ""),
          category: allowedCats.has(it?.category) ? it.category : "Inne",
        })),
      };
    }
    return json({ data: parsed, text });
  }
```

- [ ] **Step 6: Manual verification against a local edge function run**

Run: `supabase functions serve llm --no-verify-jwt`
In a second terminal, run:

```bash
curl -s -X POST http://localhost:54321/functions/v1/llm \
  -H "content-type: application/json" \
  -d '{"task":"gastro_shop","tenant_id":"00000000-0000-0000-0000-000000000001","payload":{"items":[{"name":"Mleko 3.2%","unit":"l"},{"name":"Cytryny","unit":"kg"},{"name":"Serwetki koktajlowe","unit":"opak."}]}}'
```

Expected: HTTP 200, JSON body with `data.items` containing exactly 3 objects, each `category` being one of the 11 `GASTRO_CATEGORIES` values (e.g. Mleko→Nabiał, Cytryny→Warzywa i owoce, Serwetki→Jednorazówki or Inne). If `GROQ_API_KEY` isn't set locally, this will 500 with `server_misconfigured` — in that case skip live verification and instead re-read the diff to confirm the branch structure matches the `roletabs` pattern exactly (this is acceptable since the function is deployed and tested against the real key in Task 3's end-to-end check).

- [ ] **Step 7: Commit**

```bash
git add supabase/functions/llm/index.ts
git commit -m "feat(llm): dodaj zadanie gastro_shop (kategoryzacja listy zakupow)"
```

---

### Task 3: `posilki.html` — "Zamówienie" button, add form, shared list

**Files:**
- Modify: `public/hk-phone/posilki.html`

**Interfaces:**
- Consumes: table `gastro_shopping_list` (Task 1), edge function task `gastro_shop` via `sb.functions.invoke("llm", ...)` (Task 2).
- Produces: nothing consumed by later tasks (Task 4 is independent — both read the same table directly, no shared JS).

- [ ] **Step 1: Add CSS for the modal**

Find (near the end of the `<style>` block):

```css
.idle-hint{font-size:10.5px;color:var(--gold);letter-spacing:.1em;margin-top:26px;animation:idlePulse 2.2s ease-in-out infinite}
@keyframes idlePulse{0%,100%{opacity:.4}50%{opacity:1}}
</style>
```

Replace with:

```css
.idle-hint{font-size:10.5px;color:var(--gold);letter-spacing:.1em;margin-top:26px;animation:idlePulse 2.2s ease-in-out infinite}
@keyframes idlePulse{0%,100%{opacity:.4}50%{opacity:1}}

.shop-ov{position:fixed;inset:0;background:rgba(20,8,16,.55);z-index:80;display:none;align-items:flex-end;justify-content:center}
.shop-ov.open{display:flex}
.shop-card{background:var(--paper);width:100%;max-width:520px;max-height:88vh;border-radius:20px 20px 0 0;padding:18px 18px 22px;display:flex;flex-direction:column;gap:12px;overflow:hidden;box-shadow:0 -12px 40px rgba(45,20,34,.3)}
.shop-hd{display:flex;align-items:center;justify-content:space-between}
.shop-hd h3{font-family:'DM Serif Display',Georgia,serif;font-size:19px;color:var(--plum-ink);font-weight:400;margin:0}
.shop-close{background:transparent;border:none;font-size:20px;color:var(--muted);cursor:pointer;line-height:1;padding:4px}
.shop-form{display:flex;gap:8px;flex-wrap:wrap}
.shop-form input,.shop-form select{border:1.5px solid var(--line-strong);border-radius:10px;padding:9px 10px;font-size:13.5px;background:var(--paper);color:var(--ink);font-family:inherit}
.shop-form input#shopName{flex:1 1 140px;min-width:0}
.shop-form input#shopQty{width:64px}
.shop-form select#shopUnit{width:82px}
.shop-add-btn{background:var(--plum);color:#fff;border:none;border-radius:10px;padding:9px 16px;font-weight:700;font-size:13px;cursor:pointer;flex-shrink:0}
.shop-add-btn:disabled{opacity:.6}
.shop-list{overflow-y:auto;flex:1;display:flex;flex-direction:column;gap:10px}
.shop-cat{font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--gold);margin-top:4px}
.shop-row{display:flex;align-items:center;gap:8px;padding:9px 11px;border:1px solid var(--line);border-radius:12px;background:var(--cream)}
.shop-row .nm{flex:1;font-size:13.5px;font-weight:600;color:var(--ink)}
.shop-row .qv{font-size:12px;color:var(--muted);font-weight:700;white-space:nowrap}
.shop-empty{font-size:13px;color:var(--muted);text-align:center;padding:20px 0}
.shop-msg{font-size:12px;min-height:16px}
.shop-msg.err{color:#b23a55}
.shop-msg.ok{color:var(--green-deep)}
</style>
```

- [ ] **Step 2: Add the header button**

Find:

```html
  <button class="theme-btn" id="themeBtn" onclick="toggleTheme()" aria-label="Zmień motyw" title="Zmień motyw"></button>
```

Replace with:

```html
  <button class="theme-btn" id="themeBtn" onclick="toggleTheme()" aria-label="Zmień motyw" title="Zmień motyw"></button>
  <button class="theme-btn" id="shopBtn" onclick="toggleShop()" aria-label="Zamówienie" title="Zamówienie">🛒</button>
```

- [ ] **Step 3: Add the modal markup**

Find:

```html
<div class="idle-screen" id="idleScreen">
```

Replace with:

```html
<div class="shop-ov" id="shopOv" onclick="if(event.target===this) toggleShop()">
  <div class="shop-card">
    <div class="shop-hd"><h3>🛒 Zamówienie</h3><button class="shop-close" onclick="toggleShop()" aria-label="Zamknij">✕</button></div>
    <div class="shop-form">
      <input id="shopName" placeholder="Nazwa (np. Mleko 3.2%)" onkeydown="if(event.key==='Enter')shopAdd()"/>
      <input id="shopQty" type="number" min="0" step="0.5" value="1"/>
      <select id="shopUnit">
        <option value="szt">szt</option>
        <option value="kg">kg</option>
        <option value="l">l</option>
        <option value="opak.">opak.</option>
      </select>
      <button class="shop-add-btn" id="shopAddBtn" onclick="shopAdd()">Dodaj</button>
    </div>
    <div class="shop-msg" id="shopMsg"></div>
    <div class="shop-list" id="shopList"></div>
  </div>
</div>

<div class="idle-screen" id="idleScreen">
```

- [ ] **Step 4: Add the JS logic**

Find:

```js
loadAll();
if (!DEMO) {
  setInterval(loadAll, 15000); // polling fallback
  if (sb) {
    sb.channel(`posilki-${TENANT_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "meal_checkins", filter: `tenant_id=eq.${TENANT_ID}` }, loadAll)
      .subscribe();
  }
}
```

Replace with:

```js
// ── Zamówienie / lista zakupów gastro (współdzielona kuchnia+bar, tablica u kierownika gastro) ──
const SHOP_CATS = ["Nabiał","Pieczywo","Warzywa i owoce","Mięso i ryby","Napoje","Alkohol/bar","Mrożonki","Sypkie/przyprawy","Chemia i higiena","Jednorazówki","Inne"];
let shopItems = [];

window.toggleShop = async () => {
  const ov = document.getElementById("shopOv");
  const opening = !ov.classList.contains("open");
  ov.classList.toggle("open", opening);
  if (opening) await loadShop();
};

async function loadShop(){
  if (DEMO) {
    shopItems = [
      { id:"d1", name:"Mleko 3.2%", qty:6, unit:"l", category:"Nabiał" },
      { id:"d2", name:"Cytryny", qty:2, unit:"kg", category:"Warzywa i owoce" },
      { id:"d3", name:"Serwetki", qty:10, unit:"opak.", category:null },
    ];
    renderShop();
    return;
  }
  if (!sb) return;
  try {
    const { data } = await sb.from("gastro_shopping_list").select("*").eq("tenant_id", TENANT_ID).eq("status","to_buy").order("created_at",{ascending:true});
    shopItems = data || [];
  } catch (e) { shopItems = []; }
  renderShop();
}

function renderShop(){
  const list = document.getElementById("shopList");
  if (!list) return;
  if (!shopItems.length) { list.innerHTML = '<div class="shop-empty">Lista jest pusta.</div>'; return; }
  const groups = {};
  shopItems.forEach(it => { const c = it.category || "Bez kategorii"; (groups[c] = groups[c]||[]).push(it); });
  const order = [...SHOP_CATS, "Bez kategorii"];
  const cats = Object.keys(groups).sort((a,b)=> order.indexOf(a) - order.indexOf(b));
  list.innerHTML = cats.map(cat => `<div class="shop-cat">${escHtml(cat)}</div>` + groups[cat].map(it =>
    `<div class="shop-row"><span class="nm">${escHtml(it.name)}</span><span class="qv">${it.qty}${it.unit ? " "+escHtml(it.unit) : ""}</span></div>`
  ).join("")).join("");
}

window.shopAdd = async () => {
  const nameEl = document.getElementById("shopName"), qtyEl = document.getElementById("shopQty"), unitEl = document.getElementById("shopUnit");
  const btn = document.getElementById("shopAddBtn"), msg = document.getElementById("shopMsg");
  const setMsg = (t,k) => { if (msg){ msg.className = "shop-msg " + (k||""); msg.textContent = t||""; } };
  const name = (nameEl.value||"").trim();
  const qty = parseFloat(qtyEl.value||"1") || 1;
  const unit = (unitEl.value||"").trim() || null;
  if (!name) return setMsg("Wpisz nazwę.", "err");
  if (DEMO) { setMsg("Tryb demo — nie zapisano.", ""); return; }
  if (!sb) return setMsg("Brak połączenia.", "err");
  btn.disabled = true; setMsg("Dodaję…","");
  try {
    const { error } = await sb.from("gastro_shopping_list").insert({ tenant_id: TENANT_ID, name, qty, unit, status:"to_buy" });
    if (error) throw error;
    nameEl.value = ""; qtyEl.value = "1";
    setMsg("Dodano.", "ok");
    await loadShop();
    categorizeShop();
  } catch (e) { setMsg((e&&e.message) || "Nie udało się dodać.", "err"); }
  btn.disabled = false;
};

async function categorizeShop(){
  if (DEMO || !sb || !shopItems.length) return;
  try {
    const { data } = await sb.functions.invoke("llm", { body:{ task:"gastro_shop", tenant_id: TENANT_ID, payload:{ items: shopItems.map(it => ({ name: it.name, unit: it.unit })) } } });
    const cats = (data && data.data && data.data.items) || [];
    await Promise.all(shopItems.map((it, i) => {
      const c = cats[i] && cats[i].category;
      if (!c || c === it.category) return null;
      return sb.from("gastro_shopping_list").update({ category: c }).eq("id", it.id);
    }));
    await loadShop();
  } catch (e) { /* kategoryzacja to warstwa pomocnicza — brak odpowiedzi nie blokuje dodania pozycji */ }
}

loadAll();
if (!DEMO) {
  setInterval(loadAll, 15000); // polling fallback
  if (sb) {
    sb.channel(`posilki-${TENANT_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "meal_checkins", filter: `tenant_id=eq.${TENANT_ID}` }, loadAll)
      .subscribe();
    sb.channel(`gastro-shop-${TENANT_ID}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "gastro_shopping_list", filter: `tenant_id=eq.${TENANT_ID}` }, () => {
        const ov = document.getElementById("shopOv");
        if (ov && ov.classList.contains("open")) loadShop();
      })
      .subscribe();
  }
}
```

- [ ] **Step 5: Manual verification with Playwright (webapp-testing skill)**

Run: `npm run dev` (Vite serves `public/` at the site root).
Use the webapp-testing skill to open `http://localhost:5173/hk-phone/posilki.html?demo=1` in a browser, then:
1. Click the 🛒 button in the header → the modal should open showing 3 demo rows grouped under "Nabiał", "Warzywa i owoce", and "Bez kategorii".
2. Type "Masło" in the name field, leave qty at 1, unit "szt", click "Dodaj" → expect the message "Tryb demo — nie zapisano." (demo mode never writes) and no crash.
3. Close the modal (✕ or click outside) → it should hide.

Then, if a real Supabase connection is available (non-demo, i.e. `http://localhost:5173/hk-phone/posilki.html`) and migration 0071 has been applied: add a real item, confirm it appears in the list within a couple seconds with a category filled in (proves the `gastro_shop` LLM round-trip works end-to-end). If no live DB is available in this environment, do the demo-mode check only and note the live check as pending for the user to confirm after they paste `panel_install.sql`.

- [ ] **Step 6: Commit**

```bash
git add public/hk-phone/posilki.html
git commit -m "feat(posilki): dodaj guzik Zamowienie + wspolna lista zakupow gastro"
```

---

### Task 4: `panel.html` — "Zakupy" tab for the `mgr_gastro` role

**Files:**
- Modify: `public/hk-phone/panel.html`

**Interfaces:**
- Consumes: table `gastro_shopping_list` (Task 1). Independent of Task 3's JS (both read/write the same table directly via `sb`, no shared code between the two HTML files).
- Produces: nothing consumed elsewhere — this is the final UI surface.

- [ ] **Step 1: Add the tab to `TAB_CATALOG`**

Find:

```js
const TAB_CATALOG = [
  ["poczta","Poczta"], ["pulpit","Pulpit"], ["live","Na żywo"], ["wyjazdy","Wyjazdy"],
  ["staty","Statystyki"], ["praca","Praca"], ["jakosc","Jakość"], ["kontrole","Kontrole"],
  ["tablica","Tablica"], ["znalezione","Znalezione"], ["grafik","Grafik"], ["zmiany","Zmiany"],
  ["zadania","Zadania"], ["kasa","Kasa"], ["konserw","Konserw."], ["sla","SLA"], ["plan","Plan"],
  ["akcje","Akcje"], ["konta","Konta"], ["logi","Logi"],
];
```

Replace with:

```js
const TAB_CATALOG = [
  ["poczta","Poczta"], ["pulpit","Pulpit"], ["live","Na żywo"], ["wyjazdy","Wyjazdy"],
  ["staty","Statystyki"], ["praca","Praca"], ["jakosc","Jakość"], ["kontrole","Kontrole"],
  ["tablica","Tablica"], ["znalezione","Znalezione"], ["grafik","Grafik"], ["zmiany","Zmiany"],
  ["zadania","Zadania"], ["kasa","Kasa"], ["konserw","Konserw."], ["sla","SLA"], ["plan","Plan"],
  ["akcje","Akcje"], ["konta","Konta"], ["logi","Logi"], ["zakupy","Zakupy"],
];
```

- [ ] **Step 2: Add "Zakupy" to the `mgr_gastro` role's tab list**

Find:

```js
  if (role === "mgr_gastro") return [["poczta","Poczta"],["grafik","Grafik"],["zadania","Zadania"],["tablica","Tablica"],["akcje","Akcje"]];
```

Replace with:

```js
  if (role === "mgr_gastro") return [["poczta","Poczta"],["zakupy","Zakupy"],["grafik","Grafik"],["zadania","Zadania"],["tablica","Tablica"],["akcje","Akcje"]];
```

- [ ] **Step 3: Add the nav icon**

Find:

```js
  logi:    _ic('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/>'),
};
```

Replace with:

```js
  logi:    _ic('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h6"/>'),
  zakupy:  _ic('<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.6 13.4a2 2 0 0 0 2 1.6h9.8a2 2 0 0 0 2-1.6L23 6H6"/>'),
};
```

- [ ] **Step 4: Update the fulfilled placeholder text for `mgr_gastro`**

Find:

```js
  mgr_gastro:     { label: "Menedżer gastronomii", soon: ["Grafik gastro", "Zadania gastro", "Stany / dostawy (wkrótce)"] },
```

Replace with:

```js
  mgr_gastro:     { label: "Menedżer gastronomii", soon: ["Grafik gastro", "Zadania gastro"] },
```

- [ ] **Step 5: Add the dispatch line**

Find:

```js
  if (hkTab === "akcje")   return loadAkcje();
  if (hkTab === "konta")   return loadKonta();
```

Replace with:

```js
  if (hkTab === "akcje")   return loadAkcje();
  if (hkTab === "zakupy")  return loadZakupy();
  if (hkTab === "konta")   return loadKonta();
```

- [ ] **Step 6: Add `loadZakupy()` and `zakupyBuy()`**

Find (the end of `loadTablica` and its immediate helpers, right before the `tbKindChange` window function):

```js
window.tbKindChange = () => {
```

Insert directly before it:

```js
// ── Zakupy (kierownik gastronomii): lista zakupów wspólna z kuchnią/barem (posilki.html) ──
const ZAKUPY_CATS = ["Nabiał","Pieczywo","Warzywa i owoce","Mięso i ryby","Napoje","Alkohol/bar","Mrożonki","Sypkie/przyprawy","Chemia i higiena","Jednorazówki","Inne"];
async function loadZakupy() {
  let rows = [];
  try {
    const { data } = await sb.from("gastro_shopping_list").select("id,name,qty,unit,category").eq("tenant_id", TENANT_ID).eq("status","to_buy").order("created_at",{ascending:true});
    rows = data || [];
  } catch { return body('<div class="empty">Nie udało się pobrać listy zakupów.</div>'); }
  if (!rows.length) return body('<div class="empty">Lista zakupów jest pusta.</div>');
  const groups = {};
  rows.forEach(r => { const c = r.category || "Bez kategorii"; (groups[c] = groups[c]||[]).push(r); });
  const order = [...ZAKUPY_CATS, "Bez kategorii"];
  const cats = Object.keys(groups).sort((a,b)=> order.indexOf(a) - order.indexOf(b));
  const html = cats.map(cat => `<div class="soon">${esc(cat)}</div>` + groups[cat].map(r => `<div class="statrow">
      <span class="k">${esc(r.name)} <span style="color:var(--muted);font-weight:600">— ${r.qty}${r.unit?" "+esc(r.unit):""}</span></span>
      <button class="rost-addbtn" style="padding:6px 10px;border-radius:8px;border:1px solid var(--line-strong);background:var(--paper);color:var(--ok);font-weight:800;font-size:11.5px;cursor:pointer" onclick="zakupyBuy('${r.id}')">Kupione</button>
    </div>`).join("")).join("");
  body(html);
}
window.zakupyBuy = async (id) => {
  try {
    const { error } = await sb.from("gastro_shopping_list").update({ status:"bought", bought_by: CURRENT.name||"Panel", bought_at:new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    toast("Oznaczono jako kupione.", "ok");
    loadZakupy();
  } catch (e) { toast((e&&e.message)||"Nie udało się zapisać.", "bad"); }
};
```

- [ ] **Step 7: Add demo data**

Find:

```js
    hk_roster: [{tenant_id:"00000000-0000-0000-0000-000000000001", date:today, roster:[{name:"Anna",role:"dyzur"},{name:"Marta",role:"poranna"},{name:"Oksana",role:"popoludnie"}]}],
```

Replace with:

```js
    hk_roster: [{tenant_id:"00000000-0000-0000-0000-000000000001", date:today, roster:[{name:"Anna",role:"dyzur"},{name:"Marta",role:"poranna"},{name:"Oksana",role:"popoludnie"}]}],
    gastro_shopping_list: [
      {id:"g1",name:"Mleko 3.2%",qty:6,unit:"l",category:"Nabiał",status:"to_buy"},
      {id:"g2",name:"Cytryny",qty:2,unit:"kg",category:"Warzywa i owoce",status:"to_buy"},
      {id:"g3",name:"Serwetki",qty:10,unit:"opak.",category:null,status:"to_buy"},
    ],
```

- [ ] **Step 8: Manual verification with Playwright (webapp-testing skill)**

Run: `npm run dev` (if not already running from Task 3).
Use the webapp-testing skill to open `http://localhost:5173/hk-phone/panel.html?demo=mgr_gastro`:
1. Log in as the demo `mgr_gastro` account (the demo login flow auto-fills `gastro@conrad-panel.com` per `DEMO_EMAIL`).
2. Confirm a "Zakupy" tab is visible in the tab bar/overflow, with a shopping-cart icon.
3. Click it → expect 3 rows grouped under "Nabiał" and "Warzywa i owoce" headers, plus a "Bez kategorii" group with "Serwetki", each with a "Kupione" button.
4. Click "Kupione" on one row → expect a green toast "Oznaczono jako kupione." (note: in demo mode the row will reappear on next reload since the mock client's `update()` doesn't mutate its in-memory `DATA` — this is expected, pre-existing demo-mode behavior shared by every other tab, not a bug to fix here).

If a live Supabase connection with migration 0071 applied is available, repeat without `?demo=` and confirm clicking "Kupione" actually removes the row from the list (real `update` persists).

- [ ] **Step 9: Commit**

```bash
git add public/hk-phone/panel.html
git commit -m "feat(panel): dodaj zakladke Zakupy dla roli mgr_gastro"
```

---

## Poza zakresem tego planu (patrz spec)

- Nowy tablet "kuchnia" (widok dni/grup/liczby śniadań bez numerów pokoi).
- Osobny tablet/URL dla baru.
- Formularz dodawania po stronie managera.
- Deduplikacja/scalanie podobnych pozycji.
