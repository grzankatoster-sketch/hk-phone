// localStorage helpers + canonical STORAGE_KEYS map.
// Wydzielone z App.jsx — Etap A refaktor (mini-step 1).

export const STORAGE_KEYS = Object.freeze({
  tasks: "reception-final-tasks", extra: "reception-final-extra",
  carry: "reception-final-carry", adminSession: "reception-final-admin-session",
  adminLog: "reception-final-admin-log", employeeLog: "reception-final-employee-log",
  reports: "reception-final-reports", wiki: "reception-final-wiki",
  empReports: "reception-emp-reports", adminUser: "reception-admin-user",
  adminAudit: "reception-admin-audit", datedReminders: "reception-dated-reminders",
  handoverNotes: "reception-handover-notes", workerDark: "reception-worker-dark",
  adminDark: "reception-admin-dark", soundEnabled: "reception-sound-enabled",
  paymentCorrections: "reception-payment-corrections",
  globalNotifications: "reception-global-notifications",
  handoverLog: "reception-handover-log",
  incidentLog: "reception-incident-log",
  reportsFull: "reception-reports-full",
  messages: "reception-messages",
  hkNotes: "reception-hk-notes",
  hkDayLogs: "reception-hk-day-logs",
  managerAlerts: "reception-manager-alerts",
  standingReminders: "reception-standing-reminders",
  wikiLastSeen: "reception-wiki-last-seen",
  faults: "reception-faults",
  adhocTasks: "reception-hk-adhoc-tasks",
  adhocThresholds: "reception-hk-adhoc-thresholds",
  schedule: "reception-schedule",
  vouchers: "reception-vouchers",
  reviews: "reception-reviews",
  adminPasswordHash: "reception-admin-password-hash",
  customManagers: "reception-custom-managers",
  parking: "reception-parking",
  parkingHistory: "reception-parking-history",
  staliGoscie: "reception-stali-goscie",
  kwhotelCreds: "reception-kwhotel-creds",
  reviewsSeedVer: "reception-reviews-seed-v",
  bookingMeta: "reception-booking-reviews-meta",
  reviewsInsights: "reception-reviews-insights",
  pendingItems: "reception-pending-items",
  // Dodane w WYKONANIE 1.3 — wartości identyczne jak dotychczasowe surowe literały
  // (ciągłość danych w localStorage zachowana).
  safeAmount: "reception-safe-amount",
  stalaKasowa: "reception-stala-kasowa",
  stalaKasowaLog: "reception-stala-kasowa-log",
  kwTotal: "reception-kw-total",
  kasaLog: "reception-kasa-log",
  postDepositKw: "reception-post-deposit-kw",
  employees: "reception-final-employees",
  autosaveNote: "reception-autosave-note",
  lastView: "reception-last-view",
  mgrToggleMini: "reception-mgr-toggle-mini",
  dismissedGnotes: "reception-dismissed-gnotes",
  handoverSeen: "reception-handover-seen",
  teamMessages: "reception-team-messages",
  teamLastSeen: "reception-team-lastseen",
  errorLog: "reception-error-log",
  konserwatorzy: "reception-konserwatorzy",
  syncQueue: "reception-sync-queue",
  hkPlan: "reception-hk-plan",
  hkPriority: "reception-hk-priority",
  hkRosterLast: "reception-hk-roster-last",
  hkAutoLast: "reception-hk-auto-last",
  tenantSettings: "reception-tenant-settings",
  wakeUps: "reception-wake-ups",
  upsellCharges: "reception-upsell-charges",
  roomKeys: "reception-room-keys",
  guestDeposits: "reception-guest-deposits",
  pricingConfig: "reception-pricing-config",
  pricingEvents: "reception-pricing-events",
  testClockOffset: "reception-test-clock-offset",
  // Prefiksy kluczy budowanych dynamicznie (dopisywany sufiks, np. -{data}/-{imię}):
  dismissedRemindersPrefix: "reception-dismissed-reminders",
});

export const loadJson = (key, fallback) => {
  try { const r = localStorage.getItem(key); if (!r) return fallback; const v = JSON.parse(r); return v ?? fallback; }
  catch { return fallback; }
};

export const saveJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));

export const getCustomManagers = () => loadJson(STORAGE_KEYS.customManagers, []);
export const setCustomManagers = (list) => saveJson(STORAGE_KEYS.customManagers, list);
