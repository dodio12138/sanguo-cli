import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const read=async file=>JSON.parse(await readFile(new URL(`../${file}`,import.meta.url),"utf8"));
const reference=await read("game/data/history/commandery_population.json"),profiles=await read("game/data/history/city_resource_profiles.json"),admin=await read("game/data/history/administrative_divisions.json"),rawCities=(await read("game/data/history/cities/200_guandu.json")).cities;
globalThis.window=globalThis;globalThis.location={protocol:"http:"};globalThis.localStorage={getItem:()=>null};
globalThis.fetch=async file=>{try{return {ok:true,json:async()=>await read(file)}}catch{return {ok:false,status:404}}};
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
for(const file of ["data/offline-data.generated","core/data-loader","core/game-clock","core/fiscal-system","core/rule-engine","core/game-state"])await import(`../js/${file}.js`);
assert.deepEqual(profiles.population_reference,reference,"派生配置不能与人口源表分叉");
assert.equal(Object.keys(reference.records).length,137);assert.equal(Object.keys(profiles.historical_basis).length,380);
for(const seat of admin.commandery_seats_140){const row=profiles.historical_basis[seat.cityId],record=DataLoader.populationRecord(profiles,seat.name);assert.ok(record,`${seat.name}缺少人口来源`);assert.deepEqual(row.slice(0,3),[record.commandery,record.year,record.population]);assert.ok(reference.sources[record.source]?.url)}
assert.deepEqual(Object.entries(reference.records).filter(([,row])=>row[1]===null).map(([name])=>name),["辽东属国"],"只有明确缺载项允许人口为空");
for(const [name,population] of Object.entries({京兆尹:285574,左冯翊:145195,右扶风:93091,魏郡:695606,代郡:126188,辽西郡:81714,东莱郡:484393,郁林郡:71162,酒泉郡:76726}))assert.equal(reference.records[name][1],population,name);
assert.equal(DataLoader.populationRecord(profiles,"勃海郡").population,1106500);assert.equal(DataLoader.populationRecord(profiles,"京兆尹及三辅").population,285574);
assert.equal(reference.records["沛郡"][3],"emended");assert.equal(reference.records["辽东属国"][3],"unrecorded");
for(const name of ["酒泉郡","辽东郡","郁林郡","交趾郡"]){assert.equal(reference.records[name][0],2);assert.equal(reference.records[name][3],"earlier")}
const loader=new DataLoader(SANGUO_DATA);await loader.load();
for(const id of ["190_coalition","200_guandu","208_red_cliffs"]){
  const data=await loader.loadScenario(id),game=new GameState(structuredClone(data));
  for(const city of data.cities){assert.ok(Number.isFinite(city.population)&&city.population>0);const record=DataLoader.populationRecord(profiles,city.commandery);assert.equal(city.historical.censusPopulation,record.population);assert.equal(city.historical.populationStatus,record.status)}
  for(const name of Object.keys(admin.commandery_counties))assert.equal(data.counties.filter(county=>county.commandery===name).reduce((sum,county)=>sum+county.historicalPopulation,0),reference.records[name][1]);
  assert.ok(game.data.counties.every(county=>county.population>0));
}
const baseline=await loader.loadScenario("200_guandu"),game=new GameState(structuredClone(baseline)),save=game.serialize();
const savedCity=save.world.cities.find(city=>city.id==="commandery_city_094"),county=save.world.counties[0];savedCity.population=4321;(savedCity.historical??={}).censusPopulation=null;county.population=1234;
const restored=new GameState(structuredClone(baseline));restored.applySave(restored.migrateSave(save));loader.refreshPopulationHistory(restored.data);
assert.equal(restored.data.cities.find(city=>city.id===savedCity.id).population,4321,"更新来源不能重算战局人口");assert.equal(restored.data.cities.find(city=>city.id===savedCity.id).historical.censusPopulation,81714);assert.equal(restored.data.counties.find(item=>item.id===county.id).population,1234);
const custom=restored.data.cities.find(city=>city.id===savedCity.id);custom.commandery="用户自定郡";loader.refreshPopulationHistory(restored.data);assert.equal(custom.historical.censusPopulation,null,"自定义郡不能套用原郡人口");assert.equal(custom.population,4321);
assert.ok(SANGUO_DATA.counties.every(county=>Number.isFinite(county.population)&&county.population>0),"离线镜像也必须生成县域人口");
assert.equal(SANGUO_DATA.cities.find(city=>city.id==="commandery_city_094").historical.censusPopulation,81714);
const model=reference.city_population_model;
for(const city of rawCities.filter(city=>city.id.startsWith("commandery_city_")&&city.commandery!=="辽东属国")){
  const estimate=profiles.city_population_estimates[city.id];if(!estimate||estimate.method!=="commandery_urban_share")continue;
  const basis=profiles.historical_basis[city.id][0],record=reference.records[basis];if(!record)continue;
  const expected=Math.max(model.minimum,Math.round(record[1]*model.registered_retention*model.urban_share/estimate.cityNodes/model.rounding)*model.rounding);assert.equal(city.population,expected,city.id);
}
console.log(`人口基准通过：${Object.keys(reference.records).length}郡国覆盖 / ${Object.keys(profiles.historical_basis).length}据点 / 原文与校勘与前期基准分离 / 缺载不伪造 / 268县守恒 / 三剧本载入 / 离线县人口 / 旧战局保留 / 自定义郡隔离`);
