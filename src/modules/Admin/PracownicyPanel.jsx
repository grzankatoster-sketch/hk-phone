import React from "react";
import { motion } from "framer-motion";
import { Users, Plus, Trash2 } from "lucide-react";
import { monthKey } from "../../lib/dates";

export default function PracownicyPanel({
  employees,
  newEmployeeName, setNewEmployeeName,
  addEmployee,
  editingEmployeeIndex, setEditingEmployeeIndex,
  editingEmployeeName, setEditingEmployeeName,
  saveEditedEmployee,
  startEditEmployee,
  removeEmployee,
  employeeActivityLog,
}) {
  return (
    <motion.div key="pr" initial={{opacity:0,y:6}} animate={{opacity:1,y:0}} exit={{opacity:0}}>
      <div className="panel glass dark-panel">
        <div className="panel-title"><Users size={16}/> Zarządzanie pracownikami</div>
        <div className="input-row" style={{marginBottom:14}}>
          <input className="input dark-admin-entry" placeholder="Imię nowego pracownika"
            value={newEmployeeName} onChange={e=>setNewEmployeeName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&addEmployee()}/>
          <button className="btn btn-indigo" onClick={addEmployee}><Plus size={14}/> Dodaj osobę</button>
        </div>
        <div className="stack">
          {employees.map((employee,index)=>{
            const month=monthKey();
            const empLog=employeeActivityLog.filter(item=>{
              if(item.employee!==employee||!item.loginAt)return false;
              const p=item.loginAt.split(".");if(p.length<3)return false;
              const y=p[2]?.split(",")[0]?.trim();const m=p[1]?.padStart(2,"0");
              return`${y}-${m}`===month;
            });
            const total=empLog.length;
            const completed=empLog.filter(i=>i.logoutAt).length;
            const pct=total>0?Math.round((completed/total)*100):0;
            return (
              <div key={`${employee}-${index}`} className="task-row dark-row">
                {editingEmployeeIndex===index?(
                  <>
                    <input className="input dark-admin-entry flex-1" value={editingEmployeeName}
                      onChange={e=>setEditingEmployeeName(e.target.value)}
                      onKeyDown={e=>e.key==="Enter"&&saveEditedEmployee()}/>
                    <div className="actions">
                      <button className="btn btn-emerald" onClick={saveEditedEmployee}>Zapisz</button>
                      <button className="btn btn-outline-dark" onClick={()=>{setEditingEmployeeIndex(null);setEditingEmployeeName("");}}>Anuluj</button>
                    </div>
                  </>
                ):(
                  <>
                    <div style={{display:"flex",alignItems:"center",gap:12,flex:1}}>
                      <div style={{width:38,height:38,borderRadius:"50%",background:"var(--plum)",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:14,fontWeight:800,flexShrink:0}}>{employee[0]}</div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{color:"var(--dark-text)",fontFamily:"var(--cc-font-display)",fontSize:16,lineHeight:1.2}}>{employee}</div>
                        <div style={{display:"flex",gap:12,marginTop:3,fontSize:11.5,color:"var(--dark-text-muted)"}}>
                          <span>&#128197; <strong style={{color:"var(--gold)"}}>{total}</strong> zmian/mc</span>
                          {total>0&&<span style={{color:pct>=80?"var(--emerald)":pct>=50?"var(--gold)":"var(--rose)"}}>&#9679; {pct}% zakończeń</span>}
                        </div>
                      </div>
                    </div>
                    <div className="actions">
                      <button className="btn btn-outline-dark" onClick={()=>startEditEmployee(index)}>Edytuj</button>
                      <button className="btn btn-danger-outline" onClick={()=>removeEmployee(index)}>Usuń</button>
                    </div>
                  </>
                )}
              </div>
            );
          })}
          {!employees.length&&<div className="empty-box empty-box-dark">Brak pracowników.</div>}
        </div>
      </div>
    </motion.div>
  );
}
