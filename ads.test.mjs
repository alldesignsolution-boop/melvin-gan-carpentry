import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {parseAdsCsv,mapHeaders,toDate,sumRows,computeMetrics,diagnose,verdict,defaultTargets,cleanTargets,healthScore,funnel,sampleRows} from './lib/ads-metrics.mjs';
import {openAds} from './lib/ads-store.mjs';
import {openCrm} from './lib/crm.mjs';
import {createPortalServer} from './server.mjs';

const metaCsv=`"Reporting starts","Reporting ends","Campaign name","Ad set name","Ad name","Amount spent (MYR)","Impressions","Reach","Link clicks","Clicks (all)","Landing page views","3-second video plays","ThruPlays","Video plays at 25%","Video plays at 100%","Messaging conversations started","Leads","Purchases","Purchases conversion value","Purchase ROAS (return on ad spend)","Ad delivery"
2026-10-01,2026-10-01,"Condo, Broad","Broad 25-55","Reveal video","1,200.50",100000,40000,1500,3200,1200,32000,9000,16000,5000,600,0,0,0,0,active
2026-10-02,2026-10-02,"Condo, Broad","Broad 25-55","Reveal video",800,60000,30000,300,700,150,9000,1200,4000,400,60,0,0,0,0,active
`;

test('Meta CSV columns map to canonical fields without clashes',()=>{
  const m=mapHeaders(['Reporting starts','Campaign name','Ad set name','Ad name','Ad delivery','Amount spent (MYR)','Clicks (all)','Link clicks','Purchases','Purchases conversion value','Purchase ROAS (return on ad spend)','Video plays at 25%','3-second video plays']);
  assert.equal(m.ad,3);assert.equal(m.adset,2);assert.equal(m.clicks,7);assert.equal(m.clicksAll,6);assert.equal(m.purchases,8);assert.equal(m.revenue,9);assert.equal(m.v25,11);assert.equal(m.v3s,12);
  const tiktok=mapHeaders(['Date','Campaign name','Cost','Impressions','Clicks (destination)','2-second video views','Video views at 25%','Video views at 100%']);
  assert.equal(tiktok.v3s,5);assert.equal(tiktok.v25,6);assert.equal(tiktok.clicks,4);
  assert.equal(toDate('15/10/2026'),'2026-10-15');assert.equal(toDate('Oct 3, 2026'),'2026-10-03');assert.equal(toDate('2026/10/03'),'2026-10-03');assert.equal(toDate('31/02/2026'),'');
});

test('CSV import parses quoted numbers, skips totals and fills dates for date-less exports',()=>{
  const p=parseAdsCsv(metaCsv+'"Total","","","","",2000.5,160000,,,,,,,,,,,,,,\n',{objective:'messages'});
  assert.equal(p.rows.length,2);assert.equal(p.skipped,1);
  assert.equal(p.rows[0].campaign,'Condo, Broad');assert.equal(p.rows[0].spend,1200.5);assert.equal(p.rows[0].clicks,1500);assert.equal(p.rows[0].clicksAll,3200);
  const google=`Campaign report\n"October 1, 2026 - October 31, 2026"\nCampaign,Cost,Impr.,Clicks,Conversions,Conv. value\nSearch Brand,"RM500.00",10000,400,20,9000\nTotal: Account,500,10000,400,20,9000\n`;
  const g=parseAdsCsv(google,{platform:'google',from:'2026-10-01',to:'2026-10-31'});
  assert.equal(g.rows.length,1);assert.equal(g.rows[0].date,'2026-10-01');assert.equal(g.rows[0].dateTo,'2026-10-31');assert.equal(g.rows[0].leads,20);assert.equal(g.rows[0].revenue,9000);assert.equal(g.rows[0].platform,'google');
  assert.match(parseAdsCsv(google).warnings.join(),/no date column/);
});

test('Metrics, health levels and diagnosis',()=>{
  const targets=cleanTargets({objective:'messages',targetCpConv:15},'hoga'),t=sumRows(parseAdsCsv(metaCsv).rows);
  const m=computeMetrics(t,{targets,crm:{leads:40,clients:2,value:60000}});
  assert.equal(Math.round(m.ctr.value*100)/100,1.13);assert.equal(m.ctr.status,'good');
  assert.equal(Math.round(m.cpm.value*100)/100,12.5);assert.equal(m.cpm.status,'good');
  assert.equal(Math.round(m.hookRate.value),26);assert.equal(m.hookRate.status,'watch');
  assert.equal(m.costPerConv.status,'good');assert.equal(m.closeRate.value,5);assert.equal(m.closeRate.status,'watch');
  assert.equal(m.roas.value,null);assert.equal(m.roas.status,'na');
  assert.ok(healthScore(m)>0&&healthScore(m)<=100);
  // Cheap impressions + poor CTR = creative problem.
  const weak=computeMetrics({...t,clicks:300},{targets});assert.equal(weak.ctr.status,'poor');
  assert.equal(diagnose(weak,{targets})[0].title,'Creative problem, not a cost problem');
  // ROAS below break-even (40% margin => 2.5x).
  const sales=cleanTargets({objective:'sales',margin:40,targetRoas:3},'redpacket'),r=computeMetrics({...t,purchases:20,revenue:4000},{targets:sales});
  assert.equal(r.roas.status,'poor');assert.ok(diagnose(r,{targets:sales}).some(x=>x.title==='Spending below break-even'));
  assert.equal(computeMetrics({...t,purchases:40,revenue:5500},{targets:sales}).roas.status,'watch');
  assert.equal(cleanTargets({margin:-5,bench:{ctr:[2,'x']}},'hoga').margin,40);assert.deepEqual(cleanTargets({bench:{ctr:[2,1]}},'hoga').bench,{ctr:[2,1]});
});

test('Verdicts and funnel',()=>{
  const targets=defaultTargets('hoga');
  assert.equal(verdict({...sumRows([]),spend:5},targets).id,'learning');
  assert.equal(verdict({...sumRows([]),spend:40,impressions:3000,clicks:30},targets).id,'pause');
  assert.equal(verdict({...sumRows([]),spend:100,impressions:8000,clicks:120,v3s:2800,conversations:10},targets).id,'optimise','under target but click→chat rate is poor');
  assert.equal(verdict({...sumRows([]),spend:100,impressions:8000,clicks:100,v3s:2800,conversations:45},targets).id,'scale');
  assert.equal(verdict({...sumRows([]),spend:100,impressions:8000,clicks:120,conversations:4},targets).id,'fix');
  const f=funnel({...sumRows([]),impressions:1000,clicks:20,conversations:10},'messages',{leads:8,clients:1});
  assert.deepEqual(f.map(s=>s.label),['Impressions','Link clicks','Chats started','Leads on board','Clients won']);assert.equal(f[2].rate,50);
  assert.equal(sampleRows('2026-10-22',10).length,50);
});

test('Ads store upserts overlapping imports, deletes imports and keeps targets per brand',()=>{
  const ads=openAds(),rows=parseAdsCsv(metaCsv).rows;
  const id=ads.act({action:'rows.import',brand:'hoga',platform:'meta',name:'oct.csv',rows}).result;
  ads.act({action:'rows.import',brand:'hoga',platform:'meta',name:'oct-again.csv',rows:[{...rows[0],spend:999}]});
  let s=ads.state({brand:'hoga'});assert.equal(s.rows.length,2,'re-import replaces, never doubles');assert.equal(s.rows.find(r=>r.date==='2026-10-01').spend,999);
  assert.equal(s.imports.length,2);assert.equal(s.imports.find(i=>i.id===id).rows,1);
  assert.equal(ads.state({brand:'hoga',from:'2026-10-02',to:'2026-10-02'}).rows.length,1);
  assert.equal(ads.state({brand:'hankidz'}).rows.length,0);assert.equal(s.range.min,'2026-10-01');
  ads.act({action:'import.delete',id});s=ads.state({});assert.equal(s.rows.length,1);assert.equal(s.imports.length,1);
  assert.throws(()=>ads.act({action:'rows.import',brand:'nope',rows}),/brand/);
  assert.throws(()=>ads.act({action:'rows.import',brand:'hoga',rows:[{date:'2026-02-31'}]}),/Invalid date/);
  assert.throws(()=>ads.act({action:'rows.import',brand:'hoga',rows:[{date:'2026-10-01',spend:-4}]}),/Invalid spend/);
  ads.act({action:'targets.save',brand:'hoga',targets:{objective:'sales',margin:50}});
  s=ads.state({});assert.equal(s.targets.hoga.objective,'sales');assert.equal(s.targets.hoga.margin,50);assert.equal(s.targets.hankidz.objective,'leads');
  assert.throws(()=>ads.act({action:'drop'}),/Unknown action/);
});

test('Portal serves /api/ads only to signed-in users and same-origin JSON writes',async()=>{
  const root=await mkdtemp(join(tmpdir(),'hq-ads-test-'));await writeFile(join(root,'index.html'),'<h1>HQ</h1>');
  const env={ADMIN_USER:'fixture-user',ADMIN_PASS:'synthetic-password',HQ_SESSION_SECRET:'x'.repeat(48),HQ_PORTAL_SECRET:'y'.repeat(48),HQ_BACKEND_ACCESS_TOKEN:'synthetic',PUBLIC_ORIGIN:'http://127.0.0.1'};
  const server=createPortalServer({root,env,crm:openCrm(),ads:openAds(),fetchImpl:async()=>Response.json({})});
  server.listen(0,'127.0.0.1');await once(server,'listening');const base=`http://127.0.0.1:${server.address().port}`;
  try{
    assert.equal((await fetch(base+'/api/ads')).status,401);
    const login=await fetch(base+'/login',{method:'POST',redirect:'manual',headers:{Origin:env.PUBLIC_ORIGIN,'Content-Type':'application/x-www-form-urlencoded'},body:'username=fixture-user&password=synthetic-password'});
    const cookie=login.headers.get('set-cookie').split(';')[0];
    const body=JSON.stringify({action:'rows.import',brand:'hoga',platform:'meta',name:'t.csv',rows:parseAdsCsv(metaCsv).rows});
    assert.equal((await fetch(base+'/api/ads',{method:'POST',headers:{cookie,'Content-Type':'application/json',Origin:'https://evil.example'},body})).status,403);
    assert.equal((await fetch(base+'/api/ads',{method:'POST',headers:{cookie,'Content-Type':'text/plain',Origin:env.PUBLIC_ORIGIN},body})).status,415);
    const ok=await fetch(base+'/api/ads',{method:'POST',headers:{cookie,'Content-Type':'application/json',Origin:env.PUBLIC_ORIGIN},body});assert.equal(ok.status,200);
    const s=await (await fetch(base+'/api/ads?brand=hoga&from=2026-10-01&to=2026-10-31',{headers:{cookie}})).json();assert.equal(s.rows.length,2);
    assert.equal((await fetch(base+'/api/ads?from=bad',{headers:{cookie}})).status,400);
  }finally{server.close();}
});

test('Ratios ignore rows from exports that lack the column',()=>{
  const meta={date:'2026-10-01',campaign:'M',spend:100,impressions:10000,clicks:100,lpv:90,conversations:40};
  const tiktok={date:'2026-10-01',campaign:'T',spend:100,impressions:10000,clicks:100,lpv:null,conversations:null,leads:5};
  const t=sumRows([meta,tiktok]),m=computeMetrics(t,{targets:defaultTargets('hoga')});
  assert.equal(m.lpvRate.value,90,'TikTok clicks do not dilute the landing page view rate');
  assert.equal(m.costPerConv.value,2.5,'only spend on rows that track chats');assert.equal(m.convRate.value,40);
  assert.equal(m.ctr.value,1);assert.equal(m.cpl.value,20);
  assert.equal(computeMetrics(sumRows([{...tiktok,clicks:null}]),{targets:defaultTargets('hoga')}).ctr.value,null,'no click column means no CTR, not 0%');
  const ads=openAds();ads.act({action:'rows.import',brand:'hoga',platform:'tiktok',name:'t',rows:[tiktok]});
  assert.equal(ads.state({}).rows[0].lpv,null,'missing columns stay missing in storage');
});
