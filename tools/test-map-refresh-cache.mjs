// 地图日刷新缓存：与完整重算一致，变化时失效，不改地形数据。
import assert from "node:assert/strict";
globalThis.window=globalThis;
await import("../js/data/offline-data.generated.js");
for(const f of ["data-loader","map-grid","game-clock","fiscal-system","rule-engine","game-state"])await import(`../js/core/${f}.js`);
await import("../js/ui/map-view.js");
const game=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"}),view=Object.create(MapView.prototype);
Object.assign(view,{state:game,territoryRadius:8,draw(){this.draws=(this.draws||0)+1}});
const terrain=game.data.map.terrain;
const supplyCity=game.data.cities.find(c=>c.force==="cao"),stock=supplyCity.localFood,capacity=supplyCity.storage,isolation=game.engine.isIsolatedCity;let isolatedCalls=0;game.engine.isIsolatedCity=function(...args){isolatedCalls++;return isolation.apply(this,args)};
for(const [ratio,expected] of [[0,0],[.079,0],[.08,1],[.299,1],[.3,2]]){supplyCity.localFood=capacity*ratio;const before=isolatedCalls;assert.equal(game.engine.citySupplyBand(game,supplyCity).level,expected);assert.equal(isolatedCalls,before,"地图等级查询不做孤立判断");assert.equal(game.engine.citySupplyStatus(game,supplyCity.id).level,expected);assert.equal(isolatedCalls,before+1,"完整详情仍计算飞地状态")}
supplyCity.localFood=stock;game.engine.isIsolatedCity=isolation;

view.refreshSupply(true);
const cells=view.cells,owners=view.ownerGrid,roads=view.routes;
const values=rows=>rows.map(c=>[c.x,c.y,c.terrain,c.province,c.commandery,c.county?.id,c.supply,c.supplySource,c.supplyDistance]);
const equivalent=()=>assert.deepEqual(values(view.cells),values(view.makeCells()),"缓存动态补给与完整重算一致");
equivalent();view.refreshSupply();assert.equal(view.cells,cells,"普通日不重建格子");assert.equal(view.ownerGrid,owners,"普通日不重建归属");assert.equal(view.routes,roads,"普通日不重建路网");equivalent();
const city=game.data.cities.find(c=>c.force==="cao");city.localFood=0;view.refreshSupply();assert.equal(view.cells,cells,"粮食变化只更新动态补给");equivalent();
game.intelligence.cities[game.data.cities.find(c=>c.force!=="cao").id]=3;const revision=view.colorRevision;view.refreshSupply();assert.equal(view.cells,cells);assert(view.colorRevision>revision,"新情报使颜色缓存失效");
const conquered=game.data.cities.find(c=>c.force!=="cao"&&c.force!=="neutral");conquered.force="cao";view.refreshSupply();assert.notEqual(view.cells,cells,"易主立即重建最近补给源与归属");equivalent();assert.equal(view.commanderyOwners.get(conquered.commandery)?.force.id,game.data.cities.find(c=>c.commandery===conquered.commandery&&c.id===view.commanderyOwners.get(conquered.commandery)?.city.id)?.force);
let previous=view.cells;game.data.cities=structuredClone(game.data.cities);view.refreshSupply();assert.notEqual(view.cells,previous,"换档替换同值对象，也不能残留旧人物／城池引用");assert.equal(view.cells.find(c=>c.county)?.county,game.data.counties.find(c=>c.id===view.cells.find(c=>c.county).county.id));
previous=view.cells;game.data.map=structuredClone(game.data.map);view.refreshSupply();assert.notEqual(view.cells,previous,"同值新地图对象也按新来源重建");equivalent();
previous=view.cells;const province=Object.keys(game.data.map.commandery_provinces)[0];game.data.map.commandery_provinces[province]="校验州";view.refreshSupply();assert.notEqual(view.cells,previous,"整郡州属修改使地理缓存失效");equivalent();
previous=view.cells;const node=game.data.cities[0];node.x=(node.x+1)%game.data.map.width;view.refreshSupply();assert.notEqual(view.cells,previous,"据点坐标修改使几何缓存失效");equivalent();
view.waterLegCache=new Map([["old",[]]]);game.data.rules.city_graph={};game.data.map.roads=[];view.refreshSupply();assert.equal(view.routes.length,0,"明确空路网不能重新生成道路");assert.equal(view.waterLegCache,null,"道路变化同时清除河海路径缓存");
assert.equal(game.data.map.terrain,terrain,"所有显示刷新均未改用户地形");
console.log("地图刷新缓存通过：普通日复用、粮食／情报更新、易主／换档／区划／坐标失效、空路网与完整重算一致、地形不变");
