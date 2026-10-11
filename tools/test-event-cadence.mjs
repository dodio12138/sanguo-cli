globalThis.window=globalThis;await import("../js/core/game-clock.js");await import("../js/core/fiscal-system.js");await import("../js/core/rule-engine.js");
const data={scenario:{id:"test"},forces:[{id:"cao",name:"曹操"},{id:"neutral",name:"无主"}],cities:[{id:"a",force:"cao"}],armies:[],rules:{balance:{events:{random_min_gap:3,milestone_interval:12}}}},engine=new RuleEngine(data),state={turn:6,playerForceId:"cao",date:{month:2},resources:{},policies:{eventHistory:[{id:"old",type:"random",turn:5}]},random:()=>0};
if(engine.eventEligible({id:"random",type:"random",trigger:{chance:1}},state))throw new Error("随机事件没有遵守全局最小间隔");
if(!engine.eventEligible({id:"history",type:"historical",trigger:{}},state))throw new Error("历史事件被随机事件间隔错误阻止");
state.turn=12;const events=[];engine.runMilestone(state,events);if(!events.some(e=>e.phase==="天下形势"))throw new Error("十二旬里程碑没有生成");
console.log("事件节奏通过：随机间隔 / 历史优先 / 十二旬评议");
