import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";

// Kontener toastów — wydzielony z App.jsx (krok 2 odchudzania monolitu).
export default function ToastContainer({toasts,dismiss}){
  if(!toasts.length)return null;
  return(
    <div className="toast-container">
      <AnimatePresence>
        {toasts.map(t=>(
          <motion.div key={t.id} initial={{opacity:0,y:14,scale:.95}} animate={{opacity:1,y:0,scale:1}} exit={{opacity:0,y:6}} transition={{duration:.2}} className={`toast-item toast-${t.type}`}>
            <div className="toast-dot"/><div className="toast-msg">{t.msg}</div>
            <button className="toast-close" onClick={()=>dismiss(t.id)}><X size={13}/></button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
