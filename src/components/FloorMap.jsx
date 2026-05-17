export default function FloorMap({floor,faults,onSelectSpace,selectedSpace}){
  const isParter = floor.key === "parter";
  const items = isParter ? floor.spaces : (floor.rooms || []);
  const faultsBySpace = {};
  faults.forEach(f=>{
    if(f.status==="done")return;
    if(f.floor!==floor.key)return;
    if(!faultsBySpace[f.space_id])faultsBySpace[f.space_id]=[];
    faultsBySpace[f.space_id].push(f);
  });
  return (
    <div className="cc-floor-map">
      <div className="cc-floor-map-title">{floor.label}</div>
      <div className={`cc-floor-grid${isParter?" cc-floor-grid-parter":" cc-floor-grid-rooms"}`}>
        {items.map(it=>{
          const id=isParter?it.id:it.no;
          const label=isParter?it.label:it.no;
          const list=faultsBySpace[id]||[];
          const has=list.length>0;
          const priority=list.some(f=>f.priority==="urgent")?"urgent":list.some(f=>f.status==="in_progress")?"progress":has?"normal":"none";
          return (
            <button
              key={id}
              onClick={()=>onSelectSpace(id)}
              className={`cc-floor-cell cc-floor-cell-${priority}${selectedSpace===id?" cc-floor-cell-sel":""}`}
              title={has?`${list.length} usterek`:"Brak usterek"}>
              <span className="cc-floor-cell-label">{label}</span>
              {has&&<span className="cc-floor-cell-badge">{list.length}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
