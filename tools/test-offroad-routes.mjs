import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
import {appSource} from "./app-source.mjs";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
for(const file of ["map-grid","data-loader","game-clock","fiscal-system","rule-engine","game-state"])await import(pathToFileURL(path.join(root,`js/core/${file}.js`)));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const data=await new DataLoader(sandbox.window.SANGUO_DATA).load(),engine=new RuleEngine(data),graph=data.rules.city_graph,byId=new Map(data.cities.map(city=>[city.id,city]));
const {width}=MapGrid.dimensions(data.map),terrain=MapGrid.decode(data.map.terrain,width*MapGrid.dimensions(data.map).height);

// 野径只连没有官路的近处据点，双向对称，所经格均为陆地。
const offroad=engine.offroadGraph();let links=0;
for(const [a,targets] of offroad)for(const [b,leg] of targets){links++;assert(!(graph[a]||[]).includes(b),"有官路的据点之间不另设野径");assert(offroad.get(b)?.has(a),"野径须双向");for(const [x,y] of leg.points)assert.notEqual(terrain[y*width+x],"ocean","野径不得穿海")}
assert(links>=300,`野径数量不足：${links}`);

// 野径比官路慢：同等里程所需日数更多，且标注为野径。
const [a,targets]=[...offroad].find(([,targets])=>targets.size),[b]=[...targets.keys()],leg=engine.legInfo(a,b);
assert.equal(leg.kind,"offroad");assert.equal(leg.kindName,"野径");assert(leg.points.length>1);
const road=data.routeNetwork.kinds.road,offCfg=data.rules.movement.offroad;
assert(offCfg.speed_li<road.speed_li,"野外行军日行里数应低于官路");
assert(leg.days>=Math.round(leg.li/road.speed_li),"野径日数不应快于同里程官路");

// 寻路：最快方案可用野径，只走官路时不经野径；自定义停留点依次经过。
let mixed=null;for(const from of data.cities){for(const to of data.cities.slice(0,120)){if(from===to)continue;const fast=engine.path(from.id,to.id);if(fast?.some((id,i)=>i&&engine.legInfo(fast[i-1],id).kind==="offroad")){mixed={from,to,fast};break}}if(mixed)break}
assert(mixed,"至少应有一条最快路线使用野径");
const roadsOnly=engine.path(mixed.from.id,mixed.to.id,null,{roadsOnly:true});
if(roadsOnly)for(let i=1;i<roadsOnly.length;i++)assert.notEqual(engine.legInfo(roadsOnly[i-1],roadsOnly[i]).kind,"offroad","只走官路的方案不得经过野径");
const stop=data.cities.find(city=>city.id!==mixed.from.id&&city.id!==mixed.to.id&&!mixed.fast.includes(city.id)&&engine.path(mixed.from.id,city.id)&&engine.path(city.id,mixed.to.id));
const custom=engine.plannedRoute(mixed.from.id,mixed.to.id,null,{waypoints:[stop.id]});
assert(custom.includes(stop.id),"自定义路线必须经过停留点");assert.equal(custom[0],mixed.from.id);assert.equal(custom.at(-1),mixed.to.id);
for(let i=1;i<custom.length;i++)assert(!engine.legInfo(custom[i-1],custom[i]).legacy,"自定义路线每段都应是官路、水路或野径");

// 命令执行沿用玩家指定的停留点，而不是重新求最快路线。
const forceId=data.scenario.player_force||"cao",army=data.armies.find(item=>item.force===forceId),state=new GameState(structuredClone(data),{playerForceId:forceId});
const own=state.data.cities.filter(city=>city.force===forceId),home=state.data.armies.find(item=>item.id===army.id),goal=own.find(city=>city.id!==home.city&&state.engine.path(home.city,city.id,forceId)?.length>3),via=own.find(city=>![home.city,goal.id].includes(city.id)&&!state.engine.path(home.city,goal.id,forceId).includes(city.id)&&state.engine.plannedRoute(home.city,goal.id,forceId,{waypoints:[city.id]}));
const events=[];state.engine.resolveOrder?.(state,{type:"move",armyIds:[home.id],cityIds:[goal.id],options:{routeMode:"custom",waypoints:[via.id]}},events);
assert([home.city,...home.route].includes(via.id),`军团应经停 ${via.name}：${events.map(e=>e.text).join("；")}`);
const view=fs.readFileSync(path.join(root,"js/ui/map-view.js"),"utf8"),app=appSource();
assert(/leg\?\.kind==="offroad"&&leg\.points/.test(view),"野径行军沿地形折线绘制");
assert(/name="routeMode"/.test(app)&&/自定义停留节点/.test(app)&&/plannedRoute\(/.test(app),"行军对话框提供路线方案与自定义停留节点");
console.log(`野外行军与自定义路线通过：${links/2} 条野径 / 野径较官路慢 / 只走官路不经野径 / 停留点依次经过并由命令执行`);
