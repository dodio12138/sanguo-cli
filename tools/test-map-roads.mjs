import assert from "node:assert/strict";
import fs from "node:fs";

globalThis.window=globalThis;
await import("../js/ui/map-view.js");
new Function(fs.readFileSync(new URL("../js/data/offline-data.generated.js",import.meta.url),"utf8"))();
const data=globalThis.SANGUO_DATA;

function makeView(){
  const view=Object.create(window.MapView.prototype);
  Object.assign(view,{scale:1,offset:{x:0,y:0},size:{w:1180,h:760},hiddenLegendItems:new Set(),territoryRadius:5,
    state:{playerForceId:"cao",observerMode:false,layer:"political",data,intelligence:{cities:{},armies:{}},infrastructure:{supplyRoutes:[]}}});
  return view;
}
function recorder(){
  const ops=[],ctx={beginPath:()=>ops.push(["beginPath"]),moveTo:(x,y)=>ops.push(["moveTo",x,y]),lineTo:(x,y)=>ops.push(["lineTo",x,y]),stroke:()=>ops.push(["stroke"]),save:()=>{},restore:()=>{},setLineDash:()=>{}};
  const vertices=()=>ops.filter(op=>op[0]==="moveTo"||op[0]==="lineTo").map(op=>[op[1],op[2]]);
  return {ctx,vertices};
}
const gridShape=(view,m,vertices)=>vertices.map(([x,y])=>[Number(((x-m.startX)/m.cell-.5).toFixed(6)),Number(((y-m.startY)/m.cell-.5).toFixed(6))]);
const scales=[.65,.8,1,1.35,1.4,1.75,2.05,2.1,2.7,2.75,3.1,3.4];

const view=makeView();

const diagonal=[[2,2],[6,6]],diagonalShapes=scales.map(scale=>{const {ctx,vertices}=recorder();view.scale=scale;const mm=view.metrics();view.traceOrthogonal(ctx,mm,diagonal);return JSON.stringify(gridShape(view,mm,vertices()))});
assert.equal(new Set(diagonalShapes).size,1,"对角线道路的弯折方向必须与缩放无关");

const roads=view.roadEdges();
const uniqueEdges=new Set();for(const [from,targets] of Object.entries(data.rules.city_graph))for(const to of targets)if(from<to)uniqueEdges.add(`${from}|${to}`);
assert.equal(roads.length,uniqueEdges.size,"道路必须覆盖路网中每一条边");
assert.ok(roads.length>data.cities.length-1,"不得再用生成树裁掉成环的道路");
const seen=new Set(roads.map(([a,b])=>`${a}|${b}`));for(const key of uniqueEdges)if(!seen.has(key))throw new Error(`路网边未绘制：${key}`);

const cityById=new Map(data.cities.map(city=>[city.id,city]));
let unstable=0;
for(const [aId,bId] of roads){
  const a=cityById.get(aId),b=cityById.get(bId),shapes=new Set();
  for(const scale of scales){const {ctx,vertices}=recorder();view.scale=scale;const m=view.metrics();view.traceOrthogonal(ctx,m,[[a.x,a.y],[b.x,b.y]]);shapes.add(JSON.stringify(gridShape(view,m,vertices())))}
  if(shapes.size!==1)unstable+=1;
}
assert.equal(unstable,0,`有 ${unstable} 条道路的弯折方向随缩放翻转`);

const sample=roads.find(([aId,bId])=>{const a=cityById.get(aId),b=cityById.get(bId);return a.x!==b.x&&a.y!==b.y});
const [fromId,toId]=sample,from=cityById.get(fromId),to=cityById.get(toId);
const armyView=makeView();
armyView.state.data=structuredClone(data);
armyView.state.data.armies=[{id:"probe",name:"行军军团",force:"cao",city:fromId,route:[toId],soldiers:3000}];
const armyRec=recorder();
armyView.drawArmyRoutes(armyRec.ctx,armyView.metrics());
const roadRec=recorder();
view.scale=1;
view.traceOrthogonal(roadRec.ctx,view.metrics(),[[from.x,from.y],[to.x,to.y]]);
assert.deepEqual(armyRec.vertices(),roadRec.vertices(),"行军路线必须与既定道路几何一致");
assert.equal(armyRec.vertices().length,3,"折线道路应含起、折、讫三点");

const source=fs.readFileSync(new URL("../js/ui/map-view.js",import.meta.url),"utf8");
assert.ok(!/traceOrthogonal\(c,\[\[m\.startX/.test(source),"道路不得再以像素坐标判定弯折");
for(const feature of ["drawArmyRoutes","drawSieges","drawSupplyRoutes","drawPlannedRoute"])if(!new RegExp(`${feature}\\(c,m\\).*traceOrthogonal\\(c,m,`).test(source.replace(/\n/g,"")))throw new Error(`${feature} 未复用道路折线`);
assert.ok(!source.includes("parent.set(a,b)"),"道路绘制不得再退化为最小生成树");
console.log(`舆图道路通过：全量路网 ${roads.length} 条 / 弯折方向缩放不变 / 行军路线贴合道路 / 围城与补给线同源`);
