# Superadmin desktop app + module toggles

Status: approved 2026-08-11

## Problem

`public/hk-phone/superadmin.html` is a working operator cockpit (login gated to
`app_accounts.role = 'superadmin'`, lists hotels, add hotel, edit WhatsApp
number, set trial/paid-until date, suspend/reactivate). It runs today as a
browser page under the GitHub Pages hack. Two gaps:

1. Owner wants it as a desktop app, not a website tab.
2. It cannot toggle which licensed modules (HK, Usterki, Grafik, Sklepik...)
   a hotel has bought — that's still done by hand-editing `tenant_features`
   via SQL. This was already flagged as future work in the migration comment
   for `superadmin_create_tenant` ("reszta — moduły/branding — osobno, 4.13").

## Approach

### Desktop wrapper

The codebase already has the exact pattern needed: `electron-manager/main.cjs`
+ `electron-builder.manager.json` is a thin native shell ("GuestSage
Kierownik") that opens one `BrowserWindow` and `loadURL`s the deployed
`public/hk-phone/panel.html` — no bundling, no copy of the HTML, tenant/auth
resolved at runtime by the page itself. Reuse this pattern verbatim for the
superadmin cockpit instead of inventing a new one:

- `electron-superadmin/main.cjs` — copy of `electron-manager/main.cjs` with
  `PANEL_URL` → `https://grzankatoster-sketch.github.io/hk-phone/superadmin.html`
  (env override `SUPERADMIN_URL`, mirroring the existing `VITE_PANEL_URL`
  override), window title "Panel Operatora", `backgroundColor` matching
  `superadmin.html`'s own dark theme (`#12141a`) instead of the manager
  panel's light one.
- `electron-builder.superadmin.json` — copy of `electron-builder.manager.json`
  with `appId: "pl.guestsage.superadmin"`, `productName: "GuestSage Operator"`,
  `extraMetadata.main: "electron-superadmin/main.cjs"`,
  `directories.output: "release-superadmin"`, `files: ["electron-superadmin/**/*"]`,
  own NSIS artifact name/shortcut name, **no `publish` block** — this is a
  private tool for the owner's machine only, not auto-updated or distributed,
  so no GitHub releases repo needed for it.
- New `package.json` scripts: `"dist:superadmin": "electron-builder --win --x64
  --config electron-builder.superadmin.json"` (no `release:superadmin` —
  nothing to publish). Reuses the `electron`/`electron-builder`
  devDependencies already in the root `package.json`; no new folder-level
  `package.json` or `node_modules`.
- Because the window loads the live URL, updating `superadmin.html` (e.g. the
  module-toggle UI below) takes effect immediately without rebuilding the
  desktop app — same as the manager panel today.
- Once sub-project 1 (hosting migration off GitHub Pages) lands, only the
  `PANEL_URL` constant changes — no other rework.

Rejected alternative: bolt an extra hidden window onto the main Panel
Recepcji Electron app (`electron/main.cjs`). Rejected because it would
permanently bundle an owner-only cockpit inside the installer sold to hotel
customers.

### Module toggles

New migration `supabase/migrations/00NN_superadmin_tenant_features.sql`,
following the exact pattern of `0056_superadmin_tenants.sql` (`security
definer`, `current_app_role() = 'superadmin'` guard, `grant execute ... to
authenticated`):

- `superadmin_list_tenant_features(p_tenant_id uuid) returns table(feature_key
  text, enabled boolean)` — rows from `tenant_features` for that tenant.
- `superadmin_set_tenant_feature(p_tenant_id uuid, p_feature_key text,
  p_enabled boolean) returns void` — upsert into `tenant_features`.

UI change to `superadmin.html`: each hotel card gets a "Moduły" toggle
revealing a checkbox grid for the 9 licensable (non-core) keys mirrored from
[`src/lib/modules.js`](../../../src/lib/modules.js) `MODULE_REGISTRY`:
`klucze`, `depozyty`, `hk`, `parking`, `goscie`, `vouchery`, `opinie`,
`sklepik`, `zadania` — with their existing Polish labels. Missing rows in
`tenant_features` render as unchecked (deny-by-default, consistent with how
`modules.js` already treats it). Checking/unchecking calls
`superadmin_set_tenant_feature` immediately (optimistic, same pattern as the
existing suspend button) — no separate "save" step.

The key list is duplicated by necessity: `modules.js` is an ES module built
by Vite for the React app; `superadmin.html` is a static file with no build
step. A code comment in `superadmin.html` will point back to `modules.js` so
future module additions are remembered on both sides.

## Out of scope (deferred, not this cycle)

- Payments/billing (Stripe/Przelewy24) — trial/paid-until date stays manual.
- Public hosting migration for hk-phone employee pages (separate sub-project,
  tracked independently — Cloudflare Pages + own domain).
- Branding/logo/config editor per tenant.

## Testing

- Manual: run the desktop app, log in as superadmin, toggle a module for the
  demo tenant, confirm the row appears/updates in `tenant_features` via
  Supabase, confirm the Panel Recepcji app (reading `tenant_features` through
  `modules.js`) picks up the change.
