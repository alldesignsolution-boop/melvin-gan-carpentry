import { useEffect, useState } from "react";
import { Archive, ArrowUpRight, Bot, Check, CheckSquare, Clock3, Plus, RotateCcw, Search, Sparkles, X } from "lucide-react";
import { brands } from "@/lib/domain.mjs";
import { ActivityFeed, Checklist, ContactButtons, LabelChips, LabelPicker, brandName, money, shortDate, today, type Act, type Crm, type Lead } from "./crm-shared";
import { ShortcutEditor } from "./clients";

const matchesText=(l:Lead,q:string)=>`${l.name} ${l.phone} ${l.email} ${l.instagram} ${l.notes}`.toLowerCase().includes(q.toLowerCase());

export function LeadsBoard({crm,setCrm,act,brand,openLead,onNew}:{crm:Crm;setCrm:(c:Crm)=>void;act:Act;brand:string;openLead:(id:string)=>void;onNew:(stage:string)=>void}){
  const [q,setQ]=useState(''),[label,setLabel]=useState(''),[drag,setDrag]=useState(''),[drop,setDrop]=useState<{stage:string;index:number}|null>(null);
  const visible=crm.leads.filter(l=>!l.archived&&(brand==='all'||l.brand===brand)&&(!q||matchesText(l,q))&&(!label||l.labels.includes(label)));
  const t0=today();
  function finish(stage:string){
    const lead=crm.leads.find(l=>l.id===drag);setDrag('');const target=drop;setDrop(null);
    if(!lead||!target||target.stage!==stage)return;
    // Index among every lead in the list (the board may be filtered), placed before the card we dropped on.
    const column=crm.leads.filter(l=>l.stage===stage&&!l.archived&&l.id!==lead.id).sort((a,b)=>a.position-b.position),shown=visible.filter(l=>l.stage===stage).sort((a,b)=>a.position-b.position);
    const before=shown.slice(target.index).find(l=>l.id!==lead.id),index=before?column.findIndex(l=>l.id===before.id):column.length;
    const order=[...column];order.splice(index,0,{...lead,stage});
    setCrm({...crm,leads:crm.leads.map(l=>{const i=order.findIndex(o=>o.id===l.id);return i<0?l:{...l,stage:l.id===lead.id?stage:l.stage,position:i}})});
    act({action:'lead.move',id:lead.id,stage,index});
  }
  return <>
    <div className="board-toolbar">
      <div className="search-field board-search"><Search size={15}/><input aria-label="Filter leads" placeholder="Filter by name, phone, note…" value={q} onChange={e=>setQ(e.target.value)}/>{q&&<button className="plain" aria-label="Clear filter" onClick={()=>setQ('')}><X size={13}/></button>}</div>
      <div className="label-filter">{crm.labels.map(l=><button key={l.id} className={`label-chip c-${l.color} ${label===l.id?'on':''}`} aria-pressed={label===l.id} onClick={()=>setLabel(label===l.id?'':l.id)}>{l.name}</button>)}</div>
      <span className="toolbar-note">{visible.length} lead{visible.length!==1?'s':''} · drag cards between lists</span>
    </div>
    <div className="board" role="list">
      {crm.stages.map(s=>{const cards=visible.filter(l=>l.stage===s.id).sort((a,b)=>a.position-b.position);
        return <section className={`board-column stage-${s.id} ${drop?.stage===s.id?'over':''}`} key={s.id} role="listitem" aria-label={s.name} onDragOver={e=>{if(!drag)return;e.preventDefault();if(drop?.stage!==s.id||drop.index!==cards.length)setDrop({stage:s.id,index:cards.length})}} onDrop={e=>{e.preventDefault();finish(s.id)}}>
          <header><h2>{s.name}</h2><span className="counter">{cards.length}</span>{s.id==='new'&&<button className="plain icon-button" aria-label="Add a lead" onClick={()=>onNew('new')}><Plus size={16}/></button>}</header>
          <div className="board-cards">
            {cards.map((l,i)=>{const tasks=crm.tasks.filter(t=>t.leadId===l.id),open=tasks.filter(t=>!t.done),next=open.find(t=>t.due);
              return <div className="card-slot" key={l.id} onDragOver={e=>{if(!drag)return;e.preventDefault();e.stopPropagation();const r=e.currentTarget.getBoundingClientRect(),index=e.clientY<r.top+r.height/2?i:i+1;if(drop?.stage!==s.id||drop.index!==index)setDrop({stage:s.id,index})}}>{drop?.stage===s.id&&drop.index===i&&drag&&<div className="drop-marker"/>}
                <button className={`lead-card ${drag===l.id?'dragging':''}`} draggable onDragStart={e=>{setDrag(l.id);e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',l.id)}} onDragEnd={()=>{setDrag('');setDrop(null)}} onClick={()=>openLead(l.id)}>
                  <LabelChips ids={l.labels} labels={crm.labels} compact/>
                  <strong>{l.name}</strong>
                  <span className="lead-card-meta"><span className={`brand-dot ${l.brand}`}/>{brandName(l.brand)}{l.source==='manychat'&&<span className="source-badge"><Bot size={11}/>ManyChat</span>}</span>
                  <span className="lead-card-foot">{tasks.length>0&&<span className={open.length?'':'all-done'}><CheckSquare size={12}/>{tasks.length-open.length}/{tasks.length}</span>}{next&&<span className={`due ${next.due<t0?'late':''}`}><Clock3 size={11}/>{next.due===t0?'Today':shortDate(next.due)}</span>}{l.value!=null&&<span>{money(l.value)}</span>}{!tasks.length&&!l.value&&<span className="subtle">{shortDate(l.created)}</span>}</span>
                </button></div>})}
            {drop?.stage===s.id&&drop.index>=cards.length&&drag&&<div className="drop-marker"/>}
            {!cards.length&&<p className="column-empty">{s.id==='new'?'New ManyChat leads land here.':'Drop a card here.'}</p>}
          </div>
          {s.id!=='onboarded'&&s.id!=='lost'&&<button className="column-add" onClick={()=>onNew(s.id)}><Plus size={14}/>Add a lead</button>}
        </section>})}
    </div>
  </>;
}

export function LeadDrawer({lead,crm,act,onClose,openClient}:{lead:Lead;crm:Crm;act:Act;onClose:()=>void;openClient:(id:string)=>void}){
  const [form,setForm]=useState(lead),[saving,setSaving]=useState(false);
  useEffect(()=>setForm(lead),[lead.id,lead.updated]);
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[onClose]);
  const dirty=['name','brand','phone','email','instagram','value','notes'].some(k=>String((form as any)[k]??'')!==String((lead as any)[k]??''));
  async function save(e?:React.FormEvent){e?.preventDefault();setSaving(true);await act({action:'lead.save',lead:{...lead,...form,labels:lead.labels,shortcuts:lead.shortcuts}});setSaving(false);}
  const move=(stage:string)=>act({action:'lead.move',id:lead.id,stage,index:0});
  const extra=Object.entries(lead.extra||{});
  return <div className="drawer-backdrop" onClick={onClose}><aside className="drawer" role="dialog" aria-modal="true" aria-labelledby="lead-title" onClick={e=>e.stopPropagation()}>
    <header className="drawer-head">
      <div><div className="eyebrow">{lead.source==='manychat'?<><Bot size={12}/>From ManyChat</>:'Lead'} · added {shortDate(lead.created)}</div>
      <h2 id="lead-title">{lead.name}</h2>
      <div className="drawer-stage"><label>List<select value={lead.stage} onChange={e=>move(e.target.value)}>{crm.stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>{lead.stage==='onboarded'?<button className="primary" onClick={()=>openClient(lead.id)}>Open client dashboard<ArrowUpRight size={14}/></button>:lead.stage!=='lost'&&<button className="primary" onClick={()=>move('onboarded')}><Sparkles size={14}/>Mark onboarded</button>}</div></div>
      <button className="modal-close" aria-label="Close lead" onClick={onClose}><X size={20}/></button>
    </header>
    <div className="drawer-body">
      <ContactButtons lead={lead}/>
      <section><h3>Labels</h3><LabelPicker lead={lead} crm={crm} act={act}/></section>
      <section><Checklist leadId={lead.id} crm={crm} act={act} title="To-do checklist"/></section>
      <form className="lead-form" onSubmit={save}>
        <h3>Details</h3>
        <div className="form-columns"><label>Name<input required maxLength={160} value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label>Brand<select value={form.brand} onChange={e=>setForm({...form,brand:e.target.value})}>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
        <div className="form-columns"><label>Phone / WhatsApp<input maxLength={40} inputMode="tel" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></label><label>Email<input type="email" maxLength={200} value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/></label></div>
        <div className="form-columns"><label>Instagram<input maxLength={80} placeholder="username" value={form.instagram} onChange={e=>setForm({...form,instagram:e.target.value})}/></label><label>Deal value (MYR)<input type="number" min={0} step="any" value={form.value??''} onChange={e=>setForm({...form,value:e.target.value===''?null:Number(e.target.value)})}/></label></div>
        <label>Notes<textarea rows={4} maxLength={8000} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="What they need, budget, timing…"/></label>
        {dirty&&<div className="form-save"><button type="button" className="secondary" onClick={()=>setForm(lead)}>Discard</button><button className="primary" disabled={saving}>{saving?'Saving…':'Save details'}<Check size={14}/></button></div>}
      </form>
      <section><ShortcutEditor lead={lead} act={act}/></section>
      {extra.length>0&&<section><h3>ManyChat fields</h3><dl className="extra-fields">{extra.map(([k,v])=><div key={k}><dt>{k.replaceAll('_',' ')}</dt><dd>{v}</dd></div>)}</dl></section>}
      <section><ActivityFeed leadId={lead.id} act={act} stamp={lead.updated}/></section>
      <footer className="drawer-foot">{lead.archived?<button className="secondary" onClick={()=>act({action:'lead.archive',id:lead.id,archived:false})}><RotateCcw size={14}/>Restore lead</button>:<button className="secondary" onClick={async()=>{if(confirm(`Archive ${lead.name}? You can restore it from the archive.`)&&await act({action:'lead.archive',id:lead.id,archived:true}))onClose()}}><Archive size={14}/>Archive lead</button>}</footer>
    </div>
  </aside></div>;
}

export function NewLeadModal({stage,brand,act,onClose,onCreated}:{stage:string;brand:string;act:Act;onClose:()=>void;onCreated:(id:string)=>void}){
  const [lead,setLead]=useState({name:'',brand:brand==='all'?'hoga':brand,phone:'',email:'',instagram:'',notes:'',stage}),[saving,setSaving]=useState(false);
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[onClose]);
  async function submit(e:React.FormEvent){e.preventDefault();setSaving(true);const id=await act({action:'lead.save',lead});setSaving(false);if(id){onClose();onCreated(id)}}
  return <div className="modal-backdrop" onClick={()=>!saving&&onClose()}><form className="modal" role="dialog" aria-modal="true" aria-labelledby="new-lead-title" onClick={e=>e.stopPropagation()} onSubmit={submit}>
    <button type="button" className="modal-close" aria-label="Close" onClick={onClose}><X size={20}/></button>
    <div className="eyebrow">NEW LEAD</div><h2 id="new-lead-title">Add a lead</h2>
    <div className="form-columns"><label>Name<input autoFocus required maxLength={160} value={lead.name} onChange={e=>setLead({...lead,name:e.target.value})}/></label><label>Brand<select value={lead.brand} onChange={e=>setLead({...lead,brand:e.target.value})}>{brands.map(b=><option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div>
    <div className="form-columns"><label>Phone / WhatsApp<input inputMode="tel" maxLength={40} value={lead.phone} onChange={e=>setLead({...lead,phone:e.target.value})}/></label><label>Email<input type="email" maxLength={200} value={lead.email} onChange={e=>setLead({...lead,email:e.target.value})}/></label></div>
    <label>Notes<textarea rows={3} maxLength={8000} value={lead.notes} onChange={e=>setLead({...lead,notes:e.target.value})}/></label>
    <div className="modal-actions"><span>ManyChat leads are added automatically</span><button className="primary" disabled={saving}>{saving?'Saving…':'Add lead'}<Check size={15}/></button></div>
  </form></div>;
}
