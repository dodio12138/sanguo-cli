import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";

const root=path.resolve(new URL("..",import.meta.url).pathname),read=file=>JSON.parse(fs.readFileSync(path.join(root,file),"utf8"));
globalThis.window=globalThis;globalThis.location={protocol:"http:"};globalThis.fetch=async url=>{const file=path.join(root,String(url).replace(/^\//,""));try{return {ok:true,status:200,json:async()=>JSON.parse(fs.readFileSync(file,"utf8"))}}catch{return {ok:false,status:404,json:async()=>({})}}};
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
await import(pathToFileURL(path.join(root,"js/core/data-loader.js")));await import(pathToFileURL(path.join(root,"js/core/game-clock.js")));await import(pathToFileURL(path.join(root,"js/core/fiscal-system.js")));await import(pathToFileURL(path.join(root,"js/core/rule-engine.js")));await import(pathToFileURL(path.join(root,"js/core/game-state.js")));
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA),data=await loader.load(),reference=read("game/data/reference/officers-san11.json").officers;
const expected=reference.filter(officer=>!officer.deathYear||officer.deathYear>=200),byId=new Map(data.officers.map(officer=>[officer.id,officer]));
if(data.officers.length<550||new Set(data.officers.map(officer=>officer.id)).size!==data.officers.length)throw new Error("官渡完整人物名册数量不足或 ID 重复");
for(const officer of expected)if(!byId.has(officer.id))throw new Error(`官渡名册缺少 ${officer.name}（${officer.id}）`);
for(const name of ["甘宁","黄忠","魏延","曹丕","周泰","王朗","贾逵","陈到","田豫","步骘"]){const officer=data.officers.find(item=>item.name===name);if(!officer||!["serving","hidden","not_appeared"].includes(officer.status))throw new Error(`代表人物 ${name} 未进入战局`)}
const cityIds=new Set(data.cities.map(city=>city.id)),forceIds=new Set(data.forces.map(force=>force.id));for(const officer of data.officers){if(!cityIds.has(officer.city)||!forceIds.has(officer.force))throw new Error(`${officer.name} 的驻地或势力引用无效`)}
for(const scenarioId of ["190_coalition","208_red_cliffs"]){const scenario=await loader.loadScenario(scenarioId),year=Number(String(scenario.scenario.start_date).split("-")[0]),minimum=reference.filter(officer=>!officer.deathYear||officer.deathYear>=year).length;if(scenario.officers.length<minimum)throw new Error(`${scenarioId} 未载入完整在世及未来人物：${scenario.officers.length}/${minimum}`)}
const state=new GameState(structuredClone(data),{playerForceId:"cao"}),snapshot=state.serialize(),saved=state.data.officers.find(officer=>officer.status==="serving");saved.loyalty=17;snapshot.world.officers=snapshot.world.officers.filter(officer=>data.officers.indexOf(byId.get(officer.id))<122);const restored=new GameState(structuredClone(data),{playerForceId:"cao"});restored.applySave(restored.migrateSave(snapshot));if(restored.data.officers.length!==data.officers.length)throw new Error("旧存档载入后没有自动补齐新增人物");if(restored.data.officers.find(officer=>officer.id===saved.id)?.loyalty!==17)throw new Error("旧存档中的人物进度未被保留");
const app=fs.readFileSync(path.join(root,"js/ui/app.js"),"utf8");if(!app.includes("scenarioOfficerSearch")||!app.includes("bindScenarioOfficerRoster")||!app.includes("o.id===officer.id"))throw new Error("人物名册分页或重名人物定位未接入界面");
console.log(`人物完整性测试通过：官渡 ${data.officers.length} 人 / 反董卓与赤壁完整载入 / 旧存档自动补员`);
