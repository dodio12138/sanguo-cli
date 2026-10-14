// 开局任官：各剧本史载（或演义）太守到位、太守须驻城且同势力、人物不再扎堆一城。
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
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();
const table=JSON.parse(fs.readFileSync(path.join(root,"game/data/history/officer_postings.json"),"utf8")),vacant=g=>!g||["—","普通官员","无"].includes(g);
const expect={"200_guandu":{chenliu:"夏侯渊",guandu:"曹洪",changan:"钟繇",runan:"满宠",xiaopei:"刘备",commandery_city_050:"吴景"},"208_red_cliffs":{ye:"王修",runan:"李通",xiakou:"刘琦",commandery_city_050:"孙瑜"},"211_tongguan":{yiling:"向朗",jianing:"董和",cangwu:"步骘",jiangling:"关羽"},"219_xiangyang":{commandery_city_111:"张郃",anding:"杨秋",commandery_city_121:"陈震",hanzhong:"魏延"},"190_coalition":{hongnong:"牛辅",commandery_city_031:"陶谦"},"194_puyang":{commandery_city_057:"张肃"}};
for(const id of Object.keys(table.scenarios)){const data=await loader.loadScenario(id),byName=new Map(data.officers.filter(o=>o.status==="serving").map(o=>[o.name,o]));
  // 太守须为本势力在任且驻在该城
  for(const city of data.cities){if(vacant(city.governor))continue;const o=byName.get(city.governor);assert(o&&o.force===city.force&&o.city===city.id,`${id} ${city.name} 太守 ${city.governor} 须为本势力在任且驻城`)}
  for(const [cityId,name] of Object.entries(expect[id]||{}))assert.equal(data.cities.find(c=>c.id===cityId).governor,name,`${id} ${cityId} 应由 ${name} 出任`);
  // 不再扎堆：君主所在城不超过任官表与上限之大者，其余城不超过 10 人（任官表点名的随驻人物不计上限）
  const pinned=new Set(table.scenarios[id].flatMap(p=>[p.governor,...p.staff]).filter(Boolean)),family=new Set(table.family),count=new Map();for(const o of byName.values())if(!pinned.has(o.name)&&!family.has(o.name))count.set(o.city,(count.get(o.city)||0)+1);
  for(const [cityId,n] of count)assert(n<=table.caps.capital,`${id} ${cityId} 未列入任官表者仍扎堆 ${n} 人`);
  assert.deepEqual(data.meta.officerPostings.skipped,[],`${id} 任官表人物须都能载入`);
  const named=data.cities.filter(c=>!c.countyNode&&c.force!=="neutral"&&!vacant(c.governor)).length;console.log(`${id}：具名太守 ${named} 处，史载 ${data.cities.filter(c=>c.governorBasis==="history").length}、推定 ${data.cities.filter(c=>c.governorBasis==="estimate").length}`)}
console.log("开局任官通过：太守驻城且同势力 / 史载太守到位 / 不再扎堆 / 任官表人物齐全");
