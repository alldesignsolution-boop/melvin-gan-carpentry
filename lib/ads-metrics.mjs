// Performance-marketing engine shared by the browser and tests: CSV mapping, roll-ups, health checks and advice.
export const NUM = ['spend','impressions','reach','clicks','clicksAll','lpv','v3s','thruplay','v25','v50','v75','v100','engagements','conversations','leads','atc','checkouts','purchases','revenue'];
export const fieldLabels = {spend:'Amount spent (RM)',impressions:'Impressions',reach:'Reach',clicks:'Link clicks',clicksAll:'Clicks (all)',lpv:'Landing page views',v3s:'3-second video plays',thruplay:'ThruPlays',v25:'Video plays at 25%',v50:'Video plays at 50%',v75:'Video plays at 75%',v100:'Video plays at 100%',engagements:'Post engagements',conversations:'Messaging conversations started',leads:'Leads',atc:'Adds to cart',checkouts:'Checkouts initiated',purchases:'Purchases',revenue:'Purchase value (RM)'};
export const platforms = [{id:'meta',name:'Meta'},{id:'google',name:'Google'},{id:'tiktok',name:'TikTok'},{id:'other',name:'Other'}];
export const objectives = [{id:'messages',name:'WhatsApp / Messenger chats'},{id:'leads',name:'Leads (forms & sign-ups)'},{id:'sales',name:'Online sales'}];

// ---------- CSV import ----------
const currency = /\((?:myr|rm|usd|sgd|eur|gbp|aud|idr|thb|php|hkd|cny)\)/g;
export const normHeader = h => String(h || '').replace(/^﻿/, '').toLowerCase().replace(currency, '').replace(/[-_]/g, ' ').replace(/[^a-z0-9%() ]+/g, ' ').replace(/\s+/g, ' ').trim();
// Order matters: specific columns claim their header before broader aliases can.
const aliases = [
  ['date', ['reporting starts','day','date','start date','reporting start','stat time','time','week']],
  ['dateTo', ['reporting ends','end date','reporting end']],
  ['platform', ['platform','channel','network','publisher platform']],
  ['adset', ['ad set name','ad group name','ad group','ad set','adgroup name','adgroup']],
  ['ad', ['ad name','ad']],
  ['campaign', ['campaign name','campaign']],
  ['resultType', ['result indicator','result type','results type']],
  ['revenue', ['purchases conversion value','website purchases conversion value','conv value','conversion value','total conversion value','total purchase value','purchase value','total complete payment value','revenue']],
  ['spend', ['amount spent','cost','spend','total cost']],
  ['impressions', ['impressions','impr']],
  ['reach', ['reach']],
  ['clicksAll', ['clicks (all)','all clicks']],
  ['clicks', ['link clicks','clicks (destination)','destination clicks','clicks','outbound clicks']],
  ['lpv', ['landing page views','website landing page views']],
  ['v25', ['video plays at 25%','video views at 25%','video played to 25%']],
  ['v50', ['video plays at 50%','video views at 50%','video played to 50%']],
  ['v75', ['video plays at 75%','video views at 75%','video played to 75%']],
  ['v100', ['video plays at 100%','video views at 100%','video played to 100%','video completions']],
  ['v3s', ['3 second video plays','video plays at 3 seconds','2 second video views','video views (2s)','video views']],
  ['thruplay', ['thruplays','thruplay','6 second video views']],
  ['engagements', ['post engagements','post engagement','engagements','interactions']],
  ['conversations', ['messaging conversations started','whatsapp conversations started','conversations started','conversations']],
  ['leads', ['leads','on facebook leads','meta leads','website leads','leads (form)','form submissions','conversions']],
  ['atc', ['adds to cart','website adds to cart','add to cart','adds to cart (website)']],
  ['checkouts', ['checkouts initiated','website checkouts initiated','initiate checkout','checkouts']],
  ['purchases', ['purchases','website purchases','complete payment']],
  ['results', ['results']],
];
export function mapHeaders(headers) {
  const norm = headers.map(normHeader), used = new Set(), map = {};
  for (const [key, list] of aliases) for (const a of list) {
    let i = norm.findIndex((h, j) => !used.has(j) && h === a);
    if (i < 0 && a.length >= 5) i = norm.findIndex((h, j) => !used.has(j) && h.startsWith(a) && /[ (]/.test(h[a.length] || ''));
    if (i >= 0) { map[key] = i; used.add(i); break; }
  }
  return map;
}
export function parseCsvText(text) {
  const src = String(text || '').replace(/^﻿/, ''), first = src.split(/\r?\n/, 1)[0];
  const delim = [',', ';', '\t'].sort((a, b) => first.split(b).length - first.split(a).length)[0];
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"') { if (src[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}
export function toNumber(v) {
  const s = String(v ?? '').trim(); if (!s || /^[-–—]$/.test(s)) return 0;
  const n = Number(s.replace(/[^\d.\-]/g, '')); return Number.isFinite(n) && n > 0 ? n : 0;
}
const months = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const iso = (y, m, d) => { const s = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`; return validDate(s) ? s : ''; };
export const validDate = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
export function toDate(v) {
  const s = String(v ?? '').trim(); let m;
  if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return iso(m[1], m[2], m[3]);
  if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/))) { const a = +m[1], b = +m[2]; return b > 12 ? iso(m[3], a, b) : iso(m[3], b, a); } // Malaysian D/M/Y unless impossible
  if ((m = s.match(/^([a-z]{3})[a-z]*\.? (\d{1,2}),? (\d{4})/i)) && months[m[1].toLowerCase()]) return iso(m[3], months[m[1].toLowerCase()], m[2]);
  if ((m = s.match(/^(\d{1,2}) ([a-z]{3})[a-z]* (\d{4})/i)) && months[m[2].toLowerCase()]) return iso(m[3], months[m[2].toLowerCase()], m[1]);
  return '';
}
const guessPlatform = (v, fallback) => { const s = String(v || '').toLowerCase(); return /facebook|instagram|meta|messenger|audience network/.test(s) ? 'meta' : /google|youtube|search|display|pmax/.test(s) ? 'google' : /tiktok/.test(s) ? 'tiktok' : fallback; };

// Returns {rows, skipped, columns, warnings}. Rows carry canonical numeric fields only.
export function parseAdsCsv(text, {platform = 'meta', objective = 'leads', from = '', to = ''} = {}) {
  const table = parseCsvText(text);
  let h = table.slice(0, 12).findIndex(r => Object.keys(mapHeaders(r)).filter(k => NUM.includes(k)).length >= 2);
  if (h < 0) return {rows: [], skipped: 0, columns: [], warnings: ['No ad metrics found. Export a table with at least Amount spent and Impressions.']};
  const map = mapHeaders(table[h]), get = (r, k) => map[k] === undefined ? '' : r[map[k]];
  const warnings = [], rows = []; let skipped = 0;
  if (map.date === undefined && !validDate(from)) warnings.push('The file has no date column. Choose the period it covers before importing.');
  if (map.clicks === undefined && map.clicksAll !== undefined) warnings.push('Using “Clicks (all)” because the file has no “Link clicks” column — CTR will look higher than link CTR.');
  for (const r of table.slice(h + 1)) {
    const campaign = String(get(r, 'campaign')).trim(), label = [campaign, get(r, 'adset'), get(r, 'ad')].join(' ').trim();
    if (/^total/i.test(campaign) || /^total/i.test(String(r[0] || '').trim())) { skipped++; continue; }
    const date = toDate(get(r, 'date')) || (validDate(from) ? from : ''), dateTo = toDate(get(r, 'dateTo')) || (map.date === undefined && validDate(to) ? to : date);
    const out = {date, dateTo: dateTo < date ? date : dateTo, platform: guessPlatform(get(r, 'platform'), platform), campaign: campaign || '(no campaign name)', adset: String(get(r, 'adset')).trim(), ad: String(get(r, 'ad')).trim()};
    for (const k of NUM) out[k] = map[k] === undefined ? null : toNumber(get(r, k)); // null = column not in this export
    if (map.clicks === undefined && map.clicksAll !== undefined) out.clicks = out.clicksAll;
    const results = toNumber(get(r, 'results')), type = String(get(r, 'resultType')).toLowerCase();
    if (results) { const k = /purchase|payment/.test(type) ? 'purchases' : /messag|conversation|whatsapp/.test(type) ? 'conversations' : /lead|form|registration|sign/.test(type) ? 'leads' : !type ? {sales: 'purchases', messages: 'conversations', leads: 'leads'}[objective] : ''; if (k && !out[k]) out[k] = results; }
    if (!date || (!label && !out.spend && !out.impressions)) { skipped++; continue; }
    if (!NUM.some(k => out[k])) { skipped++; continue; }
    rows.push(out);
  }
  return {rows, skipped, columns: Object.keys(map), warnings};
}

// ---------- Roll-ups ----------
// `by[field]` holds the base totals over only the rows that report that field, so a ratio isn't diluted by
// rows from an export that lacks the column (e.g. TikTok rows have no landing page views).
const bases = ['spend', 'impressions', 'clicks', 'lpv', 'v3s'];
export function sumRows(rows) {
  const t = Object.fromEntries(NUM.map(k => [k, 0])), by = Object.fromEntries(NUM.map(k => [k, {n: 0, ...Object.fromEntries(bases.map(b => [b, 0]))}]));
  for (const r of rows) for (const k of NUM) { if (r[k] == null || r[k] === '') continue; t[k] += Number(r[k]) || 0; by[k].n++; for (const b of bases) by[k][b] += Number(r[b]) || 0; }
  return {...t, by};
}
const base = (t, f, b) => t.by?.[f]?.n ? t.by[f][b] : t[b];
const missing = (t, f) => t.by?.[f]?.n === 0 && !t[f];
export function groupRows(rows, level = 'campaign') {
  const keyOf = r => level === 'ad' ? `${r.campaign} › ${r.adset} › ${r.ad}` : level === 'adset' ? `${r.campaign} › ${r.adset}` : r.campaign;
  const groups = new Map();
  for (const r of rows) { const k = keyOf(r); if (!groups.has(k)) groups.set(k, {name: k, platform: r.platform, rows: []}); groups.get(k).rows.push(r); }
  return [...groups.values()].map(g => ({...g, totals: sumRows(g.rows)}));
}
export function dailySeries(rows, from, to) {
  const days = []; if (!validDate(from) || !validDate(to)) return days;
  for (let d = new Date(from + 'T00:00:00Z'); d <= new Date(to + 'T00:00:00Z') && days.length < 400; d.setUTCDate(d.getUTCDate() + 1)) days.push(d.toISOString().slice(0, 10));
  const by = new Map(days.map(d => [d, []])); for (const r of rows) by.get(r.date)?.push(r);
  return days.map(d => ({date: d, totals: sumRows(by.get(d))}));
}

// ---------- Targets & healthy levels ----------
// Bench pairs are [healthy, watch]; anything past "watch" is poor. Calibrated for Malaysian Meta/TikTok traffic.
export const defaultBench = {cpm:[20,35], frequency:[2.5,4], ctr:[1,0.7], ctrAll:[2,1.2], cpc:[1.5,3], hookRate:[30,20], holdRate:[25,15], completionRate:[15,8], engagementRate:[2,1], lpvRate:[75,55], convRate:[40,25], leadCvr:[10,5], atcRate:[8,4], checkoutRate:[50,30], purchaseRate:[50,30], cvr:[2.5,1], closeRate:[10,5]};
export const lowerIsBetter = new Set(['cpm','frequency','cpc']);
export const defaultTargets = brand => ({objective: {hoga:'messages', digitalads:'leads', hankidz:'leads', redpacket:'sales'}[brand] || 'leads', margin:40, targetRoas:3, targetCpa:60, targetCpl:30, targetCpConv:15, targetCac:800, bench:{}});
export function cleanTargets(input, brand) {
  const d = defaultTargets(brand), v = {...d, ...(input || {})}, num = (x, lo, hi, fb) => { const n = Number(x); return Number.isFinite(n) && n >= lo && n <= hi ? n : fb; };
  const bench = {};
  for (const [k, [g, w]] of Object.entries(defaultBench)) { const b = v.bench?.[k]; if (Array.isArray(b)) { const ng = num(b[0], 0, 100000, g), nw = num(b[1], 0, 100000, w); if (ng !== g || nw !== w) bench[k] = [ng, nw]; } }
  return {objective: objectives.some(o => o.id === v.objective) ? v.objective : d.objective, margin: num(v.margin, 1, 100, d.margin), targetRoas: num(v.targetRoas, 0.1, 100, d.targetRoas), targetCpa: num(v.targetCpa, 0.01, 1e6, d.targetCpa), targetCpl: num(v.targetCpl, 0.01, 1e6, d.targetCpl), targetCpConv: num(v.targetCpConv, 0.01, 1e6, d.targetCpConv), targetCac: num(v.targetCac, 0.01, 1e7, d.targetCac), bench};
}
const ratio = (a, b) => b > 0 ? a / b : null;
const pct = (a, b) => b > 0 ? 100 * a / b : null;

// Each metric: how it's computed, how it's judged, and what to do when it slips.
export const groups = [
  {id:'delivery', name:'Reach & cost', q:'Are we buying attention at a fair price?'},
  {id:'creative', name:'Creative · scroll-stopping power', q:'Does the design or video make people stop and watch?'},
  {id:'traffic', name:'Click & landing', q:'Does the ad earn the click, and does the page load?'},
  {id:'conversion', name:'Conversion', q:'Do visitors and chats turn into leads or sales?'},
  {id:'revenue', name:'Revenue & profit', q:'Is the spend paying back?'},
  {id:'crm', name:'Sales follow-through', q:'Do ad leads become paying clients? (from your Leads board)'},
];
export const metricDefs = [
  {key:'spend', group:'delivery', label:'Amount spent', fmt:'money', calc:t => t.spend, what:'Total ad spend in the period.'},
  {key:'impressions', group:'delivery', label:'Impressions', fmt:'int', calc:t => t.impressions, what:'Times your ads were shown.'},
  {key:'reach', group:'delivery', label:'Reach', fmt:'int', calc:t => t.reach || null, what:'Unique people who saw the ads (summed across rows, so it can overstate true reach).'},
  {key:'frequency', group:'delivery', label:'Frequency', fmt:'dec', calc:t => t.reach ? ratio(base(t, 'reach', 'impressions'), t.reach) : null, bench:'frequency', what:'Average times each person saw an ad (impressions ÷ reach).',
    low:'The same people are seeing your ads too often. Expect creative fatigue: CTR drops and CPM climbs.',
    fixes:['Refresh creatives — add 2–3 new concepts every 1–2 weeks','Broaden the audience or switch to Advantage+ / broad targeting','Set a frequency cap on reach campaigns','Exclude people who already messaged, enquired or bought']},
  {key:'cpm', group:'delivery', label:'CPM (cost per 1,000 impressions)', fmt:'money2', calc:t => ratio(t.spend * 1000, t.impressions), bench:'cpm', what:'What you pay for 1,000 impressions — the price of attention.',
    low:'Attention is expensive. Usually a narrow or overlapping audience, low ad-quality ranking, or a competitive season (festive, 11.11, year-end).',
    fixes:['Broaden targeting; merge ad sets that compete for the same people','Improve relevance — ads with low engagement get charged more','Use Advantage+ placements instead of feeds-only','Avoid launching big pushes during peak auction weeks unless the offer is strong']},
  {key:'hookRate', group:'creative', label:'Hook rate (3-sec views ÷ impressions)', fmt:'pct', calc:t => t.v3s ? pct(t.v3s, base(t, 'v3s', 'impressions')) : null, bench:'hookRate', what:'Share of impressions that watched at least 3 seconds — does the opening stop the scroll?',
    low:'The first 3 seconds are not stopping the scroll. The opening frame looks like every other ad, or it starts slow (logo, intro, empty room).',
    fixes:['Open on the most striking visual — the finished result, a before/after, a face talking to camera','Put a bold text hook on screen in frame 1 (a question, number or promise)','Cut the intro: no logo or slow pan in the first 2 seconds','Use motion or a pattern interrupt; test 3–5 different openings on the same body','Design for sound-off: captions on from the first second']},
  {key:'holdRate', group:'creative', label:'Hold rate (ThruPlays ÷ 3-sec views)', fmt:'pct', calc:t => t.v3s && t.thruplay ? pct(t.thruplay, base(t, 'thruplay', 'v3s')) : null, bench:'holdRate', what:'Of people who stopped, how many kept watching (15s or to the end).',
    low:'The hook works but the middle loses people — pacing drags, the story is unclear, or the payoff comes too late.',
    fixes:['Tighten to 15–25 seconds; cut every pause and repeated shot','Change shot every 1–2 seconds; add progress (step 1, 2, 3)','Show proof early: reviews, numbers, real customer footage','Tease the payoff at the start (“wait for the final reveal”)']},
  {key:'completionRate', group:'creative', label:'Video completion (100% ÷ 3-sec views)', fmt:'pct', calc:t => t.v3s && t.v100 ? pct(t.v100, base(t, 'v100', 'v3s')) : null, bench:'completionRate', what:'Share of viewers who watched to the end.',
    low:'Few people reach the end, where the CTA usually is.',
    fixes:['Move the offer and call-to-action earlier (by second 8–10)','Shorten the video or create a 6–10s cut','End with a clear next step on screen']},
  {key:'engagementRate', group:'creative', label:'Engagement rate', fmt:'pct', calc:t => t.engagements ? pct(t.engagements, base(t, 'engagements', 'impressions')) : null, bench:'engagementRate', what:'Reactions, comments, shares and saves ÷ impressions.',
    low:'The content isn’t sparking reactions — the platform reads that as low relevance and charges more (higher CPM).',
    fixes:['Ask a question or invite a comment (“Which layout would you pick?”)','Use relatable, native-looking content instead of polished brochure designs','Reply to comments fast to keep social proof visible']},
  {key:'ctr', group:'traffic', label:'CTR (link click-through rate)', fmt:'pct', calc:t => missing(t, 'clicks') ? null : pct(t.clicks, base(t, 'clicks', 'impressions')), bench:'ctr', what:'Link clicks ÷ impressions — does the ad earn the click?',
    low:'People see the ad but don’t click. The design or video hook isn’t attractive enough, the offer isn’t clear, or the audience isn’t the right one.',
    fixes:['Test new hooks and thumbnails — the first frame and headline drive most of CTR','Make the offer obvious: price, promo, free consultation or a clear benefit','Add a direct call-to-action in the visual and the copy (“WhatsApp us for a free layout”)','Try UGC / real-customer content against polished designs','Check placements — exclude Audience Network if it drags CTR down','If CPM is cheap but CTR poor, the audience may be wrong — test interests or lookalikes']},
  {key:'ctrAll', group:'traffic', label:'CTR (all clicks)', fmt:'pct', calc:t => t.clicksAll ? pct(t.clicksAll, base(t, 'clicksAll', 'impressions')) : null, bench:'ctrAll', what:'All clicks (likes, profile, “see more”, link) ÷ impressions.',
    low:'Low overall interaction with the ad.', fixes:['See CTR (link) advice — it applies here too'],
    note:t => t.clicksAll && t.clicks && t.clicksAll > 3 * t.clicks ? 'All-clicks is over 3× link clicks — people interact but don’t go to the destination. Make the next step clearer.' : ''},
  {key:'cpc', group:'traffic', label:'CPC (cost per link click)', fmt:'money2', calc:t => t.clicks ? ratio(base(t, 'clicks', 'spend'), t.clicks) : null, bench:'cpc', what:'Spend ÷ link clicks.',
    low:'Clicks are expensive — the product of a high CPM and/or a low CTR.',
    fixes:['Fix whichever is weaker: CPM (audience & relevance) or CTR (creative & offer)','Shift budget to the ads with the lowest CPC that still convert']},
  {key:'lpvRate', group:'traffic', label:'Landing page view rate (LPV ÷ link clicks)', fmt:'pct', calc:t => t.lpv ? pct(t.lpv, base(t, 'lpv', 'clicks')) : null, bench:'lpvRate', what:'Share of clicks where the page actually loaded.',
    low:'People click but leave before the page loads — slow page, broken link, or accidental clicks.',
    fixes:['Test page speed (aim under 3 seconds on mobile); compress images and remove heavy scripts','Check the link and that the Meta Pixel fires on the landing page','Exclude Audience Network / in-app placements that create accidental clicks','Use an instant form or WhatsApp destination if the website is slow']},
  {key:'costPerLpv', group:'traffic', label:'Cost per landing page view', fmt:'money2', calc:t => t.lpv ? ratio(base(t, 'lpv', 'spend'), t.lpv) : null, what:'Spend ÷ landing page views.'},
  {key:'conversations', group:'conversion', label:'Conversations started', fmt:'int', calc:t => t.conversations || null, what:'WhatsApp / Messenger / IG chats started from ads.'},
  {key:'convRate', group:'conversion', label:'Click → chat rate', fmt:'pct', calc:t => t.conversations ? pct(t.conversations, base(t, 'conversations', 'clicks')) : null, bench:'convRate', what:'Conversations started ÷ link clicks.',
    low:'People open WhatsApp but don’t send the message.',
    fixes:['Pre-fill a friendly first message in the click-to-WhatsApp setup','Set a greeting / quick replies so the first step is effortless','Make the ad promise match the chat (“Send ‘LAYOUT’ for a free 3D plan”)','Make sure the ad mentions WhatsApp so the click isn’t a surprise']},
  {key:'costPerConv', group:'conversion', label:'Cost per conversation', fmt:'money2', calc:t => t.conversations ? ratio(base(t, 'conversations', 'spend'), t.conversations) : null, target:'targetCpConv', what:'Spend ÷ conversations started.',
    low:'Each chat costs more than your target.',
    fixes:['Look at the weakest earlier step — CPM, CTR or click → chat rate — and fix that first','Move budget to the 1–2 ads with the cheapest conversations','Test a stronger offer or lead magnet in the ad']},
  {key:'leads', group:'conversion', label:'Leads', fmt:'int', calc:t => t.leads || null, what:'Form submissions / sign-ups recorded by the ad platform.'},
  {key:'leadCvr', group:'conversion', label:'Lead conversion rate (leads ÷ visits)', fmt:'pct', calc:t => t.leads ? pct(t.leads, base(t, 'leads', 'lpv') || base(t, 'leads', 'clicks')) : null, bench:'leadCvr', what:'Leads ÷ landing page views (or link clicks when no LPV data).',
    low:'People arrive but don’t enquire. Usually an offer, trust or form problem — not the ad.',
    fixes:['Match the page headline to the ad promise (same words, same image)','Shorten the form to 3–4 fields; add a WhatsApp option','Add trust: reviews, portfolio photos, years in business, guarantees','Give a reason to act now — limited slots, a free design consult, a promo deadline','Put the call-to-action above the fold on mobile']},
  {key:'cpl', group:'conversion', label:'Cost per lead (CPL)', fmt:'money2', calc:t => t.leads ? ratio(base(t, 'leads', 'spend'), t.leads) : null, target:'targetCpl', what:'Spend ÷ leads.',
    low:'Leads cost more than your target.',
    fixes:['Find the weakest step (CPM → CTR → landing → form) and fix it first','Pause ads with CPL above 2× target after they spend 2× target','Test an instant form against the website form','Scale the cheapest ad sets by 20% every 3–4 days rather than all at once']},
  {key:'atcRate', group:'conversion', label:'Add-to-cart rate', fmt:'pct', calc:t => t.atc ? pct(t.atc, base(t, 'atc', 'lpv') || base(t, 'atc', 'clicks')) : null, bench:'atcRate', what:'Adds to cart ÷ landing page views.',
    low:'Visitors aren’t convinced by the product page.',
    fixes:['Send traffic to the exact product shown in the ad','Improve product photos, show price clearly and add reviews','Test the offer: bundle, free shipping threshold, limited promo']},
  {key:'checkoutRate', group:'conversion', label:'Cart → checkout rate', fmt:'pct', calc:t => t.atc && t.checkouts ? pct(t.checkouts, t.atc) : null, bench:'checkoutRate', what:'Checkouts started ÷ adds to cart.',
    low:'People add to cart then stall — often a surprise at the cart (shipping cost, delivery time).',
    fixes:['Show shipping cost and delivery time on the product page','Offer free shipping over a threshold','Run cart-abandonment retargeting and emails / WhatsApp reminders']},
  {key:'purchaseRate', group:'conversion', label:'Checkout completion rate', fmt:'pct', calc:t => t.checkouts && t.purchases ? pct(t.purchases, t.checkouts) : null, bench:'purchaseRate', what:'Purchases ÷ checkouts started.',
    low:'Checkout is losing buyers at the payment step.',
    fixes:['Add local payment methods (FPX, e-wallets, BNPL)','Allow guest checkout; cut form fields','Check for checkout errors on mobile']},
  {key:'purchases', group:'conversion', label:'Purchases', fmt:'int', calc:t => t.purchases || null, what:'Purchases recorded by the ad platform.'},
  {key:'cvr', group:'conversion', label:'Purchase conversion rate', fmt:'pct', calc:t => t.purchases ? pct(t.purchases, base(t, 'purchases', 'lpv') || base(t, 'purchases', 'clicks')) : null, bench:'cvr', what:'Purchases ÷ landing page views (or clicks).',
    low:'Traffic arrives but doesn’t buy. If CTR is healthy, the problem is the page or offer, not the ad.',
    fixes:['Match page to ad (same product, same price, same promo)','Strengthen the offer and urgency','Add reviews and guarantees near the buy button','Speed up mobile pages and the checkout']},
  {key:'cpa', group:'conversion', label:'Cost per purchase (CPA)', fmt:'money2', calc:t => t.purchases ? ratio(base(t, 'purchases', 'spend'), t.purchases) : null, target:'targetCpa', what:'Spend ÷ purchases.',
    low:'Each sale costs more than your target.',
    fixes:['Find the weakest funnel step and fix that first','Cut ads with CPA above 2× target after they spend 2× target','Raise AOV (bundles, upsells) so a higher CPA is still profitable']},
  {key:'revenue', group:'revenue', label:'Purchase value', fmt:'money', calc:t => t.revenue || null, what:'Revenue attributed by the ad platform.'},
  {key:'roas', group:'revenue', label:'ROAS (return on ad spend)', fmt:'x', calc:t => t.revenue ? ratio(t.revenue, base(t, 'revenue', 'spend')) : null, roas:true, what:'Revenue ÷ spend. Healthy when it beats your target; losing money below break-even.',
    low:'Ads are not paying back. Below break-even ROAS, each extra ringgit of spend loses money.',
    fixes:['Pause or cut budget on campaigns below break-even ROAS for 7+ days','Move budget to the campaigns above target','Raise AOV — bundles, upsells, free-shipping thresholds','Retarget warm audiences (visitors, add-to-carts) which usually return 2–3× more','Fix the weakest funnel metric below before adding budget']},
  {key:'breakEvenRoas', group:'revenue', label:'Break-even ROAS', fmt:'x', calc:(t, c) => c.targets.margin ? 100 / c.targets.margin : null, what:'1 ÷ gross margin. ROAS below this loses money on every sale.'},
  {key:'aov', group:'revenue', label:'Average order value (AOV)', fmt:'money2', calc:t => t.purchases && t.revenue ? ratio(t.revenue, t.purchases) : null, what:'Revenue ÷ purchases.'},
  {key:'profit', group:'revenue', label:'Profit after ad spend', fmt:'money', calc:(t, c) => t.revenue ? t.revenue * c.targets.margin / 100 - base(t, 'revenue', 'spend') : null, sign:true, what:'Revenue × margin − ad spend.',
    low:'Ads are losing money after product cost.', fixes:['See ROAS advice']},
  {key:'poas', group:'revenue', label:'POAS (profit on ad spend)', fmt:'x', calc:(t, c) => t.revenue ? ratio(t.revenue * c.targets.margin / 100, base(t, 'revenue', 'spend')) : null, what:'Gross profit ÷ spend. Above 1.0× means the ads make money.'},
  {key:'crmLeads', group:'crm', label:'Leads on your board', fmt:'int', calc:(t, c) => c.crm ? c.crm.leads : null, what:'Leads created on the Leads board in this period (all sources).'},
  {key:'costPerCrmLead', group:'crm', label:'Cost per board lead', fmt:'money2', calc:(t, c) => c.crm && c.crm.leads ? ratio(t.spend, c.crm.leads) : null, target:'targetCpl', what:'Ad spend ÷ leads on the board — your real cost per lead.',
    low:'Real leads cost more than target, or chats aren’t being logged as leads.', fixes:['Make sure every ad chat ends up on the board (ManyChat intake)','Then follow CPL advice']},
  {key:'clients', group:'crm', label:'Clients won', fmt:'int', calc:(t, c) => c.crm ? c.crm.clients : null, what:'Leads moved to Onboarded in this period.'},
  {key:'closeRate', group:'crm', label:'Lead → client rate', fmt:'pct', calc:(t, c) => c.crm && c.crm.leads ? pct(c.crm.clients, c.crm.leads) : null, bench:'closeRate', what:'Clients ÷ leads on the board.',
    low:'Leads come in but don’t close — lead quality or sales follow-up.',
    fixes:['Reply within 5 minutes; speed matters more than anything else','Add qualifying questions to the form / chat (budget, timeline, property type)','Make the ad clearer about price range so tyre-kickers self-select out','Follow up at least 3 times (day 1, 3, 7) before marking lost']},
  {key:'cac', group:'crm', label:'Cost per client (CAC)', fmt:'money', calc:(t, c) => c.crm && c.crm.clients ? ratio(t.spend, c.crm.clients) : null, target:'targetCac', what:'Ad spend ÷ clients won.',
    low:'Winning a client costs more than your target.', fixes:['Improve lead → client rate first — it is usually cheaper than buying more leads','Then lower CPL with the creative and landing fixes above']},
  {key:'crmRoas', group:'crm', label:'Closed-deal ROAS', fmt:'x', calc:(t, c) => c.crm && c.crm.value ? ratio(c.crm.value, t.spend) : null, roas:true, what:'Deal value of clients won ÷ ad spend.'},
];
export const metricByKey = Object.fromEntries(metricDefs.map(m => [m.key, m]));

export function evaluate(def, value, targets) {
  if (value == null || !Number.isFinite(value)) return 'na';
  if (def.roas) { const be = 100 / targets.margin; return value >= targets.targetRoas ? 'good' : value >= be ? 'watch' : 'poor'; }
  if (def.sign) return value >= 0 ? 'good' : 'poor';
  if (def.target) { const t = targets[def.target]; return value <= t ? 'good' : value <= t * 1.3 ? 'watch' : 'poor'; }
  if (def.bench) { const [g, w] = targets.bench?.[def.bench] || defaultBench[def.bench]; return lowerIsBetter.has(def.bench) ? (value <= g ? 'good' : value <= w ? 'watch' : 'poor') : (value >= g ? 'good' : value >= w ? 'watch' : 'poor'); }
  return 'info';
}
export function healthyText(def, targets) {
  if (def.roas) return `≥ ${targets.targetRoas}× (break-even ${(100 / targets.margin).toFixed(2)}×)`;
  if (def.sign) return '≥ RM0';
  if (def.target) return `≤ RM${targets[def.target]}`;
  if (def.bench) { const [g] = targets.bench?.[def.bench] || defaultBench[def.bench], unit = def.fmt === 'pct' ? '%' : ''; return lowerIsBetter.has(def.bench) ? `≤ ${def.fmt.startsWith('money') ? 'RM' : ''}${g}${unit}` : `≥ ${g}${unit}`; }
  return '';
}
export function computeMetrics(totals, {targets, crm} = {}) {
  const ctx = {targets, crm}, out = {};
  for (const d of metricDefs) { const v = d.calc(totals, ctx); out[d.key] = {key: d.key, value: v == null || !Number.isFinite(v) ? null : v, status: evaluate(d, v, targets), note: d.note?.(totals) || ''}; }
  return out;
}
export function healthScore(m) {
  const scored = Object.values(m).filter(x => ['good', 'watch', 'poor'].includes(x.status));
  if (!scored.length) return null;
  return Math.round(scored.reduce((s, x) => s + ({good:100, watch:60, poor:15})[x.status], 0) / scored.length);
}

// ---------- Diagnosis ----------
// Cross-metric reads first (they explain *where* the funnel breaks), then each slipping metric with its fixes.
export function diagnose(m, {targets, prev} = {}) {
  const st = k => m[k]?.status, v = k => m[k]?.value, out = [], add = (severity, title, detail, actions, keys) => out.push({severity, title, detail, actions, keys});
  const good = k => st(k) === 'good', bad = k => st(k) === 'poor' || st(k) === 'watch', sev = k => st(k) === 'poor' ? 'poor' : 'watch';
  if (bad('ctr') && good('cpm')) add(sev('ctr'), 'Creative problem, not a cost problem', 'You are buying impressions cheaply but people aren’t clicking. The design, the video hook or the offer isn’t attractive enough.', metricByKey.ctr.fixes.slice(0, 4), ['ctr', 'cpm']);
  if (bad('ctr') && bad('cpm')) add('poor', 'Low relevance: expensive and ignored', 'High CPM together with low CTR means the platform rates the ads as low relevance for this audience. Fix the creative first, then the audience.', ['Launch 3–5 fresh creative concepts with stronger hooks', 'Broaden the audience and let the algorithm find responders', 'Review comments for negative feedback and hide/answer it'], ['ctr', 'cpm']);
  if (bad('hookRate') && !bad('holdRate') && v('holdRate') != null) add('watch', 'Weak opening, solid content', 'Viewers who get past the first 3 seconds keep watching — only the opening is losing them. Re-cut the first seconds rather than making a new video.', metricByKey.hookRate.fixes.slice(0, 3), ['hookRate', 'holdRate']);
  if (good('hookRate') && bad('holdRate')) add('watch', 'Hook works, story loses them', 'People stop for the first frame but drop off soon after. The middle of the video needs tightening.', metricByKey.holdRate.fixes, ['hookRate', 'holdRate']);
  if (good('ctr') && bad('lpvRate')) add(sev('lpvRate'), 'Clicks are leaking before the page loads', 'The ad gets clicks, but many visitors never see the page. This is a speed or tracking issue, not a creative issue.', metricByKey.lpvRate.fixes, ['ctr', 'lpvRate']);
  if (good('ctr') && (bad('leadCvr') || bad('cvr'))) add(sev(bad('cvr') ? 'cvr' : 'leadCvr'), 'Ad works, landing page or offer doesn’t', 'People like the ad enough to click, then don’t convert. Look at message match, the offer and the form/checkout — not the ad.', (bad('cvr') ? metricByKey.cvr : metricByKey.leadCvr).fixes, ['ctr', bad('cvr') ? 'cvr' : 'leadCvr']);
  if (good('ctr') && bad('convRate')) add('watch', 'Clicks don’t become chats', 'People tap through to WhatsApp but don’t send a message.', metricByKey.convRate.fixes, ['ctr', 'convRate']);
  if (bad('frequency') && prev && prev.ctr?.value && v('ctr') != null && v('ctr') < prev.ctr.value * 0.85) add('poor', 'Creative fatigue', `Frequency is ${v('frequency')?.toFixed(1)} and CTR fell ${Math.round(100 - 100 * v('ctr') / prev.ctr.value)}% vs the previous period — the audience has seen these ads too often.`, metricByKey.frequency.fixes, ['frequency', 'ctr']);
  if (st('roas') === 'poor') add('poor', 'Spending below break-even', `ROAS of ${v('roas')?.toFixed(2)}× is under your break-even ${(100 / targets.margin).toFixed(2)}× at a ${targets.margin}% margin — every extra ringgit loses money.`, metricByKey.roas.fixes, ['roas']);
  if ((v('crmLeads') || 0) >= 5 && bad('closeRate')) add('watch', 'Leads aren’t closing', 'Marketing is delivering leads, but few become clients. Check lead quality and sales follow-up speed before buying more leads.', metricByKey.closeRate.fixes, ['closeRate']);
  if (good('roas') && !bad('frequency') && !bad('cpm')) add('good', 'Room to scale', `ROAS is above target with healthy frequency and CPM. Raise budget 20% every 3–4 days and watch CPA and frequency.`, ['Increase budget on the top campaigns by ~20% at a time', 'Duplicate the winning ad set into a broader audience', 'Keep adding fresh creatives so frequency stays low'], ['roas']);
  const covered = new Set(out.flatMap(x => x.keys));
  for (const d of metricDefs) {
    const s = st(d.key);
    if ((s === 'poor' || s === 'watch') && d.fixes && !covered.has(d.key)) add(s, `${d.label} is ${s === 'poor' ? 'below a healthy level' : 'slipping'}`, d.low, d.fixes, [d.key]);
  }
  const rank = {poor:0, watch:1, good:2};
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

// Campaign-level problems hide inside healthy account averages; flag any campaign with ≥10% of spend that has a poor step.
export function campaignAlerts(list, totalSpend, targets) {
  const keys = ['hookRate', 'ctr', 'lpvRate', targets.objective === 'sales' ? 'cvr' : targets.objective === 'messages' ? 'convRate' : 'leadCvr', 'frequency', 'cpm'];
  return list.filter(g => totalSpend && g.totals.spend / totalSpend >= 0.1).flatMap(g => {
    const m = computeMetrics(g.totals, {targets}), poor = keys.filter(k => m[k].status === 'poor');
    if (!poor.length) return [];
    const first = metricByKey[poor[0]], share = Math.round(100 * g.totals.spend / totalSpend);
    return [{severity: 'poor', campaign: g.name, title: `${g.name}: ${poor.map(k => `${metricByKey[k].label.split(' (')[0]} ${fmt(m[k].value, metricByKey[k].fmt)}`).join(', ')}`, detail: `This campaign takes ${share}% of spend. ${first.low}`, actions: first.fixes.slice(0, 4), keys: poor}];
  });
}

// What to do with each campaign / ad set / ad.
export function verdict(t, targets) {
  const m = computeMetrics(t, {targets}), obj = targets.objective;
  const chats = obj === 'messages' ? t.conversations > 0 || !t.leads : !t.leads && t.conversations > 0;
  const [results, costKey, target] = obj === 'sales' ? [t.purchases, 'cpa', targets.targetCpa] : chats ? [t.conversations, 'costPerConv', targets.targetCpConv] : [t.leads, 'cpl', targets.targetCpl];
  const weak = ['hookRate', 'ctr', 'lpvRate', obj === 'sales' ? 'cvr' : obj === 'messages' ? 'convRate' : 'leadCvr', 'frequency', 'cpm'].map(k => ({k, s: m[k].status})).find(x => x.s === 'poor') || ['hookRate', 'ctr', 'lpvRate', 'frequency', 'cpm'].map(k => ({k, s: m[k].status})).find(x => x.s === 'watch');
  const fix = weak ? {hookRate:'Fix video hook', ctr:'Fix creative / offer', lpvRate:'Fix page speed', cvr:'Fix landing page', leadCvr:'Fix landing page / form', convRate:'Fix chat opener', frequency:'Refresh creative', cpm:'Broaden audience'}[weak.k] : '';
  if (!results && t.spend < target) return {id:'learning', label:'Learning', why:`Spent less than one target ${obj === 'sales' ? 'CPA' : 'cost per result'} — too early to judge.`, fix, m};
  if (!results && t.spend >= 2 * target) return {id:'pause', label:'Pause', why:`RM${Math.round(t.spend)} spent with no results (2× target).`, fix, m};
  if (obj === 'sales' && m.roas.value != null) {
    if (m.roas.status === 'good' && !weak) return {id:'scale', label:'Scale', why:`ROAS ${m.roas.value.toFixed(2)}× beats target.`, fix, m};
    if (m.roas.status !== 'poor') return {id:'optimise', label:'Optimise', why:`ROAS ${m.roas.value.toFixed(2)}× — profitable${m.roas.status === 'good' ? '' : ' but under target'}.`, fix, m};
    return {id:'fix', label:'Fix or cut', why:`ROAS ${m.roas.value.toFixed(2)}× is below break-even.`, fix, m};
  }
  const cost = m[costKey].value;
  if (cost == null) return {id:'learning', label:'Learning', why:'Not enough results yet.', fix, m};
  if (cost <= target && !weak) return {id:'scale', label:'Scale', why:`RM${cost.toFixed(2)} per result, under the RM${target} target.`, fix, m};
  if (cost <= target) return {id:'optimise', label:'Optimise', why:`RM${cost.toFixed(2)} per result is under the RM${target} target — fix the weak spot before adding budget.`, fix, m};
  if (cost <= target * 1.3) return {id:'optimise', label:'Optimise', why:`RM${cost.toFixed(2)} per result vs RM${target} target.`, fix, m};
  return {id:'fix', label:'Fix or cut', why:`RM${cost.toFixed(2)} per result — ${Math.round(100 * cost / target - 100)}% over target.`, fix, m};
}

// The saved goal, unless the data clearly has none of its results but plenty of another kind.
export function effectiveObjective(t, objective) {
  const count = {sales: t.purchases, messages: t.conversations, leads: t.leads};
  const top = Object.entries(count).sort((a, b) => b[1] - a[1])[0];
  if (!t.spend || !top[1] || count[objective] >= top[1] * 0.2) return objective;
  return count.purchases > 0 && objective !== 'sales' && count.purchases >= top[1] * 0.2 ? 'sales' : top[0];
}

// Funnel steps for the brand's objective.
export function funnel(t, objective, crm) {
  const steps = [['Impressions', t.impressions]];
  if (t.v3s) steps.push(['3-sec video views', t.v3s, 'hookRate']);
  steps.push(['Link clicks', t.clicks, 'ctr']);
  if (objective === 'messages') { steps.push(['Chats started', t.conversations, 'convRate']); }
  else { if (t.lpv) steps.push(['Landing page views', t.lpv, 'lpvRate']); if (objective === 'sales') { if (t.atc) steps.push(['Adds to cart', t.atc, 'atcRate']); if (t.checkouts) steps.push(['Checkouts', t.checkouts, 'checkoutRate']); steps.push(['Purchases', t.purchases, t.checkouts ? 'purchaseRate' : 'cvr']); } else steps.push(['Leads', t.leads, 'leadCvr']); }
  if (crm && objective !== 'sales') { steps.push(['Leads on board', crm.leads]); steps.push(['Clients won', crm.clients, 'closeRate']); }
  return steps.map(([label, value, metric], i) => ({label, value: value || 0, metric, rate: i && steps[i - 1][1] ? 100 * (value || 0) / steps[i - 1][1] : null}));
}

// ---------- Formatting ----------
export function fmt(value, kind) {
  if (value == null || !Number.isFinite(value)) return '—';
  const n = (x, d) => new Intl.NumberFormat('en-MY', {maximumFractionDigits: d, minimumFractionDigits: d}).format(x);
  if (kind === 'money') return (value < 0 ? '−RM' : 'RM') + n(Math.abs(value), Math.abs(value) >= 1000 ? 0 : 2);
  if (kind === 'money2') return 'RM' + n(value, 2);
  if (kind === 'pct') return n(value, value >= 10 ? 1 : 2) + '%';
  if (kind === 'x') return n(value, 2) + '×';
  if (kind === 'dec') return n(value, 2);
  return value >= 100000 ? n(value / 1000, 0) + 'k' : n(value, 0);
}

// ---------- Sample data (preview only, never saved) ----------
export function sampleRows(to, days = 60) {
  const end = new Date(to + 'T00:00:00Z'), rows = [];
  const ads = [
    {campaign:'Condo Makeover · Broad', adset:'Broad 25–55 KL/Selangor', ad:'Before/after reveal (video)', cpm:14, ctr:1.6, hook:38, hold:29, lpv:82, conv:0.5, fatigue:0},
    {campaign:'Condo Makeover · Broad', adset:'Broad 25–55 KL/Selangor', ad:'Designer talking head (video)', cpm:15, ctr:1.1, hook:24, hold:31, lpv:80, conv:0.45, fatigue:0},
    {campaign:'Kitchen Cabinet Promo', adset:'Homeowners interest', ad:'Price carousel', cpm:24, ctr:0.55, hook:0, hold:0, lpv:58, conv:0.35, fatigue:0},
    {campaign:'Kitchen Cabinet Promo', adset:'Homeowners interest', ad:'Slow pan showroom (video)', cpm:26, ctr:0.6, hook:14, hold:20, lpv:60, conv:0.3, fatigue:0},
    {campaign:'Retargeting · Website & IG', adset:'Engagers 180d', ad:'Testimonial (video)', cpm:38, ctr:2.1, hook:35, hold:34, lpv:85, conv:0.6, fatigue:1},
  ];
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end); d.setUTCDate(end.getUTCDate() - i); const date = d.toISOString().slice(0, 10), age = (days - i) / days;
    for (const a of ads) {
      const j = 0.8 + rnd() * 0.4, spend = (a.campaign.startsWith('Retarget') ? 25 : 55) * j, impressions = spend / a.cpm * 1000 * (a.fatigue ? 1 - age * 0.3 : 1);
      const ctr = a.ctr * (a.fatigue ? 1.2 - age * 0.7 : 1) * (0.85 + rnd() * 0.3), clicks = impressions * ctr / 100, v3s = a.hook ? impressions * a.hook / 100 * (0.9 + rnd() * 0.2) : 0;
      const conversations = clicks * a.conv * (0.8 + rnd() * 0.4), reach = impressions / (a.fatigue ? 1.6 + age * 3.4 : 1.25 + age * 0.6);
      rows.push({date, dateTo: date, platform: 'meta', campaign: a.campaign, adset: a.adset, ad: a.ad, spend, impressions, reach, clicks, clicksAll: clicks * 2.2, lpv: clicks * a.lpv / 100, v3s, thruplay: v3s * a.hold / 100, v25: v3s * 0.5, v50: v3s * 0.3, v75: v3s * 0.2, v100: v3s * a.hold / 100 * 0.6, engagements: impressions * 0.018, conversations, leads: 0, atc: 0, checkouts: 0, purchases: 0, revenue: 0});
    }
  }
  return rows;
}
