import fs from "node:fs";

globalThis.window=globalThis;
await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");

const read=path=>JSON.parse(fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8"));
const cities=read("game/data/history/cities/200_guandu.json").cities,rules=read("game/data/common/game_rules.json"),ids=new Set(cities.map(city=>city.id));
const administrative=read("game/data/history/administrative_divisions.json"),profiles=read("game/data/history/city_resource_profiles.json"),seats=administrative.county_seats||[];
const additions=["lelang","ji","shangdang","henei","linzi","langya","pengcheng","xiaopei","runan","guangling","hefei","longxi","langzhong","badong","fuling","kuaiji","yuzhang","jianan","jiaozhi","cangwu","panyu"];

if(cities.length!==75)throw new Error(`地图应有 75 个据点，实际 ${cities.length}`);
for(const id of additions)if(!ids.has(id))throw new Error(`缺少新增据点 ${id}`);
const coordinates=new Set;for(const city of cities){const key=`${city.x}:${city.y}`;if(coordinates.has(key))throw new Error(`据点坐标重叠 ${key}`);coordinates.add(key)}
const expectedCounties=Object.values(administrative.commandery_counties).flat(),countyCells=new Set(seats.map(seat=>`${seat.x}:${seat.y}`));if(Object.keys(administrative.commandery_counties).length!==51||seats.length!==expectedCounties.length||countyCells.size!==seats.length)throw new Error(`郡县网格数量或坐标异常：${seats.length}/${expectedCounties.length}`);
for(const [commandery,counties] of Object.entries(administrative.commandery_counties)){for(const name of counties)if(!seats.some(seat=>seat.commandery===commandery&&seat.name===name))throw new Error(`${commandery}缺少县治 ${name}`);const census=Object.values(profiles.historical_basis).find(row=>row[0]===commandery),allocated=seats.filter(seat=>seat.commandery===commandery).reduce((sum,seat)=>sum+seat.historicalPopulation,0);if(!census||allocated!==census[2])throw new Error(`${commandery}史籍人口分配不守恒：${allocated}/${census?.[2]}`)}
for(const seat of seats){const city=seat.cityId&&cities.find(item=>item.id===seat.cityId);if(!seat.province||!seat.rank||!seat.jurisdictionCityId||!seat.censusYear||seat.historicalPopulation<=0)throw new Error(`${seat.name}缺少县域模拟字段`);if(seat.cityId&&(!city||city.x!==seat.x||city.y!==seat.y||city.province!==seat.province))throw new Error(`${seat.name}没有与既有据点对齐`);const localCities=cities.filter(item=>profiles.historical_basis[item.id]?.[0]===seat.commandery),distance=Math.min(...localCities.map(item=>Math.hypot(item.x-seat.x,item.y-seat.y)));if(distance>3)throw new Error(`${seat.commandery}${seat.name}距所属郡据点过远：${distance.toFixed(1)}`)}
const wan=cities.find(city=>city.id==="wan");if(wan.x!==17||wan.y!==20)throw new Error(`宛城位置未校正：${wan.x},${wan.y}`);
for(const [from,targets] of Object.entries(rules.city_graph)){if(!ids.has(from))throw new Error(`路网起点不存在 ${from}`);for(const to of targets){if(!ids.has(to))throw new Error(`路网终点不存在 ${to}`);if(!rules.city_graph[to]?.includes(from))throw new Error(`道路不是双向：${from} → ${to}`)}}

const engine=new RuleEngine({cities,armies:[],officers:[],rules});
for(const [from,to] of [["lelang","beiping"],["ji","luoyang"],["linzi","xiapi"],["longxi","chengdu"],["jiaozhi","panyu"],["kuaiji","chaisang"]])if(!engine.path(from,to))throw new Error(`新增区域道路不连通：${from} → ${to}`);

const oldCities=cities.filter(city=>!additions.includes(city.id)),oldIds=new Set(oldCities.map(city=>city.id)),oldGraph=Object.fromEntries(Object.entries(rules.city_graph).filter(([id])=>oldIds.has(id)).map(([id,targets])=>[id,targets.filter(target=>oldIds.has(target))])),holder={data:{cities:structuredClone(cities),rules:{city_graph:structuredClone(rules.city_graph)},armies:[],officers:[],items:[],forces:[]}};
GameState.prototype.restoreWorld.call(holder,{cities:structuredClone(oldCities),cityGraph:oldGraph,armies:[],officers:[],items:[],forces:[]});
if(holder.data.cities.length!==75||!holder.data.rules.city_graph.lelang?.includes("xiangping"))throw new Error("旧存档没有补入新增据点及道路");

const officers=read("game/data/history/officers/200_guandu.json").officers;
for(const name of ["刘馥","袁谭","袁熙","高干","张飞","糜竺","太史慈","吕岱","黄权","吴懿","公孙康"]){const officer=officers.find(item=>item.name===name);if(!officer||!additions.includes(officer.city))throw new Error(`${name}没有配置到新增据点`)}

const view=fs.readFileSync(new URL("../js/ui/map-view.js",import.meta.url),"utf8");
for(const feature of ["太行山","泰山","洞庭湖","鄱阳湖","辽水","珠江"])if(!view.includes(feature))throw new Error(`地图缺少地貌标注 ${feature}`);
if(!view.includes('if(x>=24&&y>=18&&y<=27)return"扬州"')||!view.includes('if(y<=13&&x>=24)return"青州"'))throw new Error("扬州、青州区位边界未校正");
if(!view.includes('this.state.layer==="commandery"')||!view.includes("drawCommanderyLabels")||!view.includes("drawCounties"))throw new Error("郡域地图没有绘制郡界、郡名与县治");
for(const feature of ["visibleBounds","inView","showAllNames","this.scale>=2.2","Math.min(3.4"])if(!view.includes(feature))throw new Error(`地图缺少分级渲染或视口裁剪：${feature}`);
const html=fs.readFileSync(new URL("../index.html",import.meta.url),"utf8");if(!html.includes('data-layer="commandery"')||!html.includes("[F5] 补给"))throw new Error("郡域地图入口或快捷键没有配置");

console.log(`地图扩展通过：75 据点 / 51 郡域 / ${seats.length} 县治 / 坐标唯一且归属邻近 / 双向路网 / 旧存档补图 / 山水与郡县标注`);
