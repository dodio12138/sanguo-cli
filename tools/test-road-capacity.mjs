import assert from "node:assert/strict";
globalThis.window=globalThis;
await import("../js/data/offline-data.generated.js");
await import("../js/core/map-grid.js");await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");await import("../js/core/game-state.js");

const data=structuredClone(SANGUO_DATA),engine=new RuleEngine(data),id=name=>data.cities.find(city=>city.name===name).id,route=(a,b)=>engine.path(id(a),id(b));
// 通行量：栈道上大军延误远甚于驿道；轻兵不受影响。
const shu=route("长安","成都"),plain=route("洛阳","长安");
assert.equal(engine.routeDays(shu,5000),engine.routeDays(shu),"五千轻兵不应拥塞");
assert.ok(engine.routeDays(shu,60000)>engine.routeDays(shu)*1.1,"六万大军走栈道入蜀应明显迟滞");
assert.ok(engine.routeDays(plain,60000)/engine.routeDays(plain)<engine.routeDays(shu,60000)/engine.routeDays(shu),"驿道拥塞应轻于栈道");
// 战场宽度：关隘只容一单位接战，以寡敌众；开阔地人多者全力出战。
assert.equal(engine.frontageFactor(20000,4),1,"开阔地两万人可全数接战");
assert.ok(engine.frontageFactor(50000,1)<.4,"关隘五万人大多只能轮换");
const pass=data.cities.find(city=>city.name==="阳平关");assert.equal(engine.siteFrontage(pass,{frontage:3}),1,"关隘接战宽度取一");
assert.ok(engine.wallFrontage(data.cities.find(city=>city.name==="邺"))>engine.wallFrontage(pass),"州治城墙可展开的攻城面宽于关隘");
// 转运：同样里程漕运损耗低于陆运，栈道最费。
const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});state.date={year:200,month:1,day:1};for(const city of state.data.cities)city.force="cao";state.data.armies=[];
const loss=(a,b)=>{const s=state.data.cities.find(city=>city.name===a),t=state.data.cities.find(city=>city.name===b);s.force=t.force="cao";const cargo=FiscalSystem.enqueue(state,{forceId:"cao",sourceCityId:s.id,targetCityId:t.id,resource:"food",amount:10000,targetKind:"local"});return cargo};
const water=loss("江陵","夏口"),mountain=loss("南郑","槐里");
assert.ok(water&&mountain,"转运应能成行");
assert.ok(water.transportLoss/water.amount<mountain.transportLoss/mountain.amount,"长江漕运损耗应低于褒斜栈道");
assert.ok(water.legDays?.length===water.route.length-1,"按日模式记录逐段日程");
console.log(`道路通行量与战场宽度通过：长安—成都 轻兵 ${engine.routeDays(shu)} 日 / 六万 ${engine.routeDays(shu,60000)} 日；关隘五万人出力 ${Math.round(engine.frontageFactor(50000,1)*100)}%；漕运损 ${water.transportLoss} / 栈道损 ${mountain.transportLoss}`);
