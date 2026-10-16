import fs from "node:fs";
import assert from "node:assert/strict";
import {batch,expandArmies,originalArmies} from "./expand-initial-armies.mjs";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const read=p=>JSON.parse(fs.readFileSync(p,"utf8"));
globalThis.fetch=async url=>({ok:true,json:async()=>read(String(url))});
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,o={}){super(type);this.detail=o.detail}};
for(const file of ["data-loader","game-clock","fiscal-system","rule-engine","game-state"])await import(`../js/core/${file}.js`);
await import("../js/data/offline-data.generated.js");
const loader=new DataLoader(SANGUO_DATA);await loader.load({useSavedMap:false});
const totals=armies=>Object.fromEntries([...new Set(armies.map(a=>a.force))].sort().map(force=>[force,armies.filter(a=>a.force===force).reduce((n,a)=>n+a.soldiers,0)]));
const unitTotals=armies=>Object.fromEntries([...new Set(armies.map(a=>a.force))].sort().map(force=>[force,armies.filter(a=>a.force===force).reduce((n,a)=>{for(const [type,count] of Object.entries(a.units))n[type]=(n[type]||0)+count;return n},{})]));
let added=0;
for(const entry of read("game/data/history/scenarios/index.json").scenarios){
  const data=await loader.loadScenario(entry.id,{useSavedMap:false}),original=originalArmies(data.armies),children=data.armies.filter(a=>a.initialDeployment?.batch===batch&&a.initialDeployment.splitFrom),cities=new Map(data.cities.map(c=>[c.id,c])),officers=new Map(data.officers.map(o=>[o.id,o]));
  added+=children.length;
  assert.equal(new Set(data.armies.map(a=>a.id)).size,data.armies.length);
  for(const force of data.forces){const sub=children.filter(a=>a.force===force.id);assert(sub.length<=1);assert(sub.reduce((n,a)=>n+a.soldiers,0)<=(totals(original)[force.id]||0)*.25);assert(sub.every(a=>a.soldiers>=3000));}
  assert.deepEqual(totals(data.armies),totals(original),`${entry.id} 势力总兵力守恒`);
  assert.deepEqual(unitTotals(data.armies),unitTotals(original),`${entry.id} 各兵种守恒`);
  assert.deepEqual(expandArmies(data).armies,data.armies,`${entry.id} 生成幂等`);
  const named=new Set();
  for(const army of children){
    const o=officers.get(army.commanderOfficerId),city=cities.get(army.city),parent=data.armies.find(a=>a.id===army.initialDeployment.splitFrom);
    assert(o&&city&&parent,army.id);assert.equal(city.force,army.force);assert.equal(o.force,army.force);assert.equal(o.city,city.id);assert.equal(o.status,"serving");assert(!named.has(o.id));named.add(o.id);
    assert(!o.birthYear||o.birthYear<=Number(entry.id.slice(0,3)));assert(!o.deathYear||o.deathYear>=Number(entry.id.slice(0,3)));
    assert.equal(army.soldiers,Object.values(army.units).reduce((n,v)=>n+v,0));assert(Object.values(army.units).every(n=>Number.isInteger(n)&&n>=0));assert.equal(army.initialDeployment.basis,"inferred");
    assert(parent.soldiers>=parent.initialDeployment.originalSoldiers*.6);
  }
  const terrain=JSON.stringify(data.map),garrisons=data.cities.map(c=>c.garrison),state=new GameState(data,{playerForceId:data.scenario.player_force||data.scenario.default_player_force});
  for(const army of children){const o=officers.get(army.commanderOfficerId);assert.equal(o.armyId,army.id);assert.equal(o.armyRole,"commander");assert.equal(o.city,army.city);assert(state.engine.officerAssignment(o)?.army.id===army.id)}
  assert.deepEqual(data.cities.map(c=>c.garrison),garrisons);assert.equal(JSON.stringify(data.map),terrain);
  const save=structuredClone(state.serialize()),restored=new GameState(structuredClone(await loader.loadScenario(entry.id,{useSavedMap:false})),{playerForceId:state.playerForceId});
  restored.applySave(restored.migrateSave(save),"1");
  assert.deepEqual(restored.data.armies,state.data.armies,`${entry.id} 军队保存往返`);
  // 老战局的完整军队列表为权威数据：已裁撤、损失或尚无这些新部曲时，不得自动补发。
  const old=structuredClone(save);old.world.armies=structuredClone(original);old.world.armies[0].soldiers=1000;old.world.armies[0].units={infantry:1000,cavalry:0,archers:0};
  restored.applySave(restored.migrateSave(old),"1");
  assert.equal(restored.data.armies.length,original.length);assert.equal(restored.data.armies[0].soldiers,1000);
  restored.applySave(restored.migrateSave(old),"1");assert.equal(restored.data.armies.length,original.length);assert.equal(restored.data.armies[0].soldiers,1000);
  // 抽查新军能够通过现有粮仓接口领粮，军仓增加值必须等于地方库存减少值。
  const army=state.data.armies.find(a=>a.initialDeployment?.splitFrom)||state.data.armies[0],city=cities.get(army.city),target=FiscalSystem.armyFoodTarget(state,army);
  city.localFood=Math.max(city.localFood,target*2);army.stores.food=0;const food=city.localFood,drawn=FiscalSystem.stockArmy(state,army);
  assert(drawn>0);assert.equal(army.stores.food,drawn);assert.equal(food-city.localFood,drawn);
  console.log(`${entry.id}：${original.length} → ${data.armies.length}；兵力/兵种守恒、统属驻地、军职、领粮、旧档往返通过`);
}
console.log(`六剧本共新增 ${added} 支将领部曲。`);
