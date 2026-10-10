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

state=fixture();city=state.data.cities[0];const stationed=state.data.armies[0],ration=FiscalSystem.armyDailyNeed(state,stationed),consumed=city.localFood;
FiscalSystem.consumeArmy(state,stationed,[]);
assert.equal(city.localFood,consumed-ration,"驻城军团必须优先消耗城市粮食");
assert.equal(stationed.stores.food,0,"优先吃城粮时军仓不得凭空增加");
assert.equal(stationed.stores.lastConsumption.source,"城市粮仓");
FiscalSystem.stockArmy(state,stationed);assert.equal(stationed.stores.food,FiscalSystem.armyFoodTarget(state,stationed),"就仓必须把军仓补到满仓");
const marchedFood=city.localFood;stationed.route=["b"];FiscalSystem.consumeArmy(state,stationed,[]);
assert.equal(city.localFood,marchedFood,"行军途中不得再消耗城市粮食");
assert.equal(stationed.stores.food,FiscalSystem.armyFoodTarget(state,stationed)-ration,"行军途中只能消耗随军军仓");
assert.equal(stationed.stores.lastConsumption.source,"随军军仓");
delete stationed.route;state.data.cities[0].force="yuan";stationed.stores.food=500;const foreignFood=city.localFood;
FiscalSystem.consumeArmy(state,stationed,[]);
assert.equal(city.localFood,foreignFood,"客地不得消耗他城粮食");
assert.equal(stationed.stores.food,500-ration);
state=fixture();const hungry=state.data.armies[0];hungry.stores.food=0;state.data.cities[0].localFood=0;const hungerEvents=[];
FiscalSystem.consumeArmy(state,hungry,hungerEvents);
assert.equal(hungry.stores.lastConsumption.short,ration);assert.equal(hungry.stores.lastConsumption.source,"缺粮");
assert(hungerEvents.some(event=>/缺粮/.test(event.text)),"断粮必须产生缺粮事件");

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
state=fixture();city=state.data.cities[0];const garrisonArmy=state.data.armies[0];
city.localFood=30000;city.fiscal.pendingRemittance.food=50000;
const backlog=city.fiscal.pendingRemittance.food,reserve=FiscalSystem.localFoodReserve(state,city,FiscalSystem.governance(state,city));
FiscalSystem.settle(state,[]);
assert(reserve>=FiscalSystem.armyFoodTarget(state,garrisonArmy),"保底粮必须覆盖驻城军团就仓目标");
assert(city.localFood>=reserve-40,"补缴必须给驻军口粮与军团就仓留足保底");
assert(city.fiscal.pendingRemittance.food<backlog,"超出保底的余粮仍应补缴");
assert(city.localFood>0,"补缴后陈留一类要地必须留有存粮");
const reserveEvents=[];FiscalSystem.consumeArmy(state,garrisonArmy,reserveEvents);
assert.equal(reserveEvents.filter(event=>/缺粮/.test(event.text)).length,0,"留底粮必须够军团日食");
assert.equal(garrisonArmy.stores.food,0,"驻城军团就食不动用军仓");
let starved=0;for(let day=0;day<40;day++){city.localFood+=300;const dayEvents=[];FiscalSystem.settle(state,dayEvents);FiscalSystem.consumeArmy(state,garrisonArmy,dayEvents);starved+=dayEvents.filter(event=>/缺粮/.test(event.text)).length;state.turn++;state.date=GameClock.next(state.date)}
assert.equal(starved,0,"持续运粮期间军团不得缺粮");
assert(city.fiscal.pendingRemittance.food<backlog,"余粮持续抵京，欠缴应逐步清偿");
state=fixture();city=state.data.cities[0];const backlogCity=city;
for(const type of ["land","commercial","food","silk"]){city.fiscal.accrued[type]=type==="food"?9000:9000}
city.fiscal.lastCollected={};const sourceEvents=[];
for(const type of ["land","commercial","food","silk"])FiscalSystem.collect(state,city,type,sourceEvents,true);
const sources=FiscalSystem.incomeSources(state);
assert.equal(sources.length,3,"收入来源必须按钱币／粮食／布帛三类给出");
const goldSource=sources.find(source=>source.resource==="gold");
assert.equal(goldSource.turn,state.turn,"同一回合的田租与商税应合并为一次钱币来源");
assert.equal(goldSource.entries.length,1,"只有一个城征收时来源应只有一条");
assert.equal(goldSource.total,goldSource.entries[0].gross,"来源合计必须等于各郡县之和");
assert.equal(goldSource.entries[0].share,1);
assert(goldSource.entries[0].kinds.includes("land")&&goldSource.entries[0].kinds.includes("commercial"));
state.data.cities[1].force=state.playerForceId;state.data.cities[1].fiscal.accrued.land=5000;
FiscalSystem.collect(state,state.data.cities[1],"land",[],true);
const split=FiscalSystem.incomeSources(state).find(source=>source.resource==="gold");
assert.equal(split.entries.length,2,"两城征收应给出两条来源");
assert.equal(split.entries[0].gross,Math.max(...split.entries.map(entry=>entry.gross)),"来源必须按收入降序");
assert(Math.abs(split.entries.reduce((sum,entry)=>sum+entry.share,0)-1)<1e-9,"占比之和必须为 1");
assert(split.entries[0].share>split.entries[1].share);
const chartMarkup=FiscalUI.markup(state);for(const text of ["收入来源（按郡县占比）","fiscal-source-bar","fiscal-source-legend","data-arrears-toggle"])assert(chartMarkup.includes(text),text);
assert(chartMarkup.includes("城b"),"来源图必须列出郡县名称");

state=fixture();city=state.data.cities[0];const owed=state.data.armies[0];
city.localFood=0;city.fiscal.pendingRemittance.food=6000;FiscalSystem.account(state).arrears="retain";
const shipmentsBefore=state.policies.fiscalAccounts.shipments.length,retainEvents=[];
FiscalSystem.settle(state,retainEvents);
assert.equal(city.fiscal.pendingRemittance.food,0,"地方留用必须清空欠额，不得继续追缴");
assert.equal(state.policies.fiscalAccounts.shipments.length,shipmentsBefore,"地方留用不得再发出补缴运输");
assert.equal(city.localFood,0,"地方留用只改变归属，不得凭空生成粮食");
assert(retainEvents.some(event=>/转为地方留用/.test(event.text)));
assert(FiscalSystem.pendingArrears(state).food===0);
assert.equal(city.fiscal.arrearsRetained.food,6000,"留用金额必须按资源分别登记");
assert.equal(city.fiscal.arrearsRetained.gold,0,"留用金额不得跨资源串账");
city.localFood=400;FiscalSystem.stockArmy(state,owed);assert(owed.stores.food>0,"留用政策下军粮仍可自城仓就仓");
const keepEvents=[];FiscalSystem.consumeArmy(state,owed,keepEvents);assert.equal(keepEvents.filter(event=>/缺粮/.test(event.text)).length,0,"留用政策下军粮仍按正常就仓供给");
assert(FiscalSystem.handleOrder(state,{type:"set_collection_policy",cityIds:[city.id],amount:0,options:{landRate:10,commercialRate:10,silkRate:10,landPeriod:1,commercialPeriod:1,foodPeriod:12,silkPeriod:3,arrears:"bogus"}},[]),true);
assert.equal(FiscalSystem.account(state).arrears,"retain","非法欠缴模式必须被拒绝且不改变制度");
assert.equal(FiscalSystem.handleOrder(state,{type:"set_collection_policy",cityIds:[city.id],amount:0,options:{landRate:10,commercialRate:10,silkRate:10,landPeriod:1,commercialPeriod:1,foodPeriod:12,silkPeriod:3,arrears:"remit"}},[]),true);
assert.equal(FiscalSystem.account(state).arrears,"remit");
const policyMarkup=FiscalUI.markup(state);for(const text of ["收入来源","欠缴处理","改为地方留用","fiscal-arrears"])assert(policyMarkup.includes(text),text);
assert(policyMarkup.includes("累计转地方留用"),"府库面板必须显示累计地方留用，欠额不得无声消失");
console.log("分级财政回归通过：收支守恒 / 上缴延迟与阻断 / 单次入库 / 重复征收防刷 / 任官与民心 / 徭役扣还人口与减产 / 军仓单次消耗 / 编军就仓 / 秋收周期 / 延迟工程与自动遣散 / 旧存档恢复 / 补缴不夺军粮 / 收入来源占比 / 欠缴地方留用 / 预估无副作用");
