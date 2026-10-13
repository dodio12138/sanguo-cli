// 由 game/data/map/route_network.json 派生据点连通关系（city_graph）与渡河标记（edge_modifiers）。
// 路网是史实考订的唯一来源；本脚本不改地形、郡界、河流或据点坐标。
import fs from "node:fs";
const read=path=>JSON.parse(fs.readFileSync(path,"utf8"));
const network=read("game/data/map/route_network.json"),cities=read("game/data/history/cities/200_guandu.json").cities,rulesPath="game/data/common/game_rules.json",rules=read(rulesPath);
const ids=new Set(cities.map(city=>city.id)),errors=[],graph={},modifiers={},seen=new Set();
for(const route of network.routes){
  const kind=network.kinds[route.kind];
  if(!kind)errors.push(`未知路段类型：${route.kind}`);
  for(const id of [route.a,route.b])if(!ids.has(id))errors.push(`路段端点不存在：${id}`);
  const key=[[route.a,route.b].sort().join(":"),kind?.mode].join("@");if(seen.has(key))errors.push(`重复路段：${key}`);seen.add(key);
  if(route.kind==="river"&&route.flow!=="a>b")errors.push(`水路缺少流向：${route.a}—${route.b}`);
  (graph[route.a]??=[]).includes(route.b)||graph[route.a].push(route.b);(graph[route.b]??=[]).includes(route.a)||graph[route.b].push(route.a);
  if(route.kind==="ford")modifiers[[route.a,route.b].sort().join(":")]="river";
}
for(const city of cities)if(!graph[city.id])errors.push(`据点没有任何通路：${city.name}`);
const reached=new Set([cities[0].id]),stack=[cities[0].id];while(stack.length){const id=stack.pop();for(const next of graph[id]||[])if(!reached.has(next)){reached.add(next);stack.push(next)}}
for(const city of cities)if(!reached.has(city.id))errors.push(`据点与全国路网不连通：${city.name}`);
if(errors.length){console.error(errors.join("\n"));process.exit(1)}
const ordered=Object.fromEntries(cities.map(city=>[city.id,graph[city.id]]));
const changed=JSON.stringify(rules.city_graph)!==JSON.stringify(ordered)||JSON.stringify(rules.edge_modifiers)!==JSON.stringify(modifiers);
if(process.argv.includes("--check")){if(changed){console.error("city_graph 与路网不一致，请运行 node tools/build-route-network.mjs");process.exit(1)}console.log("路网与连通关系一致");process.exit(0)}
rules.city_graph=ordered;rules.edge_modifiers=modifiers;fs.writeFileSync(rulesPath,`${JSON.stringify(rules,null,2)}\n`);
const counts={};for(const route of network.routes)counts[route.kind]=(counts[route.kind]||0)+1;
console.log(`路网已派生：${network.routes.length} 段（${Object.entries(counts).map(([kind,count])=>`${network.kinds[kind].name}${count}`).join("、")}），${Object.keys(ordered).length} 据点全部连通`);
