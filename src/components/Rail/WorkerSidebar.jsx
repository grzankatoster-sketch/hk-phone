import React from "react";
import {
  ClipboardList, ArrowLeftRight, BellRing,
  Home, Sun as SunIcon, AlertTriangle, FileText,
  Users, Star, BookOpen,
  LogOut, FileDown,
  Car, History, MessageSquare,
} from "lucide-react";
import { SHIFT_SHORT_LABELS } from "../../lib/constants";
import { isModuleEnabled } from "../../lib/modules";
import Logo from "../../ui/Logo";
import { fmt } from "../../lib/dates";

export default function WorkerSidebar({
  activeTab, setActiveTab, started, overdueCount, datedCount,
  setShowWiki, setShowEmpReport, isAdmin, currentManager,
  setShowAdminPanel, setShowSearch, workerDark, setWorkerDark,
  setShowPaymentForm, employeeName, selectedShift,
  liveTime, shiftElapsed, progress, totalDone, totalMandatory,
  onOpenFinish, inboxCount = 0, faultsCount = 0, chatCount = 0, showToast, shiftLabel: shiftLabelProp,
}) {
  const totalBadge = overdueCount + datedCount;
  // Preferuj etykietę z godzinami z grafiku (np. „Dzienna 7–20"); fallback na sztywną.
  const shiftLabel = shiftLabelProp || (selectedShift ? (SHIFT_SHORT_LABELS[selectedShift] || selectedShift) : "");

  const now = new Date();
  const clockStr = liveTime
    ? liveTime.slice(0, 5)
    : `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dateStr = now.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const nb = (id, icon, label, badge = 0, disabled = false, kbd = null) => (
    <button
      key={id}
      type="button"
      role="tab"
      aria-selected={activeTab === id}
      aria-disabled={disabled || undefined}
      aria-keyshortcuts={kbd ? `Alt+${kbd}` : undefined}
      className={`nsb-item${activeTab === id ? " nsb-active" : ""}${disabled ? " nsb-disabled" : ""}`}
      onClick={() => !disabled && setActiveTab(id)}
    >
      <span className="nsb-item-icon" aria-hidden="true">{icon}</span>
      <span className="nsb-item-label">{label}</span>
      {badge > 0 && <span className="nsb-badge">{badge}</span>}
      {kbd && badge === 0 && <span className="nsb-kbd" aria-hidden="true">{kbd}</span>}
    </button>
  );

  return (
    <aside className="nsb">
      {/* Logo — v2 brand pill style */}
      <div className="nsb-logo-block">
        <div className="nsb-logo-mark" aria-hidden="true">
          <span className="nsb-logo-mark-txt">CC</span>
        </div>
        <div className="nsb-logo-text">
          <div className="nsb-logo-name">Conrad Comfort</div>
          <div className="nsb-logo-sub">Panel Recepcji</div>
        </div>
      </div>

      {/* User card */}
      {employeeName && (
        <div className="nsb-user">
          <div className="nsb-user-label">Zalogowany</div>
          <div className="nsb-user-name">{employeeName}</div>
          {shiftLabel && (
            <div className="nsb-user-meta">
              <div className="nsb-user-dot" />
              <span>{shiftLabel}</span>
            </div>
          )}
        </div>
      )}

      {/* Shift progress card */}
      {started && employeeName && (
        <div className="nsb-shift-card">
          <div className="nsb-shift-name">Zmiana w toku</div>
          <div className="nsb-shift-time">Trwa: {shiftElapsed}</div>
          <div className="nsb-prog-row">
            <div className="nsb-prog-bar">
              <div className="nsb-prog-fill" style={{ width: `${progress}%` }} />
            </div>
            <span className="nsb-prog-label">{totalDone}/{totalMandatory}</span>
          </div>
        </div>
      )}

      {/* Navigation — z kbd shortcuts (Alt+1..9) */}
      <nav className="nsb-nav" role="tablist" aria-label="Nawigacja recepcji">
        <div className="nsb-section-label">Zmiana</div>
        {nb("zmiana",     <ClipboardList size={16} />, "Przegląd zmiany", totalBadge, false, "1")}
        {nb("przekazanie",<ArrowLeftRight size={16} />, "Przekaż zmianę", 0, !started, "2")}
        {nb("informacje", <BellRing size={16} />,      "Informacje", inboxCount, false, "3")}
        {/* Czat między działami — tymczasowo ukryty (kod pozostaje, można przywrócić). */}
        {/* {nb("czat",       <MessageSquare size={16} />,  "Czat zespołu", chatCount)} */}

        <div className="nsb-divider" />
        <div className="nsb-section-label">Pokoje</div>
        {isModuleEnabled("hk") && nb("hk", <Home size={16} />, "Housekeeping", 0, false, "4")}
        {nb("usterki",<AlertTriangle size={16} />,  "Usterki", faultsCount, false, "5")}

        {(isModuleEnabled("parking") || isModuleEnabled("goscie") || isModuleEnabled("vouchery") || isModuleEnabled("opinie")) && (
          <>
            <div className="nsb-divider" />
            <div className="nsb-section-label">Obsługa</div>
          </>
        )}
        {isModuleEnabled("parking")  && nb("parking", <Car size={16} />,      "Parking", 0, false, "6")}
        {isModuleEnabled("goscie")   && nb("goscie",  <Users size={16} />,    "Stali goście", 0, false, "7")}
        {isModuleEnabled("vouchery") && nb("vouchery",<FileText size={16} />, "Vouchery", 0, false, "8")}
        {isModuleEnabled("opinie")   && nb("opinie",  <Star size={16} />,     "Opinie gości", 0, false, "9")}

        <div className="nsb-divider" />
        <div className="nsb-section-label">Narzędzia</div>
        <button className="nsb-item" onClick={() => setShowEmpReport(true)}>
          <span className="nsb-item-icon"><FileDown size={16} /></span>
          <span className="nsb-item-label">Notatka służbowa</span>
        </button>
        <button className="nsb-item" onClick={() => setShowWiki(true)}>
          <span className="nsb-item-icon"><BookOpen size={16} /></span>
          <span className="nsb-item-label">Wiki</span>
        </button>
        <button className="nsb-item" onClick={() => setShowPaymentForm(true)}>
          <span className="nsb-item-icon"><FileText size={16} /></span>
          <span className="nsb-item-label">Korekta płatności</span>
        </button>
        {/* "Panel kierownika" usunięty z paska narzędzi — przełącznik jest na górnym pasku. */}

        <div className="nsb-divider" />
        {nb("historia",<History size={16} />,         "Historia", 0, false, null)}
      </nav>

      {/* Finish shift button */}
      {started && (
        <button className="nsb-finish-btn" onClick={onOpenFinish}>
          <LogOut size={14} />
          Zakończ zmianę
        </button>
      )}

      {/* Bottom bar */}
      <div className="nsb-bottom">
        <div>
          <div className="nsb-clock">{clockStr}</div>
          <div className="nsb-clock-date" style={{ textTransform: "capitalize" }}>
            {dateStr}
          </div>
        </div>
        <div className="nsb-bottom-actions">
          <button className="nsb-icon-btn" onClick={() => setWorkerDark(v => !v)} title="Motyw">
            <SunIcon size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
