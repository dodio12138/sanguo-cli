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
assert.equal(editor.setProvince(1,1,"乙州"),false,"不能独立绘制州域");editor.assignCommanderyProvince("甲郡","乙州");
assert.equal(editor.city("a").province,"乙州");assert.equal(editor.counties[0].province,"乙州");assert.equal(editor.map.commanderySeats[0].mapProvince,"乙州");
assert.deepEqual(editor.terrain,terrain);assert.deepEqual(editor.commanderies,commanderies,"州域绘制不能改动郡域");
editor.undo();assert.equal(editor.city("a").province,"甲州");editor.redo();assert.equal(editor.city("a").province,"乙州");
const provinces=[...editor.provinces];editor.paint("commandery",0,0,2,2,"乙郡");
assert.equal(editor.city("a").commandery,"乙郡");assert.equal(editor.counties[0].commandery,"乙郡");assert.deepEqual(editor.provinces,provinces);
editor.undo();assert.equal(editor.city("a").commandery,"甲郡");
editor.beginEdit();editor.setCommandery(3,3,"丙郡");editor.assignCommanderyProvince("丙郡","丙州");editor.endEdit();
editor.updateCity("a",{x:3,y:3,province:"不应采用",commandery:"不应采用"});
assert.deepEqual([editor.city("a").province,editor.city("a").commandery],["丙州","丙郡"]);assert.deepEqual([editor.counties[0].x,editor.counties[0].y],[3,3]);
editor.undo();assert.deepEqual([editor.city("a").province,editor.city("a").commandery],["乙州","甲郡"]);
assert.equal(editor.fill("province","丁州"),0);assert.equal(editor.resetLayer("province"),false);editor.assignCommanderyProvince("甲郡","丁州");assert.ok(editor.cities.every(city=>city.province==="丁州"));editor.undo();assert.ok(editor.cities.every(city=>city.province==="乙州"));

const ceding=new MapEditor(fixture());
ceding.setCommandery(0,1,"乙郡");ceding.setCommandery(2,1,"丙郡");ceding.setCommandery(1,0,"乙郡");ceding.setCommandery(2,0,"远郡");
let beforeCede=ceding.snapshot(),historyBeforeCede=ceding.undoStack.length;
ceding.cedeCommandery(1,1,1,1,{random:()=>.6});
assert.equal(ceding.commanderyAt(1,1),"丙郡","候选郡去重且等概率，不能按重复邻格加权或取对角远郡");
assert.equal(ceding.city("a").commandery,"丙郡");assert.equal(ceding.counties[0].commandery,"丙郡");assert.equal(ceding.map.commanderySeats[0].commandery,"丙郡");
assert.deepEqual(ceding.terrain,beforeCede.terrain);assert.deepEqual(ceding.provinces,beforeCede.provinces);assert.deepEqual(ceding.customRoutes,beforeCede.customRoutes);
assert.equal(ceding.undoStack.length,historyBeforeCede+1);const afterCede=ceding.snapshot();ceding.undo();assert.deepEqual(ceding.snapshot(),beforeCede);ceding.redo();assert.deepEqual(ceding.snapshot(),afterCede,"重做不能再次随机");ceding.undo();
const visited=new Set();let randomCalls=0;ceding.beginEdit();ceding.cedeCommandery(1,1,1,1,{visited,random:()=>{randomCalls++;return 0}});ceding.cedeCommandery(1,1,1,1,{visited,random:()=>{randomCalls++;return .9}});ceding.endEdit();
assert.equal(randomCalls,1,"同一笔触重叠或重复移动不得反复随机");assert.equal(ceding.commanderyAt(1,1),"乙郡");ceding.undo();
ceding.setTerrain(2,1,"ocean");ceding.cedeCommandery(1,1,1,1,{random:()=>.99});assert.equal(ceding.commanderyAt(1,1),"乙郡","海面上的郡域不能作为接替邻郡");
beforeCede=ceding.snapshot();historyBeforeCede=ceding.undoStack.length;assert.equal(ceding.cedeCommandery(2,1,2,1),0);assert.deepEqual(ceding.snapshot(),beforeCede);assert.equal(ceding.undoStack.length,historyBeforeCede);
const wideCede=new MapEditor(fixture());for(let y=0;y<8;y++)wideCede.setCommandery(4,y,"邻郡");
beforeCede=wideCede.snapshot();assert.equal(wideCede.cedeCommandery(1,1,3,3),9,"宽笔刷应从接壤边逐步归邻郡，不能留下内部黑格");
for(let y=1;y<=3;y++)for(let x=1;x<=3;x++)assert.equal(wideCede.commanderyAt(x,y),"邻郡");wideCede.undo();assert.deepEqual(wideCede.snapshot(),beforeCede);
const interior=new MapEditor(fixture());beforeCede=interior.snapshot();assert.equal(interior.cedeCommandery(3,3,3,3),0,"内部格无其他邻郡时保留原归属");assert.deepEqual(interior.snapshot(),beforeCede);assert.equal(interior.undoStack.length,0);
interior.setCommandery(3,3,null);interior.cedeCommandery(3,3,3,3);assert.equal(interior.commanderyAt(3,3),"甲郡","已有未划定陆地格也可由邻郡填回");
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
const corners=new MapEditor(fixture()),legacy=corners.waterways[0];
const drawn=corners.saveWaterway(null,"角点河",[[0,0],[8,0],[8,8]],"corner");
assert.equal(drawn.anchor,"corner","新画河流沿格线保存");assert.ok(corners.validate().ok,"角点可落在网格右下边界");
assert.throws(()=>corners.saveWaterway(null,"越界河",[[0,0],[9,0]],"corner"),/整数坐标/,"角点仍不能越出网格");
const renamed=corners.saveWaterway(legacy.id,"旧河改名",legacy.points);assert.equal(renamed.anchor,undefined,"旧格心河流改名不改变坐标含义");
assert.throws(()=>corners.saveWaterway(legacy.id,"旧河",[[0,3],[8,3]]),/整数坐标/,"旧格心河流仍按格子范围校验");
assert.deepEqual(corners.exportMap().waterways.find(river=>river.name==="角点河").anchor,"corner","导出保留沿格线标记");
console.log("角点河流编辑通过：新河默认沿格线 / 边界角点可用 / 旧河坐标含义不变 / 导出保留标记");
