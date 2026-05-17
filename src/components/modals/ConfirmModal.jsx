import { motion } from "framer-motion";

export default function ConfirmModal({ message, onConfirm, onClose }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div initial={{opacity:0,scale:.96,y:8}} animate={{opacity:1,scale:1,y:0}} className="modal" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h2>Potwierdź operację</h2></div>
        <p style={{color:"var(--text-secondary)",lineHeight:1.65,marginBottom:4}}>{message}</p>
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Anuluj</button>
          <button className="btn btn-rose" onClick={()=>{onConfirm();onClose();}}>Potwierdź</button>
        </div>
      </motion.div>
    </div>
  );
}
