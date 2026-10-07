globalThis.window=globalThis;
await import("../js/core/rule-engine.js");
const data={forces:[{id:"cao",name:"曹操"},{id:"yuan",name:"袁绍"},{id:"neutral",name:"无主"}],cities:[{id:"a",name:"许昌",force:"cao",garrison:2000},{id:"b",name:"陈留",force:"cao",garrison:3000},{id:"c",name:"邺",force:"yuan",garrison:3000}],armies:[{id:"help",name:"援军",force:"cao",city:"b",soldiers:4000},{id:"enemy",name:"河北军",force:"yuan",city:"c",destination:"a",route:["a"],soldiers:7000}],officers:[],rules:{city_graph:{a:["b","c"],b:["a"],c:["a"]},balance:{ai:{personalities:{cao:{name:"中原权谋"},yuan:{name:"河北持重"}}}}}},engine=new RuleEngine(data),state={turn:2,playerForceId:"cao",intelligence:{armies:{enemy:3}},reports:[]};
const plan=engine.defensePlan(state),orders=engine.defenseOrders(state);
if(plan.threats[0]?.cityId!=="a"||plan.threats[0]?.gap!==5000||orders.proposals[0]?.armyId!=="help"||orders.proposals[0]?.commandId!=="forced_march")throw new Error("防御计划威胁、缺口或援军选择错误");
console.log("防御计划通过：来袭时间 / 守军缺口 / 及时援军 / 急行命令");
