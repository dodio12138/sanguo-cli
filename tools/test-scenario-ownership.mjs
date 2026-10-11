import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
globalThis.fetch=async url=>{
  const relative=String(url).replace(/^\//,"");
  try{const body=fs.readFileSync(path.join(root,relative),"utf8");return {ok:true,status:200,json:async()=>JSON.parse(body)}}
  catch{return {ok:false,status:404,json:async()=>({})}}
};
await import(pathToFileURL(path.join(root,"js/core/data-loader.js")));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();

// 生成器在演练模式下会校验归属表是否覆盖全部据点；缺项即抛错。
execFileSync(process.execPath,[path.join(root,"tools/build-scenario-ownership.mjs")],{cwd:root,stdio:"pipe"});

const catalog=JSON.parse(fs.readFileSync(path.join(root,"game/data/history/scenarios/index.json"),"utf8"));
let checked=0;
for(const entry of catalog.scenarios){
  const data=await loader.loadScenario(entry.id),byId=new Map(data.cities.map(city=>[city.id,city])),forceIds=new Set(data.forces.map(force=>force.id));
  for(const city of data.cities)if(!forceIds.has(city.force))throw new Error(`${entry.id} 据点 ${city.id} 归属势力无效：${city.force}`);
  for(const force of data.forces){
    const owned=data.cities.filter(city=>city.force===force.id);
    if(force.id!=="neutral"&&!owned.length)throw new Error(`${entry.id} 势力 ${force.id} 没有据点`);
    const seats=owned.filter(city=>(city.type||"city")==="city").length;
    if(force.cities!==seats)throw new Error(`${entry.id} 势力 ${force.id} 的据点数 ${force.cities} 与归属派生值 ${seats} 不一致`);
  }
  for(const officer of data.officers){
    if(officer.status!=="serving"||officer.force==="neutral")continue;
    const city=byId.get(officer.city);
    if(city&&city.force!==officer.force)throw new Error(`${entry.id} 人物 ${officer.name} 驻地 ${officer.city} 属于 ${city.force}`);
  }
  for(const army of data.armies){const city=byId.get(army.city);if(city&&city.force!==army.force)throw new Error(`${entry.id} 军团 ${army.name} 驻地 ${army.city} 属于 ${city.force}`)}
  checked++;console.log(`${entry.id}: ${data.forces.length-1} 个势力 / ${data.cities.length} 据点归属与驻军一致（含塞外 ${data.cities.filter(city=>city.commandery==="塞外区域").length} 据点）`);
}
if(checked<3)throw new Error("剧本归属回归至少需要覆盖三个剧本");
console.log("三剧本城池归属通过：生成器覆盖完整 / 据点数与归属一致 / 人物与军团驻地不越界");
