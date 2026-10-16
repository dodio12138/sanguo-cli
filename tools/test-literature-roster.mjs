// 真实六剧本：同名身份、家族父系、未成年/已故与保守可用上限、官制和旧局兼容。
import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import {newRecords,records,round,exclusions,literatureSources} from "./roster-literature-data.mjs";
import {literatureNewClans} from "./roster-literature-clans.mjs";
const read=p=>JSON.parse(fs.readFileSync(new URL(`../${p}`,import.meta.url),"utf8"));
globalThis.window=globalThis;globalThis.location={protocol:"http:"};globalThis.fetch=async p=>{try{return {ok:true,json:async()=>read(p)}}catch{return {ok:false,status:404}}};
if(!globalThis.CustomEvent)globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,o={}){super(type);this.detail=o.detail}};
for(const file of ["data-loader","game-clock","fiscal-system","rule-engine","game-state"])await import(`../js/core/${file}.js`);
const sb={window:{}};vm.runInNewContext(fs.readFileSync(new URL("../js/data/offline-data.generated.js",import.meta.url),"utf8"),sb);
const evidence=read("game/data/reference/literature-roster-evidence.json").records,byEvidence=new Map(evidence.map(r=>[r.name,r]));
assert.equal(byEvidence.size,records.length,"每个实际采用的人物有唯一原文见证");
for(const r of records){const e=byEvidence.get(r.name);assert(e,`${r.name} 原文`);assert.equal(e.sourceKey,r.sourceKey);assert.equal(e.sourceUrl,literatureSources[r.sourceKey].url);assert(/^[a-f0-9]{64}$/.test(e.rawSha256));assert(e.excerpt.length>30);assert(e.identityBasis&&e.layer&&e.needle)}
const supplements=read("game/data/history/officers_supplement.json").officers,newPeople=supplements.filter(o=>o.expansionRound===round);
assert.equal(newPeople.length,newRecords.length);assert.equal(new Set(newPeople.map(o=>o.name)).size,newRecords.length);
assert.equal(supplements.find(o=>o.id==="supp_ext_001").name,"郑泰");assert.equal(supplements.find(o=>o.id==="supp_ext_099").name,"董超","原99人的ID顺序不漂移");
for(const o of newPeople){assert(byEvidence.has(o.name));assert(o.sourceLayer&&o.evidenceRef);if(o.availableUntilYear)assert(o.availabilityBasis&&!o.deathYear,"活动上限不伪装成卒年")}
for(const name of Object.keys(exclusions))assert(!newPeople.some(o=>o.name===name),`${name} 待核或仅族谱条目不得计作新人物`);
const loader=new DataLoader(sb.window.SANGUO_DATA);await loader.load({useSavedMap:false});
const baseline={190:252,194:287,200:325,208:296,211:307,219:285};let final;
for(const s of read("game/data/history/scenarios/index.json").scenarios){
 const data=await loader.loadScenario(s.id,{useSavedMap:false}),year=Number(s.id.slice(0,3)),game=new GameState(structuredClone(data)),e=game.engine;
 assert.deepEqual(data.meta.officerPostings.skipped,[]);assert.deepEqual(game.court.skipped,[]);assert.deepEqual(game.forceCommandSkipped,[]);
 const cityById=new Map(data.cities.map(c=>[c.id,c]));
 for(const o of data.officers.filter(o=>o.expansionRound===round)){
  assert(cityById.has(o.city)&&cityById.has(o.homeCity),`${s.id} ${o.name} 有有效城镇`);
  assert(!o.availableUntilYear||o.availableUntilYear>=year,`${o.name} 不在最后可确认活动期后复活`);
  if(o.status==="serving"){assert((o.debutYear||0)<=year);assert(!o.deathYear||o.deathYear>=year);assert.equal(cityById.get(o.city).force,o.force);assert(o.stationBasis&&o.stationSourceUrl)}
 }
 for(const n of ["华佗","张臶","袁徽","征崇","唐固","庾乘","孟敏","乌延","丘力居","伊夷模","陶商","陶应"]){const o=data.officers.find(o=>o.name===n);if(o)assert.notEqual(o.status,"serving",`${n} 隐士/部落首领/不仕者不强征`)}
 if(year<230)for(const n of ["凌烈","凌封"]){const o=data.officers.find(o=>o.name===n);assert.equal(o.status,"not_appeared",`${n} 不把凌统幼子变成成年将领`)}
 if(year===219)for(const n of ["华佗","秦松","陈端","张承（河内）"]){assert(!data.officers.some(o=>o.name===n),`${n} 不越过保守可用上限`)}
 const graph=id=>e.clanKinGraph(id).edges,has=(id,a,b,rel)=>graph(id).some(x=>x.a===a&&x.b===b&&x.label===rel);
 assert(has("sun","孙邻","孙苗","父子"));assert(!has("sun","孙瑜","孙苗","父子"));
 assert(has("zhang_henei","张延","张承（河内）","父子"));assert(has("zhang_pc","张昭","张承","父子"));
 assert(has("zhang_wu","张允（吴郡）","张温","父子"));assert.equal(e.officerClan(data.officers.find(o=>o.name==="张允")),null,"荆州张允不误入吴郡张氏");
 const ma=data.officers.filter(o=>o.name==="马忠");assert.equal(e.officerClan(ma.find(o=>o.id==="koei11_514")),null);assert.equal(e.officerClan(ma.find(o=>o.id==="koei11_515"))?.id,"ma_baxi");
 assert.equal(e.clanMembers("ma_baxi").filter(o=>o.name==="马忠").length,1);assert.equal(e.clanKinGraph("ma_baxi").nodes.find(n=>n.name==="马忠").officer.id,"koei11_515");
 assert(has("han_nanyang","韩肇","韩邦","父子"));assert(!has("han_nanyang","韩繇","韩邦","父子"));
 for(const c of literatureNewClans){assert(game.clans.byId[c.id]?.seatIds.length);if(c.landless)assert.deepEqual(e.clanDistribution(game,c.id),[])}
 const serving=data.officers.filter(o=>o.status==="serving");assert(serving.length>baseline[year]+30,`${s.id} 有实际出仕增量`);
 console.log(`${s.id}：在任 ${serving.length}（本轮 +${serving.length-baseline[year]}），新增在任覆盖 ${new Set(serving.filter(o=>o.expansionRound===round).map(o=>o.city)).size} 城镇`);
 if(year===219)final={data,game};
}
const {data,game}=final,save=game.serialize(),newIds=new Set(newPeople.map(o=>o.id));save.world.officers=save.world.officers.filter(o=>!newIds.has(o.id));
const laiId=data.officers.find(o=>o.name==="来敏").id,lai=save.world.officers.find(o=>o.id===laiId);lai.loyalty=29;lai.city="chengdu";
for(const c of literatureNewClans)delete save.clans.byId[c.id];save.clans.byId.xun.favor.cao=23;
const oldShares=structuredClone(save.clans.byId.xun.presence),court=structuredClone(save.court),command=structuredClone(save.forceCommand);
const restored=new GameState(structuredClone(data));restored.applySave(restored.migrateSave(save));
assert.equal(restored.data.officers.find(o=>o.id===lai.id).loyalty,29);assert.equal(restored.data.officers.find(o=>o.id===lai.id).city,"chengdu");
assert.deepEqual(restored.clans.byId.xun.presence,oldShares);assert.equal(restored.clans.byId.xun.favor.cao,23);assert.deepEqual(restored.court,court);assert.deepEqual(restored.forceCommand,GameState.unpackForceCommand(command));
for(const c of literatureNewClans)assert(restored.clans.byId[c.id],"旧局补齐新族谱");
console.log(`通过：${newRecords.length} 新人物原文见证、六剧本年代/驻地/任命、同名分族与旧局进度保留`);
