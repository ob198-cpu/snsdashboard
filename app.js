const offices = ['UIL広島駅前','UIL八丁堀','UIL大手町','株式会社よかず','ベストジョイ大通','UIL大通'];
const rows = document.querySelector('#officeRows');
const listRows = document.querySelector('#officeListRows');
const monthSelect = document.querySelector('#targetMonth');
const officeSelect = document.querySelector('#detailOffice');
const channels = [['X','x','𝕏'],['Instagram','instagram','◎'],['Threads','threads','@'],['TikTok','tiktok','♪'],['YouTube','youtube','▶']];
let records=offices.map(name=>({name,status:'loading'}));
let requestId=0, poll;
const fmt=value=>value===null||value===undefined?'—':Number(value).toLocaleString('ja-JP',{maximumFractionDigits:1});
const signed=(value,unit='')=>value===null||value===undefined?'—':`${value>0?'+':''}${fmt(value)}${unit}`;
const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const status=r=>r.status==='unmapped'?'保存先未確認':r.status==='loading'?'取得中':r.status==='error'?'取得失敗':r.excluded?'要確認':'取得済み';
const usable=r=>r.status==='ok'?r.summary:null;

function monthLabel(month) {
  const [year, number] = month.split('-').map(Number);
  return `${year}年${number}月`;
}

function precedingMonths(month, count = 6) {
  const [year, number] = month.split('-').map(Number);
  return Array.from({length:count}, (_, index) => {
    const date = new Date(Date.UTC(year, number - count + index, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
  });
}

function renderRows() {
  const markup = records.map((r, index) => {const s=usable(r);return `<tr><td><a class="office-link" href="#office/${index}">${escape(r.name)}</a></td><td><strong>${fmt(s?.posts)} / —</strong></td><td>${fmt(s?.impressions)}</td><td>${signed(s?.impressionChange,'%')}</td><td>${signed(s?.followerChange)}</td><td title="目標未設定">—</td><td><span class="status" title="${escape(r.error|| (r.excluded?`日付不明${r.excluded}件を集計対象外`:''))}">${status(r)}</span></td><td class="arrow" aria-hidden="true">›</td></tr>`;}).join('');
  rows.innerHTML = markup;
  listRows.innerHTML = markup;
}

function renderRankings() {
  const ranking=(key,unit)=>{const sorted=records.map((r,index)=>({...r,index})).filter(r=>usable(r)&&r.summary[key]!==null&&!r.excluded).sort((a,b)=>b.summary[key]-a.summary[key]);return sorted.length?`<ul class="ranking-list">${sorted.slice(0,3).map(r=>`<li><span class="rank-number">${sorted.findIndex(x=>x.summary[key]===r.summary[key])+1}</span><a href="#office/${r.index}">${escape(r.name)}</a><span class="rank-value">${signed(r.summary[key],unit)}</span></li>`).join('')}</ul>`:'<p class="data-note">比較できる記録がありません。</p>';};
  document.querySelector('#impressionRanking').innerHTML=ranking('impressionChange','%');
  document.querySelector('#followerRanking').innerHTML=ranking('followerChange','人');
  document.querySelectorAll('.rank-value').forEach(e=>e.classList.toggle('negative',e.textContent.startsWith('-')));
  document.querySelector('#sourceWarnings').textContent=records.filter(r=>r.excluded).map(r=>`${r.name}：日付不明${r.excluded}件を集計から除外（ランキング対象外）`).join(' ／ ');
  document.querySelector('#notice-title').textContent=`${monthLabel(monthSelect.value)}の集計`;
  const valid=records.filter(r=>usable(r));
  const notes=document.querySelectorAll('.notice-item small');
  notes[0].textContent=`${fmt(valid.reduce((n,r)=>n+r.summary.posts,0))}件（取得済み${valid.length}事業所）`;
  notes[1].textContent=`${fmt(valid.reduce((n,r)=>n+r.summary.impressions,0))}回`;
  const comparable=valid.filter(r=>r.summary.followerChange!==null);
  notes[2].textContent=`${signed(comparable.length?comparable.reduce((n,r)=>n+r.summary.followerChange,0):null,'人')}（比較可能${comparable.length}事業所）`;
}

function renderDetail(index) {
  const name = offices[index];
  officeSelect.value = String(index);
  document.querySelector('#detailTitle').textContent = name;
  document.querySelector('#detailPeriod').textContent = monthLabel(monthSelect.value);
  const r=records[index], s=usable(r);
  document.querySelector('.office-heading .status').textContent=status(r);
  const metrics=document.querySelectorAll('.detail-kpis article');
  ['posts','impressions','followers','followerChange'].forEach((key,i)=>{metrics[i].querySelector('strong').textContent=i===3?signed(s?.[key]):fmt(s?.[key]);metrics[i].querySelector('small').textContent=i<2?'目標未設定':i===2?`記録日 ${s?.followersDate||'未記録'}`:`前月末比 ${signed(s?.followerPercent,'%')}`;});
  document.querySelectorAll('.metric-footer .progress').forEach(e=>e.hidden=true);
  document.querySelector('#detailDataNote').textContent=s?`取得 ${new Date(r.readAt).toLocaleString('ja-JP')} ／ ${s.through}までの投稿 ／ フォロワーは各SNSの最新記録${r.excluded?` ／ 日付不明${r.excluded}件は集計対象外`:''}${s.unclassifiedPosts?` ／ SNS分類不明${s.unclassifiedPosts}件は合計にのみ含む`:''}`:r.error||status(r);
  document.querySelector('#channelRows').innerHTML = channels.map(([label, style, icon]) => {const c=s?.channels.find(c=>c.sns===label);return `<tr><th scope="row"><span class="channel-name"><span class="channel-icon ${style}" aria-hidden="true">${icon}</span>${label}</span></th><td>${fmt(c?.posts)} / —</td><td>${fmt(c?.impressions)}</td><td>${fmt(c?.followers)}</td><td class="channel-change">${signed(c?.followerChange)}</td></tr>`;}).join('');
  document.querySelector('#impressionChart').innerHTML = s?valueChart(r.history,'impressions','bar'): '<p class="data-note">集計未取得</p>';
  document.querySelector('#followerChart').innerHTML = s?valueChart(r.history,'followerChange','line'): '<p class="data-note">集計未取得</p>';
}

function valueChart(history,key,kind) {
  const values=history.map(r=>r[key]),valid=values.filter(v=>v!==null);
  const min=Math.min(0,...valid), max=Math.max(1,...valid), y=v=>125-(v-min)/(max-min)*100;
  let previous=null;
  const marks=history.map((r,i)=>{const v=r[key],x=65+i*91;
    const label=`<text x="${x}" y="158" text-anchor="middle" class="chart-label">${r.month}</text>`;
    if(v===null){previous=null;return label+`<text x="${x}" y="110" text-anchor="middle" class="chart-label">—</text>`;}
    const point=kind==='bar'?`<rect x="${x-18}" y="${Math.min(y(0),y(v))}" width="36" height="${Math.max(1,Math.abs(y(v)-y(0)))}" fill="#2e80ed"/>`:`${previous?`<line x1="${previous.x}" y1="${previous.y}" x2="${x}" y2="${y(v)}" stroke="#2e80ed" stroke-width="2"/>`:''}<circle cx="${x}" cy="${y(v)}" r="3" fill="#2e80ed"/>`;
    previous={x,y:y(v)};return label+point+`<text x="${x}" y="${y(v)-8}" text-anchor="middle" class="chart-value">${fmt(v)}</text>`;
  }).join('');
  return `<svg class="trend-chart" viewBox="0 0 580 170" role="img" aria-label="${history.map(r=>`${r.month} ${fmt(r[key])}`).join('、')}">${[0,0.5,1].map(n=>`<line x1="35" x2="550" y1="${25+n*100}" y2="${25+n*100}" class="chart-grid"/>`).join('')}<line x1="35" x2="550" y1="${y(0)}" y2="${y(0)}" class="chart-axis"/>${marks}</svg>`;
}

function zeroChart(months, kind, name) {
  const description = `${name} ${monthLabel(months[0])}から${monthLabel(months.at(-1))}まで、すべて0`;
  const grid = [25, 55, 85, 115].map(y => `<line x1="35" x2="550" y1="${y}" y2="${y}" class="chart-grid"/>`).join('') + months.map((_, index) => `<line x1="${65 + index * 91}" x2="${65 + index * 91}" y1="25" y2="130" class="chart-grid"/>`).join('');
  const points = months.map((month, index) => {
    const x = 65 + index * 91;
    const label = monthLabel(month);
    const shortLabel = `${Number(month.split('-')[1])}月`;
    return `<text x="${x}" y="158" text-anchor="middle" class="chart-label chart-label-full">${label}</text><text x="${x}" y="158" text-anchor="middle" class="chart-label chart-label-short">${shortLabel}</text><text x="${x}" y="119" text-anchor="middle" class="chart-value">0</text>${kind === 'line' ? `<circle cx="${x}" cy="130" r="4" fill="#2e80ed"/>` : `<rect x="${x-19}" y="129" width="38" height="2" rx="1" fill="#adcdf7"/>`}`;
  }).join('');
  return `<svg class="trend-chart" viewBox="0 0 580 170" role="img" aria-label="${description}"><title>${description}</title>${grid}<line x1="35" x2="550" y1="130" y2="130" class="chart-axis"/><text x="20" y="134" class="chart-label">0</text>${kind === 'line' ? '<path d="M65 130 H520" fill="none" stroke="#2e80ed" stroke-width="2"/>' : ''}${points}</svg>`;
}

function showView(view, index = 0) {
  const isHome = view === 'home';
  const isDetail = view === 'detail';
  document.body.classList.toggle('view-detail', isDetail);
  const monthLabelElement = monthSelect.parentElement;
  (isDetail ? document.querySelector('#detailMonthSlot') : document.querySelector('#headerMonthSlot')).prepend(monthLabelElement);
  document.querySelector('#homeView').hidden = !isHome;
  document.querySelector('#officesView').hidden = view !== 'offices';
  document.querySelector('#detailView').hidden = !isDetail;
  document.querySelectorAll('.nav-item').forEach(button => {
    const selected = button.dataset.view === (isHome ? 'home' : 'offices');
    button.classList.toggle('active', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelector('#pageTitle').textContent = isHome ? '運用状況ダッシュボード' : isDetail ? 'SNS運用ダッシュボード' : '事業所一覧';
  document.querySelector('#pageDescription').textContent = isHome ? `${offices.length}つの事業所のSNS運用状況を確認できます。` : isDetail ? '' : '事業所ごとのSNS運用状況を確認できます。';
  if (isDetail) renderDetail(index);
}

function route() {
  const production=location.hash.startsWith('#production');
  document.body.classList.toggle('production-mode',production);
  document.querySelector('#productionView').hidden=!production;
  document.querySelector('#snsMode').setAttribute('aria-current',production?'false':'page');
  document.querySelector('#productionMode')?.setAttribute('aria-current',production?'page':'false');
  if(production){document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.view===(location.hash==='#production'?'home':'offices')));return;}
  const match = location.hash.match(/^#office\/(\d+)$/);
  if (match && offices[Number(match[1])]) showView('detail', Number(match[1]));
  else showView(location.hash === '#offices' ? 'offices' : 'home');
}

document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => {location.hash = location.hash.startsWith('#production')?(button.dataset.view==='home'?'production':'production/offices'):button.dataset.view;}));
document.querySelector('[data-go="offices"]').addEventListener('click', () => {location.hash = 'offices';});
officeSelect.addEventListener('change', () => {location.hash = `office/${officeSelect.value}`;});
monthSelect.addEventListener('change', ()=>{records=offices.map(name=>({name,status:'loading'}));renderRows();renderRankings();route();loadData();});
window.addEventListener('hashchange', route);
const today = new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit'}).format(new Date());
monthSelect.innerHTML = precedingMonths(today, 12).reverse().map(month => `<option value="${month}">${monthLabel(month)}</option>`).join('');
monthSelect.value = today;
officeSelect.innerHTML = offices.map((name, index) => `<option value="${index}">${name}（${index + 1} / ${offices.length}）</option>`).join('');
renderRows(); renderRankings(); route();
async function loadData(refresh=false) {
  clearTimeout(poll);const id=++requestId, month=monthSelect.value;
  document.querySelector('#refreshData').disabled=true;
  try {
    const response=await fetch(`/api/summary?month=${month}${refresh?'&refresh=1':''}`,{signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw Error('集計サーバーに接続できません。');
    const result=await response.json();if(id!==requestId)return;
    records=result.offices;renderRows();renderRankings();route();
    document.querySelector('.updated').textContent=`${result.running?'取得中':'取得済み'} ${records.filter(r=>r.status==='ok').length} / ${offices.length}`;
    document.querySelector('#refreshData').disabled=result.running;
    if(result.running)poll=setTimeout(()=>loadData(),1200);
  } catch(e) {
    if(id!==requestId)return;
    records=offices.map(name=>({name,status:'error',error:'集計サーバーに接続できません。再取得してください。'}));
    renderRows();renderRankings();route();document.querySelector('.updated').textContent='取得失敗';document.querySelector('#refreshData').disabled=false;
  }
}
document.querySelector('#refreshData').addEventListener('click',()=>loadData(true));
loadData();
