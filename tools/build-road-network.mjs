import fs from "node:fs";

globalThis.window=globalThis;
await import("../js/core/map-grid.js");

const read=path=>JSON.parse(fs.readFileSync(path,"utf8"));
const mapPath="game/data/map/central_plains.json";
const map=read(mapPath),cities=read("game/data/history/cities/200_guandu.json").cities;
const divisions=read("game/data/history/administrative_divisions.json"),counties=divisions.county_seats;
const graph=read("game/data/common/game_rules.json").city_graph;
const runtimeMap={...map.grid,...map};
const width=runtimeMap.width,height=runtimeMap.height,size=width*height;
const terrain=window.MapGrid.decode(runtimeMap.terrain,size),seatRoots=counties.filter(seat=>seat.rank==="commandery"||seat.capital),rootAliases={"渤海郡":"勃海郡","京兆尹":"京兆尹及三辅"},claimed=new Set(),commanderySeats=[];
const nearestOpenCell=(x,y)=>{const candidates=[];for(let radius=0;radius<=3;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height||terrain[ny*width+nx]==="ocean"||claimed.has(`${nx},${ny}`))continue;candidates.push({x:nx,y:ny,distance:dx*dx+dy*dy})}return candidates.sort((a,b)=>a.distance-b.distance||a.y-b.y||a.x-b.x)[0]||null};
for(const [index,unit] of divisions.commandery_seats_140.entries()){
  const city=cities.find(item=>item.id===unit.cityId),root=seatRoots.find(item=>item.commandery===unit.name||item.commandery===rootAliases[unit.name]),source=city?"可操作城池节点":root?"县治网格主治所":unit.coordinateSource||"史地位置按本图战略节点校准";
  let point=city?{x:city.x,y:city.y}:root?{x:root.x,y:root.y}:Number.isInteger(unit.x)&&Number.isInteger(unit.y)?{x:unit.x,y:unit.y}:divisions.commandery_seat_grid_140?.[unit.name];
  if(!point)throw new Error(`缺少郡国治所网格定位：${unit.name}`);
  let placed=nearestOpenCell(point.x,point.y);if(!placed)throw new Error(`治所附近无可用陆地格：${unit.name}`);
  claimed.add(`${placed.x},${placed.y}`);
  commanderySeats.push({...unit,id:`commandery_seat_${String(index+1).padStart(3,"0")}`,x:placed.x,y:placed.y,coordinateQuality:city?"interactive-city-node":root?"existing-county-seat":unit.coordinateQuality||"approximate-on-strategic-grid",coordinateSource:source});
}
runtimeMap.commanderySeats=commanderySeats;
const terrainLayer=window.MapGrid.decode(runtimeMap.terrain,size),provinces=window.MapGrid.blank(width,height,null),commanderies=window.MapGrid.blank(width,height,null);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const index=y*width+x;if(terrainLayer[index]==="ocean")continue;
  let best=null,bestDistance=Infinity;
  for(const seat of commanderySeats){const distance=(seat.x-x)**2+(seat.y-y)**2;if(distance<bestDistance){bestDistance=distance;best=seat}}
  provinces[index]=best?.province||null;commanderies[index]=best?.name||null;
}
map.provinces=window.MapGrid.encode(provinces);map.commanderies=window.MapGrid.encode(commanderies);map.commanderySeats=commanderySeats;runtimeMap.provinces=map.provinces;runtimeMap.commanderies=map.commanderies;
const historicalCorridors=[
  ["changan","tongguan","hongnong","luoyang","hangu","hulao","henei"],
  ["luoyang","henei","puyang","yanjin","baima","chenliu","qiao","xuchang"],
  ["jinyang","daixian","ji","beiping","xiangping"],
  ["ye","nanpi","pingyuan","linzi","beihai","langya","xiapi"],
  ["luoyang","wan","xinye","xiangyang","jiangling","yiling"],
  ["hanzhong","zitong","jianmen","chengdu","jiangzhou","yongan","yiling"],
  ["xuchang","qiao","shouchun","hefei","jianye","wu","kuaiji","jianan"],
  ["xiangyang","xiakou","chaisang","jianye"],
  ["changsha","wuling","jiangling"],
  ["guiyang","cangwu","panyu"],
  ["beiping","xiangping","lelang"]
];
const curatedGraph={};for(const corridor of historicalCorridors)for(let index=1;index<corridor.length;index++){const from=corridor[index-1],to=corridor[index];if(!graph[from]?.includes(to))throw new Error(`历史干线缺少相邻交通节点：${from}—${to}`);curatedGraph[from]??=[];curatedGraph[to]??=[];curatedGraph[from].push(to);curatedGraph[to].push(from)}
const roadMap={...runtimeMap,commanderySeats:[]};
map.roads=window.MapGrid.serializeRoadNetwork(window.MapGrid.generateRoadNetwork(roadMap,cities,[],curatedGraph));
divisions.commandery_seats_140=commanderySeats;delete divisions.commandery_seat_grid_140;
fs.writeFileSync("game/data/history/administrative_divisions.json",`${JSON.stringify(divisions,null,2)}\n`);
fs.writeFileSync(mapPath,`${JSON.stringify(map,null,2)}\n`);
console.log(`已写入${commanderySeats.length}个可操作郡治节点与历史干线：${map.roads.length}段道路`);
