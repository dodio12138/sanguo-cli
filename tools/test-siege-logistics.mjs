globalThis.window=globalThis;
await import("../js/core/rule-engine.js");

const siege={breach_ratio:.55,supply_drain_per_xun:7,supplied_attacker_drain_per_xun:2,defender_morale_start:72,pressure_morale_loss_per_xun:4,isolated_morale_loss_per_xun:2,starvation_morale_loss_per_xun:14,garrison_food_divisor:18,army_food_divisor:24,population_food_divisor:800,starvation_garrison_loss_ratio:.05,surrender_morale:0};
const cities=[
  {id:"core_a",name:"本土甲",force:"yuan",population:100000,garrison:6000,localFood:8000,localGold:1000,storage:20000,level:3,agriculture:50,commerce:50,order:70,buildings:[],reserveRatio:25,defenseDamage:0,siegeMorale:72,x:10,y:10},
  {id:"core_b",name:"本土乙",force:"yuan",population:80000,garrison:5000,localFood:6000,localGold:800,storage:20000,level:2,agriculture:45,commerce:40,order:65,buildings:[],reserveRatio:25,defenseDamage:0,siegeMorale:72,x:11,y:10},
  {id:"island",name:"孤城",force:"yuan",population:20000,garrison:4000,localFood:100,localGold:500,storage:10000,level:5,agriculture:90,commerce:30,order:60,buildings:[],reserveRatio:25,defenseDamage:0,siegeMorale:72,x:20,y:20},
  {id:"staging",name:"围城营地",force:"cao",population:50000,garrison:3000,localFood:12000,localGold:500,storage:20000,level:2,agriculture:40,commerce:30,order:60,buildings:[],reserveRatio:25,defenseDamage:0,siegeMorale:72,x:19,y:20}
];
const attacker={id:"cao_attack",name:"围城军",force:"cao",city:"staging",commander:"攻将",soldiers:9000,units:{infantry:9000,cavalry:0,archers:0},morale:80,training:60,supply:90,stance:"围城",siegeTarget:"island",destination:"island"};
const defender={id:"yuan_defend",name:"孤城守军",force:"yuan",city:"island",commander:"守将",soldiers:2000,units:{infantry:2000,cavalry:0,archers:0},morale:70,training:50,supply:80,stance:"驻扎"};
const data={
  cities,armies:[attacker,defender],officers:[{id:"off_attack",name:"攻将",force:"cao",city:"staging",status:"serving",command:70,war:70,intelligence:50},{id:"off_defend",name:"守将",force:"yuan",city:"island",status:"serving",command:65,war:60,intelligence:55}],
  forces:[{id:"cao",name:"曹操",cities:1,resources:{gold:10000,food:30000}},{id:"yuan",name:"袁绍",cities:3,resources:{gold:10000,food:30000}},{id:"neutral",name:"无主",cities:0}],unitTypes:{infantry:{attack:1}},terrainDefs:{plains:{defence:0}},combatDoctrines:{},
  rules:{city_graph:{core_a:["core_b"],core_b:["core_a"],island:["staging"],staging:["island"]},balance:{siege,economy:{food_harvest_per_agriculture:3.5,population_base_growth_per_xun:0,population_order_growth_per_point:0,population_occupation_growth_per_xun:0}},movement:{}}
};
const engine=new RuleEngine(data),state={turn:1,date:{month:7},playerForceId:"cao",difficulty:"normal",resources:data.forces[0].resources,policies:{taxRate:10,economyHistory:[]},technology:{points:0,levels:{}},infrastructure:{supplyRoutes:[],routeStatuses:{}},corps:[],random:()=>.9};

if(!engine.isIsolatedCity("island","yuan")||engine.isIsolatedCity("core_a","yuan"))throw new Error("飞地识别不正确");
if(engine.logisticsPath("core_a","island","yuan"))throw new Error("飞地错误连入本土粮道");

engine.playerForceId="yuan";const transferEvents=[],beforeCore=cities[0].localFood,beforeIsland=cities[2].localFood;
engine.resolveInfrastructure({...state,playerForceId:"yuan",resources:data.forces[1].resources},{type:"transfer_food",commandName:"运输粮食",categoryName:"后勤",cityIds:["core_a","island"],amount:1000},transferEvents);
if(cities[0].localFood!==beforeCore||cities[2].localFood!==beforeIsland||!transferEvents.some(event=>event.text.includes("飞地无法越境转运")))throw new Error("飞地仍可绕过道路调粮");

engine.playerForceId="cao";const economyEvents=[];engine.resolveEconomies(state,economyEvents);
if(cities[2].localFood!==beforeIsland)throw new Error("围城期间仍产生地方粮");
const beforeDefenderMorale=defender.morale;engine.recoverIdleArmies();engine.consumeLocalSupplies(state,[]);if(defender.morale!==beforeDefenderMorale||cities[2].localFood!==beforeIsland)throw new Error("围城守军仍在休整或被重复扣粮");

cities[2].buildings=["农庄","市集","兵营","驿站"];engine.playerForceId="yuan";state.playerForceId="yuan";state.resources=data.forces[1].resources;const beforeBuildings={food:state.resources.food,gold:state.resources.gold,garrison:cities[2].garrison};engine.applyStrategicSystems(state,[]);
if(state.resources.food!==beforeBuildings.food||state.resources.gold!==beforeBuildings.gold||cities[2].garrison!==beforeBuildings.garrison)throw new Error("围城设施仍在产粮、产金或补充守军");

cities[2].localFood=0;engine.playerForceId="cao";state.playerForceId="cao";state.resources=data.forces[0].resources;const siegeEvents=[];for(let turn=1;turn<=8&&cities[2].force==="yuan";turn++){state.turn=turn;engine.resolveSieges(state,siegeEvents)}
if(cities[2].force!=="cao")throw new Error("断粮孤城未在士气归零后投降");
if(!siegeEvents.some(event=>event.text.includes("开城投降"))||!siegeEvents.some(event=>event.text.includes("存粮 0→0")))throw new Error("围城粮秣或投降报告缺失");
if(data.officers.find(officer=>officer.id==="off_defend").status!=="prisoner")throw new Error("投降守将未成为俘虏");
if(attacker.supply>=90)throw new Error("围城方没有消耗补给");

console.log("孤城围困通过：飞地识别 / 粮道阻断 / 基础及设施停产 / 守军饥饿 / 士气归零投降 / 守将被俘 / 攻方补给消耗");
