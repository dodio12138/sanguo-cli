import assert from "node:assert/strict";

globalThis.window=globalThis;
await import("../js/core/map-grid.js");
await import("../js/ui/map-editor.js");
const {MapGrid,MapEditor}=globalThis;

const rows=count=>new Array(count).fill("plains");
const fixture=()=>({
  map:{id:"test-map",type:"map",width:6,height:6,terrain:MapGrid.encode(rows(36))},
  terrainDefs:{plains:{name:"平原",color:"#5a6b3a"},ocean:{name:"海洋",color:"#1b3a5a"},mountain:{name:"山地",color:"#5b5148"}},
  forces:[{id:"cao",name:"曹营"},{id:"shu",name:"蜀营"}],
  cities:[{id:"a",name:"甲城",type:"city",force:"cao",x:1,y:1,population:12000,garrison:800,commandery:"陈留"},
    {id:"b",name:"乙城",type:"city",force:"cao",x:4,y:1,population:9000,garrison:500,commandery:"陈留"},
    {id:"c",name:"丙城",type:"city",force:"shu",x:1,y:4,population:15000,garrison:1200,commandery:"洛阳"}],
  counties:[{id:"q1",name:"陈留",x:1,y:1,capital:1,commandery:"陈留",jurisdictionCityId:"a"}],
  rules:{city_graph:{a:["b"],b:["a"]}}
});

const mixed=["plains","plains","plains","ocean",null,null,"mountain","mountain"];
assert.deepEqual(MapGrid.decode(MapGrid.encode(mixed),mixed.length),mixed,"RLE 编码必须能回读重复值、单值与空值");
assert.equal(MapGrid.encode(["plains","plains","plains"]),"plains*3","连续同值应压缩为 值*数量");
assert.equal(MapGrid.encode([]),"","空图层应编码为空串");
assert.equal(MapGrid.decode(""),null,"空串应解码为 null");
assert.throws(()=>MapGrid.decode("plains*3",5),/长度/,"分层长度不符必须报错");
assert.throws(()=>MapGrid.decode("plains*x"),/损坏/,"非法计数必须报错");
assert.throws(()=>MapGrid.encode(["plains,ocean"]),/不能包含/,"取值含分隔符必须拒绝");
assert.deepEqual(MapGrid.dimensions({}),{width:MapGrid.DEFAULT_WIDTH,height:MapGrid.DEFAULT_HEIGHT},"缺省尺寸应回落到默认舆图");
assert.deepEqual(MapGrid.dimensions({width:6,height:6}),{width:6,height:6});

const editor=new MapEditor(fixture());
assert.equal(editor.width,6);assert.equal(editor.height,6);
assert.equal(editor.roadNetwork().length,0,"编辑器不得自动寻路生成道路轨迹");
assert.deepEqual(editor.terrain,MapGrid.defaultTerrain(6,6).map(()=>"plains"),"显式提供的地形层应优先于程序默认值");
assert.deepEqual(editor.provinces,MapGrid.defaultProvinces(6,6),"未提供州域时使用程序默认州域");
assert.deepEqual(editor.commanderies,MapGrid.defaultCommanderies(6,6,editor.cities,editor.counties),"未提供郡域时按县治最近邻生成");
assert.equal(editor.stats().roads,1,"初始路网应统计为一条道路");

assert.equal(editor.paint("province",0,0,2,2,"兖州"),9,"矩形笔刷应绘制 3×3 格");
assert.equal(editor.paint("province",0,0,2,2,"兖州"),0,"重复绘制同一取值不应产生改动");
assert.equal(editor.provinceAt(2,2),"兖州");
assert.equal(editor.provinceAt(3,3),MapGrid.provinceAt(3,3),"笔刷范围外的格子保持不变");
assert.equal(editor.fill("commandery","测试郡"),36,"整层填充应覆盖全部格子");
assert.equal(editor.fill("commandery","测试郡"),0,"整层填充同值应为无改动");
const regions=new MapEditor(fixture());regions.provinces=new Array(36).fill("甲州");regions.provinces[0]=regions.provinces[1]=regions.provinces[2]="乙州";assert.equal(regions.relabelRegion("province",0,0,"丙州"),3,"整片区域改属应只替换相连的同值网格");assert.equal(regions.provinceAt(2,0),"丙州");assert.equal(regions.provinceAt(3,0),"甲州","区域改属不得跨越边界");assert.equal(regions.undo(),true);assert.equal(regions.provinceAt(1,0),"乙州","区域改属应支持撤销");assert.equal(regions.redo(),true);const regionRoundTrip=new MapEditor(fixture());regionRoundTrip.importPatch({map:regions.exportMap()});assert.equal(regionRoundTrip.provinceAt(1,0),"丙州","区域改动应写入可导出的地图数据");
assert.equal(editor.setTerrain(5,5,"mountain"),true,"单格改地形应生效");
assert.equal(editor.setTerrain(5,5,"mountain"),false,"同值写入应返回未改动");
assert.equal(editor.at("province",6,0),null,"越界读取应返回 null");
assert.equal(editor.setTerrain(6,0,"plains"),false,"越界写入应被忽略");
assert.equal(editor.inBounds(5,5),true);assert.equal(editor.inBounds(-1,0),false);

assert.equal(editor.undo(),true,"撤销应成功");
assert.equal(editor.terrainAt(5,5),"plains","撤销应回退单格地形改动");
assert.equal(editor.redo(),true,"重做应成功");
assert.equal(editor.terrainAt(5,5),"mountain","重做应恢复被撤销的改动");
for(let index=0;index<80;index++)editor.setTerrain(0,0,index%2?"plains":"hills");
assert.ok(editor.undoStack.length<=MapEditor.checkpointLimit,"撤销栈必须限制上限");

const added=editor.addCity({id:"d",name:"丁城",x:3,y:3,force:"shu",commandery:"陈留",population:4000,garrison:300});
assert.equal(editor.city("d").name,"丁城","新增据点应写入编辑器");
assert.equal(editor.neighbors("d").length,0,"新建据点不得擅自连到最近城市");
assert.throws(()=>editor.addCity({id:"d"}),/已存在/,"重复据点 ID 必须报错");
assert.equal(editor.city("nope"),null,"未知据点查询应返回 null");
editor.moveCity("d",4,4);
assert.deepEqual([editor.city("d").x,editor.city("d").y],[4,4],"移动据点应取整并写入坐标");
assert.throws(()=>editor.moveCity("d",4,1),/已有据点/,"据点不得移动到已占用网格");
assert.throws(()=>editor.moveCity("d",99,0),/地图范围/,"据点不得移动到地图范围外");
editor.updateCity("d",{population:5000});
assert.equal(editor.city("d").population,5000,"更新据点应合并字段");
assert.deepEqual(editor.cityIds(),new Set(["a","b","c","d"]));

assert.equal(editor.connected("a","b"),true,"初始路网 a-b 应连通");
assert.equal(editor.connected("b","a"),true,"道路连通必须双向成立");
editor.toggleRoad("a","d");
assert.equal(editor.connected("a","d"),true,"切换道路应新增连通");
assert.deepEqual(editor.neighbors("d"),["a"],"邻居列表应包含新增的连通据点");
assert.equal(editor.connectivity().length,2,"a-b-d 一组、c 一组应为两个连通区");
assert.equal(editor.setRoad("a","c",true),true);
assert.deepEqual(editor.roads().map(edge=>edge.join("-")),["a-b","a-c","a-d"],"道路列表应有序且覆盖每条边");
assert.equal(editor.connectivity().length,1,"三点连通后应合并为一个连通区");
assert.equal(editor.setRoad("a","c",true),false,"重复连通应为无改动");
assert.equal(editor.toggleRoad("a","c"),true);assert.equal(editor.connected("a","c"),false,"再次切换应断开");
assert.equal(editor.setRoad("a","a",true),false,"自环道路应被拒绝");
assert.equal(editor.setRoad("a","",""),false,"空据点道路应被拒绝");
const removed=editor.removeCity("b");
assert.equal(removed,true,"删除据点应成功");
assert.equal(editor.city("b"),null);assert.equal(editor.connected("a","b"),false,"删除据点应同时清理其道路");
assert.equal(editor.graph.b,undefined,"删除据点应从路网中移除该节点");

const handDrawn=new MapEditor(fixture());
const authored=handDrawn.saveRoadPath("a","b",[[1,1],[2,1],[3,1],[4,1]]);
assert.deepEqual(authored.points,[[1,1],[2,1],[3,1],[4,1]],"道路必须保存玩家逐格绘制的准确走向");
assert.equal(handDrawn.exportMap().roads[0].path,"1,1:EEE","道路路径导出后应可无损回读");
assert.throws(()=>handDrawn.saveRoadPath("a","b",[[1,1],[2,2],[4,1]]),/正交延伸/,"道路不应允许斜向或跳格");
assert.equal(handDrawn.validate().ok,true,"逐格绘制的道路应通过校验");
handDrawn.moveCity("b",4,2);
assert.equal(handDrawn.roadNetwork().length,0,"移动城市后应清除端点失效的路径，要求重新绘制");
assert.equal(handDrawn.undo(),true,"撤销城市移动应恢复原有道路路径");
assert.equal(handDrawn.roadNetwork().length,1,"撤销应还原手绘道路");

const broken=new MapEditor(fixture());
broken.setTerrain(0,0,"swamp");
broken.setTerrain(1,1,"ocean");
broken.city("a").commandery="陈留";
broken.city("b").x=1;broken.city("b").y=1;
broken.city("c").x=99;
broken.city("a").name="";
broken.graph={a:["c"],c:[],ghost:["a"]};
const report=broken.validate();
assert.equal(report.ok,false,"故意制造的坏舆图必须校验失败");
assert.ok(report.errors.some(text=>text.includes("地形未知")),"校验应捕获未登记地形");
assert.ok(report.errors.some(text=>text.includes("坐标越界")),"校验应捕获坐标越界");
assert.ok(report.errors.some(text=>text.includes("坐标重叠")),"校验应捕获据点重叠坐标");
assert.ok(report.errors.some(text=>text.includes("缺少名称")),"校验应捕获缺失名称");
assert.ok(report.errors.some(text=>text.includes("不是双向连接")),"校验应捕获单向道路");
assert.ok(report.errors.some(text=>text.includes("道路起点不存在")),"校验应捕获悬空道路节点");
assert.ok(report.warnings.some(text=>text.includes("海面")),"校验应提示落在海面的据点");
assert.equal(new MapEditor(fixture()).validate().ok,true,"原始舆图必须校验通过");

const exported=new MapEditor(fixture());
exported.setTerrain(2,2,"mountain");exported.updateCity("c",{garrison:2222});
const patch=exported.exportPatch();
assert.deepEqual(Object.keys(patch).sort(),["administrativeDivisions","cities","counties","map","rules"],"补丁应覆盖县治、行政数据及全部地图编辑内容");
assert.equal(patch.map.width,6);assert.equal(patch.map.height,6);
assert.equal(typeof patch.map.terrain,"string","导出的分层必须是可读的 RLE 字符串");
assert.equal(patch.cities.find(city=>city.id==="c").garrison,2222);
const mod=exported.exportMod();
assert.ok(mod.manifest?.id&&mod.patch,"导出模组应包含 manifest 与 patch");
const reimported=new MapEditor(fixture());
reimported.importText(JSON.stringify(patch));
reimported.importPatch(mod);
assert.equal(reimported.terrainAt(2,2),"mountain","导入补丁必须还原地形改动");
assert.equal(reimported.city("c").garrison,2222,"导入补丁必须还原据点字段");
assert.equal(reimported.connected("a","b"),true,"导入补丁必须还原路网");
assert.throws(()=>reimported.importText('{"map":{"width":8,"height":8,"terrain":"plains*64"}}'),/尺寸不一致/,"导入不同尺寸的舆图必须报错");
assert.throws(()=>reimported.importText("123"),/补丁格式无效/,"导入非法结构必须报错");
assert.throws(()=>reimported.importText("null"),/补丁格式无效/,"导入空结构必须报错");
const scenario=exported.exportScenario();
assert.equal(scenario.map.width,6);assert.equal(scenario.cities.length,3);
assert.equal(MapGrid.decode(scenario.map.terrain,36)[14],"mountain","导出剧本应内联编辑后的地形层");

const live=new MapEditor(fixture());
live.setTerrain(0,1,"ocean");live.moveCity("c",2,5);live.setRoad("a","c",true);
live.addCity({id:"new_city",name:"新城",x:3,y:4});
const data=fixture();
live.applyTo(data);
assert.equal(data.map.terrain,live.exportMap().terrain,"应用到当前局必须写回 RLE 地形");
assert.equal(data.rules.city_graph.a.includes("c"),true,"应用到当前局必须写回路网");
assert.deepEqual([data.cities.find(city=>city.id==="c").x,data.cities.find(city=>city.id==="c").y],[2,5],"应用到当前局必须写回据点坐标");
assert.equal(data.cities.length,4,"应用到当前局应同步新增据点");
assert.equal(data.cities.find(city=>city.id==="new_city").name,"新城","应用到当前局应写入新增城市字段");

const names=new MapEditor(fixture());
assert.ok(names.terrainIds().includes("mountain"),"地形取值应来自 terrainDefs");
assert.ok(names.provinceNames().length>0,"州域取值应来自当前分层");
assert.ok(names.commanderyNames().includes("陈留"),"郡域取值应包含县治所属郡");
assert.ok(names.commanderyNames().includes("洛阳"),"郡域取值应包含据点所属郡");
assert.deepEqual(names.names("terrain").slice().sort(),[...new Set([...names.terrainIds(),...names.terrain.filter(Boolean)])].sort(),"地形候选应为已登记定义与分层现存取值的并集");
for(const id of names.terrainIds())assert.ok(names.names("terrain").includes(id),`地形候选应包含已登记定义 ${id}`);
for(const value of new Set(names.terrain.filter(Boolean)))assert.ok(names.names("terrain").includes(value),`地形候选应包含分层现存取值 ${value}`);
assert.deepEqual(names.names("province"),names.provinceNames(),"州域候选应与 provinceNames 一致");
assert.deepEqual(names.names("commandery"),names.commanderyNames(),"郡域候选应与 commanderyNames 一致");
const candidates=new MapEditor({...fixture(),
  map:{...fixture().map,terrain:MapGrid.encode([...rows(35),"swamp"])},
  administrativeDivisions:{commandery_counties:{"琅琊郡":["开阳"]}},
  counties:[{id:"q1",name:"陈留",x:1,y:1,capital:1,commandery:"陈留",province:"兖州",jurisdictionCityId:"a"}]});
assert.ok(candidates.names("terrain").includes("swamp"),"未登记定义但存在于分层的取值也应进入地形候选");
assert.ok(candidates.names("province").includes("兖州"),"县治声明的州域应进入州域候选");
assert.ok(candidates.names("commandery").includes("琅琊郡"),"行政划分登记表里的郡域应进入郡域候选");
const optionLabels=candidates.valueOptions("terrain");
assert.ok(optionLabels.every(option=>option.value&&option.label),"取值选项必须同时带 value 与可读标签");
assert.equal(optionLabels.find(option=>option.value==="plains").label,"平原","地形选择应显示中文名称");
assert.equal(candidates.valueOptions("province").find(option=>option.value==="兖州").label,"兖州","州域选项标签即取值本身");
assert.equal(new Set(candidates.valueOptions("commandery").map(option=>option.value)).size,candidates.names("commandery").length,"郡域选项不应重复");

const hoverProvinces=new Array(36).fill("豫州");hoverProvinces[2*6+3]="徐州";
const hoverCommanderies=new Array(36).fill("陈留");hoverCommanderies[2*6+1]="洛阳";
const hoverTerrain=new Array(36).fill("plains");hoverTerrain[1*6+2]="ocean";
const hoverMap=new MapEditor({
  map:{id:"hover",type:"map",width:6,height:6,terrain:MapGrid.encode(hoverTerrain),provinces:MapGrid.encode(hoverProvinces),commanderies:MapGrid.encode(hoverCommanderies)},
  terrainDefs:{plains:{name:"平原",color:"#5a6b3a",move_cost:2,defence:1},ocean:{name:"海洋",color:"#1b3a5a"}},
  forces:[{id:"cao",name:"曹营"}],
  cities:[{id:"a",name:"甲城",type:"city",force:"cao",x:2,y:2,population:12000,garrison:800,commandery:"陈留"},
    {id:"b",name:"乙城",type:"city",force:"cao",x:5,y:2,population:6000,garrison:400,commandery:"陈留"}],
  counties:[{id:"q1",name:"陈留",x:2,y:2,capital:1,commandery:"陈留",jurisdictionCityId:"a"}],
  rules:{city_graph:{a:["b"],b:["a"]}}
});
assert.equal(hoverMap.cellInfo(-1,0),null,"越界格子信息必须返回 null");
assert.equal(hoverMap.cellInfo(6,6),null,"越界格子信息必须返回 null");
assert.equal(hoverMap.cellSummary(9,9),"超出舆图范围。","越界摘要必须给出越界提示");
assert.equal(hoverMap.forceName("cao"),"曹营","势力名应可解析");
assert.equal(hoverMap.forceName("nobody"),"nobody","未知势力名应回落为 ID");
assert.equal(hoverMap.forceName(""),"无主","空势力应显示无主");
const hoverCell=hoverMap.cellInfo(2,2);
assert.equal(hoverCell.terrainName,"平原","悬停格应带出地形名");
assert.equal(hoverCell.moveCost,2,"悬停格应带出地形行军消耗");
assert.equal(hoverCell.defence,1,"悬停格应带出地形防御加成");
assert.equal(hoverCell.province,"豫州","悬停格应带出州域");
assert.equal(hoverCell.commandery,"陈留","悬停格应带出郡域");
assert.equal(hoverCell.city.id,"a","悬停格应带出所在据点");
assert.equal(hoverCell.county.name,"陈留","悬停格应带出所在县治");
assert.equal(hoverCell.roads,1,"悬停格应统计据点接路条数");
assert.deepEqual(hoverCell.borders,["州界","郡界","水滨"],"悬停格应按邻居推导州界/郡界/水滨");
assert.equal(hoverMap.cellInfo(0,0).city,null,"无据点格不应虚构据点");
assert.equal(hoverMap.cellInfo(0,0).roads,0,"无据点格接路条数为零");
assert.deepEqual(hoverMap.cellInfo(0,0).borders,[],"内陆同域格不应产生边界标记");
const hoverText=hoverMap.cellSummary(2,2);
for(const token of ["(2,2)","平原","州域 豫州","郡域 陈留","县治 陈留","行军 2 · 防御 1","据点 甲城（曹营）","守军 800 · 人口 12000","接路 1 条","州界/郡界/水滨"])assert.ok(hoverText.includes(token),`悬停摘要应包含「${token}」`);
assert.equal(hoverMap.cellSummary(0,0).includes("据点"),false,"无据点格的摘要不应出现据点字段");

console.log("舆图编辑器通过：RLE 分层 / 笔刷取值候选与整层填充 / 撤销重做 / 据点增删改 / 道路双向连通 / 校验纠错 / 补丁与剧本导出回读 / 悬停格子信息与边界推导");

const stroke=new MapEditor(fixture());
const originalStroke=stroke.snapshot();
stroke.beginEdit();
for(const [x,y] of MapEditor.gridLine(0,0,5,3))stroke.setTerrain(x,y,"mountain");
stroke.endEdit();
assert.equal(stroke.undoStack.length,1,"一笔跨多格只应占用一次撤销");
assert.ok(MapEditor.gridLine(0,0,5,3).every((point,index,all)=>!index||Math.abs(point[0]-all[index-1][0])+Math.abs(point[1]-all[index-1][1])===1),"快速拖绘的插值路径须连续且正交");
stroke.undo();assert.deepEqual(stroke.snapshot(),originalStroke,"一次撤销应还原整笔");
stroke.redo();stroke.undo();const redoBefore=stroke.redoStack.length;stroke.setRoad("a","b",true);assert.equal(stroke.redoStack.length,redoBefore,"重复建立道路不得破坏历史记录");

const atomic=new MapEditor(fixture()),beforeImport=atomic.snapshot();
assert.throws(()=>atomic.importPatch({map:{terrain:"mountain*36",provinces:"兖州*2"}}),/长度/);
assert.deepEqual(atomic.snapshot(),beforeImport,"导入后半部分失败不得留下前半部分的更改");
assert.equal(atomic.undoStack.length,0,"失败导入不得消耗撤销记录");
assert.throws(()=>MapGrid.decode("plains*1000000000",36),/长度/);
assert.throws(()=>MapEditor.regionName("坏,区域"),/名称/);
const roadImport=new MapEditor(fixture());roadImport.importPatch(handDrawn.exportPatch());
assert.deepEqual(roadImport.customRoutes[0].points,handDrawn.customRoutes[0].points,"导入必须还原手绘道路每一个格子");
roadImport.importPatch({map:{roads:[],waterways:[],landmarks:[]},counties:[]});
assert.equal(roadImport.customRoutes.length,0);assert.equal(roadImport.waterways.length,0);assert.equal(roadImport.counties.length,0);
assert.equal(new MapEditor(roadImport.exportScenario()).waterways.length,0,"明确清空的水道在导出回读后不能重新生成默认水道");
roadImport.undo();assert.equal(roadImport.customRoutes.length,1,"撤销导入应恢复道路及县治");
console.log("编辑可靠性通过：整笔撤销 / 连续插值 / 导入失败无残留 / 道路与县治回读 / 空覆盖层保持 / 超长分层拦截");
