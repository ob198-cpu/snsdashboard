import {config} from './config.mjs';
import {createHash} from 'node:crypto';
import {parseTable} from './data.mjs';

export const productionOffices=config.production;
export function validDate(value){return typeof value==='string'&&/^20\d{2}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;}
export function normalizeReports(values) {
  const seen=new Map(),records=[];
  for(const value of values) {
    let r;try{r=JSON.parse(value);}catch{throw Error('読取不能な記録があります。');}
    if(!r||typeof r!=='object'||!validDate(r.date))throw Error('日付不明の記録があり集計を保留しました。');
    if(!r.id)throw Error('記録IDがなく重複を判定できません。');
    if(seen.has(r.id)){if(seen.get(r.id)!==value)throw Error('同じ記録IDに異なる内容があります。');continue;}
    seen.set(r.id,value);
    const metric=v=>{if(v===null||v===undefined||v===''||!Number.isFinite(Number(v))||Number(v)<0)throw Error('時間の未記入・不正値があります。');return Number(v);};
    const minutes=metric(r.minutes);
    const activities=Object.entries(r.activityMinutes||{}).map(([id,v])=>({id,label:String(r.activityLabels?.[id]||id),minutes:metric(v)}));
    records.push({id:String(r.id),name:String(r.name||'').trim(),date:r.date,minutes,activities,progress:String(r.progress||'')});
  }
  return records;
}
export async function readProduction(office,fetcher=fetch,allowed=productionOffices) {
  if(!allowed.some(o=>o.key===office.key&&o.id===office.id))throw Error('対象外の事業所です。');
  const read=async()=>{
    const url=new URL(`https://docs.google.com/spreadsheets/d/${office.id}/gviz/tq`);
    url.search=new URLSearchParams({sheet:'Reports',headers:'1',tq:'select N',tqx:'out:json'});
    const response=await fetcher(url,{method:'GET',signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw Error([401,403].includes(response.status)?'台帳の閲覧権限が必要です。':'台帳を取得できません。');
    return parseTable(await response.text(),'json');
  };
  // Compare two complete column reads; do not call GAS endpoints that can create sheets.
  let before=await read();
  for(let attempt=0;attempt<2;attempt++) {
    const after=await read();
    if(JSON.stringify(before)===JSON.stringify(after))return {records:normalizeReports(after),readAt:new Date().toISOString()};
    before=after;
  }
  throw Error('取得中に記録が変わったため、集計を保留しました。');
}
export function aggregateProduction(records,start,end,includePeople=false) {
  const within=records.filter(r=>r.date>=start&&r.date<=end);
  const people=new Map(),daily=new Map(),activities=new Map();let missingNames=0,totalMinutes=0,overMinutes=0;
  for(const r of within) {
    totalMinutes+=r.minutes;
    const day=daily.get(r.date)||{date:r.date,minutes:0,names:new Set()};day.minutes+=r.minutes;daily.set(r.date,day);
    // Preserve exact names; do not silently merge variants or claim verified identities.
    if(r.name){
      day.names.add(r.name);
      const person=people.get(r.name)||{name:r.name,minutes:0,days:new Set(),activities:new Map(),records:[]};
      person.minutes+=r.minutes;person.days.add(r.date);person.records.push(r);
      people.set(r.name,person);
    }else missingNames++;
    let assigned=0;
    for(const a of r.activities){
      assigned+=a.minutes;
      const key=JSON.stringify([a.id,a.label]);
      const item=activities.get(key)||{key,id:a.id,label:a.label,minutes:0};item.minutes+=a.minutes;activities.set(key,item);
      if(r.name){const p=people.get(r.name);p.activities.set(key,(p.activities.get(key)||0)+a.minutes);}
    }
    if(assigned<r.minutes){const key='unassigned',a=activities.get(key)||{key,id:key,label:'内訳未記入',minutes:0};a.minutes+=r.minutes-assigned;activities.set(key,a);if(r.name){const p=people.get(r.name);p.activities.set(key,(p.activities.get(key)||0)+r.minutes-assigned);}}
    overMinutes+=Math.max(0,assigned-r.minutes);
  }
  const personDays=[...people.values()].reduce((n,p)=>n+p.days.size,0);
  const summary={totalMinutes,reportCount:within.length,reporters:people.size,personDays,missingNames,overMinutes,
    averageMinutes:!missingNames&&personDays?totalMinutes/personDays:null,identityBasis:'氏名単位・本人未照合',
    activities:[...activities.values()].map(a=>({...a,share:totalMinutes&&!overMinutes?a.minutes/totalMinutes*100:null})).sort((a,b)=>b.minutes-a.minutes),
    daily:[...daily.values()].map(d=>({date:d.date,minutes:d.minutes,reporters:d.names.size})).sort((a,b)=>a.date.localeCompare(b.date))};
  if(includePeople)summary.people=[...people.values()].map(p=>({key:createHash('sha256').update(p.name).digest('hex').slice(0,20),name:p.name,minutes:p.minutes,days:p.days.size,averageMinutes:p.minutes/p.days.size,lastDate:[...p.days].sort().at(-1),
    activities:[...p.activities].map(([key,minutes])=>({label:activities.get(key).label,minutes})),
    records:p.records.map(r=>({date:r.date,minutes:r.minutes,activities:r.activities,progress:r.progress})).sort((a,b)=>b.date.localeCompare(a.date))})).sort((a,b)=>b.minutes-a.minutes);
  return summary;
}

export function createProductionService(reader=readProduction) {
  const cache=new Map(),errors=new Map();let running=false,started=0;
  async function refresh(){running=true;started=Date.now();errors.clear();try{for(const o of productionOffices){try{cache.set(o.key,await reader(o));}catch(e){errors.set(o.key,e.name==='TimeoutError'?'取得が時間切れになりました。':e.message);}}}finally{running=false;}}
  return {
    summary(start,end,force=false){if(!running&&(Date.now()-started>300000||(force&&Date.now()-started>30000)))void refresh();
      return {running,start,end,offices:productionOffices.map(o=>{const d=cache.get(o.key),error=errors.get(o.key);return {key:o.key,name:o.name,status:error?'error':d?'ok':'loading',error,...(d&&!error?{readAt:d.readAt,...aggregateProduction(d.records,start,end)}:{})};})};},
    detail(key,start,end){const o=productionOffices.find(o=>o.key===key);if(!o)throw Error('対象外の事業所です。');const d=cache.get(key);if(errors.has(key))throw Error(errors.get(key));if(!d)throw Error('事業所データを取得中です。');return {key,name:o.name,readAt:d.readAt,...aggregateProduction(d.records,start,end,true)};}
  };
}
