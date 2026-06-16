const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG = {
  mailbox: {
    host: "",
    port: 993,
    secure: true,
    user: "raporty@conradcomfort.pl",
    passwordEnv: "HK_AUTOMATION_MAIL_PASSWORD",
    folder: "INBOX",
    unseenOnly: true,
    markSeenAfterSuccess: false,
    senderAllowList: [],
    subjectIncludes: [],
  },
  pollIntervalMinutes: 15,
  daysAhead: 5,
  dryRun: true,
  writeEmptyPlans: false,
  useReportHistory: true,
  reportHistoryLimit: 120,
  outputDir: "C:\\zmiany i raporty\\hk-automation",
  statusLogic: {
    stayoverMode: "parity",
    pgzAfterStayNights: 3,
    generateStayovers: true,
  },
};

function deepMerge(base, override) {
  if (!override || typeof override !== "object" || Array.isArray(override)) return base;
  const out = { ...base };
  for (const [key, value] of Object.entries(override)) {
    if (value && typeof value === "object" && !Array.isArray(value) && base[key] && typeof base[key] === "object") {
      out[key] = deepMerge(base[key], value);
    } else {
      out[key] = value;
    }
  }
  return out;
}

function loadDotEnvIfPresent() {
  try {
    require("dotenv").config({ path: path.resolve(process.cwd(), ".env") });
  } catch {}
}

function loadConfig(configPath) {
  loadDotEnvIfPresent();
  const resolved = path.resolve(process.cwd(), configPath || "scripts/hk-automation/config.local.json");
  let fileConfig = {};
  if (fs.existsSync(resolved)) {
    fileConfig = JSON.parse(fs.readFileSync(resolved, "utf8"));
  }
  const config = deepMerge(DEFAULT_CONFIG, fileConfig);
  config.outputDir = path.resolve(config.outputDir);
  return config;
}

function getMailPassword(config) {
  const envName = config.mailbox.passwordEnv || "HK_AUTOMATION_MAIL_PASSWORD";
  return process.env[envName] || config.mailbox.password || "";
}

module.exports = { loadConfig, getMailPassword };
