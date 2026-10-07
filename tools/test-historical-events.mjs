import fs from "node:fs";
globalThis.window=globalThis;
await import("../js/core/rule-engine.js");

const events=JSON.parse(fs.readFileSync("game/data/common/events.json","utf8")).events;
for(const sample of [
  {scenario:"190_coalition",force:"cao",turn:5,event:"coalition_luoyang_advance"},
  {scenario:"200_guandu",force:"cao",turn:5,event:"guandu_supply_crisis"},
  {scenario:"208_red_cliffs",force:"sun",turn:7,event:"red_cliffs_fire_plan"}
]){
  const data={events,scenario:{id:sample.scenario},cities:[{id:"capital",name:"本城",force:sample.force,order:70,population:10000,agriculture:20,commerce:20,defenseDamage:20}],armies:[{id:"army",force:sample.force,morale:70,training:60,supply:80}]},engine=new RuleEngine(data),state={turn:sample.turn,date:{month:1},dateLabel:"测试旬",playerForceId:sample.force,resources:{gold:5000,food:5000,prestige:100},policies:{eventHistory:[],pendingEvent:null},random:()=>0},report=[];
  engine.runEvent(state,report);
  if(state.policies.pendingEvent?.id!==sample.event)throw new Error(`${sample.scenario} 未触发 ${sample.event}`);
  const choice=state.policies.pendingEvent.choices[0],result=engine.resolveEventChoice(state,choice.id);
  if(!result||state.policies.pendingEvent)throw new Error(`${sample.event} 选择未完成`);
}
console.log("历史事件链通过：190 / 200 / 208 触发与抉择");
