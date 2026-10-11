import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

globalThis.window=globalThis;
await import("../js/core/map-grid.js");

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=relative=>JSON.parse(fs.readFileSync(path.join(root,relative),"utf8"));
const write=(relative,value)=>fs.writeFileSync(path.join(root,relative),`${JSON.stringify(value,null,2)}\n`);
const image=fs.readFileSync(path.join(root,"game/data/map/00_bit.bmp"));
if(image.toString("ascii",0,2)!=="BM"||image.readUInt16LE(28)!==1||image.readUInt32LE(30)!==0)throw new Error("00_bit.bmp 必须是未压缩的 1 位 BMP");
const sourceWidth=image.readInt32LE(18),sourceHeight=Math.abs(image.readInt32LE(22)),pixelOffset=image.readUInt32LE(10),rowStride=Math.ceil(sourceWidth/32)*4;
if(sourceWidth!==30||sourceHeight!==30)throw new Error(`位图尺寸应为 30×30，实际 ${sourceWidth}×${sourceHeight}`);
const paletteOffset=14+image.readUInt32LE(14),white=image.subarray(paletteOffset,paletteOffset+3),black=image.subarray(paletteOffset+4,paletteOffset+7);
if(!white.every(channel=>channel===255)||!black.every(channel=>channel===0))throw new Error("00_bit.bmp 必须按白色水域、黑色陆地的调色板解释");
const sourceBit=(x,y)=>{const row=image.readInt32LE(22)>0?sourceHeight-1-y:y,byte=image[pixelOffset+row*rowStride+(x>>3)];return(byte>>(7-(x&7)))&1};
const oldWidth=40,oldHeight=32,scale=2,width=sourceWidth*scale,height=sourceHeight*scale,mapId="china_pixel_60x60";
const mapPath="game/data/map/central_plains.json",map=read(mapPath);
if(map.grid.width!==oldWidth||map.grid.height!==oldHeight)throw new Error(`预期旧地图为 ${oldWidth}×${oldHeight}；若已迁移，无需重复执行。`);
const cityPath="game/data/history/cities/200_guandu.json",cityData=read(cityPath),divisionsPath="game/data/history/administrative_divisions.json",divisions=read(divisionsPath),cities=cityData.cities,counties=divisions.county_seats||[];
const point=(x,y)=>({x:Math.max(0,Math.min(width-1,Math.round((x+.5)*width/oldWidth-.5))),y:Math.max(0,Math.min(height-1,Math.round((y+.5)*height/oldHeight-.5)))});
const oldTerrain=MapGrid.defaultTerrain(oldWidth,oldHeight),terrain=[],provinces=[],pixelMask=[];
const seaNames=["渤海","黄海","东海","南海"];
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const bit=sourceBit(Math.floor(x/scale),Math.floor(y/scale)),land=bit===1,oldX=Math.min(oldWidth-1,Math.floor((x+.5)*oldWidth/width)),oldY=Math.min(oldHeight-1,Math.floor((y+.5)*oldHeight/height));
  pixelMask.push(land?"land":"sea");
  if(!land){terrain.push("ocean");provinces.push(MapGrid.provinceAt(oldWidth-1,oldY));continue}
  const landX=Math.min(oldX,MapGrid.LAND_SPANS[oldY]?.[1]??oldWidth-1),oldCell=oldY*oldWidth+landX;
  terrain.push(oldTerrain[oldCell]==="ocean"?"plains":oldTerrain[oldCell]);
  const province=MapGrid.provinceAt(landX,oldY);provinces.push(seaNames.includes(province)||province==="域外"?"豫州":province);
}
const isLand=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&pixelMask[y*width+x]==="land";
const nearestLand=(origin,reserved=new Set)=>{
  const choices=[];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++)if(isLand(x,y)&&!reserved.has(`${x},${y}`))choices.push({x,y,distance:Math.abs(x-origin.x)+Math.abs(y-origin.y)});
  choices.sort((a,b)=>a.distance-b.distance||a.y-b.y||a.x-b.x);
  if(!choices.length)throw new Error("位图陆地区域不足，无法安置全部据点");
  return {x:choices[0].x,y:choices[0].y};
};
for(const record of cities){const next=point(record.x,record.y);record.x=next.x;record.y=next.y}
const cityCells=new Set;
for(const city of cities){let key=`${city.x},${city.y}`;if(!isLand(city.x,city.y)){const next=nearestLand(city,cityCells);city.x=next.x;city.y=next.y;key=`${city.x},${city.y}`}if(cityCells.has(key))throw new Error(`据点坐标重叠：${key}`);cityCells.add(key)}
const cityById=new Map(cities.map(city=>[city.id,city])),countyCells=new Set;
for(const county of counties){
  const linked=county.cityId?cityById.get(county.cityId):null;
  let next=linked?{x:linked.x,y:linked.y}:point(county.x,county.y),key=`${next.x},${next.y}`;
  if(!isLand(next.x,next.y)||countyCells.has(key)&&!linked){const reserved=new Set([...cityCells,...countyCells]);if(linked)reserved.delete(key);next=nearestLand(next,reserved);key=`${next.x},${next.y}`;if(linked){linked.x=next.x;linked.y=next.y;cityCells.add(key)}}
  if(countyCells.has(key))throw new Error(`县治坐标重叠：${county.name} ${key}`);
  county.x=next.x;county.y=next.y;countyCells.add(key);
}
for(const city of cities)if(counties.some(county=>county.cityId===city.id)){const seat=counties.find(county=>county.cityId===city.id);city.x=seat.x;city.y=seat.y}
const sourcePoints=points=>points.map(([x,y])=>{const next=point(x,y);return[next.x,next.y]});
const waterways=structuredClone(MapGrid.DEFAULT_WATERWAYS).map(river=>({...river,points:sourcePoints(river.points)}));
const landmarks=structuredClone(MapGrid.DEFAULT_LANDMARKS).map(item=>({...item,...point(item.x,item.y)}));
const commanderies=[];
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  if(terrain[y*width+x]==="ocean"){commanderies.push(null);continue}
  commanderies.push(MapGrid.nearestSeat(x,y,counties)?.commandery||"史籍未详");
}
map.id=mapId;
map.grid={...map.grid,width,height};
map.projection_note="按用户提供的 30×30 单色地图逐像素放大 2 倍为 60×60 网格；城市与县治从原战略网格等比例迁移并贴合陆地区域。";
map.reference_image="00_bit.bmp";
map.pixel_scale=scale;
map.pixel_mask=MapGrid.encode(pixelMask);
map.terrain=MapGrid.encode(terrain);
map.provinces=MapGrid.encode(provinces);
map.commanderies=MapGrid.encode(commanderies);
map.waterways=waterways;
map.landmarks=landmarks;
write(mapPath,map);write(cityPath,cityData);write(divisionsPath,divisions);
for(const id of ["190_coalition","200_guandu","208_red_cliffs"]){const relative=`game/data/history/scenarios/${id}.json`,file=path.join(root,relative),raw=fs.readFileSync(file,"utf8"),scenario=JSON.parse(raw);if(scenario.map!=="china_40x32")throw new Error(`${id} 使用未预期的地图：${scenario.map}`);const updated=raw.replace(/("map"\s*:\s*)"china_40x32"/,`$1"${mapId}"`);if(updated===raw)throw new Error(`${id} 地图编号未找到`);fs.writeFileSync(file,updated)}
console.log(`像素地图已导入：${sourceWidth}×${sourceHeight} → ${width}×${height}；迁移 ${cities.length} 座城池、${counties.length} 处县治。`);
