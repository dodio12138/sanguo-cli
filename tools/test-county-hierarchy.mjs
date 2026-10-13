import assert from "node:assert/strict";
globalThis.window=globalThis;
await import("../js/data/offline-data.generated.js");
await import("../js/core/map-grid.js");await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");await import("../js/core/game-state.js");

// 县级层级只有普通县、郡治、州治：普通县只领本县，无据点的县归本郡郡治。
const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"}),data=state.data,engine=state.engine,divisions=data.administrativeDivisions,byName=name=>data.cities.find(city=>city.name===name),rank=city=>MapGrid.nodeRank(city,divisions);
for(const city of data.cities){const governed=engine.countiesForCity(city.id);if(MapGrid.nodeKind(city)!=="city")assert.ok(governed.every(county=>county.x===city.x&&county.y===city.y),`${city.name}为关隘渡口，只领同格之县`);else if(rank(city)==="county")assert.ok(governed.length<=1,`普通县${city.name}不应下辖 ${governed.length} 县`)}
const ownIds=new Set(MapGrid.assignCountyJurisdiction(structuredClone(data.counties),data.cities,divisions).filter(county=>county.ownCityId).map(county=>county.id));
for(const county of data.counties){if(ownIds.has(county.id))continue;const seat=data.cities.find(city=>city.id===county.jurisdictionCityId);assert.ok(seat&&seat.commandery===county.commandery,`${county.name}应归本郡治所`);if(data.cities.some(city=>city.commandery===county.commandery&&MapGrid.nodeKind(city)==="city"&&rank(city)!=="county"))assert.notEqual(rank(seat),"county",`${county.name}应归郡治而非普通县`)}
assert.deepEqual(engine.countiesForCity(byName("许昌").id).map(county=>county.name),["许县"],"许昌为普通县，只领许县");
assert.equal(ownIds.size,data.counties.length,"每县皆有可驻军的据点");assert.deepEqual(engine.countiesForCity(byName("阳翟").id).map(county=>county.name),["阳翟"],"郡治阳翟只领本县，属县各自成据点");
// 补员兵源按驻地级别汇集，每城只计一次并留守城底数。
for(const city of data.cities)if(city.force==="cao")city.garrison=8000;
const xuchang=byName("许昌"),yangdi=byName("阳翟");
assert.equal(engine.reinforcementScope(xuchang),"local");assert.deepEqual(engine.reinforcementSources(xuchang,"cao").map(item=>item.city.id),[xuchang.id],"普通县只抽本县");
const seat=data.cities.find(city=>city.force==="cao"&&engine.reinforcementScope(city)==="commandery"&&data.cities.filter(item=>item.force==="cao"&&item.commandery===city.commandery&&MapGrid.nodeKind(item)==="city").length>1);
assert.ok(seat,"应有我方郡治下辖多城");const sources=engine.reinforcementSources(seat,"cao");assert.ok(sources.length>1&&sources.every(item=>item.city.commandery===seat.commandery),"郡治抽本郡我方县邑");assert.equal(new Set(sources.map(item=>item.city.id)).size,sources.length,"同一城不重复计入");
const province=data.cities.find(city=>city.force==="cao"&&engine.reinforcementScope(city)==="province");if(province){const list=engine.reinforcementSources(province,"cao");assert.ok(list.every(item=>item.city.province===province.province),"州治抽本州我方县邑");assert.ok(list.length>=engine.reinforcementSources(seat,"cao").length||province.province!==seat.province)}
const before=new Map(sources.map(item=>[item.city.id,item.city.garrison])),pool=engine.reinforcementPool(seat,"cao"),{total,drawn}=engine.drawReinforcements(seat,pool+5000,"cao");
assert.equal(total,pool,"抽调以兵源总数为限");for(const item of drawn){const city=data.cities.find(entry=>entry.id===item.cityId);assert.equal(before.get(city.id)-city.garrison,item.amount,"来源县实扣兵员");assert.equal(city.garrison,engine.reserveGarrison(city),"抽尽后保留守城底数")}
// 旧存档县仍挂在普通县下：读档按层级重归，人口不变。
const world=structuredClone(state.serialize().world);world.cities=world.cities.filter(city=>!city.countyNode);const moved=world.counties.find(county=>county.name==="长社");moved.jurisdictionCityId=xuchang.id;moved.population=12345;
const restored=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});restored.restoreWorld(world);const county=restored.data.counties.find(item=>item.name==="长社");
assert.equal(county.jurisdictionCityId,"xian_01_03","旧存档长社应改归其县邑据点");assert.ok(restored.data.cities.some(city=>city.id==="xian_01_03"&&city.force===yangdi.force),"旧存档补入县邑据点并随郡治归属");assert.ok(restored.data.rules.city_graph.xian_01_03?.length,"补入的县邑接入路网");assert.equal(county.population,12345,"重归不改人口");
console.log(`县级层级通过：普通县只领本县 / ${data.counties.length-ownIds.size} 县归郡治直辖 / 郡治补员抽本郡 ${sources.length} 城 / 来源县实扣并留底 / 旧存档重归`);
