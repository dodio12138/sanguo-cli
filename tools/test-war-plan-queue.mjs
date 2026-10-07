globalThis.window=globalThis;
if(typeof globalThis.CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
await import("../js/core/rule-engine.js");
await import("../js/core/game-state.js");

const city=(id,name,force,garrison)=>({id,name,force,garrison,level:2,population:10000,agriculture:30,commerce:30,order:60,x:0,y:0}),army=(id,cityId)=>({id,name:id,force:"cao",city:cityId,commander:"曹操",soldiers:3000,units:{infantry:3000},supply:90,morale:80,training:60,stance:"驻扎"}),data={scenario:{id:"test",start_date:"200-01-01"},forces:[{id:"cao",name:"曹操"},{id:"yuan",name:"袁绍"},{id:"neutral",name:"无主"}],cities:[city("a","甲","cao",5000),city("b","乙","cao",5000),city("c","丙","yuan",4000)],armies:[army("first","a"),army("second","b")],officers:[],items:[],unitTypes:{infantry:{attack:1}},terrainDefs:{plains:{defence:0}},rules:{orders:{max_player_orders_per_turn:1},movement:{road_cost:8},city_graph:{a:["b"],b:["a","c"],c:["b"]},balance:{ai:{personalities:{cao:{name:"中原权谋"},yuan:{name:"河北持重"}}}}},events:[],commandCatalog:{commands:[{id:"move",name:"移动",categoryId:"march",categoryName:"行军",status:"active"}]}};
const state=new GameState(data,{playerForceId:"cao"});state.policies.militaryGoal="c";state.diplomacy.wars=["yuan"];
const before=data.armies.map(a=>a.city).join(":"),result=state.queueWarPlan("c","attack");
if(result.queued.length!==1||result.skipped!==1||state.orders.length!==1||data.armies.map(a=>a.city).join(":")!==before)throw new Error("战争计划批量入队未遵守上限或提前修改世界状态");
if(state.orders[0].options.warPlanTargetId!=="c"||state.orders[0].options.route.at(-1)!=="c")throw new Error("战争计划命令缺少目标或路线元数据");
console.log("计划入队通过：批量生成 / 队列上限 / 不直接执行");

const siegeData=structuredClone(data);siegeData.armies[0].city="b";siegeData.armies[0].siegeTarget="c";siegeData.armies[0].destination="c";siegeData.armies=siegeData.armies.slice(0,1);const siegeState=new GameState(siegeData,{playerForceId:"cao"});siegeState.policies.militaryGoal="c";siegeState.diplomacy.wars=["yuan"];
const siegePlan=siegeState.engine.warPlan(siegeState,"c"),repeatAttack=siegeState.queueWarPlan("c","attack");
if(!siegePlan.armies[0].besieging||repeatAttack.queued.length||repeatAttack.proposals.length||!repeatAttack.errors.some(error=>error.includes("攻城会持续推进"))||siegeState.orders.length)throw new Error("围城军团被战争计划重复派遣或未显示持续攻城提示");
const beforeDamage=siegeData.cities.find(item=>item.id==="c").defenseDamage||0;siegeState.addStructuredOrder("move",{armyIds:["first"],cityIds:["b","c"],targetIds:["first","c"],text:"行军/移动 first 至 丙"});const siegeEvents=siegeState.endTurn(),besieger=siegeData.armies.find(item=>item.id==="first"),besieged=siegeData.cities.find(item=>item.id==="c");
if(besieger.siegeTarget!=="c"||besieged.defenseDamage<=beforeDamage||!siegeEvents.some(event=>event.text.includes("无需重复下令")))throw new Error("重复移动命令中断了围城，或围城未持续推进");
console.log("围城持续通过：重复计划不再派遣围城军团 / 提示攻城持续中 / 重复移动不重置城防进度");
