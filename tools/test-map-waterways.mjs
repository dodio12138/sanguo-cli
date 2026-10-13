import assert from "node:assert/strict";
globalThis.window=globalThis;
await import("../js/core/map-grid.js");
await import("../js/ui/map-view.js");
const view=Object.create(MapView.prototype);view.waterways=[{name:"校验河",points:[[1,2],[4,3],[5,7]]}];
const geometry=[];let strokes=0;
const context={beginPath(){},moveTo:(...point)=>geometry.push(["move",...point]),lineTo:(...point)=>geometry.push(["line",...point]),stroke:()=>strokes++,fillText(){}};
view.drawWaterways(context,{startX:10,startY:20,cell:10});
assert.deepEqual(geometry,[["move",25,45],["line",55,55],["line",65,95]],"游戏内河流须按编辑器的网格中心与控制点直接绘制，不能改成另一条折线路径");
assert.equal(strokes,2,"保留原有河流深色底线和蓝色线条");
view.waterways=[];geometry.length=0;strokes=0;view.drawWaterways(context,{startX:0,startY:0,cell:10});assert.equal(strokes,0);assert.equal(geometry.length,0,"清空后不能重新出现默认河流");
console.log("河流显示通过：编辑器与游戏坐标一致 / 控制点走向一致 / 空图层无默认回填");
view.state={data:{map:{waterways:[{name:"新存档河",points:[[2,2],[4,4]]}],landmarks:[{name:"新地标",x:3,y:3}]}}};view.syncRoads=()=>{};view.makeCells=()=>[];view.rebuildDerivedMapData=()=>{};view.draw=()=>{};
view.refreshSupply();assert.deepEqual(view.waterways,view.state.data.map.waterways);assert.deepEqual(view.landmarks,view.state.data.map.landmarks);
view.state.data.map={waterways:[],landmarks:[]};view.refreshSupply();assert.deepEqual(view.waterways,[]);assert.deepEqual(view.landmarks,[]);
console.log("读档显示通过：河流 / 地标缓存全部刷新 / 空图层不残留");

// 角点河流：控制点落在格子角上，沿格线展开，规则层按“隔河”计算过河成本。
const corner={name:"格线河",anchor:"corner",points:[[1,1],[4,1],[4,3]]};
assert.deepEqual(MapGrid.riverCorners(corner),[[1,1],[2,1],[3,1],[4,1],[4,2],[4,3]],"角点河流须沿格线逐段展开");
assert.deepEqual(MapGrid.riverCorners({name:"斜画河",anchor:"corner",points:[[0,0],[2,1]]}).every((point,index,list)=>!index||Math.abs(point[0]-list[index-1][0])+Math.abs(point[1]-list[index-1][1])===1),true,"斜向控制点之间须补成台阶");
view.waterways=[corner];geometry.length=0;strokes=0;view.drawWaterways(context,{startX:10,startY:20,cell:10});
assert.deepEqual(geometry.slice(0,2),[["move",20,30],["line",30,30]],"角点河流须画在格线上，不能偏移半格");
const crossings=MapGrid.riverCrossings({width:6,height:6,waterways:[corner]});
assert(crossings.has(`${0*6+1}|${1*6+1}`),"横向河段须隔开上下两格");assert(crossings.has(`${2*6+3}|${2*6+4}`),"纵向河段须隔开左右两格");
const resized=MapGrid.resizeSource({map:{width:50,height:50,waterways:[{name:"扩格河",anchor:"corner",points:[[0,0],[50,25]]}],landmarks:[],roads:[]},cities:[],counties:[]},100,100);
assert.deepEqual(resized.map.waterways[0].points,[[0,0],[100,50]],"扩格时角点按比例换算");

const fs=await import("node:fs");
const base=JSON.parse(fs.readFileSync(new URL("../game/data/map/central_plains.json",import.meta.url),"utf8")),{width,height}=MapGrid.dimensions(base),layers=MapGrid.layers(base);
const ocean=(x,y)=>x<0||y<0||x>=width||y>=height||layers.terrain[y*width+x]==="ocean",paths=new Map();
for(const river of base.waterways){
  assert.equal(river.anchor,"corner",`${river.name}须为沿格线河流`);
  const path=MapGrid.riverCorners(river);paths.set(river.name,path);
  for(const [x,y] of path)assert(x>=0&&y>=0&&x<=width&&y<=height,`${river.name}越出地图`);
  for(let i=1;i<path.length;i++){const [[ax,ay],[bx,by]]=MapGrid.riverEdgeCells(path[i-1],path[i]);assert(!(ocean(ax,ay)&&ocean(bx,by)),`${river.name}不能在海面上延伸`)}
}
const owners=new Map();for(const [name,path] of paths)for(const point of path){const key=point.join(",");if(!owners.has(key))owners.set(key,new Set());owners.get(key).add(name)}
for(const [name,path] of paths){
  const end=path.at(-1).join(","),touching=[...owners.get(end)].filter(other=>other!==name);
  const mouth=[[0,0],[-1,0],[0,-1],[-1,-1]].some(([dx,dy])=>ocean(path.at(-1)[0]+dx,path.at(-1)[1]+dy));
  assert(mouth||touching.length,`${name}须入海或汇入其他河流`);
  for(const point of path.slice(1,-1)){const key=point.join(","),others=[...owners.get(key)].filter(other=>other!==name&&paths.get(other).at(-1).join(",")!==key&&paths.get(other)[0].join(",")!==key);assert.equal(others.length,0,`${name}与${others[0]}在${point}交叉`)}
}
console.log(`格线河流通过：${paths.size} 条河沿格边展开 / 不入海面 / 无交叉 / 支流汇入干流 / 分流自干流分出 / 扩格换算 / 隔河成本`);
