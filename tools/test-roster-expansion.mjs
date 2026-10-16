// 实际加载六剧本，核对人物/驻地/世家关联与存档往返，防止只增加名册数量而没有有效配置。
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import assert from "node:assert/strict";
import {fileURLToPath} from "node:url";
import {batch,people,newClans,clanUpdates} from "./roster-expansion-data.mjs";

const root=fileURLToPath(new URL("..",import.meta.url)),read=p=>JSON.parse(fs.readFileSync(path.join(root,p),"utf8"));
globalThis.window=globalThis;globalThis.location={protocol:"http:"};
globalThis.fetch=async url=>{try{return {ok:true,status:200,json:async()=>read(String(url).replace(/^\//,""))}}catch{return {ok:false,status:404}}};
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,opts={}){super(type);this.detail=opts.detail}};
for(const file of ["data-loader","game-clock","fiscal-system","rule-engine","game-state"])await import(`../js/core/${file}.js`);
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load({useSavedMap:false});
const table=read("game/data/history/officer_postings.json"),supplement=read("game/data/history/officers_supplement.json").officers.filter(o=>o.expansionBatch===batch);
assert.equal(supplement.length,people.length);
assert.equal(new Set(supplement.map(o=>o.id)).size,people.length);
assert.equal(new Set(supplement.map(o=>o.name)).size,people.length);
for(const o of supplement){assert(o.sourceUrl&&o.basis&&o.chronologyBasis&&o.homeCity,o.name);assert.equal(o.birthYear,null);for(const key of ["command","war","intelligence","politics","charm"])assert(Number.isFinite(o[key])&&o[key]>=0&&o[key]<=100,`${o.name} ${key}`)}
const baseline={190:187,194:245,200:257,208:201,211:237,219:204,222:208,228:177};let late;
for(const entry of read("game/data/history/scenarios/index.json").scenarios){
  const data=await loader.loadScenario(entry.id,{useSavedMap:false}),year=Number(entry.id.slice(0,3)),cities=new Map(data.cities.map(c=>[c.id,c])),byName=new Map(data.officers.map(o=>[o.name,o]));
  assert.deepEqual(data.meta.officerPostings.skipped,[],entry.id);
  const rows=table.scenarios[entry.id].filter(p=>p.expansionBatch===batch);
  for(const row of rows){const o=byName.get(row.staff[0]);assert(o,`${entry.id} ${row.staff[0]}`);assert.equal(o.city,row.city,`${entry.id} ${o.name} 必须落到指定城镇`);assert(o.stationBasis&&o.stationSourceUrl,`${o.name} 有配置依据`);assert((o.debutYear||0)<=year);assert(!o.deathYear||o.deathYear>=year);
    if(row.free){assert.equal(o.force,"neutral");assert(["hidden","free"].includes(o.status))}else{assert.equal(o.status,"serving");assert.equal(o.force,row.force);assert.equal(cities.get(o.city).force,o.force)}
  }
  for(const o of data.officers.filter(o=>o.expansionBatch===batch))assert(cities.has(o.homeCity),`${entry.id} ${o.name} 在野有真实城镇，不能用编号随机落城`);
  const serving=data.officers.filter(o=>o.status==="serving");if(year in baseline)assert(serving.length>=baseline[year]+40,`${entry.id} 在任人物有实质扩充`);// 184 黄巾为逐人手配的新剧本，无扩充前基线
  // 六剧本共同的在野学者，不因城镇属于某势力就自动成为其臣下。
  for(const name of ["郑玄","胡昭","王烈","刘熙","任安"]){const o=byName.get(name);if(o)assert.notEqual(o.status,"serving",`${entry.id} ${name} 保持在野/未登场`)}
  const game=new GameState(structuredClone(data),{playerForceId:data.scenario.default_player_force});
  assert.deepEqual(game.court.skipped,[],`${entry.id} 汉庭任命全数落地`);assert.deepEqual(game.forceCommandSkipped,[],`${entry.id} 幕府任命全数落地`);
  for(const record of data.hanCourt.scenarios[entry.id].rosterExpansion.offices){const [office,name,seat,,self]=record.tuple,officer=game.data.officers.find(o=>o.name===name);const held=game.court.offices.find(p=>p.office===office&&p.officerId===officer.id&&p.seat===seat);assert(held,`${entry.id} ${name} 汉官到任`);assert.equal(held.self,self);assert.equal(held.grantedBy,self?officer.force:"court")}
  for(const [force,config] of Object.entries(data.officerPostings.commands[entry.id])){
    const command=game.forceCommand[force];for(const [role,name] of Object.entries(config.central||{}))assert.equal(game.data.officers.find(o=>o.id===command.central[role])?.name,name,`${entry.id} ${force} ${role}`);
    for(const seed of config.posts||[]){const post=Object.values(command.posts).find(p=>game.engine.postHolder(p)?.name===seed.holder);assert(post,`${entry.id} ${seed.holder} 方面到任`);assert(game.engine.postCities(post,force).length);if(post.parentId){const parent=command.posts[post.parentId];assert(parent);assert(game.engine.scopeWithin(post.scope,parent.scope))}}
    const posts=Object.values(command?.posts||{}),holders=posts.filter(p=>!game.engine.isCivilPrefectPost(p)).map(p=>p.holderId);assert.equal(new Set(holders).size,holders.length,"一人一个非民政方面，允许兼领实际郡职");const prefects=posts.filter(p=>game.engine.isCivilPrefectPost(p)).map(p=>p.scope.commanderies[0]);assert.equal(new Set(prefects).size,prefects.length,"每郡仅有一个实际郡守方面");
  }
  assert(game.data.armies.filter(a=>a.force===game.playerForceId).every(a=>!a.postId),"玩家开局军团保留主公直辖");
  for(const clan of newClans){assert(game.clans.byId[clan.id]?.seatIds?.length,`${clan.id} 有祖居定位`);if(clan.landless)assert.deepEqual(game.engine.clanDistribution(game,clan.id),[],`${clan.id} 仅建谱不虚构地主田产`);else assert(game.engine.clanDistribution(game,clan.id).some(p=>p.seat),`${clan.id} 有祖居地产`)}
  for(const update of clanUpdates)for(const name of update.members){const o=byName.get(name);if(o)assert.equal(game.engine.officerClan(o)?.id,update.id,`${name} 关联正确世家`)}
  for(const [name,id] of [["吉茂","ji_fengyi"],["王祐","wang_guanghan"],["李仁","li_zitong"],["李譔","li_zitong"],["李朝","li_gh"],["李邵","li_gh"],["来敏","lai_ny"],["费观","fei_jx"],["张就","zhang_dh"]]){const o=byName.get(name);if(o)assert.equal(game.engine.officerClan(o)?.id,id,name)}
  for(const name of ["丁斐","夏侯存","董衡","董超"]){const o=byName.get(name);if(o)assert.equal(game.engine.officerClan(o),null,`${name} 不因同姓强合族`)}
  // 不能把地方随驻者自动任成县令；县令仍由世家机制产生。
  for(const c of game.data.cities.filter(c=>c.countyNode))assert(!c.governorBasis,`${c.name} 不授推定太守`);
  console.log(`${entry.id}：在任 ${serving.length} / 配置 ${rows.length} / 世家 ${data.clans.length}`);
  if(year===219)late={game,data};
}
const {game,data}=late,o=game.data.officers.find(o=>o.name==="来敏");o.loyalty=31;o.city="chengdu";
const beforeShares=structuredClone(game.clans.byId.lai_ny.presence);game.clans.byId.lai_ny.favor.liu=17;
const snapshot=game.serialize(),restored=new GameState(structuredClone(data));restored.applySave(restored.migrateSave(snapshot));
assert.equal(restored.data.officers.find(person=>person.id===o.id).loyalty,31);
assert.equal(restored.data.officers.find(o=>o.name==="来敏").city,"chengdu");
assert.deepEqual(restored.clans.byId.lai_ny.presence,beforeShares);assert.equal(restored.clans.byId.lai_ny.favor.liu,17);
// 已是 v2 的旧档补入新世家时也应有支脉；原世家的动态地产、好感不能被重建覆盖。
const old=structuredClone(snapshot);for(const clan of newClans)delete old.clans.byId[clan.id];old.clans.version=2;
old.clans.byId.xun.favor.cao=19;old.clans.byId.xun.presence.luoyang=.65;const oldShares=structuredClone(old.clans.byId.xun.presence);
const upgraded=new GameState(structuredClone(data));upgraded.applySave(upgraded.migrateSave(old));
assert(upgraded.engine.clanDistribution(upgraded,"lai_ny").some(p=>p.branch),"旧档的新来氏补齐蜀中支脉");
assert.deepEqual(upgraded.clans.byId.xun.presence,oldShares);assert.equal(upgraded.clans.byId.xun.favor.cao,19);
const xun=game.engine.clanKinGraph("xun"),gen=n=>xun.nodes.find(x=>x.name===n)?.generation;
assert(gen("荀爽")<gen("荀棐"));assert.equal(gen("荀棐"),gen("荀彧"));
// 人物分驻导致基线官员字段变化时，旧地图指纹只在指定新基线上兼容；完整保留用户地图。
for(const file of ["core/map-grid","core/map-editor-drafts","ui/map-editor","core/scenario-map-store"])await import(`../js/${file}.js`);
const mapLoader=new DataLoader(sandbox.window.SANGUO_DATA);await mapLoader.load({useSavedMap:false});const mapBase=await mapLoader.loadScenario("200_guandu",{useSavedMap:false}),compat=mapBase.officerPostings.mapCompatibility[mapBase.scenario.id];
assert.equal(ScenarioMapStore.fingerprint(mapBase),compat.current);
const patchSource=structuredClone(mapBase);patchSource.officers=[];patchSource.armies=[];
const editor=new MapEditor(patchSource);editor.removeCity("xian_01_04");editor.updateCity("xuchang",{name:"玩家命名"});editor.clearWaterways();
const patch=editor.exportPatch(),record={version:1,scenarioId:mapBase.scenario.id,baseFingerprint:compat.previous[0],patch};
const prepared=ScenarioMapStore.prepare(mapBase,record);assert.equal(prepared.cities.find(c=>c.id==="xuchang").name,"玩家命名");assert.deepEqual(prepared.map.terrain,patch.map.terrain);assert.deepEqual(prepared.map.waterways,[]);
const cityIds=new Set(prepared.cities.map(c=>c.id));for(const o of prepared.officers)assert(cityIds.has(o.city),`${o.name} 适配已保存节点`);
assert.notEqual(prepared.officers.find(o=>o.name==="荀棐").city,"xian_01_04");assert.equal(mapBase.officers.find(o=>o.name==="荀棐").city,"xian_01_04","适配不污染原始人物配置");
const otherBase=structuredClone(mapBase);otherBase.cities[0].name="其他地图变更";assert(!ScenarioMapStore.matchesBase(otherBase,compat.previous[0]),"兼容不能放行无关地图改动");
const oldGame=new GameState(structuredClone(prepared)),oldSave=oldGame.serialize(),expansionIds=new Set(supplement.map(o=>o.id));oldSave.world.officers=oldSave.world.officers.filter(o=>!expansionIds.has(o.id));
const oldId=oldSave.world.officers[0].id;oldSave.world.officers[0].loyalty=23;
oldSave.world.mapEditor={version:1,map:prepared.map,administrativeDivisions:prepared.administrativeDivisions};
const restoredOldMap=new GameState(structuredClone(mapBase));restoredOldMap.applySave(restoredOldMap.migrateSave(oldSave));
assert.equal(restoredOldMap.data.officers.find(o=>o.id===oldId).loyalty,23);assert.deepEqual(restoredOldMap.data.map.terrain,prepared.map.terrain);
for(const o of restoredOldMap.data.officers.filter(o=>o.expansionBatch===batch))assert(cityIds.has(o.city),`${o.name} 在旧战局补入时有有效驻地`);
console.log("人物扩充通过：六剧本有效驻地 / 年代 / 不强征隐士 / 世家祖居与族谱 / 不按姓氏误并 / 存档进度保留");
