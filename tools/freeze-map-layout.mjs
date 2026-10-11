import fs from "node:fs";
import path from "node:path";
import {fileURLToPath} from "node:url";

globalThis.window=globalThis;
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
await import(path.join(root,"js/core/map-grid.js"));
const MapGrid=globalThis.MapGrid;

const WRITE=process.argv.includes("--write");
const resolve=file=>path.isAbsolute(file)?file:path.join(root,file);
const read=file=>JSON.parse(fs.readFileSync(resolve(file),"utf8"));
const writeJson=(file,value)=>fs.writeFileSync(path.join(root,file),`${JSON.stringify(value,null,2)}\n`);
const SEAL="塞外区域";
const log=[];const note=message=>log.push(message);

const MAP_PATH="game/data/map/central_plains.json";
const ADMIN_PATH="game/data/history/administrative_divisions.json";
const CITIES_PATH="game/data/history/cities/200_guandu.json";
const GRAPH_PATH="game/data/common/game_rules.json";
const POP_PATH="game/data/history/commandery_population.json";
const BOUNDARIES_PATH="game/data/history/commandery_boundaries_119.json";
const REVISION="commandery-119-grid-100-v1";
const GEO_PATH="/private/tmp/fz4/geo.json";
const REFERENCE_SOURCE="《三国志》（含裴注）全地名分布地图 V3.0";

const RENAME={弘农郡:"恒农郡",沛国:"沛郡",陈国:"陈郡",齐国:"齐郡",赵国:"赵郡",济阴郡:"济阴国",山阳郡:"山阳国",清河国:"甘陵郡",乐安国:"安乐国"};
const ALIAS={勃海郡:"渤海郡",京兆尹及三辅:"京兆尹",牂牁郡:"牂柯郡",东海郡:"东海国",济南郡:"济南国",琅琊国:"琅邪国",天水郡:"汉阳郡"};
const canon=name=>{const alias=ALIAS[name]||name;return RENAME[alias]||alias};
const NEWSEAT={章武郡:"东平舒",新兴郡:"九原",博陵国:"博陵",乐陵郡:"乐陵",乐平郡:"沾县",西平郡:"西都",西郡:"日勒",城阳郡:"东武",东莞郡:"东莞",利城郡:"利城",汉兴郡:"陈仓",谯郡:"谯县",阴平郡:"阴平",西城郡:"西城",南乡郡:"南乡",上庸郡:"上庸",梓潼郡:"梓潼",汶山郡:"绵虒",章陵郡:"章陵",弋阳郡:"弋阳",房陵郡:"房陵",宕渠郡:"宕渠",襄阳郡:"襄阳",固陵郡:"鱼复",蕲新郡:"蕲春",巴西郡:"阆中",宜都郡:"夷道",巴东属国:"涪陵",江阳郡:"江阳",鄱阳郡:"鄱阳",朱提郡:"堂狼",庐陵郡:"西昌"};
const PARENT_OF={章武郡:"渤海郡",新兴郡:"太原郡",博陵国:"涿郡",乐陵郡:"平原郡",乐平郡:"上党郡",西平郡:"金城郡",西郡:"张掖郡",城阳郡:"琅邪国",东莞郡:"琅邪国",利城郡:"琅邪国",汉兴郡:"汉中郡",谯郡:"沛国",阴平郡:"武都郡",西城郡:"汉中郡",南乡郡:"南阳郡",上庸郡:"汉中郡",梓潼郡:"广汉郡",汶山郡:"蜀郡",章陵郡:"南阳郡",弋阳郡:"汝南郡",房陵郡:"汉中郡",宕渠郡:"巴郡",襄阳郡:"南郡",固陵郡:"巴郡",蕲新郡:"江夏郡",巴西郡:"巴郡",宜都郡:"南郡",巴东属国:"巴郡",江阳郡:"犍为郡",鄱阳郡:"豫章郡",朱提郡:"犍为属国",庐陵郡:"豫章郡"};
const PROVINCE_FIX={西郡:"凉州",北地郡:"凉州"};
const TERRAIN_PENALTY={mountain:9,desert:9,marsh:4,plateau:2.5,hills:1.2,forest:1.05};
const kindOf=name=>name.endsWith("属国")?"属国":name.endsWith("国")?"国":name.endsWith("尹")?"尹":"郡";

// ---------- 1. 定稿地图（slot1 编辑器地图） ----------
const saves=read(".local/saves.json");
const editor=saves.slots?.["1"]?.save?.world?.mapEditor;
if(editor?.version!==1)throw new Error("slot1 不是编辑器定稿地图（editorVersion 应为 1）");
const authored=editor.map;
const width=authored.grid?.width||authored.width,height=authored.grid?.height||authored.height,size=width*height;
const terrain=MapGrid.decode(authored.terrain,size);
const commanderies=MapGrid.decode(authored.commanderies,size);
if(terrain.length!==size||commanderies.length!==size)throw new Error("slot1 舆图分层长度不符");
if(terrain.some(value=>!value))throw new Error("slot1 存在空地形格");

const repoMap=read(MAP_PATH);
const citiesFile=read(CITIES_PATH),admin=read(ADMIN_PATH),rulesFile=read(GRAPH_PATH),population=read(POP_PATH);
const cities=citiesFile.cities;
const counties=admin.county_seats,oldSeats=admin.commandery_seats_140;
const cityByName=new Map(cities.map(city=>[city.name,city]));
const customCity=(saves.slots["1"].save.world.cities||[]).find(city=>city.id==="custom_1");
if(!customCity)throw new Error("slot1 缺少 custom_1（东武）据点");

// 定稿前的仓库版本必须留档：未进入编辑器（world.mapRevision 指向旧修订）的存档靠 mapLayouts 还原几何。
const outgoingRevision=repoMap.layout_revision&&repoMap.layout_revision!==REVISION?repoMap.layout_revision:null;
const archivable=outgoingRevision&&!fs.existsSync(resolve(`game/data/map/layouts/${outgoingRevision}.json`));
const outgoingArchive=archivable?{revision:outgoingRevision,map:structuredClone(repoMap),cities:structuredClone(citiesFile.cities),counties:structuredClone(admin.county_seats),divisions:structuredClone(admin)}:null;
const outgoingArchivePath=archivable?`game/data/map/layouts/${outgoingRevision}.json`:null;

// ---------- 2. 分块几何 ----------
const blockCells=new Map();
for(let index=0;index<size;index++){const name=commanderies[index];if(!name)continue;const list=blockCells.get(name);if(list)list.push(index);else blockCells.set(name,[index])}
if(!blockCells.has(SEAL))throw new Error("定稿地图缺少塞外区域");
const blocks=[...blockCells.keys()].filter(name=>name!==SEAL).sort((a,b)=>a.localeCompare(b,"zh"));
const statsOf=(cells,gridWidth)=>{const xs=cells.map(i=>i%gridWidth),ys=cells.map(i=>Math.floor(i/gridWidth));return {cells,minX:Math.min(...xs),maxX:Math.max(...xs),minY:Math.min(...ys),maxY:Math.max(...ys),cx:xs.reduce((a,b)=>a+b,0)/xs.length,cy:ys.reduce((a,b)=>a+b,0)/ys.length,w:Math.max(...xs)-Math.min(...xs)+1,h:Math.max(...ys)-Math.min(...ys)+1}};
const blockStats=new Map();
for(const [name,cells] of blockCells)blockStats.set(name,statsOf(cells,width));

const oldCommanderies=MapGrid.decode(repoMap.commanderies,size);
const oldCells=new Map();
for(let index=0;index<size;index++){const name=oldCommanderies[index];if(!name)continue;const list=oldCells.get(name);if(list)list.push(index);else oldCells.set(name,[index])}
const oldStats=new Map();
for(const [name,cells] of oldCells)oldStats.set(name,statsOf(cells,width));

// ---------- 3. 州域合成 ----------
const declaredProvinces=authored.commandery_provinces||{};
const provinceOf=Object.create(null);
for(const name of blocks){
  const declared=PROVINCE_FIX[name]||declaredProvinces[name]||provinceOf[canon(PARENT_OF[name]||"")];
  if(!declared)throw new Error(`郡国缺少州属：${name}`);
  provinceOf[name]=declared;
}
for(const name of blocks)if(declaredProvinces[name]&&declaredProvinces[name]!==provinceOf[name])note(`州属修正：${name} ${declaredProvinces[name]}→${provinceOf[name]}`);
const inferred=blocks.filter(name=>!declaredProvinces[name]&&!PROVINCE_FIX[name]);
if(inferred.length)note(`定稿未声明州属、按母郡推断：${inferred.join("、")}`);
const provinces=commanderies.map((name,index)=>terrain[index]==="ocean"||!name||name===SEAL?null:provinceOf[name]||null);
const orphanProvince=provinces.filter((value,index)=>!value&&terrain[index]!=="ocean"&&commanderies[index]&&commanderies[index]!==SEAL).length;
if(orphanProvince)throw new Error(`有 ${orphanProvince} 个陆地格没有州属`);
note(`州域：${blocks.length} 郡国；塞外 ${terrain.filter((value,index)=>value!=="ocean"&&commanderies[index]===SEAL).length} 格无州属`);

// ---------- 4. 落格算法 ----------
const GEO=read(GEO_PATH);
const known=[...Object.entries(GEO)].filter(([name])=>blockStats.has(name)).map(([name,ll])=>({name,lon:ll[0],lat:ll[1],cx:blockStats.get(name).cx,cy:blockStats.get(name).cy}));
if(!known.length)throw new Error("缺少经纬度基准");
const solve3=(rows,b)=>{const n=3,A=Array.from({length:n},()=>new Array(n).fill(0)),B=new Array(n).fill(0);
  for(let i=0;i<rows.length;i++)for(let r=0;r<n;r++){B[r]+=rows[i][r]*b[i];for(let c=0;c<n;c++)A[r][c]+=rows[i][r]*rows[i][c]}
  for(let i=0;i<n;i++){let p=i;for(let k=i+1;k<n;k++)if(Math.abs(A[k][i])>Math.abs(A[p][i]))p=k;[A[i],A[p]]=[A[p],A[i]];[B[i],B[p]]=[B[p],B[i]];for(let k=i+1;k<n;k++){const f=A[k][i]/A[i][i];for(let j=i;j<n;j++)A[k][j]-=f*A[i][j];B[k]-=f*B[i]}}
  const x=new Array(n).fill(0);for(let i=n-1;i>=0;i--){let s=B[i];for(let j=i+1;j<n;j++)s-=A[i][j]*x[j];x[i]=s/A[i][i]}return x};
const project=(lon,lat,k=9)=>{
  const near=[...known].sort((a,b)=>((a.lon-lon)*Math.cos(lat*Math.PI/180))**2+(a.lat-lat)**2-((b.lon-lon)*Math.cos(lat*Math.PI/180))**2-(b.lat-lat)**2).slice(0,k);
  const rows=near.map(item=>[item.lon,item.lat,1]),X=solve3(rows,near.map(item=>item.cx)),Y=solve3(rows,near.map(item=>item.cy));
  return [X[0]*lon+X[1]*lat+X[2],Y[0]*lon+Y[1]*lat+Y[2]];
};
const EDGE_PENALTY=30;
const depthIn=(set,x,y,limit=8)=>{for(let r=1;r<=limit;r++){for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==r)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height||!set.has(ny*width+nx))return r-1}}return limit};
const claimed=new Set();
const snapToBlock=(name,px,py)=>{
  const stats=blockStats.get(name);if(!stats)return null;
  const set=new Set(stats.cells),candidates=[];
  for(const index of stats.cells){const dx=index%width-px,dy=Math.floor(index/width)-py,depth=depthIn(set,index%width,Math.floor(index/width));candidates.push({index,depth,distance:dx*dx+dy*dy+(depth===0?EDGE_PENALTY:0)+(TERRAIN_PENALTY[terrain[index]]||0)})}
  candidates.sort((a,b)=>a.distance-b.distance||a.index-b.index);
  for(const item of candidates)if(!claimed.has(item.index)){claimed.add(item.index);return item}
  return null;
};
const seatByCanon=new Map();for(const seat of oldSeats)seatByCanon.set(canon(seat.name),seat);

// ---------- 5. 治所 / 据点 / 县治落格 ----------
const seatPlan=[];
for(const name of blocks){
  const old=seatByCanon.get(name),seatName=old?old.seat:(NEWSEAT[name]||name),geo=GEO[name];
  const stats=blockStats.get(name);
  const [px,py]=geo?project(geo[0],geo[1]):[stats.cx,stats.cy];
  const placed=snapToBlock(name,px,py);
  if(!placed)throw new Error(`治所落格失败：${name}`);
  seatPlan.push({block:name,seat:seatName,oldSeat:old||null,newly:!old,index:placed.index,depth:placed.depth});
}
const seatByBlock=new Map(seatPlan.map(seat=>[seat.block,seat]));
const seatCityId=Object.create(null);
for(const seat of seatPlan)seatCityId[seat.block]=seat.oldSeat?seat.oldSeat.cityId:(cityByName.get(seat.seat)?.id||null);
seatCityId["城阳郡"]="custom_1";

const nearestLand=(x,y)=>{for(let radius=0;radius<=24;radius++)for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){if(Math.max(Math.abs(dx),Math.abs(dy))!==radius)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const index=ny*width+nx;if(terrain[index]!=="ocean")return index}return null};
// 落格以节点自身坐标为锚点，而锚点又会随落格结果移动；地形与边缘惩罚会让节点逐轮微调。
// 迭代到不动点后再取用，保证同一份定稿地图反复执行得到同一结果。
const claimedAfterSeats=new Set(claimed),working=new Map([...cities,...counties].map(node=>[node.id,{x:node.x,y:node.y}]));
const cityPlan=[],orphanCities=[],countyPlan=[],orphanCounties=[];
let passes=0;
for(;;){
  passes++;
  claimed.clear();for(const value of claimedAfterSeats)claimed.add(value);
  cityPlan.length=orphanCities.length=countyPlan.length=orphanCounties.length=0;
  let moved=false;
  for(const city of cities){
    const target=canon(city.commandery||"");
    if(!blockStats.has(target)||target===SEAL){orphanCities.push(city);continue}
    if(seatCityId[target]===city.id){cityPlan.push({city,block:target,index:seatByBlock.get(target).index});continue}
    const stats=blockStats.get(target),at=working.get(city.id),oldBlock=oldStats.get(oldCommanderies[at.y*width+at.x]);
    let px=at.x,py=at.y;
    if(oldBlock){const u=(at.x-oldBlock.minX+0.5)/oldBlock.w,v=(at.y-oldBlock.minY+0.5)/oldBlock.h;px=stats.minX+u*stats.w;py=stats.minY+v*stats.h}
    const placed=snapToBlock(target,px,py);
    if(!placed)throw new Error(`据点落格失败：${city.id}`);
    if(placed.index!==at.y*width+at.x){working.set(city.id,{x:placed.index%width,y:Math.floor(placed.index/width)});moved=true}
    cityPlan.push({city,block:target,index:placed.index});
  }
  for(const county of counties){
    const target=canon(county.commandery||"");
    if(!blockStats.has(target)||target===SEAL){orphanCounties.push(county);continue}
    const shared=county.cityId&&cityPlan.find(item=>item.city.id===county.cityId);
    if(shared){countyPlan.push({county,block:target,index:shared.index,shared:true});continue}
    const stats=blockStats.get(target),at=working.get(county.id),oldBlock=oldStats.get(oldCommanderies[at.y*width+at.x]);
    let px=at.x,py=at.y;
    if(oldBlock){const u=(at.x-oldBlock.minX+0.5)/oldBlock.w,v=(at.y-oldBlock.minY+0.5)/oldBlock.h;px=stats.minX+u*stats.w;py=stats.minY+v*stats.h}
    const placed=snapToBlock(target,px,py);
    if(!placed)throw new Error(`县治落格失败：${county.id}`);
    if(placed.index!==at.y*width+at.x){working.set(county.id,{x:placed.index%width,y:Math.floor(placed.index/width)});moved=true}
    countyPlan.push({county,block:target,index:placed.index});
  }
  if(!moved)break;
  if(passes>=16)throw new Error("据点落格未收敛");
}
if(passes>1)note(`据点落格迭代 ${passes} 轮至不动点`);
note(`落格：治所 ${seatPlan.length}（新增 ${seatPlan.filter(seat=>seat.newly).length}）；属郡据点 ${cityPlan.length}；越界据点 ${orphanCities.length}；县治 ${countyPlan.length}；越界县治 ${orphanCounties.length}`);

// ---------- 6. 治所条目 ----------
let nextSeatNumber=oldSeats.length+1,nextCityNumber=106;
const newCities=[];
const seats=[];
for(const seat of seatPlan){
  const old=seat.oldSeat;
  const id=old?old.id:`commandery_seat_${String(nextSeatNumber++).padStart(3,"0")}`;
  let cityId=seatCityId[seat.block];
  if(!cityId){cityId=`commandery_city_${String(nextCityNumber++).padStart(3,"0")}`;seatCityId[seat.block]=cityId;newCities.push({id:cityId,name:seat.seat,type:"city",x:seat.index%width,y:Math.floor(seat.index/width),force:"neutral",province:provinceOf[seat.block],population:15000,garrison:0,governor:"—",level:1,commerce:30,agriculture:38,order:54,commandery:seat.block,commanderySeatNode:true,commanderySeatId:id,commanderySeatName:seat.seat,coordinateQuality:"authored-commandery-grid"})}
  seats.push({province:provinceOf[seat.block],name:seat.block,seat:seat.seat,kind:kindOf(seat.block),id,x:seat.index%width,y:Math.floor(seat.index/width),coordinateQuality:old?(old.coordinateQuality||"reference-grid-generalized"):"authored-commandery-grid",coordinateSource:old&&old.coordinateSource||REFERENCE_SOURCE,cityId,mapProvince:provinceOf[seat.block],commandery:seat.block});
}
const seatById=new Map(seats.map(seat=>[seat.id,seat]));

// ---------- 7. 据点表 ----------
const nextCities=[];
for(const city of cities){
  if(orphanCities.includes(city))continue;
  if(city.id===customCity.id)continue;
  const plan=cityPlan.find(item=>item.city===city);
  nextCities.push({...city,x:plan.index%width,y:Math.floor(plan.index/width),province:provinceOf[plan.block],commandery:plan.block,coordinateQuality:"authored-grid-projected"});
}
for(const city of orphanCities){
  const index=terrain[city.y*width+city.x]==="ocean"?nearestLand(city.x,city.y):city.y*width+city.x;
  const x=index%width,y=Math.floor(index/width),name=commanderies[index]||SEAL;
  const {commanderySeatNode,commanderySeatId,commanderySeatName,...rest}=city;
  nextCities.push({...rest,x,y,province:blockStats.has(name)?provinceOf[name]:"",commandery:name,coordinateQuality:"outside-authored-commandery-grid"});
}
nextCities.push({...(cities.find(city=>city.id===customCity.id)||customCity),x:seatByBlock.get("城阳郡").index%width,y:Math.floor(seatByBlock.get("城阳郡").index/width),province:provinceOf["城阳郡"],commandery:"城阳郡",commanderySeatNode:true,commanderySeatId:seatByBlock.get("城阳郡").oldSeat?.id||seats.find(seat=>seat.name==="城阳郡").id,commanderySeatName:"东武",coordinateQuality:"authored-commandery-grid"});
for(const city of newCities)nextCities.push(city);
for(const city of nextCities){
  const seat=seats.find(item=>item.cityId===city.id);
  if(seat){city.commanderySeatNode=true;city.commanderySeatId=seat.id;city.commanderySeatName=seat.seat}
}
const idSet=new Set(nextCities.map(city=>city.id));
if(idSet.size!==nextCities.length)throw new Error("据点 ID 重复");
const nameSet=new Set(nextCities.map(city=>city.name));
if(nameSet.size!==nextCities.length)throw new Error(`据点名称重复：${nextCities.map(city=>city.name).filter((name,index,list)=>list.indexOf(name)!==index).join("、")}`);
for(const seat of seats)if(!idSet.has(seat.cityId))throw new Error(`治所缺少对应据点：${seat.name} → ${seat.cityId}`);

// ---------- 8. 路网 ----------
const graph=rulesFile.city_graph;
for(const city of nextCities)graph[city.id]??=[];
for(const [block,parent] of Object.entries(PARENT_OF)){
  const child=seatCityId[block],mother=seatCityId[canon(parent)];
  if(!child||!mother||child===mother)continue;
  graph[child]=[mother,...(graph[child]||[]).filter(id=>id!==mother)];
  graph[mother]=[...new Set([...(graph[mother]||[]),child])];
}
for(const [id,neighbors] of Object.entries(graph))graph[id]=[...new Set((neighbors||[]).filter(next=>idSet.has(next)&&next!==id))];
for(const city of nextCities)if(!graph[city.id])graph[city.id]=[];
const removedNodes=Object.keys(graph).filter(id=>!idSet.has(id));
for(const id of removedNodes)delete graph[id];
if(removedNodes.length)note(`路网移除失效节点：${removedNodes.length} 个 [${removedNodes.join("、")}]`);
// 分郡母郡不在定稿舆图内时（如西郡→张掖郡），治所拿不到母郡连接，会留下无法行军的孤立点；
// 这类节点按网格距离补一条最近的既有连接，只补边不改地形与道路几何。
const nodeById=new Map(nextCities.map(city=>[city.id,city]));
const isolatedNodes=nextCities.filter(city=>!(graph[city.id]||[]).length);
const linkedNodes=nextCities.filter(city=>(graph[city.id]||[]).length);
for(const city of isolatedNodes){
  const pool=(linkedNodes.length?linkedNodes:nextCities).filter(other=>other.id!==city.id);
  if(!pool.length)continue;
  const near=pool.slice().sort((a,b)=>Math.hypot(a.x-city.x,a.y-city.y)-Math.hypot(b.x-city.x,b.y-city.y)||a.id.localeCompare(b.id))[0];
  graph[city.id]=[near.id];
  graph[near.id]=[...new Set([...(graph[near.id]||[]),city.id])];
  note(`路网补连孤立节点：${city.id}（${city.name}／${city.commandery}）↔ ${near.id}（${near.name}／${near.commandery}）`);
}
if(nextCities.some(city=>!(graph[city.id]||[]).length))note(`路网仍有孤立节点：${nextCities.filter(city=>!(graph[city.id]||[]).length).map(city=>city.id).join("、")}`);

// ---------- 9. 县治 ----------
const nextCounties=[];
for(const county of counties){
  const plan=countyPlan.find(item=>item.county===county);
  if(plan){nextCounties.push({...county,x:plan.index%width,y:Math.floor(plan.index/width),province:provinceOf[plan.block],commandery:plan.shared?county.commandery:plan.block,coordinateQuality:plan.shared?"shared-with-city-node":"authored-grid-projected"});continue}
  const index=terrain[county.y*width+county.x]==="ocean"?nearestLand(county.x,county.y):county.y*width+county.x;
  const x=index%width,y=Math.floor(index/width),name=commanderies[index]||SEAL;
  nextCounties.push({...county,x,y,province:blockStats.has(name)?provinceOf[name]:"",commandery:name,coordinateQuality:"outside-authored-commandery-grid"});
}
for(const county of nextCounties)if(!blockStats.has(county.commandery))throw new Error(`县治不属于任何郡国：${county.id}`);
const groups={};
for(const [name,list] of Object.entries(admin.commandery_counties)){const key=canon(name);groups[key]=[...new Set([...(groups[key]||[]),...list])]}
for(const county of nextCounties){const key=county.commandery;const list=groups[key]||(groups[key]=[]);if(!list.includes(county.name))list.push(county.name)}
// 县治落格后可能整郡改属（如乐浪、苍梧并入邻郡），不留没有任何县治的空表。
const emptied=Object.keys(groups).filter(key=>!nextCounties.some(county=>county.commandery===key));
for(const key of emptied)delete groups[key];
if(emptied.length)note(`随县治改属清空的县表：${emptied.join("、")}`);

// ---------- 10. 人口基准 ----------
const oldRecords=population.records,records={};
const legacyNameOf=Object.create(null);
for(const [from,to] of Object.entries({...ALIAS,...RENAME})){if(!legacyNameOf[to])legacyNameOf[to]=from}
const legacyKept=[];
for(const block of blocks){
  const legacy=legacyNameOf[block];
  records[block]=oldRecords[block]||(legacy?oldRecords[legacy]:null)||null;
  if(!oldRecords[block]&&legacy&&oldRecords[legacy])legacyKept.push(`${block}←${legacy}`);
}
if(legacyKept.length)note(`改名郡国沿用旧名户口记录：${legacyKept.join("、")}`);
const derived=[];
for(const block of blocks){
  if(records[block])continue;
  const mother=canon(PARENT_OF[block]||""),source=records[mother]||oldRecords[mother];
  if(!source)throw new Error(`新增郡国缺少母郡人口基准：${block}`);
  if(source[3]==="unrecorded"){records[block]=[null,null,source[2],"unrecorded",`${block}于永和五年（140）尚未分置，母郡${mother}原有户口亦未载；保留游戏城邑估算。`]}
  else{records[block]=[source[0],source[1],source[2],"emended",`${block}于永和五年（140）尚属${mother}，本条沿用母郡口数作为估算基准，未按分置比例拆分。`]}
  derived.push(block);
}
if(derived.length)note(`新增郡国沿用母郡户口：${derived.join("、")}`);
// 定稿地图未绘制的140年郡国（塞外、废并）保留原记录，边地节点仍需人口出处。
const undrawn=[];
for(const [name,record] of Object.entries(oldRecords)){
  if(records[name]||blocks.includes(canon(name)))continue;
  records[name]=record;undrawn.push(name);
}
if(undrawn.length)note(`保留未绘制郡国的140年户口记录：${undrawn.join("、")}`);

// ---------- 11. 郡域轮廓 ----------
// 沿分块边界顺时针描线：每个格子只在缺少邻居的一侧生成有向边，全程保持内部在行进方向右侧，
// 遇到斜向相接的顶点时优先右转，因此对角相连与"孔洞"都能各自闭合。
const outlineOf=cells=>{
  const set=new Set(cells);
  const has=(x,y)=>x>=0&&y>=0&&x<width&&y<height&&set.has(y*width+x);
  const outgoing=new Map();
  const addEdge=(ax,ay,bx,by)=>{const key=`${ax},${ay}`;const list=outgoing.get(key);const edge={from:[ax,ay],to:[bx,by]};if(list)list.push(edge);else outgoing.set(key,[edge])};
  for(const index of cells){const x=index%width,y=Math.floor(index/width);
    if(!has(x,y-1))addEdge(x,y,x+1,y);
    if(!has(x+1,y))addEdge(x+1,y,x+1,y+1);
    if(!has(x,y+1))addEdge(x+1,y+1,x,y+1);
    if(!has(x-1,y))addEdge(x,y+1,x,y);
  }
  const turnRank=(dx,dy,nx,ny)=>{const right=[-dy,dx];if(nx===right[0]&&ny===right[1])return 0;if(nx===dx&&ny===dy)return 1;if(nx===-right[0]&&ny===-right[1])return 2;return 3};
  const loops=[];
  for(const list of outgoing.values())for(const seed of list){
    if(seed.used)continue;
    const loop=[seed.from];let edge=seed;
    for(let guard=0;guard<=4*set.size+8;guard++){
      edge.used=true;loop.push(edge.to);
      if(edge.to[0]===loop[0][0]&&edge.to[1]===loop[0][1])break;
      const candidates=(outgoing.get(`${edge.to[0]},${edge.to[1]}`)||[]).filter(next=>!next.used);
      if(!candidates.length)break;
      const dx=edge.to[0]-edge.from[0],dy=edge.to[1]-edge.from[1];
      candidates.sort((a,b)=>turnRank(dx,dy,a.to[0]-edge.to[0],a.to[1]-edge.to[1])-turnRank(dx,dy,b.to[0]-edge.to[0],b.to[1]-edge.to[1]));
      edge=candidates[0];
    }
    if(loop.length<4)continue;
    if(loop[0][0]!==loop.at(-1)[0]||loop[0][1]!==loop.at(-1)[1])throw new Error("郡域轮廓没有闭合");
    loop.pop();
    const simplified=loop.filter((point,index)=>{const prev=loop[(index-1+loop.length)%loop.length],following=loop[(index+1)%loop.length];return (point[0]-prev[0])*(following[1]-point[1])-(point[1]-prev[1])*(following[0]-point[0])!==0});
    loops.push(simplified.length>=3?simplified:loop);
  }
  loops.sort((a,b)=>b.length-a.length);
  return loops;
};
const outlineArea=loop=>loop.reduce((sum,[x,y],index)=>{const [nx,ny]=loop[(index+1)%loop.length];return sum+x*ny-nx*y},0)/2;
const outlineOfBlock=block=>{
  const cells=blockCells.get(block),loops=outlineOf(cells);
  const area=loops.reduce((sum,loop)=>sum+outlineArea(loop),0);
  if(Math.abs(area-cells.length)>1e-6)throw new Error(`${block}郡域轮廓面积不符：${area} ≠ ${cells.length}`);
  return loops;
};
const regions=blocks.map(block=>[block,[seats.find(seat=>seat.name===block).x,seats.find(seat=>seat.name===block).y],outlineOfBlock(block)]);
const outlineCount=regions.reduce((sum,row)=>sum+row[2].length,0);
const multiLoop=regions.filter(row=>row[2].length>1);
note(`郡域轮廓：${regions.length} 块 / ${outlineCount} 环；面积与分块格数逐一相符${multiLoop.length?`；多环郡国 ${multiLoop.length} 个（${multiLoop.map(row=>`${row[0]}×${row[2].length}`).join("、")}）`:""}`);

const boundaries={
  schema_version:1,map_id:"china_authored_100x100",revision:REVISION,
  grid:{width,height},
  source:{title:REFERENCE_SOURCE,author:"Hardder",file:"三国志全地名分布地图v3.0.jpg",dimensions:[10872,8058],boundary_year:220,administrative_basis_year:140,note:"由编辑器定稿的100×100陆海与郡域分块直接固化，郡域轮廓为定稿分块的外边界描线，不是参考图的逐像素描摹。",primary_sources:["https://zh.wikisource.org/zh-hans/後漢書/卷109","https://zh.wikisource.org/zh-hans/後漢書/卷111","https://zh.wikisource.org/zh-hans/後漢書/卷113"]},
  region_fields:["name","preferred_seat","outline"],regions,
  merge_notes:"汉末增置的郡国按母郡分置；140年尚不存在的郡国（如城阳郡、新兴郡、鄱阳郡等）以母郡户口作为人口基准，详见 game/data/history/commandery_population.json。",
  outline_note:"outline 为闭合环的数组：单连通郡国只有一环，被海、湖泊或他郡飞地切断的郡国有多个环，环面积之和恒等于该郡国的陆地格数。",
  city_controls:Object.fromEntries(nextCities.map(city=>[city.id,[city.x,city.y]])),
  county_controls:Object.fromEntries(nextCounties.map(county=>[`${county.commandery}/${county.name}`,[county.x,county.y]]))
};

// ---------- 12. 地图 ----------
const waterways=(repoMap.waterways||[]).map(river=>river.name==="辽水"?{...river,points:river.points.slice(0,2)}:river);
const map={...repoMap};
map.terrain=MapGrid.encode(terrain);
map.commanderies=MapGrid.encode(commanderies);
map.provinces=MapGrid.encode(provinces);
map.commandery_provinces=Object.fromEntries(blocks.map(block=>[block,provinceOf[block]]));
map.commanderySeats=seats;
map.waterways=waterways;
map.landmarks=MapGrid.landmarks(repoMap);
map.roads=[];
map.layout_revision=REVISION;
if(archivable)map.layout_archive_files={...(repoMap.layout_archive_files||{}),[outgoingRevision]:outgoingArchivePath};
map.commandery_reference={...(repoMap.commandery_reference||{}),file:BOUNDARIES_PATH,count:blocks.length,method:"authored-generalized-outlines"};

// ---------- 13. 行政区划 ----------
admin.commandery_seats_140_basis={...(admin.commandery_seats_140_basis||{}),count:blocks.length,note:"以编辑器定稿的100×100郡域分块为准：共119个郡国单元，另有塞外区域不计入州郡。汉末的增置、改名与废并均已反映；140年尚不存在的郡国沿用母郡户口作为基准。"};
admin.commandery_seats_140=seats;
admin.county_seats=nextCounties;
admin.commandery_counties=groups;

citiesFile.cities=nextCities;
rulesFile.city_graph=graph;
population.records=records;
population.aliases={...population.aliases,...RENAME};

console.log(log.join("\n"));
console.log(`结果：${blocks.length} 郡国 / ${seats.length} 治所 / ${nextCities.length} 据点 / ${nextCounties.length} 县治 / 路网 ${Object.keys(graph).length} 节点`);
const occupied=new Map();let duplicate=0;
for(const item of [...cityPlan,...countyPlan.filter(entry=>!entry.shared)]){if(occupied.has(item.index))duplicate++;occupied.set(item.index,true)}
if(duplicate)throw new Error(`据点与县治重复占格：${duplicate}`);
const onOcean=[...cityPlan,...countyPlan].filter(item=>terrain[item.index]==="ocean");
if(onOcean.length)throw new Error(`有 ${onOcean.length} 个节点落在海洋`);
if(process.argv.includes("--detail")){
  for(const seat of seats)console.log(`  治所 ${seat.name}\t${seat.seat}\t(${seat.x},${seat.y})\t${seat.id}\t${seat.cityId}`);
  console.log(`  新建城：${newCities.map(c=>c.id+":"+c.name+"@"+c.commandery).join("、")}`);
  console.log(`  据点 ${nextCities.length}；新建 ${newCities.length}；越界保留 ${orphanCities.length}；路网节点 ${Object.keys(graph).length}；孤立 ${Object.values(graph).filter(list=>!list.length).length}`);
  console.log(`  越界据点：${orphanCities.map(city=>city.id).join("、")}`);
  console.log(`  越界县治：${orphanCounties.map(county=>county.id+"@"+county.name).join("、")}`);
}
if(!WRITE){console.log("（未写入：加 --write 生效）");process.exit(0)}
if(outgoingArchivePath){
  fs.mkdirSync(path.dirname(resolve(outgoingArchivePath)),{recursive:true});
  fs.writeFileSync(resolve(outgoingArchivePath),`${JSON.stringify(outgoingArchive,null,2)}\n`);
  console.log(`已留档旧版地图：${outgoingArchivePath}（${outgoingRevision}）`);
}
writeJson(MAP_PATH,map);
writeJson(ADMIN_PATH,admin);
writeJson(CITIES_PATH,citiesFile);
writeJson(GRAPH_PATH,rulesFile);
writeJson(POP_PATH,population);
writeJson(BOUNDARIES_PATH,boundaries);
console.log("已写入："+[MAP_PATH,ADMIN_PATH,CITIES_PATH,GRAPH_PATH,POP_PATH,BOUNDARIES_PATH].join("、"));
