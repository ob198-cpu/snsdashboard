import {config} from './config.mjs';
export const facilities=Object.freeze(config.sns);
export const channelNames = ['X','Instagram','Threads','TikTok','YouTube'];
export function parseTable(text, label) {
  const marker = 'google.visualization.Query.setResponse(';
  const start = text.indexOf(marker);
  if (start < 0 || !text.trim().endsWith(');')) throw Error('台帳を読み取れません。閲覧権限を確認してください。');
  const result = JSON.parse(text.slice(start + marker.length, text.lastIndexOf(');')));
  if (result.status !== 'ok' || !result.table) throw Error('台帳の読取に失敗しました。');
  if (result.table.cols.length !== 1 || result.table.cols[0].label !== label) throw Error('台帳の列構成が一致しません。');
  return result.table.rows.map(row => row.c[0]?.v).filter(v => v !== null && v !== undefined && v !== '');
}
function number(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw Error('集計対象に不正な数値があります。');
  return n;
}
function project(values, type) {
  const ids = new Set();
  return values.map(value => {
    let r;
    try { r=JSON.parse(value); } catch { throw Error('台帳に読取不能な記録があります。'); }
    if (!r || typeof r !== 'object') throw Error('記録形式を確認できません。');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date || '') || !Number.isFinite(Date.parse(r.date)) || new Date(r.date).toISOString().slice(0,10)!==r.date) return {undated:true};
    if (r.id && ids.has(r.id)) throw Error('重複IDがあり、正確に集計できません。');
    if (r.id) ids.add(r.id);
    return {date:r.date, sns:r.sns || '', business:r.business || '', at:r.updatedAt || r.inputAt || '',
      ...(type === 'posts' ? {impressions:number(r.impressions)} : {followers:number(r.followers)})};
  });
}
export async function readFacility(facility, fetcher = fetch, allowed = facilities) {
  if (!allowed.some(f => f.id && f.id === facility.id && f.key === facility.key)) throw Error('保存先が未確認です。');
  const read = async (sheet, query, label) => {
    const url = new URL(`https://docs.google.com/spreadsheets/d/${facility.id}/gviz/tq`);
    url.search = new URLSearchParams({sheet,headers:'1',tq:query,tqx:'out:json'}).toString();
    const res = await fetcher(url, {method:'GET',signal:AbortSignal.timeout(20000)});
    if (!res.ok) throw Error(res.status === 401 || res.status === 403 ? '台帳の閲覧権限が必要です。' : `台帳の読取に失敗しました (HTTP ${res.status})。`);
    return parseTable(await res.text(), label);
  };
  // State is checked around the read to avoid mixing records across an active save.
  for (let attempt = 0; attempt < 2; attempt++) {
    const before = await read('State', "select C where A = 'data'", 'updatedAt');
    if (before.length !== 1) throw Error('台帳の保存時点を確認できません。');
    const postRecords = project(await read('Posts','select W','json'), 'posts');
    const followerRecords = project(await read('Followers','select I','json'), 'followers');
    const posts = postRecords.filter(r=>!r.undated);
    const followers = followerRecords.filter(r=>!r.undated);
    const excluded = postRecords.length + followerRecords.length - posts.length - followers.length;
    const after = await read('State', "select C where A = 'data'", 'updatedAt');
    if (JSON.stringify(before) === JSON.stringify(after)) return {posts,followers,excluded,readAt:new Date().toISOString(),revision:String(before[0])};
  }
  throw Error('台帳が保存中のため、今回の集計を見送りました。少し待って更新してください。');
}
export function monthBounds(month) {
  const [year,m] = month.split('-').map(Number);
  return {start:`${month}-01`,end:new Date(Date.UTC(year,m,0)).toISOString().slice(0,10)};
}
export function priorMonth(month, offset = 1) {
  const [year,m] = month.split('-').map(Number);
  return new Date(Date.UTC(year,m-1-offset,1)).toISOString().slice(0,7);
}
function followerSnapshot(records, end) {
  const latest = new Map();
  for (const r of records) {
    if (r.date > end) continue;
    const key = JSON.stringify([r.business,r.sns]);
    const old = latest.get(key);
    if (!old || r.date > old.date || (r.date === old.date && r.at >= old.at)) latest.set(key,r);
  }
  const selected = [...latest.values()].filter(r => r.sns || ![...latest.values()].some(s => s.business === r.business && s.sns));
  return {total:selected.length ? selected.reduce((sum,r)=>sum+r.followers,0) : null,
    channels:Object.fromEntries(channelNames.map(sns => {const matches=selected.filter(r=>r.sns===sns);return [sns,matches.length?matches.reduce((sum,r)=>sum+r.followers,0):null];})),
    date:selected.map(r=>r.date).sort().at(-1) || null};
}
export function summarize(data, month, today = new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'})) {
  const {start,end:monthEnd} = monthBounds(month);
  const end = monthEnd < today ? monthEnd : today;
  const previousEnd = monthBounds(priorMonth(month)).end;
  const posts = data.posts.filter(r=>r.date>=start && r.date<=end);
  const oldBounds = monthBounds(priorMonth(month));
  const previous = data.posts.filter(r=>r.date>=oldBounds.start && r.date<=oldBounds.end);
  const sum = rows=>rows.reduce((s,r)=>s+r.impressions,0);
  const followers = followerSnapshot(data.followers,end);
  const oldFollowers = followerSnapshot(data.followers,previousEnd);
  const delta = (a,b)=>a===null||b===null?null:a-b;
  const impressions=sum(posts), previousImpressions=sum(previous);
  return {posts:posts.length,impressions,previousImpressions,
    impressionChange:previousImpressions ? (impressions-previousImpressions)/previousImpressions*100 : null,
    followers:followers.total,followersDate:followers.date,followerChange:delta(followers.total,oldFollowers.total),
    followerPercent:oldFollowers.total && followers.total!==null?delta(followers.total,oldFollowers.total)/oldFollowers.total*100:null,
    channels:channelNames.map(sns=>({sns,posts:posts.filter(r=>r.sns===sns).length,impressions:sum(posts.filter(r=>r.sns===sns)),followers:followers.channels[sns],followerChange:delta(followers.channels[sns],oldFollowers.channels[sns])})),
    unclassifiedPosts:posts.filter(r=>!channelNames.includes(r.sns)).length,
    latestPost:data.posts.map(r=>r.date).sort().at(-1)||null,
    through:end,partial:end<monthEnd};
}
export function summarizeHistory(data, month, today) {
  return Array.from({length:6},(_,i)=>{const period=priorMonth(month,5-i);return {month:period,...summarize(data,period,today)};});
}
