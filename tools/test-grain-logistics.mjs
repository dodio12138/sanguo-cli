import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
globalThis.fetch=async url=>{const relative=String(url).replace(/^\//,"");try{const body=fs.readFileSync(path.join(root,relative),"utf8");return {ok:true,status:200,json:async()=>JSON.parse(body)}}catch{return {ok:false,status:404,json:async()=>({})}}};
for(const file of ["map-grid","data-loader","game-clock","fiscal-system","rule-engine","game-state"])await import(pathToFileURL(path.join(root,`js/core/${file}.js`)));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();
const data=await loader.loadScenario("219_xiangyang",{useSavedMap:false});

// 开局府库：玩家与 AI 同一公式，随据点与兵力增减。
const liu=new GameState(structuredClone(data),{playerForceId:"liu"}),sun=new GameState(structuredClone(data),{playerForceId:"sun"});
const expected=FiscalSystem.startingResources(liu.data,liu.data.forces.find(force=>force.id==="liu"),276);
assert.equal(liu.resources.gold,expected.gold);assert.equal(liu.resources.food,expected.food);
assert.equal(sun.data.forces.find(force=>force.id==="liu").resources?.gold??FiscalSystem.startingResources(sun.data,sun.data.forces.find(force=>force.id==="liu")).gold,expected.gold,"同一势力由玩家或 AI 操控，开局钱数一致");
assert.notEqual(liu.resources.gold,new GameState(structuredClone(data),{playerForceId:"shi_xie"}).resources.gold,"开局府库随势力规模变化");

// 就近调粮：本郡（州）不足时先取境内其他城仓余粮，中央府库最后动用。
const state=new GameState(structuredClone(data),{playerForceId:"cao"});state.endTurn();
const city=state.data.cities.find(item=>item.id==="hanzhong"),force=state.data.forces.find(item=>item.id==="liu"),near=state.data.cities.filter(item=>item.force==="liu"&&Math.hypot(item.x-city.x,item.y-city.y)<=30);
const centralBefore=force.resources.food,granaryBefore=near.reduce((sum,item)=>sum+(item.localFood||0),0);
const drawn=FiscalSystem.drawRegionalFood(state,city,20000,"liu");
assert.equal(drawn,20000);assert.equal(force.resources.food,centralBefore,"境内城仓有余时不动用中央府库");assert(granaryBefore-near.reduce((sum,item)=>sum+(item.localFood||0),0)>=20000,"所调之粮出自境内城仓（含途损）");

// 一年推演：城仓有余的大势力，中央府库不在半年内被野战军抽空，军团低补给少见。
let lowSupply=0,armyDays=0;const central=new Map();
for(let day=1;day<=180;day++){state.endTurn();for(const army of state.data.armies){armyDays++;if((army.supply??100)<30)lowSupply++}}
for(const id of ["cao","sun","liu"]){const pool=state.data.forces.find(item=>item.id===id).resources;central.set(id,Math.round(pool.food));assert(pool.food>0,`${id} 半年内中央府库不应被抽空`)}
assert(lowSupply/armyDays<.1,`低补给军团占比 ${(lowSupply/armyDays*100).toFixed(1)}%`);
console.log(`粮秣转运通过：开局府库随势力规模 / 境内城仓先于中央 / 襄阳半年中央府库 ${[...central].map(([id,food])=>`${id}:${food}`).join(" ")} / 低补给 ${(lowSupply/armyDays*100).toFixed(1)}%`);
