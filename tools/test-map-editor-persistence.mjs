import assert from "node:assert/strict";

globalThis.window=globalThis;
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const storage=new Map();
globalThis.localStorage={getItem:key=>storage.get(key)||null,setItem:(key,value)=>storage.set(key,String(value)),removeItem:key=>storage.delete(key)};
for(const file of ["data/offline-data.generated","core/game-clock","core/fiscal-system","core/rule-engine","core/game-state","core/map-grid","ui/map-editor"])await import(`../js/${file}.js`);

const state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});
state.captureBaseWorld();
const legacy=structuredClone(state.serialize()),editor=new MapEditor(state.data),city=editor.city("xuchang");
const countyCells=new Set(editor.counties.map(county=>`${county.x},${county.y}`));
const destination=editor.openCityCell();
for(let y=0;y<editor.height;y++)for(let x=0;x<editor.width;x++)if(!editor.cityAt(x,y)&&!countyCells.has(`${x},${y}`)&&editor.terrainAt(x,y)!=="ocean"){destination.x=x;destination.y=y}
editor.updateCity(city.id,{name:"校验城",...destination});
editor.setTerrain(0,0,"forest");editor.setProvince(0,0,"校验州");editor.setCommandery(0,0,"校验郡");
const removable=editor.cities.find(item=>item.id!==city.id&&!state.data.officers.some(officer=>officer.city===item.id)&&!state.data.armies.some(army=>army.city===item.id));
editor.removeCity(removable.id);
const river=editor.waterways[0],riverPoints=structuredClone(river.points);riverPoints[1][1]+=1;editor.saveWaterway(river.id,"存档测试河",riverPoints);
assert.equal(editor.validate().ok,true,"用于存档测试的编辑应通过校验");
editor.applyTo(state.data);state.select("city",state.data.cities.find(item=>item.id===city.id));state.save("manual","1");
const restored=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});restored.load("1");
const roundTrip=new MapEditor(restored.data),restoredCity=roundTrip.city(city.id);
assert.deepEqual([restoredCity.name,restoredCity.x,restoredCity.y],["校验城",destination.x,destination.y],"读档应保留编辑后的城市名称与位置");
assert.equal(roundTrip.city(removable.id),null,"已删除的据点不能在读档后复活");
assert.equal(roundTrip.terrainAt(0,0),"forest");assert.equal(roundTrip.provinceAt(0,0),"校验州");assert.equal(roundTrip.commanderyAt(0,0),"校验郡");
assert.deepEqual(restored.data.map.roads,state.data.map.roads,"道路路径应随地图一起保存");
assert.deepEqual(restored.data.map.waterways,state.data.map.waterways,"河流编辑应随地图一起保存");
assert.deepEqual([restoredCity.province,restoredCity.commandery],[roundTrip.provinceAt(restoredCity.x,restoredCity.y)||"",roundTrip.commanderyAt(restoredCity.x,restoredCity.y)||""],"读档后归属与坐标图层一致");
restored.applySave(legacy);
assert.equal(restored.data.cities.find(item=>item.id===city.id).name,"许昌","载入旧存档应恢复剧本原始几何，不能继承上一份编辑地图");
assert.equal(restored.data.map.terrain,legacy.world.mapEditor?.map.terrain||SANGUO_DATA.map.terrain);
console.log("编辑地图存档通过：地形 / 州郡边界 / 城市改名移动删除 / 道路 / 旧存档兼容与恢复隔离");
