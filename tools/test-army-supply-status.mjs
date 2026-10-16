// 军粮判断与实际耗粮共用口径；展示不能改资源、推进运输或消耗随机数。
import assert from "node:assert/strict";
import fs from "node:fs";
globalThis.window=globalThis;globalThis.location={protocol:"http:"};globalThis.localStorage={getItem:()=>null,setItem(){},removeItem(){}};
globalThis.fetch=async url=>({ok:true,json:async()=>JSON.parse(fs.readFileSync(String(url),"utf8"))});
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class extends Event{constructor(type,opts={}){super(type);this.detail=opts.detail}};
for(const name of ["data-loader","map-grid","game-clock","fiscal-system","rule-engine","game-state"])await import(`../js/core/${name}.js`);
await import("../js/data/offline-data.generated.js");await import("../js/ui/fiscal-ui.js");
const loader=new DataLoader(SANGUO_DATA);await loader.load({useSavedMap:false});const source=await loader.loadScenario("200_guandu",{useSavedMap:false}),g=new GameState(structuredClone(source),{playerForceId:"cao"}),e=g.engine,a=g.data.armies.find(a=>a.force==="cao"),city=g.data.cities.find(c=>c.id===a.city),next=g.data.rules.city_graph[city.id][0],need=FiscalSystem.armyDailyNeed(g,a),read=opts=>e.armySupplyStatus(g,a,opts);
g.turn=20;delete a.route;delete a.siegeTarget;delete a.stores.lastConsumption;
// 城仓空而军仓有十日粮：历史缺粮、被截、低军需值不能覆盖现有粮。
city.localFood=0;a.stores.food=need*10;a.supply=0;a.supplyStatus="粮道被截";a.supplyCutTurn=19;
assert.equal(read().label,"军仓供粮");assert.equal(read().carriedDays,10);assert.equal(read().condition,0);assert(read().cut);assert.equal(read().tone,"good");
let html=FiscalUI.armyMarkup(g,a);assert(!html.includes("后勤评估"));assert(!html.includes("军队仓储"));assert.equal((html.match(/<h3>军粮与运输<\/h3>/g)||[]).length,1);assert(html.includes("当前军仓为准"));assert(FiscalUI.rationMarkup(g,a).includes(read().label));
// 军仓空而城仓可供粮：不以军仓零日判断粮；混合供粮不会重复算入可用库存。
city.localFood=need*5;a.stores.food=0;assert.equal(read().label,"城仓供粮");assert.equal(read().tone,"good");city.localFood=need/2;a.stores.food=need/2;assert.equal(read().label,"接续供粮");
// 当前两仓不足但允许驻地调粮，未实耗时不预断缺粮；实际缺口单独标明。
city.localFood=0;a.stores.food=0;assert.equal(read().label,"待地方调粮");a.stores.lastConsumption={turn:19,need,taken:0,short:need,fromCity:0,fromStores:0};assert.equal(read().label,"供粮不足");a.stores.food=need*2;assert.equal(read().tone,"good");assert(read().recent.short>0);a.stores.lastConsumption.turn=1;assert.equal(read().recent,null);
// 在途、围城均只能用军仓；城仓有粮不应掩盖军仓已空。
a.route=[next];a.destination=next;city.localFood=999999;a.stores.food=0;assert.equal(read().label,"军仓已空");assert.equal(read().city,null);delete a.route;a.siegeTarget=next;assert.equal(read().label,"军仓已空");delete a.siegeTarget;
// 在途粮队尚未交粮；摘要、总览、完整运输页的主状态一致。
a.route=[next];a.stores.food=need*10;a.convoy={sourceId:city.id,path:[city.id,next],index:0,legLeft:20,food:10000,escort:100};
const compact=read(),full=read({transport:true});assert.equal(compact.label,full.label);assert.equal(compact.tone,full.tone);assert(full.delivery.warning);assert.equal(full.carried,need*10);assert.equal(full.delivery.eta,20);
// 轻装没有粮队依赖，仍以现有粮判断；野外存粮不足一天明确提示。
delete a.convoy;a.soldiers=2000;a.units={infantry:2000};a.stores.food=10;assert(read().light);assert.equal(read().label,"不足一日");assert.equal(read({transport:true}).delivery.mode,"light");
// 健卒、伤员、战俘统一按实际扣粮舍入；查看不引入新结算。
a.soldiers=2011;a.wounded=131;a.prisoners={yuan:51};assert.equal(e.dailyRation(g,a),FiscalSystem.armyDailyNeed(g,a));assert.equal(e.dailyRation(null,a),FiscalSystem.armyDailyNeed(g,a),"作战评估不传状态时仍采用同一日粮");
const snapshot=()=>JSON.stringify({data:g.data,resources:g.resources,policies:g.policies,rng:g.rngState}),before=snapshot();for(let i=0;i<3;i++){read({transport:true});FiscalUI.armyMarkup(g,a);FiscalUI.rationMarkup(g,a)}assert.equal(snapshot(),before,"查看军粮不能改变战局");
// 和实际耗粮核对：城仓一半、军仓一半，足额领粮；野外军仓空则真实短缺。
delete a.route;a.stores.food=e.dailyRation(g,a)/2;city.localFood=e.dailyRation(g,a)/2;FiscalSystem.consumeArmy(g,a,[]);assert.equal(a.stores.lastConsumption.short,0);assert.equal(a.stores.lastConsumption.taken,a.stores.lastConsumption.need);
a.route=[next];a.stores.food=0;FiscalSystem.consumeArmy(g,a,[]);assert.equal(a.stores.lastConsumption.short,a.stores.lastConsumption.need);assert.equal(read().label,"军仓已空");
// 围城各军也逐日入账，城内军团可就仓但不能越过包围直接调粮。
{const game=new GameState(structuredClone(source),{playerForceId:"cao"}),engine=game.engine,attack=game.data.armies.find(a=>a.force==="cao"),home=game.data.cities.find(c=>c.id===attack.city),target=game.data.cities.find(c=>c.id===(game.data.rules.city_graph[home.id]||[])[0]);target.force="yuan";target.garrison=50000;target.localFood=600000;target.level=5;target.siegeMorale=90;game.diplomacy.wars.push("yuan");attack.siegeTarget=target.id;delete attack.route;attack.stores.food=engine.dailyRation(game,attack)*25;game.data.armies=[attack];
 const ration=engine.dailyRation(game,attack),food=attack.stores.food,campFood=home.localFood;engine.consumeLocalSupplies(game,[]);assert.equal(attack.stores.food,food-ration,"围城攻方也须逐日扣军仓");assert.equal(attack.stores.lastConsumption.need,ration);assert.equal(home.localFood,campFood,"围城不能再瞬移从营地城仓扣粮");
 const beforeSiegeStores=attack.stores.food;engine.resolveSieges(game,[]);assert.equal(attack.stores.food,beforeSiegeStores,"攻城结算不重复扣军团口粮");assert.equal(home.localFood,campFood,"旧的攻方按旬调粮入口已经移除");
 const defender={id:"def-supply",name:"守城军",force:"yuan",city:target.id,soldiers:5000,units:{infantry:5000},morale:80,supply:100,stores:{food:0}};game.hydrateArmy(defender);game.data.armies.push(defender);assert(engine.isCityBesieged(target));const dr=engine.dailyRation(game,defender),stock=target.localFood;
 FiscalSystem.consumeArmy(game,defender,[]);assert.equal(target.localFood,stock-dr);assert.equal(defender.stores.lastConsumption.short,0);assert.equal(engine.armySupplyStatus(game,defender).label,"城内供粮");
 target.localFood=0;defender.stores.food=dr*2;FiscalSystem.consumeArmy(game,defender,[]);assert.equal(defender.stores.food,dr);assert.equal(defender.stores.lastConsumption.fromRegion,0);defender.stores.food=0;const treasury=JSON.stringify(game.data.forces.map(f=>f.resources));FiscalSystem.consumeArmy(game,defender,[]);assert.equal(defender.stores.lastConsumption.short,dr);assert.equal(JSON.stringify(game.data.forces.map(f=>f.resources)),treasury,"被围城内不得从外部府库瞬移调粮");
 assert.equal(engine.siegeFoodNeed(target)-engine.siegeFoodNeed(target,{includeArmies:false}),Math.ceil(dr*10),"守城军团已按日吃粮，按旬城内需粮不重复扣军团");}
console.log("军粮统一通过：城仓/军仓接续 / 行军与围城 / 缺粮与待调粮 / 历史被截不覆盖余粮 / 军需值独立 / 在途粮不计库存 / 总览与详情一致 / 耗粮舍入 / 轻装 / 最近实耗 / 只读无副作用");
