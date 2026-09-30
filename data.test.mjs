import test from 'node:test';
import assert from 'node:assert/strict';
import {readFacility as readSource,summarize,summarizeHistory,monthBounds} from './data.mjs';
const facilities=[{id:'fixture',key:'fixture'}];
const readFacility=(f,fetcher)=>readSource(f,fetcher,facilities);
const response=(label,values)=>({ok:true,text:async()=>`google.visualization.Query.setResponse(${JSON.stringify({status:'ok',table:{cols:[{label}],rows:values.map(v=>({c:[{v}]}))}})});`});
const post={id:'p',date:'2026-09-01',sns:'X',impressions:42};
test('読取先は固定、全通信GET、個人情報は返却しない',async()=>{
  const calls=[];
  const data=await readFacility(facilities[0],async(url,options)=>{
    calls.push([url,options]);const sheet=url.searchParams.get('sheet');
    return sheet==='State'?response('updatedAt',['v1']):response('json',sheet==='Posts'?[JSON.stringify({...post,operator:'secret',content:'secret'}),JSON.stringify({weekStart:'2026-09-01'})]:[]);
  });
  assert.equal(calls.length,4);assert.ok(calls.every(([u,o])=>o.method==='GET'&&u.hostname==='docs.google.com'&&u.pathname.endsWith('/gviz/tq')));
  assert.equal(data.excluded,1);assert.equal(data.posts.length,1);assert.ok(!JSON.stringify(data).includes('secret'));
  await assert.rejects(readFacility({id:'unknown',key:'bad'},()=>assert.fail()),/未確認/);
});
test('保存中の版の混在を採用しない',async()=>{
  let version=0;
  await assert.rejects(readFacility(facilities[0],async url=>url.searchParams.get('sheet')==='State'?response('updatedAt',[String(version++)]):response('json',[])),/保存中/);
});
test('重複IDを二重集計しない',async()=>{
  await assert.rejects(readFacility(facilities[0],async url=>url.searchParams.get('sheet')==='State'?response('updatedAt',['1']):response('json',[JSON.stringify(post),JSON.stringify(post)])),/重複ID/);
});
test('月境界・未来日・前月全月比と未記録を区別する',()=>{
  const d={posts:[post,{date:'2026-08-31',sns:'X',impressions:21},{date:'2026-09-30',sns:'X',impressions:100}],followers:[]};
  const s=summarize(d,'2026-09','2026-09-29');
  assert.equal(s.posts,1);assert.equal(s.impressions,42);assert.equal(s.impressionChange,100);assert.equal(s.followers,null);assert.equal(s.followerChange,null);
  assert.equal(monthBounds('2024-02').end,'2024-02-29');assert.equal(summarizeHistory(d,'2026-09').length,6);
});
test('フォロワー累計を足さず最新値・前月末値を比較する',()=>{
  const d={posts:[],followers:[{date:'2026-08-31',sns:'X',followers:10,business:'a'}, {date:'2026-09-01',sns:'X',followers:12,business:'a'}, {date:'2026-09-02',sns:'X',followers:15,business:'a'}, {date:'2026-09-02',sns:'',followers:99,business:'a'}]};
  const s=summarize(d,'2026-09','2026-09-29');assert.equal(s.followers,15);assert.equal(s.followerChange,5);assert.equal(s.channels[0].followers,15);assert.equal(s.channels[1].followers,null);
});
