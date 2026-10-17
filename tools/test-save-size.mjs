import assert from "node:assert/strict";
globalThis.window=globalThis;globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
await import("../js/data/offline-data.generated.js");
await import("../js/core/map-grid.js");await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");
try{await import("../js/core/ai-controller.js")}catch{}await import("../js/core/game-state.js");

// 浏览器本地存储约 5MB，主档与备份并存：开局一年后单档须小于 1MB，且转运、战报不随时间无限增长。
const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});state.date={year:200,month:1,day:1};
const size=()=>JSON.stringify(state.serialize()).length;let half=0,shipSum=0;
for(let day=1;day<=360;day++){state.endTurn();if(day===180)half=size();if(day>180)shipSum+=state.policies.fiscalAccounts.shipments.length}
const full=size(),ledger=state.policies.fiscalAccounts;
// 人口 POP（约 2,600 组）入档后约增 100KB，上限由 1MB 放宽到 1.2MB（docs/POP_CLAN_PLAN.md 第 1 节第 9 条）。
// 2026-10-17 内政改制后同一推演多出野战（旧战报只留战事条目），一年档 1211→1294KB；放宽到 1.3MB，主档与备份合计仍远低于 5MB。
assert.ok(full<1.3*1024*1024,`一年后存档 ${(full/1024)|0}KB，应小于 1.3MB`);
assert.ok(full-half<half*.4,`下半年存档增长 ${((full-half)/1024)|0}KB，增长过快`);
// 在途条数随各城征收日起伏，单日取样不稳；以下半年日均衡量（同一推演约 300 条，已完成的每势力只留 30 条）。
assert.ok(shipSum/180<400,`下半年在途与近期转运日均 ${Math.round(shipSum/180)} 条，应有上限`);
assert.ok(Object.keys(ledger.archive||{}).length,"已结束转运应并入汇总");
assert.ok(state.reports.length<=GameState.REPORT_MAX&&state.reports.slice(GameState.REPORT_FULL).every(report=>report.pruned&&!report.resourceDelta),"旧战报只留战事条目");
assert.ok(ledger.shipments.every(cargo=>cargo.status!=="在途"||cargo.amount>=FiscalSystem.minRemittance(state,cargo.resource)||cargo.purpose!=="上缴"),"零星上缴应攒批起运");
// 紧凑存档读回：静态字段由基础数据补回，动态字段保持。
const saved=state.serialize();assert.equal(saved.world.cities.find(city=>city.id==="xian_01_03").historical,undefined,"存档不重复保存史籍字段");
const restored=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});restored.applySave(restored.migrateSave(structuredClone(saved)));
for(const officer of state.data.officers.filter(o=>o.expansionRound)){
  const compact=saved.world.officers.find(o=>o.id===officer.id),back=restored.data.officers.find(o=>o.id===officer.id);
  for(const key of ["basis","evidenceRef","homeCity","availableUntilYear","expansionRound","stationBasis","stationSource","stationSourceUrl"]){assert.equal(compact[key],undefined,`${officer.name} 不重复保存静态资料 ${key}`);assert.deepEqual(back[key],officer[key],`${officer.name} 读回资料 ${key}`)}
  for(const key of ["loyalty","city","force","status","merit","stamina","experience","officeRank","office"])assert.deepEqual(back[key],officer[key],`${officer.name} 动态状态 ${key}`);
}
for(const city of state.data.cities){const back=restored.data.cities.find(item=>item.id===city.id);assert.ok(back,`读档缺少据点 ${city.name}`);for(const key of ["name","x","y","commandery","force","garrison","population"])assert.deepEqual(back[key],city[key],`${city.name}.${key} 读档不一致`);assert.ok(back.historical,`${city.name} 史籍字段未补回`)}
for(const officer of state.data.officers.slice(0,50)){const back=restored.data.officers.find(item=>item.id===officer.id);assert.deepEqual(back.aptitude,officer.aptitude);assert.equal(back.force,officer.force);assert.equal(back.status,officer.status)}
// v17 及更早存档的存粮按口粮标定同比放大 4 倍。
const legacy=JSON.parse(JSON.stringify(saved));legacy.version=17;const before=JSON.parse(JSON.stringify(legacy)),migrated=restored.migrateSave(legacy),city=before.world.cities.find(item=>item.localFood>0);
assert.equal(migrated.resources.food,Math.round(before.resources.food*4),"旧存档中央存粮换算");assert.equal(migrated.world.cities.find(item=>item.id===city.id).localFood,Math.round(city.localFood*4),"旧存档地方存粮换算");
const fresh=JSON.parse(JSON.stringify(saved));assert.equal(restored.migrateSave(fresh).resources.food,fresh.resources.food,"新存档不重复换算");
console.log(`存档体积通过：半年 ${(half/1024)|0}KB / 一年 ${(full/1024)|0}KB / 转运 ${ledger.shipments.length} 条 / 战报 ${state.reports.length} 份 / 紧凑存档读回一致`);
