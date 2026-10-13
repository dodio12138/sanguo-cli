import assert from "node:assert/strict";
globalThis.window=globalThis;globalThis.localStorage={getItem:()=>null,setItem:()=>{},removeItem:()=>{}};
await import("../js/data/offline-data.generated.js");
await import("../js/core/map-grid.js");await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");await import("../js/core/game-state.js");

// 郡守托管：默认开启，按前线/腹地设募兵目标、以本城府库督查最弱一项；都城、手设目标与关闭托管的郡不动。
const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"}),data=state.data,engine=state.engine;state.date={year:200,month:1,day:10};engine.initializeAdministration();
const own=data.cities.filter(city=>city.force==="cao"&&MapGrid.nodeKind(city)==="city"),capital=data.forces.find(force=>force.id==="cao").capital,capitalCity=own.find(city=>city.id===capital||city.name===capital);
for(const city of own)city.localGold=5000;const capitalTarget=capitalCity?.administration.recruitmentTarget;
const manual=own.find(city=>city!==capitalCity&&!city.commanderySeatNode);manual.administration.manualRecruitment=true;manual.administration.recruitmentTarget=777;
const offCommandery=own.find(city=>city.commanderySeatNode&&city!==capitalCity&&own.filter(item=>item.commandery===city.commandery).length>1&&city.commandery!==manual.commandery).commandery,offSeat=engine.commanderySeat(offCommandery,"cao");offSeat.administration.delegateCommandery=false;const offCity=own.find(city=>city.commandery===offCommandery&&city!==offSeat),offTarget=offCity.administration.recruitmentTarget;
const events=[];engine.runCommanderyDelegation(state,events);
const managed=own.filter(city=>city!==capitalCity&&city!==manual&&city.commandery!==offCommandery&&engine.commanderyDelegated(city.commandery,"cao"));
for(const city of managed){const expected=Math.round(engine.reserveGarrison(city)*(engine.isFrontierCity(city)?4:2)/100)*100;assert.equal(city.administration.recruitmentTarget,expected,`${city.name}募兵目标应为 ${expected}`)}
assert.ok(managed.some(city=>engine.isFrontierCity(city))&&managed.some(city=>!engine.isFrontierCity(city)),"应同时覆盖前线与腹地");
assert.ok(managed.every(city=>Object.values(city.administration.boosts).some(until=>until>=state.turn)),"托管各城应有督查加速");assert.ok(managed.every(city=>city.localGold<5000),"督查费用出自本城府库");
assert.equal(manual.administration.recruitmentTarget,777,"手设募兵目标不被覆盖");assert.equal(offCity.administration.recruitmentTarget,offTarget,"关闭托管的郡不动");
if(capitalCity)assert.equal(capitalCity.administration.recruitmentTarget,capitalTarget,"都城不托管");
assert.ok(events.some(event=>event.phase==="郡务"),"按郡汇总郡务战报");
const again=[];engine.runCommanderyDelegation(state,again);assert.ok(!again.some(event=>event.text.includes("督查")),"加速期内不重复督查");
console.log(`郡守托管通过：托管 ${managed.length} 城 / 前线与腹地募兵目标 / 本城府库督查 / 手设与关闭托管不动 / 都城不托管 / 郡务汇总`);
