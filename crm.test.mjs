import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {openCrm} from './lib/crm.mjs';
import {createPortalServer} from './server.mjs';

const fullContact={id:'901',first_name:'Aina',last_name:'Rahman',phone:'+60 12-345 6789',email:'aina@example.com',ig_username:'aina.home',live_chat_url:'https://app.manychat.com/fb1/chat/901',last_input_text:'Kitchen cabinet quote please',tags:[{id:1,name:'Kitchen'},{id:2,name:'Hot lead'}],custom_fields:{budget:'15000',area:'Klang'}};

test('ManyChat contacts become leads, update in place and map tags to labels',()=>{
  const crm=openCrm();
  const first=crm.ingestManychat(fullContact,'hoga');assert.equal(first.created,true);
  let s=crm.state(),lead=s.leads[0];
  assert.equal(lead.name,'Aina Rahman');assert.equal(lead.stage,'new');assert.equal(lead.source,'manychat');assert.equal(lead.instagram,'aina.home');
  assert.deepEqual(s.labels.map(l=>l.name).sort(),['Hot lead','Kitchen']);assert.equal(lead.labels.length,2);
  assert.equal(lead.shortcuts[0].url,fullContact.live_chat_url);assert.equal(lead.extra.budget,'15000');
  assert.match(crm.activity(lead.id)[0].text,/Kitchen cabinet quote/);
  const again=crm.ingestManychat({...fullContact,tags:['Kitchen','Condo'],last_input_text:'Any update?'},'hoga');
  assert.equal(again.created,false);assert.equal(again.id,lead.id);s=crm.state();
  assert.equal(s.leads.length,1);assert.equal(s.leads[0].labels.length,3);assert.equal(s.leads[0].shortcuts.length,1);
  // Same phone without a ManyChat ID matches the existing card in that brand.
  assert.equal(crm.ingestManychat({name:'Aina',phone:'012-345 6789'.replace(/^0/,'+60 ')},'hoga').id,lead.id);
  assert.equal(crm.ingestManychat({name:'Ben',phone:'0198887777'},'nonsense').created,true);
  assert.equal(crm.state().leads.find(l=>l.name==='Ben').brand,'hoga');
  assert.throws(()=>crm.ingestManychat([1]),/JSON object/);
});

test('Board moves, onboarding, labels and checklists',()=>{
  const crm=openCrm({now:()=>new Date('2026-10-20T03:00:00Z')});
  const a=crm.act({action:'lead.save',lead:{name:'Alpha',brand:'digitalads'}}).result,b=crm.act({action:'lead.save',lead:{name:'Beta',brand:'digitalads'}}).result;
  assert.deepEqual(crm.state().leads.filter(l=>l.stage==='new').map(l=>l.name),['Beta','Alpha']);
  crm.act({action:'lead.move',id:a,stage:'new',index:0});
  assert.deepEqual(crm.state().leads.filter(l=>l.stage==='new').map(l=>l.name),['Alpha','Beta']);
  crm.act({action:'lead.move',id:a,stage:'onboarded',index:0});
  let lead=crm.getLead(a);assert.equal(lead.stage,'onboarded');assert.equal(lead.onboarded,'2026-10-20T03:00:00.000Z');
  crm.act({action:'lead.move',id:a,stage:'proposal',index:0});crm.act({action:'lead.move',id:a,stage:'onboarded',index:0});
  assert.equal(crm.getLead(a).onboarded,'2026-10-20T03:00:00.000Z','first onboarding date is kept');
  const label=crm.act({action:'label.save',label:{name:'Retainer',color:'blue'}}).result;
  assert.throws(()=>crm.act({action:'label.save',label:{name:'retainer',color:'red'}}),/already exists/);
  crm.act({action:'lead.save',lead:{...crm.getLead(a),labels:[label,'unknown'],shortcuts:[{label:'Drive',url:'https://drive.google.com/x'},{label:'Bad',url:'javascript:alert(1)'}]}});
  lead=crm.getLead(a);assert.deepEqual(lead.labels,[label]);assert.deepEqual(lead.shortcuts.map(s=>s.label),['Drive']);
  crm.act({action:'label.delete',id:label});assert.deepEqual(crm.getLead(a).labels,[]);
  const task=crm.act({action:'task.save',task:{leadId:a,title:'Kick-off call',due:'2026-10-21'}}).result;
  crm.act({action:'task.save',task:{leadId:null,title:'General to-do'}});
  assert.throws(()=>crm.act({action:'task.save',task:{title:'x',due:'2026-02-31'}}),/valid due date/);
  crm.act({action:'task.save',task:{id:task,leadId:a,title:'Kick-off call',due:'2026-10-21',done:true}});
  assert.equal(crm.state().tasks.find(t=>t.id===task).done,true);
  assert.match(crm.activity(a).map(x=>x.text).join('|'),/Completed “Kick-off call”/);
  crm.act({action:'comment.add',leadId:b,text:'Called, asked to send deck'});assert.equal(crm.activity(b)[0].kind,'comment');
  crm.act({action:'lead.archive',id:b,archived:true});assert.equal(crm.getLead(b).archived,true);
  assert.throws(()=>crm.act({action:'lead.save',lead:{name:'',brand:'hoga'}}),/name/);
  assert.throws(()=>crm.act({action:'drop.tables'}),/Unknown action/);
});

test('Portal serves the CRM API to signed-in users and guards the ManyChat intake',async()=>{
  const root=await mkdtemp(join(tmpdir(),'hq-crm-test-'));await writeFile(join(root,'index.html'),'<h1>HQ</h1>');
  const env={ADMIN_USER:'fixture-user',ADMIN_PASS:'synthetic-password',HQ_SESSION_SECRET:'x'.repeat(48),HQ_PORTAL_SECRET:'y'.repeat(48),HQ_BACKEND_ACCESS_TOKEN:'synthetic',PUBLIC_ORIGIN:'http://127.0.0.1',MANYCHAT_WEBHOOK_SECRET:'z'.repeat(32)};
  const crm=openCrm(),server=createPortalServer({root,env,crm,fetchImpl:async()=>Response.json({rows:[],capabilities:{}})});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`;
  const request=(path,options={})=>fetch(origin+path,{redirect:'manual',...options});
  const hook=(key,body=fullContact,brand='digitalads')=>request(`/api/manychat?brand=${brand}`,{method:'POST',headers:{'Content-Type':'application/json',...(key?{'X-HQ-Key':key}:{})},body:JSON.stringify(body)});
  try{
    assert.equal((await hook()).status,401);assert.equal((await hook('wrong')).status,401);
    assert.equal((await request('/api/manychat')).status,405);
    const ok=await hook(env.MANYCHAT_WEBHOOK_SECRET);assert.equal(ok.status,200);const created=await ok.json();assert.equal(created.created,true);
    assert.equal(crm.getLead(created.id).brand,'digitalads');
    assert.equal((await request('/api/manychat',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${env.MANYCHAT_WEBHOOK_SECRET}`},body:'{'})).status,400);
    assert.equal((await request('/api/crm')).status,401);
    const signed=await request('/login',{method:'POST',headers:{Origin:env.PUBLIC_ORIGIN,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USER,password:env.ADMIN_PASS})});
    const auth={Cookie:signed.headers.get('set-cookie').split(';')[0]};
    const state=await (await request('/api/crm',{headers:auth})).json();assert.equal(state.leads.length,1);assert.equal(state.webhook.enabled,true);assert.equal(state.webhook.url,'http://127.0.0.1/api/manychat');
    assert.equal(JSON.stringify(state).includes(env.MANYCHAT_WEBHOOK_SECRET),false);
    const post=(payload,headers={Origin:env.PUBLIC_ORIGIN})=>request('/api/crm',{method:'POST',headers:{...auth,'Content-Type':'application/json',...headers},body:JSON.stringify(payload)});
    assert.equal((await post({action:'lead.move',id:created.id,stage:'onboarded',index:0},{Origin:'https://evil.example'})).status,403);
    const moved=await post({action:'lead.move',id:created.id,stage:'onboarded',index:0});assert.equal(moved.status,200);assert.equal((await moved.json()).leads[0].stage,'onboarded');
    const bad=await post({action:'lead.move',id:'missing',stage:'new'});assert.equal(bad.status,404);assert.match((await bad.json()).error,/no longer exists/);
    const act=await (await request(`/api/crm?activity=${created.id}`,{headers:auth})).json();assert.equal(act.activity[0].kind,'stage');
  }finally{server.close();server.closeAllConnections();await once(server,'close');await rm(root,{recursive:true,force:true});crm.close();}
});

test('ManyChat intake stays off without a strong secret',async()=>{
  const root=await mkdtemp(join(tmpdir(),'hq-crm-off-'));
  const server=createPortalServer({root,crm:openCrm(),env:{ADMIN_USER:'u',ADMIN_PASS:'p',HQ_SESSION_SECRET:'x'.repeat(48),HQ_PORTAL_SECRET:'y'.repeat(48),HQ_BACKEND_ACCESS_TOKEN:'t',PUBLIC_ORIGIN:'http://127.0.0.1',MANYCHAT_WEBHOOK_SECRET:'short'}});
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/api/manychat`,{method:'POST',headers:{'Content-Type':'application/json','X-HQ-Key':'short'},body:'{}'})).status,503);}
  finally{server.close();server.closeAllConnections();await once(server,'close');await rm(root,{recursive:true,force:true});}
});
