// 汉庭 P3：讨逆诏、联军攻势（集结与发动日、失约）、迁都、加官进爵至受禅、奉迎天子、衣带诏、称王称帝、AI 朝局操作与长局。
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import {pathToFileURL} from "node:url";
import assert from "node:assert/strict";

globalThis.window=globalThis;globalThis.location={protocol:"http:"};
const root=path.resolve(new URL("..",import.meta.url).pathname);
globalThis.fetch=async url=>{const relative=String(url).replace(/^\//,"");try{const body=fs.readFileSync(path.join(root,relative),"utf8");return {ok:true,status:200,json:async()=>JSON.parse(body)}}catch{return {ok:false,status:404,json:async()=>({})}}};
for(const file of ["js/core/data-loader.js","js/core/game-clock.js","js/core/fiscal-system.js","js/core/rule-engine.js","js/core/game-state.js","js/ui/court-ui.js"])await import(pathToFileURL(path.join(root,file)));
if(typeof CustomEvent==="undefined")globalThis.CustomEvent=class CustomEvent extends Event{constructor(type,options={}){super(type);this.detail=options.detail}};
const sandbox={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,"js/data/offline-data.generated.js"),"utf8"),sandbox);
const loader=new DataLoader(sandbox.window.SANGUO_DATA);await loader.load();const scenario=await loader.loadScenario("200_guandu");
const fresh=(player="cao")=>{const game=new GameState(structuredClone(scenario),{playerForceId:player});return {game,e:game.engine,court:game.court}};

// 1. 讨逆诏：有口实则代价常规；逆贼失奉汉名分、服从归零；各方与其关系下降；挟天子者对其开战
{const {game,e,court}=fresh();court.defiedCount={liu_biao:1};const relation=e.worldRelation(game,"sun","liu_biao"),authority=court.authority,events=[],res=e.denounce(game,"cao","liu_biao",events);assert(res.ok,res.error);
  assert.equal(court.authority,authority-e.crisisRules().denounce_cost,"有口实代价常规");assert.equal(e.courtBand(game,"liu_biao"),"逆贼");assert.equal(e.courtNominal(game,"liu_biao"),"逆贼");assert.equal(court.stances.liu_biao.obedience,0);assert(e.worldRelation(game,"sun","liu_biao")<relation);assert(e.worldWar(game,"cao","liu_biao"));assert(events.some(ev=>ev.lv===2));
  const no=fresh();const a=no.court.authority;no.e.denounce(no.game,"cao","zhang_lu");assert.equal(no.court.authority,a-e.crisisRules().denounce_cost*2,"无口实加倍");assert.match(e.denounce(game,"liu","sun").error,/挟天子者/)}
// 2. 联军攻势：应诏者向集结地调兵，到发动日一齐进攻，未到者失约
{const {game,e,court}=fresh("ma_teng");game.random=()=>0;const rally=game.data.cities.find(c=>c.force==="cao"),events=[],res=e.launchCourtCoalition(game,"cao",{targetId:"yuan",rallyCityId:rally.id,days:30},events);assert(res.ok,res.error);const c=res.coalition;
  assert(c.memberIds.length>1,"有诸侯应诏");assert(court.pending.some(p=>p.kind==="coalition"&&p.forceId==="ma_teng"),"玩家收到应诏邀请");const ans=e.answerEdict(game,court.pending.find(p=>p.kind==="coalition").id,true);assert(ans.ok&&c.memberIds.includes("ma_teng"));
  e.runCourtCoalitions(game,[]);const marching=Object.values(c.armies).map(id=>game.data.armies.find(a=>a.id===id)).filter(Boolean);assert(marching.length,"成员调兵赴集结地");assert(marching.every(a=>a.destination===rally.id||a.city===rally.id));
  game.turn=c.launchTurn;const before=court.defiance.ma_teng||0,launchEvents=[];e.runCourtCoalitions(game,launchEvents);assert(c.launched);assert(launchEvents.some(ev=>/联军于.*发动/.test(ev.text)));assert((court.defiance.ma_teng||0)>before,"玩家未到集结地以失约论");console.log(launchEvents.map(ev=>ev.text).join("；"))}
// 3. 迁都：控制力上升、旧都郡民心降、冷却
{const {game,e,court}=fresh();const target=game.data.cities.find(c=>c.force==="cao"&&c.id!==court.capital),control=court.control,old=e.courtCapitalCity(game);const res=e.moveCapital(game,"cao",target.id);assert(res.ok,res.error);assert.equal(court.capital,target.id);assert(court.control>control);assert.match(e.moveCapital(game,"cao",old.id).error,/迁都未久/)}
// 4. 加官进爵：丞相 → 公 → 王 → 受禅；控制力门槛与冷却；忠汉下降；受禅后汉祚告终
{const {game,e,court}=fresh();court.control=95;court.authority=90;for(const c of game.data.cities.slice(0,60))c.force="cao";const loyalty=court.stances.cao.hanLoyalty;for(const want of ["丞相","公","王","禅位"]){const res=e.promoteController(game,"cao");assert(res.ok,res.error);assert.match(res.text,new RegExp(want));court.promotedTurn=-1e9}
  assert(court.dynasty,"汉祚告终");assert(court.titles.some(t=>t.title==="wang"&&t.fief==="魏"),"剧本指定魏王");assert.equal(court.emperor.name,"曹操");assert(court.stances.cao.hanLoyalty<loyalty);assert.match(e.promoteController(game,"cao").error,/汉祚已终/);
  const low=fresh();low.court.control=40;assert.match(low.e.promoteController(low.game,"cao").error,/控制力须达/)}
// 5. 奉迎天子：控制力强时不可；天子流离时兵临都城即可迎奉
{const {game,e,court}=fresh("liu");assert.match(e.receiveEmperor(game,"liu").error,/控制力尚在/);court.controller=null;court.emperor.status="wandering";assert.match(e.receiveEmperor(game,"liu").error,/兵临/);const capital=e.courtCapitalCity(game),camp=game.data.rules.city_graph[capital.id][0];game.data.armies.push({id:"L",name:"刘军",force:"liu",city:camp,soldiers:3000,units:{infantry:3000},morale:70,stores:{food:0}});
  const res=e.receiveEmperor(game,"liu");assert(res.ok,res.error);assert.equal(court.controller,"liu");assert.equal(game.data.cities.find(c=>c.id===court.capital).force,"liu","天子迎往本方城");assert.equal(e.courtBand(game,"liu"),"直辖")}
// 6. 衣带诏：忠汉不足不可；成则控制力骤降、过低天子出奔；败则交恶
{const {game,e,court}=fresh("liu");game.resources.gold=5000;court.control=40;game.random=()=>0;const res=e.courtConspiracy(game,"liu");assert(res.ok&&res.success,res.error);assert(court.control<=15);assert.equal(court.controller,null,"天子出奔");assert.match(e.courtConspiracy(game,"liu").error||"",/无权臣|一年/);
  const two=fresh("liu_biao");two.game.resources.gold=5000;two.game.random=()=>.99;const rel=two.e.worldRelation(two.game,"liu_biao","cao"),bad=two.e.courtConspiracy(two.game,"liu_biao");assert(bad.ok&&!bad.success,bad.error);assert(two.e.worldRelation(two.game,"liu_biao","cao")<rel,"事泄交恶");
  const low=fresh("yuan");low.game.resources.gold=5000;assert.match(low.e.courtConspiracy(low.game,"yuan").error,/忠汉/)}
// 7. 称王称帝：称王仍奉汉、名分上升；称帝即逆，名义区自立、忠汉诸侯关系大跌、本方人物忠诚降、朝廷可据此讨伐
{const {game,e,court}=fresh("yuan");const legit=court.stances.yuan.legitimacy,king=e.proclaim(game,"yuan","king");assert(king.ok,king.error);assert.equal(e.courtNominal(game,"yuan"),"奉汉");assert(court.stances.yuan.legitimacy>legit);
  const relation=e.worldRelation(game,"liu","yuan"),officer=game.data.officers.find(o=>o.force==="yuan"&&o.status==="serving"&&o.name!=="袁绍"),loyalty=officer.loyalty,emperor=e.proclaim(game,"yuan","emperor");assert(emperor.ok,emperor.error);assert.equal(e.courtNominal(game,"yuan"),"自立");assert.equal(e.courtBand(game,"yuan"),"逆贼");assert(e.worldRelation(game,"liu","yuan")<relation-10,"忠汉的刘备与袁绍关系大跌");assert(officer.loyalty<loyalty);
  game.playerForceId="cao";const res=e.denounce(game,"cao","yuan");assert(res.ok);assert.equal(court.authority>=0,true);const small=fresh("zhang_lu");assert.match(small.e.proclaim(small.game,"zhang_lu","emperor").error,/城/)}
// 8. 界面：挟天子者有讨逆、联军、迁都、晋位；他方有奉迎、衣带诏、称王、称帝
{const {game}=fresh();CourtUI.draft={kind:"coalition"};const html=CourtUI.render(game,"edicts");assert.match(html,/data-crisis-issue/);assert.match(html,/集结地/);CourtUI.draft={kind:"promote"};assert.match(CourtUI.render(game,"edicts"),/下一步：自为丞相|下一步：受封/);
  const other=fresh("liu");CourtUI.draft={kind:"grant_office"};const page=CourtUI.render(other.game,"edicts");for(const kind of ["receive","conspiracy","proclaim_king","proclaim_emperor"])assert(page.includes(`data-crisis="${kind}"`),kind);
  const app=fs.readFileSync(path.join(root,"js/ui/app.js"),"utf8");assert(app.includes("[data-crisis-issue]")&&app.includes("state.engine.courtCrisisAction("))}
// 9. 长局：六剧本各推演两年，朝局操作不崩，天子归属与名分合法
for(const id of ["190_coalition","194_puyang","200_guandu","208_red_cliffs","211_tongguan","219_xiangyang"]){const data=await loader.loadScenario(id),game=new GameState(structuredClone(data),{playerForceId:data.scenario.default_player_force});game.observerMode=true;const texts=[];const log=game.engine.courtLog;game.engine.courtLog=function(ev,text,extra){texts.push(text);return log.call(this,ev,text,extra)};
  for(let i=0;i<730;i++)game.endTurn();const court=game.court;assert(!court.controller||game.data.cities.some(c=>c.force===court.controller),`${id} 挟天子者仍有据点`);for(const stance of Object.values(court.stances))assert(stance.obedience>=0&&stance.obedience<=100&&stance.hanLoyalty>=0);
  const notable=texts.filter(t=>/讨伐|联军|迁都|丞相|九锡|王|禅|奉迎|衣带|称帝|出奔/.test(t));console.log(`${id} 两年：挟天子者 ${court.controller||"无"} · ${notable.slice(0,5).join("｜")||"无大事"}`)}
console.log("汉庭 P3 通过：讨逆 / 联军攻势 / 迁都 / 加官进爵至受禅 / 奉迎 / 衣带诏 / 称王称帝 / 界面 / 长局");
