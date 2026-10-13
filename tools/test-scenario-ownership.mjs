import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {execFileSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";

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
if(checked<6)throw new Error("剧本归属回归至少需要覆盖六个剧本");
const coalition=await loader.loadScenario("190_coalition",{useSavedMap:false}),original=await loader.loadScenario("200_guandu",{useSavedMap:false});
const expected={chenliu:"zhang_miao",qiao:"cao",henei:"wang_kuang",commandery_city_002:"wang_kuang",xuchang:"kong_zhou",guandu:"kong_zhou",commandery_city_008:"kong_zhou",commandery_city_010:"kong_zhou",commandery_city_012:"liu_chong",puyang:"qiao_mao",baima:"qiao_mao",yanjin:"qiao_mao",commandery_city_029:"yuan_yi",commandery_city_028:"bao_xin",guangling:"zhang_chao",jianye:"zhou_xin",commandery_city_050:"zhou_xin",shouchun:"chen_wen",hefei:"chen_wen",lujiang:"chen_wen",wu:"chen_wen",kuaiji:"chen_wen",chaisang:"chen_wen",yuzhang:"chen_wen",linzi:"jiao_he",beihai:"kong_rong",jiaozhi:"shi_xie",commandery_city_103:"shi_xie"};
for(const [id,force] of Object.entries(expected))assert.equal(coalition.cities.find(city=>city.id===id)?.force,force,`190 年 ${id} 的归属不能缺失或提前到后期`);
assert.equal(coalition.cities.filter(city=>city.force==="neutral"&&!city.countyNode).length,19,"剩余地方官府仅限待考、边郡与史籍错配节点");
for(const county of coalition.cities.filter(city=>city.countyNode)){const seat=coalition.cities.find(city=>city.commanderySeatNode&&city.commandery===county.commandery);if(seat)assert.equal(county.force,seat.force,`190 年县邑${county.name}应随${county.commandery}治所归属`)}
for(const [name,assignment] of Object.entries(coalition.scenario.patch.officer_assignments)){
  const officers=coalition.officers.filter(officer=>officer.name===name&&officer.status==="serving");
  assert.equal(officers.length,1,`${name} 必须真正载入且不能重复`);assert.equal(officers[0].force,assignment.force);assert.equal(officers[0].city,assignment.city);
}
for(const county of coalition.counties){const city=coalition.cities.find(city=>city.id===county.jurisdictionCityId);if(city)assert.equal(county.force,city.force,`${county.name} 应继承辖城归属`)}
for(const id of coalition.scenario.playable_forces){
  assert(coalition.officers.some(officer=>officer.force===id&&officer.status==="serving"),`${id} 必须有可用主将`);
  assert(coalition.cities.some(city=>city.force===id&&(city.type||"city")==="city"),`${id} 必须有可控制城市`);
}
for(const [id,name] of Object.entries(coalition.scenario.patch.governors))assert.equal(coalition.cities.find(city=>city.id===id)?.governor,name,`${id} 郡治官员不能被初始化清掉`);
assert.deepEqual(coalition.map,original.map,"剧本归属补全不允许修改海陆、州郡、道路与河流");
assert.deepEqual(coalition.cities.map(({id,name,x,y})=>({id,name,x,y})),original.cities.map(({id,name,x,y})=>({id,name,x,y})),"城池坐标与名称保持不变");
const fixture=structuredClone(coalition.scenario);fixture.patch.extra_officers.push(structuredClone(fixture.patch.extra_officers.find(officer=>officer?.name==="士燮")),{id:"duplicate_wang_kuang",name:"王匡"});
const roster=loader.buildScenarioOfficers(coalition,fixture,await loader.loadOfficerReference());
assert.equal(roster.filter(officer=>officer.name==="士燮").length,1,"补充名册去重");assert.equal(roster.filter(officer=>officer.name==="王匡").length,1,"已有参考人物优先");
console.log("反董剧本补全通过：28 个可选势力 / 19 个待考地方节点 / 主将、驻军、郡治官员、县治归属 / 补充名册去重 / 定稿地图不变");
for(const [id,expected] of Object.entries({"200_guandu":{jiaozhi:"shi_xie",panyu:"shi_xie",cangwu:"zhang_jin",commandery_city_100:"zhang_jin",commandery_city_101:"zhang_jin",commandery_city_007:"ma_teng",tianshui:"wei_duan",xiliang:"zhang_meng",commandery_city_074:"handan_shang",commandery_city_094:"yuan"},"208_red_cliffs":{jiaozhi:"shi_xie",panyu:"shi_xie",cangwu:"wu_ju",commandery_city_100:"wu_ju",commandery_city_101:"shi_xie",commandery_city_007:"ma_chao",tianshui:"wei_kang",jincheng:"han_sui",xiliang:"zhang_meng",commandery_city_074:"zhang_meng",commandery_city_094:"cao"}})){
  const data=await loader.loadScenario(id,{useSavedMap:false});
  for(const [cityId,force] of Object.entries(expected))assert.equal(data.cities.find(city=>city.id===cityId)?.force,force,`${id} ${cityId} 的地方控制缺失`);
  assert.equal(data.cities.filter(city=>city.force==="neutral").length,1,`${id} 只保留日南错配的西卷待考节点`);
  for(const forceId of data.scenario.playable_forces){assert(data.officers.some(officer=>officer.force===forceId&&officer.status==="serving"),`${id} ${forceId} 缺少在任人物`);assert(data.cities.some(city=>city.force===forceId&&(city.type||"city")==="city"),`${id} ${forceId} 缺少城市`)}
  for(const county of data.counties){const city=data.cities.find(city=>city.id===county.jurisdictionCityId);if(city)assert.equal(county.force,city.force)}
  assert.deepEqual(data.map,original.map,`${id} 补全不改定稿几何`);
}
const redCliffs=await loader.loadScenario("208_red_cliffs",{useSavedMap:false});
for(const name of ["太史慈","凌操","巩志"])assert(!redCliffs.officers.some(officer=>officer.name===name&&officer.status==="serving"),`208 年不应继续任用 ${name}`);
assert.equal(redCliffs.armies.find(army=>army.force==="han_xuan").commander,"黄忠");
assert.equal(redCliffs.officers.find(officer=>officer.name==="马腾"&&officer.status==="serving")?.force,"cao","208 年马腾已经入朝，不与马超同时建立西北阵营");
console.log("官渡、赤壁地方势力补全通过：15 / 16 个可选势力 / 各仅 1 个待考节点 / 西北与交州分期归属 / 赤壁名册时点校订");
// 濮阳、潼关、襄阳：关键据点时点归属与人物卒年校正。
for(const [id,expected] of Object.entries({
  "194_puyang":{puyang:"lu_bu",chenliu:"lu_bu",xian_extra_04:"cao",xian_06_04:"cao",xiaopei:"liu",commandery_city_031:"tao_qian",shouchun:"yuan_shu",jianye:"liu_yao",kuaiji:"wang_lang",changan:"li_jue",henei:"zhang_yang",commandery_city_114:"zhang_yan",commandery_city_012:"liu_chong",hanzhong:"zhang_lu",linzi:"gongsun",beihai:"kong_rong",lujiang:"neutral"},
  "211_tongguan":{tongguan:"ma_chao",changan:"ma_chao",hongnong:"cao",anding:"han_sui",jiangling:"liu",xian_extra_08:"liu",xian_extra_14:"sun",xiakou:"sun",lujiang:"cao",xian_35_05:"sun",hanzhong:"zhang_lu",chengdu:"liu_zhang",tianshui:"cao",cangwu:"sun",jiaozhi:"shi_xie"},
  "219_xiangyang":{xiangyang:"cao",xian_extra_05:"cao",xian_09_04:"liu",jiangling:"liu",hanzhong:"liu",shangyong:"liu",changsha:"sun",guiyang:"sun",xian_extra_14:"sun",lujiang:"sun",hefei:"cao",panyu:"sun",jiaozhi:"shi_xie",xiangping:"gongsun_kang"}})){
  const data=await loader.loadScenario(id,{useSavedMap:false});
  for(const [cityId,force] of Object.entries(expected))assert.equal(data.cities.find(city=>city.id===cityId)?.force,force,`${id} ${cityId} 归属不符合开局时点`);
  for(const forceId of data.scenario.playable_forces){assert(data.officers.some(officer=>officer.force===forceId&&officer.status==="serving"),`${id} ${forceId} 缺少在任人物`);assert(data.cities.some(city=>city.force===forceId&&(city.type||"city")==="city"),`${id} ${forceId} 缺少城市`)}
  for(const county of data.counties){const city=data.cities.find(city=>city.id===county.jurisdictionCityId);if(city)assert.equal(county.force,city.force)}
  for(const [name,assignment] of Object.entries(data.scenario.patch.officer_assignments)){const officers=data.officers.filter(officer=>officer.name===name&&officer.status==="serving");assert.equal(officers.length,1,`${id} ${name} 必须真正载入且不能重复`);assert.equal(officers[0].force,assignment.force)}
  assert.deepEqual(data.map,original.map,`${id} 不改定稿几何`);
}
const tongguan=await loader.loadScenario("211_tongguan",{useSavedMap:false});
assert.equal(tongguan.officers.find(officer=>officer.name==="张卫").deathYear,undefined,"张卫卒年与参考库冲突时按不详处理");
assert(!tongguan.officers.some(officer=>["周瑜","太史慈","马超"].includes(officer.name)&&officer.status==="serving"&&officer.force==="cao"),"211 年名册时点");
assert.equal(tongguan.officers.find(officer=>officer.name==="马腾").force,"cao","211 年马腾仍在邺城");
const puyang=await loader.loadScenario("194_puyang",{useSavedMap:false});
assert.equal(puyang.officers.find(officer=>officer.name==="樊稠").deathYear,195,"樊稠按《后汉书》兴平二年被杀");
assert(!puyang.officers.some(officer=>["郭嘉","许褚","荀攸","诸葛亮","赵云"].includes(officer.name)&&officer.status==="serving"),"194 年尚未出仕者不得入列");
const xiangyangScenario=await loader.loadScenario("219_xiangyang",{useSavedMap:false});
assert(!xiangyangScenario.officers.some(officer=>["夏侯渊","鲁肃","庞统","周瑜","荀彧"].includes(officer.name)&&officer.status==="serving"),"219 年已故者不得入列");
assert.equal(xiangyangScenario.armies.find(army=>army.id==="liu_guanyu").city,"xian_09_04","关羽北伐军驻宜城");
console.log("濮阳、潼关、襄阳归属通过：22 / 9 / 5 个可选势力 / 关键据点时点 / 名册与卒年校正");
console.log("六剧本城池归属通过：生成器覆盖完整 / 据点数与归属一致 / 人物与军团驻地不越界");
