import { HK_APTS } from "./constants";

export const hkW = (no) => HK_APTS.includes(no) ? 3 : 1;
export const hkFmtDate = (s) => s ? s.split("-").reverse().join(".") : "";
export const hkDayOfWeek = (s) => { try { return new Date(s).getDay(); } catch { return 0; } };
