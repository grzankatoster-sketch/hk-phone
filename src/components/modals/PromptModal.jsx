import React from "react";
import { motion } from "framer-motion";

// Nieblokujący odpowiednik window.prompt. Spójny z ConfirmModal/askConfirm.
// onSubmit(value) wołane przy OK; Anuluj/tło/Esc zamyka bez wywołania.
export default function PromptModal({ message, defaultValue = "", okLabel = "OK", placeholder = "", onSubmit, onClose }) {
  const [value, setValue] = React.useState(defaultValue);
  const submit = () => { onSubmit(value); onClose(); };
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <motion.div initial={{opacity:0,scale:.96,y:8}} animate={{opacity:1,scale:1,y:0}} className="modal" style={{maxWidth:420}} onClick={e=>e.stopPropagation()}>
        <div className="modal-header"><h2>{message}</h2></div>
        <input
          className="input"
          autoFocus
          value={value}
          placeholder={placeholder}
          onChange={e=>setValue(e.target.value)}
          onKeyDown={e=>{ if(e.key==="Enter"){ e.preventDefault(); submit(); } }}
          style={{marginBottom:4}}
        />
        <div className="modal-footer">
          <button className="btn btn-outline" onClick={onClose}>Anuluj</button>
          <button className="btn btn-rose" onClick={submit}>{okLabel}</button>
        </div>
      </motion.div>
    </div>
  );
}
