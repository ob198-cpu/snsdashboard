import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeReports,aggregateProduction,readProduction as readSource} from './production.mjs';
const productionOffices=['main','2','3','4','5','6','7'].map(key=>({key,id:'fixture-'+key}));
const readProduction=(o,fetcher)=>readSource(o,fetcher,productionOffices);
const record=(id,name,date,minutes,activityMinutes={a:minutes})=>JSON.stringify({id,name,date,minutes,activityMinutes,activityLabels:{a:'作業A'}});
test('個人・事業所平均は日数で加重する',()=>{
 const records=normalizeReports([record('1','A','2026-09-01',300),record('2','A','2026-09-02',300),record('3','B','2026-09-01',180)]);
 const s=aggregateProduction(records,'2026-09-01','2026-09-30',true);
 assert.equal(s.totalMinutes,780);assert.equal(s.personDays,3);assert.equal(s.averageMinutes,260);assert.equal(s.people[0].averageMinutes,300);
 assert.equal(s.activities[0].share,100);
});
test('同日複数報告と同一ID再送を区別する',()=>{
 const r=record('1','A','2026-09-01',60);
 const s=aggregateProduction(normalizeReports([r,r,record('2','A','2026-09-01',30)]),'2026-09-01','2026-09-30');
 assert.equal(s.totalMinutes,90);assert.equal(s.personDays,1);assert.equal(s.reportCount,2);assert.equal(s.averageMinutes,90);
 assert.throws(()=>normalizeReports([r,record('1','A','2026-09-01',61)]),/異なる/);
});
test('未報告・欠落・内訳過剰を0平均で隠さない',()=>{
 assert.equal(aggregateProduction([],'2026-09-01','2026-09-30').averageMinutes,null);
 const missing=aggregateProduction(normalizeReports([record('1','','2026-09-01',30)]),'2026-09-01','2026-09-30');assert.equal(missing.missingNames,1);assert.equal(missing.averageMinutes,null);
 const over=aggregateProduction(normalizeReports([record('1','A','2026-09-01',30,{a:60})]),'2026-09-01','2026-09-30');assert.equal(over.overMinutes,30);assert.equal(over.activities[0].share,null);
 const under=aggregateProduction(normalizeReports([record('1','A','2026-09-01',120,{a:90})]),'2026-09-01','2026-09-30');assert.equal(under.activities.find(a=>a.id==='unassigned').minutes,30);
});
test('不正日付・負数・未記入は拒否する',()=>{
 for(const date of ['','2026-02-30'])assert.throws(()=>normalizeReports([record('1','A',date,30)]),/日付/);
 for(const minutes of [-1,null,''])assert.throws(()=>normalizeReports([record('1','A','2026-09-01',minutes)]),/時間/);
});
test('期間外を除外し、氏名は未照合のまま分け、一覧に個人を含めない',()=>{
 const s=aggregateProduction(normalizeReports([record('1','A B','2026-09-01',30),record('2','AB','2026-09-02',30),record('3','AB','2026-08-31',999)]),'2026-09-01','2026-09-30');
 assert.equal(s.totalMinutes,60);assert.equal(s.reporters,2);assert.equal(s.people,undefined);assert.equal(s.identityBasis,'氏名単位・本人未照合');
});
test('固定7事業所・GET限定・変更中は採用しない',async()=>{
 const wrap=values=>({ok:true,text:async()=>`google.visualization.Query.setResponse(${JSON.stringify({status:'ok',table:{cols:[{label:'json'}],rows:values.map(v=>({c:[{v}]}))}})});`});
 const calls=[];await readProduction(productionOffices[0],async(u,o)=>{calls.push([u,o]);return wrap([]);});assert.equal(calls.length,2);assert.ok(calls.every(([u,o])=>u.hostname==='docs.google.com'&&o.method==='GET'));
 assert.equal(productionOffices.length,7);assert.ok(!productionOffices.some(o=>o.key==='8'));
 let n=0;await assert.rejects(readProduction(productionOffices[0],async()=>wrap([record(String(n++),'A','2026-09-01',30)])),/変わった/);
 await assert.rejects(readProduction({key:'8',id:'unknown'},()=>assert.fail()),/対象外/);
});
