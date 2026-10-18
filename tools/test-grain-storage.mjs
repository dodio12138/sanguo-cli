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
  return new GameState(data,{playerForceId:"cao",initializeGrain:false});
}
// 旧档超仓实粮完整保留；旧仓容只升级一次，中央、在途和人口均不补发。
{
 const s=fixture(),c=s.data.cities[2];c.storage=40000;c.localFood=172768;c.fiscal.pendingRemittance.food=132868;s.resources.food=12345;
 const save=JSON.parse(JSON.stringify(s.serialize()));delete save.policies.fiscalAccounts.storageCapacityVersion;
 const back=fixture();back.applySave(back.migrateSave(save));const restored=back.data.cities[2];assert.equal(restored.localFood,172768);assert(restored.storage>=172768);assert.equal(back.resources.food,12345);assert.equal(restored.fiscal.pendingRemittance.food,132868);
 const size=restored.storage,next=fixture();next.applySave(next.migrateSave(JSON.parse(JSON.stringify(back.serialize()))));assert.equal(next.data.cities[2].localFood,172768);assert.equal(next.data.cities[2].storage,size,'重复读档不扩建、不截粮');
}
// 道路不通，只收仓容能容纳的粮；应收余额、真实库存与损耗守恒。
for(const free of [0,100,30000]){
 const s=fixture(),c=s.data.cities[2];s.policies.fiscalAccounts.storageCapacityVersion=1;c.storage=40000;c.localFood=40000-free;c.fiscal.accrued.food=200000;const before=c.localFood,costBefore=c.localGold;
 const route=FiscalSystem.route;FiscalSystem.route=()=>null;let r;try{r=FiscalSystem.collect(s,c,'food',[],true)}finally{FiscalSystem.route=route}
 assert(c.localFood<=c.storage);assert.equal(c.fiscal.accrued.food+(r.gross||0),200000,'未征收粮保留在应收');if(free===0){assert(!r.ok);assert.equal(c.localGold,costBefore,'未征收不扣经费');assert.equal(c.localFood,before)}else{assert(r.ok);assert.equal(c.localFood-before,r.retained+r.pending);assert.equal(r.gross,r.inefficiencyLoss+r.corruptionLoss+r.localUse+r.retained+r.pending);assert.equal(c.fiscal.pendingRemittance.food,r.pending)}
}
// 有通路且可正常上缴，满仓不妨碍税粮走运输账。
{
 const s=fixture(),c=s.data.cities[2];c.storage=40000;c.localFood=40000;c.fiscal.accrued.food=200000;const r=FiscalSystem.collect(s,c,'food',[],true);assert(r.ok);assert(r.remitted>0);assert.equal(c.localFood,40000);assert.equal(c.fiscal.accrued.food,0);
}
// 仓容按人口和实际驻屯规划，但不发粮、不改军团口粮；关津按独立规模。
{
 const s=fixture(),c=s.data.cities[0],a=s.data.armies[0],food=c.localFood,need=FiscalSystem.armyDailyNeed(s,a);c.storage=10000;FiscalSystem.ensureStorageCapacity(s);assert(c.storage>=FiscalSystem.localDailyGrain(s,c)*240);assert.equal(c.localFood,food);assert.equal(FiscalSystem.armyDailyNeed(s,a),need);const size=c.storage;FiscalSystem.ensureStorageCapacity(s);assert.equal(c.storage,size);
}
// 目的地失守后的没收同样受仓容约束，无法入仓的部分显式记 storageLoss。
{
 const s=fixture(),c=s.data.cities[2];c.storage=40000;c.localFood=39990;const cargo=FiscalSystem.enqueue(s,{forceId:'cao',sourceCityId:'a',targetCityId:c.id,resource:'food',amount:1000,targetKind:'local'});assert(cargo);c.force='yuan';s.turn++;FiscalSystem.advanceShipments(s,[]);assert.equal(cargo.status,'没收');assert.equal(c.localFood,40000);assert.equal(cargo.storageLoss,cargo.delivered-10);FiscalSystem.advanceShipments(s,[]);assert.equal(c.localFood,40000,'没收只入仓一次');
}
console.log('仓储回归通过：超仓旧档保粮／重复读档幂等／断路部分征收与应收余额／满仓正常上缴／按需扩仓不发粮、不改军团日耗');
