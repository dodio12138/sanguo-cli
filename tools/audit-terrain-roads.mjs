// 只读核对：陆路类型与沿线地形是否相称、据点是否落在山地/高原格。不写任何文件。
// 用法：node tools/audit-terrain-roads.mjs
import fs from "node:fs";
globalThis.window=globalThis;await import("../js/core/map-grid.js");
const read=path=>JSON.parse(fs.readFileSync(new URL(`../${path}`,import.meta.url),"utf8"));
const map=read("game/data/map/central_plains.json"),net=read("game/data/map/route_network.json"),cities=read("game/data/history/cities/200_guandu.json").cities,terrains=read("game/data/common/terrain.json").terrains;
const {width,height}=MapGrid.dimensions(map),T=MapGrid.decode(map.terrain,width*height),byId=new Map(cities.map(city=>[city.id,city])),name=id=>byId.get(id)?.name||id,label=t=>terrains[t]?.name||t;
const roads=new Map((map.roads||[]).map(road=>[[road.from,road.to].sort().join("|"),road])),findings=[];
for(const route of net.routes){const kind=net.kinds[route.kind];if(kind?.mode!=="land")continue;const road=roads.get([route.a,route.b].sort().join("|")),inner=(road?MapGrid.decodeRoadPath(road):[]).slice(1,-1);if(inner.length<3)continue;
  const count={};for(const [x,y] of inner){const t=T[y*width+x];count[t]=(count[t]||0)+1}const share=list=>list.reduce((sum,t)=>sum+(count[t]||0),0)/inner.length;
  let issue=null;if(["post","road","ford"].includes(route.kind)&&share(["mountain"])>=.4)issue=`${kind.name}穿山地`;else if(route.kind==="mountain"&&share(["plains","basin","highland","grassland","desert"])>=.8)issue="山道走平地";else if(route.kind==="plank"&&share(["plains","basin","highland","grassland","desert"])>=.6)issue="栈道走平地";
  if(issue)findings.push(`[${issue}] ${name(route.a)}—${name(route.b)} ${route.name||""}（${Object.entries(count).sort((a,b)=>b[1]-a[1]).map(([t,n])=>label(t)+n).join(" ")}）`)}
const rough=cities.filter(city=>MapGrid.nodeKind?.(city)!=="pass"&&city.type!=="pass"&&T[city.y*width+city.x]==="mountain").map(city=>city.name);
console.log(`陆路存疑 ${findings.length} 条${findings.length?"：\n"+findings.join("\n"):""}`);
console.log(`据点落在山地格 ${rough.length} 处${rough.length?"："+rough.join("、"):""}`);
