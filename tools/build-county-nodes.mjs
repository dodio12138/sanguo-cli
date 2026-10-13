// 把尚无据点的县治升为可驻军的县邑据点（普通县）：写入 200_guandu.json 城池、route_network.json 县道与县治 cityId。
// 不改地形、郡界、河流；归属在载入剧本时继承本郡治所。重复运行只补缺，不重建已有县邑。
import fs from "node:fs";
globalThis.window=globalThis;
await import("../js/core/map-grid.js");
const read=path=>JSON.parse(fs.readFileSync(path,"utf8")),write=(path,data)=>fs.writeFileSync(path,`${JSON.stringify(data,null,2)}\n`);
const citiesPath="game/data/history/cities/200_guandu.json",divisionsPath="game/data/history/administrative_divisions.json",networkPath="game/data/map/route_network.json",mapPath="game/data/map/central_plains.json";
const cityFile=read(citiesPath),divisions=read(divisionsPath),network=read(networkPath),source=read(mapPath),map={...source.grid,...source};
const cities=cityFile.cities,counties=divisions.county_seats,{width,height}=MapGrid.dimensions(map),terrain=MapGrid.decode(map.terrain,width*height);
const matched=MapGrid.assignCountyJurisdiction(structuredClone(counties),cities,divisions),seatOf=commandery=>cities.find(city=>city.commandery===commandery&&city.commanderySeatNode)||cities.find(city=>city.commandery===commandery&&MapGrid.nodeKind(city)==="city");
const created=[];
counties.forEach((county,index)=>{if(matched[index].ownCityId)return;if(terrain[county.y*width+county.x]==="ocean")throw new Error(`县治落在海格：${county.name}`);const seat=seatOf(county.commandery),base=county.historicalPopulation||5000,population=Math.max(500,Math.round(base*.32*.12/100)*100),garrison=Math.max(300,Math.min(1500,Math.round(population*.08/100)*100)),id=`xian_${county.id.replace(/^county_/,"")}`;
  const city={id,name:county.name,type:"city",x:county.x,y:county.y,force:"neutral",province:county.province,population,garrison,governor:"—",level:1,commerce:Math.max(10,(seat?.commerce||30)-6),agriculture:Math.max(10,(seat?.agriculture||36)-2),order:Math.max(20,(seat?.order||55)-4),commandery:county.commandery,countyNode:true,countyId:county.id,coordinateQuality:county.coordinateQuality||"county-seat-grid"};
  cities.push(city);county.cityId=id;created.push(city)});
// 每郡以已有据点为根，按最近距离逐个接入新县邑（Prim），保证全郡连通且不跨越远距离；山地、高原用山道。
const rough=(a,b)=>{const x=Math.round((a.x+b.x)/2),y=Math.round((a.y+b.y)/2);return ["mountain","plateau"].includes(terrain[y*width+x])||["mountain","plateau"].includes(terrain[b.y*width+b.x])},exists=new Set(network.routes.map(route=>[route.a,route.b].sort().join(":")));
for(const commandery of [...new Set(created.map(city=>city.commandery))]){const pending=created.filter(city=>city.commandery===commandery),tree=cities.filter(city=>city.commandery===commandery&&!pending.includes(city));if(!tree.length){const nearest=cities.filter(city=>!pending.includes(city)).sort((a,b)=>Math.hypot(a.x-pending[0].x,a.y-pending[0].y)-Math.hypot(b.x-pending[0].x,b.y-pending[0].y))[0];tree.push(nearest)}
  while(pending.length){let best=null;for(const city of pending)for(const node of tree){const distance=Math.hypot(city.x-node.x,city.y-node.y);if(!best||distance<best.distance)best={city,node,distance}}
    const key=[best.city.id,best.node.id].sort().join(":");if(!exists.has(key)){network.routes.push({a:best.node.id,b:best.city.id,kind:rough(best.node,best.city)?"mountain":"road",name:`${commandery}县道`});exists.add(key)}tree.push(best.city);pending.splice(pending.indexOf(best.city),1)}}
// 县邑沿用本郡治所的史籍基准（整郡户口与资源区），不另立郡级数字。
const profilesPath="game/data/history/city_resource_profiles.json",profiles=read(profilesPath);let basisAdded=0;
for(const city of cities.filter(item=>item.countyNode&&!profiles.historical_basis[item.id])){const seat=seatOf(city.commandery),basis=profiles.historical_basis[seat?.id];if(basis){profiles.historical_basis[city.id]=[...basis];basisAdded++}}
write(citiesPath,cityFile);write(divisionsPath,divisions);write(networkPath,network);if(basisAdded)write(profilesPath,profiles);
console.log(`补史籍基准 ${basisAdded} 条；新增县邑据点 ${created.length} 个，现共 ${cities.length} 个据点；新增县道 ${created.length} 段`);
