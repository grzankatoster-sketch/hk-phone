import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowRight, ArrowLeft, Plus, Trash2, Check, Sparkles } from "lucide-react";
import { STORAGE_KEYS, loadJson, saveJson } from "../../lib/storage";

// Kreator pierwszego uruchomienia (WYKONANIE 4.13, wersja MVP). Pokazuje się raz,
// przy zupełnie pierwszym starcie appki na nowej recepcji. Trzy kroki: powitanie,
// dodanie pracowników (od razu trwałe — ten sam STORAGE_KEYS.employees co reszta
// appki), i checklist modułów. Checklist NIE zapisuje do tenant_features na żywo —
// zapis wymaga sesji Supabase Auth (RLS "to authenticated"), a recepcja loguje się
// dziś lokalnym hasłem (patrz 2.17, jeszcze niezrobione) — więc krok generuje
// gotową listę do ręcznego wdrożenia zamiast udawać zapis, który by cicho padł.
const LICENSABLE_MODULES = [
  { key: "hk", label: "Housekeeping", desc: "Plan sprzątania, przypisania, kontakt z pokojówkami" },
  { key: "parking", label: "Parking", desc: "Rejestr miejsc parkingowych gości" },
  { key: "goscie", label: "Stali goście", desc: "Notatki i negocjowane stawki dla gości powracających" },
  { key: "vouchery", label: "Vouchery", desc: "Wystawianie voucherów i cashbacków" },
  { key: "opinie", label: "Opinie gości", desc: "Śledzenie opinii Booking + drafty odpowiedzi AI" },
  { key: "sklepik", label: "Sklepik", desc: "Magazyn i sprzedaż drobnych produktów na recepcji" },
];

export default function FirstRunWizard({ onFinish }) {
  const [step, setStep] = React.useState(0);
  const [employees, setEmployees] = React.useState(() => loadJson(STORAGE_KEYS.employees, []));
  const [newName, setNewName] = React.useState("");
  const [selectedModules, setSelectedModules] = React.useState({});

  const addEmployee = () => {
    const name = newName.trim();
    if (!name) return;
    if (employees.some(e => e.toLowerCase() === name.toLowerCase())) { setNewName(""); return; }
    const next = [...employees, name];
    setEmployees(next);
    saveJson(STORAGE_KEYS.employees, next);
    setNewName("");
  };
  const removeEmployee = (i) => {
    const next = employees.filter((_, idx) => idx !== i);
    setEmployees(next);
    saveJson(STORAGE_KEYS.employees, next);
  };
  const toggleModule = (key) => setSelectedModules(prev => ({ ...prev, [key]: !prev[key] }));

  const finish = () => {
    saveJson(STORAGE_KEYS.firstRunDone, true);
    onFinish?.();
  };

  const checklistText = LICENSABLE_MODULES
    .filter(m => selectedModules[m.key])
    .map(m => `- ${m.label} (${m.key})`)
    .join("\n") || "- (nic nie zaznaczono)";

  const box = { width: "min(560px, 92vw)", maxHeight: "88vh", overflowY: "auto", background: "var(--dark-panel-bg, #1a1220)", border: "1px solid var(--dark-border, rgba(255,255,255,.1))", borderRadius: 16, padding: "28px 30px", color: "var(--dark-text, #f2ecf5)" };
  const stepLabel = { fontSize: 11, fontWeight: 700, letterSpacing: ".08em", textTransform: "uppercase", color: "var(--plum-bright, #c99950)" };
  const h1 = { fontSize: 22, fontWeight: 800, margin: "6px 0 10px", fontFamily: "var(--cc-font-display, inherit)" };
  const p = { fontSize: 13.5, color: "var(--dark-text-muted, #b8adc4)", lineHeight: 1.5, marginBottom: 18 };
  const inp = "input dark-input";
  const footRow = { display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22 };

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", background: "radial-gradient(circle at 30% 20%, rgba(90,29,74,.35), #0b0810 70%)" }}>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: .18 }} style={box}>

          {step === 0 && (<>
            <span style={stepLabel}>Krok 1 z 3 &middot; Witamy</span>
            <div style={h1}>Skonfigurujmy Twoją recepcję</div>
            <div style={p}>To krótki, jednorazowy kreator — pokaże się tylko teraz, przy pierwszym uruchomieniu. Dodamy pracowników, wybierzemy moduły których potrzebujesz, i na koniec przejdziemy razem przez najważniejsze okna aplikacji.</div>
            <div style={footRow}>
              <span />
              <button className="btn btn-rose" onClick={() => setStep(1)}>Zaczynamy <ArrowRight size={14} /></button>
            </div>
          </>)}

          {step === 1 && (<>
            <span style={stepLabel}>Krok 2 z 3 &middot; Pracownicy</span>
            <div style={h1}>Kto pracuje na recepcji?</div>
            <div style={p}>Dodaj imiona — pojawią się od razu na liście logowania. Możesz dopisać więcej osób później w panelu kierownika.</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
              <input className={inp} value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addEmployee(); } }}
                placeholder="Imię i nazwisko" style={{ flex: 1 }} autoFocus />
              <button type="button" className="btn btn-outline" onClick={addEmployee}><Plus size={14} /></button>
            </div>
            {employees.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 6 }}>
                {employees.map((e, i) => (
                  <div key={e + i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 11px", background: "rgba(255,255,255,.04)", borderRadius: 8, fontSize: 13 }}>
                    <span style={{ flex: 1 }}>{e}</span>
                    <button type="button" onClick={() => removeEmployee(i)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--dark-text-muted)", display: "flex" }}><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            )}
            <div style={footRow}>
              <button className="btn btn-outline" onClick={() => setStep(0)}><ArrowLeft size={14} /> Wstecz</button>
              <button className="btn btn-rose" onClick={() => setStep(2)}>Dalej <ArrowRight size={14} /></button>
            </div>
          </>)}

          {step === 2 && (<>
            <span style={stepLabel}>Krok 3 z 3 &middot; Moduły</span>
            <div style={h1}>Czego potrzebuje ten hotel?</div>
            <div style={p}>Zaznacz moduły, które mają być widoczne. To dziś tylko checklist do wdrożenia — realne włączenie modułu robi się po stronie bazy (poproś o to przy wdrożeniu), żeby dobrze zadziałało z licencją.</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
              {LICENSABLE_MODULES.map(m => (
                <label key={m.key} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "8px 10px", background: selectedModules[m.key] ? "rgba(201,153,80,.1)" : "rgba(255,255,255,.03)", border: `1px solid ${selectedModules[m.key] ? "var(--plum-bright, #c99950)" : "transparent"}`, borderRadius: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={!!selectedModules[m.key]} onChange={() => toggleModule(m.key)} style={{ marginTop: 3 }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{m.label}</div>
                    <div style={{ fontSize: 11.5, color: "var(--dark-text-muted)" }}>{m.desc}</div>
                  </div>
                </label>
              ))}
            </div>
            <div style={footRow}>
              <button className="btn btn-outline" onClick={() => setStep(1)}><ArrowLeft size={14} /> Wstecz</button>
              <button className="btn btn-rose" onClick={() => setStep(3)}>Dalej <ArrowRight size={14} /></button>
            </div>
          </>)}

          {step === 3 && (<>
            <span style={stepLabel}>Gotowe</span>
            <div style={h1}>Zestaw do wdrożenia</div>
            <div style={p}>Skopiuj i prześlij tę listę przy wdrożeniu — moduły zostaną włączone po stronie bazy.</div>
            <pre style={{ background: "rgba(0,0,0,.3)", padding: "12px 14px", borderRadius: 8, fontSize: 12.5, whiteSpace: "pre-wrap", marginBottom: 18 }}>{checklistText}</pre>
            <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--dark-text-muted)", marginBottom: 4 }}><Sparkles size={13} /> Każda osoba przy swoim pierwszym logowaniu dostanie krótki tour po oknach aplikacji.</div>
            <div style={{ ...footRow, justifyContent: "flex-end" }}>
              <button className="btn btn-rose" onClick={finish}><Check size={14} /> Zakończ, przejdź do logowania</button>
            </div>
          </>)}

        </motion.div>
      </AnimatePresence>
    </div>
  );
}
