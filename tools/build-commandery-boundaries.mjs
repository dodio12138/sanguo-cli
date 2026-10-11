import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {resizeLayout} from "./resize-map-grid.mjs";

globalThis.window??=globalThis;
await import("../js/core/map-grid.js");
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
const normalize=name=>String(name||"").replace(/雒/g,"洛").replace(/[县縣]$/u,"");

export function outlineDistance(x,y,outline){
  let inside=false,distance=Infinity;
  for(let i=0,j=outline.length-1;i<outline.length;j=i++){
    const [ax,ay]=outline[j],[bx,by]=outline[i],dx=bx-ax,dy=by-ay;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(y-ay)*dy)/(dx*dx+dy*dy||1)));
    distance=Math.min(distance,Math.hypot(x-ax-t*dx,y-ay-t*dy));
    if((ay>y)!==(by>y)&&x<(bx-ax)*(y-ay)/(by-ay)+ax)inside=!inside;
  }
  return inside?distance:-distance;
}

function normalizeComponents(values,terrain,width,height,polygons){
  const neighbors=i=>[...(i>=width?[i-width]:[]),...(i+width<values.length?[i+width]:[]),...(i%width?[i-1]:[]),...(i%width<width-1?[i+1]:[])];
  const landmass=new Int32Array(values.length).fill(-1);let mass=0;
  for(let i=0;i<values.length;i++)if(terrain[i]!=="ocean"&&landmass[i]<0){const stack=[i];landmass[i]=mass;while(stack.length){for(const next of neighbors(stack.pop()))if(terrain[next]!=="ocean"&&landmass[next]<0){landmass[next]=mass;stack.push(next)}}mass++}
  const seen=new Set(),groups=new Map();
  for(let i=0;i<values.length;i++)if(values[i]&&!seen.has(i)){
    const name=values[i],stack=[i],cells=[];seen.add(i);while(stack.length){const current=stack.pop();cells.push(current);for(const next of neighbors(current))if(values[next]===name&&!seen.has(next)){seen.add(next);stack.push(next)}}
    const key=`${name}:${landmass[i]}`,parts=groups.get(key)||[];parts.push(cells);groups.set(key,parts);
  }
  // Remove only rasterization fragments on the same landmass; genuine coastal islands remain.
  const pending=new Set();for(const parts of groups.values()){parts.sort((a,b)=>b.length-a.length);for(const cells of parts.slice(1))for(const i of cells){values[i]=null;pending.add(i)}}
  const byName=new Map(polygons.map(p=>[p.name,p]));
  while(pending.size){const updates=[];for(const i of pending){const candidates=[...new Set(neighbors(i).map(next=>values[next]).filter(Boolean))];if(!candidates.length)continue;const x=i%width+.5,y=Math.floor(i/width)+.5;const name=candidates.sort((a,b)=>outlineDistance(x,y,byName.get(b).outline)-outlineDistance(x,y,byName.get(a).outline)||a.localeCompare(b))[0];updates.push([i,name])}if(!updates.length)throw new Error("郡域概化碎片无法归入相邻区域");for(const [i,name] of updates){values[i]=name;pending.delete(i)}}
  return values;
}

export function rasterizeBoundaries(reference,map,seats){
  const {width,height}=MapGrid.dimensions(map),terrain=MapGrid.layers(map).terrain;
  if(reference.map_id!==map.id||reference.grid.width!==width||reference.grid.height!==height)throw new Error("郡域参考与地图尺寸不一致");
  const definitions=new Map(seats.map(seat=>[seat.name,seat]));
  if(reference.regions.length!==105||new Set(reference.regions.map(row=>row[0])).size!==105||reference.regions.some(([name])=>!definitions.has(name)))throw new Error("郡域轮廓必须覆盖105个不同郡国");
  const commanderies=[],provinces=[];
  const polygons=reference.regions.map(([name,,outline])=>{
    if(outline.length<3||outline.some(p=>p.length!==2||p.some(v=>!Number.isFinite(v))))throw new Error(`${name}轮廓无效`);
    const area=Math.abs(outline.reduce((sum,[x,y],i)=>{const next=outline[(i+1)%outline.length];return sum+x*next[1]-y*next[0]},0))/2;
    if(!area)throw new Error(`${name}轮廓没有面积`);return {name,outline,area};
  });
  for(let i=0;i<width*height;i++){
    if(terrain[i]==="ocean"){commanderies.push(null);provinces.push(null);continue}
    const x=i%width+.5,y=Math.floor(i/width)+.5;
    let name=null,best=-Infinity;
    // Small authored regions cut out their footprint from broader neighboring envelopes.
    // Signed outline distance fills the gaps between the generalized boundaries.
    // There is no nearest-city/nearest-seat territory generation here.
    for(const {name:candidate,outline,area} of polygons){
      const distance=outlineDistance(x,y,outline),score=distance>0?100000-area+distance*.001:distance;if(score>best){name=candidate;best=score}
    }
    commanderies.push(name);provinces.push(definitions.get(name).province);
  }
  normalizeComponents(commanderies,terrain,width,height,polygons);
  for(let i=0;i<commanderies.length;i++)provinces[i]=commanderies[i]?definitions.get(commanderies[i]).province:null;
  return {width,height,terrain,commanderies,provinces};
}

function geometry(node){const result={};for(const key of ["id","name","x","y","province","commandery","cityId","jurisdictionCityId"])if(node[key]!==undefined)result[key]=node[key];return result}

export function buildLayout(input,reference){
  if(input.map.grid_mapping?.archive_file){
    const archived=read(input.map.grid_mapping.archive_file),geo=new Map(archived.cities.map(city=>[city.id,geometry(city)])),countyGeo=new Map(archived.counties.map(county=>[county.id,geometry(county)]));
    const divisions=structuredClone(input.divisions);divisions.county_seats=divisions.county_seats.map(county=>({...county,...countyGeo.get(county.id)}));divisions.commandery_seats_140=structuredClone(archived.map.commanderySeats);
    const original=buildLayout({map:archived.map,cities:input.cities.map(city=>({...city,...geo.get(city.id)})),divisions},reference),{width,height}=MapGrid.dimensions(input.map);
    return resizeLayout(original,width,height);
  }
  const map=structuredClone(input.map),cities=structuredClone(input.cities),divisions=structuredClone(input.divisions);
  const runtime={...map.grid,...map},layers=rasterizeBoundaries(reference,runtime,divisions.commandery_seats_140);
  const {width,height,terrain,commanderies,provinces}=layers,oldCities=new Map(input.cities.map(city=>[city.id,city]));
  const regions=new Map(reference.regions.map(([name,seat,outline])=>[name,{seat,outline,cells:[]} ]));
  for(let i=0;i<width*height;i++)if(commanderies[i])regions.get(commanderies[i]).cells.push({x:i%width,y:Math.floor(i/width)});
  const cityById=new Map(cities.map(city=>[city.id,city])),usedCities=new Set(),usedCounties=new Set();
  const at=point=>point.y*width+point.x,key=point=>`${point.x},${point.y}`;
  const choose=(name,preferred,occupied)=>{
    const region=regions.get(name);if(!region?.cells.length)throw new Error(`${name}没有可用郡域`);
    const choices=region.cells.filter(point=>!occupied.has(key(point))).sort((a,b)=>(a.x-preferred[0])**2+(a.y-preferred[1])**2-((b.x-preferred[0])**2+(b.y-preferred[1])**2)||a.y-b.y||a.x-b.x);
    if(!choices.length)throw new Error(`${name}容量不足，需扩大人工轮廓而不是把节点挤到别郡`);
    return choices[0];
  };
  const place=(city,preferred)=>{const next=choose(city.commandery,preferred,usedCities);Object.assign(city,next,{province:provinces[at(next)],coordinateQuality:"reference-grid-generalized"});usedCities.add(key(city))};
  // Reserve every commandery capital before placing secondary cities/strategic nodes.
  for(const seat of divisions.commandery_seats_140){
    const city=cityById.get(seat.cityId);if(!city||city.commandery!==seat.name)throw new Error(`${seat.name}的治所城市引用不一致`);
    place(city,regions.get(seat.name).seat);
  }
  const capitalIds=new Set(divisions.commandery_seats_140.map(seat=>seat.cityId));
  for(const city of cities)if(!capitalIds.has(city.id)){
    const control=reference.city_controls[city.id];if(!control)throw new Error(`${city.id}缺少人工定位控制点`);
    place(city,control);
  }
  // A county of the same historical name can share its actual city node, never another county.
  for(const county of divisions.county_seats)if(!county.cityId){
    const exact=cities.find(city=>city.commandery===county.commandery&&normalize(city.commanderySeatName||city.name)===normalize(county.name));
    if(exact&&!divisions.county_seats.some(other=>other.cityId===exact.id))county.cityId=exact.id;
  }
  const ordered=[...divisions.county_seats].sort((a,b)=>Number(!!b.cityId)-Number(!!a.cityId)||Number(!!b.capital)-Number(!!a.capital)||a.id.localeCompare(b.id));
  for(const county of ordered){
    const linked=cityById.get(county.cityId),region=regions.get(county.commandery);
    if(!region)throw new Error(`${county.name}的郡名没有人工轮廓`);
    let next;
    if(linked){
      if(linked.commandery!==county.commandery||usedCounties.has(key(linked)))throw new Error(`${county.name}与据点重复或跨郡对齐`);
      next={x:linked.x,y:linked.y};
    }else{
      const control=reference.county_controls[`${county.commandery}/${county.name}`];
      const parent=cityById.get(county.jurisdictionCityId),oldParent=oldCities.get(county.jurisdictionCityId);
      const currentValid=county.x>=0&&county.y>=0&&county.x<width&&county.y<height&&commanderies[at(county)]===county.commandery;
      const preferred=control||(currentValid?[county.x,county.y]:parent&&oldParent?[county.x+parent.x-oldParent.x,county.y+parent.y-oldParent.y]:region.seat);
      next=choose(county.commandery,preferred,new Set([...usedCities,...usedCounties]));
    }
    Object.assign(county,next,{province:provinces[at(next)],coordinateQuality:reference.county_controls[`${county.commandery}/${county.name}`]||linked?"reference-grid-generalized":"within-commandery-grid-estimate"});
    usedCounties.add(key(county));
    const jurisdiction=cityById.get(county.jurisdictionCityId);
    if(!jurisdiction||jurisdiction.commandery!==county.commandery){
      const local=cities.filter(city=>city.commandery===county.commandery&&(city.type||"city")==="city");
      county.jurisdictionCityId=(linked||local.sort((a,b)=>Math.hypot(a.x-county.x,a.y-county.y)-Math.hypot(b.x-county.x,b.y-county.y))[0])?.id;
    }
    if(!county.jurisdictionCityId)throw new Error(`${county.name}没有本郡管辖据点`);
  }
  for(const seat of divisions.commandery_seats_140){const city=cityById.get(seat.cityId);Object.assign(seat,{x:city.x,y:city.y,province:city.province,mapProvince:city.province,commandery:seat.name,coordinateQuality:"reference-grid-generalized",coordinateSource:reference.source.title})}
  map.commanderySeats=structuredClone(divisions.commandery_seats_140);
  map.commanderies=MapGrid.encode(commanderies);map.provinces=MapGrid.encode(provinces);
  map.layout_revision=reference.revision;map.legacy_revision="pixel-60-v1";map.layout_archive_file="game/data/map/layouts/pixel-60-v1.json";
  map.commandery_reference={file:"game/data/history/commandery_boundaries_105.json",title:reference.source.title,author:reference.source.author,sourceYear:220,basisYear:140,method:"authored-generalized-outlines",count:105};
  // Keep the exact road edge set and untouched paths; only adapt routes with moved endpoints.
  const nodes=new Map([...cities,...divisions.county_seats,...map.commanderySeats].map(node=>[node.id,node]));
  const routeMap={...map.grid,...map};
  map.roads=(input.map.roads||[]).map(route=>{
    const from=nodes.get(route.from),to=nodes.get(route.to),old=MapGrid.decodeRoadPath(route);
    if(!from||!to||old.length<2)throw new Error(`道路引用无效：${route.id}`);
    const same=(point,node)=>point[0]===node.x&&point[1]===node.y;
    if(same(old[0],from)&&same(old.at(-1),to))return structuredClone(route);
    const squared=(point,node)=>(point[0]-node.x)**2+(point[1]-node.y)**2;
    let start=0,end=old.length-1;
    for(let i=1;i<old.length;i++)if(squared(old[i],from)<squared(old[start],from))start=i;
    for(let i=old.length-2;i>=0;i--)if(squared(old[i],to)<squared(old[end],to))end=i;
    let points;
    if(start<end){
      const middle=old.slice(start,end+1),head=MapGrid.routePath(routeMap,from,{x:middle[0][0],y:middle[0][1]}),tail=MapGrid.routePath(routeMap,{x:middle.at(-1)[0],y:middle.at(-1)[1]},to);
      points=head.length&&tail.length?[...head.slice(0,-1),...middle,...tail.slice(1)]:[];
    }
    if(!points?.length)points=MapGrid.routePath(routeMap,from,to);
    if(points.length<2)throw new Error(`校正后道路无法连接：${route.id}`);
    // Loop erasure prevents a new endpoint connector from walking over the old middle twice.
    const cleaned=[],seen=new Map();for(const p of points){const k=p.join(",");if(seen.has(k)){const length=seen.get(k)+1;while(cleaned.length>length)seen.delete(cleaned.pop().join(","))}else{seen.set(k,cleaned.length);cleaned.push(p)}}
    if(cleaned.some(([x,y])=>terrain[y*width+x]==="ocean"))throw new Error(`校正道路穿越海面：${route.id}`);
    return {...route,path:MapGrid.encodeRoadPath(cleaned)};
  });
  return {map,cities,divisions,layers};
}

export function sourceLayout(){return {map:read("game/data/map/central_plains.json"),cities:read("game/data/history/cities/200_guandu.json").cities,divisions:read("game/data/history/administrative_divisions.json")}}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const input=sourceLayout();
  // The editor-authored 119-commandery baseline is the terrain of record; its commandery layer is drawn, not
  // derived from reference outlines. Only the archived 105-commandery revisions may still be rebuilt here.
  if(input.map.layout_revision!=="commandery-105-grid-100-v1")throw new Error(`当前基准${input.map.layout_revision?`（${input.map.layout_revision}）`:""}的郡域由编辑器定稿，不能再用参考图轮廓重建；请在编辑器中修改郡域后运行 node tools/freeze-map-layout.mjs --write。`);
  const reference=read("game/data/history/commandery_boundaries_105.json"),result=buildLayout(input,reference);
  const changedCities=result.cities.filter(city=>{const old=input.cities.find(row=>row.id===city.id);return city.x!==old.x||city.y!==old.y});
  const changedCounties=result.divisions.county_seats.filter(county=>{const old=input.divisions.county_seats.find(row=>row.id===county.id);return county.x!==old.x||county.y!==old.y});
  const changedRoads=result.map.roads.filter((road,i)=>road.path!==input.map.roads[i].path);
  const checks=MapGrid.validate({...result.layers,cities:result.cities,counties:result.divisions.county_seats});if(!checks.ok)throw new Error(checks.errors.join("\n"));
  console.log(`郡域校正：105郡国 / ${result.cities.length}据点 / ${result.divisions.county_seats.length}县治；移动${changedCities.length}城、${changedCounties.length}县，调整${changedRoads.length}/${result.map.roads.length}道路。`);
  if(process.argv.includes("--write")){
    const archive=path.join(root,result.map.layout_archive_file);
    if(!fs.existsSync(archive)){
      if(input.map.layout_revision)throw new Error("缺少旧图归档，不能用新图伪造旧图");
      fs.mkdirSync(path.dirname(archive),{recursive:true});
      const oldMap=structuredClone(input.map);oldMap.layout_revision="pixel-60-v1";
      fs.writeFileSync(archive,JSON.stringify({revision:"pixel-60-v1",map:oldMap,cities:input.cities.map(geometry),counties:input.divisions.county_seats.map(geometry)},null,2)+"\n");
    }
    for(const [file,value] of [["game/data/map/central_plains.json",result.map],["game/data/history/cities/200_guandu.json",{...read("game/data/history/cities/200_guandu.json"),cities:result.cities}],["game/data/history/administrative_divisions.json",result.divisions]])fs.writeFileSync(path.join(root,file),JSON.stringify(value,null,2)+"\n");
  }else if(process.argv.includes("--check")){
    if(JSON.stringify(input.map)!==JSON.stringify(result.map)||JSON.stringify(input.cities)!==JSON.stringify(result.cities)||JSON.stringify(input.divisions)!==JSON.stringify(result.divisions)){console.error("郡域派生数据尚未同步");process.exitCode=1}
  }else console.log("预览完成；确认后加 --write 写入原始剧本，或 --check 校验派生数据。");
}
