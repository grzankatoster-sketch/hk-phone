// ─── UpdateBanner.jsx ─────────────────────────────────────────────────────────
import React, { useState, useEffect } from "react";

export default function UpdateBanner({ dark }) {
  const [state, setState] = useState("idle");
  // idle | checking | available | downloading | downloaded | error | upToDate
  const [info, setInfo]     = useState(null);
  const [progress, setProgress] = useState(0);
  const [appVersion, setAppVersion] = useState("");
  const isElectron = !!window.electronAPI;

  useEffect(() => {
    if (!isElectron) return;
    window.electronAPI.getAppVersion().then(setAppVersion).catch(() => {});
    window.electronAPI.onUpdateAvailable((data) => { setState("available"); setInfo(data); });
    window.electronAPI.onUpdateNotAvailable(() => { setState("upToDate"); setTimeout(() => setState("idle"), 4000); });
    window.electronAPI.onUpdateProgress((data) => { setState("downloading"); setProgress(data.percent); });
    window.electronAPI.onUpdateDownloaded(() => setState("downloaded"));
    window.electronAPI.onUpdateError((msg) => { setState("error"); setInfo({ error: msg }); setTimeout(() => setState("idle"), 8000); });
    return () => window.electronAPI.removeUpdateListeners?.();
  }, []);

  const checkUpdate = async () => {
    setState("checking");
    try { await window.electronAPI.checkForUpdates(); }
    catch { setState("error"); setTimeout(() => setState("idle"), 5000); }
  };

  if (!isElectron) return null;

  // ── Kolory wg trybu ───────────────────────────────────────────────────────
  const d = dark;
  const border = d ? "1px solid var(--dark-border)" : "1px solid var(--border-light)";
  const bg     = d ? "var(--dark-bg2)"  : "var(--bg-card)";
  const col    = d ? "var(--dark-text)" : "var(--text-primary)";
  const muted  = d ? "var(--dark-text-secondary)" : "var(--text-muted)";

  // ── Idle: wersja + guzik ──────────────────────────────────────────────────
  if (state === "idle") return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,
                 padding:"10px 16px",borderRadius:"var(--radius-md)",border,background:bg,marginBottom:4}}>
      <span style={{fontSize:12,color:muted,fontFamily:"monospace"}}>
        Panel Recepcji {appVersion ? `v${appVersion}` : ""}
      </span>
      <button onClick={checkUpdate}
        style={{padding:"5px 14px",borderRadius:6,border,background:"transparent",
                color:muted,cursor:"pointer",fontSize:12,fontWeight:600,whiteSpace:"nowrap"}}>
        Sprawdź aktualizacje
      </button>
    </div>
  );

  if (state === "checking") return (
    <StatusBar bg={d?"#0d2a4a":"#eff6ff"} border={d?"rgba(88,166,255,.2)":"#93c5fd"}
               color={d?"#58a6ff":"#1d4ed8"} text="Sprawdzanie aktualizacji…"/>
  );

  if (state === "upToDate") return (
    <StatusBar bg={d?"#0a2a1a":"#f0fdf4"} border={d?"rgba(52,211,153,.2)":"#6ee7b7"}
               color={d?"#34d399":"#047857"} text={`✓ Masz najnowszą wersję${appVersion?` (v${appVersion})`:""}`}/>
  );

  if (state === "available") return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",
                 padding:"10px 16px",borderRadius:"var(--radius-md)",
                 background:d?"#2a1f00":"#fffbeb",border:d?"1px solid rgba(245,158,11,.3)":"1px solid #fde68a"}}>
      <div>
        <span style={{fontWeight:700,fontSize:13,color:d?"#f5d06a":"#92400e"}}>
          Dostępna aktualizacja v{info?.version}
        </span>
        {info?.releaseNotes && (
          <div style={{fontSize:11.5,color:d?"#a08040":"#b45309",marginTop:2}}>
            {String(info.releaseNotes).slice(0,100)}
          </div>
        )}
      </div>
      <div style={{display:"flex",gap:8,flexShrink:0}}>
        <button onClick={() => window.electronAPI.downloadUpdate()}
          style={{padding:"6px 14px",borderRadius:6,fontWeight:700,fontSize:12,cursor:"pointer",
                  background:d?"rgba(245,158,11,.15)":"#fef3c7",
                  border:d?"1px solid rgba(245,158,11,.4)":"1px solid #fde68a",
                  color:d?"#f5d06a":"#92400e"}}>
          Pobierz i zainstaluj
        </button>
        <button onClick={() => setState("idle")}
          style={{padding:"6px 12px",borderRadius:6,fontSize:11,cursor:"pointer",
                  background:"transparent",border,color:muted}}>
          Później
        </button>
      </div>
    </div>
  );

  if (state === "downloading") return (
    <div style={{padding:"10px 16px",borderRadius:"var(--radius-md)",
                 background:d?"#0d1e38":"#eff6ff",border:d?"1px solid rgba(88,166,255,.2)":"1px solid #93c5fd"}}>
      <div style={{fontSize:12,fontWeight:600,color:d?"#58a6ff":"#1d4ed8",marginBottom:6}}>
        Pobieranie aktualizacji… {progress}%
      </div>
      <div style={{height:6,background:d?"#1c2a40":"#dbeafe",borderRadius:3}}>
        <div style={{width:`${progress}%`,height:"100%",background:d?"#58a6ff":"#3b82f6",borderRadius:3,transition:"width .3s"}}/>
      </div>
    </div>
  );

  if (state === "downloaded") return (
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap",
                 padding:"10px 16px",borderRadius:"var(--radius-md)",
                 background:d?"#0a2a1a":"#f0fdf4",border:d?"1px solid rgba(52,211,153,.3)":"1px solid #6ee7b7"}}>
      <span style={{fontWeight:700,fontSize:13,color:d?"#34d399":"#047857"}}>
        ✓ Aktualizacja pobrana — gotowa do instalacji
      </span>
      <div style={{display:"flex",gap:8,flexShrink:0}}>
        <button onClick={() => window.electronAPI.installUpdate()}
          style={{padding:"6px 14px",borderRadius:6,fontWeight:700,fontSize:12,cursor:"pointer",
                  background:d?"rgba(52,211,153,.15)":"#dcfce7",
                  border:d?"1px solid rgba(52,211,153,.4)":"1px solid #6ee7b7",
                  color:d?"#34d399":"#047857"}}>
          Zainstaluj i uruchom ponownie
        </button>
        <button onClick={() => setState("idle")}
          style={{padding:"6px 12px",borderRadius:6,fontSize:11,cursor:"pointer",
                  background:"transparent",border,color:muted}}>
          Przy zamknięciu
        </button>
      </div>
    </div>
  );

  if (state === "error") return (
    <StatusBar bg={d?"#2a0a0a":"#fff1f2"} border={d?"rgba(248,113,113,.2)":"#fda4af"}
               color={d?"#f87171":"#be123c"} text={`✗ Błąd aktualizacji: ${String(info?.error||"").slice(0,80)}`}/>
  );

  return null;
}

function StatusBar({ bg, border, color, text }) {
  return (
    <div style={{padding:"10px 16px",borderRadius:"var(--radius-md)",
                 background:bg,border:`1px solid ${border}`,marginBottom:4}}>
      <span style={{fontSize:13,fontWeight:600,color}}>{text}</span>
    </div>
  );
}
