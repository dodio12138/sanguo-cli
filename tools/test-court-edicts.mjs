// 汉庭 P2：册封、安抚诏（免战，官渡前稳住马腾）、任免州郡长官、罢免与抗诏、征召入朝、玩家奉诏 / 抗诏、上表朝贡与请封、AI 诏令、界面接线。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";
import {appSource} from "./app-source.mjs";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
for(const file of ["js/core/data-loader.js","js/core/game-clock.js","js/core/fiscal-system.js","js/core/rule-engine.js","js/core/game-state.js","js/ui/court-ui.js"])await import(pathToFileURL(path.join(root,file)));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();const scenario=await loader.loadScenario("200_guandu");
const fresh=(player="cao")=>{const game=new GameState(structuredClone(scenario),{playerForceId:player});return {game,e:game.engine,court:game.court}};
const ruler=(game,force)=>game.engine.forceRulerOfficer(force);

// 1. 官渡：曹操安抚马腾 → 免战一年，期内马腾 AI 不对曹操开战、不入曹境
{const {game,e,court}=fresh();assert(court.stances.ma_teng.obedience>=e.edictRules().appease_min_obedience,`马腾服从 ${court.stances.ma_teng.obedience} 够安抚门槛`);const authority=court.authority;game.random=()=>0;const events=[],res=e.issueEdict(game,"cao","appease",{forceId:"ma_teng"},events);
  assert(res.ok&&res.accepted,res.error||res.text);assert(e.worldFriendly(game,"cao","ma_teng"),"订立免战");assert(court.authority<authority,"耗天子威望");assert(court.edicts.some(x=>x.forceId==="ma_teng"));assert(events.some(ev=>ev.phase==="汉庭"));
  game.random=Math.random;game.observerMode=true;const caoCities=new Set(game.data.cities.filter(c=>c.force==="cao").map(c=>c.id));for(let i=0;i<120;i++){game.endTurn();assert(!e.worldWar(game,"cao","ma_teng"),`第 ${i} 日马腾与曹操开战`)}
  assert(!game.data.cities.some(c=>caoCities.has(c.id)&&c.force==="ma_teng"),"免战期内马腾未夺曹城");console.log(`安抚马腾：${res.text}`)}
// 2. 交战中不能安抚；服从过低不理会；同诏月内不可重下
{const {game,e,court}=fresh();assert.match(e.issueEdict(game,"cao","appease",{forceId:"yuan"}).error||"",/交战|服从/);court.stances.han_sui.obedience=10;assert.match(e.issueEdict(game,"cao","appease",{forceId:"han_sui"}).error,/服从不足/);
  game.random=()=>.999;const once=e.issueEdict(game,"cao","summon",{officerId:ruler(game,"liu_biao")?.id});assert.match(once.error,/一方之主/)}
// 3. 强诸侯抗诏：征召袁绍部将，袁绍必抗（服从低、实力强），抗诏记入，服从下降
{const {game,e,court}=fresh(),officer=game.data.officers.find(o=>o.force==="yuan"&&o.status==="serving"&&o.name!=="袁绍");const chance=e.courtAcceptChance(game,"yuan","summon");assert(chance<.1,`袁绍受征召可能 ${chance}`);game.random=()=>.5;const before=court.defiance.yuan||0,res=e.issueEdict(game,"cao","summon",{officerId:officer.id});
  assert(res.ok&&!res.accepted);assert(court.defiance.yuan>before,"记入抗诏");assert.equal(officer.force,"yuan");assert.match(res.text,/抗诏/);assert.match(e.issueEdict(game,"cao","summon",{officerId:officer.id}).error,/月内/,"冷却")}
// 4. 册封：刘表受杂号将军，名分上升；员额与重复检查；爵位
{const {game,e,court}=fresh(),biao=ruler(game,"liu_biao");game.random=()=>0;const before=court.stances.liu_biao.legitimacy,res=e.issueEdict(game,"cao","grant",{officerId:biao.id,office:"zahao",variant:"扬威将军"});assert(res.accepted,res.error);assert(court.offices.some(i=>i.officerId===biao.id&&i.office==="zahao"&&!i.self));assert(court.stances.liu_biao.legitimacy>before,"名分上升");
  assert.match(e.issueEdict(game,"cao","grant",{officerId:biao.id,office:"zahao"}).error,/已居此官/);assert.match(e.issueEdict(game,"cao","grant",{officerId:biao.id,office:"dajiangjun"}).error||"",/员额已满/);
  const sun=game.data.officers.find(o=>o.force==="sun"&&o.status==="serving"&&!court.titles.some(t=>t.officerId===o.id)),granted=e.issueEdict(game,"cao","grant",{officerId:sun.id,title:"tinghou"});assert(granted.accepted,granted.error);assert(court.titles.some(t=>t.officerId===sun.id&&t.title==="tinghou"&&t.fief));const lord=ruler(game,"sun");if(court.titles.some(t=>t.officerId===lord.id&&t.title==="xianhou"))assert.match(e.issueEdict(game,"cao","grant",{officerId:lord.id,title:"tinghou"}).error,/同等或更高/)}
// 5. 任免：本方实控之郡直接任命并替下旧任；他方之郡只能任其人，按成算；罢免被抗则改为自领
{const {game,e,court}=fresh(),own=game.data.cities.find(c=>c.force==="cao"&&e.courtSeatForce("commandery",c.commandery)==="cao"),officer=game.data.officers.find(o=>o.force==="cao"&&o.status==="serving"&&!court.offices.some(i=>i.officerId===o.id));
  const res=e.issueEdict(game,"cao","appoint",{officerId:officer.id,office:"taishou",seat:own.commandery});assert(res.accepted,res.error);assert.equal(e.courtSeatHolder(game,"commandery",own.commandery).officerId,officer.id,"本方直接任命");assert.equal(e.officialProfile(own,"commanderyGovernor").id,officer.id,"汉庭太守同步实际郡守");
  const other=game.data.cities.find(c=>c.force==="liu_biao"&&e.courtSeatForce("commandery",c.commandery)==="liu_biao");assert.match(e.issueEdict(game,"cao","appoint",{officerId:officer.id,office:"taishou",seat:other.commandery}).error,/实际归属.*只能任命其人物/);
  const theirs=game.data.officers.find(o=>o.force==="liu_biao"&&o.status==="serving"&&o.name!=="刘表");game.random=()=>0;assert(e.issueEdict(game,"cao","appoint",{officerId:theirs.id,office:"taishou",seat:other.commandery}).accepted);
  const held=court.offices.find(i=>i.forceId==="yuan"&&!i.self);game.random=()=>.99;const dismissed=e.issueEdict(game,"cao","dismiss",{officerId:held.officerId,office:held.office});assert(dismissed.ok&&!dismissed.accepted);assert(held.self,"抗罢免者改为自领");console.log(dismissed.text)}
// 6. 玩家非挟天子者：AI 朝廷之诏进入待奉；奉诏则订免战；逾期以抗诏论
{const {game,e,court}=fresh("ma_teng");const events=[],res=e.issueEdict(game,"cao","appease",{forceId:"ma_teng"},events);assert(res.pending);assert.equal(court.pending.length,1);assert(events.some(ev=>ev.lv===2),"待奉诏令为重要消息");
  const html=CourtUI.render(game,"edicts");assert.match(html,/待奉诏令/);assert.match(html,/data-edict-answer=/);const answer=e.answerEdict(game,court.pending[0].id,true);assert(answer.ok&&answer.accepted);assert(e.worldFriendly(game,"cao","ma_teng"),"玩家奉诏免战");
  const officer=game.data.officers.find(o=>o.force==="ma_teng"&&o.status==="serving"&&o.name!=="马腾");e.issueEdict(game,"cao","summon",{officerId:officer.id});const defiance=court.defiance.ma_teng||0;game.turn=court.pending[0].expiresTurn+1;e.resolveCourtEdicts(game,[]);assert.equal(court.pending.length,0);assert(court.defiance.ma_teng>defiance,"逾期以抗诏论");assert.equal(officer.force,"ma_teng")}
// 7. 上表朝贡：献金入朝廷府库、积名分；请封由 AI 朝廷批复；玩家为朝廷时表章待批
{const {game,e,court}=fresh("liu");const gold=game.resources.gold,cao=game.data.forces.find(f=>f.id==="cao");cao.resources??={gold:0,food:0};const caoGold=cao.resources.gold,legit=court.stances.liu.legitimacy;const res=e.submitTribute(game,"liu",{gold:1000,request:{officerId:ruler(game,"liu").id,office:"zahao"}});
  assert(res.ok,res.error);assert.equal(game.resources.gold,gold-1000);assert.equal(cao.resources.gold,caoGold+1000,"献金入挟天子者府库");assert(court.stances.liu.legitimacy>legit,"朝贡积名分");assert.match(res.text,/准奏|不准/);assert.match(e.submitTribute(game,"liu",{gold:1e9}).error,/不足/)}
{const {game,e,court}=fresh("cao"),biao=game.data.forces.find(f=>f.id==="liu_biao");biao.resources={gold:5000,food:0};const res=e.submitTribute(game,"liu_biao",{gold:500,request:{officerId:ruler(game,"liu_biao").id,office:"zahao"}});assert(res.petition,"玩家为朝廷时表章待批");assert.match(CourtUI.render(game,"edicts"),/待批上表/);
  const ok=e.decidePetition(game,res.petition.id,true);assert(ok.ok,ok.error);assert(court.offices.some(i=>i.forceId==="liu_biao"&&i.office==="zahao"))}
// 8. AI 朝廷：交战中按月安抚侧翼观望诸侯（先授爵）；AI 诸侯会上表
{const {game,e,court}=fresh("liu");game.random=()=>0;for(const f of game.data.forces)f.resources={gold:9000,food:9000};const events=[];e.runCourtAI(game,events);assert(events.some(ev=>/安抚|免战|奉诏/.test(ev.text)),"AI 朝廷安抚侧翼");assert(events.some(ev=>/上表朝贡/.test(ev.text)),"AI 诸侯上表");console.log(events.map(ev=>ev.text).slice(0,4).join("\n"))}
// 9. 存档往返与诏令页界面
{const {game,e,court}=fresh();e.issueEdict(game,"cao","appease",{forceId:"ma_teng"});const save=JSON.parse(JSON.stringify(game.serialize())),restored=new GameState(structuredClone(scenario));restored.applySave(restored.migrateSave(save));assert.deepEqual(restored.court.edicts,court.edicts);
  CourtUI.draft={kind:"grant_office",force:"liu_biao",officer:ruler(game,"liu_biao").id,office:"zahao",variant:"__custom",customVariant:"扬威将军"};const html=CourtUI.render(game,"edicts");assert.match(html,/data-edict-issue(?! disabled)/);assert.match(html,/奉诏可能约 \d+%/);
  CourtUI.draft={kind:"appoint",office:"taishou"};assert.match(CourtUI.render(game,"edicts"),/data-edict-field="seat"/);
  const app=appSource();for(const token of ["[data-edict-issue]","[data-edict-answer]","[data-petition]","[data-tribute]","state.engine.issueEdict("])assert(app.includes(token),token)}
console.log("汉庭 P2 通过：安抚免战 / 强诸侯抗诏 / 册封与员额 / 任免与罢免 / 玩家奉诏抗诏 / 上表请封 / AI 诏令 / 存档与界面");

// 多席官号：真实授任、重名/越级拦截、自定义清理、保存往返及界面载荷。
{const {game,e,court}=fresh();court.offices=court.offices.filter(i=>!["zhengjiangjun","xiaowei"].includes(i.office));court.authority=100;const people=game.data.officers.filter(o=>o.force==="cao"&&o.status==="serving"&&!court.offices.some(i=>i.officerId===o.id));const [a,b]=people;
 const historical=e.issueEdict(game,"cao","grant",{officerId:a.id,office:"zhengjiangjun",variant:"征东将军"});assert(historical.accepted,historical.error);assert.match(historical.text,/征东将军/);assert.match(e.validateEdict(game,"cao","grant",{officerId:b.id,office:"zhengjiangjun",variant:"征东将军"}).error,/已有在任/);
 assert.match(e.validateEdict(game,"cao","grant",{officerId:b.id,office:"zhengjiangjun",variant:"征天将军"}).error,/历史称号/);assert.match(e.validateEdict(game,"cao","grant",{officerId:b.id,office:"zahao",variant:"大将军"}).error,/其他官职/);
 assert.match(e.validateEdict(game,"cao","grant",{officerId:b.id,office:"xiaowei",variant:"<script>"}).error,/汉字/);const custom=e.issueEdict(game,"cao","grant",{officerId:b.id,office:"xiaowei",variant:"  靖边校尉  "});assert(custom.accepted,custom.error);assert.equal(court.offices.find(i=>i.officerId===b.id&&i.office==="xiaowei").variant,"靖边校尉");
 const saved=game.serialize();const restored=fresh().game;restored.applySave(saved);assert(restored.court.offices.some(i=>i.officerId===b.id&&i.variant==="靖边校尉"));
 const draft={kind:"grant_office",office:"xiaowei",officer:b.id,variant:"__custom",customVariant:"靖边校尉"};assert.equal(CourtUI.edictPayload(game,draft).payload.variant,"靖边校尉");CourtUI.draft=draft;assert.match(CourtUI.variantFields(game,"xiaowei"),/先登校尉/);assert.match(CourtUI.variantFields(game,"xiaowei"),/customVariant/);CourtUI.draft={kind:"grant_office"};console.log("多席官号：历史与自定义授任、权限/重名校验、保存往返通过");}
