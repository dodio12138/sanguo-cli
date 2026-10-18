import assert from "node:assert/strict";
globalThis.window=globalThis;
await import("../js/data/offline-data.generated.js");
await import("../js/core/map-grid.js");await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");await import("../js/core/game-state.js");

// 以真实城池推演四种围法，天数应落在史例量级：围困数月至半年、强攻二至四月且伤亡重、水攻（下邳、邺）约三月、地道成败不定。
function siege(cityName,soldiers,method){
  const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"}),data=state.data,engine=state.engine,city=data.cities.find(item=>item.name===cityName),stagingId=data.rules.city_graph[city.id][0];
  data.cities.find(item=>item.id===stagingId).force="cao";if(["cao","neutral"].includes(city.force))city.force="yuan";
  const army={id:"probe",name:"攻城军",force:"cao",city:stagingId,commander:"曹操",soldiers,units:{infantry:soldiers,cavalry:0,archers:0},morale:80,training:70,supply:100,siegeTarget:city.id,siegeMethod:method,stance:"围城"};
  data.armies=[...data.armies.filter(item=>item.force!=="cao"&&!(item.city===city.id&&item.force===city.force)),army];
  const start=army.soldiers,events=[],outlook=engine.siegeOutlook([army],city);state.date={year:200,month:1,day:10};let xun=0;
  for(;xun<60&&city.force!=="cao"&&army.siegeTarget;xun++){army.supply=100;engine.resolveSieges(state,events);state.turn++}
  return {days:xun*10,taken:city.force==="cao",loss:start-army.soldiers-events.filter(e=>e.occupationGarrison).reduce((n,e)=>n+e.occupationGarrison,0),outlook,events};
}
const blockade=siege("邺",60000,"blockade"),assault=siege("邺",60000,"assault"),flood=siege("邺",60000,"flood");
for(const [name,result] of [["围困",blockade],["强攻",assault],["水攻",flood]])assert.ok(result.taken,`邺城${name}应能攻克`);
assert.ok(blockade.days>=120&&blockade.days<=240,`邺城围困 ${blockade.days} 日，应为四至八月`);
assert.ok(assault.days>=60&&assault.days<=150,`邺城强攻 ${assault.days} 日，应为二至五月`);
assert.ok(flood.days>=60&&flood.days<=120&&flood.days<blockade.days,`邺城水攻 ${flood.days} 日，应约三月且快于围困（史载围邺五月，引漳灌城后下）`);
assert.ok(assault.loss>blockade.loss*3,"强攻伤亡应远高于围困");
assert.ok(flood.events.some(event=>event.text.includes("水浸")),"水攻应浸坏城中存粮");
const chengdu=siege("成都",40000,"flood");assert.equal(chengdu.outlook.methods.flood.available,false,"成都不临河道，不能水攻");assert.ok(chengdu.events.some(event=>event.text.includes("围困")),"不可水攻时退回围困");
const pass=siege("潼关",30000,"flood");assert.equal(pass.outlook.methods.flood.available,false,"关隘据险，不能水攻");
const engine=new RuleEngine(structuredClone(SANGUO_DATA)),city=name=>engine.data.cities.find(item=>item.name===name);
assert.ok(engine.cityFortification(city("潼关"))>engine.cityFortification(city("白马津")),"关隘险固应高于渡口");
assert.ok(engine.cityRiverside(city("下邳"))&&engine.cityRiverside(city("邺")),"下邳、邺临河，可引水灌城");
console.log(`围城史例校准通过：邺城围困 ${blockade.days} 日 / 强攻 ${assault.days} 日（伤 ${assault.loss}） / 水攻 ${flood.days} 日 / 成都与关隘不可水攻`);
