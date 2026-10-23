// Ad performance rows, imports and per-brand targets, owned by this Railway service (SQLite beside the CRM file).
import {DatabaseSync} from 'node:sqlite';
import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {brands} from './domain.mjs';
import {NUM, platforms, validDate, cleanTargets} from './ads-metrics.mjs';

const fail = (message, status=400) => { throw Object.assign(new Error(message), {status, expose:true}); };
const text = (value, max) => String(value ?? '').trim().slice(0, max);
const json = (value, fallback) => { try { return JSON.parse(value); } catch { return fallback; } };
const brandIds = ['all', ...brands.map(b => b.id)];

export function openAds({dir, file='melvin-ads.sqlite', now=()=>new Date()} = {}) {
  let path = ':memory:';
  if (dir) { mkdirSync(dir, {recursive:true}); path = join(dir, file); }
  const db = new DatabaseSync(path);
  db.exec(`pragma journal_mode=wal;
    create table if not exists ad_rows(id integer primary key autoincrement, brand text not null, platform text not null, date text not null, date_to text not null, campaign text not null default '', adset text not null default '', ad text not null default '', m text not null, import_id text, unique(brand,platform,date,date_to,campaign,adset,ad));
    create table if not exists ad_imports(id text primary key, brand text not null, platform text not null, name text not null, rows integer not null default 0, date_from text, date_to text, created text not null);
    create table if not exists ad_targets(brand text primary key, data text not null);
    create index if not exists ad_rows_date on ad_rows(brand, date);
    create index if not exists ad_rows_import on ad_rows(import_id);`);
  const stamp = () => now().toISOString();
  const tx = fn => { db.exec('begin immediate'); try { const r = fn(); db.exec('commit'); return r; } catch (e) { db.exec('rollback'); throw e; } };

  function cleanRow(r) {
    if (!r || typeof r !== 'object') fail('Each row must be an object.');
    const date = text(r.date, 10), dateTo = text(r.dateTo || r.date, 10);
    if (!validDate(date) || !validDate(dateTo) || dateTo < date) fail(`Invalid date on a row: ${date || 'missing'}.`);
    const m = {};
    for (const k of NUM) { if (r[k] == null || r[k] === '') { m[k] = null; continue; } const n = Number(r[k]); if (!Number.isFinite(n) || n < 0 || n > 1e12) fail(`Invalid ${k} value.`); m[k] = Math.round(n * 100) / 100; }
    return {date, dateTo, platform: platforms.some(p => p.id === r.platform) ? r.platform : 'other', campaign: text(r.campaign, 200) || '(no campaign name)', adset: text(r.adset, 200), ad: text(r.ad, 200), m};
  }
  // Re-importing an overlapping export replaces matching rows instead of double counting.
  function importRows({brand, platform, name, importId, rows}) {
    if (!brands.some(b => b.id === brand)) fail('Choose a brand.');
    if (!Array.isArray(rows) || !rows.length) fail('No rows to import.');
    if (rows.length > 5000) fail('Send at most 5,000 rows at a time.');
    const clean = rows.map(cleanRow);
    return tx(() => {
      let id = importId ? text(importId, 60) : '';
      if (id && !db.prepare('select id from ad_imports where id=? and brand=?').get(id, brand)) fail('This import no longer exists.', 404);
      if (!id) { id = randomUUID(); db.prepare('insert into ad_imports(id,brand,platform,name,created) values(?,?,?,?,?)').run(id, brand, platforms.some(p => p.id === platform) ? platform : 'other', text(name, 160) || 'Import', stamp()); }
      const put = db.prepare(`insert into ad_rows(brand,platform,date,date_to,campaign,adset,ad,m,import_id) values(?,?,?,?,?,?,?,?,?)
        on conflict(brand,platform,date,date_to,campaign,adset,ad) do update set m=excluded.m, import_id=excluded.import_id`);
      for (const r of clean) put.run(brand, r.platform, r.date, r.dateTo, r.campaign, r.adset, r.ad, JSON.stringify(r.m), id);
      refreshImports();
      return id;
    });
  }
  function refreshImports() {
    db.exec(`update ad_imports set rows=(select count(*) from ad_rows where import_id=ad_imports.id), date_from=(select min(date) from ad_rows where import_id=ad_imports.id), date_to=(select max(date_to) from ad_rows where import_id=ad_imports.id);
      delete from ad_imports where rows=0;`);
  }
  function deleteImport({id}) { tx(() => { db.prepare('delete from ad_rows where import_id=?').run(String(id)); db.prepare('delete from ad_imports where id=?').run(String(id)); }); }
  function saveTargets({brand, targets}) {
    if (!brandIds.includes(brand)) fail('Choose a brand.');
    const clean = cleanTargets(targets, brand);
    db.prepare('insert into ad_targets(brand,data) values(?,?) on conflict(brand) do update set data=excluded.data').run(brand, JSON.stringify(clean));
    return clean;
  }
  function state({brand='all', from='', to=''} = {}) {
    const where = [], args = [];
    if (brand !== 'all') { if (!brandIds.includes(brand)) fail('Choose a brand.'); where.push('brand=?'); args.push(brand); }
    if (from) { if (!validDate(from)) fail('Invalid start date.'); where.push('date>=?'); args.push(from); }
    if (to) { if (!validDate(to)) fail('Invalid end date.'); where.push('date<=?'); args.push(to); }
    const sql = where.length ? ' where ' + where.join(' and ') : '';
    const rows = db.prepare(`select brand,platform,date,date_to,campaign,adset,ad,m from ad_rows${sql} order by date limit 50000`).all(...args).map(r => ({brand:r.brand, platform:r.platform, date:r.date, dateTo:r.date_to, campaign:r.campaign, adset:r.adset, ad:r.ad, ...json(r.m, {})}));
    const range = db.prepare(`select min(date) min, max(date_to) max from ad_rows${brand !== 'all' ? ' where brand=?' : ''}`).get(...(brand !== 'all' ? [brand] : []));
    return {
      rows,
      range:{min:range.min || null, max:range.max || null},
      imports:db.prepare('select * from ad_imports order by created desc limit 200').all().map(i => ({id:i.id, brand:i.brand, platform:i.platform, name:i.name, rows:i.rows, from:i.date_from, to:i.date_to, created:i.created})),
      targets:Object.fromEntries(brandIds.map(b => { const row = db.prepare('select data from ad_targets where brand=?').get(b); return [b, cleanTargets(row ? json(row.data, {}) : {}, b)]; })),
    };
  }
  const actions = {'rows.import':importRows, 'import.delete':deleteImport, 'targets.save':saveTargets};
  function act(payload) { const run = actions[payload?.action] || fail('Unknown action.'); return {result:run(payload) ?? null}; }
  return {state, act, close:() => db.close()};
}
