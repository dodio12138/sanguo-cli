import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import assert from "node:assert/strict";

globalThis.window=globalThis;
await import("../js/core/map-grid.js");

const read=file=>JSON.parse(fs.readFileSync(new URL(`../${file}`,import.meta.url),"utf8"));
const source=read("game/data/map/central_plains.json"),boundaries=read("game/data/history/commandery_boundaries_119.json"),admin=read("game/data/history/administrative_divisions.json"),cities=read("game/data/history/cities/200_guandu.json").cities;
const map={...source.grid,...source},layers=MapGrid.layers(map),cell=(x,y)=>y*map.width+x;
const regionNames=boundaries.regions.map(row=>row[0]),seatNames=admin.commandery_seats_140.map(seat=>seat.name);

assert(boundaries.map_id,"边界文件缺少定稿地图ID");
assert.equal(boundaries.revision,source.layout_revision,"边界文件与地图不同版次");
assert.equal(boundaries.grid.width,map.width);assert.equal(boundaries.grid.height,map.height);
assert.equal(regionNames.length,119,"郡域轮廓必须覆盖119个郡国");assert.equal(new Set(regionNames).size,119);
assert.deepEqual([...regionNames].sort(),[...seatNames].sort(),"边界文件与治所清单必须同集");

const counts=new Map();for(const value of layers.commanderies)if(value)counts.set(value,(counts.get(value)||0)+1);
const ringArea=loop=>loop.reduce((sum,[x,y],index)=>{const [nx,ny]=loop[(index+1)%loop.length];return sum+x*ny-nx*y},0)/2;
for(const [name,,outline] of boundaries.regions){
  assert(outline.length>=1,`${name}缺少轮廓环`);
  for(const loop of outline)assert(loop.length>=3,`${name}轮廓环点数不足`);
  const area=Math.abs(outline.reduce((sum,loop)=>sum+ringArea(loop),0));
  assert(Math.abs(area-counts.get(name))<1e-6,`${name}轮廓面积与郡域格数不符：${area}/${counts.get(name)}`);
}

const cityById=new Map(cities.map(city=>[city.id,city]));
for(const city of cities){
  const index=cell(city.x,city.y);
  assert.notEqual(layers.terrain[index],"ocean",`${city.name}落在海洋`);
  if(city.coordinateQuality!=="outside-authored-commandery-grid")assert.equal(layers.commanderies[index],city.commandery,`${city.name}郡属与郡域不符`);
}
for(const seat of admin.commandery_seats_140){
  const index=cell(seat.x,seat.y);
  assert.notEqual(layers.terrain[index],"ocean",`${seat.name}治所落在海洋`);
  assert.equal(layers.commanderies[index],seat.name,`${seat.name}治所不在本郡`);
}
const countyCells=new Map();
for(const county of admin.county_seats){
  const index=cell(county.x,county.y);
  assert.notEqual(layers.terrain[index],"ocean",`${county.name}县治落在海洋`);
  const key=`${county.x},${county.y}`;assert(!countyCells.has(key),`县治网格重叠：${key}`);countyCells.set(key,county.name);
  if(county.cityId){const city=cityById.get(county.cityId);assert(city,`${county.name}关联据点不存在`);assert.deepEqual([county.x,county.y],[city.x,city.y],`${county.name}未与据点同格`);assert.equal(county.province,city.province,`${county.name}州属与据点不一致`)}
}

const nodes=new Map([...cities,...admin.county_seats,...admin.commandery_seats_140].map(node=>[node.id,node]));
assert.equal(source.roads.length,48,"道路段数不能增减");
for(const road of source.roads){
  const from=nodes.get(road.from),to=nodes.get(road.to),points=MapGrid.decodeRoadPath(road);
  assert(from&&to,`道路端点缺失：${road.id}`);
  assert.deepEqual(points[0],[from.x,from.y]);assert.deepEqual(points.at(-1),[to.x,to.y]);
  assert.equal(new Set(points.map(point=>point.join(","))).size,points.length,"道路不能自交绕圈");
  for(let index=0;index<points.length;index++){const [x,y]=points[index];assert(x>=0&&x<map.width&&y>=0&&y<map.height,`道路 ${road.id} 越界`);assert.notEqual(layers.terrain[cell(x,y)],"ocean",`道路 ${road.id} 跨海`);if(index)assert.equal(Math.abs(x-points[index-1][0])+Math.abs(y-points[index-1][1]),1,"道路必须逐格连续")}
}

const scratch=fs.mkdtempSync(path.join(os.tmpdir(),"commandery-boundaries-"));
try{
  for(const file of ["game/data/map/central_plains.json","game/data/history/cities/200_guandu.json","game/data/history/administrative_divisions.json","game/data/common/game_rules.json"]){const target=path.join(scratch,file);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(new URL(`../${file}`,import.meta.url),target)}
  execFileSync(process.execPath,[fileURLToPath(new URL("./build-road-network.mjs",import.meta.url))],{cwd:scratch,stdio:"pipe"});
  const rebuilt=JSON.parse(fs.readFileSync(path.join(scratch,"game/data/map/central_plains.json"),"utf8"));
  for(const key of ["provinces","commanderies","commanderySeats","terrain","waterways"])assert.deepEqual(rebuilt[key],source[key],`重建道路不能改写${key}`);
}finally{fs.rmSync(scratch,{recursive:true,force:true})}

console.log("郡域边界通过：119 郡国轮廓面积与郡域格数逐一相符 / 据点与治所落在本郡 / 县治与据点同格 / 48 条道路逐格连续且不跨海 / 重建道路不改写地形");
