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
  // 攻方来处须为己方据点，不能把敌占城当成安全退路。
  from.force="yuan";const make=(id,force,soldiers,extra={})=>{const army={id,name:`${id}军`,force,city:site.id,commander:"无名将",soldiers,units:{infantry:soldiers,cavalry:0,archers:0},morale:70,training:60,supply:100,valor:0,tactic:"balanced",formation:"balanced",stance:"驻扎",stores:{gold:0,food:0,silk:0},...extra};game.hydrateArmy(army);game.data.armies.push(army);return army};
  return {game,e,site,from,make}};
const fight=(attackerSoldiers,defenderSoldiers,attackerExtra={},defenderExtra={})=>{const {game,e,site,from,make}=fresh();game.data.armies=game.data.armies.filter(a=>a.city!==site.id);
  const attacker=make("A","yuan",attackerSoldiers,{city:from.id,...attackerExtra}),defender=make("D","cao",defenderSoldiers,defenderExtra),events=[];attacker.city=site.id;const won=e.resolveFieldBattle(attacker,[defender],from,site,"road",game,events);
  return {game,e,attacker,defender,won,main:events.find(ev=>ev.phase==="野战"&&ev.rounds),events}};

// 1. 势均：打多个回合，以溃散或后撤收场；伤亡三分、守恒
{const {attacker,defender,main}=fight(10000,10000);assert(main.rounds.length>=2,`势均之战应多回合，实为 ${main.rounds.length}`);assert(main.rounds.some(r=>/溃散|后撤/.test(r.note))||main.result==="stalemate");
  for(const [side,army] of [["attacker",attacker],["defender",defender]]){const c=main.casualties[side],lost=10000-army.soldiers;assert.equal(c.killed+c.wounded+c.scattered+c.captured,lost,`${side} 伤亡（含追击被俘）守恒`);assert(c.wounded>0&&c.killed>0);assert.equal(army.wounded,c.wounded,"伤员入营");assert(lost<10000*.6,"不会打到全军覆没")}
  assert(main.rounds[0].attackerMorale>main.rounds.at(-1).attackerMorale,"士气逐回合下跌");assert.match(main.text,/合，/);console.log(`势均 10000:10000 → ${main.rounds.length} 合 ${main.result}｜${main.text.split("｜").slice(-2).join("｜")}`)}
// 2. 三倍兵力：攻方胜，守方溃退；守方损失远大于攻方
{const {won,main,defender,attacker}=fight(24000,8000);assert(won,"三倍兵力应胜");assert(main.casualties.defender.killed+main.casualties.defender.scattered>main.casualties.attacker.killed+main.casualties.attacker.scattered);assert.equal(defender.stance,"败退");assert(attacker.veterans>0,"胜方产生老兵");console.log(`三倍 → ${main.rounds.length} 合，${main.text.split("｜").at(-2)}`)}
// 3. 撤退线：高撤退线的一方早撤、溃散更少
{const routed=fight(10000,10000,{retreatLine:0,tactic:"aggressive"},{retreatLine:0}),orderly=fight(10000,10000,{retreatLine:55},{retreatLine:0});
  assert(orderly.main.rounds.length<=routed.main.rounds.length,"撤退线高则更早收兵");assert.match(orderly.main.rounds.map(r=>r.note).join(),/有序后撤/);assert(orderly.attacker.soldiers>routed.attacker.soldiers,"有序后撤保存更多兵力");console.log(`撤退线：死战 ${routed.attacker.soldiers} 健卒 / 撤退线55 ${orderly.attacker.soldiers} 健卒`)}
// 4. 溃散线：统率与老兵让军队更能撑
{const {e,make}=fresh(),raw=make("R","cao",10000,{veterans:0}),elite=make("V","cao",10000,{veterans:9000});assert(e.routLine(elite)<e.routLine(raw),"老兵溃散线更低");assert.equal(e.veteranTier(raw),"新募");assert.equal(e.veteranTier(elite),"百战");
  const powerRaw=e.combatPower(raw),powerElite=e.combatPower(elite);assert(powerElite/powerRaw>1.2&&powerElite/powerRaw<1.31,`满老兵约 +30% 战力，实为 ${(powerElite/powerRaw).toFixed(2)}`);
  e.removeTroops(elite,5000);assert.equal(elite.veterans,4500,"减员按比例带走老兵");e.addTroops(elite,"infantry",5000);assert.equal(elite.veterans,4500,"补新兵稀释老兵比例");assert.equal(e.veteranTier(elite),"老练")}
// 5. 伤员：驻己方城中康复归队并保留老兵比例；野外慢愈；断粮死亡；溃散兵归建
{const {game,e,make}=fresh(),home=game.data.cities.find(c=>c.force==="cao"),army=make("W","cao",5000,{city:home.id,wounded:2000,veterans:2500,stragglers:400});const before=army.soldiers;for(let i=0;i<10;i++)e.resolveArmyMedical(game,[]);
  assert(army.wounded<2000&&army.soldiers>before,"城中伤员康复归队");assert.equal(army.stragglers<400,true,"溃散兵归建");assert(Math.abs(e.veteranRatio(army)-.5)<.05,"康复者保留老兵比例");
  const field=make("F","cao",5000,{city:game.data.cities.find(c=>c.force!=="cao").id,wounded:2000,supply:0});for(let i=0;i<10;i++)e.resolveArmyMedical(game,[]);assert(field.wounded<1500&&field.soldiers<5100,"断粮时伤员多死、少康复");
  assert(FiscalSystem.armyDailyNeed(game,make("G","cao",5000,{wounded:5000}))>FiscalSystem.armyDailyNeed(game,make("H","cao",5000,{wounded:0})),"伤员照常吃粮")}
// 6. 新开局按训练度给初始老兵；新建军团为 0；存档往返保留
{const game=new GameState(structuredClone(scenario),{playerForceId:"cao"});assert(game.data.armies.some(a=>a.veterans>0),"开局军团有初始老兵");assert(game.data.armies.every(a=>a.veterans<=a.soldiers&&a.wounded===0));
  const army=game.data.armies[0];army.wounded=321;army.veterans=1234;army.retreatLine=45;const save=JSON.parse(JSON.stringify(game.serialize())),restored=new GameState(structuredClone(scenario));restored.applySave(restored.migrateSave(save));const back=restored.data.armies.find(a=>a.id===army.id);assert.equal(back.wounded,321);assert.equal(back.veterans,1234);assert.equal(back.retreatLine,45)}
// 7. 长推演：AI 对局不崩，兵员数值合法
{const game=new GameState(structuredClone(scenario),{playerForceId:"cao"});game.observerMode=true;for(let i=0;i<90;i++)game.endTurn();for(const army of game.data.armies){assert(army.soldiers>=100&&army.wounded>=0&&army.veterans>=0&&army.veterans<=army.soldiers,`${army.name} 兵员数值越界`)}
  console.log(`九十日推演：${game.data.armies.length} 军团兵员合法，伤员 ${game.data.armies.reduce((n,a)=>n+a.wounded,0)}`)}
// 9. W2 追击：骑兵多则俘获多；有序后撤者被俘少；俘虏随胜军押解
{const horse=fight(15000,8000,{units:{infantry:5000,cavalry:10000,archers:0}},{retreatLine:0}),foot=fight(15000,8000,{},{retreatLine:0});
  assert(horse.won&&foot.won);assert(horse.main.captured>foot.main.captured,`骑兵追击俘获更多：骑 ${horse.main.captured} / 步 ${foot.main.captured}`);assert.equal(horse.e.prisonerCount(horse.attacker.prisoners),horse.main.captured,"俘虏归胜军押解");assert(horse.main.rounds.at(-1).name==="追击");
  const orderly=fight(15000,8000,{units:{infantry:5000,cavalry:10000,archers:0}},{retreatLine:60});assert(orderly.main.captured<horse.main.captured,"有序后撤被俘少");
  assert(horse.e.pursuitStrength([horse.attacker])>foot.e.pursuitStrength([foot.attacker]));console.log(`追击：骑兵俘 ${horse.main.captured} / 步兵俘 ${foot.main.captured} / 有序后撤被俘 ${orderly.main.captured}`)}
// 10. 包围歼灭：守方相邻无己方据点或均被敌军占住 → 被围歼，大部被俘
{const {game,e,site,from,make}=fresh();game.data.armies=game.data.armies.filter(a=>a.city!==site.id);for(const id of game.data.rules.city_graph[site.id]){const c=game.data.cities.find(x=>x.id===id);if(c&&c.force==="cao")make(`B${id}`,"yuan",3000,{city:id})}
  const defender=make("D","cao",6000,{retreatLine:0}),attacker=make("A","yuan",18000),events=[];assert.equal(e.retreatPath(game,site,defender),null,"四面受敌无退路");const won=e.resolveFieldBattle(attacker,[defender],from,site,"road",game,events),main=events.find(ev=>ev.phase==="野战"&&ev.rounds);
  assert(won);assert(!game.data.armies.includes(defender),"被围歼");assert.match(main.text,/被围歼/);assert(main.captured>3000,`大部被俘：${main.captured}`);console.log(`围歼：俘 ${main.captured}｜${main.rounds.at(-1).note}`)}
// 11. 战俘入营、收编、看守不足逃散、处置（释放加关系 / 换俘换回将领 / 坑杀失关系）、城池易主获释
{const {game,e,make}=fresh();const home=game.data.cities.find(c=>c.force==="cao"&&c.garrison>3000),army=make("P","cao",5000,{city:home.id,prisoners:{yuan:2000,neutral:300}}),events=[];game.playerForceId="cao";e.resolvePrisoners(game,events);
  assert.equal(e.prisonerCount(army.prisoners),0);assert.equal(home.prisoners.yuan,2000,"入城关押");assert(events.some(ev=>ev.phase==="战俘"));
  const garrison=home.garrison;e.disposePrisoners(game,home.id,"levy");for(let i=0;i<5;i++)e.resolvePrisoners(game,[]);assert(home.garrison>garrison&&home.prisoners.yuan<2000,"收编逐日入守军");e.disposePrisoners(game,home.id,"levy");
  const officer=game.data.officers.find(o=>o.force==="cao"&&o.status==="serving"&&o.name!=="曹操");Object.assign(officer,{status:"prisoner",capturedBy:"yuan",originalForce:"cao"});const relation=e.worldRelation(game,"cao","yuan");
  const swap=e.disposePrisoners(game,home.id,"exchange","yuan");assert(swap.ok&&swap.text.includes(officer.name),"换俘换回将领");assert.equal(officer.status,"serving");assert(e.worldRelation(game,"cao","yuan")>=relation);
  home.prisoners={liu:1000};const before=e.worldRelation(game,"cao","liu"),order=home.order;e.disposePrisoners(game,home.id,"execute","liu");assert(e.worldRelation(game,"cao","liu")<=before-25&&home.order<order,"坑杀失关系与民心");
  home.prisoners={yuan:500,cao:0};home.prisonerHolder="cao";home.prisoners.yuan=500;home.force="yuan";home.prisoners.yuan=500;const g=home.garrison;e.resolvePrisoners(game,[]);assert(home.garrison===g+500&&!home.prisoners,"城池易主，被俘者获释归营");
  const weak=game.data.cities.find(c=>c.force==="cao"&&c!==home);weak.garrison=100;weak.prisoners={yuan:3000};weak.prisonerHolder="cao";const ord=weak.order;e.resolvePrisoners(game,[]);assert(weak.prisoners.yuan<3000&&weak.order<ord,"看守不足则逃散、扰动治安");
  const save=JSON.parse(JSON.stringify(game.serialize())),restored=new GameState(structuredClone(scenario));restored.applySave(restored.migrateSave(save));assert.deepEqual(restored.data.cities.find(c=>c.id===weak.id).prisoners,weak.prisoners,"战俘随存档往返")}
// 8. 改编命令设撤退线；界面接线
{const game=new GameState(structuredClone(scenario),{playerForceId:"cao"}),army=game.data.armies.find(a=>a.force==="cao"),events=[];game.engine.playerForceId="cao";game.engine.resolveOrder(game,{type:"reorganize_army",armyIds:[army.id],options:{units:{...army.units},retreatLine:45}},events);assert.equal(army.retreatLine,45,"改编可设撤退线");game.engine.resolveOrder(game,{type:"reorganize_army",armyIds:[army.id],options:{units:{...army.units},retreatLine:null}},events);assert.equal(army.retreatLine,undefined,"可恢复随战术");
  const app=appSource();assert.match(app,/name="retreatLine"/);assert.match(app,/<h3>兵员与精锐<\/h3>/);assert.match(app,/function battleRoundsHtml\(event\)/);assert.match(app,/战俘营 · /);assert.match(app,/data-prisoner-action="exchange"/);assert.match(fs.readFileSync(path.join(root,"js/ui/app/reports.js"),"utf8"),/\$\{battleRoundsHtml\(main\)\}/,"战报档案展示逐回合表");assert.match(fs.readFileSync(path.join(root,"js/ui/app/battle-detail.js"),"utf8"),/\$\{app\.battleRoundsHtml\(last\)\}/,"当前战场展示逐回合表");assert.match(fs.readFileSync(path.join(root,"index.html"),"utf8"),/engine\/battle\.js\?v=/)}
// 夹击：攻方在战场另一侧相邻据点驻有成军，守方接战即掉士气，战报标「两面夹击」
{const base=fight(10000,10000),{game,e,site,from,make}=fresh();game.data.armies=game.data.armies.filter(a=>a.city!==site.id);const side=(game.data.rules.city_graph[site.id]||[]).find(id=>id!==from.id);
  if(side){game.data.armies=game.data.armies.filter(a=>a.city!==side);make("F","yuan",5000,{city:side});assert.equal(e.flankDirections(game,site,from,"yuan","cao").length,1,"识别侧翼");const attacker=make("A","yuan",10000,{city:site.id}),defender=make("D","cao",10000),events=[];e.resolveFieldBattle(attacker,[defender],from,site,"road",game,events);const main=events.find(ev=>ev.phase==="野战"&&ev.rounds);
    assert.match(main.text,/两面夹击/);assert.match(main.rounds[0].note,/腹背受敌/);assert(main.rounds[0].defenderMorale<base.main.rounds[0].defenderMorale,"守方士气更低");assert(e.flankDirections(game,site,side&&game.data.cities.find(c=>c.id===side),"yuan","cao").length===0,"来路上的己军不算夹击");console.log(`夹击：守方接战士气 ${main.rounds[0].defenderMorale}（无夹击 ${base.main.rounds[0].defenderMorale}）`)}}
console.log("W1 战斗核心通过：分回合至溃散 / 伤亡三分 / 撤退线 / 溃散线与老兵 / 伤员康复与归建 / 初始老兵与存档");
