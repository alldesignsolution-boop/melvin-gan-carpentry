import { useEffect, useMemo, useRef, useState } from "react";
import { CornerDownLeft, Search } from "lucide-react";

export type Command={id:string;label:string;hint:string;group:string;run:()=>void};

export function CommandPalette({commands,onClose}:{commands:Command[];onClose:()=>void}){
  const [q,setQ]=useState(''),[active,setActive]=useState(0),list=useRef<HTMLDivElement>(null);
  const shown=useMemo(()=>{const words=q.toLowerCase().split(/\s+/).filter(Boolean);return commands.filter(c=>words.every(w=>`${c.label} ${c.hint} ${c.group}`.toLowerCase().includes(w))).slice(0,40)},[q,commands]);
  useEffect(()=>setActive(0),[q]);
  useEffect(()=>{list.current?.querySelector('.selected')?.scrollIntoView({block:'nearest'})},[active]);
  const run=(c?:Command)=>{if(!c)return;onClose();c.run()};
  return <div className="modal-backdrop palette-backdrop" onClick={onClose}><div className="palette" role="dialog" aria-modal="true" aria-label="Jump to" onClick={e=>e.stopPropagation()}>
    <div className="palette-search"><Search size={17}/><input autoFocus aria-label="Jump to a page, client or lead" placeholder="Jump to a page, client or lead…" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='ArrowDown'){e.preventDefault();setActive(a=>Math.min(a+1,shown.length-1))}else if(e.key==='ArrowUp'){e.preventDefault();setActive(a=>Math.max(a-1,0))}else if(e.key==='Enter'){e.preventDefault();run(shown[active])}else if(e.key==='Escape')onClose()}}/><kbd>Esc</kbd></div>
    <div className="palette-list" ref={list} role="listbox">{shown.length?shown.map((c,i)=><button key={c.id} role="option" aria-selected={i===active} className={i===active?'selected':''} onMouseMove={()=>setActive(i)} onClick={()=>run(c)}><span className="palette-group">{c.group}</span><strong>{c.label}</strong><small>{c.hint}</small>{i===active&&<CornerDownLeft size={13}/>}</button>):<p className="palette-empty">Nothing matches “{q}”.</p>}</div>
  </div></div>;
}
