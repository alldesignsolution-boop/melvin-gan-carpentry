import { useEffect, useState } from "react";
import { ArrowLeft, ArrowUpRight, Check, Clock3, Keyboard, Link2, Mail, MessageCircle, PanelRight, Plus, Trash2, Users, X } from "lucide-react";
import { brands, safeLink, whatsappLink } from "@/lib/domain.mjs";
import { ActivityFeed, Checklist, ContactButtons, LabelChips, ago, brandName, shortDate, today, type Act, type Crm, type Lead } from "./crm-shared";

const typing=(e:KeyboardEvent)=>e.metaKey||e.ctrlKey||e.altKey||/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName)||(e.target as HTMLElement)?.isContentEditable||!!document.querySelector('[aria-modal="true"]');
// Number keys 1–9 run the matching entry while no field or dialog has focus.
export function useNumberKeys(count:number,run:(i:number)=>void){
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(typing(e))return;const n=Number(e.key);if(n>=1&&n<=9&&n<=count){e.preventDefault();run(n-1)}};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[count,run]);
}
export function clientLinks(lead:Lead){
  const wa=whatsappLink(lead.phone);
  return [...(wa?[{id:'wa',label:'WhatsApp',url:wa,auto:true}]:[]),...(lead.email?[{id:'mail',label:'Email',url:`mailto:${lead.email}`,auto:true}]:[]),...lead.shortcuts.filter(s=>safeLink(s.url)).map(s=>({...s,auto:false}))];
}
const host=(url:string)=>{try{return url.startsWith('mailto:')?url.slice(7):new URL(url).hostname.replace(/^www\./,'')}catch{return ''}};

export function ShortcutEditor({lead,act,tiles}:{lead:Lead;act:Act;tiles?:boolean}){
  const [label,setLabel]=useState(''),[url,setUrl]=useState(''),[adding,setAdding]=useState(false);
  const links=tiles?clientLinks(lead):lead.shortcuts.map(s=>({...s,auto:false}));
  async function add(e:React.FormEvent){e.preventDefault();if(await act({action:'lead.save',lead:{...lead,shortcuts:[...lead.shortcuts,{label,url:/^https?:\/\//i.test(url)?url:'https://'+url}]}})){setLabel('');setUrl('');setAdding(false)}}
  const remove=(id:string)=>act({action:'lead.save',lead:{...lead,shortcuts:lead.shortcuts.filter(s=>s.id!==id)}});
  return <div className={tiles?'shortcut-tiles':'shortcut-list'}>
    <div className="checklist-head"><h3>Shortcuts</h3>{tiles&&links.length>0&&<span className="subtle"><Keyboard size={12}/> Press 1–{Math.min(9,links.length)}</span>}</div>
    <div className="shortcut-grid">{links.map((s,i)=><div className="shortcut" key={s.id}>
      <a href={s.url} target={s.url.startsWith('mailto:')?undefined:'_blank'} rel="noopener noreferrer">{tiles&&i<9&&<kbd>{i+1}</kbd>}<span className="shortcut-icon">{s.id==='wa'?<MessageCircle size={16}/>:s.id==='mail'?<Mail size={16}/>:<Link2 size={16}/>}</span><span className="shortcut-text"><strong>{s.label}</strong><small>{host(s.url)}</small></span><ArrowUpRight size={14}/></a>
      {!s.auto&&<button className="plain icon-button" aria-label={`Remove shortcut ${s.label}`} onClick={()=>remove(s.id)}><Trash2 size={13}/></button>}
    </div>)}
    {adding?<form className="shortcut-add" onSubmit={add}><input autoFocus aria-label="Shortcut name" placeholder="Name, e.g. Google Drive" maxLength={60} required value={label} onChange={e=>setLabel(e.target.value)}/><input aria-label="Shortcut link" placeholder="https://…" required maxLength={2000} value={url} onChange={e=>setUrl(e.target.value)}/><div><button type="button" className="secondary" onClick={()=>setAdding(false)}><X size={13}/></button><button className="primary"><Check size={13}/>Save</button></div></form>
    :<button className="shortcut-new" onClick={()=>setAdding(true)}><Plus size={15}/>Add shortcut</button>}</div>
  </div>;
}

export function ClientsPage({crm,brand,open}:{crm:Crm;brand:string;open:(id:string)=>void}){
  const clients=crm.leads.filter(l=>l.stage==='onboarded'&&!l.archived&&(brand==='all'||l.brand===brand)).sort((a,b)=>(b.onboarded||'').localeCompare(a.onboarded||''));
  useNumberKeys(clients.length,i=>open(clients[i].id));
  const t0=today();
  if(!clients.length)return <section className="panel"><div className="empty"><span className="empty-icon"><Users size={24}/></span><h3>No onboarded clients yet</h3><p>Move a lead to the Onboarded list on the Leads board and it gets its own dashboard here.</p><a className="secondary" href="#/leads">Open the Leads board</a></div></section>;
  return <div className="client-grid">{clients.map((c,i)=>{const tasks=crm.tasks.filter(t=>t.leadId===c.id),open_=tasks.filter(t=>!t.done),late=open_.filter(t=>t.due&&t.due<t0).length,b=brands.find(x=>x.id===c.brand);
    return <a className="client-card" key={c.id} href={`#/clients/${c.id}`}>
      <div className="client-card-top"><span className="brand-logo small" style={{background:b?.color}}>{b?.short}</span>{i<9&&<kbd>{i+1}</kbd>}</div>
      <h3>{c.name}</h3><p className="category">{brandName(c.brand)} · client since {shortDate(c.onboarded)}</p>
      <LabelChips ids={c.labels} labels={crm.labels}/>
      <div className="progress"><i style={{width:`${tasks.length?100*(tasks.length-open_.length)/tasks.length:0}%`}}/></div>
      <div className="client-card-foot"><span>{tasks.length?`${tasks.length-open_.length}/${tasks.length} done`:'No checklist yet'}</span>{late>0?<span className="due late"><Clock3 size={11}/>{late} overdue</span>:<span>{clientLinks(c).length} shortcut{clientLinks(c).length!==1?'s':''}</span>}</div>
    </a>})}</div>;
}

export function ClientDashboard({lead,crm,act,openLead}:{lead:Lead;crm:Crm;act:Act;openLead:(id:string)=>void}){
  const [notes,setNotes]=useState(lead.notes);
  useEffect(()=>setNotes(lead.notes),[lead.id,lead.notes]);
  const links=clientLinks(lead);
  useNumberKeys(links.length,i=>{const u=links[i].url;u.startsWith('mailto:')?location.href=u:window.open(u,'_blank','noopener')});
  const tasks=crm.tasks.filter(t=>t.leadId===lead.id),open=tasks.filter(t=>!t.done),t0=today(),late=open.filter(t=>t.due&&t.due<t0),next=open.filter(t=>t.due).sort((a,b)=>a.due.localeCompare(b.due))[0];
  const days=lead.onboarded?Math.max(0,Math.floor((Date.now()-Date.parse(lead.onboarded))/86400000)):0,b=brands.find(x=>x.id===lead.brand);
  return <div className="client-dashboard">
    <a className="text-link back-link" href="#/clients"><ArrowLeft size={14}/>All clients</a>
    <div className="client-head">
      <span className="brand-logo" style={{background:b?.color}}>{b?.short}</span>
      <div><h2>{lead.name}</h2><p className="category">{brandName(lead.brand)} · client since {shortDate(lead.onboarded)}{lead.phone&&<> · {lead.phone}</>}</p><LabelChips ids={lead.labels} labels={crm.labels}/></div>
      <button className="secondary" onClick={()=>openLead(lead.id)}><PanelRight size={14}/>Edit card</button>
    </div>
    <ContactButtons lead={lead}/>
    <div className="summary-grid client-stats">
      <div className="stat-card"><div><span>CHECKLIST</span></div><strong>{tasks.length?Math.round(100*(tasks.length-open.length)/tasks.length):0}<small>% done</small></strong><p>{tasks.length-open.length} of {tasks.length} to-dos</p></div>
      <div className="stat-card"><div><span>OVERDUE</span></div><strong className={late.length?'warm-text':''}>{late.length}<small>to-dos</small></strong><p>{next?`Next due ${next.due===t0?'today':shortDate(next.due)}: ${next.title}`:'Nothing scheduled'}</p></div>
      <div className="stat-card"><div><span>CLIENT FOR</span></div><strong>{days}<small>day{days!==1?'s':''}</small></strong><p>Onboarded {shortDate(lead.onboarded)}</p></div>
      <div className="stat-card"><div><span>LAST ACTIVITY</span></div><strong className="stat-text">{ago(crm.lastActivity[lead.id]||lead.updated)}</strong><p>Comments, ManyChat and checklist</p></div>
    </div>
    <div className="client-columns">
      <div>
        <section className="panel pad"><ShortcutEditor lead={lead} act={act} tiles/></section>
        <section className="panel pad"><Checklist leadId={lead.id} crm={crm} act={act} title="Onboarding checklist" empty="Add the steps for this client, e.g. kick-off call, collect assets, send invoice."/></section>
      </div>
      <div>
        <section className="panel pad"><div className="checklist-head"><h3>Notes</h3></div><textarea className="notes-box" rows={7} maxLength={8000} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Scope, preferences, access details to remember (no passwords)…"/>{notes!==lead.notes&&<div className="form-save"><button className="secondary" onClick={()=>setNotes(lead.notes)}>Discard</button><button className="primary" onClick={()=>act({action:'lead.save',lead:{...lead,notes}})}>Save notes<Check size={14}/></button></div>}</section>
        <section className="panel pad"><ActivityFeed leadId={lead.id} act={act} stamp={lead.updated}/></section>
      </div>
    </div>
  </div>;
}
