// Leads, labels and to-dos owned by this Railway service (SQLite on the service volume).
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {brands, safeLink} from './domain.mjs';

export const stages = [
  {id:'new', name:'New'},
  {id:'contacted', name:'Contacted'},
  {id:'qualified', name:'Qualified'},
  {id:'proposal', name:'Proposal'},
  {id:'onboarded', name:'Onboarded'},
  {id:'lost', name:'Lost'},
];
export const labelColors = ['green','yellow','orange','red','purple','blue','teal','grey'];

const fail = (message, status=400) => { throw Object.assign(new Error(message), {status, expose:true}); };
const text = (value, max) => String(value ?? '').trim().slice(0, max);
const json = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v;
const digits = v => String(v || '').replace(/\D/g, '');

export function openCrm({dir, file='melvin-crm.sqlite', now=()=>new Date()} = {}) {
  let path = ':memory:';
  if (dir) { mkdirSync(dir, {recursive:true}); path = join(dir, file); }
  const db = new DatabaseSync(path);
  db.exec(`pragma journal_mode=wal; pragma foreign_keys=on;
    create table if not exists leads(id text primary key, brand text not null, name text not null, phone text not null default '', email text not null default '', instagram text not null default '', source text not null default 'manual', manychat_id text unique, stage text not null, position real not null, value real, notes text not null default '', labels text not null default '[]', shortcuts text not null default '[]', extra text not null default '{}', archived integer not null default 0, created text not null, updated text not null, onboarded text);
    create table if not exists labels(id text primary key, name text not null unique collate nocase, color text not null);
    create table if not exists tasks(id text primary key, lead_id text references leads(id) on delete cascade, title text not null, due text not null default '', done integer not null default 0, position real not null, created text not null, done_at text);
    create table if not exists activity(id integer primary key autoincrement, lead_id text not null references leads(id) on delete cascade, at text not null, kind text not null, text text not null);
    create table if not exists meta(key text primary key, value text not null);
    create index if not exists activity_lead on activity(lead_id, id);
    create index if not exists tasks_lead on tasks(lead_id);`);
  const stamp = () => now().toISOString();
  const tx = fn => { db.exec('begin immediate'); try { const r = fn(); db.exec('commit'); return r; } catch (e) { db.exec('rollback'); throw e; } };
  const log = (leadId, kind, message) => db.prepare('insert into activity(lead_id,at,kind,text) values(?,?,?,?)').run(leadId, stamp(), kind, text(message, 4000));
  const leadRow = r => r && ({id:r.id, brand:r.brand, name:r.name, phone:r.phone, email:r.email, instagram:r.instagram, source:r.source, manychatId:r.manychat_id, stage:r.stage, position:r.position, value:r.value, notes:r.notes, labels:json(r.labels,[]), shortcuts:json(r.shortcuts,[]), extra:json(r.extra,{}), archived:!!r.archived, created:r.created, updated:r.updated, onboarded:r.onboarded});
  const getLead = id => leadRow(db.prepare('select * from leads where id=?').get(String(id || '')));
  const mustLead = id => getLead(id) || fail('This lead no longer exists.', 404);
  const topOf = stage => (db.prepare('select min(position) p from leads where stage=?').get(stage).p ?? 1) - 1;
  const labelIds = () => new Set(db.prepare('select id from labels').all().map(l => l.id));

  function cleanShortcuts(list) {
    if (!Array.isArray(list)) return [];
    return list.slice(0, 24).map(s => ({id:text(s?.id, 60) || randomUUID(), label:text(s?.label, 60), url:safeLink(text(s?.url, 2000))})).filter(s => s.label && s.url);
  }
  function cleanLead(input, existing) {
    const v = {...existing, ...input};
    if (!brands.some(b => b.id === v.brand)) fail('Choose a brand.');
    const name = text(v.name, 160); if (!name) fail('Give the lead a name.');
    const value = v.value === '' || v.value == null ? null : Number(v.value);
    if (value !== null && (!Number.isFinite(value) || value < 0)) fail('Use a positive deal value.');
    const known = labelIds();
    return {brand:v.brand, name, phone:text(v.phone, 40), email:text(v.email, 200), instagram:text(v.instagram, 80).replace(/^@/, ''), source:text(v.source, 40) || 'manual', value, notes:text(v.notes, 8000), labels:[...new Set((Array.isArray(v.labels) ? v.labels : []).map(String))].filter(id => known.has(id)), shortcuts:cleanShortcuts(v.shortcuts)};
  }
  function saveLead(input) {
    return tx(() => {
      const existing = input?.id ? mustLead(input.id) : null, v = cleanLead(input || {}, existing || {}), t = stamp();
      if (existing) {
        db.prepare('update leads set brand=?,name=?,phone=?,email=?,instagram=?,source=?,value=?,notes=?,labels=?,shortcuts=?,updated=? where id=?').run(v.brand, v.name, v.phone, v.email, v.instagram, v.source, v.value, v.notes, JSON.stringify(v.labels), JSON.stringify(v.shortcuts), t, existing.id);
        return existing.id;
      }
      const id = randomUUID(), stage = stages.some(s => s.id === input?.stage) ? input.stage : 'new';
      db.prepare('insert into leads(id,brand,name,phone,email,instagram,source,stage,position,value,notes,labels,shortcuts,created,updated,onboarded) values(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, v.brand, v.name, v.phone, v.email, v.instagram, v.source, stage, topOf(stage), v.value, v.notes, JSON.stringify(v.labels), JSON.stringify(v.shortcuts), t, t, stage === 'onboarded' ? t : null);
      log(id, 'created', 'Lead added manually.');
      return id;
    });
  }
  function moveLead({id, stage, index}) {
    if (!stages.some(s => s.id === stage)) fail('Choose a list.');
    return tx(() => {
      const lead = mustLead(id), t = stamp();
      const column = db.prepare('select id from leads where stage=? and archived=0 and id<>? order by position').all(stage, lead.id).map(r => r.id);
      column.splice(Math.max(0, Math.min(Number.isInteger(index) ? index : 0, column.length)), 0, lead.id);
      const set = db.prepare('update leads set position=? where id=?');
      column.forEach((leadId, i) => set.run(i, leadId));
      if (lead.stage !== stage) {
        db.prepare('update leads set stage=?,updated=?,onboarded=coalesce(onboarded,?) where id=?').run(stage, t, stage === 'onboarded' ? t : null, lead.id);
        log(lead.id, 'stage', `Moved from ${stages.find(s => s.id === lead.stage)?.name || lead.stage} to ${stages.find(s => s.id === stage).name}.`);
      }
      return lead.id;
    });
  }
  function archiveLead({id, archived}) {
    const lead = mustLead(id);
    db.prepare('update leads set archived=?,updated=? where id=?').run(archived ? 1 : 0, stamp(), lead.id);
    log(lead.id, 'archive', archived ? 'Archived.' : 'Restored from archive.');
    return lead.id;
  }
  function saveLabel(input) {
    const name = text(input?.name, 40), color = labelColors.includes(input?.color) ? input.color : 'grey';
    if (!name) fail('Name the label.');
    const clash = db.prepare('select id from labels where name=? collate nocase').get(name);
    if (clash && clash.id !== input?.id) fail('A label with that name already exists.', 409);
    if (input?.id) { if (!db.prepare('update labels set name=?,color=? where id=?').run(name, color, String(input.id)).changes) fail('This label no longer exists.', 404); return input.id; }
    const id = randomUUID(); db.prepare('insert into labels(id,name,color) values(?,?,?)').run(id, name, color); return id;
  }
  function deleteLabel({id}) {
    return tx(() => {
      for (const r of db.prepare('select id,labels from leads where labels like ?').all(`%${String(id)}%`)) db.prepare('update leads set labels=? where id=?').run(JSON.stringify(json(r.labels, []).filter(l => l !== id)), r.id);
      db.prepare('delete from labels where id=?').run(String(id));
    });
  }
  function saveTask(input) {
    const title = text(input?.title, 300), due = text(input?.due, 10);
    if (!title) fail('Describe the to-do.');
    if (due && !validDate(due)) fail('Choose a valid due date.');
    const leadId = input?.leadId ? mustLead(input.leadId).id : null, t = stamp();
    if (input?.id) {
      const task = db.prepare('select * from tasks where id=?').get(String(input.id)) || fail('This to-do no longer exists.', 404);
      const done = !!input.done;
      db.prepare('update tasks set title=?,due=?,done=?,done_at=? where id=?').run(title, due, done ? 1 : 0, done ? (task.done_at || t) : null, task.id);
      if (task.lead_id && done && !task.done) log(task.lead_id, 'task', `Completed “${title}”.`);
      return task.id;
    }
    const id = randomUUID(), pos = (db.prepare('select max(position) p from tasks where lead_id is ?').get(leadId).p ?? 0) + 1;
    db.prepare('insert into tasks(id,lead_id,title,due,done,position,created) values(?,?,?,?,0,?,?)').run(id, leadId, title, due, pos, t);
    return id;
  }
  function deleteTask({id}) { db.prepare('delete from tasks where id=?').run(String(id)); }
  function comment({leadId, text: message}) { const lead = mustLead(leadId); if (!text(message, 4000)) fail('Write a comment first.'); log(lead.id, 'comment', message); db.prepare('update leads set updated=? where id=?').run(stamp(), lead.id); return lead.id; }

  function labelsFor(tags) {
    const ids = [];
    for (const tag of tags) {
      const name = text(tag, 40); if (!name) continue;
      const found = db.prepare('select id from labels where name=? collate nocase').get(name);
      if (found) ids.push(found.id); else { const id = randomUUID(); db.prepare('insert into labels(id,name,color) values(?,?,?)').run(id, name, labelColors[db.prepare('select count(*) c from labels').get().c % labelColors.length]); ids.push(id); }
    }
    return ids;
  }
  // ManyChat "External Request": accepts the full contact JSON or a hand-built body.
  function ingestManychat(body, brandHint) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) fail('Send the contact as a JSON object.');
    const c = body.contact && typeof body.contact === 'object' ? {...body, ...body.contact} : body, custom = c.custom_fields && typeof c.custom_fields === 'object' ? c.custom_fields : {};
    const manychatId = text(c.id ?? c.subscriber_id ?? c.contact_id ?? c.user_id, 80) || null;
    const brand = [brandHint, c.brand, custom.brand].map(b => String(b || '').toLowerCase()).find(b => brands.some(x => x.id === b)) || 'hoga';
    const phone = text(c.phone || c.whatsapp_phone || custom.phone, 40), email = text(c.email || custom.email, 200), instagram = text(c.ig_username || c.instagram || custom.instagram, 80).replace(/^@/, '');
    const name = text(c.name || [c.first_name, c.last_name].filter(Boolean).join(' ') || custom.name || instagram || phone || email, 160) || 'ManyChat contact';
    const rawTags = Array.isArray(c.tags) ? c.tags.map(t => typeof t === 'string' ? t : t?.name) : typeof c.tags === 'string' ? c.tags.split(',') : [];
    const message = text(c.last_input_text || c.message || c.notes || custom.message, 2000);
    const chat = safeLink(text(c.live_chat_url, 2000));
    const extra = Object.fromEntries(Object.entries(custom).filter(([, v]) => v !== null && v !== '' && typeof v !== 'object').slice(0, 40).map(([k, v]) => [text(k, 60), text(v, 500)]));
    return tx(() => {
      const t = stamp(), tagIds = labelsFor(rawTags.slice(0, 20));
      let existing = manychatId ? db.prepare('select * from leads where manychat_id=?').get(manychatId) : null;
      if (!existing && digits(phone).length >= 8) existing = db.prepare('select * from leads where brand=? and phone<>\'\' ').all(brand).find(r => digits(r.phone) === digits(phone));
      if (existing) {
        const lead = leadRow(existing), shortcuts = chat && !lead.shortcuts.some(s => s.url === chat) ? [...lead.shortcuts, {id:randomUUID(), label:'ManyChat chat', url:chat}] : lead.shortcuts;
        db.prepare('update leads set name=?,phone=?,email=?,instagram=?,manychat_id=coalesce(manychat_id,?),labels=?,shortcuts=?,extra=?,archived=0,updated=? where id=?').run(lead.source === 'manychat' || lead.name === 'ManyChat contact' ? name : lead.name, phone || lead.phone, email || lead.email, instagram || lead.instagram, manychatId, JSON.stringify([...new Set([...lead.labels, ...tagIds])]), JSON.stringify(shortcuts), JSON.stringify({...lead.extra, ...extra}), t, lead.id);
        log(lead.id, 'manychat', message ? `ManyChat: “${message}”` : 'ManyChat sent an update.');
        db.prepare('insert or replace into meta(key,value) values(\'manychat_last\',?)').run(t);
        return {id:lead.id, created:false};
      }
      const id = randomUUID();
      db.prepare('insert into leads(id,brand,name,phone,email,instagram,source,manychat_id,stage,position,labels,shortcuts,extra,created,updated) values(?,?,?,?,?,?,\'manychat\',?,\'new\',?,?,?,?,?,?)').run(id, brand, name, phone, email, instagram, manychatId, topOf('new'), JSON.stringify(tagIds), JSON.stringify(chat ? [{id:randomUUID(), label:'ManyChat chat', url:chat}] : []), JSON.stringify(extra), t, t);
      log(id, 'manychat', message ? `New lead from ManyChat: “${message}”` : 'New lead from ManyChat.');
      db.prepare('insert or replace into meta(key,value) values(\'manychat_last\',?)').run(t);
      return {id, created:true};
    });
  }

  function state() {
    return {
      stages, labelColors,
      leads:db.prepare('select * from leads order by stage, position').all().map(leadRow),
      labels:db.prepare('select id,name,color from labels order by name').all().map(l => ({...l})),
      tasks:db.prepare('select * from tasks order by done, case when due=\'\' then 1 else 0 end, due, position').all().map(t => ({id:t.id, leadId:t.lead_id, title:t.title, due:t.due, done:!!t.done, created:t.created, doneAt:t.done_at})),
      lastActivity:Object.fromEntries(db.prepare('select lead_id, max(at) at from activity group by lead_id').all().map(r => [r.lead_id, r.at])),
      manychatLast:db.prepare('select value from meta where key=\'manychat_last\'').get()?.value || null,
    };
  }
  const activity = leadId => db.prepare('select id,at,kind,text from activity where lead_id=? order by id desc limit 200').all(String(leadId)).map(a => ({...a}));
  const actions = {'lead.save':p => saveLead(p.lead), 'lead.move':moveLead, 'lead.archive':archiveLead, 'label.save':p => saveLabel(p.label), 'label.delete':deleteLabel, 'task.save':p => saveTask(p.task), 'task.delete':deleteTask, 'comment.add':comment};
  function act(payload) { const run = actions[payload?.action] || fail('Unknown action.'); return {result:run(payload) ?? null}; }
  return {state, activity, act, ingestManychat, getLead, close:() => db.close()};
}
