import assert from "node:assert/strict";
globalThis.window=globalThis;
await import("../js/data/offline-data.generated.js");
await import("../js/core/map-grid.js");await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");await import("../js/core/game-state.js");

// 搭一场曹军围邺：攻方可总攻、劝降、改换围法、撤围；守方（玩家守城时）可出城突击、激励固守。
function setup(player="cao"){const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:player}),data=state.data,engine=state.engine,city=data.cities.find(item=>item.name==="邺"),stagingId=data.rules.city_graph[city.id][0];
  data.cities.find(item=>item.id===stagingId).force="cao";city.force="yuan";state.diplomacy.wars=["yuan","cao"];
  const army={id:"probe",name:"攻城军",force:"cao",city:stagingId,commander:"曹操",soldiers:60000,units:{infantry:60000,cavalry:0,archers:0},morale:80,training:70,supply:100,siegeTarget:city.id,siegeMethod:"blockade",stance:"围城"};
  data.armies=[...data.armies.filter(item=>item.force!=="cao"&&item.city!==city.id),army];state.date={year:200,month:1,day:10};engine.playerForceId=player;return {state,data,engine,city,army}}
const act=(ctx,action,extra={})=>{const events=[];ctx.engine.resolveSiegeAction({type:"siege_action",armyIds:[ctx.army.id],cityIds:[ctx.city.id],options:{action},...extra},ctx.state,events);return events};

let ctx=setup();act(ctx,"storm");assert.equal(ctx.city.siegeStorm,"cao","总攻应约定于本日");
const blockade=setup();blockade.engine.resolveSieges(blockade.state,[]);ctx.engine.resolveSieges(ctx.state,[]);
assert.ok(ctx.city.defenseDamage>blockade.city.defenseDamage*3,"总攻城防损失应远大于围困");assert.ok(ctx.army.soldiers<blockade.army.soldiers,"总攻攻方伤亡更重");
assert.equal(ctx.army.siegeMethod,"blockade","总攻不改原围法");assert.equal(ctx.city.siegeWorksMethod,"blockade","总攻不打乱工事进度");assert.equal(ctx.city.siegeStorm,undefined,"总攻只结算一次");

ctx=setup();ctx.state.random=()=>.99;ctx.city.siegeMorale=60;let events=act(ctx,"parley");assert.equal(ctx.city.force,"yuan");assert.equal(ctx.city.siegeMorale,63,"劝降失败守军更坚");assert.ok(events[0].text.includes("劝降不成"));
events=act(ctx,"parley");assert.ok(events[0].text.includes("本日已遣使"),"每日限一次");
ctx=setup();ctx.state.random=()=>0;ctx.city.siegeMorale=10;act(ctx,"parley");assert.equal(ctx.city.force,"cao","劝降成功即开城");

ctx=setup();act(ctx,"method:tunnel");assert.equal(ctx.army.siegeMethod,"tunnel");
events=act(ctx,"lift");assert.equal(ctx.army.siegeTarget,undefined,"撤围后不再围城");assert.equal(ctx.city.siegeTurns,undefined);

ctx=setup("yuan");ctx.city.siegeWorks=2;ctx.city.siegeWorksMethod="blockade";ctx.state.random=()=>0;const before=ctx.army.soldiers;events=act(ctx,"sortie",{armyIds:[]});
assert.equal(ctx.city.siegeWorks,0,"突击得手焚毁攻具");assert.ok(ctx.army.soldiers<before,"突击杀伤围城军");
ctx.city.localGold=2000;const morale=ctx.city.siegeMorale??72;act(ctx,"rally",{armyIds:[]});assert.ok(ctx.city.siegeMorale>morale,"犒军提升士气");assert.ok(ctx.city.localGold<2000);
console.log("攻守城指令通过：总攻加倍且不改围法 / 劝降成败与每日一次 / 改换围法 / 撤围 / 出城突击焚毁攻具 / 犒军固守");
