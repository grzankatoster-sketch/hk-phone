import React from "react";
import { motion } from "framer-motion";
import Logo from "../ui/Logo";
import { HOTEL_NAME } from "../lib/constants";

// Ekran powitalny po zalogowaniu — wydzielony z App.jsx (krok 2 odchudzania monolitu).
export default function WelcomeOverlayScreen({name,onDone}){
  const [out,setOut]=React.useState(false);
  const onDoneRef=React.useRef(onDone);
  onDoneRef.current=onDone;
  React.useEffect(()=>{
    const t1=setTimeout(()=>setOut(true),1500);
    const t2=setTimeout(()=>onDoneRef.current?.(),1950);
    return()=>{clearTimeout(t1);clearTimeout(t2);};
  },[]);
  const h=new Date().getHours();
  const greeting=h<18?"Dzień dobry,":"Dobry wieczór,";
  return(
    <div className="cc-welcome-overlay" style={{opacity:out?0:1}} role="status" aria-live="polite">
      <motion.div
        initial={{opacity:0,y:22}}
        animate={{opacity:1,y:0}}
        transition={{duration:.45,ease:[.22,1,.36,1]}}
        className="cc-welcome-inner">
        <div className="cc-welcome-mark" aria-hidden="true">
          <Logo variant="dotsOnly" tone="white" width={56} height={14}/>
        </div>
        <div className="cc-welcome-greeting">{greeting}</div>
        <div className="cc-welcome-name">{name||"Recepcja"}</div>
        <div className="cc-welcome-brand" aria-hidden="true">{HOTEL_NAME}</div>
      </motion.div>
    </div>
  );
}
