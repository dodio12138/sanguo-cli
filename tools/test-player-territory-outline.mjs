import assert from "node:assert/strict";
import fs from "node:fs";

globalThis.window=globalThis;
await import("../js/ui/map-view.js");

const width=12,height=6,radius=5;
const cities=[{id:"xu",name:"许昌",x:1,y:1,force:"cao"},{id:"ye",name:"邺",x:9,y:1,force:"yuan"}];
const forces=[{id:"cao",name:"曹操",color:"#b89044"},{id:"yuan",name:"袁绍",color:"#776aa0"},{id:"neutral",name:"无主",color:"#777568"}];

function makeView({playerForceId="cao",observerMode=false,layer="political",hidden=[]}={}){
  const view=Object.create(window.MapView.prototype),cells=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)cells.push({x,y,terrain:"plains",province:"豫州",commandery:"颍川",supply:4});
  Object.assign(view,{territoryRadius:radius,cells,hiddenLegendItems:new Set(hidden),state:{playerForceId,observerMode,layer,data:{map:{width,height},cities,forces}}});
  return view;
}
function recorder(){
  const ops=[],ctx={save:()=>ops.push(["save"]),restore:()=>ops.push(["restore"]),beginPath:()=>ops.push(["beginPath"]),moveTo:(x,y)=>ops.push(["moveTo",x,y]),lineTo:(x,y)=>ops.push(["lineTo",x,y]),setLineDash:pattern=>ops.push(["setLineDash",pattern]),stroke(){ops.push(["stroke",this.strokeStyle,this.lineWidth])}};
  return {ctx,ops};
}
// Independent reference for the player's territory boundary, mirroring the documented rule:
// nearest city owns the cell (earlier city wins ties), only within the territory radius, never ocean or 域外.
function boundaryCount(tiles){
  const mine=(x,y)=>{if(x<0||y<0||x>=width||y>=height)return false;const tile=tiles[y*width+x];if(!tile||tile.terrain==="ocean"||tile.province==="域外")return false;const first=Math.hypot(x-1,y-1),second=Math.hypot(x-9,y-1);return first<=second&&first<radius};
  let count=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(mine(x,y))for(const [dx,dy] of [[0,-1],[0,1],[-1,0],[1,0]])if(!mine(x+dx,y+dy))count++;
  return count;
}
const run=view=>{const {ctx,ops}=recorder();view.drawPlayerTerritoryOutline(ctx,{cell:10,startX:4,startY:6},view.cells);return ops};
const segments=ops=>{const counts=[];let current=0;for(const op of ops){if(op[0]==="moveTo")current++;else if(op[0]==="stroke"){counts.push(current);current=0}}return counts};

const plain=makeView();
const ops=run(plain),strokes=ops.filter(op=>op[0]==="stroke"),traced=segments(ops);
assert.deepEqual(traced,[boundaryCount(plain.cells),boundaryCount(plain.cells)],"我方疆界描边段数与独立参考不一致");
assert.ok(traced[0]>0,"我方疆界没有绘制任何描边");
assert.equal(strokes.length,2,"我方疆界应由深色底衬与亮色描边两条笔画组成");
assert.equal(strokes[0][1],"rgba(6,9,6,.85)");
assert.match(strokes[1][1],/^rgb\(/,"亮色描边应使用提亮后的势力色");
assert.notEqual(strokes[1][1],forces[0].color);
assert.ok(strokes[1][2]<strokes[0][2],"亮色描边应细于深色底衬");
assert.deepEqual([ops[0][0],ops.at(-1)[0]],["save","restore"]);
const dashes=ops.filter(op=>op[0]==="setLineDash");
assert.equal(dashes.length,1,"我方疆界应绘制为虚线");
assert.ok(Array.isArray(dashes[0][1])&&dashes[0][1].length===2&&dashes[0][1].every(Number.isFinite)&&dashes[0][1][0]>0&&dashes[0][1][1]>0,"虚线应包含正值的线段与间隔长度");
assert.ok(strokes[0][2]<=3&&strokes[1][2]<=1.5,"我方疆界描边应保持细线");

const hollow=makeView();hollow.cells[2*width+1].terrain="ocean";
assert.equal(hollow.cells[2*width+1].terrain,"ocean");
assert.equal(segments(run(hollow))[0],boundaryCount(hollow.cells),"海面不应算作我方疆域");

assert.equal(run(makeView({observerMode:true})).length,0,"观察模式不应绘制我方疆界");
assert.equal(run(makeView({hidden:["曹操"]})).length,0,"图例隐藏本势力后不应绘制描边");
assert.equal(run(makeView({playerForceId:"wu"})).length,0,"没有对应势力时不应绘制描边");
assert.ok(segments(run(makeView({layer:"terrain"})))[0]>0,"非势力图层也应标示我方疆界");

const view=fs.readFileSync(new URL("../js/ui/map-view.js",import.meta.url),"utf8");
for(const feature of ["this.territoryRadius=5","politicalOwner","lightenColor","isPlayerTerritory","drawPlayerTerritoryOutline","this.drawPlayerTerritoryOutline(c,m,visibleCells)","c.setLineDash("])if(!view.includes(feature))throw new Error(`地图缺少我方疆界描边：${feature}`);
if(!/owner\.distance<this\.territoryRadius/.test(view))throw new Error("势力归属没有复用统一的疆域半径");
const outlineCall=view.indexOf("this.drawPlayerTerritoryOutline(c,m,visibleCells)"),hoverCall=view.indexOf("strokeRect(hx+1,hy+1");
if(!(outlineCall>=0&&hoverCall>outlineCall))throw new Error("悬停光标框必须在我方疆界描边之后绘制，避免被描边遮盖");
console.log("我方疆界描边通过：归属与政治层同源 / 边界段数 / 细虚线双描边与提亮势力色 / 海面排除 / 观察模式与图例隐藏 / 全图层标示 / 悬停光标框不被遮盖");
