export const brands = [
  {id:"hoga", name:"Hoga Space", short:"HS", category:"Interiors & cabinetry", color:"#93664b", url:"https://web-production-96921.up.railway.app/", note:"Pilot brand"},
  {id:"digitalads", name:"Digital Ads Service", short:"DA", category:"Agency & client delivery", color:"#7160c0", url:"https://digital-ads-workspace.melvingan.chatgpt.site", note:"Working data source to verify"},
  {id:"hankidz", name:"Hankidz", short:"HK", category:"Education & enrolment", color:"#3b8b77", url:"https://enrollment-lab-web-enrollment-lab.up.railway.app/", note:"Dashboard connection pending"},
  {id:"redpacket", name:"redpacket.my", short:"rp", category:"Brand workspace", color:"#d35656", url:null, note:"Sources to connect"},
];
export function malaysiaDate(value = new Date()) { return new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Kuala_Lumpur",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(value)); }
export function safeLink(value) { try { const u = new URL(value); return u.protocol === "https:" && !u.username && !u.password ? u.href : ""; } catch { return ""; } }
export function freshness(source, now = Date.now()) { if (!source?.lastSuccess) return "pending"; if (source.error || now - Date.parse(source.lastSuccess) > 90 * 60_000) return "stale"; return "connected"; }
export function validateReminder(input) {
  if (!input || typeof input !== "object") throw new Error("Enter a reminder.");
  if (!brands.some(b=>b.id===input.brand)) throw new Error("Choose a brand.");
  const title = String(input.title || "").trim(); if (!title || title.length>200) throw new Error("Use a reminder title of 1–200 characters.");
  const due=String(input.due || ""); if (due && (!/^\d{4}-\d{2}-\d{2}$/.test(due) || Number.isNaN(Date.parse(due)) || new Date(due).toISOString().slice(0,10)!==due)) throw new Error("Choose a valid due date.");
  const priority = ["high","normal","low"].includes(input.priority) ? input.priority : "normal";
  return {title,brand:input.brand,due,priority,notes:String(input.notes||"").slice(0,4000),url:safeLink(input.url),done:!!input.done};
}
export function isAwaitingReply(messages, ownAddress) { if (!messages.length) return false; const latest=[...messages].sort((a,b)=>a.timestamp-b.timestamp).at(-1); return latest.direction ? latest.direction === "inbound" : !String(latest.from||"").toLowerCase().includes(ownAddress.toLowerCase()); }
export function hogaActions(leads) { return leads.filter(l=>!["won","lost"].includes(l.status) && (l.next_follow_up || l.followup_flag || l.appointment_at)).map(l=>({id:`hoga:lead:${l.id}`,brand:"hoga",title:l.full_name || `Lead ${l.id}`,due:l.next_follow_up||"",appointment:l.appointment_at||"",priority:l.followup_flag?"high":"normal",notes:l.follow_up_note||"",stage:l.status,owner:l.assigned_to||"Unassigned",url:"https://web-production-96921.up.railway.app/",source:"Hoga CRM",updated:l.updated_at||""})); }
export function whatsappLink(phone) { let d = String(phone || "").replace(/\D/g, ""); if (d.startsWith("0")) d = "6" + d; return d.length >= 8 ? `https://wa.me/${d}` : ""; }
