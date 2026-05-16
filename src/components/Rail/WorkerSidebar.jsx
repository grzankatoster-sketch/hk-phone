import React from "react";
import {
  ClipboardList, ArrowLeftRight, BellRing,
  Home, Sun as SunIcon, AlertTriangle, FileText,
  Users, Star, MessageSquare, BookOpen, Search,
  LogOut, AlertCircle, FileDown,
  Car,
} from "lucide-react";
import { SHIFT_SHORT_LABELS } from "../../lib/constants";
import Logo from "../../ui/Logo";
import { fmt } from "../../lib/dates";

export default function WorkerSidebar({
  activeTab, setActiveTab, started, overdueCount, datedCount,
  setShowWiki, setShowEmpReport, isAdmin, currentManager,
  setShowAdminPanel, setShowSearch, workerDark, setWorkerDark,
  setShowPaymentForm, employeeName, selectedShift, onShowMsg,
  liveTime, shiftElapsed, progress, totalDone, totalMandatory,
  onOpenFinish, inboxCount = 0, faultsCount = 0, showToast,
}) {
  const totalBadge = overdueCount + datedCount;
  const shiftLabel = selectedShift ? (SHIFT_SHORT_LABELS[selectedShift] || selectedShift) : "";

  const now = new Date();
  const clockStr = liveTime
    ? liveTime.slice(0, 5)
    : `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const dateStr = now.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const nb = (id, icon, label, badge = 0, disabled = false) => (
    <button
      key={id}
      className={`nsb-item${activeTab === id ? " nsb-active" : ""}${disabled ? " nsb-disabled" : ""}`}
      onClick={() => !disabled && setActiveTab(id)}
    >
      <span className="nsb-item-icon">{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {badge > 0 && <span className="nsb-badge">{badge}</span>}
    </button>
  );

  const soon = (icon, label) => (
    <button
      className="nsb-item nsb-disabled"
      onClick={() => showToast?.(`Moduł "${label}" — wkrótce dostępny.`, "info")}
    >
      <span className="nsb-item-icon">{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      <span className="nsb-soon">Wkrótce</span>
    </button>
  );

  return (
    <aside className="nsb">
      {/* Logo */}
      <div className="nsb-logo-block">
        <div className="nsb-logo-mark">
          <Logo variant="icon" tone="white" width={28} height={28} />
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

      {/* Navigation */}
      <nav className="nsb-nav">
        <div className="nsb-section-label">Zmiana</div>
        {nb("zmiana",     <ClipboardList size={16} />, "Przegląd zmiany", totalBadge)}
        {nb("przekazanie",<ArrowLeftRight size={16} />, "Przekaż zmianę", 0, !started)}
        {nb("informacje", <BellRing size={16} />,      "Informacje", inboxCount)}

        <div className="nsb-divider" />
        <div className="nsb-section-label">Pokoje</div>
        {nb("hk",     <Home size={16} />,          "Housekeeping")}
        {nb("usterki",<AlertTriangle size={16} />,  "Usterki", faultsCount)}

        <div className="nsb-divider" />
        <div className="nsb-section-label">Obsługa</div>
        {nb("parking", <Car size={16} />, "Parking")}
        {nb("goscie",  <Users size={16} />,         "Stali goście")}
        {nb("vouchery",<FileText size={16} />,       "Vouchery")}
        {nb("opinie",  <Star size={16} />,           "Opinie gości")}

        <div className="nsb-divider" />
        <div className="nsb-section-label">Komunikacja</div>
        {soon(<MessageSquare size={16} />, "Czat zespołu")}
        <button className="nsb-item" onClick={() => setShowEmpReport(true)}>
          <span className="nsb-item-icon"><FileDown size={16} /></span>
          <span style={{ flex: 1 }}>Notatka służbowa</span>
        </button>
        <button className="nsb-item" onClick={onShowMsg}>
          <span className="nsb-item-icon"><AlertCircle size={16} /></span>
          <span style={{ flex: 1 }}>Wiad. do kierownika</span>
        </button>

        <div className="nsb-divider" />
        <div className="nsb-section-label">Narzędzia</div>
        <button className="nsb-item" onClick={() => setShowWiki(true)}>
          <span className="nsb-item-icon"><BookOpen size={16} /></span>
          <span style={{ flex: 1 }}>Wiki</span>
        </button>
        <button className="nsb-item" onClick={() => setShowPaymentForm(true)}>
          <span className="nsb-item-icon"><FileText size={16} /></span>
          <span style={{ flex: 1 }}>Korekta płatności</span>
        </button>
        {isAdmin && (
          <button className="nsb-item" onClick={() => setShowAdminPanel(true)}>
            <span className="nsb-item-icon">
              <svg width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
              </svg>
            </span>
            <span style={{ flex: 1 }}>Panel kierownika</span>
          </button>
        )}
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
          <button className="nsb-icon-btn" onClick={() => setShowSearch(true)} title="Szukaj">
            <Search size={14} />
          </button>
          <button className="nsb-icon-btn" onClick={() => setWorkerDark(v => !v)} title="Motyw">
            <SunIcon size={14} />
          </button>
        </div>
      </div>
    </aside>
  );
}
