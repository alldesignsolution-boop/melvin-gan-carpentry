import { useCallback, useEffect, useMemo, useState } from "react";
import { Upload, SlidersHorizontal, PenLine, Trash2, TrendingUp, TrendingDown, Minus, ChevronDown, ChevronRight, TriangleAlert, CircleCheck, Lightbulb, FileSpreadsheet, Sparkles, X, Info, Rocket, CirclePause, Wrench, Gauge } from "lucide-react";
import { brands, malaysiaDate } from "@/lib/domain.mjs";
import { NUM, fieldLabels, platforms, objectives, parseAdsCsv, sumRows, groupRows, dailySeries, defaultBench, lowerIsBetter, groups, metricDefs, metricByKey, computeMetrics, healthScore, healthyText, diagnose, verdict, funnel, effectiveObjective, campaignAlerts, fmt, sampleRows, defaultTargets } from "@/lib/ads-metrics.mjs";
import type { Crm } from "./crm-shared";

type Row={brand:string;platform:string;date:string;dateTo:string;campaign:string;adset:string;ad:string;[k:string]:any};
type Targets=ReturnType<typeof defaultTargets>;
type AdsState={rows:Row[];range:{min:string|null;max:string|null};imports:{id:string;brand:string;platform:string;name:string;rows:number;from:string;to:string;created:string}[];targets:Record<string,Targets>};
const empty:AdsState={rows:[],range:{min:null,max:null},imports:[],targets:{}};
const addDays=(d:string,n:number)=>{const x=new Date(d+'T00:00:00Z');x.setUTCDate(x.getUTCDate()+n);return x.toISOString().slice(0,10)};
const daysBetween=(a:string,b:string)=>Math.round((Date.parse(b)-Date.parse(a))/86400000)+1;
const statusText:Record<string,string>={good:'Healthy',watch:'Watch',poor:'Below healthy',info:'',na:'No data'};
const presets=[['7','Last 7 days'],['14','Last 14 days'],['30','Last 30 days'],['90','Last 90 days'],['month','This month'],['lastmonth','Last month'],['all','All time'],['custom','Custom']];
const brandName=(id:string)=>brands.find(b=>b.id===id)?.name||'All brands';
const myt=(iso:string)=>malaysiaDate(iso);
const shortDay=(d:string)=>new Intl.DateTimeFormat('en-MY',{day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(d+'T00:00:00Z'));
const kpiKeys:Record<string,string[]>={
  sales:['spend','revenue','roas','cpa','purchases','cvr','ctr','cpm'],
  leads:['spend','leads','cpl','leadCvr','ctr','hookRate','cac','closeRate'],
  messages:['spend','conversations','costPerConv','convRate','ctr','hookRate','cac','closeRate'],
};
const trendKeys=['roas','cpa','cpl','costPerConv','ctr','cpm','cpc','hookRate','frequency','convRate','leadCvr','cvr'];

async function post(payload:any){const r=await fetch('/api/ads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}),v=await r.json();if(!r.ok)throw new Error(v.error||'Unable to save.');return v.result;}

function useRange(preset:string,custom:{from:string;to:string},range:AdsState['range']){
  const today=malaysiaDate();
  let from=today,to=today;
  if(/^\d+$/.test(preset)){to=addDays(today,-1);from=addDays(to,-(Number(preset)-1));}
  else if(preset==='month'){from=today.slice(0,8)+'01';}
  else if(preset==='lastmonth'){to=addDays(today.slice(0,8)+'01',-1);from=to.slice(0,8)+'01';}
  else if(preset==='all'){from=range.min||addDays(today,-29);to=range.max&&range.max>today?range.max:today;}
  else if(preset==='custom'&&custom.from&&custom.to&&custom.from<=custom.to){from=custom.from;to=custom.to;}
  const len=daysBetween(from,to),pTo=addDays(from,-1),pFrom=addDays(pTo,-(len-1));
  return {from,to,pFrom,pTo,len,compare:preset!=='all'};
}

function Pill({s}:{s:string}){return statusText[s]?<span className={`hp hp-${s}`}><i/>{statusText[s]}</span>:null}
function Delta({def,cur,prev}:{def:any;cur:number|null;prev:number|null}){
  if(cur==null||prev==null||!prev)return <span className="delta none">—</span>;
  const ch=100*(cur-prev)/Math.abs(prev),better=def.target||lowerIsBetter.has(def.bench)?ch<0:ch>0,neutral=!def.bench&&!def.target&&!def.roas&&!def.sign;
  const Icon=Math.abs(ch)<0.5?Minus:ch>0?TrendingUp:TrendingDown;
  return <span className={`delta ${neutral||Math.abs(ch)<0.5?'flat':better?'up':'down'}`}><Icon size={12}/>{ch>0?'+':''}{Math.abs(ch)>=100?Math.round(ch):ch.toFixed(1)}%</span>;
}
function Spark({values,s}:{values:(number|null)[];s:string}){
  const pts=values.map((v,i)=>[i,v]).filter(([,v])=>v!=null) as [number,number][];
  if(pts.length<2)return <svg className="spark" viewBox="0 0 100 28"/>;
  const max=Math.max(...pts.map(p=>p[1])),min=Math.min(...pts.map(p=>p[1])),n=values.length-1||1;
  const d=pts.map(([i,v],j)=>`${j?'L':'M'}${(100*i/n).toFixed(1)},${(25-21*(max===min?0.5:(v-min)/(max-min))).toFixed(1)}`).join(' ');
  return <svg className={`spark sp-${s}`} viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true"><path d={d+` L100,28 L0,28 Z`} className="spark-fill"/><path d={d} className="spark-line"/></svg>;
}
function ScoreRing({score}:{score:number|null}){
  const r=46,c=2*Math.PI*r,s=score??0,cls=score==null?'na':s>=75?'good':s>=50?'watch':'poor';
  return <div className={`score-ring sr-${cls}`}><svg viewBox="0 0 110 110" aria-hidden="true"><circle cx="55" cy="55" r={r} className="ring-bg"/><circle cx="55" cy="55" r={r} className="ring-fg" strokeDasharray={`${c*s/100} ${c}`} transform="rotate(-90 55 55)"/></svg><div><strong>{score??'—'}</strong><small>/ 100</small></div></div>;
}

function TrendChart({series,metric,targets}:{series:{date:string;totals:any}[];metric:string;targets:Targets}){
  const W=720,H=230,L=46,R=46,T=14,B=28,iw=W-L-R,ih=H-T-B,def=metricByKey[metric];
  const spend=series.map(d=>d.totals.spend),line=series.map(d=>computeMetrics(d.totals,{targets})[metric].value);
  const maxS=Math.max(1,...spend),vals=line.filter(v=>v!=null) as number[],maxL=vals.length?Math.max(...vals)*1.15:1;
  const bw=iw/Math.max(1,series.length),x=(i:number)=>L+bw*i+bw/2,yS=(v:number)=>T+ih-ih*v/maxS,yL=(v:number)=>T+ih-ih*v/maxL;
  let path='',pen=false;line.forEach((v,i)=>{if(v==null){pen=false;return}path+=`${pen?'L':'M'}${x(i).toFixed(1)},${yL(v).toFixed(1)} `;pen=true});
  const bench=def.roas?targets.targetRoas:def.target?targets[def.target as keyof Targets] as number:def.bench?(targets.bench?.[def.bench]||(defaultBench as any)[def.bench])[0]:null;
  const ticks=series.length?[0,Math.floor((series.length-1)/2),series.length-1]:[];
  return <svg className="trend" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Daily spend and ${def.label}`}>
    {[0,.5,1].map(f=><line key={f} x1={L} x2={W-R} y1={T+ih*f} y2={T+ih*f} className="grid"/>)}
    {series.map((d,i)=><rect key={d.date} x={x(i)-Math.max(1,bw*.32)} width={Math.max(2,bw*.64)} y={yS(spend[i])} height={T+ih-yS(spend[i])} rx="1.5" className="bar"><title>{`${shortDay(d.date)} · ${fmt(spend[i],'money')} · ${def.label} ${fmt(line[i],def.fmt)}`}</title></rect>)}
    {bench!=null&&bench<maxL&&<><line x1={L} x2={W-R} y1={yL(bench)} y2={yL(bench)} className="bench"/><text x={W-R+4} y={yL(bench)+3} className="ax bench-t">target</text></>}
    {path&&<path d={path} className="tline"/>}
    {line.map((v,i)=>v!=null&&series.length<=45?<circle key={i} cx={x(i)} cy={yL(v)} r="2.2" className="tdot"/>:null)}
    <text x={L-6} y={T+4} className="ax" textAnchor="end">{fmt(maxS,'money')}</text><text x={L-6} y={T+ih} className="ax" textAnchor="end">RM0</text>
    <text x={W-R+6} y={T+4} className="ax ax-l">{fmt(maxL,def.fmt)}</text>
    {ticks.map(i=><text key={i} x={x(i)} y={H-8} className="ax" textAnchor="middle">{shortDay(series[i].date)}</text>)}
  </svg>;
}

function Funnel({steps,m}:{steps:ReturnType<typeof funnel>;m:any}){
  const max=Math.max(1,...steps.map(s=>s.value));
  return <div className="funnel">{steps.map((s,i)=>{const st=s.metric?m[s.metric]?.status:'info',w=s.value?Math.max(6,100*Math.log10(s.value+1)/Math.log10(max+1)):2;return <div className="f-step" key={s.label}>
    <div className="f-label"><span>{s.label}</span><strong>{fmt(s.value,'int')}</strong></div>
    <div className="f-track"><i className={`f-bar fb-${i===0?'info':st}`} style={{width:`${w}%`}}/></div>
    <div className="f-rate">{i===0?<small>Top of funnel</small>:s.metric&&m[s.metric]?.value!=null?<><b className={`t-${st}`}>{fmt(m[s.metric].value,'pct')}</b><small>{metricByKey[s.metric].label.split(' (')[0]}</small></>:s.rate!=null?<><b>{fmt(s.rate,'pct')}</b><small>of previous step</small></>:<small>—</small>}</div>
  </div>})}</div>;
}

function Insight({x,open}:{x:any;open?:boolean}){
  const [o,setO]=useState(!!open),Icon=x.severity==='good'?Rocket:x.severity==='poor'?TriangleAlert:Lightbulb;
  return <article className={`insight in-${x.severity}`}><button className="insight-head" onClick={()=>setO(!o)} aria-expanded={o}><span className="in-icon"><Icon size={16}/></span><span className="in-main"><strong>{x.title}</strong><small>{x.keys.map((k:string)=>metricByKey[k]?.label.split(' (')[0]).join(' · ')}</small></span>{o?<ChevronDown size={15}/>:<ChevronRight size={15}/>}</button>
    {o&&<div className="insight-body"><p>{x.detail}</p><h4>What to do</h4><ol>{x.actions.map((a:string)=><li key={a}>{a}</li>)}</ol></div>}</article>;
}

function Modal({title,onClose,children,wide}:{title:string;onClose:()=>void;children:React.ReactNode;wide?:boolean}){
  useEffect(()=>{const k=(e:KeyboardEvent)=>{if(e.key==='Escape')onClose()};addEventListener('keydown',k);return()=>removeEventListener('keydown',k)},[onClose]);
  return <div className="modal-backdrop" onClick={onClose}><section role="dialog" aria-modal="true" aria-label={title} className={`modal ads-modal ${wide?'wide':''}`} onClick={e=>e.stopPropagation()}><button className="modal-close" aria-label="Close" onClick={onClose}><X size={20}/></button><div className="eyebrow">AD PERFORMANCE</div><h2>{title}</h2>{children}</section></div>;
}

function ImportModal({brand,targets,onClose,onDone}:{brand:string;targets:Record<string,Targets>;onClose:()=>void;onDone:(msg:string)=>void}){
  const [b,setB]=useState(brand==='all'?'hoga':brand),[platform,setPlatform]=useState('meta'),[file,setFile]=useState<{name:string;text:string}|null>(null),[from,setFrom]=useState(''),[to,setTo]=useState(''),[busy,setBusy]=useState(false),[err,setErr]=useState('');
  const objective=(targets[b]||defaultTargets(b)).objective;
  const parsed=useMemo(()=>file?parseAdsCsv(file.text,{platform,objective,from,to}):null,[file,platform,objective,from,to]);
  const t=parsed?sumRows(parsed.rows):null,dates=parsed?.rows.map(r=>r.date).sort()||[];
  async function run(){if(!parsed?.rows.length)return;setBusy(true);setErr('');try{let id='';for(let i=0;i<parsed.rows.length;i+=2000)id=await post({action:'rows.import',brand:b,platform,name:file!.name,importId:id||undefined,rows:parsed.rows.slice(i,i+2000)});onDone(`Imported ${parsed.rows.length} rows from ${file!.name}.`);}catch(e){setErr(e instanceof Error?e.message:'Import failed.');}finally{setBusy(false)}}
  return <Modal title="Import an ads report" onClose={onClose} wide>
    <div className="form-grid"><label>Brand<select value={b} onChange={e=>setB(e.target.value)}>{brands.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Platform<select value={platform} onChange={e=>setPlatform(e.target.value)}>{platforms.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
    <label className="drop"><FileSpreadsheet size={22}/><span>{file?file.name:'Choose a CSV export'}</span><small>Meta Ads Manager, Google Ads or TikTok Ads · .csv (save Excel files as CSV first)</small><input type="file" accept=".csv,.tsv,.txt,text/csv" onChange={async e=>{const f=e.target.files?.[0];if(f){if(f.size>20e6){setErr('That file is over 20 MB. Export a shorter period.');return;}setErr('');const text=await f.text(),head=(f.name+' '+text.slice(0,3000)).toLowerCase();setPlatform(/tiktok|2-second video views|clicks \(destination\)|complete payment/.test(head)?'tiktok':/google|impr\.|conv\. value|ad group/.test(head)?'google':/amount spent|reporting starts|thruplays|ad set name/.test(head)?'meta':platform);setFile({name:f.name,text})}}}/></label>
    <details className="howto"><summary>How to export from Meta Ads Manager</summary><ol><li>Ads Manager → choose the Campaigns, Ad sets or <b>Ads</b> tab (Ads gives the most detail).</li><li>Columns → Customise columns: add Amount spent, Impressions, Reach, Link clicks, Landing page views, 3-second video plays, ThruPlays, Video plays at 25/50/75/100%, Post engagements, Messaging conversations started, Leads, Adds to cart, Checkouts initiated, Purchases, Purchases conversion value.</li><li>Breakdown → By time → <b>Day</b> (gives daily trends).</li><li>Reports → Export table data → <b>.csv</b>.</li></ol><p className="source-note">Re-importing an overlapping period replaces matching rows — it never double counts.</p></details>
    {parsed&&<div className="preview">
      {parsed.warnings.map(w=><p className="warm-text" key={w}><Info size={13}/> {w}</p>)}
      {parsed.columns.length>0&&!parsed.columns.includes('date')&&<div className="form-grid"><label>Period start<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label>Period end<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label></div>}
      {parsed.rows.length>0&&<><div className="preview-stats"><div><span>Rows</span><strong>{parsed.rows.length}</strong>{parsed.skipped>0&&<small>{parsed.skipped} skipped (totals/blank)</small>}</div><div><span>Period</span><strong>{shortDay(dates[0])} – {shortDay(dates.at(-1)!)}</strong></div><div><span>Spend</span><strong>{fmt(t!.spend,'money')}</strong></div><div><span>Impressions</span><strong>{fmt(t!.impressions,'int')}</strong></div></div>
      <p className="source-note">Columns found: {parsed.columns.filter(c=>NUM.includes(c)).map(c=>fieldLabels[c as keyof typeof fieldLabels]).join(' · ')}</p>
      {NUM.filter(k=>!parsed.columns.includes(k)&&['clicks','lpv','v3s','thruplay','reach'].includes(k)).length>0&&<p className="source-note">Not in this file (those metrics will show “No data”): {NUM.filter(k=>!parsed.columns.includes(k)&&['clicks','lpv','v3s','thruplay','reach'].includes(k)).map(k=>fieldLabels[k as keyof typeof fieldLabels]).join(', ')}.</p>}</>}
    </div>}
    {err&&<p className="warm-text" role="alert">{err}</p>}
    <div className="modal-actions"><button className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy||!parsed?.rows.length} onClick={run}><Upload size={15}/>{busy?'Importing…':parsed?.rows.length?`Import ${parsed.rows.length} rows`:'Import'}</button></div>
  </Modal>;
}

function ManualModal({brand,onClose,onDone}:{brand:string;onClose:()=>void;onDone:(msg:string)=>void}){
  const y=addDays(malaysiaDate(),-1);
  const [v,setV]=useState<any>({brand:brand==='all'?'hoga':brand,platform:'meta',date:y,dateTo:y,campaign:'',adset:'',ad:''}),[busy,setBusy]=useState(false),[err,setErr]=useState('');
  const set=(k:string,x:any)=>setV((o:any)=>({...o,[k]:x}));
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setErr('');try{await post({action:'rows.import',brand:v.brand,platform:v.platform,name:`Manual · ${v.campaign||'entry'}`,rows:[{...v,...Object.fromEntries(NUM.map(k=>[k,v[k]===''||v[k]==null?null:Number(v[k])]))}]});onDone('Numbers saved.');}catch(e){setErr(e instanceof Error?e.message:'Unable to save.');}finally{setBusy(false)}}
  const sections:[string,string[]][]=[['Delivery',['spend','impressions','reach','clicks','clicksAll','lpv']],['Video & engagement',['v3s','thruplay','v25','v50','v75','v100','engagements']],['Results',['conversations','leads','atc','checkouts','purchases','revenue']]];
  return <Modal title="Add numbers by hand" onClose={onClose} wide><form onSubmit={save}>
    <div className="form-grid four"><label>Brand<select value={v.brand} onChange={e=>set('brand',e.target.value)}>{brands.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Platform<select value={v.platform} onChange={e=>set('platform',e.target.value)}>{platforms.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><label>From<input type="date" required value={v.date} onChange={e=>set('date',e.target.value)}/></label><label>To<input type="date" required value={v.dateTo} min={v.date} onChange={e=>set('dateTo',e.target.value)}/></label></div>
    <div className="form-grid three"><label>Campaign<input required maxLength={200} value={v.campaign} onChange={e=>set('campaign',e.target.value)}/></label><label>Ad set (optional)<input maxLength={200} value={v.adset} onChange={e=>set('adset',e.target.value)}/></label><label>Ad (optional)<input maxLength={200} value={v.ad} onChange={e=>set('ad',e.target.value)}/></label></div>
    {sections.map(([h,keys])=><fieldset key={h}><legend>{h}</legend><div className="form-grid four">{keys.map(k=><label key={k}>{fieldLabels[k as keyof typeof fieldLabels]}<input type="number" min="0" step="any" inputMode="decimal" value={v[k]??''} onChange={e=>set(k,e.target.value)}/></label>)}</div></fieldset>)}
    <p className="source-note">Leave anything you don’t track blank. Saving the same campaign, ad set, ad and dates again replaces the earlier numbers.</p>
    {err&&<p className="warm-text" role="alert">{err}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?'Saving…':'Save numbers'}</button></div>
  </form></Modal>;
}

const benchLabels:Record<string,string>={cpm:'CPM (RM, max)',frequency:'Frequency (max)',ctr:'CTR link %',ctrAll:'CTR all %',cpc:'CPC (RM, max)',hookRate:'Hook rate %',holdRate:'Hold rate %',completionRate:'Video completion %',engagementRate:'Engagement rate %',lpvRate:'Landing page view rate %',convRate:'Click → chat %',leadCvr:'Lead conversion %',atcRate:'Add-to-cart %',checkoutRate:'Cart → checkout %',purchaseRate:'Checkout completion %',cvr:'Purchase conversion %',closeRate:'Lead → client %'};
function TargetsModal({brand,targets,onClose,onDone}:{brand:string;targets:Targets;onClose:()=>void;onDone:(msg:string)=>void}){
  const [v,setV]=useState<Targets>(JSON.parse(JSON.stringify(targets))),[busy,setBusy]=useState(false),[err,setErr]=useState('');
  const set=(k:string,x:any)=>setV(o=>({...o,[k]:x}));
  const bench=(k:string)=>(v.bench as any)?.[k]||(defaultBench as any)[k];
  async function save(e:React.FormEvent){e.preventDefault();setBusy(true);setErr('');try{await post({action:'targets.save',brand,targets:v});onDone('Targets saved.');}catch(e){setErr(e instanceof Error?e.message:'Unable to save.');}finally{setBusy(false)}}
  return <Modal title={`Targets & healthy levels · ${brandName(brand)}`} onClose={onClose} wide><form onSubmit={save}>
    <p className="source-note">These decide when a metric shows as Healthy, Watch or Below healthy, and which numbers lead the dashboard.</p>
    <div className="form-grid four"><label>Main goal<select value={v.objective} onChange={e=>set('objective',e.target.value)}>{objectives.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label><label>Gross margin %<input type="number" min="1" max="100" step="any" value={v.margin} onChange={e=>set('margin',e.target.value)}/><small>Break-even ROAS {(100/Number(v.margin||1)).toFixed(2)}×</small></label><label>Target ROAS ×<input type="number" min="0.1" step="any" value={v.targetRoas} onChange={e=>set('targetRoas',e.target.value)}/></label><label>Target cost / purchase RM<input type="number" min="0.01" step="any" value={v.targetCpa} onChange={e=>set('targetCpa',e.target.value)}/></label><label>Target cost / lead RM<input type="number" min="0.01" step="any" value={v.targetCpl} onChange={e=>set('targetCpl',e.target.value)}/></label><label>Target cost / chat RM<input type="number" min="0.01" step="any" value={v.targetCpConv} onChange={e=>set('targetCpConv',e.target.value)}/></label><label>Target cost / client RM<input type="number" min="0.01" step="any" value={v.targetCac} onChange={e=>set('targetCac',e.target.value)}/></label></div>
    <fieldset><legend>Healthy levels <button type="button" className="text-link" onClick={()=>set('bench',{})}>Reset to defaults</button></legend><div className="bench-grid"><span/><b>Healthy</b><b>Watch until</b>{Object.keys(defaultBench).map(k=><div className="bench-row" key={k}><span>{benchLabels[k]}</span>{[0,1].map(i=><input key={i} aria-label={`${benchLabels[k]} ${i?'watch':'healthy'} level`} type="number" min="0" step="any" value={bench(k)[i]} onChange={e=>{const b=[...bench(k)];b[i]=e.target.value;set('bench',{...v.bench,[k]:b})}}/>)}</div>)}</div><p className="source-note">For “max” rows lower is better; for the rest higher is better. Past the watch level a metric shows as Below healthy.</p></fieldset>
    {err&&<p className="warm-text" role="alert">{err}</p>}
    <div className="modal-actions"><button type="button" className="secondary" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy?'Saving…':'Save targets'}</button></div>
  </form></Modal>;
}

export default function AdsPerformance({brand,crm,tick}:{brand:string;crm:Crm;tick:number}){
  const [data,setData]=useState<AdsState>(empty),[loading,setLoading]=useState(true),[err,setErr]=useState(''),[notice,setNotice]=useState('');
  const [preset,setPreset]=useState(()=>{try{return localStorage.getItem('hq-ads-range')||'30'}catch{return '30'}}),[custom,setCustom]=useState({from:'',to:''}),[platform,setPlatform]=useState('all'),[level,setLevel]=useState('campaign');
  const [sample,setSample]=useState(false),[modal,setModal]=useState(''),[openRows,setOpenRows]=useState<Set<string>>(new Set()),[showEmpty,setShowEmpty]=useState(false),[trend,setTrend]=useState('');
  const sampleData=useMemo(()=>sample?sampleRows(addDays(malaysiaDate(),-1),120).map(r=>({...r,brand:brand==='all'?'hoga':brand})):null,[sample,brand]);
  const range=useRange(preset,custom,sampleData?{min:sampleData[0].date,max:sampleData.at(-1)!.date}:data.range);
  const load=useCallback(async()=>{setLoading(true);try{const q=new URLSearchParams({brand});const r=await fetch('/api/ads?'+q,{cache:'no-store'}),v=await r.json();if(!r.ok)throw new Error(v.error);setData(v);setErr('');}catch(e){setErr(e instanceof Error?e.message:'Unable to load ad data.');}finally{setLoading(false)}},[brand]);
  useEffect(()=>{load()},[load,tick]);
  useEffect(()=>{try{localStorage.setItem('hq-ads-range',preset)}catch{}},[preset]);
  const saved:Targets=data.targets[brand]||defaultTargets(brand),allRows:Row[]=sampleData||data.rows;
  const inP=(r:Row)=>platform==='all'||r.platform===platform;
  const cur=useMemo(()=>allRows.filter(r=>inP(r)&&r.date>=range.from&&r.date<=range.to),[allRows,platform,range.from,range.to]);
  const prev=useMemo(()=>range.compare?allRows.filter(r=>inP(r)&&r.date>=range.pFrom&&r.date<=range.pTo):[],[allRows,platform,range.pFrom,range.pTo,range.compare]);
  const crmStats=(from:string,to:string)=>{const ls=crm.leads.filter(l=>(brand==='all'||l.brand===brand)&&!l.archived),c=ls.filter(l=>l.onboarded&&myt(l.onboarded)>=from&&myt(l.onboarded)<=to);return {leads:ls.filter(l=>myt(l.created)>=from&&myt(l.created)<=to).length,clients:c.length,value:c.reduce((s,l)=>s+(l.value||0),0)}};
  const crmCur=sample?{leads:Math.round(sumRows(cur).conversations*0.7),clients:Math.round(sumRows(cur).conversations*0.04),value:Math.round(sumRows(cur).conversations*0.04)*38000}:crmStats(range.from,range.to);
  const crmPrev=sample?{leads:Math.round(sumRows(prev).conversations*0.7),clients:Math.round(sumRows(prev).conversations*0.05),value:Math.round(sumRows(prev).conversations*0.05)*38000}:crmStats(range.pFrom,range.pTo);
  const curT=useMemo(()=>sumRows(cur),[cur]),prevT=useMemo(()=>sumRows(prev),[prev]);
  const objective=effectiveObjective(curT,saved.objective),targets:Targets=useMemo(()=>({...saved,objective}),[saved,objective]);
  const m=computeMetrics(curT,{targets,crm:crmCur}),pm=range.compare&&prev.length?computeMetrics(prevT,{targets,crm:crmPrev}):null;
  const accountScore=healthScore(m),rank:Record<string,number>={poor:0,watch:1,good:2};
  const alerts=campaignAlerts(groupRows(cur,'campaign'),curT.spend,targets),insights=[...diagnose(m,{targets,prev:pm}),...alerts].sort((a:any,b:any)=>rank[a.severity]-rank[b.severity]);
  const series=useMemo(()=>dailySeries(cur,range.from,range.to),[cur,range.from,range.to]);
  const daily=useMemo(()=>series.map(d=>computeMetrics(d.totals,{targets})),[series,targets]);
  const rowsBy=useMemo(()=>groupRows(cur,level).map(g=>({...g,v:verdict(g.totals,targets)})).sort((a,b)=>b.totals.spend-a.totals.spend),[cur,level,targets]);
  const score=accountScore==null?null:Math.max(0,accountScore-6*alerts.length);
  const counts={good:0,watch:0,poor:0};Object.values(m).forEach((x:any)=>{if(x.status in counts)(counts as any)[x.status]++});
  const resultKey=targets.objective==='sales'?'roas':targets.objective==='messages'?'costPerConv':'cpl',trendMetric=trend||resultKey;
  const hasData=allRows.length>0,brandImports=data.imports.filter(i=>brand==='all'||i.brand===brand);
  const done=async(msg:string)=>{if(modal!=='targets')setSample(false);setModal('');setNotice(msg);await load();};
  const toggle=(k:string)=>setOpenRows(s=>{const n=new Set(s);n.has(k)?n.delete(k):n.add(k);return n});
  const scoreWord=score==null?'Not enough data':score>=75?'Healthy':score>=50?'Needs work':'Needs attention now';

  return <div className="ads">
    <div className="ads-toolbar">
      <div className="seg" role="tablist" aria-label="Date range">{presets.map(([id,l])=><button key={id} role="tab" aria-selected={preset===id} className={preset===id?'on':''} onClick={()=>setPreset(id)}>{l}</button>)}</div>
      {preset==='custom'&&<div className="custom-range"><input type="date" aria-label="From" value={custom.from} onChange={e=>setCustom(c=>({...c,from:e.target.value}))}/><span>–</span><input type="date" aria-label="To" value={custom.to} onChange={e=>setCustom(c=>({...c,to:e.target.value}))}/></div>}
      <select className="mini-select" aria-label="Platform" value={platform} onChange={e=>setPlatform(e.target.value)}><option value="all">All platforms</option>{platforms.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select>
      <div className="ads-actions"><button className="secondary" onClick={()=>setModal('targets')}><SlidersHorizontal size={14}/>Targets</button><button className="secondary" onClick={()=>setModal('manual')}><PenLine size={14}/>Add numbers</button><button className="primary" onClick={()=>setModal('import')}><Upload size={14}/>Import report</button></div>
    </div>
    <p className="range-note">{shortDay(range.from)} – {shortDay(range.to)} · {range.len} day{range.len>1?'s':''}{range.compare&&<> · compared with {shortDay(range.pFrom)} – {shortDay(range.pTo)}</>} · Goal: {objectives.find(o=>o.id===targets.objective)?.name}{objective!==saved.objective&&' (detected from your data — set it in Targets)'} · {brandName(brand)}</p>
    {err&&<div className="alert" role="alert"><TriangleAlert size={17}/><span>{err}</span><button className="plain" onClick={()=>setErr('')} aria-label="Dismiss"><X size={15}/></button></div>}
    {notice&&<div className="notice" role="status">{notice}<button className="plain" onClick={()=>setNotice('')} aria-label="Dismiss notice"><X size={15}/></button></div>}
    {sample&&<div className="sample-banner"><Sparkles size={15}/><span><b>Sample data.</b> A made-up interior-design account to show how the dashboard reads. Nothing is saved.</span><button className="secondary" onClick={()=>setSample(false)}>Exit preview</button></div>}

    {!hasData?<section className="panel"><div className="empty ads-empty"><span className="empty-icon"><Gauge size={24}/></span><h3>{loading?'Loading ad data…':'Bring in your ad numbers'}</h3><p>Import a CSV from Meta Ads Manager, Google Ads or TikTok, or type the numbers in. Every metric is then checked against a healthy level, with what to fix when one slips.</p><div className="empty-actions"><button className="primary" onClick={()=>setModal('import')}><Upload size={14}/>Import report</button><button className="secondary" onClick={()=>setSample(true)}><Sparkles size={14}/>Preview with sample data</button></div></div></section>
    :!cur.length?<section className="panel"><div className="empty ads-empty"><span className="empty-icon"><Info size={22}/></span><h3>No ad data in this period</h3><p>{data.range.min?`Your data covers ${shortDay(data.range.min)} – ${shortDay(data.range.max!)}. Pick another range or import a newer report.`:'Pick another range or platform.'}</p><div className="empty-actions"><button className="secondary" onClick={()=>setPreset('all')}>Show all time</button></div></div></section>
    :<>
    <section className="health-hero panel">
      <div className="hero-score"><ScoreRing score={score}/><div><div className="eyebrow">ACCOUNT HEALTH</div><h2>{scoreWord}</h2><p>{counts.good} healthy · {counts.watch} to watch · {counts.poor} below healthy{alerts.length>0&&<> · {alerts.length} campaign{alerts.length>1?'s':''} with a weak spot</>}</p><div className="hero-bar">{(['good','watch','poor'] as const).map(k=><i key={k} className={`hb-${k}`} style={{flex:counts[k]||0}}/>)}</div></div></div>
      <div className="hero-priorities"><h3><Lightbulb size={15}/>Top priorities</h3>{insights.filter(x=>x.severity!=='good').slice(0,3).map((x,i)=><div className={`prio pr-${x.severity}`} key={x.title}><span className="pr-n">{i+1}</span><div><strong>{x.title}</strong><p>{x.detail}</p><small><Wrench size={11}/> {x.actions[0]}</small></div></div>)}{!insights.some(x=>x.severity!=='good')&&<div className="prio pr-good"><span className="pr-n"><CircleCheck size={14}/></span><div><strong>Everything measured is within healthy levels</strong><p>{insights[0]?.detail||'Keep testing new creatives so it stays that way.'}</p></div></div>}</div>
    </section>

    <div className="kpi-grid-ads">{kpiKeys[targets.objective].map(k=>{const d=metricByKey[k],x=m[k];return <div className={`kpi k-${x.status}`} key={k}>
      <div className="kpi-top"><span>{d.label.split(' (')[0]}</span><Pill s={x.status}/></div>
      <strong>{fmt(x.value,d.fmt)}</strong>
      <div className="kpi-foot"><Delta def={d} cur={x.value} prev={pm?.[k]?.value??null}/><small>{healthyText(d,targets)?`Healthy ${healthyText(d,targets)}`:range.compare?'vs previous period':''}</small></div>
      <Spark values={daily.map(dm=>dm[k].value)} s={x.status}/>
    </div>})}</div>

    <div className="ads-two">
      <section className="panel"><div className="panel-heading"><h2>Daily trend</h2><select className="mini-select" aria-label="Line metric" value={trendMetric} onChange={e=>setTrend(e.target.value)}>{trendKeys.filter(k=>m[k].value!=null).map(k=><option key={k} value={k}>{metricByKey[k].label.split(' (')[0]}</option>)}</select></div><div className="trend-wrap"><TrendChart series={series} metric={m[trendMetric]?.value!=null?trendMetric:'ctr'} targets={targets}/><div className="legend"><span><i className="lg-bar"/>Spend</span><span><i className="lg-line"/>{metricByKey[m[trendMetric]?.value!=null?trendMetric:'ctr'].label.split(' (')[0]}</span><span><i className="lg-bench"/>Target / healthy level</span></div></div></section>
      <section className="panel"><div className="panel-heading"><h2>Funnel · where people drop off</h2><span className="subtle">Bars on a log scale</span></div><Funnel steps={funnel(curT,targets.objective,crmCur)} m={m}/></section>
    </div>

    <section className="panel"><div className="panel-heading"><div><h2>Full metric scorecard</h2><p className="subtle">Every number judged against its healthy level. Open a row for what it means and what to do.</p></div>{metricDefs.some(d=>m[d.key].value==null)&&<button className="text-link" onClick={()=>setShowEmpty(!showEmpty)}>{showEmpty?'Hide':'Show'} {metricDefs.filter(d=>m[d.key].value==null).length} metrics without data</button>}</div>
      <div className="scorecard">{groups.map(g=>{const defs=metricDefs.filter(d=>d.group===g.id&&(showEmpty||m[d.key].value!=null));if(!defs.length)return null;return <div className="sc-group" key={g.id}>
        <div className="sc-head"><h3>{g.name}</h3><span>{g.q}</span></div>
        <div className="sc-table" role="table"><div className="sc-row sc-th" role="row"><span>Metric</span><span>This period</span><span>Previous</span><span>Change</span><span>Healthy level</span><span>Status</span><span/></div>
        {defs.map(d=>{const x=m[d.key],open=openRows.has(d.key),canOpen=!!(d.what);return <div key={d.key} className={`sc-item ${open?'open':''}`}><div className={`sc-row s-${x.status}`} role="row" onClick={()=>canOpen&&toggle(d.key)}>
          <span className="sc-name">{d.label}</span><span className="sc-val">{fmt(x.value,d.fmt)}</span><span className="sc-prev">{pm?fmt(pm[d.key].value,d.fmt):'—'}</span><span><Delta def={d} cur={x.value} prev={pm?.[d.key]?.value??null}/></span><span className="sc-bench">{healthyText(d,targets)||'—'}</span><span><Pill s={x.status}/></span><span className="sc-chev">{(x.status==='poor'||x.status==='watch')&&d.fixes?<b className="fix-tag">What to do</b>:null}{open?<ChevronDown size={14}/>:<ChevronRight size={14}/>}</span></div>
          {open&&<div className="sc-detail"><p><b>What it measures.</b> {d.what}</p>{x.note&&<p className="warm-text">{x.note}</p>}{d.low&&<p><b>{x.status==='poor'||x.status==='watch'?'Why it’s low':'If it slips'}.</b> {d.low}</p>}{d.fixes&&<><h4>{x.status==='poor'||x.status==='watch'?'What to do now':'How to keep it healthy'}</h4><ul>{d.fixes.map((f:string)=><li key={f}>{f}</li>)}</ul></>}</div>}
        </div>})}</div></div>})}</div>
    </section>

    <section className="panel"><div className="panel-heading"><div><h2>Campaign breakdown</h2><p className="subtle">What to do with each — sorted by spend.</p></div><div className="seg small">{[['campaign','Campaigns'],['adset','Ad sets'],['ad','Ads']].map(([id,l])=><button key={id} className={level===id?'on':''} onClick={()=>setLevel(id)}>{l}</button>)}</div></div>
      <div className="table-scroll"><table className="camp-table"><thead><tr><th>Name</th><th>Spend</th><th>Share</th><th>CPM</th><th>Freq.</th><th>Hook</th><th>CTR</th><th>LPV rate</th><th>Results</th><th>{targets.objective==='sales'?'ROAS':'Cost / result'}</th><th>Verdict</th></tr></thead><tbody>{rowsBy.map(g=>{const t=g.totals,v=g.v,res=targets.objective==='sales'?t.purchases:targets.objective==='messages'?(t.conversations||t.leads):(t.leads||t.conversations),VIcon=v.id==='scale'?Rocket:v.id==='pause'?CirclePause:v.id==='fix'?TriangleAlert:v.id==='optimise'?Wrench:Info;const cell=(k:string)=><td className={`t-${v.m[k].status}`}>{fmt(v.m[k].value,metricByKey[k].fmt)}</td>;return <tr key={g.name}>
        <th><span className={`plat p-${g.platform}`}>{platforms.find(p=>p.id===g.platform)?.name}</span>{g.name}</th><td>{fmt(t.spend,'money')}</td><td><div className="share"><i style={{width:`${100*t.spend/(curT.spend||1)}%`}}/></div>{fmt(100*t.spend/(curT.spend||1),'pct')}</td>{cell('cpm')}{cell('frequency')}{cell('hookRate')}{cell('ctr')}{cell('lpvRate')}<td>{fmt(res,'int')}</td>{targets.objective==='sales'?cell('roas'):cell(targets.objective==='messages'&&t.conversations?'costPerConv':t.leads?'cpl':'costPerConv')}
        <td><span className={`verdict v-${v.id}`} title={v.why}><VIcon size={12}/>{v.label}</span>{v.fix&&<small className="fix-hint">{v.fix}</small>}</td></tr>})}</tbody></table></div>
      <div className="panel-footer"><Info size={13}/>Scale = beating target · Optimise = close to target · Fix or cut = well over target · Pause = 2× target spent with no results · Learning = not enough spend yet. Hover a verdict for the reason.</div>
    </section>

    {insights.length>0&&<section className="panel"><div className="panel-heading"><div><h2>All recommendations</h2><p className="subtle">Cross-metric reads first, then each metric that slipped.</p></div><span className="subtle">{insights.length}</span></div><div className="insights">{insights.map((x,i)=><Insight key={x.title} x={x} open={i<1}/>)}</div></section>}
    </>}

    <section className="panel"><div className="panel-heading"><div><h2>Data sources</h2><p className="subtle">Imported reports and hand-entered numbers for {brandName(brand)}.</p></div><span className="subtle">{data.range.min?`${shortDay(data.range.min)} – ${shortDay(data.range.max!)}`:'Nothing yet'}</span></div>
      {brandImports.length?<div className="imports">{brandImports.map(i=><div className="import-row" key={i.id}><FileSpreadsheet size={18}/><div><strong>{i.name}</strong><small>{brandName(i.brand)} · {platforms.find(p=>p.id===i.platform)?.name} · {i.rows} rows · {i.from&&shortDay(i.from)} – {i.to&&shortDay(i.to)} · added {new Intl.DateTimeFormat('en-MY',{dateStyle:'medium',timeZone:'Asia/Kuala_Lumpur'}).format(new Date(i.created))}</small></div><button className="plain icon-button" aria-label={`Delete ${i.name}`} onClick={async()=>{if(confirm(`Delete “${i.name}” and its ${i.rows} rows?`)){try{await post({action:'import.delete',id:i.id});setNotice('Import deleted.');await load();}catch(e){setErr(e instanceof Error?e.message:'Unable to delete.')}}}}><Trash2 size={14}/></button></div>)}</div>:<p className="source-note pad-note">No reports yet. Imports are stored privately on the HQ server.</p>}
    </section>

    {modal==='import'&&<ImportModal brand={brand} targets={data.targets} onClose={()=>setModal('')} onDone={done}/>}
    {modal==='manual'&&<ManualModal brand={brand} onClose={()=>setModal('')} onDone={done}/>}
    {modal==='targets'&&<TargetsModal brand={brand} targets={saved} onClose={()=>setModal('')} onDone={done}/>}
  </div>;
}
