# Superadmin Desktop App + Module Toggles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the owner a desktop app (not a browser tab) for the existing operator cockpit, and let them turn licensed modules (HK, Grafik, Sklepik, ...) on/off per hotel from it instead of hand-editing SQL.

**Architecture:** Two independent additions to the existing monorepo, no new packages. (1) A Supabase migration adds two `superadmin_*` RPCs following the exact `security definer` + `current_app_role() = 'superadmin'` guard pattern already used by every other RPC in `0056_superadmin_tenants.sql`, plus a checkbox grid in `public/hk-phone/superadmin.html` that calls them. (2) A thin Electron shell (`electron-superadmin/main.cjs` + `electron-builder.superadmin.json`) that `loadURL`s the deployed `superadmin.html`, copied from the already-existing `electron-manager/main.cjs` pattern used for "GuestSage Kierownik".

**Tech Stack:** Supabase Postgres (plpgsql RPCs), vanilla JS in a static HTML file (no build step, no framework), Electron 31 + electron-builder (already root devDependencies).

## Global Constraints

- Every new RPC must be `security definer`, `set search_path = public`, and start with `if public.current_app_role() <> 'superadmin' then raise exception` (or the `stable` SQL-function equivalent `where public.current_app_role() = 'superadmin'`) — copied verbatim from `0056_superadmin_tenants.sql`. No RPC may skip this guard.
- SQL migrations are idempotent (`create or replace function`, `on conflict do update`) — matches every existing migration in `supabase/migrations/`.
- Do not run `supabase db push` or otherwise apply the migration to the live database. Deployment in this project is a manual paste of `supabase/panel_install.sql` into the Supabase SQL editor (see [[project_wykonanie_progress]] / repo convention) — the task ends with the file written and appended, not applied.
- `superadmin.html` stays a single static file with no bundler — do not introduce React/JSX or a build step into it.
- The Electron shell has **no `publish` block and no auto-updater** — it is a private tool for the owner's machine, rebuilt manually. Do not add a GitHub releases repo for it.
- Module key list in `superadmin.html` must carry a comment pointing back to `src/lib/modules.js` `MODULE_REGISTRY` so future module additions aren't forgotten on one side.

---

### Task 1: Migration — module-toggle RPCs

**Files:**
- Create: `supabase/migrations/0073_superadmin_tenant_features.sql`
- Modify: `supabase/panel_install.sql` (append at end, same `-- ========== <file>.sql ==========` header convention already used throughout the file)

**Interfaces:**
- Produces: RPC `superadmin_list_tenant_features(p_tenant_id uuid) returns table(feature_key text, enabled boolean)`
- Produces: RPC `superadmin_set_tenant_feature(p_tenant_id uuid, p_feature_key text, p_enabled boolean) returns void`
- Consumes: existing `public.current_app_role()` function and `public.tenant_features` table (both from `0049_tenants.sql`)

- [ ] **Step 1: Write the migration file**

```sql
-- 0073_superadmin_tenant_features.sql  (moduły per hotel — checkbox grid w kokpicie operatora)
-- Domyka 4.13 (komentarz w 0056_superadmin_tenants.sql): kokpit operatora mógł
-- dotąd zarządzać tylko statusem/datą/WhatsAppem hotelu, nie tym które
-- licencjonowalne moduły (tenant_features, 0049) ma włączone. Te dwie RPC idą
-- pod tym samym wzorcem co reszta superadmin_* (0056): security definer +
-- guard current_app_role() = 'superadmin'.
-- Idempotentne. Wdrożenie: wklej do panel_install.sql w Supabase SQL editor
-- (NIE `supabase db push` — patrz konwencja projektu).

-- ─── RPC: lista modułów hotelu (feature_key, enabled) ─────────────────────────
create or replace function public.superadmin_list_tenant_features(p_tenant_id uuid)
returns table(feature_key text, enabled boolean)
language sql stable security definer set search_path = public as $$
  select feature_key, enabled
  from public.tenant_features
  where tenant_id = p_tenant_id
    and public.current_app_role() = 'superadmin';
$$;
grant execute on function public.superadmin_list_tenant_features(uuid) to authenticated;

-- ─── RPC: włącz/wyłącz jeden moduł hotelu ─────────────────────────────────────
create or replace function public.superadmin_set_tenant_feature(p_tenant_id uuid, p_feature_key text, p_enabled boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.current_app_role() <> 'superadmin' then raise exception 'Tylko superadmin.'; end if;
  if coalesce(trim(p_feature_key),'') = '' then raise exception 'Brak klucza modułu.'; end if;
  insert into public.tenant_features (tenant_id, feature_key, enabled, updated_at)
    values (p_tenant_id, trim(p_feature_key), p_enabled, now())
  on conflict (tenant_id, feature_key)
    do update set enabled = excluded.enabled, updated_at = now();
end $$;
grant execute on function public.superadmin_set_tenant_feature(uuid, text, boolean) to authenticated;
```

- [ ] **Step 2: Verify migration numbering is unique**

Run: `npm run migrations:check`
Expected: `Migracje OK — <N> plików, numery unikalne.` (N = previous count + 1)

- [ ] **Step 3: Append the same SQL to `supabase/panel_install.sql`**

Open the file, go to the end (currently ends after the `seed_app_accounts.sql` section), and append:

```sql

-- ========== 0073_superadmin_tenant_features.sql ==========
```

followed by the exact SQL block from Step 1 (same content, no changes).

- [ ] **Step 4: Confirm the appended block matches the migration file**

Run: `diff <(sed -n '/0073_superadmin_tenant_features.sql ==========/,$p' supabase/panel_install.sql | tail -n +2) supabase/migrations/0073_superadmin_tenant_features.sql`
Expected: no output (files identical from that point on, since it's the last section)

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/0073_superadmin_tenant_features.sql supabase/panel_install.sql
git commit -m "feat(superadmin): add module-toggle RPCs for tenant_features"
```

Do NOT run `supabase db push` and do NOT apply this to the live database — that step is manual (paste `panel_install.sql` into the Supabase SQL editor) and is the user's call, not this task's.

---

### Task 2: Module toggle UI in superadmin.html

**Files:**
- Modify: `public/hk-phone/superadmin.html`

**Interfaces:**
- Consumes: RPCs `superadmin_list_tenant_features(p_tenant_id)` and `superadmin_set_tenant_feature(p_tenant_id, p_feature_key, p_enabled)` from Task 1
- Consumes: existing `sb` (Supabase client), `esc()` helper, and the hotel-row template inside `loadHotele()` (lines ~107-120 of the current file)

- [ ] **Step 1: Add the canonical module list constant**

Insert near the top of the `<script>` block, right after the `STATUS_LBL` constant (currently line 54):

```js
// Klucze modułów licencjonowalnych — lustro MODULE_REGISTRY z src/lib/modules.js
// (tylko wpisy bez core:true). Dodałeś tam nowy moduł? Dodaj i tu.
const LICENSABLE_MODULES = [
  { key: "hk",       label: "Housekeeping" },
  { key: "klucze",   label: "Klucze / karty" },
  { key: "depozyty", label: "Depozyty" },
  { key: "parking",  label: "Parking" },
  { key: "goscie",   label: "Stali goście" },
  { key: "vouchery", label: "Vouchery" },
  { key: "opinie",   label: "Opinie gości" },
  { key: "sklepik",  label: "Sklepik" },
  { key: "zadania",  label: "Zadania" },
];
const featuresCache = {}; // tenantId -> Set(feature_key) z enabled=true
```

- [ ] **Step 2: Add the "Moduły" button and hidden panel to the hotel row template**

In `loadHotele()`, the `.map(r => ...)` template currently ends with:

```js
      <div class="row">
        <input class="inp th-wa" data-id="${r.id}" value="${esc(r.whatsapp_number||"")}" placeholder="numer WhatsApp bota tego hotelu" style="max-width:220px"/>
        <button class="btn small" onclick="saveWa('${r.id}')">Zapisz numer</button>
        <button class="btn small ghost" onclick="setTrialEnds('${r.id}','${esc(r.name)}')">Zmień datę</button>
        <button class="btn small ${susp?'ok':'danger'}" onclick="toggleKill('${r.id}','${esc(r.name)}', ${susp})">${susp?"Włącz z powrotem":"Wyłącz teraz"}</button>
      </div>
    </div>`;
```

Change it to add a "Moduły" button and a hidden container, closing the `.row` before them:

```js
      <div class="row">
        <input class="inp th-wa" data-id="${r.id}" value="${esc(r.whatsapp_number||"")}" placeholder="numer WhatsApp bota tego hotelu" style="max-width:220px"/>
        <button class="btn small" onclick="saveWa('${r.id}')">Zapisz numer</button>
        <button class="btn small ghost" onclick="setTrialEnds('${r.id}','${esc(r.name)}')">Zmień datę</button>
        <button class="btn small ${susp?'ok':'danger'}" onclick="toggleKill('${r.id}','${esc(r.name)}', ${susp})">${susp?"Włącz z powrotem":"Wyłącz teraz"}</button>
        <button class="btn small ghost" onclick="toggleModules('${r.id}')">Moduły</button>
      </div>
      <div class="card" id="mod-${r.id}" style="display:none;margin-top:8px"></div>
    </div>`;
```

- [ ] **Step 3: Add `toggleModules`, `renderModules`, and `setModule` functions**

Add after the existing `window.toggleKill` function (end of file, before `</script>`):

```js
window.toggleModules = async (tenantId) => {
  const box = document.getElementById(`mod-${tenantId}`);
  if (!box) return;
  const willOpen = box.style.display === "none";
  if (willOpen && !featuresCache[tenantId]) {
    const { data, error } = await sb.rpc("superadmin_list_tenant_features", { p_tenant_id: tenantId });
    if (error) { box.innerHTML = `<div class="msg err">Błąd: ${esc(error.message)}</div>`; box.style.display = "block"; return; }
    featuresCache[tenantId] = new Set((data||[]).filter(r => r.enabled).map(r => r.feature_key));
  }
  if (willOpen) renderModules(tenantId);
  box.style.display = willOpen ? "block" : "none";
};

function renderModules(tenantId) {
  const box = document.getElementById(`mod-${tenantId}`);
  const enabledSet = featuresCache[tenantId] || new Set();
  box.innerHTML = LICENSABLE_MODULES.map(m => `
    <label style="display:flex;align-items:center;gap:7px;padding:4px 0;font-weight:600;font-size:13px">
      <input type="checkbox" ${enabledSet.has(m.key) ? "checked" : ""} onchange="setModule('${tenantId}','${m.key}',this.checked)"/>
      ${esc(m.label)}
    </label>`).join("");
}

window.setModule = async (tenantId, key, enabled) => {
  const { error } = await sb.rpc("superadmin_set_tenant_feature", { p_tenant_id: tenantId, p_feature_key: key, p_enabled: enabled });
  if (error) { alert("Błąd zapisu: " + error.message); return; }
  if (enabled) featuresCache[tenantId].add(key); else featuresCache[tenantId].delete(key);
};
```

- [ ] **Step 4: Manual verification (requires Task 1's SQL already pasted into Supabase)**

Open `public/hk-phone/superadmin.html` directly in a browser (`file://` path is fine — it only talks to Supabase over HTTPS), log in as the superadmin account, click "Moduły" on the demo hotel, toggle a checkbox, then re-open the panel (collapse/expand) and confirm the checked state persisted. Cross-check in Supabase table editor that `tenant_features` has the matching row with `enabled` set correctly.

- [ ] **Step 5: Commit**

```bash
git add public/hk-phone/superadmin.html
git commit -m "feat(superadmin): module toggle grid per hotel"
```

---

### Task 3: Electron desktop shell

**Files:**
- Create: `electron-superadmin/main.cjs`
- Create: `electron-builder.superadmin.json`
- Modify: `package.json` (add `dist:superadmin` script)

**Interfaces:**
- Consumes: deployed URL `https://grzankatoster-sketch.github.io/hk-phone/superadmin.html` (env override `SUPERADMIN_URL`), same pattern as `electron-manager/main.cjs`'s `VITE_PANEL_URL`
- Consumes: `electron` / `electron-builder` devDependencies already declared in root `package.json`

- [ ] **Step 1: Create the Electron main process file**

Create `electron-superadmin/main.cjs`:

```js
// ─── electron-superadmin/main.cjs ────────────────────────────────────────────
// „GuestSage Operator" — cienki natywny shell Electron owijający kokpit właściciela
// SaaS (public/hk-phone/superadmin.html). Ten sam wzorzec co electron-manager/main.cjs
// (GuestSage Kierownik): NIE re-bundluje niczego, ładuje wdrożoną stronę przez loadURL.
// Prywatne narzędzie właściciela — bez auto-update, bez publikacji releases.
const { app, BrowserWindow, shell } = require("electron");

const SUPERADMIN_URL =
  process.env.SUPERADMIN_URL ||
  "https://grzankatoster-sketch.github.io/hk-phone/superadmin.html";

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 800,
    minWidth: 640,
    minHeight: 560,
    title: "GuestSage Operator",
    backgroundColor: "#12141a",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  mainWindow.removeMenu();
  mainWindow.loadURL(SUPERADMIN_URL).catch(() => {
    mainWindow.loadURL(
      "data:text/html;charset=utf-8," +
        encodeURIComponent(
          "<body style='font-family:sans-serif;padding:40px;color:#e8eaf0;background:#12141a'>" +
            "<h2>Brak połączenia z panelem</h2>" +
            "<p>Sprawdź internet i uruchom aplikację ponownie.</p></body>"
        )
    );
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
```

- [ ] **Step 2: Create the electron-builder config**

Create `electron-builder.superadmin.json`:

```json
{
  "appId": "pl.guestsage.superadmin",
  "productName": "GuestSage Operator",
  "copyright": "Copyright © 2026 GuestSage. Wszelkie prawa zastrzeżone.",
  "extraMetadata": {
    "main": "electron-superadmin/main.cjs",
    "name": "guestsage-superadmin"
  },
  "asar": true,
  "directories": {
    "output": "release-superadmin"
  },
  "files": [
    "electron-superadmin/**/*"
  ],
  "win": {
    "icon": "public/icon.ico",
    "target": [
      {
        "target": "nsis",
        "arch": ["x64"]
      }
    ],
    "requestedExecutionLevel": "asInvoker"
  },
  "nsis": {
    "artifactName": "GuestSage-Operator-Setup-${version}.${ext}",
    "installerIcon": "public/icon.ico",
    "uninstallerIcon": "public/icon.ico",
    "oneClick": false,
    "perMachine": false,
    "allowToChangeInstallationDirectory": true,
    "deleteAppDataOnUninstall": false,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true,
    "shortcutName": "GuestSage Operator"
  }
}
```

Note: no `publish` block — intentional, this app is never auto-updated or released.

- [ ] **Step 3: Add the build script**

In `package.json`, in `"scripts"`, add a line next to `"dist:manager"`:

```json
    "dist:superadmin": "electron-builder --win --x64 --config electron-builder.superadmin.json",
```

- [ ] **Step 4: Smoke-test in dev mode without packaging**

Run: `npx electron electron-superadmin/main.cjs`
Expected: a window titled "GuestSage Operator" opens and loads the superadmin login screen (dark theme, "Operator — Hotele" heading). Close the window when confirmed.

- [ ] **Step 5: Build the installer**

Run: `npm run dist:superadmin`
Expected: build succeeds, `release-superadmin/GuestSage-Operator-Setup-<version>.exe` exists.

Run: `ls release-superadmin/*.exe`
Expected: one file listed.

- [ ] **Step 6: Install and verify the packaged app**

Run the generated installer, launch "GuestSage Operator" from the Start Menu shortcut, log in with the superadmin account, and confirm the hotel list loads exactly as it does in the browser version.

- [ ] **Step 7: Commit**

```bash
git add electron-superadmin/main.cjs electron-builder.superadmin.json package.json
git commit -m "feat(superadmin): standalone Electron desktop shell"
```

Note: `release-superadmin/` (build output) is git-ignored, matching `release/`/`release-manager/` — do not force-add it.

---

## Verification Summary

After all three tasks:
1. `tenant_features` can be read/written per-tenant only by a `superadmin`-role account, enforced at the database level (not just hidden in the UI).
2. `superadmin.html` (browser or packaged) shows a working module checkbox grid per hotel that reflects and updates real `tenant_features` rows.
3. A double-clickable Windows installer exists for the owner's own machine, separate from anything shipped to hotel customers, requiring no rebuild when `superadmin.html` changes later.
