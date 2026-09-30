import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html=fs.readFileSync(new URL('./index.html',import.meta.url),'utf8');
const js=fs.readFileSync(new URL('./app.js',import.meta.url),'utf8');

test('SNS画面のメニューはホームのみで、生産活動タブを表示しない',()=>{
  const menu=[...html.matchAll(/class="nav-item(?: active)?"[^>]*>(.*?)<\/button>/gs)].map(m=>m[1].replace(/<[^>]+>/g,'').trim());
  assert.deepEqual(menu,['ホーム']);
  assert.doesNotMatch(html,/id="productionMode"/);
  assert.match(html,/id="snsMode"/);
  assert.doesNotMatch(html,/利用者管理/);
});

test('6事業所の表からSNS別詳細へ進め、実績を表示する',()=>{
  assert.match(html,/id="officeRows"/);
  assert.match(html,/id="officeListRows"/);
  assert.match(html,/id="detailOffice"/);
  assert.match(html,/id="channelRows"/);
  assert.match(html,/id="impressionChart"/);
  assert.match(html,/id="followerChart"/);
  assert.doesNotMatch(js,/18 \/ 20|32,400|\+48/);
  assert.match(js,/fmt\(s\?\.posts\)/);
  const officeDefinition = js.match(/const offices = \[([^\]]+)\]/)?.[1] ?? '';
  assert.equal((officeDefinition.match(/'[^']+'/g) || []).length,6);
  const channelDefinition = js.match(/const channels = \[([^;]+)\];/)?.[1] ?? '';
  assert.equal((channelDefinition.match(/\['/g) || []).length,5);
});

test('未集計のランキングに仮の順位を表示しない',()=>{
  assert.match(js,/比較できる記録がありません/);
  assert.match(js,/r\.summary\[key\]!==null/);
  assert.doesNotMatch(js,/rank-number[^>]*>\$\{index\s*\+\s*1\}/);
});
