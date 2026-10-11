import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const bitmap=fs.readFileSync(path.join(root,"game/data/map/00_bit.bmp"));
const bitmapWidth=bitmap.readInt32LE(18),bitmapHeight=Math.abs(bitmap.readInt32LE(22)),pixelOffset=bitmap.readUInt32LE(10),rowStride=Math.ceil(bitmapWidth/32)*4;
if(bitmapWidth!==30||bitmapHeight!==30||bitmap.readUInt16LE(28)!==1||bitmap.readUInt32LE(30)!==0)throw new Error("县治网格生成需要未压缩 30×30 单色位图");

const adminPath="game/data/history/administrative_divisions.json";
const admin=JSON.parse(fs.readFileSync(adminPath,"utf8"));
const cities=JSON.parse(fs.readFileSync("game/data/history/cities/200_guandu.json","utf8")).cities;
const profiles=JSON.parse(fs.readFileSync("game/data/history/city_resource_profiles.json","utf8"));
const width=60,height=60;

for(const city of cities)city.commandery=profiles.historical_basis?.[city.id]?.[0]||"史籍未详";
const isLand=(x,y)=>{if(x<0||y<0||x>=width||y>=height)return false;const imageX=Math.floor(x/2),imageY=bitmapHeight-1-Math.floor(y/2),bit=(bitmap[pixelOffset+imageY*rowStride+(imageX>>3)]>>(7-(imageX&7)))&1;return bit===1};
const normalize=name=>String(name||"").replace(/[縣县郡國国城關关津口]$/u,"").replace("雒","洛");
const commanderies=Object.keys(admin.commandery_counties),cityGroups=new Map(commanderies.map(name=>[name,cities.filter(city=>city.commandery===name)]));
const usedCities=new Set,occupied=new Set(cities.map(city=>`${city.x},${city.y}`)),seats=[],pending=new Map;

for(const [commandery,counties] of Object.entries(admin.commandery_counties)){
  const localCities=cityGroups.get(commandery)||[],remaining=[];
  counties.forEach((name,index)=>{
    const aliasCity=localCities.find(city=>!usedCities.has(city.id)&&admin.city_county_aliases?.[city.id]===name);
    const exactCity=localCities.find(city=>!usedCities.has(city.id)&&normalize(city.name)===normalize(name));
    const city=aliasCity||exactCity;
    const seat={id:`county_${String(commanderies.indexOf(commandery)+1).padStart(2,"0")}_${String(index+1).padStart(2,"0")}`,name,commandery,capital:index===0};
    if(city){Object.assign(seat,{x:city.x,y:city.y,cityId:city.id});usedCities.add(city.id);seats.push(seat)}else remaining.push(seat);
  });
  pending.set(commandery,remaining);
}

const anchors=new Map(commanderies.map(name=>{
  const points=(cityGroups.get(name)||[]).map(city=>({x:city.x,y:city.y}));
  return [name,points];
}));
const distanceTo=(name,x,y)=>Math.min(...(anchors.get(name)||[]).map(point=>Math.hypot(point.x-x,point.y-y)));
const ownerAt=(x,y)=>commanderies.map(name=>({name,distance:distanceTo(name,x,y)})).sort((a,b)=>a.distance-b.distance||commanderies.indexOf(a.name)-commanderies.indexOf(b.name))[0]?.name;
const allCells=[];for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(isLand(x,y))allCells.push({x,y,owner:ownerAt(x,y)});
const maxPending=Math.max(...[...pending.values()].map(list=>list.length));
for(let round=0;round<maxPending;round++)for(const commandery of commanderies){
  const seat=pending.get(commandery)?.[round];if(!seat)continue;
  const local=seats.filter(item=>item.commandery===commandery),points=anchors.get(commandery)||[],center=points.reduce((sum,p)=>({x:sum.x+p.x/points.length,y:sum.y+p.y/points.length}),{x:0,y:0});
  const choices=allCells.filter(cell=>!occupied.has(`${cell.x},${cell.y}`)).map(cell=>{
    const near=distanceTo(commandery,cell.x,cell.y),spread=local.reduce((score,item)=>score+Math.max(0,2-Math.hypot(item.x-cell.x,item.y-cell.y))*3,0),foreign=cell.owner===commandery?0:55;
    return {...cell,score:foreign+near*10+Math.hypot(center.x-cell.x,center.y-cell.y)+spread};
  }).sort((a,b)=>a.score-b.score||a.y-b.y||a.x-b.x);
  const chosen=choices[0];if(!chosen)throw new Error(`${commandery}的${seat.name}没有可用网格`);
  Object.assign(seat,{x:chosen.x,y:chosen.y});occupied.add(`${chosen.x},${chosen.y}`);seats.push(seat);
}

for(const seat of seats){
  const localCities=cityGroups.get(seat.commandery)||[],linked=seat.cityId&&cities.find(city=>city.id===seat.cityId),administrativeCities=localCities.filter(city=>(city.type||"city")==="city"),candidates=administrativeCities.length?administrativeCities:localCities,nearest=candidates.map(city=>({city,distance:Math.hypot(city.x-seat.x,city.y-seat.y)})).sort((a,b)=>a.distance-b.distance)[0]?.city,linkedAdministrative=(linked?.type||"city")==="city"?linked:null;
  seat.province=linked?.province||nearest?.province||"州域未详";seat.jurisdictionCityId=(linkedAdministrative||nearest)?.id||null;
}
seats.sort((a,b)=>commanderies.indexOf(a.commandery)-commanderies.indexOf(b.commandery)||admin.commandery_counties[a.commandery].indexOf(a.name)-admin.commandery_counties[b.commandery].indexOf(b.name));
for(const commandery of commanderies){
  const local=seats.filter(seat=>seat.commandery===commandery),basis=Object.values(profiles.historical_basis||{}).find(row=>row[0]===commandery);
  if(!basis)throw new Error(`${commandery}缺少史籍人口依据`);
  const censusYear=Number(basis[1]),censusPopulation=Number(basis[2]),weights=local.map((seat,index)=>seat.capital?2.2:seat.cityId?1.65:index===1&&local.length>=5?1.35:1),weightTotal=weights.reduce((sum,value)=>sum+value,0);
  let assigned=0;local.forEach((seat,index)=>{seat.rank=seat.capital?"commandery":seat.cityId||index===1&&local.length>=5?"major":"county";seat.censusYear=censusYear;seat.historicalPopulation=index===local.length-1?censusPopulation-assigned:Math.round(censusPopulation*weights[index]/weightTotal);assigned+=seat.historicalPopulation});
  if(local.reduce((sum,seat)=>sum+seat.historicalPopulation,0)!==censusPopulation)throw new Error(`${commandery}人口拆分不守恒`);
}
if(seats.length!==Object.values(admin.commandery_counties).flat().length)throw new Error("县治数量与郡县表不一致");
const seatCells=new Set;for(const seat of seats){const key=`${seat.x},${seat.y}`;if(seatCells.has(key))throw new Error(`县治网格重叠：${key}`);seatCells.add(key);if(!isLand(seat.x,seat.y))throw new Error(`县治落入非陆地：${seat.name}`);if(seat.cityId){const city=cities.find(item=>item.id===seat.cityId);if(!city||city.x!==seat.x||city.y!==seat.y||city.commandery!==seat.commandery)throw new Error(`县治与既有据点不一致：${seat.name}`)}}
admin.county_seats=seats;
fs.writeFileSync(adminPath,`${JSON.stringify(admin,null,2)}\n`);
console.log(`县治网格已生成：${commanderies.length} 郡国 / ${seats.length} 县 / ${seats.filter(seat=>seat.cityId).length} 处复用现有据点 / ${seats.length-seatCells.size} 处重叠`);
