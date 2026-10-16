import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
globalThis.fetch=async url=>{
  const relative=String(url).replace(/^\//,"");
  try{const body=fs.readFileSync(path.join(root,relative),"utf8");return {ok:true,status:200,json:async()=>JSON.parse(body)}}
  catch(error){if(!relative.startsWith("mods/"))console.error(`fixture missing: ${relative} (${error.message})`);return {ok:false,status:404,json:async()=>({})}}
};
await import(pathToFileURL(path.join(root,"js/core/data-loader.js")));
await import(pathToFileURL(path.join(root,"js/core/game-clock.js")));await import(pathToFileURL(path.join(root,"js/core/fiscal-system.js")));await import(pathToFileURL(path.join(root,"js/core/rule-engine.js")));
await import(pathToFileURL(path.join(root,"js/core/game-state.js")));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();
const catalog=JSON.parse(fs.readFileSync(path.join(root,"game/data/history/scenarios/index.json"),"utf8"));
for(const entry of catalog.scenarios){
  const data=await loader.loadScenario(entry.id),diagnostics=loader.diagnose(data);
  if(!diagnostics.ok)throw new Error(`${entry.id} 校验失败：${diagnostics.errors.join("；")}`);
  // 已故人物不入名册，晚期剧本名册自然较短；在任者另按剧本断言。
  if(!data.scenario.patch?.roster_names&&data.officers.length<400)throw new Error(`${entry.id} 人物名册未完整载入：${data.officers.length}`);
  const playable=data.scenario.playable_forces||[];
  // 黄巾（184）只有汉廷与黄巾两阵营，全部可选即可。
  if(playable.length<Math.min(3,data.forces.length-1))throw new Error(`${entry.id} 可选势力不足`);
  for(const id of playable)if(!data.scenario.force_briefs?.[id]||!data.scenario.objectives?.[id])throw new Error(`${entry.id} 的可选势力 ${id} 缺少背景或目标`);
  const state=new GameState(data,{playerForceId:data.scenario.default_player_force,difficulty:"normal"});
  for(let turn=0;turn<6;turn++)state.endTurn();
  if(state.turn!==7||!state.reports.length||state.data.armies.some(army=>!Number.isFinite(army.soldiers)||army.soldiers<0))throw new Error(`${entry.id} 六日演进测试失败`);
  console.log(`${entry.id}: ${playable.length} 个可选势力 / ${data.forces.length-1} 个势力 / ${data.cities.length} 据点 / ${data.officers.length} 人物`);
}
const byId=id=>catalog.scenarios.find(entry=>entry.id===id);
const coalition=await loader.loadScenario(byId("190_coalition").id),guandu=await loader.loadScenario(byId("200_guandu").id),redCliffs=await loader.loadScenario(byId("208_red_cliffs").id);
if(coalition.forces.some(force=>force.id==="zhang_lu")||coalition.cities.find(city=>city.id==="hanzhong")?.force!=="liu_yan")throw new Error("190 年汉中势力归属提前错置");
if(guandu.cities.find(city=>city.id==="jincheng")?.force!=="han_sui"||guandu.cities.find(city=>city.id==="chengdu")?.force!=="liu_zhang")throw new Error("200 年西北或益州割据势力缺失");
if(redCliffs.scenario.start_date!=="208-10-01"||redCliffs.cities.find(city=>city.id==="xiangping")?.force!=="gongsun_kang"||redCliffs.cities.find(city=>city.id==="chaisang")?.force!=="sun")throw new Error("208 年秋势力版图或时点不一致");

// 模拟补全前的战局：新势力和八条新人物记录尚不存在，但已有征服、人口与日期。
const addedForces=new Set(["wang_kuang","kong_zhou","zhang_miao","qiao_mao","yuan_yi","bao_xin","zhang_chao","chen_wen","zhou_xin","liu_chong","shi_xie","jiao_he"]),legacyData=structuredClone(coalition);
legacyData.forces=legacyData.forces.filter(force=>!addedForces.has(force.id));
legacyData.officers=legacyData.officers.filter(officer=>!officer.id.startsWith("scenario_190_local_"));
for(const officer of legacyData.officers)if(addedForces.has(officer.force)){officer.force="neutral";officer.status="hidden";officer.loyalty=0}
legacyData.armies=legacyData.armies.filter(army=>!addedForces.has(army.force));
for(const city of legacyData.cities)if(addedForces.has(city.force)){city.force="neutral";city.governor="—"}
for(const county of legacyData.counties)if(addedForces.has(county.force))county.force="neutral";
const legacyGame=new GameState(legacyData,{playerForceId:"cao"}),conquest=legacyGame.data.cities.find(city=>city.id==="henei");
conquest.force="cao";conquest.population=13123;legacyGame.date.day=9;legacyGame.turn=9;
const saved=legacyGame.serialize(),restored=new GameState(structuredClone(coalition),{playerForceId:"cao"});
restored.applySave(restored.migrateSave(saved));
assert.deepEqual(restored.data.forces.map(force=>force.id),legacyGame.data.forces.map(force=>force.id),"新版势力不能注入旧战局");
assert.equal(restored.data.cities.find(city=>city.id==="henei").force,"cao","旧存档已占领城池不能回退");
assert.equal(restored.data.cities.find(city=>city.id==="henei").population,13123,"旧存档人口不能被开局参数覆盖");
assert.equal(restored.date.day,9);assert.equal(restored.turn,9);
const restoredForces=new Set(restored.data.forces.map(force=>force.id));
for(const officer of restored.data.officers)assert(restoredForces.has(officer.force),`旧局人物 ${officer.name} 不能引用不存在的新势力`);
for(const officer of restored.data.officers.filter(officer=>officer.id.startsWith("scenario_190_local_")))assert.equal(officer.status,"hidden","补录人物在旧局不自动建立新势力");
for(const id of addedForces){
  const data=structuredClone(coalition),game=new GameState(data,{playerForceId:id});
  assert.equal(game.selected.value.force,id,`${id} 开局应选中己方城池`);
  game.endTurn();assert.equal(game.turn,2,`${id} 必须能推进一日`);
}
console.log("反董新增势力可玩性与旧存档隔离通过：12 个新势力逐一开局 / 旧局势力、领地、人口、日期保留 / 新人物不引用不存在的势力");
for(const [source,newIds] of [[guandu,["shi_xie","zhang_jin","handan_shang","zhang_meng","wei_duan"]],[redCliffs,["ma_chao","han_sui","zhang_meng","wei_kang","shi_xie","wu_ju"]]]){
  for(const id of newIds){const game=new GameState(structuredClone(source),{playerForceId:id});assert.equal(game.selected.value.force,id);game.endTurn();assert.equal(game.turn,2,`${source.scenario.id} ${id} 无法推进一日`)}
  const old=structuredClone(source),added=new Set(newIds);
  old.forces=old.forces.filter(force=>!added.has(force.id));old.armies=old.armies.filter(army=>!added.has(army.force));old.officers=old.officers.filter(officer=>!officer.id.startsWith("history_"));
  for(const officer of old.officers)if(added.has(officer.force)){officer.force="neutral";officer.status="hidden"}
  for(const city of old.cities)if(added.has(city.force)){city.force="neutral";city.governor="—"}
  for(const county of old.counties)if(added.has(county.force))county.force="neutral";
  const prior=new GameState(old,{playerForceId:source.scenario.default_player_force}),city=prior.data.cities.find(city=>city.id==="jiaozhi");city.force="cao";city.population=17321;prior.turn=12;prior.date.day=12;
  const save=prior.serialize(),next=new GameState(structuredClone(source));next.applySave(next.migrateSave(save));
  assert.deepEqual(next.data.forces.map(force=>force.id),prior.data.forces.map(force=>force.id));assert.equal(next.turn,12);assert.equal(next.date.day,12);assert.equal(next.data.cities.find(city=>city.id==="jiaozhi").force,"cao");assert.equal(next.data.cities.find(city=>city.id==="jiaozhi").population,17321);
  const forceIds=new Set(next.data.forces.map(force=>force.id));for(const officer of next.data.officers)assert(forceIds.has(officer.force),`${source.scenario.id} 旧存档存在人物悬空势力引用：${officer.name}`);
}
console.log("官渡、赤壁新增势力与存档隔离通过：11 个新势力逐一开局 / 旧局势力、领地、人口、日期保留");
for(const id of ["194_puyang","211_tongguan","219_xiangyang"]){
  const source=await loader.loadScenario(id);
  for(const forceId of source.scenario.playable_forces){const game=new GameState(structuredClone(source),{playerForceId:forceId});assert.equal(game.selected.value.force,forceId,`${id} ${forceId} 开局应选中己方城池`);game.endTurn();assert.equal(game.turn,2,`${id} ${forceId} 无法推进一日`)}
  const serving=source.officers.filter(officer=>officer.status==="serving");
  for(const forceId of source.scenario.playable_forces)assert(serving.some(officer=>officer.force===forceId&&officer.loyalty===100),`${id} ${forceId} 缺少君主`);
  console.log(`${id}: ${source.scenario.playable_forces.length} 个可选势力逐一开局推进 / ${serving.length} 名在任人物`);
}
