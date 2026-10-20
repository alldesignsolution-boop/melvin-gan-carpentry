import { useCallback, useEffect, useState } from "react";
import { Check, Circle, Clock3, Mail, MessageCircle, Phone, Plus, Trash2, X, AtSign, Send } from "lucide-react";
import { brands, malaysiaDate, safeLink, whatsappLink } from "@/lib/domain.mjs";

export type Shortcut={id:string;label:string;url:string};
export type Lead={id:string;brand:string;name:string;phone:string;email:string;instagram:string;source:string;manychatId?:string;stage:string;position:number;value:number|null;notes:string;labels:string[];shortcuts:Shortcut[];extra:Record<string,string>;archived:boolean;created:string;updated:string;onboarded:string|null};
export type Task={id:string;leadId:string|null;title:string;due:string;done:boolean};
export type Label={id:string;name:string;color:string};
export type Crm={stages:{id:string;name:string}[];labelColors:string[];leads:Lead[];labels:Label[];tasks:Task[];lastActivity:Record<string,string>;manychatLast:string|null;webhook:{enabled:boolean;url:string}};
export type Act=(payload:any)=>Promise<any>;

export const emptyCrm:Crm={stages:[],labelColors:[],leads:[],labels:[],tasks:[],lastActivity:{},manychatLast:null,webhook:{enabled:false,url:''}};
export const today=()=>malaysiaDate();
export const brandName=(id:string)=>brands.find(b=>b.id===id)?.name||id;
export const shortDate=(v?:string|null)=>v?new Intl.DateTimeFormat('en-MY',{day:'numeric',month:'short',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(v.length===10?v+'T00:00:00+08:00':v)):'';
export const ago=(v?:string|null)=>{if(!v)return '';const m=Math.round((Date.now()-Date.parse(v))/60000);return m<1?'just now':m<60?`${m}m ago`:m<1440?`${Math.round(m/60)}h ago`:`${Math.round(m/1440)}d ago`};
export const money=(n:number)=>new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR',maximumFractionDigits:0}).format(n);

export function useCrm(){
  const [crm,setCrm]=useState<Crm>(emptyCrm),[loading,setLoading]=useState(true),[error,setError]=useState('');
  const load=useCallback(async()=>{setLoading(true);try{const r=await fetch('/api/crm',{cache:'no-store'}),v=await r.json();if(!r.ok)throw new Error(v.error);setCrm(v);setError('');}catch(e){setError(e instanceof Error?e.message:'Unable to load leads.');}finally{setLoading(false)}},[]);
  const act=useCallback<Act>(async payload=>{try{const r=await fetch('/api/crm',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),v=await r.json();if(!r.ok)throw new Error(v.error);setCrm(v);setError('');return v.result??true;}catch(e){setError(e instanceof Error?e.message:'Unable to save.');await load();return false;}},[load]);
  useEffect(()=>{load();const t=setInterval(()=>{if(document.visibilityState==='visible')load()},60000);return()=>clearInterval(t)},[load]);
  return {crm,setCrm,loading,error,setError,load,act};
}

export function LabelChips({ids,labels,compact}:{ids:string[];labels:Label[];compact?:boolean}){
  const list=ids.map(id=>labels.find(l=>l.id===id)).filter(Boolean) as Label[];
  if(!list.length)return null;
  return <div className={`label-chips ${compact?'compact':''}`}>{list.map(l=><span key={l.id} className={`label-chip c-${l.color}`} title={l.name}>{compact?'':l.name}</span>)}</div>;
}

export function LabelPicker({lead,crm,act}:{lead:Lead;crm:Crm;act:Act}){
  const [name,setName]=useState(''),[color,setColor]=useState('green'),[editing,setEditing]=useState(false);
  const toggle=(id:string)=>act({action:'lead.save',lead:{...lead,labels:lead.labels.includes(id)?lead.labels.filter(l=>l!==id):[...lead.labels,id]}});
  async function create(e:React.FormEvent){e.preventDefault();const id=await act({action:'label.save',label:{name,color}});if(id){setName('');await act({action:'lead.save',lead:{...lead,labels:[...lead.labels,id]}});}}
  return <div className="label-picker">
    <div className="label-options">{crm.labels.map(l=><span className="label-option" key={l.id}><button type="button" className={`label-chip c-${l.color} ${lead.labels.includes(l.id)?'on':''}`} onClick={()=>toggle(l.id)} aria-pressed={lead.labels.includes(l.id)}>{lead.labels.includes(l.id)&&<Check size={11}/>}{l.name}</button>{editing&&<button type="button" className="plain label-remove" aria-label={`Delete label ${l.name}`} onClick={()=>confirm(`Delete the “${l.name}” label from every lead?`)&&act({action:'label.delete',id:l.id})}><X size={12}/></button>}</span>)}{crm.labels.length>0&&<button type="button" className="text-link" onClick={()=>setEditing(!editing)}>{editing?'Done':'Manage'}</button>}</div>
    <form className="label-new" onSubmit={create}><input aria-label="New label name" placeholder="New label…" maxLength={40} value={name} onChange={e=>setName(e.target.value)}/><div className="swatches" role="radiogroup" aria-label="Label colour">{crm.labelColors.map(c=><button type="button" role="radio" aria-checked={color===c} aria-label={c} key={c} className={`swatch c-${c} ${color===c?'on':''}`} onClick={()=>setColor(c)}/>)}</div><button className="secondary" disabled={!name.trim()}><Plus size={13}/>Add</button></form>
  </div>;
}

export function Checklist({leadId,crm,act,title='Checklist',showLead,filter,empty}:{leadId:string|null;crm:Crm;act:Act;title?:string;showLead?:boolean;filter?:(t:Task)=>boolean;empty?:string}){
  const [draft,setDraft]=useState(''),[due,setDue]=useState('');
  const items=crm.tasks.filter(filter||(t=>t.leadId===leadId)),done=items.filter(t=>t.done).length,t0=today();
  const lead=(id:string|null)=>crm.leads.find(l=>l.id===id);
  async function add(e:React.FormEvent){e.preventDefault();if(await act({action:'task.save',task:{leadId,title:draft,due}})){setDraft('');setDue('')}}
  return <div className="checklist">
    <div className="checklist-head"><h3>{title}</h3>{items.length>0&&!showLead&&<span className="subtle">{done}/{items.length}</span>}</div>
    {items.length>0&&!showLead&&<div className="progress"><i style={{width:`${100*done/items.length}%`}}/></div>}
    {!items.length&&empty&&<p className="check-empty">{empty}</p>}
    {items.map(t=><div className={`check-item ${t.done?'done':''}`} key={t.id}>
      <button className="check-button" aria-label={`${t.done?'Reopen':'Complete'} ${t.title}`} onClick={()=>act({action:'task.save',task:{...t,done:!t.done}})}>{t.done?<Check size={13}/>:<Circle size={18}/>}</button>
      <div className="check-main"><span>{t.title}</span>{showLead&&lead(t.leadId)&&<a className="check-lead" href={`#/${lead(t.leadId)!.stage==='onboarded'?'clients':'leads'}/${t.leadId}`}>{lead(t.leadId)!.name}</a>}</div>
      {t.due&&<span className={`due ${t.due<t0&&!t.done?'late':''}`}><Clock3 size={11}/>{t.due===t0?'Today':shortDate(t.due)}</span>}
      <button className="plain icon-button" aria-label={`Delete ${t.title}`} onClick={()=>act({action:'task.delete',id:t.id})}><Trash2 size={14}/></button>
    </div>)}
    <form className="check-add" onSubmit={add}><input aria-label="New to-do" placeholder="Add a to-do…" maxLength={300} value={draft} onChange={e=>setDraft(e.target.value)}/><input type="date" aria-label="Due date" value={due} onChange={e=>setDue(e.target.value)}/><button className="secondary" disabled={!draft.trim()}><Plus size={13}/>Add</button></form>
  </div>;
}

export function ActivityFeed({leadId,act,stamp}:{leadId:string;act:Act;stamp?:string}){
  const [items,setItems]=useState<{id:number;at:string;kind:string;text:string}[]>([]),[draft,setDraft]=useState('');
  useEffect(()=>{let live=true;fetch(`/api/crm?activity=${encodeURIComponent(leadId)}`,{cache:'no-store'}).then(r=>r.json()).then(v=>{if(live)setItems(v.activity||[])}).catch(()=>{});return()=>{live=false}},[leadId,stamp]);
  async function send(e:React.FormEvent){e.preventDefault();if(await act({action:'comment.add',leadId,text:draft}))setDraft('');}
  return <div className="activity">
    <h3>Activity</h3>
    <form className="comment-add" onSubmit={send}><input aria-label="Write a comment" placeholder="Write a comment…" maxLength={4000} value={draft} onChange={e=>setDraft(e.target.value)}/><button className="secondary" disabled={!draft.trim()} aria-label="Post comment"><Send size={13}/></button></form>
    {items.map(a=><div className={`activity-item ${a.kind}`} key={a.id}><i/><div><p>{a.text}</p><small>{new Intl.DateTimeFormat('en-MY',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(a.at))}</small></div></div>)}
  </div>;
}

export function ContactButtons({lead}:{lead:Lead}){
  const wa=whatsappLink(lead.phone),ig=lead.instagram?`https://instagram.com/${encodeURIComponent(lead.instagram)}`:'';
  return <div className="contact-buttons">
    {wa&&<a className="secondary" href={wa} target="_blank" rel="noopener noreferrer"><MessageCircle size={14}/>WhatsApp</a>}
    {lead.phone&&<a className="secondary" href={`tel:${lead.phone.replace(/[^\d+]/g,'')}`}><Phone size={14}/>Call</a>}
    {lead.email&&<a className="secondary" href={`mailto:${lead.email}`}><Mail size={14}/>Email</a>}
    {ig&&<a className="secondary" href={ig} target="_blank" rel="noopener noreferrer"><AtSign size={14}/>Instagram</a>}
    {lead.shortcuts.filter(s=>safeLink(s.url)).slice(0,1).map(s=><a className="secondary" key={s.id} href={safeLink(s.url)} target="_blank" rel="noopener noreferrer">{s.label}</a>)}
  </div>;
}
