// 安全驻屯降低官粮支出；出征、野外、围城和备粮仍按野战口径。
import assert from 'node:assert/strict';
import fs from 'node:fs';
globalThis.window=globalThis;globalThis.location={protocol:'http:'};
globalThis.fetch=async p=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(String(p),'utf8'))});
if(!globalThis.CustomEvent)globalThis.CustomEvent=class extends Event{constructor(t,o={}){super(t);this.detail=o.detail}};
for(const name of ['data-loader','map-grid','game-clock','fiscal-system','rule-engine','game-state'])await import(`../js/core/${name}.js`);
await import('../js/data/offline-data.generated.js');await import('../js/ui/fiscal-ui.js');
const loader=new DataLoader(SANGUO_DATA);await loader.load({useSavedMap:false});
const data=await loader.loadScenario('200_guandu',{useSavedMap:false}),g=new GameState(structuredClone(data)),e=g.engine;
const army=g.data.armies.find(a=>a.force===g.playerForceId),city=g.data.cities.find(c=>c.id===army.city);
Object.assign(army,{soldiers:10000,wounded:0,prisoners:{},stores:{food:0},stance:'驻扎'});
delete army.route;delete army.siegeTarget;delete army.retreat;army.raiding=false;
assert.equal(FiscalSystem.armyRationProfile(g,army).mode,'stationed');
assert.equal(e.dailyRation(g,army),330);assert.equal(e.dailyRation(null,army),330);
const target=FiscalSystem.armyFoodTarget(g,army),days=e.armyCarryDays(army);assert.equal(target,660*days,'驻城出征备粮按完整野战日粮');
city.localFood=100000;const stock=city.localFood;
for(let day=0;day<30;day++){FiscalSystem.consumeArmy(g,army,[]);g.turn++;g.date=GameClock.next(g.date)}
assert.equal(stock-city.localFood,9900,'万人安全驻屯三十日官仓支出减半');
assert.equal(army.stores.food,0);assert.equal(army.stores.lastConsumption.rationMode,'stationed');
FiscalSystem.stockArmy(g,army);assert.equal(army.stores.food,target);
const before=army.stores.food,home=city.localFood;army.route=['another-city'];
assert.equal(e.dailyRation(g,army),660);assert.equal(FiscalSystem.armyFoodTarget(g,army),target);
FiscalSystem.consumeArmy(g,army,[]);assert.equal(army.stores.food,before-660);assert.equal(city.localFood,home,'离城不隔空吃城粮');
delete army.route;
for(const patch of [{fieldPosition:{x:city.x,y:city.y}},{siegeTarget:'enemy'},{retreat:{targetId:city.id}},{raiding:true},{stance:'败退'}]){
 const copy={...army,...patch};assert.equal(FiscalSystem.armyDailyNeed(g,copy),660,JSON.stringify(patch));
}
const siege=e.isCityBesieged;e.isCityBesieged=()=>true;assert.equal(e.dailyRation(g,army),660);assert.equal(e.dailyRation(null,army),660);e.isCityBesieged=siege;
const mixed={...army,soldiers:1000,wounded:100,prisoners:{yuan:200}};assert.equal(FiscalSystem.armyDailyNeed(g,mixed),40,'伤员全份、战俘半份不变');
assert.equal(FiscalSystem.armyDailyNeed({...g,date:{year:200,month:1,xun:0}},army),3300,'旧旬口径仅乘十一次');
const html=FiscalUI.armyMarkup(g,army);assert(html.includes('驻屯供养'));assert(html.includes('出征日粮'));assert(html.includes('660 石 / 日'));
const save=g.serialize(),restored=new GameState(structuredClone(data));restored.applySave(restored.migrateSave(save));
const loaded=restored.data.armies.find(a=>a.id===army.id);assert.equal(loaded.stores.food,army.stores.food,'读档不增发或折算库存');assert.equal(restored.engine.dailyRation(restored,loaded),330);
console.log('驻屯口粮通过：万人三十日9900石 / 出征660石每日 / 野外围城无折减 / 备粮天数不缩水 / 新旧时基 / 实耗展示 / 存档库存保留');
