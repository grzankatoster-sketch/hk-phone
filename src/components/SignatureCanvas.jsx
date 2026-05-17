import React from "react";

export default function SignatureCanvas({onSave,label="Podpisz tutaj myszką",height=90,dark=false}){
  const canvasRef=React.useRef(null);
  const [drawing,setDrawing]=React.useState(false);
  const [hasSig,setHasSig]=React.useState(false);
  const lastPos=React.useRef(null);

  const getPos=(e)=>{
    const c=canvasRef.current;
    const rect=c.getBoundingClientRect();
    const sx=c.width/rect.width,sy=c.height/rect.height;
    if(e.touches){return{x:(e.touches[0].clientX-rect.left)*sx,y:(e.touches[0].clientY-rect.top)*sy};}
    return{x:(e.clientX-rect.left)*sx,y:(e.clientY-rect.top)*sy};
  };
  const startDraw=(e)=>{e.preventDefault();const pos=getPos(e);lastPos.current=pos;setDrawing(true);};
  const draw=(e)=>{
    if(!drawing)return;e.preventDefault();
    const c=canvasRef.current;const ctx=c.getContext("2d");
    const pos=getPos(e);
    ctx.beginPath();ctx.moveTo(lastPos.current.x,lastPos.current.y);
    ctx.lineTo(pos.x,pos.y);
    ctx.strokeStyle="#111";ctx.lineWidth=2;ctx.lineCap="round";ctx.lineJoin="round";
    ctx.stroke();lastPos.current=pos;setHasSig(true);
  };
  const endDraw=()=>{setDrawing(false);lastPos.current=null;if(hasSig)onSave&&onSave(canvasRef.current.toDataURL("image/png"));};
  const clear=()=>{const c=canvasRef.current;c.getContext("2d").clearRect(0,0,c.width,c.height);setHasSig(false);onSave&&onSave(null);};

  return(
    <div style={{display:"flex",flexDirection:"column",gap:6}}>
      <div style={{fontSize:11.5,fontWeight:600,color:dark?"var(--dark-text-muted)":"var(--text-muted)"}}>{label}</div>
      <canvas ref={canvasRef} width={520} height={height}
        onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
        onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
        style={{width:"100%",height:height,borderRadius:"var(--cc-radius-sm)",background:"#fff",
                border:`1.5px solid var(--cc-border-strong)`,
                cursor:"crosshair",touchAction:"none",display:"block"}}/>
      <button type="button" onClick={clear}
        style={{alignSelf:"flex-start",fontSize:11,padding:"3px 10px",borderRadius:"var(--cc-radius-sm)",
                border:`1px solid var(--cc-border)`,
                background:"transparent",cursor:"pointer",
                color:"var(--cc-text-muted)"}}>
        ✕ Wyczyść podpis
      </button>
    </div>
  );
}
