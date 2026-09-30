const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const num=n=>n==null?'—':n.toLocaleString('ja-JP');
const time=n=>n==null?'—':`${Math.floor(Math.round(n)/60).toLocaleString('ja-JP')}時間${Math.round(n)%60}分`;
const percent=n=>n==null?'—':`${n.toFixed(1)}%`;
const colors=['#347bd0','#168573','#b17b24','#9662a6','#b64b65','#477788','#76843e'];
const color=label=>colors[[...label].reduce((n,c)=>(n*31+c.codePointAt(0))>>>0,0)%colors.length];
const today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
$('#prodStart').value=today.slice(0,7)+'-01';$('#prodEnd').value=today;
let period={start:$('#prodStart').value,end:today}, data=null, detail=null, sequence=0,detailSequence=0,timer,page=0,sort='totalMinutes',descending=true,activeTab='offices',detailTab='activities',lastDetail='',overviewScroll=0;
const active=()=>location.hash.startsWith('#production');
const officeKey=()=>/^#production\/office\/(main|[2-7])$/.exec(location.hash)?.[1];
const query=()=>new URLSearchParams(period).toString();
function clearDetail(){detail=null;lastDetail='';$('#prodWorkBars').innerHTML='';$('#prodWorkStack').innerHTML='';$('#prodPeopleRows').innerHTML='';$('#prodDailyRows').innerHTML='';$('#prodPerson').hidden=true;$('#prodPersonRows').innerHTML='';$('#prodPersonBars').innerHTML='';$('#prodDetailDate').textContent='';$('#prodDetailWarning').textContent='取得中';}
const visible=()=>data?.offices.filter(r=>!$('#prodOfficeFilter').value||r.key===$('#prodOfficeFilter').value)||[];
function bars(items){const max=Math.max(1,...items.map(a=>a.minutes||0));return items.length?items.map(a=>`<div class="prod-bar"><span>${esc(a.label)}</span><div class="prod-bar-track"><i style="width:${Math.max(0,a.minutes/max*100)}%;background:${a.share!==undefined?color(a.label):'#3c8be6'}"></i></div><strong>${time(a.minutes)}${a.share!==undefined?`<span class="prod-share">${percent(a.share)}</span>`:''}</strong></div>`).join(''):'<p class="data-note">対象期間の記録がありません。</p>';}
function kpis(rows){const good=rows.filter(r=>r.status==='ok'),sum=k=>good.reduce((n,r)=>n+r[k],0),known=good.length>0,average=known&&!sum('missingNames')&&sum('personDays')?sum('totalMinutes')/sum('personDays'):null;
  $('#prodKpis').innerHTML=[['合計作業時間',known?time(sum('totalMinutes')):'—'],['平均／人・報告日（参考）',time(average)],['報告氏名数（事業所別の延べ）',known?num(sum('reporters')):'—'],['延べ報告人日',known?num(sum('personDays')):'—']].map(([label,value])=>`<div><span>${label}</span><strong>${value}</strong></div>`).join('');}
function render(){if(!data)return;
  const rows=visible(),good=rows.filter(r=>r.status==='ok');
  const lastRead=data.offices.map(r=>r.readAt||'').sort().at(-1);
  $('#prodStatus').textContent=`${data.running?'取得中':'取得済み'} ${data.offices.filter(r=>r.status==='ok').length} / ${data.offices.length}事業所 ｜ ${period.start} ～ ${period.end}${lastRead?` ｜ 最終取得 ${new Date(lastRead).toLocaleString('ja-JP')}`:''}`;
  $('#prodRefresh').disabled=data.running;
  if(!officeKey())kpis(rows);
  const sorted=[...rows].sort((a,b)=>{if(a.status!=='ok')return b.status==='ok'?1:0;if(b.status!=='ok')return -1;if(a[sort]==null)return 1;if(b[sort]==null)return -1;return (descending?-1:1)*(a[sort]-b[sort]);});
  $('#prodRows').innerHTML=sorted.map(r=>`<tr><td><button class="prod-link" data-office="${r.key}" ${r.status!=='ok'?'disabled':''}>${esc(r.name)}</button></td><td>${time(r.totalMinutes)}</td><td>${time(r.averageMinutes)}</td><td>${num(r.reporters)}</td><td>${num(r.personDays)}</td><td title="${esc(r.readAt?new Date(r.readAt).toLocaleString('ja-JP'):'')}">${esc(r.error||(r.status==='loading'?'取得中':r.overMinutes?'内訳超過あり':r.missingNames?'氏名欠落あり':r.reportCount===0?'記録なし':'取得済み'))}</td></tr>`).join('');
  const metric=$('#prodMetric').value;
  $('#prodCompareBars').innerHTML=bars([...good].filter(r=>r[metric]!=null).sort((a,b)=>b[metric]-a[metric]).map(r=>({label:r.name,minutes:r[metric]})));
  const search=$('#prodActivitySearch').value.trim().toLowerCase();
  $('#prodActivityRows').innerHTML=good.flatMap(r=>r.activities.map(a=>({...a,office:r.name}))).filter(a=>a.label.toLowerCase().includes(search)).sort((a,b)=>b.minutes-a.minutes).map(a=>`<tr><td>${esc(a.label)}</td><td>${esc(a.office)}</td><td>${time(a.minutes)}</td><td>${percent(a.share)}</td></tr>`).join('')||'<tr><td colspan="4">対象の活動記録がありません。</td></tr>';
  const labels=[...new Set(good.flatMap(r=>r.activities.map(a=>a.label)))].filter(label=>label.toLowerCase().includes(search)).sort((a,b)=>a.localeCompare(b,'ja'));
  $('#prodMatrixHead').innerHTML=`<tr><th>活動名（分類未照合）</th>${rows.map(r=>`<th>${esc(r.name)}</th>`).join('')}</tr>`;
  $('#prodMatrixRows').innerHTML=labels.map(label=>`<tr><th>${esc(label)}</th>${rows.map(r=>{const matches=r.activities?.filter(a=>a.label===label)||[];return `<td>${matches.length?matches.map(a=>`${time(a.minutes)}${matches.length>1?`（${esc(a.id)}）`:''}`).join('<br>'):'—'}</td>`;}).join('')}</tr>`).join('')||`<tr><td colspan="${rows.length+1}">対象の活動記録がありません。</td></tr>`;
  $$('[data-office]').forEach(b=>b.onclick=()=>{overviewScroll=window.scrollY;location.hash=`production/office/${b.dataset.office}`;});
}
async function load(force=false){clearTimeout(timer);const id=++sequence;$('#prodError').textContent='';$('#prodRefresh').disabled=true;
  try{const res=await fetch(`/api/production?${query()}${force?'&refresh=1':''}`,{signal:AbortSignal.timeout(15000)});if(!res.ok)throw Error('集計を取得できません。日付とサーバーの状態を確認してください。');const result=await res.json();if(id!==sequence)return;data=result;
    const selected=$('#prodOfficeFilter').value;$('#prodOfficeFilter').innerHTML='<option value="">すべて</option>'+data.offices.map(r=>`<option value="${r.key}">${esc(r.name)}</option>`).join('');$('#prodOfficeFilter').value=selected;render();
    if(active()&&officeKey())await loadDetail();
    if(result.running&&active())timer=setTimeout(()=>load(),1500);
  }catch(e){if(id!==sequence)return;data=null;clearDetail();$('#prodDetailWarning').textContent='取得失敗';$('#prodKpis').innerHTML='';$('#prodRows').innerHTML='<tr><td colspan="6">取得失敗</td></tr>';$('#prodCompareBars').innerHTML='';$('#prodActivityRows').innerHTML='';$('#prodMatrixRows').innerHTML='';$('#prodError').textContent=e.message;$('#prodStatus').textContent='取得失敗';$('#prodRefresh').disabled=false;}
}
function detailTabs(){['activities','people','daily'].forEach(t=>{$(`#prodDetail${t[0].toUpperCase()+t.slice(1)}`).hidden=t!==detailTab;});$$('[data-detail-tab]').forEach(b=>b.setAttribute('aria-selected',String(b.dataset.detailTab===detailTab)));$('#prodPerson').hidden=true;}
function people(){if(!detail)return;const filtered=detail.people.filter(p=>p.name.includes($('#prodName').value.trim()));const pages=Math.max(1,Math.ceil(filtered.length/20));page=Math.min(page,pages-1);
  $('#prodPeopleRows').innerHTML=filtered.slice(page*20,page*20+20).map(p=>`<tr><td><button class="prod-link" data-person="${p.key}">${esc(p.name)}</button></td><td>${time(p.minutes)}</td><td>${p.days}日</td><td>${time(p.averageMinutes)}</td><td>${p.lastDate}</td></tr>`).join('')||'<tr><td colspan="5">対象の記録がありません。</td></tr>';
  $('#prodPage').textContent=`${page+1} / ${pages}ページ・${filtered.length}件`;$('#prodPrev').disabled=page===0;$('#prodNext').disabled=page===pages-1;
  $$('[data-person]').forEach(b=>b.onclick=()=>{const p=detail.people.find(p=>p.key===b.dataset.person);$('#prodPersonTitle').textContent=`${p.name}（氏名単位・参考値）`;$('#prodPersonBars').innerHTML=bars(p.activities.map(a=>({...a,share:null})));$('#prodPersonRows').innerHTML=p.records.map(r=>`<tr><td>${r.date}</td><td>${r.activities.map(a=>`${esc(a.label)}：${time(a.minutes)}`).join('<br>')||'内訳未記入'}</td><td>${time(r.minutes)}</td><td>${esc(r.progress)||'—'}</td></tr>`).join('');$('#prodPerson').hidden=false;$('#prodPerson').scrollIntoView({block:'start',behavior:'smooth'});});
}
async function loadDetail(){const key=officeKey();if(!key||!active())return;const row=data?.offices.find(r=>r.key===key);const fingerprint=`${key}:${query()}:${row?.readAt}:${row?.status}`;if(fingerprint===lastDetail)return;lastDetail=fingerprint;
  const id=++detailSequence;detail=null;$('#prodDetailTitle').textContent=row?.name||'事業所';$('#prodDetailWarning').textContent='取得中';$('#prodWorkStack').innerHTML='';$('#prodWorkBars').innerHTML='';$('#prodPeopleRows').innerHTML='';$('#prodDailyRows').innerHTML='';$('#prodPerson').hidden=true;$('#prodDetailDate').textContent='';$('#prodKpis').innerHTML='';
  if(row?.status!=='ok'){$('#prodDetailWarning').textContent=row?.error||'事業所データを取得中です。';return;}
  try{const res=await fetch(`/api/production-detail?office=${key}&${query()}`,{signal:AbortSignal.timeout(15000)});const result=await res.json();if(id!==detailSequence||officeKey()!==key||!active())return;if(!res.ok)throw Error(result.error);detail=result;
    $('#prodDetailTitle').textContent=detail.name;$('#prodDetailDate').textContent=`取得 ${new Date(detail.readAt).toLocaleString('ja-JP')}`;
    $('#prodDetailWarning').textContent=[detail.overMinutes?`活動内訳が合計を${time(detail.overMinutes)}超過。構成比は算出保留。`:'',detail.missingNames?`氏名不明${detail.missingNames}件。平均は算出保留。`:''].filter(Boolean).join(' ');
    kpis([{...detail,status:'ok'}]);$('#prodWorkBars').innerHTML=bars(detail.activities);$('#prodWorkStack').innerHTML=detail.activities.filter(a=>a.share>0).map(a=>`<span tabindex="0" role="img" aria-label="${esc(a.label)} ${time(a.minutes)} ${percent(a.share)}" title="${esc(a.label)} ${time(a.minutes)} ${percent(a.share)}" style="width:${a.share}%;background:${color(a.label)}"></span>`).join('');$('#prodDailyRows').innerHTML=detail.daily.map(d=>`<tr><td>${d.date}</td><td>${time(d.minutes)}</td><td>${d.reporters}</td></tr>`).join('')||'<tr><td colspan="3">対象期間の記録がありません。</td></tr>';people();detailTabs();
  }catch(e){if(id===detailSequence)$('#prodDetailWarning').textContent=e.message;}
}
function route(){if(!active()){clearTimeout(timer);sequence++;detailSequence++;detail=null;lastDetail='';return;}const key=officeKey();$('#prodOverview').hidden=!!key;$('#prodDetail').hidden=!key;if(!data)load();else {render();if(key)loadDetail();else {detailSequence++;detail=null;lastDetail='';}if(data.running)load();}}
$('#prodApply').onclick=()=>{const start=$('#prodStart').value,end=$('#prodEnd').value;if(!start||!end||start>end||end>today){$('#prodError').textContent='開始日・終了日を確認してください。未来日は指定できません。';return;}period={start,end};detailSequence++;clearDetail();data=null;page=0;$('#prodKpis').innerHTML='';$('#prodRows').innerHTML='';$('#prodCompareBars').innerHTML='';$('#prodActivityRows').innerHTML='';$('#prodMatrixRows').innerHTML='';load();};
$('#prodRefresh').onclick=()=>{lastDetail='';load(true);};$('#prodBack').onclick=()=>{location.hash='production/offices';requestAnimationFrame(()=>window.scrollTo(0,overviewScroll));};
$('#prodOfficeFilter').onchange=render;$('#prodMetric').onchange=render;$('#prodActivitySearch').oninput=render;$('#prodName').oninput=()=>{page=0;people();$('#prodPerson').hidden=true;};
$('#prodActivityLayout').onchange=()=>{const matrix=$('#prodActivityLayout').value==='matrix';$('#prodActivityList').hidden=matrix;$('#prodActivityMatrix').hidden=!matrix;};
$('#prodPrev').onclick=()=>{page--;people();};$('#prodNext').onclick=()=>{page++;people();};$('#prodPersonClose').onclick=()=>{$('#prodPerson').hidden=true;};
$$('[data-prod-tab]').forEach(b=>b.onclick=()=>{activeTab=b.dataset.prodTab;$('#prodOfficeComparison').hidden=activeTab!=='offices';$('#prodActivityComparison').hidden=activeTab!=='activities';$$('[data-prod-tab]').forEach(t=>t.setAttribute('aria-selected',String(t===b)));});
$$('[data-detail-tab]').forEach(b=>b.onclick=()=>{detailTab=b.dataset.detailTab;detailTabs();});
$$('[data-sort]').forEach(b=>b.onclick=()=>{descending=sort===b.dataset.sort?!descending:true;sort=b.dataset.sort;render();});
window.addEventListener('hashchange',route);route();
