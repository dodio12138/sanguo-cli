import assert from "node:assert/strict";
globalThis.window=globalThis;
await import("../js/core/map-grid.js");
await import("../js/ui/map-editor.js");
const fixture=()=>({
  map:{id:"layers-lines",width:8,height:8,terrain:MapGrid.encode(Array(64).fill("plains")),provinces:MapGrid.encode(Array(64).fill("甲州")),commanderies:MapGrid.encode(Array(64).fill("甲郡")),waterways:[{name:"旧河",points:[[0,3],[3,3],[7,5]]}],landmarks:[],commanderySeats:[{id:"seat",name:"甲郡",cityId:"a",x:1,y:1}],roads:[{id:"main:a|b",kind:"main",from:"a",to:"b",points:[[1,1],[2,1],[3,1],[4,1]]}]},
  forces:[{id:"cao",name:"曹营"}],terrainDefs:{plains:{name:"平原"},forest:{name:"森林"},ocean:{name:"海洋"}},
  cities:[{id:"a",name:"甲城",type:"city",force:"cao",x:1,y:1,province:"旧州",commandery:"旧郡"},{id:"b",name:"乙城",type:"city",force:"cao",x:4,y:1}],
  counties:[{id:"q1",name:"甲县",cityId:"a",jurisdictionCityId:"a",x:1,y:1},{id:"q2",name:"乙县",jurisdictionCityId:"b",x:6,y:5}],rules:{city_graph:{a:["b"],b:["a"]}}
});
const source=fixture(),editor=new MapEditor(source);
assert.equal(editor.city("a").province,"甲州");assert.equal(source.cities[0].province,"旧州","打开编辑器不能写入原战局");
const terrain=[...editor.terrain],commanderies=[...editor.commanderies];
editor.setProvince(1,1,"乙州");
assert.equal(editor.city("a").province,"乙州");assert.equal(editor.counties[0].province,"乙州");assert.equal(editor.map.commanderySeats[0].mapProvince,"乙州");
assert.deepEqual(editor.terrain,terrain);assert.deepEqual(editor.commanderies,commanderies,"州域绘制不能改动郡域");
editor.undo();assert.equal(editor.city("a").province,"甲州");editor.redo();assert.equal(editor.city("a").province,"乙州");
const provinces=[...editor.provinces];editor.paint("commandery",0,0,2,2,"乙郡");
assert.equal(editor.city("a").commandery,"乙郡");assert.equal(editor.counties[0].commandery,"乙郡");assert.deepEqual(editor.provinces,provinces);
editor.undo();assert.equal(editor.city("a").commandery,"甲郡");
editor.beginEdit();editor.setProvince(3,3,"丙州");editor.setCommandery(3,3,"丙郡");editor.endEdit();
editor.updateCity("a",{x:3,y:3,province:"不应采用",commandery:"不应采用"});
assert.deepEqual([editor.city("a").province,editor.city("a").commandery],["丙州","丙郡"]);assert.deepEqual([editor.counties[0].x,editor.counties[0].y],[3,3]);
editor.undo();assert.deepEqual([editor.city("a").province,editor.city("a").commandery],["乙州","甲郡"]);
editor.fill("province","丁州");assert.ok(editor.cities.every(city=>city.province==="丁州"));editor.resetLayer("province");assert.ok(editor.cities.every(city=>city.province==="甲州"));editor.undo();assert.ok(editor.cities.every(city=>city.province==="丁州"));

const roads=new MapEditor(fixture()),oldRoad=structuredClone(roads.customRoutes[0]);
roads.beginEdit();roads.reshapeRoadPoint(oldRoad.id,1,2,2);roads.reshapeRoadPoint(oldRoad.id,1,2,3,oldRoad.points);roads.endEdit();
assert.ok(roads.customRoutes[0].points.some(([x,y])=>x===2&&y===3));assert.equal(roads.validate().ok,true);
assert.equal(new Set(roads.customRoutes[0].points.map(point=>point.join(","))).size,roads.customRoutes[0].points.length,"节点调整不能产生原路折返或自交");
roads.undo();assert.deepEqual(roads.customRoutes[0],oldRoad,"整次节点拖动只需要一次撤销");
const countyRoad=roads.saveRoadPath("b","q2",[[4,1],[5,1],[6,1],[6,2],[6,3],[6,4],[6,5]],{kind:"county"});
assert.equal(countyRoad.kind,"county");assert.equal(roads.validate().ok,true,"县治道路应可保存编辑");
roads.removeRoad(oldRoad.id);assert.equal(roads.connected("a","b"),false,"删除城市道路也要清除通行关系");assert.equal(roads.customRoutes.length,1);roads.undo();assert.equal(roads.connected("a","b"),true);
const beforeClear=roads.snapshot();roads.clearRoads();assert.equal(roads.customRoutes.length,0);assert.equal(roads.roads().length,0);roads.undo();assert.deepEqual(roads.snapshot(),beforeClear);
const replacement=roads.saveRoadPath("a","q2",[[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],[6,2],[6,3],[6,4],[6,5]],{id:oldRoad.id,kind:"county"});
assert.equal(replacement.kind,"county");assert.equal(roads.connected("a","b"),false,"改换道路端点不残留旧连接");roads.undo();
const beforeInvalid=roads.snapshot();assert.throws(()=>roads.reshapeRoadPoint(oldRoad.id,1,1000000,1000000),/越界/);assert.deepEqual(roads.snapshot(),beforeInvalid);

const rivers=new MapEditor(fixture()),initial=structuredClone(rivers.waterways[0]);
const points=structuredClone(initial.points);points[1]=[3,4];rivers.saveWaterway(initial.id,"改名河",points);
assert.equal(rivers.waterways[0].name,"改名河");assert.deepEqual(rivers.terrain,terrain,"河流路径是独立图层，不能涂掉底层地形");rivers.undo();assert.deepEqual(rivers.waterways[0],initial);
const added=rivers.saveWaterway(null,"新河",[[1,6],[3,5],[6,6]]);assert.ok(added.id);assert.equal(rivers.validate().ok,true);
rivers.removeWaterway(added.id);assert.equal(rivers.waterways.length,1);rivers.undo();assert.equal(rivers.waterways.length,2);
const beforeRiversClear=rivers.snapshot();rivers.clearWaterways();assert.deepEqual(rivers.exportMap().waterways,[]);rivers.undo();assert.deepEqual(rivers.snapshot(),beforeRiversClear);
const beforeBad=rivers.snapshot(),history=rivers.undoStack.length;
assert.throws(()=>rivers.saveWaterway(null,"坏河",[[1.5,2],[3,4]]),/整数坐标/);assert.throws(()=>rivers.importPatch({map:{waterways:[{name:"坏河",points:[[0,0],[1.5,2]]}]}}),/校验失败/);
assert.deepEqual(rivers.snapshot(),beforeBad);assert.equal(rivers.undoStack.length,history);
const imported=new MapEditor(fixture());imported.importPatch(rivers.exportPatch());assert.deepEqual(imported.waterways,rivers.waterways);
imported.importPatch({map:{provinces:MapGrid.encode(Array(64).fill("新州")),commanderies:MapGrid.encode(Array(64).fill("新郡"))}});
assert.ok(imported.cities.every(city=>city.province==="新州"&&city.commandery==="新郡"),"导入边界后城市也应自动归属");
console.log("州郡及线要素通过：独立图层 / 坐标自动归属 / 同步撤销 / 城市与县治道路 / 节点调整 / 单条与批量删除 / 河流编辑 / 无损导出 / 非法导入拦截");
