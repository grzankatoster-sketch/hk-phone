
# Sesje — BACKEND (wymagają decyzji + setup'u Supabase)

## Sesja B1 — Supabase setup + multi-tenant fundament
- **Cel:** Stworzyć projekt Supabase, schema multi-tenant, klient.
- **Prerequisites:** **decyzja produktowa o Supabase** + utworzenie projektu w Supabase Dashboard.
- **Pliki:** nowe `src/lib/supabase/{client,realtime,syncQueue}.js`, `.env.local`, `supabase/migrations/0001_init.sql`.
- **Co zrobić:**
  1. `npm install @supabase/supabase-js` (zgoda!).
  2. Schema z `tenant_id` we wszystkich tabelach.
  3. RLS permisywne dla anon + plan zaostrzenia.
  4. Auth: magic link albo email/password — DECYZJA.
- **Estymacja:** wysokie ryzyko + zewnętrzna usługa, ~3h, ~80k tokens. **Plan Mode + Codex review schema obowiązkowo.**

## Sesja B2 — HK migration na Supabase Realtime
- **Prerequisites:** B1 + R-C1.
- **Estymacja:** ~3h, ~100k tokens.

## Sesja B3 — CRUD admin alerts/reminders
- **Prerequisites:** B1.
- **Estymacja:** ~2h, ~60k tokens.

## Sesja B4 — Vouchers + BookingReviews + ChatGPT/Claude reply
- **Prerequisites:** B1 + decyzja o AI provider.
- **Pliki:** nowe `src/modules/Vouchers/`, `src/modules/BookingReviews/`, `supabase/functions/ai-reply/index.ts`.
- **Estymacja:** ~5h, ~150k tokens.

## Sesja B5 — TeamChat + SwapProposal
- **Prerequisites:** B1.
- **Estymacja:** ~4h, ~120k tokens.

## Sesja B6 — Push notifications (web + Electron)
- **Prerequisites:** B1.
- **Pliki:** nowy `public/sw.js`, `src/lib/push.js`, `supabase/functions/push-notify/index.ts`, edycja `electron/main.cjs` + `electron/preload.cjs`.
- **Estymacja:** ~4h, ~120k tokens.


## Sesja B8 — Mailowanie raportów (Resend Edge Function)
- **Prerequisites:** B1.
- **Estymacja:** ~2h, ~60k tokens.

## Sesja B9 — Konserwator PWA mobile
- **Prerequisites:** B1, D2 idealnie.
- **Estymacja:** ~5h, ~150k tokens. **Plan Mode obowiązkowy.**

## Sesja B10 — Edytowalność (koniec hardcoded)
- **Prerequisites:** B1.
- **Cel:** HK_WORKERS, PARTER_SPACES, ADMIN_PASSWORD itp. → `app_settings` per tenant.
- **Estymacja:** ~3h, ~100k tokens.

## Sesja B11 — HK ad-hoc → mobile
- **Prerequisites:** B2, B6, B9.
- **Estymacja:** ~3h, ~100k tokens.

---

# Sesje — DESIGN SYSTEM (Figma)

> Tylko jeśli użytkownik zdecyduje się na pracę w Figmie.

## Sesja DS1 — Stwórz plik Figma + Foundations
- **Cel:** Manualnie stworzyć plik z 4 collections Variables (Core / Conrad Theme / Typography / Layout) zgodnie z planem PLAN-MODE w `~/.claude/plans/plan-mode-conrad-parallel-turtle.md` sekcja 4.
- **Pliki:** brak edycji kodu — tylko Figma.
- **Estymacja:** ~3h ręcznie w Figmie. Po skończeniu → udostępnij Claude Code link do frame'a, użyję `mcp__figma-global__get_design_context`.

## Sesja DS2 — Login wariant A/B/C frame'y w Figmie
- **Prerequisites:** DS1.
- **Estymacja:** ~3h.

## Sesja DS3 — Reception Dashboard A/B/C
- **Prerequisites:** DS1.
- **Estymacja:** ~6h.

## Sesja DS4 — Admin Overview A/B/C + Cmd+K palette
- **Prerequisites:** DS1.
- **Estymacja:** ~8h.

## Sesja DS5 — HK timeline B + mobile C
- **Prerequisites:** DS1.
- **Estymacja:** ~5h.

## Sesja DS6 — Modals + greenfield (Vouchers/Chat/Schedule/Konserwator/Onboarding)
- **Prerequisites:** DS1.
- **Estymacja:** ~10h.

---

# CHECKLIST WYKONANIA

## Cleanup
- [ ] C1 — Admin login flow A4
- [ ] C2 — Manager toggle bar mini A10
- [x] C3 — dark-shell konsolidacja A13 (sesja 4)
- [x] C4 — EMPTY_LABEL helper A14 — `EMPTY_LABEL`/`displayValue` w lib/format.js (zastosowanie globalne = opcjonalny churn)
- A8 (Lottie sukces po finishShift) — ZROBIONE: checkPlumAnim + showSuccessAnim w App.jsx
- A7 (konsolidacja ssc-rose/sky/amber/violet) — POMINIĘTE: czysto kosmetyczne, ryzyko regresji > wartość

## Refaktor Etap A (finalizacja)
- [ ] R-A5 — HK helpers
- [ ] R-A6 — HK PDF helpers

## Refaktor Etap B (modale + sidebary)
- [ ] R-B1 — ConfirmModal
- [ ] R-B2 — PreShiftModal
- [ ] R-B3 — Message + Search + Employee Report modals
- [ ] R-B4 — Correction + Audit modals
- [ ] R-B5 — Faults modals + FloorMap
- [ ] R-B6 — AdhocTaskFormModal
- [ ] R-B7 — WorkerSidebar + AdminSidebarRail
- [ ] R-B8 — InboxPanel + WikiList

## Refaktor Etap C (moduły)
- [ ] R-C1 — HK module
- [ ] R-C2 — Faults module
- [ ] R-C3 — Login module
- [ ] R-C4 — Parking + StaliGoscie
- [ ] R-C5 — Admin module
- [ ] R-C6 — ShiftFinish module

## Codex bug fixes  (zamknięte w audycie 2026-05-09 — patrz project_audit_fixes)
- [x] F1 — pdf chk page-break (HIGH) — chk zwraca nowe y we wszystkich 4 PDF
- [x] F2 — pdf falsy normalization — `||"-"` → `??"-"` (0 zł nie znika)
- [x] F3 — loadJson null shape — guard `if(!r)return fallback` + `v ?? fallback` w storage.js
- [x] F4 — Date UTC quirk — toISOString().split → lokalne YYYY-MM-DD / todayKey()
- [x] F5 — defaultWiki updatedAt lazy — getDefaultWikiEntries() w useState init
- [x] F6 — FAULT_FLOORS drift trap — `floor.rooms || []` w FloorMap

## REFINE
- [ ] UX1 — Wiki search + TOC
- [ ] UX2 — Wiadomości grouping
- [ ] UX3 — Usterki kanban
- [ ] UX4 — Adhoc timeline
- [ ] UX5 — Shift Finish stepper + Lottie (npm install)
- [ ] UX6 — Auto-animate tasks (npm install)

## REDESIGN
- [ ] D1 — HK timeline B
- [ ] D2 — HK mobile C

## Backend (sequential, post Supabase setup)
- [ ] B1 — Supabase + multi-tenant fundament
- [ ] B2 — HK Realtime
- [ ] B3 — Admin alerts CRUD
- [ ] B4 — Vouchers + BookingReviews + AI
- [x] B5 — TeamChat + SwapProposal (kanały Zespół/HK/Konserwacja, propozycja zamiany → applyAgentSwap; localStorage + Supabase messages)
- [ ] B6 — Push notifications
- [ ] B7 — Schedule Excel
- [ ] B8 — Email raportów
- [ ] B9 — Konserwator PWA
- [ ] B10 — Edytowalność (hardcoded → app_settings)
- [ ] B11 — HK ad-hoc mobile

## Design System (Figma)
- [ ] DS1 — Figma setup + Foundations
- [ ] DS2 — Login frames
- [ ] DS3 — Dashboard frames
- [ ] DS4 — Admin frames
- [ ] DS5 — HK frames
- [ ] DS6 — Modals + greenfield frames

---

# OPENER TEMPLATE (do wklejenia na start każdej sesji)

```
Folder projektu: c:\Users\grzan\Desktop\projekt
Stack: React 18, Vite 5, Electron 31, jspdf, framer-motion, lucide-react.
Wydzielone: src/lib/{storage,constants,dates,format,pdf}.js (Object.freeze gdzie się da, named exports).
NIE używaj polskich cudzysłowów "…" w JSX (parser fail) — używaj '...' albo &quot;.

Wykonaj sesję [TUTAJ wklej całą sekcję sesji z WORK_PLAN.md].

```
