import {createServer} from 'node:http';
import {readFile,realpath} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHmac,createHash,timingSafeEqual,randomBytes} from 'node:crypto';
import {openCrm} from './lib/crm.mjs';

const backendOrigin='https://melvin-hq.melvingan.chatgpt.site';
const cookieName='melvin_hq_session';
const allowedApis=new Map([['/api/hq',new Set(['GET','POST'])],['/api/imap',new Set(['POST'])]]);
const baseHeaders={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"};
const equal=(a,b)=>timingSafeEqual(createHash('sha256').update(a).digest(),createHash('sha256').update(b).digest());
const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const loginPage=(message='')=>`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Sign in · Melvin HQ</title><link rel="icon" href="/favicon.svg"><style>body{margin:0;background:#f7f8f6;color:#22282e;font:15px system-ui,sans-serif;display:grid;min-height:100vh;place-items:center}main{box-sizing:border-box;width:min(420px,calc(100% - 40px));padding:38px;background:white;border:1px solid #e7e8e6;border-radius:16px}h1{margin:0 0 8px;font-size:30px}p{color:#717a7b;line-height:1.6}label{display:block;margin-top:20px;font-size:13px}input{box-sizing:border-box;width:100%;padding:12px;border:1px solid #d8ddda;border-radius:7px;margin-top:8px;font:inherit}button{width:100%;padding:13px;margin-top:25px;border:0;border-radius:7px;background:#d7764f;color:white;font:inherit;cursor:pointer}input:focus,button:focus{outline:3px solid #d7764f66;outline-offset:2px}.error{color:#aa3434}small{color:#8a9191}.brand{color:#d7764f;font-weight:600;letter-spacing:2px;font-size:11px;margin-bottom:22px}</style><main><div class="brand">YOUR PRIVATE WORKSPACE</div><h1>melvin HQ</h1><p>A clear view of every brand.<br>Sign in with your existing account.</p>${message?`<p class="error" role="alert">${escape(message)}</p>`:''}<form method="post" action="/login"><label>Username<input name="username" autocomplete="username" required maxlength="200"></label><label>Password<input name="password" type="password" autocomplete="current-password" required maxlength="1000"></label><button>Sign in</button></form><p><small>Only authorised access. Malaysia time · MYR</small></p></main></html>`;

async function readBody(req,limit){let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>limit)throw Object.assign(new Error('Request too large.'),{status:413});chunks.push(chunk);}return Buffer.concat(chunks);}

export function createPortalServer({env=process.env,fetchImpl=fetch,root=fileURLToPath(new URL('./dist/',import.meta.url)),now=()=>Date.now(),crm}={}){
  const {ADMIN_USER,ADMIN_PASS,HQ_SESSION_SECRET,HQ_BACKEND_ACCESS_TOKEN,HQ_PORTAL_SECRET,PUBLIC_ORIGIN}=env;
  if(!ADMIN_USER||!ADMIN_PASS||!HQ_SESSION_SECRET||HQ_SESSION_SECRET.length<32||!HQ_BACKEND_ACCESS_TOKEN||!HQ_PORTAL_SECRET||HQ_PORTAL_SECRET.length<32)throw new Error('Private portal settings are incomplete.');
  if(!PUBLIC_ORIGIN||new URL(PUBLIC_ORIGIN).origin!==PUBLIC_ORIGIN)throw new Error('Configure the exact public origin.');
  const secure=PUBLIC_ORIGIN.startsWith('https://'),sign=value=>createHmac('sha256',HQ_SESSION_SECRET).update(value).digest('base64url');
  const attempts=new Map(),hookFailures=new Map(),hookSecret=env.MANYCHAT_WEBHOOK_SECRET&&env.MANYCHAT_WEBHOOK_SECRET.length>=24?env.MANYCHAT_WEBHOOK_SECRET:'';
  const ownCrm=!crm;crm??=openCrm({dir:env.HQ_DATA_DIR||env.RAILWAY_VOLUME_MOUNT_PATH||fileURLToPath(new URL('./.data/',import.meta.url))});
  function authenticated(req){const raw=req.headers.cookie?.split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';const [expires,nonce,signature,...rest]=raw.split('.');return !rest.length&&/^\d{13}$/.test(expires||'')&&Number(expires)>now()&&Number(expires)<=now()+8*3600000&&/^[a-f0-9]{32}$/.test(nonce||'')&&!!signature&&equal(signature,sign(expires+'.'+nonce));}
  const server=createServer(async(req,res)=>{
    const send=(status,body,extra={})=>{res.writeHead(status,{...baseHeaders,...extra});res.end(req.method==='HEAD'?undefined:body);};
    const json=(status,data,extra={})=>send(status,JSON.stringify(data),{'Content-Type':'application/json; charset=utf-8',...extra});
    const redirect=(to,extra={})=>send(303,'',{Location:to,...extra});
    const sessionCookie=(value,maxAge)=>`${cookieName}=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure?'; Secure':''}`;
    try{
      const url=new URL(req.url,'http://localhost'),path=url.pathname;
      if(path==='/health'&&['GET','HEAD'].includes(req.method))return json(200,{ok:true,app:'melvin-hq',commit:env.RAILWAY_GIT_COMMIT_SHA||null});
      if(path==='/favicon.svg'&&['GET','HEAD'].includes(req.method))return send(200,await readFile(resolve(root,'favicon.svg')),{'Content-Type':'image/svg+xml'});
      if(path==='/login'){
        if(req.method==='GET')return authenticated(req)?redirect('/'):send(200,loginPage(),{'Content-Type':'text/html; charset=utf-8'});
        if(req.method!=='POST')return json(405,{error:'Method not allowed.'},{Allow:'GET, POST'});
        if(req.headers.origin!==PUBLIC_ORIGIN)return json(403,{error:'Please sign in from Melvin HQ.'});
        if(!req.headers['content-type']?.startsWith('application/x-www-form-urlencoded'))return json(415,{error:'Use the sign-in form.'});
        const ip=req.headers['x-forwarded-for']?.split(',')[0].trim()||req.socket.remoteAddress||'unknown',old=attempts.get(ip),entry=old&&old.until>now()?old:{count:0,until:now()+15*60000};
        if(entry.count>=8)return send(429,loginPage('Too many attempts. Try again in 15 minutes.'),{'Content-Type':'text/html; charset=utf-8','Retry-After':'900'});
        const input=new URLSearchParams((await readBody(req,5000)).toString());
        const usernameOk=equal(input.get('username')||'',ADMIN_USER),passwordOk=equal(input.get('password')||'',ADMIN_PASS);
        if(!usernameOk||!passwordOk){entry.count++;if(attempts.size>10000)attempts.clear();attempts.set(ip,entry);return send(401,loginPage('The username or password is incorrect.'),{'Content-Type':'text/html; charset=utf-8'});}
        attempts.delete(ip);const payload=String(now()+8*3600000)+'.'+randomBytes(16).toString('hex');return redirect('/',{'Set-Cookie':sessionCookie(payload+'.'+sign(payload),28800)});
      }
      if(path==='/api/manychat'){
        if(req.method!=='POST')return json(405,{error:'Method not allowed.'},{Allow:'POST'});
        if(!hookSecret)return json(503,{error:'ManyChat intake is not configured.'});
        const ip=req.headers['x-forwarded-for']?.split(',')[0].trim()||req.socket.remoteAddress||'unknown',old=hookFailures.get(ip),entry=old&&old.until>now()?old:{count:0,until:now()+15*60000};
        if(entry.count>=20)return json(429,{error:'Too many attempts.'},{'Retry-After':'900'});
        const key=req.headers['x-hq-key']||req.headers.authorization?.replace(/^Bearer\s+/i,'')||'';
        if(!equal(String(key),hookSecret)){entry.count++;if(hookFailures.size>10000)hookFailures.clear();hookFailures.set(ip,entry);return json(401,{error:'Invalid intake key.'});}
        if(!req.headers['content-type']?.startsWith('application/json'))return json(415,{error:'JSON required.'});
        let body;try{body=JSON.parse((await readBody(req,50000)).toString());}catch(e){if(e.status)throw e;return json(400,{error:'Invalid JSON.'});}
        return json(200,{ok:true,...crm.ingestManychat(body,url.searchParams.get('brand'))});
      }
      if(path==='/logout'&&req.method==='GET')return redirect('/login',{'Set-Cookie':sessionCookie('',0)});
      if(!authenticated(req)){if(path.startsWith('/api/'))return json(401,{error:'Sign in to Melvin HQ.'});return redirect('/login');}
      if(path==='/api/crm'){
        const webhook={enabled:!!hookSecret,url:PUBLIC_ORIGIN+'/api/manychat'};
        if(req.method==='GET'){const id=url.searchParams.get('activity');return json(200,id?{activity:crm.activity(id)}:{...crm.state(),webhook});}
        if(req.method!=='POST')return json(405,{error:'Method not allowed.'},{Allow:'GET, POST'});
        if(req.headers.origin!==PUBLIC_ORIGIN)return json(403,{error:'Please make changes from Melvin HQ.'});
        if(!req.headers['content-type']?.startsWith('application/json'))return json(415,{error:'JSON required.'});
        let payload;try{payload=JSON.parse((await readBody(req,50000)).toString());}catch(e){if(e.status)throw e;return json(400,{error:'Invalid JSON.'});}
        const {result}=crm.act(payload);return json(200,{...crm.state(),webhook,result});
      }
      if(allowedApis.has(path)){
        if(!allowedApis.get(path).has(req.method))return json(405,{error:'Method not allowed.'});
        let body;
        if(req.method==='POST'){
          if(req.headers.origin!==PUBLIC_ORIGIN)return json(403,{error:'Please make changes from Melvin HQ.'});
          if(!req.headers['content-type']?.startsWith('application/json'))return json(415,{error:'JSON required.'});
          body=await readBody(req,path==='/api/imap'?10000:20000);try{JSON.parse(body.toString());}catch{return json(400,{error:'Invalid JSON.'});}
        }
        const upstream=await fetchImpl(backendOrigin+path,{method:req.method,headers:{'Content-Type':'application/json','OAI-Sites-Authorization':`Bearer ${HQ_BACKEND_ACCESS_TOKEN}`,'x-hq-portal-key':HQ_PORTAL_SECRET,Origin:backendOrigin},...(body?{body}:{}),redirect:'manual',signal:AbortSignal.timeout(45000)});
        if(upstream.status>=300&&upstream.status<400)return json(503,{error:'Private HQ connection needs attention. Your saved records are retained.'});
        const raw=await upstream.text();let result;try{result=JSON.parse(raw);}catch{return json(502,{error:'HQ is temporarily unavailable. Your saved records are retained.'});}
        if(upstream.status>=500)return json(503,{error:'HQ is temporarily unavailable. Your saved records are retained.'});
        return json(upstream.status,result);
      }
      if(/^\/api\/oauth\/(google|microsoft)$/.test(path)&&req.method==='GET')return redirect(backendOrigin+path+url.search);
      if(path.startsWith('/api/'))return json(404,{error:'Not found.'});
      if(!['GET','HEAD'].includes(req.method))return json(405,{error:'Method not allowed.'});
      const name=path==='/'||path==='/index.html'?'index.html':decodeURIComponent(path).slice(1),file=resolve(root,name),base=resolve(root);
      if(!file.startsWith(base+sep))return json(404,{error:'Not found.'});
      const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.woff2':'font/woff2'};
      if(!types[extname(file)]||!(await realpath(file)).startsWith(base+sep))return json(404,{error:'Not found.'});
      return send(200,await readFile(file),{'Content-Type':types[extname(file)]});
    }catch(error){if(error.expose)return json(error.status,{error:error.message});return json(error.status||(['ENOENT','ENOTDIR'].includes(error.code)?404:502),{error:error.status===413?'Request too large.':error.code==='ENOENT'?'Not found.':'Unable to complete this request. Please retry.'});}
  });
  if(ownCrm)server.on('close',()=>crm.close());
  return server;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const server=createPortalServer();server.listen(Number(process.env.PORT||8080),'0.0.0.0',()=>console.log(`Melvin HQ is ready. Lead store: ${process.env.HQ_DATA_DIR||process.env.RAILWAY_VOLUME_MOUNT_PATH||'local .data'} · ManyChat intake ${process.env.MANYCHAT_WEBHOOK_SECRET?.length>=24?'on':'off'}.`));
}
