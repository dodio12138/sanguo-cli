import assert from 'node:assert/strict';
globalThis.window=globalThis;globalThis.CustomEvent??=class extends Event{constructor(t,o={}){super(t);this.detail=o.detail}};
for(const file of ['data/offline-data.generated','core/game-clock','core/fiscal-system','core/rule-engine','core/game-state','ui/fiscal-ui'])await import(`../js/${file}.js`);
function fixture(month=7,opening=true){
 const d=structuredClone(SANGUO_DATA);d.scenario.start_date=`200-${String(month).padStart(2,'0')}-01`;
 d.forces=[{id:'cao',name:'曹操',capital:'a',soldiers:10000},{id:'neutral',name:'无主'}];
 d.cities=['a','b','c'].map((id,i)=>({id,name:id,force:'cao',population:20000,garrison:0,localFood:1000,localGold:50000,storage:200000,level:2,x:i,y:1,agriculture:50,commerce:50,order:70,buildings:[]}));
 d.counties=d.cities.map(c=>({id:'county-'+c.id,name:'县'+c.id,jurisdictionCityId:c.id,population:100000,agriculture:50,commerce:50,order:70}));
 d.armies=[{id:'army',name:'中军',force:'cao',city:'b',soldiers:10000,units:{infantry:10000},training:40,stores:{food:0},stance:'驻扎'}];d.officers=[];delete d.routeNetwork;d.rules.city_graph={a:['b'],b:['a','c'],c:['b']};return new GameState(d,{playerForceId:'cao',initializeGrain:opening});
}
const tick=s=>{s.turn++;s.date=GameClock.next(s.date)};
// 首年有在田进度，但未成熟粮不入仓；收获后开局不重复补上已收作物。
let g=fixture(),city=g.data.cities[1],cal=FiscalSystem.cropCalendar(g,city),annual=FiscalSystem.cropAnnualDue(g,city);
assert(Math.abs(city.fiscal.cropAccrued-annual*cal.elapsed/cal.duration)<1e-6);
assert(city.fiscal.openingGrain.added>0);assert(city.localFood>=FiscalSystem.localDailyGrain(g,city)*(FiscalSystem.grainForecast(g,city).days+60)-1);
const food=city.localFood,crop=city.fiscal.cropAccrued;FiscalSystem.seedOpeningGrain(g);assert.equal(city.localFood,food);assert.equal(city.fiscal.cropAccrued,crop,'初始化幂等');
FiscalSystem.account(g).autoGrainRelief=false;
while(g.date.month<9||g.date.day<30){FiscalSystem.settle(g,[]);tick(g)}
const before=city.fiscal.cropAccrued;FiscalSystem.settle(g,[]);assert.equal(city.fiscal.lastHarvestYear,200);assert.equal(city.fiscal.cropAccrued,0);assert(before>annual*.9,'年中开局不只收剩余几个月');const harvested=g.policies.economyHistory.at(-1).harvest;assert(harvested>0);FiscalSystem.settle(g,[]);assert.equal(g.policies.economyHistory.at(-1).harvest,0,'同年同日不重复收获');
assert.equal(fixture(11).data.cities[1].fiscal.cropAccrued,0,'秋收后开局不补一整季到下一年');
g=fixture(1);FiscalSystem.settle(g,[]);assert.equal(g.data.cities[1].fiscal.cropAccrued,0,'休耕月不增长');
// 旧档低粮和在田成果原样保留，重复读档或初始化不补发。
g=fixture(7,false);city=g.data.cities[1];city.localFood=0;city.fiscal.cropAccrued=123;g.resources.food=321;const save=g.serialize();delete save.policies.fiscalAccounts.grainOpening;delete save.world.cities.find(c=>c.id===city.id).fiscal.grainVersion;
const restored=fixture();restored.applySave(restored.migrateSave(save));city=restored.data.cities[1];assert.equal(city.localFood,0);assert.equal(city.fiscal.cropAccrued,123);assert.equal(restored.resources.food,321);FiscalSystem.seedOpeningGrain(restored);assert.equal(city.localFood,0);assert.equal(city.fiscal.cropAccrued,123);
// 中央缺粮济运：扣中央、计在途、有途损、按路段走，到货一次；无重复、可停用。
g=fixture(7,false);g.resources.food=80000;g.data.cities.forEach(c=>c.localFood=100000);city=g.data.cities[1];city.localFood=0;const central=g.resources.food;FiscalSystem.advanceGrainRelief(g,[]);
let cargos=g.policies.fiscalAccounts.shipments.filter(c=>c.grainRelief);assert.equal(cargos.length,1);const cargo=cargos[0];assert.equal(central-g.resources.food,cargo.amount);assert.equal(city.localFood,0);assert.equal(cargo.amount,cargo.delivered+cargo.transportLoss);
FiscalSystem.advanceGrainRelief(g,[]);assert.equal(g.policies.fiscalAccounts.shipments.length,1);for(let i=0;i<5;i++)tick(g);FiscalSystem.advanceGrainRelief(g,[]);assert.equal(g.policies.fiscalAccounts.shipments.length,1,'够用的在途粮不重复发');
FiscalSystem.account(g).autoGrainRelief=false;for(let i=0;i<50&&cargo.status!=='完成';i++){tick(g);FiscalSystem.advanceShipments(g,[])}assert.equal(cargo.status,'完成');assert.equal(city.localFood,cargo.delivered);FiscalSystem.advanceShipments(g,[]);assert.equal(city.localFood,cargo.delivered);
// 除指定粮线、被围、飞地、中央不足与仓容外，不绕过运输限制。
for(const kind of ['blocked','besieged','empty','managed','disabled']){
 const s=fixture(7,false);s.data.cities.forEach(c=>c.localFood=100000);s.data.cities[1].localFood=0;s.resources.food=80000;
 if(kind==='blocked')s.data.rules.city_graph.a=[];
 if(kind==='besieged'){const original=s.engine.isCityBesieged.bind(s.engine);s.engine.isCityBesieged=c=>(typeof c==='string'?c:c?.id)==='b'||original(c)}
 if(kind==='empty')s.resources.food=0;
 if(kind==='managed')FiscalSystem.configureSupplyRoute(s,{cityIds:['a','b'],options:{source:'central',targetFood:50000,reserveFood:1000,batchFood:10000}});
 if(kind==='disabled')FiscalSystem.account(s).autoGrainRelief=false;
 FiscalSystem.advanceGrainRelief(s,[]);assert.equal(s.policies.fiscalAccounts.shipments.length,0,kind);assert.equal(s.data.cities[1].localFood,0,kind);
}
g=fixture(7,false);city=g.data.cities[1];city.localFood=0;city.storage=500;g.resources.food=50000;FiscalSystem.advanceGrainRelief(g,[]);assert(g.policies.fiscalAccounts.shipments.find(c=>c.targetCityId===city.id).delivered<=500);
// 只读预报不消耗随机数，不产生粮食、粮队或改变作物；断路在途不计作可按期使用。
const snapshot=()=>JSON.stringify({data:g.data,policies:g.policies,resources:g.resources,rng:g.rngState}),baseline=snapshot();FiscalSystem.grainForecast(g,city);FiscalUI.cityMarkup(g,city);assert.equal(snapshot(),baseline);
const pending=g.policies.fiscalAccounts.shipments[0];pending.status='受阻';assert.equal(FiscalSystem.grainForecast(g,city).onTime,0);
// 屯田真实命令：再减官粮，逐日增收而非点击发粮；停止后成果保留，到下一次收获一次入账。
g=fixture(7,false);city=g.data.cities[1];let army=g.data.armies[0];city.localFood=100000;const ration=FiscalSystem.armyDailyNeed(g,army),order=g.addStructuredOrder('army_farming',{armyIds:[army.id],options:{enabled:'yes'}});assert(order);g.endTurn();assert(army.farming);assert.equal(FiscalSystem.armyDailyNeed(g,army),Math.ceil(ration/2));assert.equal(FiscalSystem.armyFoodTarget(g,army),660*g.engine.armyCarryDays(army),'屯田不能削减出征备粮');
const farmStart=city.fiscal.farmingAccrued||0,grainStart=city.localFood;
for(let i=0;i<30;i++){tick(g);FiscalSystem.settle(g,[])}
assert(city.fiscal.farmingAccrued>farmStart);assert(city.localFood<=grainStart,'屯田未到收获不得直接入仓');const credits=city.fiscal.farmingAccrued;
const farmSave=g.serialize(),farmReload=fixture();farmReload.applySave(farmReload.migrateSave(farmSave));assert(farmReload.data.armies[0].farming);assert(Math.abs(farmReload.data.cities[1].fiscal.farmingAccrued-credits)<.001,'屯田成果随档保留');
const trainingFarm=fixture(7,false),trainingIdle=fixture(7,false);trainingFarm.observerMode=trainingIdle.observerMode=true;trainingFarm.data.armies[0].farming={cityId:'b',startedTurn:1};trainingFarm.engine.resolveAdministration(trainingFarm,[]);trainingIdle.engine.resolveAdministration(trainingIdle,[]);assert(trainingFarm.data.armies[0].trainingProgress<trainingIdle.data.armies[0].trainingProgress,'屯田投入放慢真实训练进度');
g.engine.resolveOrder(g,{type:'army_farming',armyIds:[army.id],options:{enabled:'no'}},[]);assert(!army.farming);assert.equal(FiscalSystem.armyDailyNeed(g,army),ration);tick(g);FiscalSystem.settle(g,[]);assert.equal(city.fiscal.farmingAccrued,credits,'停止后不继续增长、已有成果仍在');
g.date={year:200,month:9,day:30,xun:2};g.turn++;FiscalSystem.settle(g,[]);assert.equal(city.fiscal.farmingAccrued,0);assert.equal(city.fiscal.lastHarvestFarming,Math.floor(credits));const farmHarvest=city.fiscal.lastHarvestFarming;FiscalSystem.settle(g,[]);assert.equal(city.fiscal.lastHarvestFarming,farmHarvest);
// 野外、围城、敌军、离城不屯田；同地多军共享土地容量。
g=fixture(7,false);army=g.data.armies[0];city=g.data.cities[1];
for(const patch of [{route:['c']},{fieldPosition:{x:1,y:1}},{siegeTarget:'c'},{force:'neutral'}]){const a={...army,...patch};assert(!FiscalSystem.canFarmArmy(g,a)||patch.force==='neutral')}
const enemy={...army,id:'enemy',force:'neutral'};g.data.armies.push(enemy);g.engine.resolveOrder(g,{type:'army_farming',armyIds:['enemy'],options:{enabled:'yes'}},[]);assert(!enemy.farming);g.data.armies.pop();
army.farming={cityId:'b',startedTurn:1};const profile=FiscalSystem.armyFarming(g,army);assert(profile.active);army.route=['c'];assert.equal(FiscalSystem.armyDailyNeed(g,army),660);tick(g);FiscalSystem.settle(g,[]);assert(!army.farming,'离城后取消屯田状态');delete army.route;
for(let i=0;i<8;i++)g.data.armies.push({...structuredClone(army),id:'farm-'+i,soldiers:10000,farming:{cityId:'b',startedTurn:g.turn}});
const workforce=FiscalSystem.farmingAt(g,city).reduce((s,r)=>s+r.workers,0);assert(workforce<=FiscalSystem.governance(g,city).population*.1,'土地承载限制，不按军团数量无限叠加');
console.log('粮食季节、中央济粮与屯田通过：首年作物 / 储备 / 秋收去重 / 旧档不补发 / 真实运输 / 围困断路 / 预报只读 / 屯田命令、官粮减免、土地上限与下次收获');
