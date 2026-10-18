// W1 战斗核心：分回合打到士气溃散 / 撤退线；伤亡三分；伤员康复；溃散归建；老兵增长、稀释与战力加成；口粮含伤员；存档往返。
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

// 单个伤员归队不能把零人数兵种扣成负数。
{
 const {game,e,site,make}=fresh(),army=make('recover','yuan',1000,{units:{infantry:500,cavalry:500,archers:0}});e.addRecovered(army,1,true);assert.equal(army.soldiers,1001);assert(Object.values(army.units).every(n=>n>=0),'伤员归建不能产生负兵种');
}
// 一名俘虏分给三军，不能舍掉或复制；按事件里的真实俘获总数守恒。
{
 const {game,e,site,from,make}=fresh();game.data.armies=[];Object.assign(game.data.rules.battle,{encircle_capture:.01,encircle_scatter_capture:0,max_rounds:1});e.retreatPath=()=>null;
 const a=make('A','yuan',5000),b=make('B','yuan',5000),c=make('C','yuan',5000),d=make('D','cao',100,{morale:0,retreatLine:0,wounded:0}),events=[];e.resolveFieldBattle(a,[d],from,site,'road',game,events);const captured=events.find(v=>v.rounds)?.captured;
 assert.equal(captured,1);assert.equal([a,b,c].reduce((n,v)=>n+e.prisonerCount(v.prisoners),0),captured,'多军俘虏分配必须守恒');
}
// 城中受围伤员不享有安全驻城疗养；刚断粮而补给尚未归零时也有伤员饥饿损失。
{
 const {game,e,site,make}=fresh();game.data.armies=[];site.force='yuan';site.order=100;const a=make('medical','yuan',1000,{wounded:1000});e.isCityBesieged=()=>true;e.resolveArmyMedical(game,[]);assert(a.soldiers-1000<=5,'围城不应按安全城内医疗率恢复');
 a.wounded=1000;a.soldiers=1000;a.units={infantry:1000,cavalry:0,archers:0};a.supply=92;a.stores.lastConsumption={turn:game.turn,need:100,short:100};e.isCityBesieged=()=>false;e.resolveArmyMedical(game,[]);const healed=a.soldiers-1000;assert(1000-a.wounded-healed>=40,'补给指标未归零也应识别当天断粮');
}
// 指定退路必须为真实相邻的己方／友方地点，不能把远方县城当作一个路段。
{
 const {game,e,site,from,make}=fresh(),a=make('retreat','yuan',1000);game.data.armies=[a];e.worldFriendly=(s,x,y)=>x===y;const remote=game.data.cities.find(c=>c.id!==site.id&&!(game.data.rules.city_graph[site.id]||[]).includes(c.id));remote.force='yuan';assert.notEqual(e.retreatPath(game,site,a,remote)?.id,remote.id,'不能指定远处县城瞬移退路');from.force='cao';assert.notEqual(e.retreatPath(game,site,a,from)?.id,from.id,'不能直接退入敌占县城');
}
// 未宣战的对峙不增加战法蓄势；无效战俘指令不能误释放所有俘虏。
{
 const {game,e,site,from,make}=fresh();game.playerForceId='yuan';game.diplomacy.wars=[];const a=make('A','yuan',1000,{valor:50}),d=make('D','cao',1000);e.resolveFieldBattle(a,[d],from,site,'road',game,[]);assert.equal(a.valor,50,'对峙不能刷战法蓄势');
 site.prisoners={cao:42};const before=JSON.stringify(site.prisoners);assert.equal(e.disposePrisoners(game,site.id,'unknown').ok,false);assert.equal(JSON.stringify(site.prisoners),before,'无效处置不能先移除俘虏');
}
// 归还驻军支持非整百的最大值和小额尾数；目标同步，避免下旬又自动抽回。
{
 const {game,e,site,make}=fresh();game.playerForceId='cao';e.playerForceId='cao';game.data.armies=[];site.force='cao';const a=make('return-all','cao',9521),garrison=site.garrison;e.resolveOrder(game,{type:'return_garrison',armyIds:[a.id],amount:9421},[]);assert.equal(a.soldiers,100);assert.equal(a.reinforcementTarget,100);assert.equal(site.garrison,garrison+9421);
 const b=make('return-tail','cao',166);e.resolveOrder(game,{type:'return_garrison',armyIds:[b.id],amount:66},[]);assert.equal(b.soldiers,100);
 for(const amount of [0,-1,1.5,1,999]){const before=JSON.stringify(a);e.resolveOrder(game,{type:'return_garrison',armyIds:[a.id],amount},[]);assert.equal(JSON.stringify(a),before,'非法归还数量不能先扣兵')}
}
// 即使总数相等，负兵种、非整数或未知兵种也不得绕过改编规则。
{
 const {game,e,make}=fresh();game.playerForceId='cao';e.playerForceId='cao';const a=make('reorganize','cao',1000);
 for(const units of [{infantry:-100,cavalry:1100,archers:0},{infantry:999.5,cavalry:.5,archers:0},{infantry:900,cavalry:0,archers:0,unknown:100}]){const before=JSON.stringify(a);e.resolveOrder(game,{type:'reorganize_army',armyIds:[a.id],options:{units}},[]);assert.equal(JSON.stringify(a),before,'非法兵种不能修改军团')}
}
// 道路交战中主动撤退保留接触点，不跳回路段端点。
{
 const {game,e,site,from,make}=fresh();game.playerForceId='yuan';e.playerForceId='yuan';site.force='yuan';game.data.armies=[];const a=make('road-withdraw','yuan',1000);a.route=[from.id];a.legFrom=site.id;a.legTo=from.id;a.legDays=e.armyLegDays(game,a);a.legElapsed=a.legDays*.4;a.engagementId='road-test';a.engagement={id:'road-test',siteId:site.id,fromId:from.id,roadPositions:[[a.id,{from:site.id,to:from.id,fraction:.4}]],record:{}};const before=e.armyWorldPosition(a);e.resolveOrder(game,{type:'retreat',armyIds:[a.id],cityIds:[site.id]},[]);const after=e.armyWorldPosition(a);assert(a.retreat);assert(Math.hypot(before.x-after.x,before.y-after.y)<1e-6,'道路撤退不能跳跃');
}
console.log('战斗审计回归：单人归建、俘虏整数分配、围城医疗、即时断粮、真实退路、对峙蓄势、无效战俘指令通过');

// 军团解散必须实际驻扎，军资与战俘移交地方；伤员不能随删军凭空消失。
{
 const {game,e,site,make}=fresh();game.playerForceId=e.playerForceId='yuan';site.force='yuan';game.data.armies=[];const a=make('disband','yuan',1000,{stores:{gold:17,food:23,silk:5},prisoners:{cao:31}}),before={gold:site.localGold,food:site.localFood,silk:site.localSilk||0,garrison:site.garrison};
 a.wounded=11;e.resolveOrder(game,{type:'disband_army',armyIds:[a.id]},[]);assert(game.data.armies.includes(a),'尚有伤员应保留原营');a.wounded=0;
 a.route=['bad'];e.resolveOrder(game,{type:'disband_army',armyIds:[a.id]},[]);assert(game.data.armies.includes(a),'行军不能按后方锚点销编');delete a.route;
 e.resolveOrder(game,{type:'disband_army',armyIds:[a.id]},[]);assert(!game.data.armies.includes(a));assert.equal(site.garrison,before.garrison+1000);assert.equal(site.localGold,before.gold+17);assert.equal(site.localFood,before.food+23);assert.equal(site.localSilk,before.silk+5);assert.equal(site.prisoners.cao,31);
}
// 编军与改编同样校验整数、已知兵种及非负兵数，拒绝负数增加守军的漏洞。
{
 const {game,e,site}=fresh();game.playerForceId=e.playerForceId='yuan';site.force='yuan';site.type='city';site.garrison=5000;
 const officer=game.data.officers.find(o=>o.force==='yuan'&&o.status==='serving'&&!e.officerAssignment(o));officer.city=site.id;
 for(const request of [{amount:-100},{amount:100.5},{amount:1000,options:{units:{infantry:-100,cavalry:1100,archers:0}}},{amount:1000,options:{units:{alien:1000}}}]){const before=JSON.stringify([game.data.armies,site.garrison]);e.resolveOrder(game,{type:'form_army',cityIds:[site.id],officerIds:[officer.id],...request},[]);assert.equal(JSON.stringify([game.data.armies,site.garrison]),before,'非法编军不能改变兵额');}
}
// 实际交战军团不得边打边驻城训练、自动抽补。
{
 const {game,e,site,make}=fresh();site.force='yuan';site.localFood=100000;site.localGold=100000;site.garrison=30000;game.data.armies=[];const a=make('engaged','yuan',1000,{engagementId:'test',training:20,trainingProgress:2,reinforcementTarget:5000});site.administration.trainingTarget=100;e.administerCities(game,[site],new Set([site.id]));assert.equal(a.soldiers,1000);assert.equal(a.training,20);assert.equal(a.trainingProgress,2);
}
// 被围歼军团的军资与原押解俘虏不能随军团对象一起消失。
{
 const {game,e,site,from,make}=fresh();game.data.armies=[];const a=make('winner','yuan',20000),d=make('loser','cao',1000,{morale:0,retreatLine:0,stores:{gold:17,food:23,silk:5},prisoners:{liu:31}});e.retreatPath=()=>null;const events=[];e.resolveFieldBattle(a,[d],from,site,'road',game,events);assert.equal(a.stores.gold,17);assert.equal(a.stores.food,23);assert.equal(a.stores.silk,5);assert.equal(a.prisoners.liu,31);
}
// 明确指定敌军或已失效编号的调动不能操纵敌军，也不能默默改派另一支本方军。
{
 const {game,e,site,from,make}=fresh();game.playerForceId=e.playerForceId='yuan';const own=make('own-move','yuan',1000),enemy=make('enemy-move','cao',1000);for(const id of [enemy.id,'missing-army'])for(const type of ['move','forced_march','retreat','camp','ambush']){const before=JSON.stringify([own,enemy]);e.resolveOrder(game,{type,armyIds:[id],cityIds:[from.id]},[]);assert.equal(JSON.stringify([own,enemy]),before,'非法调动须无副作用');}
}
