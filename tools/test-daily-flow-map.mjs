import assert from 'node:assert/strict';
import fs from 'node:fs';
const html=fs.readFileSync(new URL('../docs/game-turn-map.html',import.meta.url),'utf8');
for(const id of ['economyDetail','worldDetail','ordersDetail','adminDetail','aiDetail','warDetail','peopleDetail','eventDetail']){
  assert(html.includes(`id="${id}"`));assert(html.includes(`data-detail-target="${id}"`));
}
for(const label of ['每日模拟','暂停','0.5 秒／日','概率决策','没有固定行动日期','中央府库','军队仓储','人日','九月月末','月末','季度末','军团每日粮需 = ceil(兵力 ÷ 600)','每十日一段','每五日一段'])assert(html.includes(label),label);
assert(!html.includes('旬'));assert(!html.includes('结束回合'));assert(html.includes('@media(max-width:600px)'));
console.log('每日流程图通过：8 个可展开阶段、连续模拟、概率 AI、财政与运输、日/十日/月/季/年周期、响应式布局');
