import assert from "node:assert/strict";
globalThis.window=globalThis;
await import("../js/core/game-clock.js");
await import("../js/core/fiscal-system.js");
await import("../js/core/rule-engine.js");

function fixture(){
  const cities=[{id:"home",force:"a",garrison:1000},{id:"front",force:"b",garrison:1000},{id:"easy",force:"c",garrison:10},{id:"player",force:"p",garrison:1000}].map((c,i)=>({...c,name:c.id,level:1,x:i,y:0,agriculture:30,commerce:30}));
  const data={forces:["a","b","c","p","neutral"].map(id=>({id,name:id,resources:{gold:0,food:0}})),cities,officers:[],armies:[],rules:{city_graph:{home:["front","easy","player"],front:["home"],easy:["home"],player:["home"]},balance:{ai:{war_authorization:{max_primary_enemies:1,max_secondary_enemies:0}}}}};
  const state={playerForceId:"p",turn:1,date:{year:200,month:1,day:1},policies:{dailyClock:{baseTurn:1,legacyTurn:1,originDay:1}},relations:{a:0,b:0,c:0},diplomacy:{wars:[],treaties:[],vassals:{},worldVassals:{},worldRelations:{},worldWars:[{key:"a:b",a:"a",b:"b",startedTurn:1}],worldTreaties:[],coalitions:[]},random:()=>0};
  const engine=new RuleEngine(data);engine.playerForceId="p";
  return {engine,state,data};
}

{
  const {engine:e,state:s,data}=fixture(),plan=e.reviewAIWarPlan(s,"a");
  assert.deepEqual(plan.authorizedForceIds,["b"],"已有主战场优先于防守薄弱的和平邻国");
  assert.equal(e.requestAIWar(s,"a","c",[],"部将觊觎"),false);
  assert.equal(e.worldWar(s,"a","c"),false);
  const old=JSON.stringify(s.diplomacy.warPlans);for(let n=0;n<20;n++)e.aiWarAuthorized(s,"a","b");
  assert.equal(JSON.stringify(s.diplomacy.warPlans),old,"日常查询不反复变更战略计划");
  data.scenario={ai_strategy:{war_authorization:{preferred_rivals:{a:[{forceId:"c",bonus:1000}]}}}};
  s.turn+=31;
  assert.equal(e.reviewAIWarPlan(s,"a").primaryForceId,"c","剧本可以通过配置改变主攻倾向");
  assert.equal(e.requestAIWar(s,"a","c",[],"中央核准"),true);
  assert.equal(e.worldWar(s,"a","c"),true);
}
{
  const {engine:e,state:s,data}=fixture();
  data.rules.balance.ai.war_authorization.max_secondary_enemies=1;
  data.rules.balance.ai.war_authorization.secondary_min_sites=1;
  data.rules.balance.ai.war_authorization.secondary_min_aggression=0;
  assert.equal(e.reviewAIWarPlan(s,"a").authorizedForceIds.length,2,"可配置次线，无固定势力名单");
  const saved=JSON.parse(JSON.stringify(s.diplomacy));s.diplomacy=saved;
  assert.deepEqual(e.reviewAIWarPlan(s,"a").authorizedForceIds,saved.warPlans.a.authorizedForceIds,"战略计划随外交状态保存往返");
}
{
  const {engine:e,state:s,data}=fixture();assert.equal(e.reviewAIWarPlan(s,"a").primaryForceId,"b");
  data.cities[1].force="c";e.invalidateAIWarPlans(s,["a"]);
  assert.equal(e.reviewAIWarPlan(s,"a").primaryForceId,"c","接壤格局易主后提前复核，不必空等一个月");
}
{
  const {engine:e,state:s}=fixture();
  e.setPairTreaty(s,"a","b","truce",3);
  assert(e.worldTruce(s,"a","b"));assert(!e.worldFriendly(s,"a","b"),"停战不变成同盟或借道许可");
  assert.equal(e.requestAIWar(s,"a","b",[],"试图重开"),false);
  assert.equal(e.declareWorldWar(s,"a","b",[],"绕过军团入口"),false);
  s.turn=999;s.date={year:202,month:9,day:30};s.diplomacy.worldTreaties[0].expiresTurn=1100;
  e.resolveWorldDiplomacy(s,[]);
  assert(e.worldTruce(s,"a","b"),"后期决胜规则不能提前撕毁停战");
  s.turn=1101;assert(!e.worldTruce(s,"a","b"),"停战按期限到期");
  e.setPairTreaty(s,"a","p","truce",3);
  assert.equal(e.requestAIWar(s,"a","p",[],"攻击玩家"),false,"AI与玩家的停战同样生效");
  s.diplomacy.vassals.a="p";s.diplomacy.treaties=[];
  assert(e.worldFriendly(s,"p","a"),"玩家附庸不能被当作可宣战对象");
}
{
  const {engine:e,state:s,data}=fixture();
  e.reviewAIWarPlan(s,"a");
  const post={policy:{targetCityId:"easy"}};e.postAdvance(s,"a",post,()=>{});
  assert.equal(post.waitingWar,true);assert(!e.worldWar(s,"a","c"),"旧方面进取目标不能擅自开战");
  const op={targetCityId:"easy",rallyCityId:"home",postIds:[],launchTurn:1,status:"进行"};
  e.runOperation(s,"a",{posts:{}},op,()=>{});assert(!e.worldWar(s,"a","c"),"协同出击也检查中央授权");
  const army={id:"army",name:"军",force:"a",city:"home",soldiers:8000,supply:100,morale:80,route:["easy"],destination:"easy",marchProvisions:true};
  data.armies.push(army);e.clearLeg=()=>{};
  assert.equal(e.enterForeignCity(s,army,data.cities[0],data.cities[2],[]),false);
  assert.equal(army.city,"home");assert.equal(army.route,undefined,"途中易主后不沿旧路线自动开战");
  army.siegeTarget="easy";e.auditSieges(s,[]);
  assert.equal(army.siegeTarget,undefined,"未获授权的旧围城应撤围");
  assert(!e.worldWar(s,"a","c"));
  s.diplomacy.coalitions.push({targetId:"c",memberIds:["a"],expiresTurn:100});
  assert(e.aiWarAuthorized(s,"a","c"),"中央承担的联军承诺允许合法参战");
  e.setPairTreaty(s,"a","c","truce",3);
  assert(!e.aiWarAuthorized(s,"a","c"),"旧联军不能绕过新停战");
}
{
  const {engine:e,state:s,data}=fixture();
  e.setPairTreaty(s,"a","c","truce",3);
  data.armies=[{id:"mover",name:"行军军团",force:"a",city:"home",soldiers:3000,supply:100,morale:80,route:["easy"],destination:"easy",marchProvisions:true},{id:"peaceful",name:"守军",force:"c",city:"easy",soldiers:2000}];
  s.infrastructure={supplyRoutes:[]};let battles=0;
  for(const name of ["advanceFieldBattles","advanceFieldArmies","resolveRoadPursuits","returnSortieGarrisons","resolveImperialEscort","syncAllArmyOfficerLocations"])e[name]=()=>{};
  e.armyDailyMarch=()=>1;e.legInfo=()=>({days:1});e.legDaysFor=()=>1;e.marchDrag=()=>1;e.clearLeg=()=>{};
  e.startFieldBattle=()=>{battles++;return false};
  e.advanceArmies(s,[]);
  assert.equal(battles,0,"行军必须在野战触发前检查停战，不能先打驻军再检查宣战");
  assert.equal(data.armies[0].city,"home");assert.equal(data.armies[1].soldiers,2000);
}
{
  const {engine:e,state:s}=fixture();s.turn=31;s.date.day=31;
  e.resolveWorldDiplomacy(s,[]);assert(e.worldWar(s,"a","b"),"日历制满30日不能错当成旧制十二旬而提前议和");
  s.turn=122;e.resolveWorldDiplomacy(s,[]);assert(e.worldTruce(s,"a","b"),"达到明确天数后仍可正常议和");
}
{
  const {engine:e,state:s,data}=fixture();e.reviewAIWarPlan(s,"a");
  s.diplomacy.worldWars.push({key:"a:c",a:"c",b:"a",startedTurn:1});
  const rear={id:"rear",name:"后方",force:"a",garrison:1000},helper={id:"relief",name:"援军",force:"a",city:"rear",soldiers:5000,supply:100,morale:80};
  data.cities.push(rear);data.armies.push(helper,{id:"invader",force:"c",city:"easy",siegeTarget:"home",soldiers:6000});
  assert(!e.aiWarAuthorized(s,"a","c"),"被第二方进攻不自动更换原主攻对手");
  e.postCities=()=>[data.cities[0],rear];e.idlePostArmies=()=>[helper];e.path=()=>["rear","home"];e.routeDays=()=>1;
  e.postDefend(s,"a",{},()=>{});
  assert.equal(helper.destination,"home","非主攻方向遭袭也可立即驰援，无需新的开战授权");
}

console.log("战争授权通过：主次线配置 / 剧本倾向 / 战略保存 / 方面与协同 / 途中易主 / 旧围城 / 停战先于野战 / 联军例外 / 玩家附庸 / 议和日历 / 非主攻方向自卫");
