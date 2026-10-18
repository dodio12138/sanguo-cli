// W3 攻城扩展：出城迎战（背城而战、胜则解围、败退回城）、突围（成算、三档结局、携将领与天子）、都城陷落天子易手、AI 守城应对、玩家命令接线。
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
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();const scenario=await loader.loadScenario("200_guandu");

// 以许都（都城、天子在曹操处）为被围城：一侧邻城给袁军作围城营，另一侧保留曹军据点作突围去向。
const setup=({garrison=8000,enemy=12000,player="cao"}={})=>{const game=new GameState(structuredClone(scenario),{playerForceId:player}),e=game.engine,city=game.data.cities.find(c=>c.id===game.court.capital);game.diplomacy.wars.push(player==="cao"?"yuan":"cao");e.declareWorldWar?.(game,"cao","yuan",[],"测试");
  const neighbors=game.data.rules.city_graph[city.id].map(id=>game.data.cities.find(c=>c.id===id)),camp=neighbors[0],refuge=neighbors.find(c=>c!==camp);camp.force="yuan";refuge.force="cao";game.data.armies=game.data.armies.filter(a=>[city.id,camp.id,refuge.id].every(id=>a.city!==id));
  city.garrison=garrison;city.siegeMorale=70;const besieger={id:"Y1",name:"袁军",force:"yuan",city:camp.id,siegeTarget:city.id,siegeMethod:"blockade",commander:"无名将",soldiers:enemy,units:{infantry:enemy,cavalry:0,archers:0},morale:70,training:60,supply:100,valor:0,tactic:"balanced",formation:"balanced",stance:"围城",stores:{gold:0,food:0,silk:0}};game.hydrateArmy(besieger);game.data.armies.push(besieger);city.siegeTurns=2;
  return {game,e,city,camp,refuge,besieger}};
const serving=(game,city)=>game.data.officers.filter(o=>o.force==="cao"&&o.status==="serving"&&o.city===city.id);

const finishSortie=(game,events)=>{let days=0;while(game.data.armies.some(a=>a.engagement?.sortie)&&days++<100){game.turn++;game.engine.auditSieges(game,events);game.engine.advanceFieldBattles(game,events)}assert(days<100,"迎战应按士气结局结束");return events.filter(ev=>ev.phase==="守城"&&ev.result!=="ongoing").at(-1)};
const arrive=(game,party,events=[])=>{let days=0;while(party.route?.length&&days++<100){game.turn++;game.engine.advanceArmies(game,events)}assert(days<100,"应沿道路最终抵达")};
// 1. 出城迎战：守军占优 → 击退围军、解围、出城兵回城；守军劣势 → 败退回城、士气下降
{const {game,e,city,besieger}=setup({garrison:30000,enemy:6000});assert(e.isCityBesieged(city));const events=[],before=city.garrison,result=e.fieldSortie(game,city,events);
  assert(result.ongoing,"第一天应仍在迎战");const ended=finishSortie(game,events);assert.equal(ended.result,"victory","守军占优应胜");assert(!e.isCityBesieged(city),"胜则解围");assert(!besieger.siegeTarget);const recovering=game.data.armies.find(a=>a.id.startsWith("sortie-"));assert(recovering?.wounded>0,"出城伤员留营调养，不瞬间痊愈");assert.equal(recovering.soldiers,100);assert(city.garrison<before&&city.garrison>before*.7,"出城兵回城，略有伤亡");assert(events.some(ev=>ev.phase==="野战"&&ev.sortie));console.log(`出城迎战（优）：${result.text}`)}
{const {game,e,city}=setup({garrison:4000,enemy:24000});const events=[],morale=city.siegeMorale,result=e.fieldSortie(game,city,events);finishSortie(game,events);assert(e.isCityBesieged(city),"劣势出战失利，围仍在");assert(city.siegeMorale<morale);assert(city.garrison>0&&city.garrison<4000);console.log(`出城迎战（劣）：${result.text}`)}
// 同一迎战按日去重，暂停围城双算，并能从存档保持相同伤亡继续。
{const {game,e,city,besieger}=setup({garrison:14000,enemy:12000}),events=[];e.fieldSortie(game,city,events);const holder=game.data.armies.find(a=>a.engagement?.sortie);assert(holder);
 const before=JSON.stringify([city.garrison,city.defenseDamage,besieger.soldiers]);e.auditSieges(game,events);e.resolveSieges(game,events,{daily:true});e.advanceFieldBattles(game,events);assert.equal(JSON.stringify([city.garrison,city.defenseDamage,besieger.soldiers]),before,"迎战不叠加围城伤亡，同日不重复交锋");assert(besieger.siegeTarget,"接战期间保留围城关联");
 const restored=new GameState(structuredClone(scenario),{initializeGrain:false});restored.applySave(restored.migrateSave(JSON.parse(JSON.stringify(game.serialize()))));assert.deepEqual(restored.data.armies.find(a=>a.engagement)?.engagement,holder.engagement);
 game.turn++;restored.turn++;e.advanceFieldBattles(game,[]);restored.engine.advanceFieldBattles(restored,[]);assert.deepEqual(restored.data.armies.map(a=>[a.id,a.soldiers,a.wounded,a.morale]),game.data.armies.map(a=>[a.id,a.soldiers,a.wounded,a.morale]),"迎战读档后继续结算一致");}
// 2. 背城而战：同等劣势下，守军被追击俘获少于野外溃败
{const {e}=setup();const r=e.sortieRules();assert(r.field_rout_shift<0&&r.field_pursuit_factor<1)}
// 3. 突围成算：合围越紧越低；去向邻近敌营则低；能选的方向不含敌占
{const loose=setup({enemy:4000}),tight=setup({enemy:40000});const opt=s=>({destinationId:s.refuge.id,soldiers:800,officerIds:[]});const a=loose.e.breakoutOutlook(loose.game,loose.city,opt(loose)),b=tight.e.breakoutOutlook(tight.game,tight.city,opt(tight));assert(a.chance>b.chance,`合围越紧成算越低：${a.chance.toFixed(2)} / ${b.chance.toFixed(2)}`);
  assert(!loose.e.breakoutDestinations(loose.game,loose.city).some(c=>c.id===loose.camp.id),"敌营方向不可突");console.log(`突围成算：松 ${Math.round(a.chance*100)}% / 紧 ${Math.round(b.chance*100)}%`)}
// 4. 突围成功：奉天子与将领到达去向，行在迁移
{const {game,e,city,refuge}=setup();game.random=()=>0;const officers=serving(game,city).slice(0,2),events=[],res=e.breakout(game,city,{destinationId:refuge.id,soldiers:1000,officerIds:officers.map(o=>o.id),emperor:true},events);
  assert.equal(res.tier,"success");const party=game.data.armies.find(a=>a.id===res.armyId);assert.equal(party.city,city.id,"冲出包围后仍在真实道路起点");assert.deepEqual(party.route,[refuge.id]);assert(officers.every(o=>o.city===city.id&&e.officerAssignment(o)?.army===party),"将领附属突围军随行");assert.equal(game.court.capital,city.id,"到达前行在不提前搬迁");assert.equal(game.court.escort.armyId,party.id);assert.match(e.moveCapital(game,"cao",refuge.id).error,/随军/);assert.match(e.receiveEmperor(game,"yuan").error,/随军/);assert(!e.courtEmperorIn(game,city),"天子已离城，攻下旧都不得重复俘驾");arrive(game,party,events);assert(officers.every(o=>o.city===refuge.id&&o.status==="serving"),"将领随行到达");assert(!game.court.escort);assert.equal(game.court.capital,refuge.id,"行在迁移");assert.equal(game.court.controller,"cao");assert(game.data.armies.some(a=>a.city===refuge.id&&a.force==="cao"&&a.soldiers>=800),"突围部队到达");console.log(res.text)}
// 途中护驾状态随存档保存；旧都失陷不重复俘驾，护驾军被围歼才易手。
{const {game,e,city,camp,refuge,besieger}=setup();game.random=()=>0;const events=[],res=e.breakout(game,city,{destinationId:refuge.id,soldiers:1000,emperor:true},events),party=game.data.armies.find(a=>a.id===res.armyId);
 const restored=new GameState(structuredClone(scenario),{initializeGrain:false});restored.applySave(restored.migrateSave(JSON.parse(JSON.stringify(game.serialize()))));assert.deepEqual(restored.court.escort,game.court.escort);assert.deepEqual(restored.data.armies.find(a=>a.id===party.id).retreat,party.retreat);
 e.completeSiegeCapture(city,[besieger],[],"yuan",game,events,"old-capital",true);assert.equal(game.court.controller,"cao");assert.equal(game.court.escort.armyId,party.id);
 for(const id of game.data.rules.city_graph[refuge.id]||[])game.data.cities.find(c=>c.id===id).force="yuan";refuge.force="yuan";party.city=refuge.id;party.morale=0;party.supply=0;party.route=[];delete party.retreat;
 e.resolveFieldBattle(besieger,[party],camp,refuge,"road",game,events,{attackers:[besieger]});assert.equal(game.court.controller,"yuan","无路可退的护驾军被围歼，天子被截获");assert(!game.court.escort);}
// 盟友据点可接应败退军，不按入侵阻止抵达，也不改变盟友城池归属。
{const {game,e,city,refuge}=setup();refuge.force="liu";game.diplomacy.treaties.push({forceId:"liu",type:"alliance"});game.random=()=>0;const result=e.breakout(game,city,{destinationId:refuge.id,soldiers:1000,emperor:true},[]),party=game.data.armies.find(a=>a.id===result.armyId);assert(result.ok);arrive(game,party);assert.equal(party.city,refuge.id);assert.equal(refuge.force,"liu");assert.equal(game.court.capital,refuge.id);}
// 5. 突围失败：部队覆没、将领被俘、天子落入围城者之手
{const {game,e,city,refuge,besieger}=setup();game.random=()=>.999;const officers=serving(game,city).slice(0,2),events=[],res=e.breakout(game,city,{destinationId:refuge.id,soldiers:1000,officerIds:officers.map(o=>o.id),emperor:true},events);
  assert.equal(res.tier,"fail");assert(officers.every(o=>o.status==="prisoner"&&o.capturedBy==="yuan"),"随行将领被俘");assert.equal(game.court.controller,"yuan","天子易手");assert(e.prisonerCount(besieger.prisoners)>0,"突围残兵被俘");assert(events.some(ev=>ev.phase==="汉庭"));console.log(res.text)}
// 6. 折损：折兵过半
{const {game,e,city,refuge}=setup();const out=e.breakoutOutlook(game,city,{destinationId:refuge.id,soldiers:1000});let calls=0;game.random=()=>calls++===0?out.chance+out.partial/2:.99;const res=e.breakout(game,city,{destinationId:refuge.id,soldiers:1000,officerIds:[],emperor:false},[]);assert.equal(res.tier,"partial");const party=game.data.armies.find(a=>a.id===res.armyId);assert.equal(party.city,city.id);assert(party.route?.includes(refuge.id));assert(party&&party.soldiers<=450,"折兵过半")}
// 7. 都城陷落：天子归破城者
{const {game,e,city,besieger}=setup();e.completeSiegeCapture(city,[besieger],[],"yuan",game,[],"t");assert.equal(game.court.controller,"yuan");assert.equal(game.court.capital,city.id)}
// 8. 玩家命令接线：siege_action 的 field_battle / breakout，每日一次
{const {game,e,city,refuge}=setup({garrison:30000,enemy:6000});e.playerForceId="cao";const events=[];e.resolveSiegeAction({type:"siege_action",cityIds:[city.id],options:{action:"field_battle"}},game,events);assert(events.some(ev=>/出城迎战/.test(ev.text)));
  const again=[];e.resolveSiegeAction({type:"siege_action",cityIds:[city.id],options:{action:"breakout",destinationId:refuge.id,soldiers:500}},game,again);assert(again.some(ev=>/本日已|未被围困|正在交战/.test(ev.text)),"同日不可再出城")}
// 9. AI 守城：兵多则出城迎战
{const {game,e,city}=setup({garrison:30000,enemy:6000,player:"liu"});game.random=()=>.1;const events=[];e.aiSiegeResponses(game,events);assert(events.some(ev=>/出城迎战/.test(ev.text)),"AI 兵多出城迎战");finishSortie(game,events);assert(!e.isCityBesieged(city))}
// 10. AI 都城粮尽：奉天子突围
{const {game,e,city}=setup({garrison:6000,enemy:40000,player:"liu"});city.siegeMorale=20;game.random=()=>.01;const events=[];e.aiSiegeResponses(game,events);assert(events.some(ev=>/奉天子突围|突围/.test(ev.text)),"AI 奉天子突围")}
// 11. 界面接线
{const app=appSource();assert.match(app,/data-siege-action="field_battle"/);assert.match(app,/data-siege-action="breakout"/);assert.match(app,/function openBreakoutPlanner\(city,queue\)/);assert.match(app,/queue\("breakout"/)}
console.log("W3 攻城扩展通过：出城迎战 / 背城 / 突围成算与三档结局 / 天子随行或易手 / 都城陷落 / 玩家命令 / AI 应对");
