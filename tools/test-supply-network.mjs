globalThis.window=globalThis;
await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");

const cities=[
  {id:"a",name:"甲城",force:"cao",localFood:9000,storage:10000,reserveRatio:20,buildings:["驿站"]},
  {id:"b",name:"乙城",force:"cao",localFood:0,storage:10000,reserveRatio:20,buildings:[]},
  {id:"c",name:"丙城",force:"cao",localFood:1000,storage:10000,reserveRatio:20,buildings:[]}
],data={cities,armies:[],officers:[],counties:[],forces:[{id:"cao",name:"曹操"}],rules:{city_graph:{a:["b"],b:["a","c"],c:["b"]}}},engine=new RuleEngine(data),state={data,engine,resources:{gold:1000,food:1000,silk:0},policies:{},date:{year:200,month:1,xun:0},turn:1,playerForceId:"cao",infrastructure:{supplyRoutes:["a:c"],routeStatuses:{}},technology:{levels:{logistics:0}}},events=[];
engine.auditSupplyRoutes(state,events);
if(!state.infrastructure.routeStatuses["a:c"].active||cities[0].localFood>=9000||cities[2].localFood!==1000||!state.policies.fiscalAccounts.shipments.length)throw new Error("畅通路线应发出运输批次而非立即到账");
data.armies.push({id:"enemy",force:"yuan",city:"b",soldiers:1000});state.turn=2;engine.auditSupplyRoutes(state,events);
if(state.infrastructure.routeStatuses["a:c"].active||!state.infrastructure.supplyRoutes.includes("a:c"))throw new Error("截断路线未保留或状态错误");
data.armies=[];state.turn=3;engine.auditSupplyRoutes(state,events);
if(!state.infrastructure.routeStatuses["a:c"].active||!events.some(event=>event.text.includes("恢复通行")))throw new Error("路线未自动恢复");
FiscalSystem.advanceShipments(state,events);state.turn=4;FiscalSystem.advanceShipments(state,events);if(cities[2].localFood<=1000)throw new Error("恢复后的在途粮食未到达");
console.log("补给网络通过：运输 / 截断保留 / 自动恢复");
