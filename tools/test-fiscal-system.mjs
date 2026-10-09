import assert from "node:assert/strict";
globalThis.window=globalThis;
globalThis.CustomEvent??=class extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
await import("../js/data/offline-data.generated.js");
await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");
await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");
await import("../js/ui/fiscal-ui.js");

function fixture(){
  const data=structuredClone(SANGUO_DATA);
  data.forces=[{id:"cao",name:"曹操",capital:"a"},{id:"yuan",name:"袁绍"},{id:"neutral",name:"无主"}];
  data.cities=["a","b","c"].map((id,index)=>({id,name:`城${id}`,force:"cao",type:"city",population:20000,agriculture:50,commerce:50,order:70,garrison:1000,level:2,localGold:20000,localFood:30000,storage:200000,x:index,y:1,commandery:"测试郡",administration:{recruitmentTarget:1000}}));
  data.counties=["a","b","c"].map(id=>({id:`county-${id}`,name:`县${id}`,jurisdictionCityId:id,population:100000,agriculture:50,commerce:50,order:70}));
  data.officers=[{id:"official",name:"官员",force:"cao",city:"a",status:"serving",politics:95,intelligence:95,charm:95,command:95,war:70,loyalty:90}];
  data.armies=[{id:"army",name:"军团",force:"cao",city:"a",commander:"官员",soldiers:6000,units:{infantry:6000,cavalry:0,archers:0}}];
  data.rules.city_graph={a:["b"],b:["a","c"],c:["b"]};
  return new GameState(data,{playerForceId:"cao"});
}
let state=fixture(),city=state.data.cities[2];
city.fiscal.accrued.land=10000;
const central=state.resources.gold,beforeLocal=city.localGold,events=[];
const collected=FiscalSystem.collect(state,city,"land",events,true);
assert(collected.ok);assert.equal(state.resources.gold,central,"发出上缴不能立即入库");
assert.equal(collected.gross,collected.inefficiencyLoss+collected.corruptionLoss+collected.localUse+collected.retained+collected.remitted);
assert.equal(city.localGold,beforeLocal-collected.cost+collected.retained);
const cargo=state.policies.fiscalAccounts.shipments[0];
assert.equal(cargo.amount,cargo.delivered+cargo.transportLoss);assert.equal(cargo.route.length,3);
assert.equal(FiscalSystem.collect(state,city,"land",[],true).ok,false,"同月不可重复征收");
state.data.cities[1].force="yuan";state.turn++;FiscalSystem.advanceShipments(state,[]);assert.equal(cargo.status,"受阻");assert.equal(state.resources.gold,central);
state.data.cities[1].force="cao";state.turn++;FiscalSystem.advanceShipments(state,[]);assert.equal(state.resources.gold,central);
for(let day=0;day<20&&cargo.status!=="完成";day++){state.turn++;FiscalSystem.advanceShipments(state,[])}assert.equal(cargo.status,"完成");assert.equal(state.resources.gold,central+cargo.delivered);
state.turn++;FiscalSystem.advanceShipments(state,[]);assert.equal(state.resources.gold,central+cargo.delivered,"货物只能入库一次");

state=fixture();city=state.data.cities[0];state.engine.initializeAdministration();
const low=FiscalSystem.governance(state,city);city.administration.governorId="official";city.administration.commerceId="official";
const high=FiscalSystem.governance(state,city);assert(high.efficiency>low.efficiency);assert(high.corruption<low.corruption);
city.publicSupport=10;assert(FiscalSystem.governance(state,city).support<high.support);

state=fixture();city=state.data.cities[0];
const population=state.data.counties[0].population;
const group=FiscalSystem.levyLabor(state,city,10000,[]);assert(group);assert.equal(state.data.counties[0].population,population-group.people);
const workingCrop=structuredClone(state.serialize());const idle=fixture();FiscalSystem.settle(idle,[]);FiscalSystem.settle(state,[]);assert(city.fiscal.cropAccrued<idle.data.cities[0].fiscal.cropAccrued,"徭役占用降低收成");
const beforeDismiss=state.data.counties[0].population;FiscalSystem.dismissLabor(state,city.id,[]);assert.equal(state.data.counties[0].population,beforeDismiss+group.people);FiscalSystem.dismissLabor(state,city.id,[]);assert.equal(state.data.counties[0].population,beforeDismiss+group.people,"不可重复返还人口");
const restored=fixture();restored.applySave(restored.migrateSave(workingCrop));assert.equal(restored.policies.fiscalAccounts.laborGroups[0].people,group.people);assert.equal(restored.data.counties[0].population,population-group.people);

state=fixture();city=state.data.cities[0];const consumed=city.localFood;
FiscalSystem.consumeArmy(state,state.data.armies[0],[]);
assert.equal(state.data.armies[0].stores.food,590);assert.equal(city.localFood,consumed-600);
assert.equal(city.localFood+state.data.armies[0].stores.food,consumed-10,"军仓消耗不能重复扣中央或地方粮");

state=fixture();city=state.data.cities[0];state.date={year:200,month:8,xun:2};FiscalSystem.settle(state,[]);assert.equal(city.fiscal.accrued.food,0);
state.turn++;state.date={year:200,month:9,xun:2};FiscalSystem.settle(state,[]);const harvest=state.policies.economyHistory.at(-1).harvest;assert(harvest>0);assert.equal(city.fiscal.lastHarvestYear,200);
state.turn++;FiscalSystem.settle(state,[]);assert.equal(state.policies.economyHistory.at(-1).harvest,0,"同年度只能收获一次");

state=fixture();city=state.data.cities[0];
const startMoney=city.localGold;assert(FiscalSystem.handleOrder(state,{type:"build_warehouse",commandName:"仓库",cityIds:[city.id],options:{}},[]));const project=state.policies.fiscalAccounts.projects[0];assert(project);assert(city.localGold<startMoney);assert(!city.buildings.includes("仓库"));
for(let i=0;i<20&&project.status!=="完成";i++){state.turn++;FiscalSystem.advanceProjects(state,[])}
assert.equal(project.status,"完成");assert(city.buildings.includes("仓库"));assert.equal(state.policies.fiscalAccounts.laborGroups[0].status,"遣散");

state=fixture();const saved=state.serialize();delete saved.resources.silk;delete saved.policies.fiscalAccounts;for(const army of saved.world.armies)delete army.stores;
const original=saved.resources.gold;state.applySave(state.migrateSave(saved));assert.equal(state.resources.gold,original);assert.equal(state.resources.silk,0);assert(state.data.armies[0].stores);
const beforePreview=JSON.stringify(state.serialize());FiscalSystem.preview(state);assert.equal(JSON.stringify(state.serialize()).replace(/"savedAt":"[^"]+"/,'"savedAt":""'),beforePreview.replace(/"savedAt":"[^"]+"/,'"savedAt":""'),"预估不得修改真实战局");
const markup=FiscalUI.markup(state);for(const text of ["中央","地方","军仓","在途","贯","石","品","人日","注意力占用"])assert(markup.includes(text),text);
for(const text of ["上缴发出时","计算规则与取舍","不会立即增加"])assert(!markup.includes(text),"玩家界面不应显示设计说明");
state=fixture();let harvestDays=0;
for(let day=0;day<365;day++){FiscalSystem.settle(state,[]);FiscalSystem.consumeArmy(state,state.data.armies[0],[]);if(state.policies.economyHistory.at(-1).harvest>0)harvestDays++;state.turn++;state.date=GameClock.next(state.date)}
assert.equal(harvestDays,1);assert.equal(state.date.year,201);assert.equal(state.date.month,1);assert.equal(state.date.day,1);
for(const city of state.data.cities)for(const key of ["localGold","localFood","localSilk","population"])assert(Number.isFinite(city[key])&&city[key]>=0,`${city.id}.${key}`);
assert(state.resources.silk>0,"布帛按周期上缴后应能进入中央府库");
const silk=state.resources.silk,officer=state.data.officers[0];FiscalSystem.handleOrder(state,{type:"reward_officer",officerIds:[officer.id],amount:20,options:{rewardResource:"silk"}},[]);assert.equal(state.resources.silk,silk-20);
state=fixture();city=state.data.cities[0];state.engine.playerForceId=state.playerForceId;city.garrison=8000;state.data.officers.push({id:"newbie",name:"新将",force:"cao",city:"a",status:"serving",command:70,war:80,intelligence:60,loyalty:85});
const garrisonFood=city.localFood,formedEvents=[];
state.engine.resolveOrder(state,{type:"form_army",commandName:"编军",cityIds:[city.id],officerIds:["newbie"],amount:3000,options:{units:{infantry:2000,cavalry:500,archers:500}}},formedEvents);
const formed=state.data.armies.find(army=>army.id.startsWith("cao_army_"));
assert(formed,"编军应生成新军团");assert(formed.stores,"新军团必须带军仓字段");assert(formed.stores.food>0,"新军团应自驻地就仓，军仓不得为空");assert.equal(city.localFood,garrisonFood-formed.stores.food,"就仓粮食应取自驻地存粮");
console.log("分级财政回归通过：收支守恒 / 上缴延迟与阻断 / 单次入库 / 重复征收防刷 / 任官与民心 / 徭役扣还人口与减产 / 军仓单次消耗 / 编军就仓 / 秋收周期 / 延迟工程与自动遣散 / 旧存档恢复 / 预估无副作用");
