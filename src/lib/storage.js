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
});

export const loadJson = (key, fallback) => {
  try { const r = localStorage.getItem(key); return r ? JSON.parse(r) : fallback; }
  catch { return fallback; }
};

export const saveJson = (key, value) => localStorage.setItem(key, JSON.stringify(value));
