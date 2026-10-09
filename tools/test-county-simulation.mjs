import fs from "node:fs";

globalThis.window=globalThis;
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,o={}){super(type);this.detail=o.detail}};
await import("../js/data/offline-data.generated.js");
await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");

const profiles=JSON.parse(fs.readFileSync(new URL("../game/data/history/city_resource_profiles.json",import.meta.url),"utf8")),state=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});
if(state.data.counties.length!==253)throw new Error(`县域数量异常：${state.data.counties.length}`);
for(const commandery of Object.keys(state.data.administrativeDivisions.commandery_counties)){const expected=Object.values(profiles.historical_basis).find(row=>row[0]===commandery)?.[2],actual=state.data.counties.filter(county=>county.commandery===commandery).reduce((sum,county)=>sum+county.historicalPopulation,0);if(actual!==expected)throw new Error(`${commandery}人口分配不守恒：${actual}/${expected}`)}
for(const county of state.data.counties)if(!county.jurisdictionCityId||!county.force||county.population<=0||!["commandery","major","county"].includes(county.rank)||![county.agriculture,county.commerce,county.order].every(Number.isFinite))throw new Error(`${county.name}未进入县域模拟`);

const city=state.data.cities.find(item=>item.force==="cao"&&state.engine.countiesForCity(item.id).length),counties=state.engine.countiesForCity(city.id),populationBefore=counties.reduce((sum,county)=>sum+county.population,0),goldBefore=state.resources.gold,foodBefore=state.resources.food,events=[];
state.engine.resolveEconomies(state,events);if(state.resources.gold!==goldBefore||state.resources.food!==foodBefore||city.fiscal.accrued.land<=0||city.fiscal.cropAccrued<=0)throw new Error("县域税粮应累积应收和田间收成，不能立即生成中央库存");
city.localGold=50000;city.localFood=50000;city.administration.recruitmentTarget=city.garrison+1000;state.engine.resolveAdministration(state,events);const populationAfter=state.engine.countyPopulation(city.id);if(populationAfter>=populationBefore||city.garrison<=0)throw new Error("募兵没有消耗辖县编户");

const save=state.serialize(),saved=save.world.counties.find(county=>county.id===counties[0].id);if(save.version!==16||saved.population!==counties[0].population)throw new Error("v16 存档没有持久化县域变化");
const restored=new GameState(structuredClone(SANGUO_DATA),{playerForceId:"cao"});restored.applySave(restored.migrateSave(save));if(restored.data.counties.find(county=>county.id===saved.id).population!==saved.population)throw new Error("县域人口恢复失败");

console.log(`县域模拟通过：51 郡 / 253 县 / 史籍人口守恒 / 税粮增长 / 募兵消耗 / v16 持久化`);
