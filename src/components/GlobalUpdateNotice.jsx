import { motion, AnimatePresence } from "framer-motion";

// Globalny dymek aktualizacji — widoczny dla WSZYSTKICH (pracownik i kierownik),
// nad każdym panelem. Sterowany stanem auto-updatera z App (update-available / downloaded).
// Wydzielony z App.jsx (krok 2 odchudzania monolitu).
export default function GlobalUpdateNotice({state,info,progress,dark,onDownload,onInstall,onDismiss}){
  if(!window.electronAPI)return null;
  if(!(state==="available"||state==="downloading"||state==="downloaded"))return null;
  const d=dark;
  const muted=d?"var(--dark-text-secondary)":"var(--text-muted)";
  const border=d?"1px solid var(--dark-border)":"1px solid var(--border-light)";
  const wrap={position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:9999,
    width:"min(440px,calc(100vw - 32px))",borderRadius:"var(--radius-md)",
    boxShadow:"0 10px 40px rgba(0,0,0,.28)",padding:"12px 16px"};
  return(
    <AnimatePresence>
      <motion.div key={state} initial={{opacity:0,y:-16}} animate={{opacity:1,y:0}} exit={{opacity:0,y:-10}} transition={{duration:.22}}>
        {state==="available"&&(
          <div style={{...wrap,background:d?"#2a1f00":"#fffbeb",border:d?"1px solid rgba(245,158,11,.4)":"1px solid #fde68a"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <div>
                <div style={{fontWeight:700,fontSize:13,color:d?"#f5d06a":"#92400e"}}>Dostępna aktualizacja{info?.version?` v${info.version}`:""}</div>
                <div style={{fontSize:11.5,color:d?"#a08040":"#b45309",marginTop:2}}>Pobierz, aby zainstalować najnowszą wersję.</div>
              </div>
              <div style={{display:"flex",gap:8,flexShrink:0}}>
                <button onClick={onDownload} style={{padding:"6px 14px",borderRadius:6,fontWeight:700,fontSize:12,cursor:"pointer",
                  background:d?"rgba(245,158,11,.15)":"#fef3c7",border:d?"1px solid rgba(245,158,11,.4)":"1px solid #fde68a",color:d?"#f5d06a":"#92400e"}}>Pobierz</button>
                <button onClick={onDismiss} style={{padding:"6px 12px",borderRadius:6,fontSize:11,cursor:"pointer",background:"transparent",border,color:muted}}>Później</button>
              </div>
            </div>
          </div>
        )}
        {state==="downloading"&&(
          <div style={{...wrap,background:d?"#0d1e38":"#eff6ff",border:d?"1px solid rgba(88,166,255,.25)":"1px solid #93c5fd"}}>
            <div style={{fontSize:12,fontWeight:600,color:d?"#B065A0":"#1d4ed8",marginBottom:6}}>Pobieranie aktualizacji… {progress}%</div>
            <div style={{height:6,background:d?"#1c2a40":"#dbeafe",borderRadius:3}}>
              <div style={{width:`${progress}%`,height:"100%",background:"#B065A0",borderRadius:3,transition:"width .3s"}}/>
            </div>
          </div>
        )}
        {state==="downloaded"&&(
          <div style={{...wrap,background:d?"#0a2a1a":"#f0fdf4",border:d?"1px solid rgba(52,211,153,.4)":"1px solid #6ee7b7"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
              <span style={{fontWeight:700,fontSize:13,color:d?"#34d399":"#047857"}}>✓ Aktualizacja pobrana — gotowa do instalacji</span>
              <div style={{display:"flex",gap:8,flexShrink:0}}>
                <button onClick={onInstall} style={{padding:"6px 14px",borderRadius:6,fontWeight:700,fontSize:12,cursor:"pointer",
                  background:d?"rgba(52,211,153,.15)":"#dcfce7",border:d?"1px solid rgba(52,211,153,.4)":"1px solid #6ee7b7",color:d?"#34d399":"#047857"}}>Zaktualizuj teraz</button>
                <button onClick={onDismiss} style={{padding:"6px 12px",borderRadius:6,fontSize:11,cursor:"pointer",background:"transparent",border,color:muted}}>Przy zamknięciu</button>
              </div>
            </div>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
