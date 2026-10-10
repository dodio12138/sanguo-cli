import assert from "node:assert/strict";
import fs from "node:fs";

globalThis.window=globalThis;
await import("../js/core/rule-engine.js");

const city=(id,name,x,y,force="neutral")=>({id,name,force,x,y,garrison:1000,level:1});
const synthetic={cities:[city("f","起点",0,0,"cao"),city("near","近驿",1,0),city("far","远驿",10,10,"cao"),city("goal","目标",2,0,"yuan"),city("blocked","敌驿",5,0,"yuan"),city("dead","死路",2,4,"yuan"),city("iso","孤驿",12,12,"yuan"),city("l0","粮道起点",20,0,"cao"),city("l1","粮道近驿",21,0,"cao"),city("l2","粮道远驿",30,10,"cao"),city("l3","粮道终点",22,0,"cao")],armies:[],officers:[],forces:[{id:"cao",name:"曹操"},{id:"yuan",name:"袁绍"},{id:"neutral",name:"无主"}],
  rules:{city_graph:{f:["far","near"],iso:["far"],near:["f","goal","dead"],far:["f","goal","iso"],goal:["near","far","blocked"],blocked:["goal"],dead:["near"],l0:["l2","l1"],l1:["l0","l3"],l2:["l0","l3"],l3:["l1","l2"]},movement:{road_cost:8,river_crossing_cost:5},edge_modifiers:{}}};
const engine=new window.RuleEngine(synthetic);
const name=id=>synthetic.cities.find(c=>c.id===id).name,label=route=>route.map(name).join("→");

assert.deepEqual(engine.path("f","goal"),["f","near","goal"],"同跳数时应取地面距离更短的路线，而不是邻接表里先出现的远路");
assert.deepEqual(engine.path("goal","f"),["goal","near","f"],"反向行进同样取最近路线");
assert.deepEqual(engine.path("f","f"),["f"],"起点即终点应返回单点路线");
assert.deepEqual(engine.logisticsPath("l0","l3","cao"),["l0","l1","l3"],"粮道应沿最近的同跳路线");
assert.equal(engine.logisticsPath("l0","goal","cao"),null,"非己方目标不应连入粮道");
assert.deepEqual(engine.coalitionPath("blocked","dead",["yuan"]),["blocked","goal","near","dead"],"联军路线仅经过成员或中立据点");
assert.equal(engine.coalitionPath("iso","dead",["yuan"]),null,"联军路线不得穿越非成员据点");
assert.deepEqual(engine.path("f","goal"),engine.path("f","goal"),"路线结果应稳定可复现");
assert.ok(engine.groundDistance("f","far")+engine.groundDistance("far","goal")>5*(engine.groundDistance("f","near")+engine.groundDistance("near","goal")),"合成场景应确实存在远绕路线");

new Function(fs.readFileSync(new URL("../js/data/offline-data.generated.js",import.meta.url),"utf8"))();
const data=globalThis.SANGUO_DATA,real=new window.RuleEngine(data),graph=data.rules.city_graph,cities=data.cities,site=id=>cities.find(c=>c.id===id);
const bfs=(from,to)=>{const queue=[[from]],seen=new Set([from]);while(queue.length){const route=queue.shift();if(route.at(-1)===to)return route;for(const next of graph[route.at(-1)]||[])if(!seen.has(next)){seen.add(next);queue.push([...route,next])}}return null};
const geo=route=>route.slice(1).reduce((total,id,index)=>total+Math.hypot(site(id).x-site(route[index]).x,site(id).y-site(route[index]).y),0);
let shorter=0,sameHops=true,noWorse=true;
for(const from of cities)for(const to of cities){
  if(from.id===to.id)continue;
  const legacy=bfs(from.id,to.id),route=real.path(from.id,to.id);
  if(Boolean(legacy)!==Boolean(route))throw new Error(`连通性改变：${from.id} → ${to.id}`);
  if(!route)continue;
  if(route.length!==legacy.length)sameHops=false;
  if(geo(route)>geo(legacy)+1e-9)noWorse=false;
  if(geo(route)<geo(legacy)-1e-9)shorter++;
}
assert.ok(sameHops,"同跳数规则必须保持：行军天数与补给预算不得变化");
assert.ok(noWorse,"新路线不得比旧路线绕远");
assert.ok(shorter>500,`应大量修正绕远路线，实际修正 ${shorter} 组`);
assert.ok(geo(real.path("shouchun","xuchang"))<geo(bfs("shouchun","xuchang")),`寿春→许昌应改走 ${real.path("shouchun","xuchang").map(id=>site(id).name).join("→")} 而非绕经下邳`);
assert.ok(geo(real.path("luoyang","tongguan"))<geo(bfs("luoyang","tongguan")),`洛阳→潼关应改走 ${real.path("luoyang","tongguan").map(id=>site(id).name).join("→")} 而非绕经安定`);

for(const forceId of ["cao","yuan"]){
  const throughEnemy=route=>route.slice(1,-1).some(id=>{const target=site(id);return target?.force&&![forceId,"neutral"].includes(target.force)});
  for(const from of cities.filter(c=>c.force===forceId))for(const to of cities)if(from.id!==to.id){const route=real.path(from.id,to.id,forceId);if(route&&throughEnemy(route))throw new Error(`敌境据点仍被穿越：${from.id} → ${to.id}`)}
}
console.log(`路线选择通过：同跳数取近路（修正 ${shorter} 组）/ 敌军据点阻断 / 粮道与联军共用 / 行军天数不变`);
