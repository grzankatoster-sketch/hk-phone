export default function WikiList({entries,selectedId,onSelect,dark}){
  return(
    <div className="wiki-list">
      {entries.map(entry=>(
        <button key={entry.id} type="button" onClick={()=>onSelect(entry)} className={`wiki-item ${dark?"wiki-item-dark":""} ${selectedId===entry.id?"wiki-item-selected":""}`}>
          <p className={`wiki-title ${dark?"wiki-title-dark":""}`}>{entry.topic}</p>
          <p className={`wiki-preview ${dark?"wiki-preview-dark":""}`}>{entry.content}</p>
          <p className={`wiki-date ${dark?"wiki-date-dark":""}`}>Aktualizacja: {entry.updatedAt}</p>
        </button>
      ))}
      {!entries.length&&<div className={`empty-box ${dark?"empty-box-dark":""}`}>Brak tematów pasujących do wyszukiwania.</div>}
    </div>
  );
}
