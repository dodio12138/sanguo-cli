globalThis.window=globalThis;
await import("../js/core/rule-engine.js");

const data={forces:[{id:"cao",name:"曹操"},{id:"yuan",name:"袁绍"},{id:"neutral",name:"无主"}],cities:[
  {id:"a",name:"甲",force:"cao",garrison:5000},{id:"b",name:"乙",force:"yuan",garrison:5000},{id:"c",name:"丙",force:"yuan",garrison:5000}
],armies:[{id:"enemy",name:"河北军",force:"yuan",city:"b",destination:"a",soldiers:6000,stance:"行军"}],officers:[],rules:{city_graph:{a:["b"],b:["a","c"],c:["b"]},balance:{ai:{hegemon_city_share:.6,personalities:{cao:{name:"中原权谋"},yuan:{name:"河北持重"}}}}}},engine=new RuleEngine(data),state={turn:8,playerForceId:"cao",intelligence:{armies:{enemy:2}},reports:[]};
let view=engine.strategicIntel(state);
if(view.forces.find(f=>f.id==="yuan")?.threat!=="霸主"||view.fronts[0]?.pressure!=="危急"||view.intentions[0]?.target!==null)throw new Error("战略情报分级或霸主/压力判断错误");
state.intelligence.armies.enemy=3;view=engine.strategicIntel(state);
if(view.intentions[0]?.target!=="甲")throw new Error("三级军情没有显示已知目标");
console.log("战略情报通过：霸主识别 / 前线压力 / 意图权限分级");
