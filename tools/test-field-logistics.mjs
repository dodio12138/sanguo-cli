// W4、W5 野战补给：携粮天数与组织度、运粮队实运（途损、改道追送）、轻装就食、截粮与护送、袭扰粮道、前进粮仓、AI 袭扰、存档与界面。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
for(const file of ["js/core/data-loader.js","js/core/game-clock.js","js/core/fiscal-system.js","js/core/rule-engine.js","js/core/game-state.js"])await import(pathToFileURL(path.join(root,file)));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();const scenario=await loader.loadScenario("200_guandu");

// 在曹军境外找一处「离己方城三段」的中立据点作野战营地，沿途无军队。
const setup=(soldiers=12000)=>{const game=new GameState(structuredClone(scenario),{playerForceId:"cao"}),e=game.engine;game.random=()=>.5;
  const own=game.data.cities.filter(c=>c.force==="cao");let camp=null,source=null;for(const city of own){for(const id of Object.keys(game.data.rules.city_graph)){const p=e.graphPath(city.id,id,4);const target=game.data.cities.find(c=>c.id===id);if(p&&p.length===4&&target&&target.force!=="cao"&&!p.slice(1).some(n=>game.data.cities.find(c=>c.id===n)?.force==="cao")){camp=target;source=city;break}}if(camp)break}
  assert(camp,"找到营地");camp.force="neutral";for(const id of e.graphPath(source.id,camp.id,4))game.data.armies=game.data.armies.filter(a=>a.city!==id);
  const army={id:"F",name:"曹军",force:"cao",city:camp.id,commander:"无名将",soldiers,units:{infantry:soldiers,cavalry:0,archers:0},morale:70,training:60,supply:100,valor:0,tactic:"balanced",formation:"balanced",stance:"驻扎",stores:{gold:0,food:0,silk:0}};game.hydrateArmy(army);game.data.armies.push(army);source.localFood=200000;
  return {game,e,army,camp,source}};
const days=(game,e,n,events=[])=>{for(let i=0;i<n;i++){game.turn++;e.advanceConvoys(game,events)}return events};

// 1. 携粮天数与组织度
{const {game,e,army}=setup(30000);assert.equal(e.easyCarryDays({soldiers:3000}),30);assert(e.easyCarryDays(army)<12,"三万人轻松携带不过十日左右");assert.equal(FiscalSystem.armyFoodTarget(game,army),Math.ceil(FiscalSystem.armyDailyNeed(game,army)*e.armyCarryDays(army)),"满仓按携粮天数");
  army.stores.food=e.dailyRation(game,army)*e.easyCarryDays(army);const full=e.armyOrganization(game,army);army.stores.food*=4;const heavy=e.armyOrganization(game,army);assert.equal(full,100);assert(heavy<=55,`四倍携粮组织度 ${heavy}`);
  const power=e.combatPower(army);army.stores.food/=4;assert(e.combatPower(army)>power,"组织度低则战力降");army.stores.food*=4;assert(e.routLine(army)>e.routLine({...army,stores:{food:0}}),"组织度低溃散线上移");assert(e.marchDrag(game,army)>1.2,"行军受累");
  army.carryDays=40;assert(FiscalSystem.armyFoodTarget(game,army)>Math.ceil(FiscalSystem.armyDailyNeed(game,army)*e.easyCarryDays(army)),"可多带");console.log(`三万人：轻松携带 ${e.easyCarryDays(army)} 日；四倍携粮组织度 ${heavy}`)}
// 2. 运粮队：军仓见底即派粮队，沿路实走，途损后交粮；不再瞬移
{const {game,e,army}=setup();const before=new Map(game.data.cities.map(c=>[c.id,c.localFood])),events=[];FiscalSystem.consumeArmy(game,army,events);assert(army.convoy,"派出运粮队");assert.equal(army.stores.food,0,"不再瞬移入仓");const from=game.data.cities.find(c=>c.id===army.convoy.sourceId);assert(from.force==="cao"&&from.localFood<before.get(from.id),"粮出自己方补给来源");assert(events.some(ev=>/粮队自/.test(ev.text)));const loaded=army.convoy.food,legs=army.convoy.path.length-1;
  let n=0;while(army.convoy&&n<60){days(game,e,1);n++}assert(!army.convoy,"粮队到达");assert(army.stores.food>0&&army.stores.food<loaded,"途损后交粮");assert(n>=legs,`实走 ${n} 日`);assert.equal(army.supplyStatus,"粮道畅通");console.log(`粮队：装 ${Math.round(loaded)} 石，${legs} 段 ${n} 日，交 ${army.stores.food} 石`)}
// 3. 军团转移：粮队改道追送
{const {game,e,army,camp}=setup();FiscalSystem.consumeArmy(game,army,[]);const next=(game.data.rules.city_graph[camp.id]||[]).find(id=>!army.convoy.path.includes(id)&&!game.data.armies.some(a=>a.city===id));army.city=next;let n=0;while(army.convoy&&n<80){days(game,e,1);n++}assert(!army.convoy&&army.stores.food>0,"改道追送到新营地")}
// 4. 轻装：不设粮道，在敌境就食
{const {game,e,army,camp}=setup(2000);camp.force="yuan";game.diplomacy.wars.push("yuan");camp.localFood=5000;const order=camp.order=60;FiscalSystem.consumeArmy(game,army,[]);assert(!army.convoy,"轻装不派粮队");assert(army.stores.food>0&&camp.localFood<5000,"就食取当地粮");assert(camp.order<order,"扰动治安")}
// 5. 截粮：敌军伏于粮道旁一段即截获；护送重则难截
{const {game,e,army,source}=setup();game.diplomacy.wars.push("yuan");FiscalSystem.consumeArmy(game,army,[]);const path=army.convoy.path,lurk=(game.data.rules.city_graph[path[2]]||[]).find(id=>!path.includes(id)&&!game.data.armies.some(a=>a.city===id))||path[2];
  const raider={id:"R",name:"袁骑",force:"yuan",city:lurk,commander:"无名将",soldiers:3000,units:{infantry:0,cavalry:3000,archers:0},morale:70,training:60,supply:100,valor:0,tactic:"balanced",formation:"balanced",stance:"驻扎",stores:{gold:0,food:0,silk:0}};game.hydrateArmy(raider);game.data.armies.push(raider);assert(e.setRaiding(game,raider,true).ok);game.random=()=>0;
  const events=days(game,e,20);assert(!army.convoy&&e.supplyCut(game,army),"粮道被截");assert(raider.stores.food>0,"缴获粮草");assert(events.some(ev=>/截获/.test(ev.text)));const light=e.raidChance(raider,{escort:100}),heavy=e.raidChance(raider,{escort:3000});assert(light>heavy,"护送越多越难截");console.log(`截粮：护送百人成算 ${Math.round(light*100)}% / 三千人 ${Math.round(heavy*100)}%`)}
// 6. 前进粮仓：耗金、工期后竣工，作运粮来源时优先
{const {game,e,army,source,camp}=setup();const path=e.graphPath(source.id,camp.id,4),mid=game.data.cities.find(c=>c.id===path[1]);mid.force="cao";const gold=game.resources.gold=5000;const res=e.buildDepot(game,mid.id);assert(res.ok,res.error);assert.equal(game.resources.gold,gold-e.fieldLogisticsRules().depot_gold);assert.match(e.buildDepot(game,mid.id).error,/修建/);game.turn=mid.depotReadyTurn;e.resolveDepots(game,[]);assert(mid.depot,"竣工");assert.equal(e.pickSupplySource(game,army).city.id,mid.id,"前进粮仓优先作来源")}
// 7. AI 袭扰：骑兵为主、闲置、附近有敌方粮队则自行袭扰
{const {game,e,army}=setup();game.playerForceId="liu";game.diplomacy.wars.push("yuan");e.declareWorldWar(game,"cao","yuan",[],"测试");FiscalSystem.consumeArmy(game,army,[]);const node=army.convoy.path[1],ai={id:"Q",name:"袁骑",force:"yuan",city:(game.data.rules.city_graph[node]||[])[0],soldiers:4000,units:{infantry:500,cavalry:3500,archers:0},morale:70,stores:{food:0}};game.data.armies.push(ai);e.aiRaidPosture(game);assert(ai.raiding,"AI 骑兵自行袭扰")}
// 8. 存档往返与界面接线
{const {game,e,army}=setup();FiscalSystem.consumeArmy(game,army,[]);army.carryDays=20;army.escortLevel="heavy";const save=JSON.parse(JSON.stringify(game.serialize())),restored=new GameState(structuredClone(scenario));restored.applySave(restored.migrateSave(save));const back=restored.data.armies.find(a=>a.id==="F");assert.deepEqual(back.convoy,army.convoy);assert.equal(back.carryDays,20);assert.equal(back.escortLevel,"heavy");
  const app=fs.readFileSync(path.join(root,"js/ui/app.js"),"utf8"),view=fs.readFileSync(path.join(root,"js/ui/map-view.js"),"utf8");for(const token of ["data-carry-days","data-escort-level","data-army-raid","data-build-depot"])assert(app.includes(token),token);assert.match(view,/drawSupplyLines\(c,m\)/)}
// 军团解散或覆没：在途粮队与护送折返来源城
{const {game,e,army}=setup();game.playerForceId="cao";FiscalSystem.consumeArmy(game,army,[]);days(game,e,1);const source=game.data.cities.find(c=>c.id===army.convoy.sourceId),food=source.localFood,garrison=source.garrison,escort=army.convoy.escort;game.data.armies=game.data.armies.filter(a=>a!==army);const events=days(game,e,1);
  assert(source.localFood>food,"粮折返来源城");assert.equal(source.garrison,garrison+escort,"护送归还守军");assert(events.some(ev=>/折返/.test(ev.text)));assert(!Object.keys(game.convoyLedger).length,"台账清空")}
// 9. 长推演：AI 对局不崩，粮队与军仓数值合法
{const game=new GameState(structuredClone(scenario),{playerForceId:"cao"});game.observerMode=true;for(let i=0;i<120;i++)game.endTurn();let convoys=0;for(const army of game.data.armies){assert(army.stores.food>=0);if(army.convoy){convoys++;assert(army.convoy.food>=0&&army.convoy.path.length>=1)}}console.log(`百二十日推演：在途粮队 ${convoys}`)}
console.log("W4、W5 野战补给通过：携粮与组织度 / 运粮实走与途损 / 改道追送 / 轻装就食 / 截粮与护送 / 前进粮仓 / AI 袭扰 / 存档与界面");
