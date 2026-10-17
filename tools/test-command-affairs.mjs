// 命令簿十二类政务：每条命令（含财政系统运行时补入的命令）恰好归入一类，运行方式有效，离线镜像带上政务表。
import fs from "node:fs";
globalThis.window=globalThis;
await import("../js/core/fiscal-system.js");
await import("../js/data/offline-data.generated.js");
const defs=JSON.parse(fs.readFileSync("game/data/common/commands.json","utf8")),fail=message=>{throw new Error(message)};
const affairs=defs.affairs||fail("commands.json 缺少 affairs"),modes=defs.affair_modes||{};
const main=affairs.filter(affair=>affair.kind==="affair"),support=affairs.filter(affair=>affair.kind==="support");
if(main.length!==12)fail(`政务类应为 12 类，实为 ${main.length}`);
if(main.map(affair=>affair.order).join()!==Array.from({length:12},(_,i)=>i+1).join())fail("政务类序号应为 1–12");
if(main.length+support.length!==affairs.length)fail("政务类 kind 只能是 affair 或 support");
const owner=new Map();
for(const affair of affairs){
  if(!affair.name||!affair.description)fail(`${affair.id} 缺少名称或说明`);
  for(const [id,mode] of affair.commands){if(owner.has(id))fail(`${id} 同时归入 ${owner.get(id)} 与 ${affair.id}`);if(!(mode in modes))fail(`${id} 运行方式无效：${mode}`);owner.set(id,affair.id)}
}
const ids=[...defs.categories.flatMap(category=>category.commands.map(([id])=>id)),...FiscalSystem.commands.map(([id])=>id)];
const missing=ids.filter(id=>!owner.has(id)),stale=[...owner.keys()].filter(id=>!ids.includes(id));
if(missing.length)fail(`未归入政务类的命令：${missing.join(", ")}`);
if(stale.length)fail(`政务表中有不存在的命令：${stale.join(", ")}`);
for(const id of ["organization","personal"])if(affairs.find(affair=>affair.id===id)?.kind!=="support")fail(`${id} 应为辅助类，不占行政容量`);
const catalog=globalThis.SANGUO_DATA.commandCatalog;
if(JSON.stringify(catalog.affairs)!==JSON.stringify(affairs)||JSON.stringify(catalog.affairModes)!==JSON.stringify(modes))fail("离线镜像的政务表与 commands.json 不一致，请重跑 build-offline-data");
const count=Object.fromEntries(Object.keys(modes).map(mode=>[modes[mode],affairs.flatMap(affair=>affair.commands).filter(([,m])=>m===mode).length]));
console.log(`命令政务分类通过：${ids.length} 条命令归入 12 类政务与 ${support.length} 类辅助；${Object.entries(count).map(([name,n])=>`${name}${n}`).join(" ")}`);
