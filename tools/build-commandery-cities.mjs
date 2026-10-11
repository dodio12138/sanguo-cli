import fs from "node:fs";

const read=path=>JSON.parse(fs.readFileSync(path,"utf8"));
const write=(path,value)=>fs.writeFileSync(path,`${JSON.stringify(value,null,2)}\n`);
const divisionsPath="game/data/history/administrative_divisions.json";
const citiesPath="game/data/history/cities/200_guandu.json";
const profilesPath="game/data/history/city_resource_profiles.json";
const rulesPath="game/data/common/game_rules.json";
const mapPath="game/data/map/central_plains.json";
const offlineText=fs.readFileSync("js/data/offline-data.generated.js","utf8"),offlineStart=offlineText.indexOf("window.SANGUO_DATA=Object.assign(window.SANGUO_DATA||{},")+"window.SANGUO_DATA=Object.assign(window.SANGUO_DATA||{},".length,offlineEnd=offlineText.lastIndexOf(");"),embedded=JSON.parse(offlineText.slice(offlineStart,offlineEnd));
const divisions=read(divisionsPath),cityFile=read(citiesPath),profiles=read(profilesPath),rules=read(rulesPath),map=read(mapPath);
rules.city_graph=structuredClone(embedded.rules.city_graph);
const cityById=new Map();for(const city of [...(embedded.cities||[]),...cityFile.cities])if(!city.id.startsWith("commandery_city_"))cityById.set(city.id,city);
const baseCities=[...cityById.values()],seats=map.commanderySeats||divisions.commandery_seats_140;
if(!Array.isArray(seats)||seats.length!==105)throw new Error(`预期105个郡国治所，实际${seats?.length||0}`);
const normalize=value=>String(value||"").replace(/雒/gu,"洛").replace(/^武威$/u,"姑臧").replace(/[縣县郡城]$/u,"").trim();
const land=map.grid?.terrain||map.terrain;
const height=map.grid?.height||map.height,width=map.grid?.width||map.width;
const terrain=Array.isArray(land)?land:decodeRle(land,width*height);
const blocked=new Set(baseCities.map(city=>`${city.x},${city.y}`)),claimed=new Set(),nodes=[],movementAnchors=[...baseCities];
const matchingCity=seat=>baseCities.find(city=>normalize(city.name)===normalize(seat.seat));
const findOpen=(x,y)=>{
  const candidates=[];
  for(let radius=0;radius<=6;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
    if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;
    const nx=x+dx,ny=y+dy,key=`${nx},${ny}`;
    if(nx<0||ny<0||nx>=width||ny>=height||terrain[ny*width+nx]==="ocean"||blocked.has(key)||claimed.has(key))continue;
    candidates.push({x:nx,y:ny,distance:dx*dx+dy*dy});
  }
  return candidates.sort((a,b)=>a.distance-b.distance||a.y-b.y||a.x-b.x)[0]||null;
};
const roots=new Map();
for(const root of divisions.county_seats||[])if(root.rank==="commandery"||root.capital)roots.set(root.commandery,root);
const resourceRegion=province=>({司隶:"central",豫州:"central",兖州:"central",冀州:"north",青州:"north",徐州:"xuzhou",荆州:"jingzhou",扬州:"jiangdong",益州:"yizhou",凉州:"northwest",并州:"north",幽州:"liaodong",交州:"other"})[province]||"other";
for(const [index,seat] of seats.entries()){
  const legacy=matchingCity(seat);
  if(legacy){
    legacy.commanderySeatNode=true;legacy.commanderySeatId=seat.id;legacy.commandery=seat.name;legacy.commanderySeatName=seat.seat;
    seat.cityId=legacy.id;seat.x=legacy.x;seat.y=legacy.y;continue;
  }
  const point=findOpen(seat.x,seat.y);
  if(!point)throw new Error(`治所周边找不到可用城市网格：${seat.name}`);
  claimed.add(`${point.x},${point.y}`);
  if(point.x!==seat.x||point.y!==seat.y){seat.coordinateQuality="approximate-nearby-open-cell";seat.coordinateSource="为避免节点重叠，按原治所估点就近落格"}
  seat.x=point.x;seat.y=point.y;
  const id=`commandery_city_${String(index+1).padStart(3,"0")}`;
  const root=roots.get(seat.name),city={id,name:seat.seat,type:"city",x:point.x,y:point.y,force:"neutral",province:seat.province,population:Math.max(8000,Math.round(((root?.historicalPopulation||180000)/12)/1000)*1000),garrison:2500,governor:"—",level:1,commerce:30,agriculture:38,order:54,commandery:seat.name,commanderySeatNode:true,commanderySeatId:seat.id,commanderySeatName:seat.seat};
  const reference=profiles.population_reference,census=reference?.records?.[reference.aliases?.[seat.name]||seat.name];
  if(!census)throw new Error(`${seat.name}缺少人口基准，请先同步人口数据`);
  nodes.push(city);seat.cityId=id;profiles.historical_basis[id]=[seat.name,census[0],census[1],resourceRegion(seat.province)];
  const nearest=movementAnchors.reduce((best,item)=>!best||Math.hypot(item.x-city.x,item.y-city.y)<Math.hypot(best.x-city.x,best.y-city.y)?item:best,null);
  rules.city_graph[city.id]=[nearest.id];rules.city_graph[nearest.id]??=[];if(!rules.city_graph[nearest.id].includes(city.id))rules.city_graph[nearest.id].push(city.id);movementAnchors.push(city);
}
for(const city of baseCities)if(city.commanderySeatNode){const basis=profiles.historical_basis[city.id];if(basis)basis[0]=city.commandery}
cityFile.cities=[...baseCities,...nodes];
const cityIds=new Set(cityFile.cities.map(city=>city.id));
for(const [id,neighbors] of Object.entries(rules.city_graph||{}))rules.city_graph[id]=neighbors.filter(other=>cityIds.has(other));
for(const [id,neighbors] of Object.entries(rules.city_graph||{}))for(const other of neighbors){rules.city_graph[other]??=[];if(!rules.city_graph[other].includes(id))rules.city_graph[other].push(id)}
for(const city of nodes){
  const parent=baseCities.concat(nodes).find(item=>item.id===(rules.city_graph[city.id]||[])[0]);
  city.force=parent?.force||"neutral";
}
divisions.commandery_seats_140=seats;
map.commanderySeats=seats;
write(divisionsPath,divisions);write(citiesPath,cityFile);write(profilesPath,profiles);write(rulesPath,rules);write(mapPath,map);
await import("./build-population-basis.mjs");
console.log(`已将105个郡国治所接入可操作城池：沿用${seats.length-nodes.length}个同址既有城市，新增${nodes.length}座治所城；当前城池总数${cityFile.cities.length}。`);

function decodeRle(encoded,size){
  const result=[];for(const token of String(encoded||"").split(",")){const match=token.match(/^(.*?)(?:\*(\d+))?$/);if(!match)continue;const value=match[1],count=Number(match[2]||1);for(let index=0;index<count&&result.length<size;index++)result.push(value||null)}
  while(result.length<size)result.push(null);return result;
}
