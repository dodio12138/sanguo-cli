// 持续野战：每日交锋、增援、军粮、撤退与存档恢复。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
import {appSource} from "./app-source.mjs";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
for(const file of ["js/core/data-loader.js","js/core/game-clock.js","js/core/fiscal-system.js","js/core/rule-engine.js","js/core/game-state.js"])await import(pathToFileURL(path.join(root,file)));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA),data=await loader.load(),scenario=await loader.loadScenario("200_guandu");
assert(data.rules.battle?.max_rounds,"game_rules 含 battle 段");

// 在官渡附近找一处两军可交战的据点：攻方自相邻己方城出发
const fresh=()=>{const game=new GameState(structuredClone(scenario),{playerForceId:"liu"}),e=game.engine;game.diplomacy.wars.push("yuan");
  const site=game.data.cities.find(c=>c.force==="cao"&&(game.data.rules.city_graph[c.id]||[]).length),from=game.data.cities.find(c=>c.id===game.data.rules.city_graph[site.id][0]);
  const make=(id,force,soldiers,extra={})=>{const army={id,name:`${id}军`,force,city:site.id,commander:"无名将",soldiers,units:{infantry:soldiers,cavalry:0,archers:0},morale:70,training:60,supply:100,valor:0,tactic:"balanced",formation:"balanced",stance:"驻扎",stores:{gold:0,food:0,silk:0},...extra};game.hydrateArmy(army);game.data.armies.push(army);return army};
  return {game,e,site,from,make}};
const setup=()=>{const f=fresh();f.game.data.armies=[];f.from.force="yuan";f.site.force="yuan";f.e.declareWorldWar(f.game,"yuan","cao",[],"测试");const a=f.make("A","yuan",10000),d=f.make("D","cao",10000);return {...f,a,d}};
{
 const {game,e,site,from,a,d,make}=setup(),events=[],before=a.soldiers;
 assert.equal(e.startFieldBattle(a,[d],from,site,"road",game,events),false);
 assert.equal(events.find(v=>v.rounds)?.rounds.length,1,"第一天只交锋一轮");
 assert(a.engagement&&a.engagementId&&d.engagementId,"双方保持接战");assert(a.soldiers<before&&a.soldiers>before*.9);
 assert.equal(FiscalSystem.armyRationProfile(game,a).mode,"field","交战使用战备口粮");assert.equal(FiscalSystem.canFarmArmy(game,a),false);
 const stable=a.soldiers;e.advanceFieldBattles(game,[]);assert.equal(a.soldiers,stable,"同一天不重复交锋");
 const helper=make("A2","yuan",2000);e.startFieldBattle(helper,[d],from,site,"road",game,events);assert(a.engagement.attackers.includes(helper.id),"增援加入原战局");assert.equal(a.soldiers,stable);
 const save=JSON.parse(JSON.stringify(game.serialize())),restored=new GameState(structuredClone(scenario),{initializeGrain:false});restored.applySave(restored.migrateSave(save));
 assert.deepEqual(restored.data.armies.find(v=>v.id==="A").engagement,a.engagement,"战局完整存档");
 for(let day=0;day<10&&game.data.armies.some(v=>v.engagement);day++){game.turn++;restored.turn++;e.advanceFieldBattles(game,events);restored.engine.advanceFieldBattles(restored,[])}
 assert(!game.data.armies.some(v=>v.engagementId||v.engagement),"战局最终结束并释放引用");
 assert.deepEqual(restored.data.armies.map(v=>[v.id,v.soldiers,v.morale,v.retreat]),game.data.armies.map(v=>[v.id,v.soldiers,v.morale,v.retreat]),"读档后的持续战斗与原局一致");
 assert(events.some(v=>v.battleDays>1&&v.result!=="ongoing"),"跨日战报记录持续天数");
}
{
 const {game,e,site,from,a,d}=setup();e.startFieldBattle(a,[d],from,site,"road",game,[]);game.playerForceId="yuan";e.playerForceId="yuan";
 e.resolveOrder(game,{type:"retreat",armyIds:[a.id],cityIds:[from.id]},[]);
 assert(!a.engagementId&&a.retreat,"玩家可以脱离接战");assert.equal(a.city,site.id,"撤退不瞬移");
 game.turn++;e.advanceFieldBattles(game,[]);assert(!game.data.armies.some(v=>v.engagement||v.engagementId),"单方撤离后战局清理");
}
{
 const {game,e,site,from,a,d}=setup();a.city=from.id;a.route=[site.id];a.legElapsed=1000;a.marchProvisions=true;
 e.advanceArmies(game,[]);assert(a.engagement,"实际行军到达触发持续战斗");assert.equal(a.stance,"交战中");const days=a.engagement.days;
 game.turn++;e.advanceArmies(game,[]);assert.equal(a.engagement?.days,days+1,"实际日推进继续战斗");
}
{
 const {game,e,site,from,a,d,make}=setup();d.morale=42;d.retreatLine=60;const reserve=make("D2","cao",10000,{morale:90});
 e.startFieldBattle(a,[d,reserve],from,site,"road",game,[],{retreatTo:new Map([[d,from],[reserve,from]])});
 assert(d.retreat&&!d.engagementId,"一军先退不必等待全军撤退");assert(reserve.engagementId&&a.engagement,"其余军团继续接战");
 game.turn++;e.advanceFieldBattles(game,[]);assert(a.engagement?.record.D,"退出军团损失仍记在原战局");
}
{
 const {game,e,site,from,a,d,make}=setup();const helper=make("A2","yuan",10000);e.startFieldBattle(a,[d],from,site,"road",game,[]);
 game.playerForceId="yuan";e.playerForceId="yuan";e.resolveOrder(game,{type:"retreat",armyIds:[a.id],cityIds:[from.id]},[]);game.turn++;e.advanceFieldBattles(game,[]);
 assert(!a.engagement&&helper.engagement,"领军撤退时战局转交存续军团");assert.equal(game.data.armies.filter(v=>v.engagement).length,1,"同一战局只保留一份");
}
{
 const {game,e,site,from,a,d}=setup();e.startFieldBattle(a,[d],from,site,"road",game,[]);game.data.armies=game.data.armies.filter(v=>v!==a);game.turn++;e.advanceFieldBattles(game,[]);assert(!d.engagementId,"领军被外部系统移除后清理孤立战局引用");
}
console.log("持续野战：逐日、增援、战备粮耗、存档、撤退、行军接战通过");
