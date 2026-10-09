globalThis.window=globalThis;
await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");

const data={forces:[{id:"cao",name:"曹操"},{id:"yuan",name:"袁绍"},{id:"neutral",name:"无主"}],cities:[
  {id:"a",name:"许昌",force:"cao",garrison:5000,level:3,x:0,y:0},{id:"b",name:"官渡",force:"neutral",garrison:500,level:1,x:1,y:0},{id:"c",name:"邺",force:"yuan",garrison:4000,level:3,x:2,y:0}
],armies:[
  {id:"own",name:"中军",force:"cao",city:"a",soldiers:6000,units:{infantry:6000},supply:80,morale:80,training:60},
  {id:"enemy",name:"河北军",force:"yuan",city:"c",destination:"a",soldiers:3000,units:{infantry:3000},supply:80,morale:70,training:55}
],officers:[],unitTypes:{infantry:{attack:1}},terrainDefs:{plains:{defence:0}},rules:{movement:{road_cost:8,river_crossing_cost:5},city_graph:{a:["b"],b:["a","c"],c:["b"]},balance:{ai:{hegemon_city_share:.6,personalities:{cao:{name:"中原权谋"},yuan:{name:"河北持重"}}}}}},engine=new RuleEngine(data),state={turn:1,playerForceId:"cao",policies:{militaryGoal:"c"},intelligence:{armies:{enemy:3}},reports:[]};
const plan=engine.warPlan(state);
if(plan.target?.id!=="c"||plan.armies[0]?.route.join(":")!=="a:b:c"||plan.armies[0]?.supplyCost!==16||plan.latestArrival!==2||!plan.warnings.length)throw new Error("战争计划路线、补给或预警计算错误");
console.log("战争计划通过：集结路线 / 补给预算 / 攻城估值 / 来袭预警");
