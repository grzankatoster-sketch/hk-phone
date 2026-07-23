import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { config } from "dotenv";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "../.env") });

const SB_URL = process.env.VITE_SUPABASE_URL;
const SB_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SB_URL || !SB_KEY) {
  console.error("Brak VITE_SUPABASE_URL lub SUPABASE_SERVICE_KEY w .env");
  console.error("Dodaj: SUPABASE_SERVICE_KEY=eyJ... (z Supabase → Project Settings → API → service_role)");
  process.exit(1);
}
const supabase = createClient(SB_URL, SB_KEY);

const filePath = join(__dirname, "../public/hk-phone/index.html");
const fileContent = readFileSync(filePath);

const { error } = await supabase.storage
  .from("hk-phone")
  .upload("index.html", fileContent, {
    contentType: "text/html; charset=utf-8",
    upsert: true,
  });

if (error) {
  console.error("Błąd:", error.message);
  process.exit(1);
}

console.log("OK — plik wgrany z poprawnym Content-Type.");
console.log(`URL: ${SB_URL}/storage/v1/object/public/hk-phone/index.html`);
