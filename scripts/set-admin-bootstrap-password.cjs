// Nadanie/rotacja hasla bootstrap administratora (WYKONANIE 0.2).
// Uzycie: node scripts/set-admin-bootstrap-password.cjs "NoweHaslo123"
// Wymaga migracji 0070 wgranej (supabase db push) PRZED uruchomieniem.
require("dotenv").config();

const url = process.env.VITE_SUPABASE_URL || "";
const serviceKey = process.env.SUPABASE_SERVICE_KEY || "";
const tenantId = process.env.VITE_TENANT_ID || "";
const newPassword = process.argv[2];

async function main() {
  if (!url || !serviceKey || !tenantId) {
    console.error("BLAD: brak VITE_SUPABASE_URL / SUPABASE_SERVICE_KEY / VITE_TENANT_ID w env (.env).");
    process.exitCode = 1;
    return;
  }
  if (!newPassword || newPassword.length < 10) {
    console.error("BLAD: podaj nowe haslo jako argument, min. 10 znakow.");
    process.exitCode = 1;
    return;
  }
  const res = await fetch(`${url}/rest/v1/rpc/set_admin_bootstrap`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ p_tenant_id: tenantId, p_password: newPassword }),
  });
  if (!res.ok) {
    console.error(`BLAD: HTTP ${res.status} ${await res.text()}`);
    process.exitCode = 1;
    return;
  }
  console.log("Haslo bootstrap zapisane (hash w Supabase). Zapisz je w managerze hasel — nie da sie go juz odczytac z bazy.");
}

main().catch((e) => { console.error("BLAD:", e.stack || e.message); process.exitCode = 1; });
