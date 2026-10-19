// @ts-nocheck
// Railway Function. Server-side TLS mail access, restricted to the Hoga mailbox.
import { ImapFlow } from 'imapflow@1';
import { simpleParser } from 'mailparser@3';
import { timingSafeEqual } from 'node:crypto';
function authorised(req:Request){const expected=Bun.env.HQ_MAIL_SECRET||'',actual=req.headers.get('x-hq-mail-key')||'';return expected&&actual.length===expected.length&&timingSafeEqual(Buffer.from(expected),Buffer.from(actual));}
export async function handle(req:Request){
  if(!authorised(req))return Response.json({error:'Unauthorized'},{status:401});
  if(req.method==='GET'&&new URL(req.url).pathname==='/health')return Response.json({ok:true});
  if(req.method!=='POST')return new Response('Method not allowed',{status:405});
  const raw=await req.text();if(raw.length>12000)return new Response('Too large',{status:413});
  let input;try{input=JSON.parse(raw);}catch{return Response.json({error:'Invalid request'},{status:400});}
  if(input.username?.toLowerCase()!=='care@hogaspace.my'||typeof input.password!=='string'||!input.password||input.password.length>1000)return Response.json({error:'Use the Hoga business mailbox.'},{status:400});
  const client=new ImapFlow({host:'mail.hogaspace.my',port:993,secure:true,tls:{rejectUnauthorized:true},auth:{user:input.username,pass:input.password},logger:false,disableAutoIdle:true,connectionTimeout:12000,greetingTimeout:8000,socketTimeout:20000,maxLiteralSize:250000,maxResponseSize:500000});
  client.on('error',()=>{});
  try{
    await client.connect();const folders=await client.list();const sent=folders.find(f=>f.specialUse==='\\Sent')?.path||folders.find(f=>/^sent(?: items| messages)?$/i.test(f.name))?.path;
    if(input.operation==='verify'){await client.mailboxOpen('INBOX',{readOnly:true});return Response.json({ok:true,sentAvailable:!!sent});}
    const messages=[],state={};let pending=false;
    for(const path of ['INBOX',...(sent?[sent]:[])]){
      const box=await client.mailboxOpen(path,{readOnly:true});const validity=String(box.uidValidity),high=Number(box.uidNext)-1;
      const old=input.state?.[path]?.validity===validity?input.state[path]:{};
      const from=old.lastUid?Number(old.lastUid)+1:Math.max(1,high-19),to=Math.min(high,from+19);
      let before=old.before??(from-1);const ranges=[];if(from<=high)ranges.push([from,to]);if(before>0)ranges.push([Math.max(1,before-19),before]);
      for(const [low,top] of ranges){for await(const msg of client.fetch(`${low}:${top}`,{uid:true,envelope:true,source:{start:0,maxLength:16000}},{uid:true})){
        const parsed=await simpleParser(msg.source||Buffer.from(''),{skipHtmlToText:false,skipTextToHtml:true});
        const env=msg.envelope||{};const refs=Array.isArray(parsed.references)?parsed.references:parsed.references?[parsed.references]:[];
        const thread=refs[0]||parsed.inReplyTo||env.inReplyTo||env.messageId||`${path}:${validity}:${msg.uid}`;
        messages.push({threadId:String(thread),latestId:`${path}:${validity}:${msg.uid}`,title:env.subject||'(No subject)',from:env.from?.[0]?.address||'',preview:String(parsed.text||'Open the original email to read its contents.').slice(0,2000),timestamp:new Date(env.date||parsed.date||Date.now()).getTime(),direction:path==='INBOX'?'inbound':'outbound'});
      }}
      state[path]={validity,lastUid:from<=high?to:(old.lastUid||high),before:Math.max(0,before-20)};if(to<high||state[path].before>0)pending=true;
    }
    return Response.json({ok:true,messages,state,pending,sentAvailable:!!sent});
  }catch{return Response.json({error:'Could not verify the mailbox securely. Check the password and that secure IMAP is enabled.'},{status:502});}
  finally{try{await client.logout();}catch{client.close();}}
}
Bun.serve({port:Number(Bun.env.PORT||3000),fetch:handle});


