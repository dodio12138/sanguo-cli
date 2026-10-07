import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
globalThis.fetch=async url=>{
  const relative=String(url).replace(/^\//,"");
  try{const body=fs.readFileSync(path.join(root,relative),"utf8");return {ok:true,status:200,json:async()=>JSON.parse(body)}}
  catch(error){if(!relative.startsWith("mods/"))console.error(`fixture missing: ${relative} (${error.message})`);return {ok:false,status:404,json:async()=>({})}}
};
await import(pathToFileURL(path.join(root,"js/core/data-loader.js")));
await import(pathToFileURL(path.join(root,"js/core/rule-engine.js")));
await import(pathToFileURL(path.join(root,"js/core/game-state.js")));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();
const catalog=JSON.parse(fs.readFileSync(path.join(root,"game/data/history/scenarios/index.json"),"utf8"));
for(const entry of catalog.scenarios){
  const data=await loader.loadScenario(entry.id),diagnostics=loader.diagnose(data);
  if(!diagnostics.ok)throw new Error(`${entry.id} 校验失败：${diagnostics.errors.join("；")}`);
  if(data.officers.length<500)throw new Error(`${entry.id} 人物名册未完整载入：${data.officers.length}`);
  const playable=data.scenario.playable_forces||[];
  if(playable.length<3)throw new Error(`${entry.id} 可选势力不足`);
  for(const id of playable)if(!data.scenario.force_briefs?.[id]||!data.scenario.objectives?.[id])throw new Error(`${entry.id} 的可选势力 ${id} 缺少背景或目标`);
  const state=new GameState(data,{playerForceId:data.scenario.default_player_force,difficulty:"normal"});
  for(let turn=0;turn<6;turn++)state.endTurn();
  if(state.turn!==7||!state.reports.length||state.data.armies.some(army=>!Number.isFinite(army.soldiers)||army.soldiers<0))throw new Error(`${entry.id} 六旬演进测试失败`);
  console.log(`${entry.id}: ${playable.length} 个可选势力 / ${data.forces.length-1} 个势力 / ${data.cities.length} 据点 / ${data.officers.length} 人物`);
}
const byId=id=>catalog.scenarios.find(entry=>entry.id===id);
const coalition=await loader.loadScenario(byId("190_coalition").id),guandu=await loader.loadScenario(byId("200_guandu").id),redCliffs=await loader.loadScenario(byId("208_red_cliffs").id);
if(coalition.forces.some(force=>force.id==="zhang_lu")||coalition.cities.find(city=>city.id==="hanzhong")?.force!=="liu_yan")throw new Error("190 年汉中势力归属提前错置");
if(guandu.cities.find(city=>city.id==="jincheng")?.force!=="han_sui"||guandu.cities.find(city=>city.id==="chengdu")?.force!=="liu_zhang")throw new Error("200 年西北或益州割据势力缺失");
if(redCliffs.scenario.start_date!=="208-10-01"||redCliffs.cities.find(city=>city.id==="xiangping")?.force!=="gongsun_kang"||redCliffs.cities.find(city=>city.id==="chaisang")?.force!=="sun")throw new Error("208 年秋势力版图或时点不一致");
