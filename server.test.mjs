import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {once} from 'node:events';
import {createPortalServer} from './server.mjs';
test('Private Railway portal enforces sign-in, origin, session lifetime and restricted server relay',async()=>{
  const root=await mkdtemp(join(tmpdir(),'hq-portal-test-'));await writeFile(join(root,'index.html'),'<h1>HQ fixture</h1>');await writeFile(join(root,'favicon.svg'),'<svg/>');
  const env={ADMIN_USER:'fixture-user',ADMIN_PASS:'synthetic-password',HQ_SESSION_SECRET:'x'.repeat(48),HQ_PORTAL_SECRET:'y'.repeat(48),HQ_BACKEND_ACCESS_TOKEN:'synthetic-private-site-access',PUBLIC_ORIGIN:'http://127.0.0.1',HQ_DATA_DIR:root};
  let clock=Date.now();const calls=[];
  const server=createPortalServer({root,env,now:()=>clock,fetchImpl:async(url,options)=>{calls.push({url,options});return Response.json(options.method==='GET'?{rows:[{kind:'reminder',data:{title:'Test fixture'}}],capabilities:{}}:{ok:true});}});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const origin=`http://127.0.0.1:${server.address().port}`;
  const request=(path,options={})=>fetch(origin+path,{redirect:'manual',...options});
  try{
    assert.equal((await request('/api/hq')).status,401);assert.equal((await request('/')).status,303);
    assert.equal((await request('/health')).status,200);assert.equal((await request('/login')).status,200);
    const login=(password,originHeader=env.PUBLIC_ORIGIN)=>request('/login',{method:'POST',headers:{Origin:originHeader,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({username:env.ADMIN_USER,password})});
    assert.equal((await login(env.ADMIN_PASS,'https://other.example')).status,403);
    assert.equal((await login('wrong')).status,401);
    const signed=await login(env.ADMIN_PASS);assert.equal(signed.status,303);const cookie=signed.headers.get('set-cookie');assert(cookie.includes('HttpOnly'));assert(cookie.includes('SameSite=Strict'));const session=cookie.split(';')[0];
    const auth={Cookie:session};assert.equal((await request('/',{headers:auth})).status,200);
    const response=await request('/api/hq',{headers:{...auth,'oai-authenticated-user-id':'attacker','x-hq-portal-key':'attacker'}});assert.equal(response.status,200);assert.equal((await response.json()).rows[0].data.title,'Test fixture');
    assert.equal(calls[0].url,'https://melvin-hq.melvingan.chatgpt.site/api/hq');
    assert.equal(calls[0].options.headers['x-hq-portal-key'],env.HQ_PORTAL_SECRET);assert(!('oai-authenticated-user-id' in calls[0].options.headers));assert(!('Cookie' in calls[0].options.headers));
    assert.equal((await request('/api/ingest',{headers:auth})).status,404);assert.equal(calls.length,1);
    const post=headers=>request('/api/hq',{method:'POST',headers:{...auth,'Content-Type':'application/json',...headers},body:JSON.stringify({action:'reminder',value:{title:'Fixture'}})});
    assert.equal((await post({Origin:'https://other.example'})).status,403);assert.equal(calls.length,1);
    assert.equal((await post({Origin:env.PUBLIC_ORIGIN})).status,200);assert.equal(calls.length,2);assert.equal(calls[1].options.headers.Origin,'https://melvin-hq.melvingan.chatgpt.site');
    assert.equal((await request('/api/hq',{headers:{Cookie:session+'tampered'}})).status,401);
    assert.equal((await request('/package.json',{headers:auth})).status,404);
    clock+=9*3600000;assert.equal((await request('/api/hq',{headers:auth})).status,401);
    for(let i=0;i<8;i++)await login('wrong');assert.equal((await login(env.ADMIN_PASS)).status,429);
    const logout=await request('/logout');assert(logout.headers.get('set-cookie').includes('Max-Age=0'));
  }finally{server.close();server.closeAllConnections();await once(server,'close');await rm(root,{recursive:true,force:true});}
});
test('Portal fails closed when private settings are missing',()=>assert.throws(()=>createPortalServer({env:{}}),/incomplete/));
